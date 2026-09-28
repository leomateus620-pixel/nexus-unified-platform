import assert from "node:assert/strict";
import { writeFile, mkdir } from "node:fs/promises";
import { chromium } from "@playwright/test";
import { evidenceRoot } from "./evidence.mjs";
const output = `${evidenceRoot}/catalog-after`;
await mkdir(output, { recursive: true });
const browser = await chromium.launch({
  headless: true,
  ...(process.env.NEXUS_UI_CHROMIUM ? { executablePath: process.env.NEXUS_UI_CHROMIUM } : {}),
});
const page = await browser.newPage({
  viewport: { width: 1366, height: 768 },
  locale: "pt-BR",
  reducedMotion: "reduce",
});
const base = process.env.NEXUS_UI_URL || "http://127.0.0.1:4182";
const errors = [],
  checks = [];
page.on("pageerror", (e) => errors.push(e.message));
await page.route("**/*", (route) =>
  ["127.0.0.1", "fonts.googleapis.com", "fonts.gstatic.com"].includes(
    new URL(route.request().url()).hostname,
  )
    ? route.continue()
    : route.abort(),
);
const calls = () => page.evaluate(() => window.__nexusCalls);
async function go(screen, scenario = "normal") {
  await page.goto(`${base}/?page=${screen}&scenario=${scenario}`, { waitUntil: "networkidle" });
  await page.locator("h1").waitFor();
}
function pass(name) {
  checks.push({ name, passed: true });
}
try {
  for (const screen of [
    "itens-comerciais",
    "dimensionamento",
    "orcamento",
    "compras",
    "producao",
    "resumo-executivo",
    "parametros",
    "historico",
  ]) {
    await go(screen);
    assert.equal(await page.locator("main table:not(.nx-document-paper table)").count(), 0, screen);
    assert.equal(
      await page.getByRole("button", { name: "Salvar proposta", exact: true }).count(),
      1,
      screen,
    );
  }
  pass("all eight stages: cards as primary structure and one shared save action");
  await go("itens-comerciais");
  for (const checkbox of await page.getByRole("checkbox", { name: /^Selecionar COMP-/ }).all()) {
    await checkbox.check();
  }
  await page.getByPlaceholder("Código, descrição ou fabricante").fill("COMP-002");
  await page.getByLabel("Modalidade em lote").selectOption("fabricar");
  await page.waitForFunction(() =>
    window.__nexusCalls.some((c) => c.name === "atualizar_componentes_revisao"),
  );
  const writes = (await calls()).filter((c) => c.name === "atualizar_componentes_revisao");
  assert.equal(writes.length, 1);
  assert.deepEqual(writes[0].payload, {
    _rev: "rev-fixture",
    _ids: ["component-1"],
    _patch: { modalidade: "fabricar" },
    _esperados: { "component-1": { modalidade: "comprar" } },
  });
  pass("bulk operation touches only the selected AND filtered item");
  await go("itens-comerciais");
  await page.getByRole("button", { name: "Editar item COMP-001", exact: true }).click();
  await page.getByLabel("Custo COMP-001").fill("15000");
  await page.getByLabel("Custo COMP-001").blur();
  await page
    .getByRole("button", { name: "Salvar proposta", exact: true })
    .evaluate((button) => button.click());
  await page.waitForTimeout(100);
  assert.equal(
    (await calls()).filter((c) => c.name === "consolidarProposta").length,
    0,
    "pending justification cannot consolidate",
  );
  await page.getByRole("button", { name: "Cancelar", exact: true }).click();
  assert.equal((await calls()).length, 0);
  assert.equal(await page.getByLabel("Custo COMP-001").inputValue(), "12345.6789");
  pass("pending cost justification blocks consolidation; cancel does not write and restores input");
  await go("dimensionamento");
  await page.evaluate(() => {
    window.__saveDelay = 800;
  });
  await page.getByRole("button", { name: "Editar sistema 1", exact: true }).click();
  const meters = page.getByLabel("Metragem do sistema 1", { exact: true });
  await meters.fill("130");
  assert.equal((await calls()).filter((c) => c.mutation).length, 0);
  await meters.evaluate((e) => {
    window.__editNode = e;
  });
  await page.getByRole("button", { name: "Salvar proposta", exact: true }).click();
  await page.waitForFunction(() =>
    window.__nexusCalls.some((c) => c.name === "consolidarProposta"),
  );
  await meters.fill("140");
  await page.waitForTimeout(1100);
  assert.equal(await meters.inputValue(), "140");
  assert.equal(await meters.evaluate((e) => e === window.__editNode), true);
  assert.match(await page.locator(".nx-save-feedback").innerText(), /locais/);
  const saved = await calls();
  assert.ok(
    saved.findIndex((c) => c.mutation === "update") <
      saved.findIndex((c) => c.name === "consolidarProposta"),
  );
  assert.equal(saved.filter((c) => c.name === "consolidarProposta").length, 1);
  pass(
    "save flushes blur before capture; typing during response preserves DOM, cursor draft and next-save status",
  );
  await go("parametros", "sparse-parameters");
  await page.locator("summary").filter({ hasText: "Condições comerciais" }).click();
  await page.getByLabel("Desconto ao cliente", { exact: true }).fill("0.1");
  await page.getByRole("button", { name: "Salvar proposta", exact: true }).click();
  await page.waitForFunction(() =>
    window.__nexusCalls.some((c) => c.name === "consolidarProposta"),
  );
  const paramCalls = await calls();
  assert.deepEqual(
    Object.keys(paramCalls.find((c) => c.payload?.parametros).payload.parametros),
    ["desconto"],
    "display defaults are not recorded as manual edits",
  );
  assert.ok(
    paramCalls.findIndex((c) => c.payload?.parametros) <
      paramCalls.findIndex((c) => c.name === "consolidarProposta"),
  );
  pass("global save captures parameters before the autosave timer fires");
  await go("dimensionamento", "write-conflict");
  await page.getByRole("button", { name: "Editar sistema 1", exact: true }).click();
  await page.getByLabel("Metragem do sistema 1", { exact: true }).fill("130");
  await page.getByLabel("Metragem do sistema 1", { exact: true }).blur();
  await page.waitForTimeout(150);
  await page.getByRole("button", { name: "Salvar proposta", exact: true }).click();
  await page.waitForTimeout(150);
  assert.equal((await calls()).filter((c) => c.name === "consolidarProposta").length, 0);
  assert.equal(await page.getByLabel("Metragem do sistema 1", { exact: true }).inputValue(), "130");
  pass("rejected draft write blocks consolidation and preserves the typed value");
  await go("dimensionamento");
  await page.evaluate(() => {
    window.__loseSaveResponse = true;
  });
  await page.getByRole("button", { name: "Salvar proposta", exact: true }).evaluate((e) => {
    e.click();
    e.click();
  });
  await page.waitForTimeout(500);
  await page.getByRole("button", { name: "Salvar proposta", exact: true }).click();
  await page.waitForTimeout(500);
  const retries = (await calls()).filter((c) => c.name === "consolidarProposta");
  assert.equal(retries.length, 2);
  assert.equal(retries[0].payload.data.operacao_id, retries[1].payload.data.operacao_id);
  pass("double click queues once; lost response retry retains the same idempotency key");
  await go("dimensionamento");
  await page.getByText("Colar sistemas de planilha", { exact: true }).click();
  await page.locator("textarea").fill("Trecho colado\tOVERHEAD\t120\t4");
  await page.getByRole("button", { name: "Preparar prévia" }).click();
  assert.equal((await calls()).length, 0);
  assert.equal(await page.getByRole("list", { name: "Prévia dos sistemas colados" }).count(), 1);
  await page.getByRole("button", { name: "Confirmar inserção" }).click();
  await page.waitForFunction(() => window.__nexusCalls.some((c) => c.mutation === "insert"));
  assert.equal((await calls()).find((c) => c.mutation === "insert").payload[0].tipo, "OVERHEAD");
  pass("paste has a card preview and writes only after explicit confirmation");
  await go("historico", "restricted");
  assert.equal(await page.getByText("Salvamentos confirmados", { exact: true }).count(), 0);
  assert.equal(
    await page.getByText("Execuções de cálculo · detalhe técnico", { exact: true }).count(),
    0,
  );
  pass(
    "restricted presentation exposes no sensitive history counts, diffs or technical calculations",
  );
  await go("itens-comerciais");
  const darkContrast = await page.evaluate(() => {
    document.documentElement.classList.add("dark");
    const style = getComputedStyle(document.querySelector(".nx-catalog-shell"));
    const canvas = document.createElement("canvas");
    canvas.width = canvas.height = 1;
    const ctx = canvas.getContext("2d", { willReadFrequently: true });
    const lum = (token) => {
      ctx.fillStyle = style.getPropertyValue(token);
      ctx.fillRect(0, 0, 1, 1);
      return [...ctx.getImageData(0, 0, 1, 1).data]
        .slice(0, 3)
        .map((v) => v / 255)
        .map((v) => (v <= 0.04045 ? v / 12.92 : ((v + 0.055) / 1.055) ** 2.4))
        .reduce((s, v, i) => s + v * [0.2126, 0.7152, 0.0722][i], 0);
    };
    return [
      ["--foreground", "--card"],
      ["--muted-foreground", "--card"],
      ["--primary-foreground", "--primary"],
    ].map(([a, b]) => {
      const x = lum(a),
        y = lum(b);
      return (Math.max(x, y) + 0.05) / (Math.min(x, y) + 0.05);
    });
  });
  assert.ok(darkContrast.every((ratio) => ratio >= 4.5));
  await page.screenshot({ path: `${output}/itens-dark-1366.png` });
  pass("chosen dark theme preserves opaque surfaces and text contrast >= 4.5:1");
  for (const width of [320, 360, 390]) {
    await page.setViewportSize({ width, height: 844 });
    await go("itens-comerciais");
    assert.ok(
      await page
        .locator(".nx-context-total p")
        .last()
        .evaluate((e) => e.scrollWidth <= e.clientWidth + 1),
      `monetary total fits at ${width}`,
    );
  }
  pass("mobile total fits beside or above save controls without overlap");
  assert.deepEqual(errors, []);
} finally {
  await mkdir(output, { recursive: true });
  await writeFile(
    `${output}/interactions.json`,
    JSON.stringify(
      {
        date: new Date().toISOString(),
        environment:
          "isolated UI boundaries; persistent semantics tested separately in real PostgreSQL",
        checks,
        errors,
      },
      null,
      2,
    ),
  );
  await browser.close();
}
console.log(JSON.stringify(checks, null, 2));
