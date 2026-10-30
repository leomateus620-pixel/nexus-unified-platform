// Actual Agenda source and hooks; transport and all displayed records are isolated test fixtures.
// SQL permission, persistence and aggregate correctness are covered by database scenarios.
import { chromium, expect } from "@playwright/test";
import { mkdir, writeFile } from "node:fs/promises";
import { evidenceRoot } from "./evidence.mjs";

const browser = await chromium.launch({
  headless: true,
  ...(process.env.NEXUS_UI_BROWSER_EXECUTABLE || process.env.NEXUS_UI_CHROMIUM
    ? { executablePath: process.env.NEXUS_UI_BROWSER_EXECUTABLE || process.env.NEXUS_UI_CHROMIUM }
    : {}),
});
const page = await browser.newPage({
  locale: "pt-BR",
  timezoneId: "Asia/Tokyo",
  reducedMotion: "reduce",
});
const base = process.env.NEXUS_UI_URL || "http://127.0.0.1:4190";
const root = `${evidenceRoot}/agenda-redesign`;
await mkdir(root, { recursive: true });
const report = {
  method:
    "Actual source with isolated synthetic transport. Browser/device-zone and responsive checks; no claim of connected production persistence or SQL authorization.",
  checks: [],
  layouts: [],
  errors: [],
  consoleErrors: [],
  laboratoryResourceNotes: [],
};
page.on("pageerror", (error) => report.errors.push(error.message));
page.on("console", (message) => {
  if (message.type() === "error") {
    if (message.location().url.endsWith("/favicon.ico"))
      report.laboratoryResourceNotes.push("Isolated UI laboratory has no favicon.ico (404).");
    else report.consoleErrors.push(message.text());
  }
});
async function check(name, work) {
  await work();
  report.checks.push(name);
  console.log(`PASS: ${name}`);
}
async function go(extra = {}) {
  const query = new URLSearchParams({
    page: "agenda-equipe",
    data: "2026-11-10",
    vista: "lista",
    foco: "equipe",
    ...extra,
  });
  await page.goto(`${base}/?${query}`, { waitUntil: "networkidle" });
  await page.getByRole("button", { name: "Dashboard da agenda", exact: true }).waitFor();
  await page.evaluate(() => document.fonts.ready);
}
async function dashboard() {
  await page.getByRole("button", { name: "Dashboard da agenda", exact: true }).click();
  await expect(
    page.getByRole("heading", { name: "Dashboard da agenda", exact: true }),
  ).toBeVisible();
  await expect(page.locator(".agenda-dashboard-context")).toBeVisible();
}
async function filters() {
  await page.getByRole("button", { name: "Filtros da agenda", exact: true }).click();
  return page.getByRole("dialog", { name: "Filtros da agenda", exact: true });
}
async function layout(name, width) {
  await page.setViewportSize({ width, height: width < 768 ? 844 : 1000 });
  await page.evaluate(
    () => new Promise((resolve) => requestAnimationFrame(() => requestAnimationFrame(resolve))),
  );
  const geometry = await page.evaluate(() => ({
    viewport: innerWidth,
    scrollWidth: document.documentElement.scrollWidth,
  }));
  expect(geometry.scrollWidth, `${name}: page overflow at ${width}px`).toBeLessThanOrEqual(
    geometry.viewport,
  );
  report.layouts.push({ name, width, ...geometry });
  if ([390, 1366].includes(width))
    await page.screenshot({
      path: `${root}/${name}-${width}.png`,
      fullPage: !/detalhe|filtros|editor/.test(name),
    });
}

