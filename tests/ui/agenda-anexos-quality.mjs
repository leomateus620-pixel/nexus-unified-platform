// Actual AgendaDetail/RecordFiles source, isolated mutable transport only.
// Delayed mocks intentionally deliver after a parent change or access error.
import { chromium, expect } from "@playwright/test";
import { mkdir, writeFile } from "node:fs/promises";
import { evidenceRoot } from "./evidence.mjs";

const base = process.env.NEXUS_UI_URL || "http://127.0.0.1:4209";
const directory = `${evidenceRoot}/agenda-anexos`;
await mkdir(directory, { recursive: true });
const browser = await chromium.launch({
  headless: true,
  ...(process.env.NEXUS_UI_BROWSER_EXECUTABLE
    ? { executablePath: process.env.NEXUS_UI_BROWSER_EXECUTABLE }
    : {}),
});
const page = await browser.newPage({ locale: "pt-BR", reducedMotion: "reduce" });
page.setDefaultTimeout(10000);
const report = {
  method:
    "Actual AgendaDetail/RecordFiles source with synthetic mutable transport and deliberate late responses. Not connected Auth/SQL/RLS/Storage HTTP, operational persistence, deployment or physical-device evidence.",
  layouts: [],
  checks: [],
  errors: [],
  consoleErrors: [],
  success: false,
};
page.on("pageerror", (error) => report.errors.push(error.message));
page.on("console", (message) => {
  if (message.type() === "error") report.consoleErrors.push(message.text());
});
const event = "a6000000-0000-4000-8000-000000000001";
const second = "a6000000-0000-4000-8000-000000000002";
const file = {
  name: "evidencia-do-compromisso-isolado.png",
  mimeType: "image/png",
  buffer: Buffer.from(
    "iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mP8/x8AAwMCAO+aIOsAAAAASUVORK5CYII=",
    "base64",
  ),
};
const files = page.getByRole("region", { name: "Arquivos privados", exact: true });
const input = () => files.getByLabel("Adicionar PDF ou imagem (até 20 MB)", { exact: true });
async function go() {
  await page.goto(`${base}/?page=agenda-equipe&data=2026-11-10&vista=lista&evento=${event}`, {
    waitUntil: "networkidle",
  });
  await expect(files.getByText("Nenhum arquivo vinculado.", { exact: true })).toBeVisible();
}
async function check(name, work) {
  await work();
  report.checks.push({ name, pass: true });
  console.log("PASS: " + name);
}
async function patch(values) {
  await page.evaluate((v) => {
    Object.assign(window, v);
    window.dispatchEvent(new Event("visibilitychange"));
  }, values);
}
async function calls(name) {
  return page.evaluate(
    (key) => window.__nexusCalls.filter((call) => call.name === key).map((c) => c.payload.data),
    name,
  );
}
async function release(kind) {
  await page.evaluate((key) => window[`__releaseAnexo${key}`](), kind);
  await expect.poll(() => page.evaluate((key) => window[`__anexo${key}Returned`], kind)).toBe(true);
  await page.evaluate(
    () => new Promise((r) => requestAnimationFrame(() => requestAnimationFrame(r))),
  );
}
async function secondParent() {
  await page.getByRole("button", { name: "Voltar à agenda", exact: true }).first().click();
  await expect(files).toHaveCount(0);
  await page.getByRole("button", { name: /^Reunião de coordenação com título extenso/ }).click();
  await expect(page).toHaveURL(new RegExp(`evento=${second}`));
  await expect(files.getByText("Nenhum arquivo vinculado.", { exact: true })).toBeVisible();
}
async function pending() {
  await page.evaluate(() => {
    window.__anexoConfirmFailure = true;
  });
  await input().setInputFiles(file);
  await expect(files.getByRole("button", { name: "Reverificar envio", exact: true })).toBeVisible();
}
async function cancelForm() {
  await files.getByRole("button", { name: "Cancelar envio pendente", exact: true }).click();
  const reason = files.getByRole("textbox", { name: "Motivo do cancelamento", exact: true });
  await reason.fill("Remover tentativa de arquivo incorreto do compromisso");
  return reason;
}

