import assert from "node:assert/strict";
import { mkdir, writeFile } from "node:fs/promises";
import { chromium, expect } from "@playwright/test";
import { evidenceRoot } from "./evidence.mjs";

const base = process.env.NEXUS_UI_URL || "http://127.0.0.1:4182";
const output = `${evidenceRoot}/workspace-autosave`;
await mkdir(output, { recursive: true });
const browser = await chromium.launch({
  headless: true,
  ...(process.env.NEXUS_UI_CHROMIUM ? { executablePath: process.env.NEXUS_UI_CHROMIUM } : {}),
});
const page = await browser.newPage({
  locale: "pt-BR",
  reducedMotion: "reduce",
  viewport: { width: 1366, height: 900 },
});
await page.route("**/*", (route) =>
  ["127.0.0.1", "fonts.googleapis.com", "fonts.gstatic.com"].includes(
    new URL(route.request().url()).hostname,
  )
    ? route.continue()
    : route.abort(),
);
const report = {
  environment:
    "Actual application components with isolated in-memory persistence boundary. No production writes, database, deployment or physical-device claim.",
  browser: browser.version(),
  checks: [],
  errors: [],
};
page.on("pageerror", (error) => report.errors.push(error.message));
async function go(screen, scenario = "normal") {
  await page.goto(`${base}/?page=${screen}&scenario=${scenario}&count=2`, {
    waitUntil: "networkidle",
  });
  await page.locator("h1").waitFor();
}
async function navigate(label) {
  await page.locator(".nx-step").filter({ hasText: label }).click();
}
async function confirmed() {
  await expect(page.locator('.nx-save-feedback[data-status="confirmado"]')).toBeVisible({
    timeout: 15000,
  });
}
const state = () =>
  page.evaluate(() => ({ calls: window.__nexusCalls, events: window.__nexusEvents }));
