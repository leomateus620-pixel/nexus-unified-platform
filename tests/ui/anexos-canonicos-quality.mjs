// Actual RecordFiles component with a synthetic transport; no Auth/SQL/Storage proof.
import { chromium, expect } from "@playwright/test";
import { mkdir, writeFile } from "node:fs/promises";
import { evidenceRoot } from "./evidence.mjs";

const base = process.env.NEXUS_UI_URL || "http://127.0.0.1:4182";
const directory = `${evidenceRoot}/anexos-canonicos`;
await mkdir(directory, { recursive: true });
const browser = await chromium.launch({ headless: true });
const page = await browser.newPage({ locale: "pt-BR", reducedMotion: "reduce" });
page.setDefaultTimeout(10000);
const report = {
  method:
    "Actual RecordFiles source with test-only transport fixtures; not real Auth, SQL/RLS, Storage HTTP, operational persistence or physical-device evidence",
  layouts: [],
  checks: [],
  errors: [],
  success: false,
};
page.on("pageerror", (error) => report.errors.push(error.message));
const file = {
  name: "evidencia-condicao-da-ferramenta-com-nome-longo-para-validar-quebra.png",
  mimeType: "image/png",
  buffer: Buffer.from(
    "iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mP8/x8AAwMCAO+aIOsAAAAASUVORK5CYII=",
    "base64",
  ),
};
const files = page.getByRole("region", { name: "Arquivos privados", exact: true });
async function go() {
  await page.goto(`${base}/?page=equipe`, { waitUntil: "networkidle" });
  await page
    .getByRole("region", { name: "Pessoas operacionais", exact: true })
    .getByRole("button", { name: "Abrir", exact: true })
    .first()
    .click();
  await expect(files.getByText("Nenhum arquivo vinculado.", { exact: true })).toBeVisible();
}
async function check(name, work) {
  await work();
  report.checks.push({ name, pass: true });
}
async function focusRefetch(patch) {
  await page.evaluate((values) => {
    Object.assign(window, values);
    window.dispatchEvent(new Event("visibilitychange"));
  }, patch);
}
async function pending() {
  await page.evaluate(() => {
    window.__anexoConfirmFailure = true;
  });
  await files
    .getByLabel("Adicionar PDF ou imagem (até 20 MB)", { exact: true })
    .setInputFiles(file);
  await expect(files.getByRole("button", { name: "Reverificar envio", exact: true })).toBeVisible();
}
try {
  for (const width of [360, 390, 768, 1024, 1366, 1440]) {
    await page.setViewportSize({ width, height: width < 768 ? 844 : 900 });
    await go();
    await pending();
    await files.getByRole("button", { name: "Cancelar envio pendente", exact: true }).click();
    const metrics = await page.evaluate(() => ({
      width: innerWidth,
      scrollWidth: document.documentElement.scrollWidth,
    }));
    expect(metrics.scrollWidth, `pending file at ${width}px`).toBeLessThanOrEqual(width);
    report.layouts.push({ name: "pending-with-cancellation", ...metrics });
    if ([390, 1366].includes(width)) {
      await files.scrollIntoViewIfNeeded();
      await page.screenshot({ path: `${directory}/pendente-${width}.png` });
    }
  }
  await page.setViewportSize({ width: 390, height: 844 });
  await check(
    "cancel validates reason, preserves it after failure and restores section focus",
    async () => {
      await go();
      await pending();
      await files.getByRole("button", { name: "Cancelar envio pendente", exact: true }).click();
      await files.getByRole("button", { name: "Confirmar cancelamento", exact: true }).click();
      const reason = files.getByRole("textbox", { name: "Motivo do cancelamento", exact: true });
      await expect(reason).toBeFocused();
      await expect(reason).toHaveAttribute("aria-invalid", "true");
      await reason.fill("Substituir evidência enviada por engano");
      await page.evaluate(() => {
        window.__failNextWrite = true;
      });
      await files.getByRole("button", { name: "Confirmar cancelamento", exact: true }).click();
      await expect(files.getByRole("alert").first()).toContainText("Falha de rede simulada");
      await expect(reason).toHaveValue("Substituir evidência enviada por engano");
      await files.getByRole("button", { name: "Confirmar cancelamento", exact: true }).click();
      await expect(files.getByText("Nenhum arquivo vinculado.", { exact: true })).toBeVisible();
      await expect(files).toBeFocused();
      const keys = await page.evaluate(() =>
        window.__nexusCalls
          .filter((call) => call.name === "cancelarAnexo")
          .map((call) => call.payload.data.chave),
      );
      expect(keys).toHaveLength(2);
      expect(keys[0]).toBe(keys[1]);
    },
  );
  await check("new selection after cancellation uses a new intention key", async () => {
    await pending();
    const uploads = await page.evaluate(() =>
      window.__nexusCalls
        .filter((call) => call.name === "prepararUpload")
        .map((call) => call.payload.data.chave),
    );
    expect(uploads).toHaveLength(2);
    expect(uploads[0]).not.toBe(uploads[1]);
    const rows = await page.evaluate(() => window.__nexusOperational.anexos);
    expect(rows.map((row) => row.estado)).toEqual(["cancelado", "pendente"]);
  });
  await check(
    "resume accepts renamed original bytes, preserves metadata and does not prepare a second record",
    async () => {
      await files
        .getByLabel(`Retomar envio de ${file.name}`, { exact: true })
        .setInputFiles({ ...file, name: "original-renomeado-localmente.png" });
      await expect(files.getByRole("alert").first()).toContainText("Falha de confirmação");
      const state = await page.evaluate(() => ({
        uploads: window.__nexusCalls.filter((call) => call.name === "prepararUpload").length,
        last: window.__nexusOperational.anexos.at(-1),
      }));
      expect(state.uploads).toBe(2);
      expect(state.last.nome).toBe(file.name);
      expect(state.last.estado).toBe("pendente");
      await page.evaluate(() => {
        window.__anexoConfirmFailure = false;
      });
      await files.getByRole("button", { name: "Reverificar envio", exact: true }).click();
      await expect(files.getByText(/Armazenamento confirmado/)).toBeVisible();
      await expect(files.getByRole("button", { name: "Baixar", exact: true })).toBeVisible();
    },
  );
  await check(
    "current parent capability hides upload and recovery after focus revalidation",
    async () => {
      await focusRefetch({ __anexoCanAdd: false });
      await expect(
        files.getByLabel("Adicionar PDF ou imagem (até 20 MB)", { exact: true }),
      ).toHaveCount(0);
      await expect(
        files.getByRole("button", { name: "Cancelar envio pendente", exact: true }),
      ).toHaveCount(0);
      await expect(files.getByRole("button", { name: "Baixar", exact: true })).toBeVisible();
    },
  );
  await check("query failure hides cached filenames and upload, then retry recovers", async () => {
    await focusRefetch({ __anexosReadError: true });
    await expect(files.getByRole("alert")).toContainText(
      "Não foi possível atualizar os arquivos privados",
    );
    await expect(files.getByRole("listitem").filter({ hasText: file.name })).toHaveCount(0);
    await expect(files.getByRole("button", { name: "Baixar", exact: true })).toHaveCount(0);
    await expect(
      files.getByLabel("Adicionar PDF ou imagem (até 20 MB)", { exact: true }),
    ).toHaveCount(0);
    await page.screenshot({ path: `${directory}/erro-cache-390.png` });
    await page.evaluate(() => {
      window.__anexosReadError = false;
      window.__anexoCanAdd = true;
    });
    await files.getByRole("button", { name: "Tentar novamente", exact: true }).click();
    await expect(files.getByRole("listitem").filter({ hasText: file.name })).toBeVisible();
    await expect(
      files.getByLabel("Adicionar PDF ou imagem (até 20 MB)", { exact: true }),
    ).toBeVisible();
  });
  expect(report.errors).toEqual([]);
  report.success = true;
} catch (error) {
  report.failure = String(error);
  await page.screenshot({ path: `${directory}/failure.png` });
  throw error;
} finally {
  await writeFile(`${directory}/results.json`, `${JSON.stringify(report, null, 2)}\n`);
  await browser.close();
}