try {
  for (const width of [360, 390, 430, 768, 1366, 1920]) {
    await page.setViewportSize({ width, height: width < 768 ? 844 : 900 });
    await go();
    await pending();
    await cancelForm();
    const metrics = await page.evaluate(() => ({
      width: innerWidth,
      scrollWidth: document.documentElement.scrollWidth,
    }));
    expect(metrics.scrollWidth).toBeLessThanOrEqual(width);
    report.layouts.push({ name: "agenda-private-file-pending", ...metrics });
    if ([390, 1366].includes(width)) {
      await files.scrollIntoViewIfNeeded();
      await page.screenshot({ path: `${directory}/arquivo-pendente-${width}.png` });
    }
    const [upload] = await calls("prepararUpload");
    expect(upload.pai.agenda_evento_id).toBe(event);
    expect(upload.pai.pessoa_id).toBeNull();
    expect(upload.pai.acao_id).toBeNull();
  }
  await page.setViewportSize({ width: 390, height: 844 });
  await check("late staging never confirms or appears on the next event", async () => {
    await go();
    await patch({ __anexoPrepareDeferred: true });
    await input().setInputFiles(file);
    await expect
      .poll(() => page.evaluate(() => typeof window.__releaseAnexoPrepare))
      .toBe("function");
    await secondParent();
    await release("Prepare");
    expect(await calls("confirmarUpload")).toHaveLength(0);
    await expect(files.getByText(file.name, { exact: true })).toHaveCount(0);
    await expect(files.getByText("Arquivo confirmado.", { exact: true })).toHaveCount(0);
  });
  await check(
    "late staging after a failed parent revalidation remains recoverable and unconfirmed",
    async () => {
      await go();
      await patch({ __anexoPrepareDeferred: true });
      await input().setInputFiles(file);
      await expect
        .poll(() => page.evaluate(() => typeof window.__releaseAnexoPrepare))
        .toBe("function");
      await patch({ __anexosReadError: true });
      await expect(files.getByRole("alert")).toContainText(
        "Não foi possível atualizar os arquivos privados",
      );
      await release("Prepare");
      expect(await calls("confirmarUpload")).toHaveLength(0);
      await expect(input()).toHaveCount(0);
      await page.evaluate(() => {
        window.__anexosReadError = false;
      });
      await files.getByRole("button", { name: "Tentar novamente", exact: true }).click();
      await expect(
        files.getByRole("button", { name: "Reverificar envio", exact: true }),
      ).toBeVisible();
    },
  );
  await check("late confirmation cannot update another event's files or feedback", async () => {
    await go();
    await patch({ __anexoConfirmDeferred: true });
    await input().setInputFiles(file);
    await expect
      .poll(() => page.evaluate(() => typeof window.__releaseAnexoConfirm))
      .toBe("function");
    await secondParent();
    await release("Confirm");
    await expect(files.getByText(file.name, { exact: true })).toHaveCount(0);
    await expect(files.getByText("Arquivo confirmado.", { exact: true })).toHaveCount(0);
    await expect(files.getByText("Nenhum arquivo vinculado.", { exact: true })).toBeVisible();
  });
  await check(
    "late confirmation cannot reveal cached metadata after current access query fails",
    async () => {
      await go();
      await patch({ __anexoConfirmDeferred: true });
      await input().setInputFiles(file);
      await expect
        .poll(() => page.evaluate(() => typeof window.__releaseAnexoConfirm))
        .toBe("function");
      await patch({ __anexosReadError: true });
      await expect(files.getByRole("alert")).toContainText(
        "Não foi possível atualizar os arquivos privados",
      );
      await release("Confirm");
      await expect(files.getByText(file.name, { exact: true })).toHaveCount(0);
      await expect(files.getByText("Arquivo confirmado.", { exact: true })).toHaveCount(0);
      await expect(files.getByRole("button", { name: "Baixar", exact: true })).toHaveCount(0);
    },
  );
  await check("late cancellation cannot clear or focus the next event's file section", async () => {
    await go();
    await pending();
    await cancelForm();
    await patch({ __anexoCancelDeferred: true });
    await files.getByRole("button", { name: "Confirmar cancelamento", exact: true }).click();
    await expect
      .poll(() => page.evaluate(() => typeof window.__releaseAnexoCancel))
      .toBe("function");
    await secondParent();
    await release("Cancel");
    await expect(files.getByText(/Envio pendente cancelado/)).toHaveCount(0);
    await expect(files).not.toBeFocused();
    await expect(files.getByText("Nenhum arquivo vinculado.", { exact: true })).toBeVisible();
  });
  await check(
    "cleanup uses its own current permission after new uploads are closed; network failure preserves reason",
    async () => {
      await go();
      await pending();
      await patch({ __anexoCanAdd: false, __anexoCanCancel: true });
      await expect(input()).toHaveCount(0);
      await expect(
        files.getByRole("button", { name: "Reverificar envio", exact: true }),
      ).toHaveCount(0);
      const reason = await cancelForm();
      await page.evaluate(() => {
        window.__failNextWrite = true;
      });
      await files.getByRole("button", { name: "Confirmar cancelamento", exact: true }).click();
      await expect(files.getByRole("alert")).toContainText("Falha de rede simulada");
      await expect(reason).toHaveValue("Remover tentativa de arquivo incorreto do compromisso");
      await files.getByRole("button", { name: "Confirmar cancelamento", exact: true }).click();
      await expect(files.getByText("Nenhum arquivo vinculado.", { exact: true })).toBeVisible();
      await expect(files).toBeFocused();
      const requests = await calls("cancelarAnexo");
      expect(requests).toHaveLength(2);
      expect(requests[0].chave).toBe(requests[1].chave);
      await expect(input()).toHaveCount(0);
      await page.screenshot({ path: `${directory}/limpeza-apos-fechamento-390.png` });
    },
  );
  expect(report.errors).toEqual([]);
  expect(report.consoleErrors).toEqual([]);
  report.success = true;
} catch (error) {
  report.failure = String(error);
  await page.screenshot({ path: `${directory}/failure.png` });
  throw error;
} finally {
  await writeFile(`${directory}/results.json`, `${JSON.stringify(report, null, 2)}\n`);
  await browser.close();
}
