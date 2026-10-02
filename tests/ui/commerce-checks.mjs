import assert from "node:assert/strict";
import { chromium, expect } from "@playwright/test";
import { mkdir, writeFile } from "node:fs/promises";
import { evidenceRoot } from "./evidence.mjs";
const output = `${evidenceRoot}/commerce-refinement`;
await mkdir(output, { recursive: true });
const browser = await chromium.launch({ headless: true });
const page = await browser.newPage({
  viewport: { width: 1440, height: 950 },
  locale: "pt-BR",
  reducedMotion: "reduce",
});
const errors = [];
const checks = [];
const metrics = [];
page.on("pageerror", (e) => errors.push(e.message));
page.on("dialog", (d) => {
  errors.push(`Unexpected native ${d.type()}`);
  d.dismiss();
});
await page.route("**/*", (r) =>
  ["127.0.0.1", "fonts.googleapis.com", "fonts.gstatic.com"].includes(
    new URL(r.request().url()).hostname,
  )
    ? r.continue()
    : r.abort(),
);
const base = process.env.NEXUS_UI_URL || "http://127.0.0.1:4182";
const pass = (name) => {
  checks.push(name);
  console.log("PASS", name);
};
const calls = () => page.evaluate(() => window.__nexusCalls);
const go = async (screen, scenario = "normal") => {
  await page.goto(`${base}/?page=${screen}&commerce=1&scenario=${scenario}`, {
    waitUntil: "networkidle",
  });
};
const noOverflow = async () =>
  assert.equal(
    await page.evaluate(() => document.documentElement.scrollWidth > innerWidth + 1),
    false,
  );
