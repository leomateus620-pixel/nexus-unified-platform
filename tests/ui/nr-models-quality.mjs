// Actual source UI, synthetic transport only. This never writes connected Auth, SQL or Storage.
import { chromium, expect } from "@playwright/test";
import { mkdir, writeFile } from "node:fs/promises";
import { evidenceRoot } from "./evidence.mjs";
const directory = `${evidenceRoot}/nr-modelos`;
await mkdir(directory, { recursive: true });
const browser = await chromium.launch({ headless: true });
const page = await browser.newPage({
  locale: "pt-BR",
  reducedMotion: "reduce",
  viewport: { width: 390, height: 844 },
});
const report = {
  method: "Actual source UI with synthetic laboratory transport; no real persistence claim",
  checks: [],
  errors: [],
  success: false,
};
page.on("pageerror", (error) => report.errors.push(error.message));
const base = process.env.NEXUS_UI_URL || "http://127.0.0.1:4190";
const model = "33000000-0000-4000-8000-000000000007";
const modelVersion = "34000000-0000-4000-8000-000000000007";
const local = "33000000-0000-4000-8000-000000000001";
const client = "20000000-0000-4000-8000-000000000001";
const unit = "21000000-0000-4000-8000-000000000001";
const title = "Documento derivado do modelo na fixture isolada";
async function check(name, work) {
  await work();
  report.checks.push({ name, pass: true });
}
try {
  await page.goto(`${base}/?page=nr-33&nrPath=documentos&cliente=${client}&unidade=${unit}`, {
    waitUntil: "domcontentloaded",
  });
  await page.getByRole("heading", { name: "Espaços confinados", exact: true }).waitFor();
  await check(
    "model creation chooses an exact version and previews it without resolving fields in the browser",
    async () => {
      await page.getByRole("button", { name: "Criar documento", exact: true }).click();
      const dialog = page.getByRole("dialog", { name: "Criar documento", exact: true });
      await dialog
        .getByRole("combobox", { name: "Conteúdo inicial", exact: true })
        .selectOption("modelo");
      await dialog.getByRole("textbox", { name: "Título", exact: false }).first().fill(title);
      await dialog.getByRole("combobox", { name: "Local", exact: true }).selectOption(local);
      await dialog
        .getByRole("combobox", { name: "Modelo de documento", exact: false })
        .selectOption(model);
      const version = dialog.getByRole("combobox", { name: "Versão do modelo", exact: false });
      await expect(version.locator(`option[value="${modelVersion}"]`)).toHaveCount(1);
      expect(
        await page.evaluate(() =>
          window.__nexusCalls.some((call) => call.name === "nrRevisaoDetalhe"),
        ),
      ).toBe(false);
      await version.selectOption(modelVersion);
      await expect(
        dialog.getByText("Prévia do conteúdo que será copiado · 3 blocos", { exact: true }),
      ).toBeVisible();
      await dialog
        .getByText("Prévia do conteúdo que será copiado · 3 blocos", { exact: true })
        .click();
      await expect(
        dialog.getByRole("heading", { name: "Conteúdo copiado do modelo sintético", exact: true }),
      ).toBeVisible();
      expect(
        await page.evaluate(() =>
          window.__nexusCalls.some((call) => call.name === "nrDocumentoCampos"),
        ),
      ).toBe(false);
      const bound = await dialog.boundingBox();
      expect(bound.x).toBeGreaterThanOrEqual(0);
      expect(bound.y).toBeGreaterThanOrEqual(0);
      expect(bound.x + bound.width).toBeLessThanOrEqual(391);
      expect(bound.y + bound.height).toBeLessThanOrEqual(845);
      expect(await page.evaluate(() => document.documentElement.scrollWidth)).toBeLessThanOrEqual(
        390,
      );
      await page.screenshot({ path: `${directory}/modelo-versao-390.png` });
      await dialog
        .getByRole("checkbox", { name: /Compreendo que será criado um rascunho/ })
        .check();
      await dialog.getByRole("button", { name: "Salvar registro", exact: true }).click();
      await expect(dialog).toHaveCount(0);
      const sent = await page.evaluate(
        () =>
          window.__nexusCalls.filter((call) => call.name === "nrDocumentoDeModelo").at(-1)?.data,
      );
      expect(sent.dados.modelo_id).toBe(model);
      expect(sent.dados.modelo_versao_id).toBe(modelVersion);
      expect(sent.dados.local_id).toBe(local);
      expect(sent.dados.usar_rascunho).toBe(true);
      expect(sent.dados).not.toHaveProperty("conteudo");
      expect(sent.dados).not.toHaveProperty("estado");
      await page.getByRole("link", { name: new RegExp(`^${title}`) }).click();
      await expect(page.getByRole("heading", { name: title, exact: true })).toBeVisible();
      await expect(page.getByText("EC 13A", { exact: true })).toBeVisible();
      await expect(
        page.getByText("Unidade de testes de apresentação", { exact: true }).last(),
      ).toBeVisible();
    },
  );
  await check(
    "captured source can be refreshed but manual replacement requires a reason and preserves its source",
    async () => {
      await page.getByRole("button", { name: "Editar registro", exact: true }).click();
      const dialog = page.getByRole("dialog", { name: "Editar documento", exact: true });
      const field = dialog.locator(".nr-content-block").nth(1);
      await field.getByRole("button", { name: "Capturar valor da base", exact: true }).click();
      await expect(
        field.getByRole("textbox", { name: "Valor preservado nesta revisão", exact: true }),
      ).toHaveValue("EC 13A");
      await field.getByRole("button", { name: "Substituir manualmente", exact: true }).click();
      await field
        .getByRole("textbox", { name: "Valor preservado nesta revisão", exact: true })
        .fill("EC 13A — apresentação ajustada");
      await dialog.getByRole("button", { name: "Salvar registro", exact: true }).click();
      await expect(dialog).toBeVisible();
      const reason = field.getByRole("textbox", {
        name: "Motivo da substituição manual",
        exact: false,
      });
      await expect(reason).toBeFocused();
      await reason.fill("Ajuste editorial documentado na fixture isolada.");
      await page.keyboard.press("Tab");
      expect(await dialog.evaluate((element) => element.contains(document.activeElement))).toBe(
        true,
      );
      await page.screenshot({ path: `${directory}/substituicao-motivada-390.png` });
      await dialog.getByRole("button", { name: "Salvar registro", exact: true }).click();
      await expect(dialog).toHaveCount(0);
      await expect(page.getByText("EC 13A — apresentação ajustada", { exact: true })).toBeVisible();
      await expect(
        page.getByText("Substituição manual: Ajuste editorial documentado na fixture isolada.", {
          exact: true,
        }),
      ).toBeVisible();
    },
  );
  expect(report.errors).toEqual([]);
  report.success = true;
} catch (error) {
  report.failure = String(error);
  throw error;
} finally {
  await writeFile(`${directory}/results.json`, JSON.stringify(report, null, 2));
  await browser.close();
}
