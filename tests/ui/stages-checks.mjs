import assert from "node:assert/strict";
import { mkdir, writeFile } from "node:fs/promises";
import { chromium } from "@playwright/test";
import { evidenceRoot } from "./evidence.mjs";

// Run only against the isolated fixture entry point; never against deployed application data.
const base = process.env.NEXUS_UI_URL || "http://127.0.0.1:4182";
const output = `${evidenceRoot}/catalog-stages`;
await mkdir(output, { recursive: true });
const browser = await chromium.launch({
  headless: true,
  ...(process.env.NEXUS_UI_CHROMIUM ? { executablePath: process.env.NEXUS_UI_CHROMIUM } : {}),
});
const context = await browser.newContext({
  viewport: { width: 1366, height: 768 },
  locale: "pt-BR",
  reducedMotion: "reduce",
});
await context.route("**/*", async (route) => {
  const { hostname } = new URL(route.request().url());
  if (["127.0.0.1", "fonts.googleapis.com", "fonts.gstatic.com"].includes(hostname))
    await route.continue();
  else await route.abort();
});
const page = await context.newPage();
const results = [];
const errors = [];
page.on("pageerror", (error) => errors.push(error.message));
async function go(screen, scenario = "normal") {
  await page.goto(`${base}/?page=${screen}&scenario=${scenario}&count=17`, {
    waitUntil: "networkidle",
  });
  await page.locator("h1").waitFor();
  await page.evaluate(() => document.fonts.ready);
}
async function calls() {
  return page.evaluate(() => window.__nexusCalls);
}
try {
  for (const [screen, action, label, type] of [
    ["oc", "Registrar recebimento", "Quantidade recebida", "recebimento"],
    ["op", "Apontar produção", "Quantidade produzida", "apontamento"],
  ]) {
    await go(screen, "issued");
    const trigger = page.getByRole("button", { name: action }).first();
    await trigger.click();
    await page.getByLabel(label).fill("3,5");
    await page.keyboard.press("Escape");
    assert.equal((await calls()).length, 0, `${screen}: cancel must not write`);
    assert.equal(
      await trigger.evaluate((element) => element === document.activeElement),
      true,
      `${screen}: focus returns to trigger`,
    );
    await trigger.click();
    await page.getByRole("button", { name: "Confirmar", exact: true }).click();
    assert.equal((await calls()).length, 0, `${screen}: empty remains a no-op`);
    await trigger.click();
    await page.getByLabel(label).fill("2,5");
    await page.screenshot({ path: `${output}/${screen}-dialog.png` });
    await page.getByRole("button", { name: "Confirmar", exact: true }).click();
    await page.waitForFunction(() => window.__nexusCalls.length > 0);
    const saved = await calls();
    assert.equal(saved.length, 1);
    assert.equal(saved[0].name, "registrarMovimento");
    assert.deepEqual(
      { ...saved[0].payload.data, chave: undefined },
      { tipo: type, item_id: "order-item-0", quantidade: 2.5, chave: undefined },
    );
    assert.match(saved[0].payload.data.chave, /^[a-f0-9-]{36}$/);
    results.push({
      screen,
      checks:
        "cancel/empty perform no write; focus returns; decimal input preserves movement type/item/quantity and idempotency UUID",
      passed: true,
    });
  }
  await go("historico");
  const revisionTrigger = page.getByRole("button", {
    name: "Criar nova revisão a partir da corrente",
  });
  await revisionTrigger.click();
  await page.getByLabel("Motivo da nova revisão").fill("ab");
  await page.getByRole("button", { name: "Confirmar", exact: true }).click();
  assert.equal((await calls()).length, 0);
  await revisionTrigger.click();
  await page.getByLabel("Motivo da nova revisão").fill("  Revisão de escopo  ");
  await page.getByRole("button", { name: "Confirmar", exact: true }).click();
  await page.waitForFunction(() => window.__nexusCalls.length > 0);
  assert.deepEqual((await calls())[0], {
    name: "novaRevisao",
    payload: { data: { proposta_id: "proposal-fixture", motivo: "Revisão de escopo" } },
  });
  results.push({
    screen: "historico",
    checks: "short reason remains no-op; valid reason trimmed into unchanged payload",
    passed: true,
  });

  await go("orcamento", "pending");
  assert.equal(await page.getByText("Último total calculado", { exact: true }).count(), 1);
  assert.equal(await page.getByText("Cálculo pendente de atualização", { exact: true }).count(), 1);
  assert.equal(
    await page.getByText("Resultado registrado no servidor", { exact: true }).count(),
    0,
  );
  await page.screenshot({ path: `${output}/budget-pending.png`, fullPage: true });
  results.push({
    screen: "orcamento",
    checks: "pending result is explicitly prior calculation, no confirmed current label",
    passed: true,
  });

  await go("parametros");
  assert.equal(await page.locator(".nx-parameter-field input").count(), 22);
  await page.locator("summary").filter({ hasText: "Equipe e produtividade" }).click();
  await page.getByLabel("Produtividade telhado (m/equipe-dia)").fill("0");
  await page.getByLabel("Produtividade telhado (m/equipe-dia)").blur();
  assert.equal(
    await page.getByLabel("Produtividade telhado (m/equipe-dia)").getAttribute("aria-invalid"),
    "true",
  );
  const errorId = await page
    .getByLabel("Produtividade telhado (m/equipe-dia)")
    .getAttribute("aria-describedby");
  assert.ok(errorId);
  assert.ok((await page.locator(`[id="${errorId}"]`).innerText()).length > 0);
  results.push({
    screen: "parametros",
    checks: "22 fields preserved and invalid productivity exposes associated visible error",
    passed: true,
  });

  for (const width of [360, 1366]) {
    await page.setViewportSize({ width, height: 768 });
    await go("resumo-executivo");
    await page.screenshot({ path: `${output}/summary-${width}.png`, fullPage: true });
    assert.equal(
      await page.evaluate(() => document.documentElement.scrollWidth > innerWidth),
      false,
    );
    assert.equal((await page.getByText("Documento comercial", { exact: false }).count()) > 0, true);
    await page.getByRole("button", { name: "Ver visão interna" }).click();
    assert.equal(await page.getByText("Resultado (interno)", { exact: true }).count(), 1);
    await page.emulateMedia({ media: "print" });
    assert.equal(await page.locator(".nx-document-tools").isVisible(), false);
    assert.equal(await page.locator(".nx-document-paper").isVisible(), true);
    await page.emulateMedia({ media: "screen" });
  }
  await go("resumo-executivo", "restricted");
  assert.equal(await page.getByRole("button", { name: "Ver visão interna" }).count(), 0);
  assert.equal(await page.getByText("Resultado (interno)", { exact: true }).count(), 0);
  results.push({
    screen: "resumo-executivo",
    checks:
      "360/1366 no page overflow; internal mode changes only with existing control; print hides internal controls; restricted user cannot show internal data",
    passed: true,
  });
  assert.equal(errors.length, 0);
  console.log(JSON.stringify(results, null, 2));
} finally {
  await writeFile(
    `${output}/checks.json`,
    JSON.stringify(
      {
        date: new Date().toISOString(),
        browser: browser.version(),
        environment: "isolated presentation fixtures, not authenticated or backend validation",
        results,
        errors,
      },
      null,
      2,
    ),
  );
  await browser.close();
}