try {
  for (const width of [1440, 768, 390, 320]) {
    await page.setViewportSize({ width, height: 950 });
    for (const screen of ["produtos", "itens-comerciais", "produto"]) {
      await go(screen);
      await expect(page.locator("h1")).toBeVisible();
      await noOverflow();
      const row = page
        .locator(
          screen === "produtos"
            ? ".nx-catalog-row"
            : screen === "itens-comerciais"
              ? ".nx-commercial-row"
              : "h1",
        )
        .first();
      await expect(row).toBeVisible();
      metrics.push({ width, screen, firstRowY: Math.round((await row.boundingBox()).y) });
      if ([1440, 390].includes(width))
        await page.screenshot({ path: `${output}/after-${screen}-${width}.png`, fullPage: false });
    }
  }
  pass("Catalog, items and product detail fit 320, 390, 768 and 1440 px");
  await page.setViewportSize({ width: 1440, height: 950 });
  await go("produtos");
  await expect(page.locator("form:visible")).toHaveCount(0);
  const search = page.getByRole("searchbox");
  await search.fill("COM-NXS-M001");
  await expect(page.locator(".nx-catalog-row")).toHaveCount(1);
  await page.locator(".nx-catalog-row").click();
  await expect(page.getByRole("dialog")).toBeVisible();
  await page.keyboard.press("Escape");
  await expect(search).toHaveValue("COM-NXS-M001");
  await expect(page.locator(".nx-catalog-row")).toHaveCount(1);
  await page.getByRole("button", { name: "Limpar filtros", exact: true }).click();
  await expect(page.locator(".nx-catalog-row")).toHaveCount(24);
  pass("Opening contextual detail preserves search and list; clear restores real count");
  await page.getByRole("button", { name: "Cadastrar item", exact: true }).click();
  let sheet = page.getByRole("dialog");
  await sheet
    .locator("form:visible")
    .getByLabel("Nome do produto", { exact: true })
    .fill("Montagem principal de teste");
  await sheet.getByRole("radio", { name: /^Montagem/ }).check();
  await sheet
    .getByRole("combobox", { name: "Grupo comercial / prefixo do código", exact: true })
    .fill("Componentes gerais — COM");
  await expect(sheet.getByText("COM-NXS-M025", { exact: true })).toBeVisible();
  await expect(sheet.getByText(/Confirmado ao salvar/)).toBeVisible();
  await sheet.getByRole("button", { name: "Cadastrar componente que falta" }).click();
  await expect(sheet.locator("form:visible")).toHaveCount(1);
  await sheet
    .locator("form:visible")
    .getByLabel("Nome do produto", { exact: true })
    .fill("Peça filha de teste");
  await sheet
    .getByRole("combobox", { name: "Grupo comercial / prefixo do código", exact: true })
    .fill("Componentes gerais — COM");
  await sheet
    .getByRole("button", { name: "Cadastrar e adicionar à composição", exact: true })
    .click();
  await expect(
    sheet.locator("form:visible").getByLabel("Nome do produto", { exact: true }),
  ).toHaveValue("Montagem principal de teste");
  await expect(
    sheet.getByRole("button", { name: "Remover Peça filha de teste", exact: true }),
  ).toBeVisible();
  assert.equal((await calls()).filter((x) => x.name === "cadastrarProduto").length, 1);
  pass("Child creation uses one visible form and restores the parent draft/composition");
  await page.keyboard.press("Escape");
  await go("itens-comerciais");
  await page.getByRole("button", { name: "Adicionar item", exact: true }).click();
  sheet = page.getByRole("dialog", { name: "Adicionar item", exact: true });
  await sheet
    .getByRole("button", { name: /Montagem de ancoragem industrial COM-NXS-M001/ })
    .click();
  await expect(sheet.getByText(/quantidade manual atual:/)).toContainText("3");
  await sheet
    .getByRole("textbox", { name: "Quantidade manual a incluir no orçamento", exact: true })
    .fill("5");
  await sheet.getByRole("button", { name: "Atualizar quantidade manual", exact: true }).click();
  await expect(sheet.getByText(/Quantidade manual registrada/)).toBeVisible();
  let inclusion = (await calls()).filter((x) => x.name === "incluirNaRevisao");
  assert.equal(inclusion.at(-1).payload.data.quantidade, 5);
  pass("Existing item shows current manual quantity and sends replacement quantity, not addition");
  await sheet.getByRole("button", { name: "Cadastrar novo", exact: true }).click();
  await sheet
    .getByRole("textbox", { name: "Quantidade manual a incluir no orçamento", exact: true })
    .fill("0");
  await expect(
    sheet.getByRole("button", { name: "Cadastrar e incluir no orçamento", exact: true }),
  ).toBeDisabled();
  await sheet
    .getByRole("textbox", { name: "Quantidade manual a incluir no orçamento", exact: true })
    .fill("2");
  await sheet
    .locator("form:visible")
    .getByLabel("Nome do produto", { exact: true })
    .fill("Item novo para inclusão");
  await sheet.getByRole("radio", { name: /^Peça/ }).check();
  await sheet
    .getByRole("combobox", { name: "Grupo comercial / prefixo do código", exact: true })
    .fill("Componentes gerais — COM");
  await page.evaluate(() => (window.__failInclusion = true));
  await sheet
    .getByRole("button", { name: "Cadastrar e incluir no orçamento", exact: true })
    .click();
  await expect(sheet.getByText(/O cadastro foi salvo, mas/)).toBeVisible();
  assert.equal((await calls()).filter((x) => x.name === "cadastrarProduto").length, 1);
  await sheet.getByRole("button", { name: "Tentar inclusão novamente", exact: true }).click();
  await expect(sheet.getByText(/Incluído no orçamento desta revisão/)).toBeVisible();
  assert.equal((await calls()).filter((x) => x.name === "cadastrarProduto").length, 1);
  pass(
    "Invalid manual quantity blocks creation; failed inclusion retries the confirmed product once",
  );
  await go("itens-comerciais");
  await page.getByRole("button", { name: "Editar item COMP-001", exact: true }).click();
  await expect(page.getByText("Composição para 3 unidades manuais", { exact: true })).toBeVisible();
  await expect(page.getByText(/Por 1 Montagem de ancoragem industrial/).first()).toBeVisible();
  await page.getByRole("button", { name: "Editar cadastro mestre", exact: true }).click();
  await expect(
    page.getByRole("dialog", { name: "Editar cadastro mestre", exact: true }),
  ).toBeVisible();
  await page.keyboard.press("Escape");
  pass(
    "Inspector identifies revision composition base; master edit has a separate explicit surface",
  );
  await go("importacao");
  await page.getByLabel("Nome do arquivo de origem").fill("compras.xlsx");
  await page.getByLabel("Nome da aba", { exact: true }).fill("Compras");
  await page
    .getByPlaceholder("Cole aqui as colunas e linhas da planilha")
    .fill(
      "Código\tNF\tData\tQuantidade\tUnidade\tValor\nCOM-NXS-P002\t555\t02/10/2026\t2\tun\t0\nINEXISTENTE\t556\t02/10/2026\t1\tun\t10",
    );
  await page.getByRole("button", { name: "Gerar prévia", exact: true }).click();
  await expect(page.locator('.nx-import-preview [data-situacao="novo"]')).toHaveCount(1);
  await expect(page.locator('.nx-import-preview [data-situacao="incompleto"]')).toHaveCount(1);
  await page.getByRole("button", { name: "Importar 1 compra(s) pronta(s)", exact: true }).click();
  await expect(page.getByText(/1 compra\(s\) registrada\(s\)/)).toBeVisible();
  await expect(page.locator('.nx-import-preview [data-situacao="existente"]')).toHaveCount(1);
  await expect(page.getByText(/1 compra\(s\) registrada\(s\)/)).toBeVisible();
  assert.equal((await calls()).filter((x) => x.name === "registrarCompra").length, 1);
  pass(
    "Import refresh retains conclusion and identifies an already imported purchase, including zero value",
  );
  await go("itens-comerciais");
  await page.getByRole("button", { name: "Adicionar item", exact: true }).click();
  sheet = page.getByRole("dialog", { name: "Adicionar item", exact: true });
  await sheet
    .getByPlaceholder("Nome, código atual ou antigo, grupo ou medida")
    .fill("COM-NXS-P024");
  await sheet.getByRole("button", { name: /COM-NXS-P024/ }).click();
  await sheet.getByRole("radio", { name: /Somente disponibilizar/ }).check();
  await sheet.getByRole("button", { name: "Disponibilizar nesta revisão", exact: true }).click();
  await expect(sheet.getByText(/Item disponível nesta revisão, fora do orçamento/)).toBeVisible();
  assert.equal((await calls()).filter((x) => x.name === "adicionarComponenteRevisao").length, 1);
  assert.equal((await calls()).filter((x) => x.name === "incluirNaRevisao").length, 0);
  pass("Availability selects the existing availability operation, with no manual inclusion");
  await go("itens-comerciais");
  await page.getByRole("button", { name: "Adicionar item", exact: true }).click();
  sheet = page.getByRole("dialog", { name: "Adicionar item", exact: true });
  await sheet
    .getByPlaceholder("Nome, código atual ou antigo, grupo ou medida")
    .fill("COM-NXS-P024");
  await sheet.getByRole("button", { name: /COM-NXS-P024/ }).click();
  await sheet.getByRole("radio", { name: /Somente disponibilizar/ }).check();
  await page.evaluate(() => (window.__repeatAvailability = true));
  await sheet.getByRole("button", { name: "Disponibilizar nesta revisão", exact: true }).click();
  await expect(sheet.getByText(/Item já existente.*situação preservada/)).toBeVisible();
  await expect(
    sheet.getByText("Item disponível nesta revisão, fora do orçamento.", { exact: true }),
  ).toHaveCount(0);
  pass("Repeated availability confirms preserved state without claiming budget exclusion");
  await go("itens-comerciais", "zero-reference");
  await expect(page.locator(".nx-commercial-row").first()).toContainText("Sem referência de custo");
  await page.locator(".nx-cost-reference summary").click();
  await page
    .locator(".nx-cost-reference li")
    .first()
    .getByRole("button", { name: "Adotar nesta revisão", exact: true })
    .click();
  await expect(page.locator(".nx-commercial-row").first()).toContainText("informado");
  const adoption = (await calls()).find((x) => x.name === "atualizar_componentes_revisao");
  assert.equal(adoption.payload._patch.custo_adotado, 0);
  assert.equal(adoption.payload._patch.custo_origem_id, "ref-0");
  pass("A new zero reference can be adopted explicitly without becoming a missing cost");
  await go("itens-comerciais", "conflict");
  await page.locator(".nx-cost-reference summary").click();
  await expect(page.getByText(/Impacto pendente:/)).toBeVisible();
  await expect(page.getByText(/Variação do custo direto:/)).toHaveCount(0);
  pass("An unresolved save state suppresses monetary impact based on stale calculation");
  await go("produto");
  await page.getByRole("button", { name: "Registrar novo custo", exact: true }).click();
  const costDialog = page.getByRole("dialog", { name: "Registrar custo sugerido" });
  await costDialog.getByRole("button", { name: "Salvar custo", exact: true }).click();
  await expect(costDialog.getByText("Informe um custo igual ou maior que zero.")).toBeVisible();
  await costDialog.getByRole("textbox", { name: /^Custo unitário/ }).fill("0");
  await costDialog.getByLabel("Origem da referência").fill("Cotação zero informada");
  await page.evaluate(() => (window.__failNextWrite = true));
  await costDialog.getByRole("button", { name: "Salvar custo", exact: true }).click();
  await expect(costDialog.getByRole("alert")).toContainText("preservados");
  await expect(costDialog.getByRole("textbox", { name: /^Custo unitário/ })).toHaveValue("0");
  await costDialog.getByRole("button", { name: "Salvar custo", exact: true }).click();
  await expect(costDialog).toBeHidden();
  await expect(page.getByText(/Referência de R\$.*registrada no catálogo/)).toBeVisible();
  pass("Accessible cost form rejects blank, preserves failures, and confirms an explicit zero");
  await go("produto", "purchase-error");
  await page.getByRole("tab", { name: "Histórico de compras", exact: true }).click();
  await expect(page.getByText("Sem compras registradas", { exact: true })).toHaveCount(0);
  await expect(
    page
      .getByRole("tabpanel", { name: "Histórico de compras", exact: true })
      .getByText(/Falha simulada/),
  ).toBeVisible();
  await go("produto", "loading");
  await expect(page.getByText("Sem compras registradas", { exact: true })).toHaveCount(0);
  await expect(page.locator(".nx-loading").first()).toBeVisible();
  pass("Purchase loading and errors cannot be mistaken for an empty history");
  await go("produtos", "restricted");
  await expect(page.getByRole("button", { name: "Cadastrar item", exact: true })).toBeDisabled();
  await expect(page.getByText("Custo sugerido", { exact: true })).toHaveCount(0);
  await go("produtos", "empty");
  await expect(page.locator(".nx-catalog-row")).toHaveCount(0);
  await expect(page.getByText(/catálogo.*vazio|Nenhum produto cadastrado/i)).toBeVisible();
  await go("produtos");
  await page.getByRole("searchbox").fill("não existe 9999");
  await expect(
    page.getByRole("button", { name: "Limpar filtros", exact: true }).first(),
  ).toBeVisible();
  await expect(page.locator(".nx-catalog-row")).toHaveCount(0);
  pass("Restricted costs, empty catalog and filtered no-result states remain distinct");
  await page.setViewportSize({ width: 390, height: 844 });
  await go("itens-comerciais");
  await page.getByRole("button", { name: "Editar item COMP-001", exact: true }).click();
  await page.screenshot({ path: `${output}/inspector-390.png` });
  await page.getByRole("button", { name: "Editar cadastro mestre", exact: true }).click();
  await expect(
    page.getByRole("dialog", { name: "Editar cadastro mestre", exact: true }),
  ).toBeVisible();
  await noOverflow();
  await expect
    .poll(async () => {
      const box = await page
        .getByRole("dialog", { name: "Editar cadastro mestre", exact: true })
        .boundingBox();
      return !!box && Math.abs(box.x) < 2 && Math.abs(box.width - 390) < 2;
    })
    .toBe(true);
  await page.screenshot({ path: `${output}/master-editor-390.png` });
  await page.keyboard.press("Tab");
  await page.keyboard.press("Shift+Tab");
  assert.equal(
    await page
      .getByRole("dialog", { name: "Editar cadastro mestre", exact: true })
      .evaluate((e) => e.contains(document.activeElement)),
    true,
  );
  await page.keyboard.press("Escape");
  await expect(page.locator("dialog.nx-editor-inspector")).toBeVisible();
  pass("Mobile master editor is above the inspector, retains keyboard focus and returns correctly");
  assert.deepEqual(errors, []);
} finally {
  await writeFile(`${output}/checks.json`, JSON.stringify({ checks, metrics, errors }, null, 2));
  await browser.close();
}
