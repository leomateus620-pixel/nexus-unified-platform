import assert from "node:assert/strict";
import { mkdir, writeFile } from "node:fs/promises";
import { chromium, expect } from "@playwright/test";
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
await page.addInitScript(() => {
  if (new URLSearchParams(location.search).get("scenario") === "pending") window.__saveDelay = 5000;
});
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
  await go("parametros-globais");
  await page.locator('[data-parameter-group="Condições comerciais"]').click();
  await page.getByLabel("Markup sobre custo composto", { exact: true }).fill("0.42");
  await page.waitForFunction(() =>
    window.__nexusCalls.some((call) => call.table === "config_orcamento"),
  );
  const defaultCalls = await calls();
  assert.equal(
    defaultCalls.find((call) => call.table === "config_orcamento").payload.parametros.markup,
    0.42,
  );
  assert.equal(
    defaultCalls.some((call) => call.name === "consolidarProposta"),
    false,
  );
  await expect(page.getByText("Salvo", { exact: true })).toBeVisible();
  results.push({
    screen: "parametros-globais",
    checks:
      "shared form preserves automatic global-default saving outside the revision coordinator",
    passed: true,
  });
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
  await expect(page.locator(".nx-budget-value[data-total='true']")).toContainText(
    /Atualização pendente|Recalculando/,
  );
  assert.equal(await page.locator(".nx-budget-value").count(), 5);
  assert.deepEqual(await page.locator(".nx-budget-sign").allTextContents(), ["+", "+", "−", "="]);
  assert.equal(await page.locator(".nx-budget-group details[open]").count(), 0);
  await page.locator(".nx-budget-group summary").first().click();
  await expect(page.locator(".nx-budget-group-detail").first()).toBeVisible();
  await page.screenshot({ path: `${output}/budget-pending.png`, fullPage: true });
  results.push({
    screen: "orcamento",
    checks:
      "five canonical sale values, plus/minus/equal signs; pending result labeled; budget groups collapsed and expand intentionally",
    passed: true,
  });

  await go("parametros");
  assert.equal(await page.locator(".nx-parameter-category").count(), 4);
  let fieldCount = 0;
  for (const category of [
    "Condições comerciais",
    "Provisões e alíquotas",
    "Equipe e produtividade",
    "Deslocamento e permanência",
  ]) {
    const trigger = page.locator(`.nx-parameter-category[data-parameter-group="${category}"]`);
    await trigger.click();
    assert.equal(await page.locator(".nx-parameter-category").count(), 0);
    fieldCount += await page.locator(".nx-parameter-field input").count();
    await page.getByRole("button", { name: "Voltar às categorias" }).click();
    await expect(trigger).toBeFocused();
  }
  assert.equal(fieldCount, 22);
  assert.equal((await calls()).length, 0, "opening categories is read-only");
  await page
    .locator('.nx-parameter-category[data-parameter-group="Equipe e produtividade"]')
    .click();
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
  await page.keyboard.press("Escape");
  await expect(
    page.locator('.nx-parameter-category[data-parameter-group="Equipe e produtividade"]'),
  ).toBeFocused();
  await page
    .locator('.nx-parameter-category[data-parameter-group="Equipe e produtividade"]')
    .click();
  await expect(page.getByLabel("Produtividade telhado (m/equipe-dia)")).toHaveValue("0");
  await page.getByRole("link", { name: "Orçamento", exact: true }).click();
  await page.getByRole("link", { name: /Parâmetros/ }).click();
  await page
    .locator('.nx-parameter-category[data-parameter-group="Equipe e produtividade"]')
    .click();
  await expect(page.getByLabel("Produtividade telhado (m/equipe-dia)")).toHaveValue("0");
  await page.waitForTimeout(950);
  assert.equal(
    (await calls()).filter((call) => call.payload?.parametros).length,
    0,
    "invalid input must never persist",
  );
  results.push({
    screen: "parametros",
    checks:
      "four categories expose 22 unchanged fields; focus return and Escape; invalid productivity preserved without writing",
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
  await go("resumo-executivo");
  await page.evaluate(() => {
    window.__writeDelay = 250;
    window.print = () =>
      window.__nexusCalls.push({
        name: "printDocument",
        payload: { text: document.querySelector(".nx-document-paper").innerText },
      });
  });
  await page.getByLabel("Validade", { exact: true }).fill("45 dias");
  await page.getByRole("button", { name: "Imprimir", exact: true }).click();
  await page.waitForFunction(() =>
    window.__nexusCalls.some((call) => call.name === "printDocument"),
  );
  const printCalls = await calls();
  assert.ok(
    printCalls.findIndex((call) => call.payload?.textos) <
      printCalls.findIndex((call) => call.name === "consolidarProposta"),
  );
  assert.ok(
    printCalls.findIndex((call) => call.name === "consolidarProposta") <
      printCalls.findIndex((call) => call.name === "printDocument"),
  );
  assert.match(printCalls.find((call) => call.name === "printDocument").payload.text, /45 dias/);
  results.push({
    screen: "resumo-executivo",
    checks:
      "print waits for draft persistence and checkpoint; actual confirmed document contains the latest condition",
    passed: true,
  });

  await go("resumo-executivo", "write-conflict");
  await page.evaluate(() => {
    window.print = () => window.__nexusCalls.push({ name: "printDocument" });
  });
  await page.getByLabel("Objeto", { exact: true }).fill("Texto local preservado em conflito");
  await page.getByRole("button", { name: "Imprimir", exact: true }).click();
  await expect(page.locator(".nx-document-tools [role='alert']")).toContainText("pendentes");
  await page.getByRole("button", { name: "Emitir proposta", exact: true }).click();
  await expect(page.getByLabel("Objeto", { exact: true })).toHaveValue(
    "Texto local preservado em conflito",
  );
  assert.equal(
    (await calls()).filter((call) => ["printDocument", "transicionarRevisao"].includes(call.name))
      .length,
    0,
  );
  results.push({
    screen: "resumo-executivo",
    checks:
      "conflict blocks printing and emission, retains local texts, and never changes commercial status",
    passed: true,
  });
  await go("resumo-executivo");
  await page.evaluate(() => {
    window.__writeDelay = 450;
    window.__nexusRevision.textos.validade = "45 dias (alteração remota)";
    window.__nexusRevision.version++;
  });
  await page.getByLabel("Objeto", { exact: true }).fill("Escopo em edição rápida");
  await page.waitForFunction(() => window.__nexusCalls.some((call) => call.payload?.textos));
  await page
    .getByLabel("Condições", { exact: true })
    .fill("Observação adicional durante a primeira gravação");
  await page.waitForFunction(
    () => window.__nexusCalls.filter((call) => call.payload?.textos).length === 2,
  );
  const successiveTexts = (await calls()).filter((call) => call.payload?.textos);
  assert.equal(successiveTexts[0].payload.textos.validade, "45 dias (alteração remota)");
  assert.equal(successiveTexts[1].payload.textos.validade, "45 dias (alteração remota)");
  assert.equal(
    successiveTexts[1].payload.textos.condicoes,
    "Observação adicional durante a primeira gravação",
  );
  await expect(page.getByLabel("Validade", { exact: true })).toHaveValue(
    "45 dias (alteração remota)",
  );
  results.push({
    screen: "resumo-executivo",
    checks:
      "two rapid full-form edits preserve a concurrent change to an untouched field and render it after confirmation",
    passed: true,
  });
  await go("resumo-executivo");
  await page.getByRole("button", { name: "Focar documento" }).click();
  await expect(page.locator(".nx-document-tools")).toBeHidden();
  await page.keyboard.press("Escape");
  await expect(page.locator(".nx-document-tools")).toBeVisible();
  await page.setViewportSize({ width: 390, height: 844 });
  await page.getByRole("button", { name: "Editar textos", exact: true }).click();
  await expect(page.locator(".nx-document-paper")).toBeHidden();
  await expect(page.getByLabel("Objeto", { exact: true })).toBeFocused();
  assert.equal(await page.getByLabel("Objeto", { exact: true }).count(), 1);
  assert.equal(
    await page.evaluate(() => document.documentElement.scrollWidth > innerWidth + 1),
    false,
  );
  await page.keyboard.press("Escape");
  await expect(page.locator(".nx-document-paper")).toBeVisible();
  await expect(page.getByRole("button", { name: "Editar textos", exact: true })).toBeFocused();
  await page.setViewportSize({ width: 1366, height: 768 });
  const textFields = {
    Objeto: "Escopo validado na fixture",
    Validade: "15 dias",
    Garantia: "2 anos",
    Condições: "Condições registradas na fixture",
    "Responsável técnico": "Responsável fixture",
  };
  for (const [label, value] of Object.entries(textFields))
    await page.getByLabel(label, { exact: true }).fill(value);
  await page.getByRole("link", { name: "Orçamento", exact: true }).click();
  await page.waitForFunction(() =>
    window.__nexusCalls.some((call) => call.name === "consolidarProposta"),
  );
  const textCalls = await calls();
  const textPayload = textCalls.find((call) => call.payload?.textos)?.payload.textos;
  assert.deepEqual(textPayload, {
    objeto: textFields.Objeto,
    validade: textFields.Validade,
    garantia: textFields.Garantia,
    condicoes: textFields["Condições"],
    responsavel_tecnico: textFields["Responsável técnico"],
  });
  assert.ok(
    textCalls.findIndex((call) => call.payload?.textos) <
      textCalls.findIndex((call) => call.name === "consolidarProposta"),
  );
  assert.equal(
    textCalls.filter((call) =>
      ["transicionarRevisao", "gerarOrdens", "gerarDemanda"].includes(call.name),
    ).length,
    0,
  );
  results.push({
    screen: "resumo-executivo",
    checks:
      "document focus/Escape; all five texts autosave through shared coordinator after navigation, before checkpoint, without emission/orders",
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