async function pass(name, screenshot) {
  const evidence = await state();
  report.checks.push({ name, passed: true, calls: evidence.calls, events: evidence.events });
  if (screenshot) await page.screenshot({ path: `${output}/${screenshot}.png`, fullPage: false });
}
try {
  await go("resumo-executivo");
  await page.evaluate(() => {
    window.__writeDelay = 500;
    window.__saveDelay = 500;
  });
  const object = page.getByRole("textbox", { name: "Objeto", exact: true });
  await object.fill("");
  await object.pressSequentially("Escopo confirmado por autosave", { delay: 15 });
  await page.getByLabel("Validade", { exact: true }).fill("45 dias");
  await navigate("Orçamento");
  await confirmed();
  let evidence = await state();
  assert.equal(evidence.events.length, 1);
  assert.deepEqual(
    evidence.events[0].diferencas
      .filter((d) => ["objeto", "validade"].includes(d.campo))
      .map((d) => d.campo)
      .sort(),
    ["objeto", "validade"],
  );
  assert.equal(
    evidence.calls.filter((c) => c.table === "proposta_revisoes" && c.payload?.textos).length,
    1,
  );
  assert.equal(evidence.calls.filter((c) => c.name === "consolidarProposta").length, 1);
  await navigate("Resumo");
  await expect(page.getByRole("textbox", { name: "Objeto", exact: true })).toHaveValue(
    "Escopo confirmado por autosave",
  );
  await expect(page.getByLabel("Validade", { exact: true })).toHaveValue("45 dias");
  await navigate("Histórico");
  await expect(page.locator(".nx-history")).toContainText("Autor do ambiente isolado");
  await pass(
    "Rapid typing and stage change retain both text fields, one grouped checkpoint and actual history",
    "texts-history",
  );

  await go("resumo-executivo");
  await page.evaluate(() => {
    window.__saveDelay = 1200;
  });
  await page.getByRole("textbox", { name: "Objeto", exact: true }).fill("Primeiro grupo de edição");
  await page.waitForFunction(() =>
    window.__nexusCalls.some((c) => c.name === "consolidarProposta"),
  );
  await page
    .getByRole("textbox", { name: "Objeto", exact: true })
    .fill("Edição nova enquanto cálculo aguarda");
  await page.waitForFunction(() => window.__nexusEvents.length === 2, { timeout: 15000 });
  await confirmed();
  evidence = await state();
  assert.equal(
    evidence.events[0].diferencas.find((d) => d.campo === "objeto").depois,
    "Primeiro grupo de edição",
  );
  assert.equal(
    evidence.events[1].diferencas.find((d) => d.campo === "objeto").depois,
    "Edição nova enquanto cálculo aguarda",
  );
  await expect(page.getByRole("textbox", { name: "Objeto", exact: true })).toHaveValue(
    "Edição nova enquanto cálculo aguarda",
  );
  await pass(
    "Older checkpoint confirmation cannot overwrite newer typing; the next group confirms automatically",
    "newer-edit-during-checkpoint",
  );

  await go("resumo-executivo");
  const beforePendingWrite = await page
    .getByRole("textbox", { name: "Objeto", exact: true })
    .inputValue();
  await page.evaluate(() => {
    window.__writeDelay = 1400;
    window.__saveDelay = 300;
  });
  await page
    .getByRole("textbox", { name: "Objeto", exact: true })
    .fill("Primeira alteração ainda aguardando a gravação");
  await page.waitForFunction(() =>
    window.__nexusCalls.some((c) => c.table === "proposta_revisoes" && c.payload?.textos),
  );
  await page.getByRole("textbox", { name: "Objeto", exact: true }).fill(beforePendingWrite);
  await navigate("Orçamento");
  await confirmed();
  await navigate("Resumo");
  await expect(page.getByRole("textbox", { name: "Objeto", exact: true })).toHaveValue(
    beforePendingWrite,
  );
  evidence = await state();
  const revertWrites = evidence.calls.filter(
    (c) => c.table === "proposta_revisoes" && c.payload?.textos,
  );
  assert.equal(revertWrites.length, 2);
  assert.equal(revertWrites[1].payload.textos.objeto, beforePendingWrite);
  assert.equal(await page.evaluate(() => window.__nexusRevision.textos.objeto), beforePendingWrite);
  await pass(
    "Restoring the original value during a pending write survives navigation and is compared in FIFO order",
    "newer-revert-during-write",
  );

  await go("resumo-executivo");
  await page.evaluate(() => {
    window.__writeDelay = 700;
    window.__saveDelay = 500;
  });
  await page
    .getByRole("textbox", { name: "Objeto", exact: true })
    .fill("Escopo local com condição concorrente");
  await page.evaluate(() => {
    window.__nexusRevision.textos.validade = "45 dias de outro editor";
    window.__nexusRevision.version++;
  });
  await page.waitForFunction(() =>
    window.__nexusCalls.some((c) => c.table === "proposta_revisoes" && c.payload?.textos),
  );
  await page
    .getByRole("textbox", { name: "Condições", exact: true })
    .fill("Condições novas durante a primeira gravação");
  await navigate("Orçamento");
  await page.waitForFunction(() => window.__nexusEvents.length === 2);
  await confirmed();
  await navigate("Resumo");
  await expect(page.getByLabel("Validade", { exact: true })).toHaveValue("45 dias de outro editor");
  await expect(page.getByRole("textbox", { name: "Condições", exact: true })).toHaveValue(
    "Condições novas durante a primeira gravação",
  );
  evidence = await state();
  const textWrites = evidence.calls.filter(
    (c) => c.table === "proposta_revisoes" && c.payload?.textos,
  );
  assert.equal(textWrites.length, 2);
  assert.ok(textWrites.every((c) => c.payload.textos.validade === "45 dias de outro editor"));
  await pass(
    "Queued full-form edits preserve an untouched field changed by another editor",
    "concurrent-unrelated-field-preserved",
  );

  await go("resumo-executivo");
  await page.evaluate(() => {
    window.__loseSaveResponse = true;
  });
  await page
    .getByRole("textbox", { name: "Objeto", exact: true })
    .fill("Confirmado apesar da resposta perdida");
  await expect(page.getByRole("button", { name: "Tentar novamente", exact: true })).toBeVisible({
    timeout: 15000,
  });
  await page.getByRole("button", { name: "Tentar novamente", exact: true }).click();
  await confirmed();
  evidence = await state();
  const checkpointIds = evidence.calls
    .filter((c) => c.name === "consolidarProposta")
    .map((c) => c.payload.data.operacao_id);
  assert.equal(checkpointIds.length, 2);
  assert.equal(checkpointIds[0], checkpointIds[1]);
  assert.equal(evidence.events.length, 1);
  await pass(
    "Lost checkpoint response retries the same operation UUID without a second history event",
    "lost-checkpoint-retry",
  );

  await go("resumo-executivo");
  await page.evaluate(() => {
    window.__loseWriteResponse = true;
  });
  await page
    .getByRole("textbox", { name: "Objeto", exact: true })
    .fill("Entrada persistida com resposta perdida");
  await confirmed();
  evidence = await state();
  assert.equal(evidence.events.length, 1);
  assert.equal(
    evidence.calls.filter((c) => c.table === "proposta_revisoes" && c.payload?.textos).length,
    1,
  );
  await pass(
    "Lost revision write response is confirmed by reading identical persisted fields",
    "lost-write-confirmed",
  );

  await go("resumo-executivo");
  await page.evaluate(() => {
    window.__failNextWrite = true;
  });
  await page
    .getByRole("textbox", { name: "Objeto", exact: true })
    .fill("Entrada recuperada após falha");
  await expect(page.getByRole("button", { name: "Tentar novamente", exact: true })).toBeVisible({
    timeout: 15000,
  });
  evidence = await state();
  assert.equal(evidence.events.length, 0);
  assert.equal(evidence.calls.filter((c) => c.name === "consolidarProposta").length, 0);
  await expect(page.getByRole("textbox", { name: "Objeto", exact: true })).toHaveValue(
    "Entrada recuperada após falha",
  );
  await page.getByRole("button", { name: "Tentar novamente", exact: true }).click();
  await confirmed();
  evidence = await state();
  assert.equal(evidence.events.length, 1);
  await pass(
    "Failed persistence preserves the input, blocks calculation and recovers with explicit retry",
    "failed-write-retry",
  );

  await go("dimensionamento");
  await page.getByRole("button", { name: "Editar sistema 1", exact: true }).click();
  await page.evaluate(() => {
    window.__failWriteField = "metragem";
  });
  await page.getByLabel("Metragem do sistema 1", { exact: true }).fill("145");
  await expect(page.getByRole("button", { name: "Tentar novamente", exact: true })).toBeVisible({
    timeout: 15000,
  });
  await page
    .getByLabel("Identificação do sistema 1", { exact: true })
    .fill("Identificação confirmada sem perder metragem pendente");
  await navigate("Orçamento");
  await expect(page.getByRole("button", { name: "Tentar novamente", exact: true })).toBeVisible({
    timeout: 15000,
  });
  evidence = await state();
  assert.equal(evidence.events.length, 0);
  assert.equal(evidence.calls.filter((c) => c.name === "consolidarProposta").length, 0);
  await page.evaluate(() => {
    window.__failWriteField = undefined;
  });
  await page.getByRole("button", { name: "Tentar novamente", exact: true }).click();
  await confirmed();
  evidence = await state();
  assert.equal(evidence.events.length, 1);
  const systemFields = evidence.events[0].diferencas
    .filter((d) => d.objeto === "sistemas:system-0")
    .map((d) => d.campo);
  assert.ok(systemFields.includes("metragem"));
  assert.ok(systemFields.includes("identificacao"));
  await navigate("Dimensionamento");
  await page.getByRole("button", { name: "Editar sistema 1", exact: true }).click();
  await expect(page.getByLabel("Metragem do sistema 1", { exact: true })).toHaveValue("145");
  await pass(
    "Successful edits to another field cannot clear a failed field; global retry confirms both after navigation",
    "failed-field-other-success",
  );

  await go("parametros");
  await page.locator('[data-parameter-group="Condições comerciais"]').click();
  await page.getByLabel("Markup sobre custo composto", { exact: true }).fill("-0.25");
  await page.waitForTimeout(1100);
  await expect(page.locator('.nx-save-feedback[data-status="erro"]')).toBeVisible();
  await navigate("Orçamento");
  await navigate("Parâmetros");
  await page.locator('[data-parameter-group="Condições comerciais"]').click();
  await expect(page.getByLabel("Markup sobre custo composto", { exact: true })).toHaveValue(
    "-0.25",
  );
  evidence = await state();
  assert.equal(evidence.events.length, 0);
  assert.equal(
    evidence.calls.filter((c) => c.table === "proposta_revisoes" && c.payload?.parametros).length,
    0,
  );
  await page.getByLabel("Markup sobre custo composto", { exact: true }).fill("0.45");
  await confirmed();
  await pass(
    "Invalid parameter survives stage round-trip and never reports saved; valid correction confirms",
    "invalid-parameter-preserved",
  );

  await go("parametros", "sparse-parameters");
  await page.locator('[data-parameter-group="Condições comerciais"]').click();
  await page.evaluate(() => {
    window.__writeDelay = 300;
    window.__saveDelay = 1600;
  });
  await page.getByLabel("Desconto ao cliente", { exact: true }).fill("0.02");
  await page.evaluate(() => {
    window.__nexusRevision.parametros.produtividade_telhado_m_dia = 45;
    window.__nexusRevision.version++;
  });
  await page.waitForFunction(() =>
    window.__nexusCalls.some((c) => c.name === "consolidarProposta"),
  );
  await page.getByLabel("Markup sobre custo composto", { exact: true }).fill("0.45");
  await navigate("Orçamento");
  await confirmed();
  assert.deepEqual(await page.evaluate(() => window.__nexusRevision.parametros), {
    desconto: 0.02,
    produtividade_telhado_m_dia: 45,
    markup: 0.45,
  });
  evidence = await state();
  assert.ok(
    evidence.calls
      .filter((c) => c.table === "proposta_revisoes" && c.payload?.parametros)
      .every((c) => c.payload.parametros.produtividade_telhado_m_dia === 45),
  );
  await pass(
    "Sparse parameters preserve an untouched concurrent value while a newer local edit awaits checkpoint",
    "sparse-parameters-concurrent",
  );

  await go("parametros", "sparse-parameters");
  await page.locator('[data-parameter-group="Condições comerciais"]').click();
  const implicitMarkup = await page
    .getByLabel("Markup sobre custo composto", { exact: true })
    .inputValue();
  await page.getByLabel("Markup sobre custo composto", { exact: true }).fill("0.45");
  await page.getByLabel("Markup sobre custo composto", { exact: true }).fill(implicitMarkup);
  await confirmed();
  evidence = await state();
  assert.equal(evidence.events.length, 0);
  assert.equal(evidence.calls.filter((c) => c.table === "proposta_revisoes").length, 0);
  assert.deepEqual(await page.evaluate(() => window.__nexusRevision.parametros), { desconto: 0 });
  await pass("Restoring an implicit default before persistence remains a sparse no-op");

  await go("parametros", "sparse-parameters");
  await page.locator('[data-parameter-group="Condições comerciais"]').click();
  await page.evaluate(() => {
    window.__writeDelay = 1400;
    window.__saveDelay = 300;
  });
  await page.getByLabel("Markup sobre custo composto", { exact: true }).fill("0.45");
  await page.waitForFunction(() =>
    window.__nexusCalls.some((c) => c.table === "proposta_revisoes" && c.payload?.parametros),
  );
  await page.getByLabel("Markup sobre custo composto", { exact: true }).fill(implicitMarkup);
  await navigate("Orçamento");
  await confirmed();
  assert.deepEqual(await page.evaluate(() => window.__nexusRevision.parametros), {
    desconto: 0,
    markup: Number(implicitMarkup),
  });
  evidence = await state();
  assert.equal(
    evidence.calls.filter((c) => c.table === "proposta_revisoes" && c.payload?.parametros).length,
    2,
  );
  await pass(
    "Restoring an implicit parameter default during a pending write survives navigation in FIFO order",
    "sparse-parameter-pending-revert",
  );

  await go("parametros", "sparse-parameters");
  await page.locator('[data-parameter-group="Condições comerciais"]').click();
  await page.getByLabel("Markup sobre custo composto", { exact: true }).fill("-0.25");
  await expect(page.locator('.nx-save-feedback[data-status="erro"]')).toBeVisible();
  await navigate("Orçamento");
  await navigate("Parâmetros");
  await page.locator('[data-parameter-group="Condições comerciais"]').click();
  await page.getByLabel("Markup sobre custo composto", { exact: true }).fill(implicitMarkup);
  await confirmed();
  evidence = await state();
  assert.equal(evidence.events.length, 0);
  assert.equal(evidence.calls.filter((c) => c.table === "proposta_revisoes").length, 0);
  await pass(
    "Correcting an invalid draft back to its implicit default clears pending without a write",
  );

  await go("resumo-executivo");
  await page.getByRole("textbox", { name: "Objeto", exact: true }).fill("Edição local protegida");
  await page.evaluate(() => {
    const revision = window.__nexusRevision;
    revision.textos.objeto = "Edição de outro usuário";
    revision.version++;
  });
  await expect(page.locator('.nx-save-feedback[data-status="conflito"]')).toBeVisible({
    timeout: 15000,
  });
  await expect(page.getByRole("textbox", { name: "Objeto", exact: true })).toHaveValue(
    "Edição local protegida",
  );
  evidence = await state();
  assert.equal(evidence.events.length, 0);
  assert.equal(evidence.calls.filter((c) => c.name === "consolidarProposta").length, 0);
  await pass(
    "Concurrent edit of the same field is rejected with local input preserved",
    "concurrent-field-conflict",
  );

  await go("resumo-executivo");
  const initial = await page.getByRole("textbox", { name: "Objeto", exact: true }).inputValue();
  await page.getByRole("textbox", { name: "Objeto", exact: true }).fill(`${initial} mudança`);
  await page.getByRole("textbox", { name: "Objeto", exact: true }).fill(initial);
  await confirmed();
  evidence = await state();
  assert.equal(evidence.events.length, 0);
  assert.equal(
    evidence.calls.filter((c) => c.table === "proposta_revisoes" && c.payload?.textos).length,
    0,
  );
  await pass("Reverted draft is a confirmed no-op and does not pollute history");

  await go("resumo-executivo", "readonly");
  assert.equal(await page.getByRole("textbox", { name: "Objeto", exact: true }).count(), 0);
  await page.waitForTimeout(1200);
  evidence = await state();
  assert.equal(evidence.calls.length, 0);
  await pass(
    "Issued revision has no editable text inputs and schedules no persistence/calculation",
  );

  for (const check of report.checks)
    assert.equal(
      check.calls.some((c) =>
        [
          "gerarDemanda",
          "gerarOrdens",
          "transicionarRevisao",
          "emitirOrdemCompra",
          "liberarOrdemProducao",
        ].includes(c.name),
      ),
      false,
      "Autosave never invokes commercial commands",
    );
  assert.deepEqual(report.errors, []);
} finally {
  await writeFile(`${output}/checks.json`, JSON.stringify(report, null, 2));
  await browser.close();
}
console.log(
  JSON.stringify(
    report.checks.map(({ name, passed }) => ({ name, passed })),
    null,
    2,
  ),
);