try {
  await go();
  await check("one creation entry and deferred dashboard query", async () => {
    await expect(page.getByRole("button", { name: "Novo evento", exact: true })).toHaveCount(1);
    await expect(page.getByRole("button", { name: "Nova ação", exact: true })).toHaveCount(0);
    await expect(page.getByRole("button", { name: "Preferências", exact: true })).toHaveCount(0);
    await expect(
      page.getByRole("searchbox", { name: "Buscar na agenda", exact: true }),
    ).toHaveCount(0);
    expect(
      await page.evaluate(() =>
        window.__nexusCalls.some((call) => call.name === "obterDashboardAgenda"),
      ),
    ).toBe(false);
    await expect(
      page.getByText("Pessoas, compromissos e ações conectados ao trabalho.", { exact: true }),
    ).toHaveCount(0);
    await expect(
      page.locator(".agenda-page").getByText("Visão geral", { exact: true }),
    ).toHaveCount(0);
  });
  await check("list, filters and Dashboard remain within all six target widths", async () => {
    for (const width of [360, 390, 430, 768, 1366, 1920]) await layout("lista-escura", width);
    await dashboard();
    await expect(page.locator(".agenda-dashboard-context")).toContainText(
      "2 eventos agendados no período",
    );
    for (const width of [360, 390, 430, 768, 1366, 1920]) await layout("dashboard-escura", width);
    await page.getByRole("button", { name: "Ativar modo claro", exact: true }).click();
    await expect(page.locator(".agenda-page")).toHaveAttribute("data-theme", "light");
    for (const width of [390, 1366]) await layout("dashboard-clara", width);
    await page.getByRole("button", { name: "Ativar modo noite", exact: true }).click();
    await expect(page.locator(".agenda-page")).toHaveAttribute("data-theme", "dark");
    await filters();
    for (const width of [360, 390, 430, 768, 1366, 1920]) await layout("filtros", width);
    await page.getByRole("button", { name: "Cancelar", exact: true }).click();
  });
  await check(
    "dashboard uses the complete month and provides five insights with explicit units",
    async () => {
      const requests = await page.evaluate(() =>
        window.__nexusCalls.filter((call) => call.name === "obterDashboardAgenda"),
      );
      expect(requests.at(-1).payload.data.inicio).toBe("2026-11-01");
      expect(requests.at(-1).payload.data.fim).toBe("2026-12-01");
      await expect(page.locator(".agenda-dashboard-summaries > section")).toHaveCount(5);
      for (const title of [
        "Pessoas com mais eventos",
        "Dia com mais eventos",
        "Horário com maior demanda",
        "Categoria com mais eventos",
        "Horas por pessoa na semana",
        "Eventos por dia",
        "Demanda por horário",
        "Por pessoa, por semana",
        "Eventos por categoria",
      ])
        await expect(page.getByRole("heading", { name: title, exact: true })).toBeVisible();
      await expect(page.locator(".agenda-dashboard")).toContainText("Empate entre 3 dias");
      await expect(page.locator(".agenda-dashboard")).toContainText("Empate entre 3 faixas");
      await expect(page.locator(".agenda-dashboard-unit").last()).toHaveText("eventos × dia");
    },
  );
  await check(
    "filter cancel is transactional; apply and clear update real query inputs",
    async () => {
      let panel = await filters();
      await panel.getByRole("searchbox", { name: "Buscar na agenda", exact: true }).fill("Visita");
      await panel.getByRole("button", { name: "Cancelar", exact: true }).click();
      expect(new URL(page.url()).searchParams.get("busca") || "").toBe("");
      await expect(page.locator(".agenda-dashboard-context")).toContainText("2 eventos");
      panel = await filters();
      await panel.getByRole("searchbox", { name: "Buscar na agenda", exact: true }).fill("Reunião");
      await panel.getByRole("button", { name: "Aplicar", exact: true }).click();
      await expect(page.locator(".agenda-dashboard-context")).toContainText("1 evento agendado");
      expect(new URL(page.url()).searchParams.get("busca")).toBe("Reunião");
      panel = await filters();
      await expect(
        panel.getByRole("searchbox", { name: "Buscar na agenda", exact: true }),
      ).toHaveValue("Reunião");
      await panel.getByRole("button", { name: "Limpar", exact: true }).click();
      await panel.getByRole("button", { name: "Aplicar", exact: true }).click();
      await expect(page.locator(".agenda-dashboard-context")).toContainText("2 eventos");
    },
  );
  await check(
    "day and hour values are available without tooltips and drill into the confirmed universe",
    async () => {
      await page.locator(".agenda-dashboard-values").first().locator("summary").click();
      await expect(
        page.getByRole("list", { name: "Eventos por dia", exact: true }).getByRole("button"),
      ).toHaveCount(30);
      await page
        .getByRole("list", { name: "Eventos por dia", exact: true })
        .locator("button:not([disabled])")
        .first()
        .press("Enter");
      expect(new URL(page.url()).searchParams.get("dia")).toBe("2026-11-11");
      expect(new URL(page.url()).searchParams.get("demanda")).toBe("true");
      await expect(page.locator(".agenda-event-card")).toHaveCount(1);
      await expect(page.locator(".agenda-event-card")).toContainText("Reunião de coordenação");
      await page.getByRole("button", { name: "Voltar à Dashboard", exact: true }).click();
      await expect(page.locator(".agenda-dashboard-context")).toContainText("2 eventos");
      await page.locator(".agenda-dashboard-values").nth(1).locator("summary").click();
      await expect(
        page
          .getByRole("list", { name: "Ocupação por faixa horária", exact: true })
          .getByRole("button"),
      ).toHaveCount(24);
      await page
        .getByRole("list", { name: "Ocupação por faixa horária", exact: true })
        .locator("button:not([disabled])")
        .first()
        .click();
      expect(new URL(page.url()).searchParams.get("hora")).toBe("0");
      await expect(page.locator(".agenda-event-card")).toHaveCount(1);
      await expect(page.locator(".agenda-event-card")).toContainText("Coleta noturna");
      await page.getByRole("button", { name: "Voltar à Dashboard", exact: true }).click();
    },
  );
  await check(
    "person drilldown excludes drafts and return restores dashboard filters",
    async () => {
      await page.locator(".agenda-dashboard-people button").first().click();
      expect(new URL(page.url()).searchParams.get("pessoa")).toBe(
        "30000000-0000-4000-8000-000000000001",
      );
      await expect(page.locator(".agenda-event-card")).toHaveCount(2);
      await expect(
        page.locator(".agenda-event-card").filter({ hasText: "Visita de validação" }),
      ).toHaveCount(0);
      await page.getByRole("button", { name: "Voltar à Dashboard", exact: true }).click();
      await expect(page.locator(".agenda-dashboard-context")).toContainText("2 eventos");
    },
  );
  await check(
    "weekly navigation keeps zero-hour people and clips drilldowns to the selected period",
    async () => {
      const weekly = page.locator(".agenda-dashboard-weekly");
      await expect(weekly).toContainText("2h");
      await weekly.getByRole("button", { name: "Próxima semana", exact: true }).click();
      await expect(weekly.locator(".agenda-dashboard-hours-ranking li")).toHaveCount(2);
      await expect(weekly.locator(".agenda-dashboard-hours-ranking b")).toHaveText(["0h", "0h"]);
      await weekly.getByRole("button", { name: "Semana anterior", exact: true }).click();
      await expect(weekly).toContainText("2h");
      await go({ painel: "dashboard", inicio: "2026-11-10", fim: "2026-11-13" });
      await expect(page.locator(".agenda-dashboard-context")).toContainText("2 eventos");
      await expect(page.locator(".agenda-dashboard-weekly")).toContainText(
        "Semana parcialmente coberta",
      );
      await page
        .locator(".agenda-dashboard-summaries > section")
        .nth(4)
        .getByRole("button")
        .click();
      expect(new URL(page.url()).searchParams.get("inicio")).toBe("2026-11-10");
      expect(new URL(page.url()).searchParams.get("fim")).toBe("2026-11-13");
      await expect(page.locator(".agenda-event-card")).toHaveCount(2);
      await page.getByRole("button", { name: "Voltar à Dashboard", exact: true }).click();
      await expect(page.locator(".agenda-dashboard-context")).toContainText("2 eventos");
      expect(new URL(page.url()).searchParams.get("inicio")).toBe("2026-11-10");
    },
  );
  await check(
    "period navigation clears dashboard drilldown bounds and loads the new week",
    async () => {
      await go({ painel: "dashboard", inicio: "2026-11-10", fim: "2026-11-13" });
      await expect(page.locator(".agenda-dashboard-context")).toContainText("2 eventos");
      await page.locator(".agenda-dashboard-people button").first().click();
      await expect(page.locator(".agenda-event-card")).toHaveCount(2);
      await page.getByRole("button", { name: "Próximo período", exact: true }).click();
      const url = new URL(page.url());
      expect(url.searchParams.get("inicio") || "").toBe("");
      expect(url.searchParams.get("fim") || "").toBe("");
      expect(url.searchParams.get("data")).toBe("2026-11-17");
      await expect
        .poll(() =>
          page.evaluate(
            () =>
              window.__nexusCalls.filter((call) => call.name === "listarAgenda").at(-1)?.payload
                .data.inicio,
          ),
        )
        .toBe("2026-11-16");
      expect(
        await page.evaluate(
          () =>
            window.__nexusCalls.filter((call) => call.name === "listarAgenda").at(-1).payload.data
              .fim,
        ),
      ).toBe("2026-11-23");
    },
  );
  await check(
    "team scope survives unscheduled actions, notifications and Dashboard round trips",
    async () => {
      await go();
      await page.getByRole("button", { name: "Sem horário", exact: true }).click();
      expect(new URL(page.url()).searchParams.get("foco")).toBe("pendentes");
      expect(new URL(page.url()).searchParams.get("pendentesEquipe")).toBe("true");
      await expect
        .poll(() =>
          page.evaluate(
            () =>
              window.__nexusCalls.filter((call) => call.name === "listarPendentesAgenda").at(-1)
                ?.payload.data.minhas,
          ),
        )
        .toBe(false);
      await page.getByRole("button", { name: "Notificações da agenda", exact: true }).click();
      expect(new URL(page.url()).searchParams.get("foco")).toBe("notificacoes");
      expect(new URL(page.url()).searchParams.get("pendentesEquipe")).toBe("true");
      await dashboard();
      await expect
        .poll(() =>
          page.evaluate(
            () =>
              window.__nexusCalls.filter((call) => call.name === "obterDashboardAgenda").at(-1)
                ?.payload.data.minha,
          ),
        )
        .toBe(false);
      await page.getByRole("button", { name: "Dashboard da agenda", exact: true }).click();
      expect(new URL(page.url()).searchParams.get("foco")).toBe("notificacoes");
      await page.getByRole("button", { name: "Notificações da agenda", exact: true }).click();
      expect(new URL(page.url()).searchParams.get("foco")).toBe("equipe");
      await expect
        .poll(() =>
          page.evaluate(
            () =>
              window.__nexusCalls.filter((call) => call.name === "listarAgenda").at(-1)?.payload
                .data.minha,
          ),
        )
        .toBe(false);
      await page.getByRole("button", { name: "Sem horário", exact: true }).click();
      await page.getByRole("button", { name: "Sem horário", exact: true }).click();
      expect(new URL(page.url()).searchParams.get("foco")).toBe("equipe");
    },
  );
  await check(
    "detail is a bounded accessible dialog on mobile and desktop with Escape return",
    async () => {
      await go();
      await page.locator(".agenda-event-card .agenda-card-open").first().click();
      const detail = page.getByRole("dialog", { name: "Detalhes da atividade", exact: true });
      await expect(
        detail.getByRole("button", { name: "Editar compromisso", exact: true }),
      ).toBeVisible();
      for (const width of [360, 390, 430, 768, 1366, 1920]) {
        await layout("detalhe", width);
        const rect = await detail.boundingBox();
        expect(rect.y).toBeGreaterThanOrEqual(0);
        expect(rect.y + rect.height).toBeLessThanOrEqual(width < 768 ? 844 : 1000);
      }
      await page.keyboard.press("Escape");
      await expect(detail).toHaveCount(0);
      expect(new URL(page.url()).searchParams.get("evento") || "").toBe("");
      await expect
        .poll(() => page.evaluate(() => document.activeElement !== document.body))
        .toBe(true);
    },
  );
  await check(
    "Agenda appearance persists per user and stays scoped across Dashboard and portals",
    async () => {
      await go();
      await expect(page.locator(".agenda-page")).toHaveAttribute("data-theme", "dark");
      const shellBefore = await page.evaluate(() => ({
        htmlClass: document.documentElement.className,
        htmlTheme: document.documentElement.getAttribute("data-theme"),
        railBackground: getComputedStyle(document.querySelector(".nx-sidebar")).backgroundColor,
      }));
      await page.getByRole("button", { name: "Ativar modo claro", exact: true }).click();
      await expect(page.locator(".agenda-page")).toHaveAttribute("data-theme", "light");
      const storageKey =
        "nexus.agenda.appearance.10000000-0000-4000-8000-000000000001:00000000-0000-4000-8000-000000000001";
      expect(await page.evaluate((key) => localStorage.getItem(key), storageKey)).toBe("light");
      const otherUserKey = storageKey.replace(
        /00000000-0000-4000-8000-000000000001$/,
        "00000000-0000-4000-8000-000000000002",
      );
      await page.evaluate((key) => localStorage.setItem(key, "dark"), otherUserKey);
      await page.reload({ waitUntil: "networkidle" });
      await expect(page.locator(".agenda-page")).toHaveAttribute("data-theme", "light");
      expect(await page.evaluate((key) => localStorage.getItem(key), otherUserKey)).toBe("dark");
      await dashboard();
      await expect(page.locator(".agenda-page")).toHaveAttribute("data-theme", "light");
      await expect(page.locator(".agenda-dashboard-chart")).toHaveCount(2);
      expect(
        await page
          .locator(".agenda-page")
          .evaluate((element) => getComputedStyle(element).colorScheme),
      ).toBe("light");
      for (const width of [390, 1366]) await layout("dashboard-clara", width);
      const panel = await filters();
      await expect(panel).toHaveAttribute("data-theme", "light");
      for (const width of [390, 1366]) await layout("filtros-claros", width);
      await panel.getByRole("button", { name: "Cancelar", exact: true }).click();
      await page.getByRole("button", { name: "Dashboard da agenda", exact: true }).click();
      await expect(page.locator(".agenda-page")).toHaveAttribute("data-theme", "light");
      for (const width of [390, 1366]) await layout("lista-clara", width);
      await page.getByRole("button", { name: "Novo evento", exact: true }).click();
      const editor = page.getByRole("dialog", { name: "Novo evento", exact: true });
      await expect(editor.locator(".agenda-composer")).toHaveAttribute(
        "data-agenda-theme",
        "light",
      );
      expect(await editor.evaluate((element) => getComputedStyle(element).colorScheme)).toBe(
        "light",
      );
      await editor.getByRole("button", { name: /^(Adicionar pessoa|Selecionar pessoas)$/ }).click();
      await expect(page.locator(".agenda-picker-popup")).toHaveAttribute("data-theme", "light");
      await page.keyboard.press("Escape");
      for (const width of [390, 1366]) await layout("editor-claro", width);
      await page.keyboard.press("Escape");
      await expect(editor).toHaveCount(0);
      await page.locator(".agenda-event-card .agenda-card-open").first().click();
      const detail = page.getByRole("dialog", { name: "Detalhes da atividade", exact: true });
      await expect(detail).toHaveAttribute("data-theme", "light");
      await expect(
        detail.getByRole("button", { name: "Editar compromisso", exact: true }),
      ).toBeVisible();
      for (const width of [390, 1366]) await layout("detalhe-claro", width);
      await page.keyboard.press("Escape");
      await expect(detail).toHaveCount(0);
      const shellAfter = await page.evaluate(() => ({
        htmlClass: document.documentElement.className,
        htmlTheme: document.documentElement.getAttribute("data-theme"),
        railBackground: getComputedStyle(document.querySelector(".nx-sidebar")).backgroundColor,
      }));
      expect(shellAfter).toEqual(shellBefore);
      await page.getByRole("button", { name: "Ativar modo noite", exact: true }).click();
      await expect(page.locator(".agenda-page")).toHaveAttribute("data-theme", "dark");
      await page.reload({ waitUntil: "networkidle" });
      await expect(page.locator(".agenda-page")).toHaveAttribute("data-theme", "dark");
      expect(await page.evaluate((key) => localStorage.getItem(key), storageKey)).toBe("dark");
    },
  );
  await check(
    "empty month has no zero winners; failed query is recoverable and never shown as zero",
    async () => {
      await go({ painel: "dashboard", scenario: "empty" });
      await expect(page.locator(".agenda-dashboard-context")).toContainText("0 eventos");
      await expect(page.locator(".agenda-dashboard-peak")).toHaveCount(0);
      await expect(page.locator(".agenda-dashboard")).toContainText("Sem eventos neste período");
      await go({ painel: "dashboard" });
      await page.evaluate(() => {
        window.__agendaNetwork = true;
      });
      await page.getByRole("button", { name: "Próximo período", exact: true }).click();
      await expect(page.getByRole("alert").filter({ hasText: "Falha de rede" })).toBeVisible();
      await expect(page.locator(".agenda-dashboard-context")).toHaveCount(0);
      await page.evaluate(() => {
        window.__agendaNetwork = false;
      });
      await page.getByRole("button", { name: "Tentar novamente", exact: true }).click();
      await expect(page.locator(".agenda-dashboard-context")).toContainText("0 eventos");
    },
  );
  expect(report.errors).toEqual([]);
  expect(report.consoleErrors).toEqual([]);
} catch (error) {
  report.failure = error.message;
  await page.screenshot({ path: `${root}/failure.png`, fullPage: true });
  throw error;
} finally {
  await writeFile(`${root}/results.json`, JSON.stringify(report, null, 2));
  await browser.close();
}
