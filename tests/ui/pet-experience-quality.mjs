// Real PET components, isolated presentation fixtures. Does not prove SQL persistence,
// authorization, provider validation or a certified operational journey.
import { chromium, expect } from "@playwright/test";
import { mkdir, writeFile } from "node:fs/promises";
const root = process.env.NEXUS_PET_EVIDENCE || "/tmp/nexus-pet-experience-stateqa";
const base = process.env.NEXUS_PET_PRESENTATION_URL || "http://127.0.0.1:4194";
await mkdir(root, { recursive: true });
const browser = await chromium.launch({
  headless: true,
  ...(process.env.NEXUS_UI_BROWSER_EXECUTABLE
    ? { executablePath: process.env.NEXUS_UI_BROWSER_EXECUTABLE }
    : {}),
});
const page = await browser.newPage({
  locale: "pt-BR",
  timezoneId: "Asia/Tokyo",
  reducedMotion: "reduce",
});
const report = {
  method:
    "Actual PetFicha/components and scoped appearance; synthetic records, test-only transport. No SQL persistence or certified issuance is claimed.",
  checks: [],
  layouts: [],
  errors: [],
};
page.on("pageerror", (error) => report.errors.push(error.message));
await page.addInitScript(() => {
  const theme = new URLSearchParams(location.search).get("theme") || "dark";
  localStorage.setItem(
    "nexus.pet.appearance.a0300000-0000-4000-8000-000000000001:a0300000-0000-4000-8000-000000000002",
    theme,
  );
});
async function go(state, theme = "dark", extra = "") {
  await page.goto(`${base}/experience.html?state=${state}&theme=${theme}${extra}`, {
    waitUntil: "networkidle",
  });
  await page.locator(".pet-workspace").waitFor();
  await page.evaluate(() => document.fonts.ready);
}
async function check(name, fn) {
  await fn();
  report.checks.push(name);
  console.log(`PASS ${name}`);
}
async function layout(name, width) {
  if (!name.includes("modal")) await page.evaluate(() => scrollTo(0, 0));
  const result = await page.evaluate(() => ({
    viewport: innerWidth,
    scrollWidth: document.documentElement.scrollWidth,
    fonts:
      document.fonts.check('16px "Nexus PET Saira"') &&
      document.fonts.check('16px "Nexus PET Barlow"'),
    smallInputs: [
      ...document.querySelectorAll(
        "[data-pet-theme] input, [data-pet-theme] select, [data-pet-theme] textarea",
      ),
    ]
      .filter(
        (element) =>
          element.getClientRects().length && parseFloat(getComputedStyle(element).fontSize) < 16,
      )
      .map((element) => element.outerHTML.slice(0, 130)),
  }));
  report.layouts.push({ name, width, ...result });
  expect(result.scrollWidth, `${name} overflow`).toBeLessThanOrEqual(result.viewport);
  expect(result.smallInputs, `${name} field font`).toEqual([]);
  expect(result.fonts, `${name} local typography`).toBe(true);
  await page.screenshot({
    path: `${root}/${name}-${width}.png`,
    fullPage: !name.includes("modal"),
  });
}
try {
  await check("state opening and both appearances fit six responsive widths", async () => {
    for (const state of [
      "emitted",
      "expired",
      "interrupted",
      "closing-preparation",
      "closing",
      "closed",
      "cancelled",
      "readonly",
    ])
      for (const theme of ["dark", "light"])
        for (const width of [360, 390, 430, 768, 1366, 1920]) {
          await page.setViewportSize({ width, height: width < 768 ? 844 : 1000 });
          await go(state, theme);
          const phase = ["closing-preparation", "closing"].includes(state)
            ? "Encerrar"
            : ["closed", "cancelled"].includes(state)
              ? "Consultar"
              : "Operar";
          await expect(page.locator('.pet-phases [aria-current="step"]')).toContainText(phase);
          await expect(page.locator(".pet-workspace")).toHaveAttribute("data-pet-theme", theme);
          await layout(`${state}-${theme}`, width);
        }
  });
  await page.setViewportSize({ width: 390, height: 844 });
  await check("exit remains available after expiry and interruption with no provider", async () => {
    for (const state of ["expired", "interrupted"]) {
      await go(state);
      await expect(
        page.getByRole("button", { name: "Registrar saída agora", exact: true }),
      ).toBeEnabled();
      await page.getByText("Trabalhadores sem presença aberta", { exact: false }).click();
      await expect(
        page.getByRole("button", { name: "Registrar entrada", exact: true }),
      ).toBeDisabled();
    }
    await go("readonly");
    await expect(
      page.getByRole("button", { name: "Registrar saída agora", exact: true }),
    ).toBeDisabled();
  });
  await check("persisted closing snapshot is hydrated without creating a command", async () => {
    await go("closing");
    await expect(
      page.getByLabel("Condição final do espaço e término do trabalho", { exact: true }),
    ).toHaveValue("Reservatório deixado isolado, acesso sinalizado e ferramentas retiradas.");
    await expect(
      page.getByLabel("Condição final do espaço e término do trabalho", { exact: true }),
    ).toHaveAttribute("readonly", "");
    expect(await page.evaluate(() => window.__petCommands.length)).toBe(0);
    await expect(
      page.getByRole("button", { name: "Concluir encerramento documental", exact: true }),
    ).toBeDisabled();
    await expect(
      page.getByText("Integração não configurada", { exact: false }).last(),
    ).toBeVisible();
  });
  await check("lost exit response retries the same factual time and version", async () => {
    await go("expired", "dark", "&failure=1");
    await page.getByRole("button", { name: "Registrar saída agora", exact: true }).click();
    await expect(page.getByRole("alert").first()).toContainText("Falha de rede");
    await page.getByRole("button", { name: "Registrar saída agora", exact: true }).click();
    const commands = await page.evaluate(() => window.__petCommands);
    expect(commands).toHaveLength(2);
    expect(commands[0]).toEqual(commands[1]);
  });
  await check("closing failure preserves entered condition and verification", async () => {
    await go("closing-preparation", "light", "&failure=1");
    await page
      .getByLabel("Condição final do espaço e término do trabalho", { exact: true })
      .fill("Acesso sinalizado e ferramentas retiradas.");
    await page
      .getByLabel("Justificativa e observações", { exact: true })
      .fill("Inspeção encerrada após conferência.");
    await page
      .getByLabel("Conferência de presença e condição final realizada.", { exact: true })
      .check();
    await page.getByRole("button", { name: "Registrar término e pendências", exact: true }).click();
    await expect(
      page.getByLabel("Condição final do espaço e término do trabalho", { exact: true }),
    ).toHaveValue("Acesso sinalizado e ferramentas retiradas.");
    await expect(
      page.getByLabel("Conferência de presença e condição final realizada.", { exact: true }),
    ).toBeChecked();
    expect(await page.evaluate(() => window.__petCommands[0].comando)).toBe("encerrar");
  });
  await check("atmospheric modal follows approved agents and inherits both themes", async () => {
    for (const theme of ["dark", "light"]) {
      await go("emitted", theme);
      await page.getByRole("button", { name: "Registrar avaliação", exact: true }).click();
      const dialog = page.getByRole("dialog", {
        name: "Registrar avaliação atmosférica",
        exact: true,
      });
      await expect(dialog.locator("[data-pet-theme]").first()).toHaveAttribute(
        "data-pet-theme",
        theme,
      );
      await expect(dialog.getByRole("textbox", { name: "CO2 em %vol", exact: true })).toBeVisible();
      await expect(
        dialog.getByRole("textbox", { name: "Benzeno em ppm", exact: true }),
      ).toBeVisible();
      await expect(dialog.getByRole("textbox", { name: /Oxigênio|Inflamáveis|H₂S/ })).toHaveCount(
        0,
      );
      await layout(`atmosphere-modal-${theme}`, 390);
      await dialog.getByRole("button", { name: "Responsável pela avaliação", exact: true }).click();
      await expect(page.locator(".pet-picker-popup")).toHaveAttribute("data-pet-theme", theme);
      await page
        .getByRole("combobox", { name: "Buscar responsável pela avaliação", exact: true })
        .fill("Helena");
      await page
        .getByRole("combobox", { name: "Buscar responsável pela avaliação", exact: true })
        .press("Enter");
      await expect(
        dialog.getByRole("button", { name: "Responsável pela avaliação", exact: true }),
      ).toContainText("Helena Silva");
      await dialog.getByLabel("Momento da avaliação", { exact: true }).fill("2026-10-30T09:20");
      await dialog
        .getByLabel("Instrumento / detector", { exact: true })
        .fill("Detector identificado");
      await dialog.getByLabel("Número de série", { exact: true }).fill("DEMO-02");
      await dialog
        .getByLabel("Verificação / calibração aplicável", { exact: true })
        .fill("Verificação registrada.");
      await dialog.getByRole("textbox", { name: "CO2 em %vol", exact: true }).fill("0,04");
      await dialog.getByRole("textbox", { name: "Benzeno em ppm", exact: true }).fill("0");
      await dialog
        .getByRole("textbox", { name: "CO2 em %vol", exact: true })
        .scrollIntoViewIfNeeded();
      await layout(`atmosphere-readings-modal-${theme}`, 390);
      await dialog.getByRole("button", { name: "Registrar avaliação", exact: true }).click();
      const readings = await page.evaluate(() => window.__petCommands[0].dados.leituras);
      expect(readings).toEqual([
        { agente: "CO2", unidade: "%vol", valor: 0.04, origem: "leitura_direta" },
        { agente: "Benzeno", unidade: "ppm", valor: 0, origem: "leitura_direta" },
      ]);
    }
  });
  await check("completed and cancelled consultation do not expose operation controls", async () => {
    for (const state of ["closed", "cancelled"]) {
      await go(state);
      await expect(
        page.getByRole("button", { name: "Registrar saída agora", exact: true }),
      ).toHaveCount(0);
      await expect(
        page.getByRole("button", { name: "Registrar entrada", exact: true }),
      ).toHaveCount(0);
    }
    await expect(
      page.getByText("Preparação cancelada. Esta PET não foi emitida para execução.", {
        exact: true,
      }),
    ).toBeVisible();
  });
  expect(report.errors).toEqual([]);
} finally {
  await writeFile(`${root}/results.json`, JSON.stringify(report, null, 2));
  await browser.close();
}
console.log(
  JSON.stringify({
    checks: report.checks.length,
    layouts: report.layouts.length,
    errors: report.errors,
    root,
  }),
);
