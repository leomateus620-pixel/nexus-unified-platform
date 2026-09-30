import assert from "node:assert/strict";
import { mkdir, writeFile } from "node:fs/promises";
import { chromium, expect } from "@playwright/test";
import { evidenceRoot } from "./evidence.mjs";

// Actual presentation components; all external writes remain inside the existing test boundary.
const base = process.env.NEXUS_UI_URL || "http://127.0.0.1:4182";
const output = `${evidenceRoot}/revision-refinement`;
await mkdir(output, { recursive: true });
const browser = await chromium.launch({
  headless: true,
  ...(process.env.NEXUS_UI_CHROMIUM ? { executablePath: process.env.NEXUS_UI_CHROMIUM } : {}),
});
const page = await browser.newPage({ locale: "pt-BR", reducedMotion: "reduce" });
await page.addInitScript(() => {
  if (new URLSearchParams(location.search).get("scenario") === "pending") window.__saveDelay = 5000;
});
await page.route("**/*", (route) =>
  ["127.0.0.1", "fonts.googleapis.com", "fonts.gstatic.com"].includes(
    new URL(route.request().url()).hostname,
  )
    ? route.continue()
    : route.abort(),
);
const report = {
  environment: "Isolated fixtures; no authentication, database or physical-device claim",
  browser: browser.version(),
  widths: [],
  checks: [],
  errors: [],
};
page.on("pageerror", (error) => report.errors.push(error.message));
async function go(screen, scenario = "normal", count = 5) {
  await page.goto(`${base}/?page=${screen}&scenario=${scenario}&count=${count}`, {
    waitUntil: "networkidle",
  });
  await page.locator("h1").waitFor();
  await page.evaluate(() => document.fonts.ready);
}
const pass = (name) => report.checks.push({ name, passed: true });
async function capture(name, fullPage = true) {
  await page.screenshot({ path: `${output}/${name}.png`, fullPage });
}
async function fit() {
  assert.equal(
    await page.evaluate(() => document.documentElement.scrollWidth > innerWidth + 1),
    false,
    "no document overflow",
  );
}
try {
  // The shared workspace-visual matrix covers all eight areas/widths. This file
  // keeps focused interactions, edge cases, permissions and actual print output.

  for (const width of [390, 1366, 1920]) {
    await page.setViewportSize({ width, height: 900 });
    for (const [screen, action] of [
      ["itens-comerciais", "Editar item COMP-001"],
      ["dimensionamento", "Editar sistema 1"],
    ]) {
      await go(screen, "normal", 100);
      const trigger = page.getByRole("button", { name: action, exact: true });
      await trigger.click();
      await expect(page.locator("dialog.nx-editor-inspector")).toBeVisible();
      await fit();
      const cardWidth = await page
        .locator(".nx-object-card")
        .first()
        .evaluate((el) => el.getBoundingClientRect().width);
      assert.ok(cardWidth >= Math.min(239, width - 40));
      await capture(`${screen}-panel-${width}`, false);
      await page.keyboard.press("Escape");
      await expect(trigger).toBeFocused();
    }
  }
  pass("100 loaded items, adaptive grid with inspector open, modal/inline Escape and focus return");

  await page.setViewportSize({ width: 1440, height: 900 });
  await go("dimensionamento", "revision-edge");
  await expect(page.locator(".nx-system-card h3").nth(0)).toContainText("22");
  await expect(page.locator(".nx-system-card h3").nth(1)).toContainText("22");
  await expect(page.locator(".nx-system-card").nth(2)).toContainText("Identificação pendente");
  await capture("systems-duplicate-identities");
  await go("orcamento", "revision-edge");
  await page.locator(".nx-budget-system summary").first().click();
  await expect(page.locator(".nx-budget-system").first()).toContainText("R$ 0,00");
  await expect(page.locator(".nx-budget-system").first()).toContainText("0 m");
  await go("resumo-executivo", "revision-edge");
  await expect(page.locator(".nx-document-paper tbody tr").first()).toContainText("0 m");
  await expect(page.locator(".nx-document-paper tbody tr").nth(2)).toContainText(
    "Sem identificação",
  );
  await expect(page.locator(".nx-document-paper tbody tr").nth(2)).toContainText(
    "Extensão não calculada",
  );
  pass(
    "repeated identity 22 preserved; stored zero remains zero; absent identification/calculation explicitly labeled",
  );

  await go("compras", "revision-edge");
  await expect(page.locator(".nx-planning-row").first()).toContainText(
    "Pendente: definir fornecedor",
  );
  await expect(page.locator(".nx-planning-row").first()).toContainText(
    "Planejamento sem ordem vinculada",
  );
  await capture("purchases-pending");
  await go("producao", "empty");
  await expect(page.getByText("Nenhuma demanda de produção planejada")).toBeVisible();
  await expect(page.locator(".nx-empty")).toContainText("Atualizar demanda");
  assert.equal(await page.locator(".nx-planning-row").count(), 0);
  assert.equal((await page.evaluate(() => window.__nexusCalls)).length, 0);
  await capture("production-empty");
  pass(
    "both purchase warnings retained; production empty state explains existing action and creates no records",
  );

  await go("historico", "empty");
  await expect(page.getByText("Nenhum salvamento consolidado")).toBeVisible();
  await expect(page.locator(".nx-history .nx-empty")).toContainText("checkpoint comercial");
  await expect(page.locator(".nx-history .nx-empty")).toContainText("automaticamente");
  assert.equal(await page.getByRole("button", { name: "Salvar proposta", exact: true }).count(), 0);
  await capture("history-empty");
  pass("empty history distinguishes persisted entries from consolidated commercial checkpoints");

  await go("parametros");
  await page.locator('.nx-parameter-category[data-parameter-group="Condições comerciais"]').click();
  await expect(page.getByLabel("Markup sobre custo composto", { exact: true })).toHaveValue("0.4");
  await expect(page.locator("#param-ajuda-markup")).toContainText("40%");
  assert.equal((await page.evaluate(() => window.__nexusCalls)).length, 0);
  await capture("parameters-commercial-focus");
  await page.getByLabel("Markup sobre custo composto", { exact: true }).fill("0.41");
  await page.waitForFunction(() => window.__nexusCalls.some((c) => c.payload?.parametros));
  assert.equal(
    (await page.evaluate(() => window.__nexusCalls)).find((c) => c.payload?.parametros).payload
      .parametros.markup,
    0.41,
  );
  await page.getByRole("button", { name: "Voltar às categorias" }).click();
  await page
    .locator('.nx-parameter-category[data-parameter-group="Provisões e alíquotas"]')
    .click();
  await expect(
    page.getByLabel("Provisão de imposto na precificação (fração)", { exact: true }),
  ).toHaveValue("0.18");
  pass(
    "parameter fractions unchanged; display helper adds no write; autosave sends 0.41 and focused categories keep values",
  );

  for (const screen of ["itens-comerciais", "dimensionamento", "parametros", "resumo-executivo"]) {
    await go(screen, "readonly");
    assert.equal(
      await page.getByRole("button", { name: "Salvar proposta", exact: true }).count(),
      0,
    );
    assert.equal(await page.getByRole("button", { name: "Emitir proposta" }).count(), 0);
  }
  await go("orcamento", "restricted");
  assert.equal(await page.getByText("Resultado calculado pelo modelo").count(), 0);
  assert.equal(await page.getByText("Total operação · custo").count(), 0);
  await go("resumo-executivo", "restricted");
  assert.equal(await page.getByRole("button", { name: "Ver visão interna" }).count(), 0);
  await go("resumo-executivo", "pending");
  await expect(page.locator(".nx-document-status")).toContainText("Cálculo desatualizado");
  assert.equal(await page.locator(".nx-document-values").count(), 0);
  pass(
    "readonly controls, restricted costs/margin and stale-document amount suppression preserved",
  );

  await go("resumo-executivo");
  await page.emulateMedia({ media: "print" });
  await expect(page.locator(".nx-document-tools")).toBeHidden();
  await expect(page.locator(".nx-proposal-header")).toBeHidden();
  await expect(page.locator(".nx-document-paper")).toBeVisible();
  assert.equal(
    await page.locator("body").evaluate((el) => getComputedStyle(el).backgroundColor),
    "rgb(255, 255, 255)",
  );
  await page.pdf({
    path: `${output}/document-commercial.pdf`,
    format: "A4",
    printBackground: true,
    margin: { top: "14mm", bottom: "14mm", left: "14mm", right: "14mm" },
  });
  await page.emulateMedia({ media: "screen" });
  await page.getByRole("button", { name: "Ver visão interna" }).click();
  await expect(page.getByText("Resultado (interno)", { exact: true })).toBeVisible();
  await page.emulateMedia({ media: "print" });
  await expect(page.locator(".nx-document-tools")).toBeHidden();
  await page.pdf({
    path: `${output}/document-internal.pdf`,
    format: "A4",
    printBackground: true,
    margin: { top: "14mm", bottom: "14mm", left: "14mm", right: "14mm" },
  });
  pass("actual A4 PDFs in commercial/internal modes; print hides tools and workspace header");
  assert.deepEqual(report.errors, []);
} finally {
  await writeFile(`${output}/checks.json`, JSON.stringify(report, null, 2));
  await browser.close();
}
console.log(JSON.stringify(report.checks, null, 2));
