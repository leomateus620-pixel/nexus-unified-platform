// Explicitly authorized UI acceptance in the local PostgreSQL laboratory only.
import { chromium } from "@playwright/test";
import assert from "node:assert/strict";
import { readFile, writeFile } from "node:fs/promises";
import { PDFDocument } from "pdf-lib";
import { ids } from "./fixture.mjs";
const root = "http://127.0.0.1:4196",
  query = `cliente=${ids.client}&unidade=${ids.unit}`;
const browser = await chromium.launch({
  args: ["--use-angle=d3d11", "--enable-gpu", "--ignore-gpu-blocklist"],
});
const report = {
  checks: [],
  errors: [],
  environment: "Windows Chromium; desktop 1440x1000, celular emulado 390x844",
};
const check = (ok, label) => {
  assert.ok(ok, label);
  report.checks.push(label);
};
let p;
try {
  p = await browser.newPage({ viewport: { width: 1440, height: 1000 } });
  p.on("pageerror", (e) => report.errors.push(e.message));
  await p.goto(`${root}/nr-33/contratacao?${query}`);
  await p.getByRole("heading", { name: "Documentos contratados da unidade" }).waitFor();
  check((await p.getByRole("checkbox").count()) === 13, "Catálogo único de 13 documentos");
  check(
    await p.getByLabel(/Memorial de Cálculo/).isDisabled(),
    "Memorial obrigatório não pode ser removido",
  );
  check(
    (await p
      .getByRole("button", { name: "Confirmar documentos contratados", exact: true })
      .count()) === 0,
    "Administrador sem designação RT não altera contrato",
  );
  await p.screenshot({ path: "docs/cotrirosa/v2-nexus-contratacao.png", fullPage: true });
  await p.goto(`${root}/nr-35/contratacao?${query}`);
  await p.getByRole("heading", { name: "Documentos contratados da unidade" }).waitFor();
  check(
    (await p.getByRole("checkbox", { checked: true }).count()) === 2,
    "NR35 apresenta a mesma contratação da unidade",
  );
  await p.goto(`${root}/nr-33/equipe?${query}`);
  await p.getByRole("heading", { name: "Equipe e certificados da unidade" }).waitFor();
  const active = p.getByRole("button", { name: "Desativar vínculo", exact: true });
  if ((await active.count()) === 0) {
    await p.getByText("Vincular pessoa cadastrada", { exact: true }).click();
    await p.locator("select[name=pessoa_id]").selectOption(ids.person);
    await p
      .getByLabel("Função na unidade", { exact: true })
      .fill("Operação - fixture de interface");
    await p.getByRole("button", { name: "Confirmar vínculo", exact: true }).click();
    await active.waitFor();
  }
  check((await active.count()) === 1, "Vínculo explícito de pessoa confirmado na unidade");
  await p.screenshot({ path: "docs/cotrirosa/v2-nexus-equipe.png", fullPage: true });
  await p.goto(`${root}/nr-33/pets?${query}`);
  await p.getByRole("button", { name: "Operação real", exact: true }).click();
  await p.getByRole("button", { name: "Acompanhar ao vivo", exact: true }).click();
  check(
    (await p.getByRole("button", { name: "Ao vivo · atualização em 5 s", exact: true }).count()) ===
      1,
    "Consulta ao vivo disponível sem comando operacional",
  );
  const csvWait = p.waitForEvent("download");
  await p.getByRole("button", { name: "Exportar CSV do filtro", exact: true }).click();
  const csv = await csvWait;
  await csv.saveAs("docs/cotrirosa/v2-historico-fixture.csv");
  check(
    (await readFile("docs/cotrirosa/v2-historico-fixture.csv", "utf8")).includes("PET ID"),
    "CSV contém identidade canônica",
  );
  await p.getByText("Identificação QR · quatro placas por A4", { exact: true }).click();
  const qr = p
    .locator("details")
    .filter({ has: p.getByText("Identificação QR · quatro placas por A4", { exact: true }) });
  for (let i = 0; i < 5; i++) await qr.getByRole("checkbox").nth(i).check();
  const qrWait = p.waitForEvent("download");
  await p.getByRole("button", { name: "Gerar PDF (5)", exact: true }).click();
  const download = await qrWait;
  await download.saveAs("docs/cotrirosa/qr-fixture.pdf");
  check(
    (await PDFDocument.load(await readFile("docs/cotrirosa/qr-fixture.pdf"))).getPageCount() === 2,
    "Cinco locais em duas folhas A4, quatro por página",
  );
  await p.getByText("Impressão e formulário em branco", { exact: true }).click();
  await p.getByLabel("Modelo para impressão").selectOption({ index: 1 });
  await p.getByRole("button", { name: "Baixar formulário em branco", exact: true }).click();
  await p
    .getByRole("alert")
    .filter({ hasText: "Layout de impressão ainda não aprovado" })
    .waitFor();
  check(true, "Formulário sem layout aprovado bloqueado no backend");
  await p.getByRole("link", { name: "Somente leitura · gestor", exact: true }).first().click();
  await p.getByRole("heading", { name: "Ao vivo · presenças registradas", exact: true }).waitFor();
  check(
    (await p
      .getByRole("button", { name: /Salvar rascunho|Emitir PET|Registrar entrada/ })
      .count()) === 0,
    "Link do gestor abre consulta sem ações operacionais",
  );
  await p.screenshot({ path: "docs/cotrirosa/v2-nexus-ao-vivo.png", fullPage: true });
  const mobile = await browser.newContext({
    viewport: { width: 390, height: 844 },
    deviceScaleFactor: 1,
    isMobile: true,
    hasTouch: true,
  });
  const m = await mobile.newPage();
  await m.goto(`${root}/nr-35/contratacao?${query}`);
  await m.getByRole("heading", { name: "Documentos contratados da unidade" }).waitFor();
  check(
    await m.evaluate(() => document.documentElement.scrollWidth <= innerWidth + 1),
    "Contratação sem transbordamento horizontal no celular emulado",
  );
  check(
    (await m.getByLabel("Área do módulo", { exact: true }).inputValue()) === "contratacao",
    "Menu móvel mantém área de contratação",
  );
  await m.screenshot({ path: "docs/cotrirosa/v2-nexus-mobile.png", fullPage: true });
  await mobile.close();
  check(report.errors.length === 0, "Sem erros de execução JavaScript");
  await writeFile("docs/cotrirosa/v2-ui-results.json", JSON.stringify(report, null, 2));
  console.log(JSON.stringify(report));
} catch (e) {
  if (p) await p.screenshot({ path: "docs/cotrirosa/v2-ui-failure.png", fullPage: true });
  throw e;
} finally {
  await browser.close();
}
