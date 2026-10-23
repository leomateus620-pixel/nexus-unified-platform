// Product behavior checks using actual UI components and isolated network fixtures.
// This test does not certify Supabase authentication, RLS or production persistence.
import { chromium, expect } from "@playwright/test";
import { mkdir, writeFile } from "node:fs/promises";
import { evidenceRoot } from "./evidence.mjs";

const browser = await chromium.launch({ headless: true });
const page = await browser.newPage({ locale: "pt-BR", reducedMotion: "reduce" });
const base = process.env.NEXUS_UI_URL || "http://127.0.0.1:4182";
const root = `${evidenceRoot}/qualidade-operacional`;
await mkdir(root, { recursive: true });
const report = {
  method: "Actual source components with test-only network fixtures; not connected-backend E2E",
  checks: [],
  layouts: [],
  errors: [],
};
page.on("pageerror", (e) => report.errors.push(e.message));
async function go(screen, extra = "") {
  await page.goto(`${base}/?page=${screen}${extra}`, { waitUntil: "networkidle" });
  await page.getByRole("heading", { level: 1 }).waitFor();
  await page.evaluate(() => document.fonts.ready);
}
async function check(name, work) {
  await work();
  report.checks.push({ name, pass: true });
}
try {
  for (const width of [360, 390, 768, 1024, 1366, 1440]) {
    await page.setViewportSize({ width, height: width < 768 ? 844 : 900 });
    for (const [screen, extra] of [
      ["equipe", ""],
      ["clientes", ""],
      ["seguranca", ""],
      ["projetos-engenharia", "&projeto=40000000-0000-4000-8000-000000000001"],
      ["mapas-library", ""],
      ["configuracoes", ""],
    ]) {
      await go(screen, extra);
      const metrics = await page.evaluate(() => ({
        width: innerWidth,
        height: innerHeight,
        scrollWidth: document.documentElement.scrollWidth,
        overflow: document.documentElement.scrollWidth > innerWidth,
      }));
      report.layouts.push({ screen, ...metrics });
      expect(metrics.overflow, `${screen} at ${width}px`).toBe(false);
      if ([390, 1366].includes(width))
        await page.screenshot({ path: `${root}/${screen}-${width}.png` });
    }
  }
  await check(
    "navigation frame retains palette and width across preserved workspaces",
    async () => {
      await page.setViewportSize({ width: 1366, height: 900 });
      const frames = [];
      for (const screen of ["equipe", "dimensionamento", "produtos", "oc"]) {
        await go(screen);
        frames.push(
          await page.evaluate(() => {
            const sidebar = document.querySelector(".nx-sidebar"),
              bar = document.querySelector(".nx-topbar");
            const sideStyle = getComputedStyle(sidebar),
              barStyle = getComputedStyle(bar);
            return {
              sidebarWidth: sidebar.getBoundingClientRect().width,
              sidebarBackground: sideStyle.backgroundColor,
              headerBackground: barStyle.backgroundColor,
              headerHeight: bar.getBoundingClientRect().height,
            };
          }),
        );
      }
      report.frameParity = frames;
      for (const frame of frames) expect(frame).toEqual(frames[0]);
      await page.screenshot({ path: `${root}/comercial-frame-1366.png` });
    },
  );
  await page.setViewportSize({ width: 390, height: 844 });
  await go("equipe");
  await check(
    "validation focuses the invalid field, dialog fits and Escape restores trigger",
    async () => {
      const trigger = page.getByRole("button", { name: "Nova pessoa", exact: true });
      await trigger.click();
      const dialog = page.getByRole("dialog");
      await expect(dialog).toBeVisible();
      await expect(page.getByRole("textbox", { name: "Nome completo", exact: true })).toBeFocused();
      await page.getByRole("button", { name: "Salvar pessoa", exact: true }).click();
      await expect(
        page.getByRole("textbox", { name: "Nome completo", exact: true }),
      ).toHaveAttribute("aria-invalid", "true");
      await page.screenshot({ path: `${root}/pessoa-validacao-390.png` });
      await page.keyboard.press("Escape");
      await expect(dialog).not.toBeVisible();
      await expect(trigger).toBeFocused();
    },
  );
  await check("dirty dialog preserves input until explicit discard", async () => {
    await page.getByRole("button", { name: "Nova pessoa", exact: true }).click();
    await page
      .getByRole("textbox", { name: "Nome completo", exact: true })
      .fill("Pessoa de teste de recuperação");
    await page.keyboard.press("Escape");
    await expect(
      page.getByRole("button", { name: "Continuar editando", exact: true }),
    ).toBeVisible();
    await page.getByRole("button", { name: "Continuar editando", exact: true }).click();
    await expect(page.getByRole("textbox", { name: "Nome completo", exact: true })).toHaveValue(
      "Pessoa de teste de recuperação",
    );
    await page.getByRole("button", { name: "Fechar formulário", exact: true }).click();
    await page.getByRole("button", { name: "Descartar alterações", exact: true }).click();
    await expect(page.getByRole("dialog")).not.toBeVisible();
  });
  await check("write failure preserves the draft and shows actionable feedback", async () => {
    await go("equipe", "&scenario=write-error");
    await page.getByRole("button", { name: "Nova pessoa", exact: true }).click();
    await page
      .getByRole("textbox", { name: "Nome completo", exact: true })
      .fill("Pessoa de teste de falha");
    await page.getByRole("button", { name: "Salvar pessoa", exact: true }).click();
    await expect(page.getByRole("alert").filter({ hasText: /Falha de rede/ })).toBeVisible();
    await expect(page.getByRole("textbox", { name: "Nome completo", exact: true })).toHaveValue(
      "Pessoa de teste de falha",
    );
    await page.getByRole("button", { name: "Fechar formulário", exact: true }).click();
    await page.getByRole("button", { name: "Descartar alterações", exact: true }).click();
  });
  await check(
    "mobile navigation search preserves available modules, excludes incomplete ones and restores focus",
    async () => {
      await go("equipe");
      const trigger = page.getByRole("button", { name: "Abrir menu", exact: true });
      await trigger.click();
      await page
        .getByRole("searchbox", { name: "Buscar funcionalidade", exact: true })
        .fill("engenharia");
      await expect(
        page.locator(".nx-mobile-menu").getByRole("link", { name: "Engenharia", exact: true }),
      ).toBeVisible();
      await expect(
        page.locator(".nx-mobile-menu").getByRole("link", { name: "Clientes", exact: true }),
      ).toHaveCount(0);
      await page.getByRole("searchbox", { name: "Buscar funcionalidade", exact: true }).fill("");
      const operationGroup = page
        .locator(".nx-mobile-menu")
        .getByRole("button", { name: "Operação", exact: true });
      await expect(operationGroup).toBeVisible();
      if ((await operationGroup.getAttribute("aria-expanded")) !== "true")
        await operationGroup.click();
      await expect(operationGroup).toHaveAttribute("aria-expanded", "true");
      await expect(page.locator('.nx-mobile-menu a[href="/execucao"]')).toBeVisible();
      for (const href of ["/inspecoes", "/documentacao", "/seguranca", "/projetos-engenharia"]) {
        await expect(page.locator(`.nx-mobile-menu a[href="${href}"]`)).toHaveCount(0);
      }
      await expect(
        page.locator(".nx-mobile-menu").getByRole("link", { name: "Agenda Equipe", exact: true }),
      ).toBeVisible();
      await page.keyboard.press("Escape");
      await expect(trigger).toBeFocused();
    },
  );
  await check("empty and failed queries present different recoverable states", async () => {
    await go("equipe", "&scenario=empty");
    await expect(page.getByText("Nenhuma pessoa neste recorte", { exact: true })).toBeVisible();
    await go("equipe", "&scenario=error");
    await expect(
      page.getByRole("button", { name: "Tentar novamente", exact: true }).first(),
    ).toBeVisible();
    await expect(page.getByText("Nenhuma pessoa neste recorte", { exact: true })).toHaveCount(0);
  });
  await check("library search survives reload and exposes a clear viewer action", async () => {
    await go("mapas-library");
    await page
      .getByRole("searchbox", { name: "Buscar visualização", exact: true })
      .fill("Trevisan");
    await expect(
      page.getByRole("link", { name: "Abrir visualização: Moega 3 e coberturas", exact: true }),
    ).toBeVisible();
    await expect(
      page.getByRole("link", {
        name: "Abrir visualização: Unidade industrial 3 Tentos",
        exact: true,
      }),
    ).not.toBeVisible();
    await page.reload({ waitUntil: "networkidle" });
    await expect(
      page.getByRole("searchbox", { name: "Buscar visualização", exact: true }),
    ).toHaveValue("Trevisan");
  });
  await check("short viewport and 200 percent text scale keep the person form usable", async () => {
    await page.setViewportSize({ width: 390, height: 480 });
    await go("equipe");
    await page.evaluate(() => {
      document.documentElement.style.fontSize = "200%";
    });
    await page.getByRole("button", { name: "Nova pessoa", exact: true }).click();
    const bounds = await page.getByRole("dialog").boundingBox();
    expect(bounds.x).toBeGreaterThanOrEqual(0);
    expect(bounds.y).toBeGreaterThanOrEqual(0);
    expect(bounds.x + bounds.width).toBeLessThanOrEqual(391);
    expect(bounds.y + bounds.height).toBeLessThanOrEqual(481);
    await page.getByRole("button", { name: "Salvar pessoa", exact: true }).scrollIntoViewIfNeeded();
    await expect(page.getByRole("button", { name: "Salvar pessoa", exact: true })).toBeInViewport();
    await page.screenshot({ path: `${root}/pessoa-texto-200-altura-480.png` });
    await page.keyboard.press("Escape");
    await page.evaluate(() => {
      document.documentElement.style.fontSize = "";
    });
    await page.setViewportSize({ width: 390, height: 844 });
  });
  await check("PE failure keeps version content and provides feedback next to Save", async () => {
    await go(
      "projetos-engenharia",
      "&projeto=40000000-0000-4000-8000-000000000001&scenario=write-error",
    );
    await page
      .getByRole("textbox", { name: "Descrição das mudanças *", exact: true })
      .fill("Texto local preservado após falha");
    await page.getByRole("button", { name: "Salvar rascunho", exact: true }).click();
    await expect(
      page.locator("fieldset").getByText(/O servidor não confirmou o salvamento/),
    ).toBeVisible();
    await expect(
      page.getByRole("textbox", { name: "Descrição das mudanças *", exact: true }),
    ).toHaveValue("Texto local preservado após falha");
    await page.screenshot({ path: `${root}/pe-erro-recuperavel-390.png` });
  });
  // Leave dirty test-only PE through its explicit discard confirmation.
  page.on("dialog", (dialog) => dialog.accept());
  await page.getByRole("button", { name: "Voltar ao acervo", exact: true }).click();
  await go("equipe");
  report.contrast = await page.evaluate(() => {
    const scope = document.querySelector(".nexus-operational"),
      style = getComputedStyle(scope);
    const canvas = document.createElement("canvas");
    canvas.width = canvas.height = 1;
    const ctx = canvas.getContext("2d", { willReadFrequently: true });
    const rgb = (token) => {
      let value = style.getPropertyValue(token).trim();
      while (value.startsWith("var(")) value = style.getPropertyValue(value.slice(4, -1)).trim();
      ctx.fillStyle = value;
      ctx.fillRect(0, 0, 1, 1);
      return [...ctx.getImageData(0, 0, 1, 1).data].slice(0, 3);
    };
    const lum = (a) =>
      a
        .map((v) => v / 255)
        .map((v) => (v <= 0.04045 ? v / 12.92 : ((v + 0.055) / 1.055) ** 2.4))
        .reduce((s, v, i) => s + v * [0.2126, 0.7152, 0.0722][i], 0);
    return [
      ["--foreground", "--background", 4.5],
      ["--muted-foreground", "--card", 4.5],
      ["--primary-foreground", "--primary", 4.5],
      ["--primary", "--card", 4.5],
      ["--destructive", "--nx-error-surface", 4.5],
      ["--ring", "--background", 3],
      ["--input", "--card", 3],
    ].map(([fg, bg, min]) => {
      const a = lum(rgb(fg)),
        b = lum(rgb(bg)),
        ratio = (Math.max(a, b) + 0.05) / (Math.min(a, b) + 0.05);
      return { fg, bg, min, ratio, pass: ratio >= min };
    });
  });
  expect(report.contrast.every((x) => x.pass)).toBe(true);
  expect(report.errors).toEqual([]);
  console.log(
    JSON.stringify({
      layouts: report.layouts.length,
      checks: report.checks.length,
      contrastPairs: report.contrast.length,
      errors: report.errors,
    }),
  );
} catch (e) {
  report.failure = e.message;
  throw e;
} finally {
  await writeFile(`${root}/results.json`, JSON.stringify(report, null, 2));
  await browser.close();
}
