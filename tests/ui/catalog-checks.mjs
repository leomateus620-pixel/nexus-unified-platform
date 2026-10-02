import assert from "node:assert/strict";
import { mkdir, writeFile } from "node:fs/promises";
import { chromium, expect } from "@playwright/test";
import { evidenceRoot } from "./evidence.mjs";

const output = `${evidenceRoot}/workspace-catalog`;
await mkdir(output, { recursive: true });
const browser = await chromium.launch({ headless: true });
const page = await browser.newPage({
  viewport: { width: 1366, height: 768 },
  locale: "pt-BR",
  reducedMotion: "reduce",
});
await page.route("**/*", (route) =>
  ["127.0.0.1", "fonts.googleapis.com", "fonts.gstatic.com"].includes(
    new URL(route.request().url()).hostname,
  )
    ? route.continue()
    : route.abort(),
);
const base = process.env.NEXUS_UI_URL || "http://127.0.0.1:4182";
const errors = [],
  checks = [];
page.on("pageerror", (error) => errors.push(error.message));
const calls = () => page.evaluate(() => window.__nexusCalls);
async function go(screen, scenario = "normal") {
  await page.goto(`${base}/?page=${screen}&scenario=${scenario}`, { waitUntil: "networkidle" });
  await page.locator("h1").waitFor();
}
const pass = (name) => checks.push({ name, passed: true });
try {
  await go("itens-comerciais");
  await page.waitForTimeout(1200);
  assert.equal((await calls()).length, 0);
  const field = page.getByPlaceholder("Nome, código ou fabricante");
  await field.focus();
  await expect(field).toBeFocused();
  await field.fill("COMP-002");
  assert.equal(await page.locator(".nx-commercial-row").count(), 1);
  await expect(page.getByRole("button", { name: "Limpar filtros", exact: true })).toBeVisible();
  assert.equal(await page.locator(".nx-commercial-row").count(), 1);
  await page.getByRole("button", { name: "Limpar filtros", exact: true }).click();
  assert.equal(await page.locator(".nx-commercial-row").count(), 21);
  await page.getByLabel("Modalidade", { exact: true }).selectOption("fabricar");
  assert.equal(await page.locator(".nx-commercial-row").count(), 7);
  await page.getByRole("button", { name: "Limpar filtros", exact: true }).click();
  assert.equal((await calls()).length, 0);
  pass("visible search/modality, code search, active filter clear and reads stay no-op");

  for (const checkbox of await page.getByRole("checkbox", { name: /^Selecionar COMP-/ }).all())
    await checkbox.check();
  await field.fill("COMP-002");
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
  assert.equal(await page.locator("dialog.nx-editor-inspector").isVisible(), false);
  pass("bulk edit intersects selected and filtered items, inclusion/batch remain independent");

  await go("itens-comerciais");
  const inclusion = page.getByRole("checkbox", {
    name: "Incluir COMP-001 no orçamento",
    exact: true,
  });
  await inclusion.uncheck();
  await expect(page.locator('.nx-save-feedback[data-status="confirmado"]')).toBeVisible();
  assert.equal(await page.locator("dialog.nx-editor-inspector").isVisible(), false);
  assert.equal(
    await page
      .getByRole("checkbox", { name: "Selecionar COMP-001 para edição em lote", exact: true })
      .isChecked(),
    false,
  );
  assert.equal(
    (await calls()).filter((c) =>
      ["gerarDemanda", "gerarOrdens", "transicionarRevisao"].includes(c.name),
    ).length,
    0,
  );
  pass(
    "budget inclusion auto persists without expansion, selection or order/commercial side effects",
  );

  await go("itens-comerciais");
  await page.getByRole("button", { name: "Editar item COMP-001", exact: true }).click();
  await page.getByLabel("Custo COMP-001").fill("15000");
  await page.getByLabel("Custo COMP-001").blur();
  await page.waitForTimeout(1100);
  assert.equal((await calls()).filter((c) => c.name === "consolidarProposta").length, 0);
  await page.getByRole("button", { name: "Cancelar", exact: true }).click();
  assert.equal(await page.getByLabel("Custo COMP-001").inputValue(), "12345.6789");
  assert.equal((await calls()).filter((c) => c.name === "atualizar_componentes_revisao").length, 0);
  pass("required justification blocks checkpoint; cancel preserves source cost and writes nothing");

  await go("dimensionamento");
  await page.getByText("Colar sistemas de planilha", { exact: true }).click();
  await page.locator("textarea").fill("Trecho colado\tOVERHEAD\t120\t4");
  await page.getByRole("button", { name: "Preparar prévia" }).click();
  assert.equal((await calls()).length, 0);
  await page.getByRole("button", { name: "Confirmar inserção" }).click();
  await page.waitForFunction(() =>
    window.__nexusCalls.some((c) => ["insert", "upsert"].includes(c.mutation)),
  );
  const insertion = (await calls()).find((c) => ["insert", "upsert"].includes(c.mutation));
  assert.equal(insertion.payload[0].tipo, "OVERHEAD");
  assert.equal(insertion.payload[0].metragem, 120);
  assert.equal(insertion.payload[0].trechos, 4);
  pass(
    "paste preview remains read-only until explicit confirmation and retains category/measure contract",
  );

  await go("historico", "restricted");
  assert.equal(await page.getByText("Salvamentos confirmados", { exact: true }).count(), 0);
  assert.equal(
    await page.getByText("Execuções de cálculo · detalhe técnico", { exact: true }).count(),
    0,
  );
  pass("restricted user sees no checkpoint differences or technical history");
  for (const width of [320, 360, 390, 1366]) {
    await page.setViewportSize({ width, height: 844 });
    await go("itens-comerciais", "long-title");
    const title = await page.locator("h1").textContent();
    await page.getByRole("button", { name: "Detalhes da proposta", exact: true }).click();
    await expect(page.getByRole("dialog").getByText(title, { exact: true })).toBeVisible();
    await page.keyboard.press("Escape");
    await expect(
      page.getByRole("button", { name: "Detalhes da proposta", exact: true }),
    ).toBeFocused();
    assert.equal(
      await page.evaluate(() => document.documentElement.scrollWidth > innerWidth + 1),
      false,
    );
  }
  pass(
    "long scope remains fully accessible in details; Escape focus and monetary fit at 320/360/390/1366",
  );
  assert.deepEqual(errors, []);
} finally {
  await writeFile(
    `${output}/checks.json`,
    JSON.stringify(
      { environment: "Real components, isolated fixture transport", checks, errors },
      null,
      2,
    ),
  );
  await browser.close();
}
console.log(JSON.stringify(checks, null, 2));
