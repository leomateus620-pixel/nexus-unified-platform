// Real source UI and isolated transport fixtures; no connected Auth/SQL/Storage proof.
import { chromium, expect } from "@playwright/test";
import { mkdir, writeFile } from "node:fs/promises";
import { evidenceRoot } from "./evidence.mjs";

const base = process.env.NEXUS_UI_URL || "http://127.0.0.1:4182";
const directory = evidenceRoot + "/pe-arquivos";
await mkdir(directory, { recursive: true });
const browser = await chromium.launch({ headless: true });
const page = await browser.newPage({ locale: "pt-BR", reducedMotion: "reduce" });
page.setDefaultTimeout(10000);
const project = "40000000-0000-4000-8000-000000000001";
const v1 = "41000000-0000-4000-8000-000000000001";
const v2 = "41000000-0000-4000-8000-000000000002";
const report = {
  method: "UI source with isolated fixtures; not remote persistence, Auth, RLS or Storage HTTP E2E",
  checks: [],
  errors: [],
  success: false,
};
page.on("pageerror", (error) => report.errors.push(error.message));
function files() {
  return page
    .getByRole("heading", { name: "Originais e referências desta versão", exact: true })
    .locator("xpath=ancestor::section[1]");
}
const add = () => files().getByLabel("Adicionar original ou referência (PDF/imagem, até 20 MiB)");
async function refresh() {
  await page.evaluate(() => window.dispatchEvent(new Event("visibilitychange")));
}
async function go() {
  await page.goto(base + "/?page=projetos-engenharia&projeto=" + project, {
    waitUntil: "domcontentloaded",
  });
  await expect(
    files().getByText("Nenhum arquivo vinculado a esta versão.", { exact: true }),
  ).toBeVisible();
  await expect(add()).toBeVisible();
}
async function seed() {
  await page.evaluate(
    ({ project, v1, v2 }) => {
      const common = {
        organization_id: "10000000-0000-4000-8000-000000000001",
        projeto_id: project,
        mime: "application/pdf",
        tamanho: 123,
        caminho: "fixture-private-only",
        created_by: "00000000-0000-4000-8000-000000000001",
        created_at: "2026-10-22T12:00:00Z",
        confirmado_em: "2026-10-22T12:00:01Z",
      };
      window.__nexusPeArquivos.push(
        {
          ...common,
          id: "44000000-0000-4000-8000-000000000001",
          versao_id: v1,
          nome: "original-v1-preservado.pdf",
          sha256: "1".repeat(64),
          estado: "vinculado",
        },
        {
          ...common,
          id: "44000000-0000-4000-8000-000000000002",
          versao_id: v2,
          nome: "original-v2-atual.pdf",
          sha256: "2".repeat(64),
          estado: "vinculado",
        },
        {
          ...common,
          id: "44000000-0000-4000-8000-000000000003",
          versao_id: v2,
          nome: "pendencia-v2-retomavel.pdf",
          sha256: "3".repeat(64),
          estado: "pendente",
          confirmado_em: null,
        },
      );
    },
    { project, v1, v2 },
  );
  await refresh();
  await expect(files().getByText("original-v2-atual.pdf", { exact: true })).toBeVisible();
}
async function check(name, work) {
  await work();
  report.checks.push({ name, pass: true });
}
try {
  await check(
    "failed revalidation hides cached private metadata, upload and cancellation with focus",
    async () => {
      await go();
      await seed();
      await files().getByRole("button", { name: "Cancelar envio pendente", exact: true }).click();
      await files()
        .getByLabel("Motivo do cancelamento", { exact: true })
        .fill("Motivo local temporário");
      await page.evaluate(() => {
        window.__peFileQueryError = "denied";
      });
      await refresh();
      await expect(files().getByRole("alert")).toContainText(
        "Arquivo indisponível para seu acesso atual.",
      );
      await expect(files().getByText("original-v2-atual.pdf", { exact: true })).toHaveCount(0);
      await expect(files().getByText("pendencia-v2-retomavel.pdf", { exact: true })).toHaveCount(0);
      await expect(add()).toHaveCount(0);
      await expect(files().getByLabel("Motivo do cancelamento", { exact: true })).toHaveCount(0);
      await expect
        .poll(() =>
          files()
            .locator('[tabindex="-1"]')
            .evaluate((element) => element === document.activeElement),
        )
        .toBe(true);
    },
  );

  await check(
    "network query failure hides stale metadata and safe recovery restores the existing pending upload",
    async () => {
      await go();
      await seed();
      await page.evaluate(() => {
        window.__peFileQueryError = "network";
      });
      await refresh();
      await expect(files().getByRole("alert")).toContainText("Não foi possível atualizar");
      await expect(files().getByText("original-v2-atual.pdf", { exact: true })).toHaveCount(0);
      await expect(add()).toHaveCount(0);
      await page.evaluate(() => {
        window.__peFileQueryError = false;
      });
      await files().getByRole("button", { name: "Tentar novamente", exact: true }).click();
      await expect(files().getByText("pendencia-v2-retomavel.pdf", { exact: true })).toBeVisible();
      await expect(
        files().getByRole("button", { name: "Reverificar armazenamento", exact: true }),
      ).toBeVisible();
      expect(
        await page.evaluate(
          () => window.__nexusPeArquivos.filter((a) => a.estado === "pendente").length,
        ),
      ).toBe(1);
    },
  );

  await check(
    "current read permission keeps download while removing upload and pending mutations",
    async () => {
      await go();
      await seed();
      await page.evaluate(() => {
        window.__peFilesReadOnly = true;
      });
      await refresh();
      await expect(add()).toHaveCount(0);
      await expect(
        files().getByRole("button", { name: "Baixar original autorizado", exact: true }),
      ).toBeVisible();
      await expect(
        files().getByRole("button", { name: "Reverificar armazenamento", exact: true }),
      ).toHaveCount(0);
      await expect(
        files().getByRole("button", { name: "Cancelar envio pendente", exact: true }),
      ).toHaveCount(0);
    },
  );

  await check(
    "switching versions isolates original metadata, local cancellation state and permissions",
    async () => {
      await go();
      await seed();
      await files().getByRole("button", { name: "Cancelar envio pendente", exact: true }).click();
      await files()
        .getByLabel("Motivo do cancelamento", { exact: true })
        .fill("Rascunho exclusivo V2");
      await page.getByRole("button", { name: /^V1 · congelada/ }).click();
      await expect(files().getByText("original-v1-preservado.pdf", { exact: true })).toBeVisible();
      await expect(files().getByText("original-v2-atual.pdf", { exact: true })).toHaveCount(0);
      await expect(add()).toHaveCount(0);
      await expect(files().getByLabel("Motivo do cancelamento", { exact: true })).toHaveCount(0);
      await page.getByRole("button", { name: /^V2 · rascunho/ }).click();
      await expect(files().getByText("original-v2-atual.pdf", { exact: true })).toBeVisible();
      await expect(files().getByText("original-v1-preservado.pdf", { exact: true })).toHaveCount(0);
      await expect(files().getByLabel("Motivo do cancelamento", { exact: true })).toHaveCount(0);
      await expect(add()).toBeVisible();
    },
  );

  await check(
    "confirmation failure preserves one staged original and retries its identity",
    async () => {
      await go();
      await page.evaluate(() => {
        window.__peFileConfirmError = true;
      });
      await add().setInputFiles({
        name: "retomada-segura.pdf",
        mimeType: "application/pdf",
        buffer: Buffer.from("%PDF-1.7\nisolated-ui-upload\n"),
      });
      await expect(files().getByRole("alert")).toContainText("Falha de confirmação");
      await expect(files().getByText("retomada-segura.pdf", { exact: true })).toBeVisible();
      const originalId = await page.evaluate(() => window.__nexusPeArquivos[0].id);
      await page.evaluate(() => {
        window.__peFileConfirmError = false;
      });
      await files().getByRole("button", { name: "Reverificar armazenamento", exact: true }).click();
      await expect(
        files().getByRole("button", { name: "Baixar original autorizado", exact: true }),
      ).toBeVisible();
      expect(
        await page.evaluate(() =>
          window.__nexusPeArquivos.map((a) => ({ id: a.id, estado: a.estado })),
        ),
      ).toEqual([{ id: originalId, estado: "vinculado" }]);
      expect(
        await page.evaluate(
          () => window.__nexusCalls.filter((c) => c.name === "prepararArquivoPe").length,
        ),
      ).toBe(1);
    },
  );

  await check(
    "cancelled staging gets a new upload intention without changing the cancelled original",
    async () => {
      await go();
      await page.evaluate(() => {
        window.__peFileConfirmError = true;
      });
      const file = {
        name: "nova-intencao.pdf",
        mimeType: "application/pdf",
        buffer: Buffer.from("%PDF-1.7\ncancel-and-retry\n"),
      };
      await add().setInputFiles(file);
      await expect(files().getByRole("alert")).toContainText("Falha de confirmação");
      await files().getByRole("button", { name: "Cancelar envio pendente", exact: true }).click();
      await files()
        .getByLabel("Motivo do cancelamento", { exact: true })
        .fill("Substituir a intenção pendente");
      await files().getByRole("button", { name: "Confirmar cancelamento", exact: true }).click();
      await expect(
        files().getByText("Nenhum arquivo vinculado a esta versão.", { exact: true }),
      ).toBeVisible();
      await add().setInputFiles(file);
      await expect(files().getByText("nova-intencao.pdf", { exact: true })).toBeVisible();
      const result = await page.evaluate(() => ({
        keys: window.__nexusCalls
          .filter((c) => c.name === "prepararArquivoPe")
          .map((c) => c.payload.data.chave),
        states: window.__nexusPeArquivos.map((a) => a.estado),
      }));
      expect(result.keys).toHaveLength(2);
      expect(result.keys[0]).not.toBe(result.keys[1]);
      expect(result.states).toEqual(["cancelado", "pendente"]);
    },
  );
  await check(
    "cancelled original clears every renamed intention deduplicated by the server",
    async () => {
      await go();
      await page.evaluate(() => {
        window.__peFileConfirmError = true;
      });
      const content = Buffer.from("%PDF-1.7\nsame-content-renamed-alias\n");
      await add().setInputFiles({
        name: "nome-canonico.pdf",
        mimeType: "application/pdf",
        buffer: content,
      });
      await expect(files().getByRole("alert")).toContainText("Falha de confirmação");
      await add().setInputFiles({
        name: "nome-local-alternativo.pdf",
        mimeType: "application/pdf",
        buffer: content,
      });
      await expect(files().getByRole("alert")).toContainText("Falha de confirmação");
      await expect(files().getByText("nome-canonico.pdf", { exact: true })).toBeVisible();
      expect(await page.evaluate(() => window.__nexusPeArquivos.length)).toBe(1);
      await files().getByRole("button", { name: "Cancelar envio pendente", exact: true }).click();
      await files()
        .getByLabel("Motivo do cancelamento", { exact: true })
        .fill("Encerrar todos os nomes desta intenção");
      await files().getByRole("button", { name: "Confirmar cancelamento", exact: true }).click();
      await expect(
        files().getByText("Nenhum arquivo vinculado a esta versão.", { exact: true }),
      ).toBeVisible();
      await add().setInputFiles({
        name: "nome-local-alternativo.pdf",
        mimeType: "application/pdf",
        buffer: content,
      });
      await expect(files().getByText("nome-local-alternativo.pdf", { exact: true })).toBeVisible();
      const result = await page.evaluate(() => ({
        keys: window.__nexusCalls
          .filter((c) => c.name === "prepararArquivoPe")
          .map((c) => c.payload.data.chave),
        states: window.__nexusPeArquivos.map((a) => a.estado),
        names: window.__nexusPeArquivos.map((a) => a.nome),
      }));
      expect(result.keys).toHaveLength(3);
      expect(new Set(result.keys).size).toBe(3);
      expect(result.states).toEqual(["cancelado", "pendente"]);
      expect(result.names).toEqual(["nome-canonico.pdf", "nome-local-alternativo.pdf"]);
    },
  );
  await check(
    "a full response states its 100-original query limit without claiming the complete history",
    async () => {
      await go();
      await page.evaluate(
        ({ project, v2 }) => {
          for (let i = 1; i <= 100; i++)
            window.__nexusPeArquivos.push({
              id: "44000000-0000-4000-8000-" + String(i).padStart(12, "0"),
              organization_id: "10000000-0000-4000-8000-000000000001",
              projeto_id: project,
              versao_id: v2,
              nome: "original-isolado-" + i + ".pdf",
              mime: "application/pdf",
              tamanho: 123,
              caminho: "fixture-private-only",
              sha256: "a".repeat(64),
              created_by: "00000000-0000-4000-8000-000000000001",
              created_at: "2026-10-22T12:00:00Z",
              confirmado_em: "2026-10-22T12:00:01Z",
              estado: "vinculado",
            });
        },
        { project, v2 },
      );
      await refresh();
      await expect(
        files().getByText(/Esta consulta exibe os 100 originais mais recentes/),
      ).toBeVisible();
    },
  );
  expect(report.errors).toEqual([]);
  report.success = true;
} catch (error) {
  report.failure = String(error);
  await page.screenshot({ path: directory + "/failure.png" });
  throw error;
} finally {
  await writeFile(directory + "/results.json", JSON.stringify(report, null, 2) + "\n");
  await browser.close();
}
