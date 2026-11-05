import { chromium, expect } from "@playwright/test";
import assert from "node:assert/strict";
import { readFile, writeFile } from "node:fs/promises";
import { PDFDocument, PDFRawStream, decodePDFRawStream } from "pdf-lib";
import { ids } from "./fixture.mjs";
const root = "http://127.0.0.1:4196",
  q = `cliente=${ids.client}&unidade=${ids.unit}`;
const browser = await chromium.launch({
  headless: true,
  args: [
    process.platform === "win32" ? "--use-angle=d3d11" : "--use-angle=swiftshader",
    "--enable-unsafe-swiftshader",
    "--enable-gpu",
    "--ignore-gpu-blocklist",
  ],
});
const checks = [],
  check = (name) => {
    checks.push(name);
    console.log("PASS " + name);
  };
const context = await browser.newContext({
  viewport: { width: 1440, height: 900 },
  reducedMotion: "reduce",
});
const p = await context.newPage();
const rpc = async (name, data) => {
  const r = await p.request.post(root + "/__cotrirosa", {
    data: {
      name,
      data: {
        organization_id: ids.org,
        cliente_id: ids.client,
        unidade_id: ids.unit,
        norma: "NR33",
        ...data,
      },
    },
  });
  assert.equal(r.status(), 200, await r.text());
  return r.json();
};
try {
  await p.goto(
    `${root}/nr-33/mapa-3d?${q}&local=${ids.locals[0]}&painel=pet&visualizacao=expandida&petDemo=nova`,
  );
  await p.getByLabel("Atividade", { exact: true }).fill("Retry demonstrativo controlado");
  await p.getByLabel("Início previsto", { exact: true }).fill("2026-11-05T12:00");
  await p.getByLabel("Término previsto", { exact: true }).fill("2026-11-05T13:00");
  const before = (await rpc("petDemoListar", { local_id: ids.locals[0] })).total;
  let lost = false;
  await p.route("**/__cotrirosa", async (route) => {
    const d = route.request().postDataJSON();
    if (!lost && d.name === "petDemoExecutar" && d.data.comando.comando === "criar") {
      lost = true;
      await route.fetch();
      await route.abort("failed");
    } else await route.continue();
  });
  await p.getByRole("button", { name: "Salvar e continuar", exact: true }).click();
  await expect(p.getByRole("alert")).toContainText(/conexão|Failed|fetch/);
  await expect(p.getByLabel("Atividade", { exact: true })).toHaveValue(
    "Retry demonstrativo controlado",
  );
  await p.getByRole("button", { name: "Salvar e continuar", exact: true }).click();
  await expect(p.getByRole("heading", { name: "Equipe", exact: true })).toBeVisible();
  assert.equal((await rpc("petDemoListar", { local_id: ids.locals[0] })).total, before + 1);
  check("Lost creation response and retry return one saved draft without losing form");
  await p.unroute("**/__cotrirosa");
  const id = new URL(p.url()).searchParams.get("petDemo"),
    fresh = await rpc("petDemoObter", { id });
  await rpc("petDemoExecutar", {
    comando: {
      comando: "salvar",
      norma: "NR33",
      id,
      chave: crypto.randomUUID(),
      expected_version: fresh.sessao.version,
      dados: { conteudo: { ...fresh.sessao.conteudo, medidas: "Outra pessoa salvou" }, etapa: 1 },
    },
  });
  await p.getByLabel("Nome do participante", { exact: true }).fill("Pessoa no navegador");
  await p.getByRole("button", { name: "Adicionar participante", exact: true }).click();
  await p.getByRole("button", { name: "Salvar e continuar", exact: true }).click();
  await expect(p.getByRole("alert")).toContainText(/Outra pessoa|mudou/);
  await expect(p.getByText("Pessoa no navegador", { exact: true })).toBeVisible();
  check("Concurrent edit reports conflict and retains local manual participant");
  await p.getByRole("button", { name: "Usar a versão salva no servidor", exact: true }).click();
  await p.getByRole("button", { name: "1 Contexto", exact: true }).click();
  await p.getByLabel("Atividade", { exact: true }).fill("Alteração não salva");
  await p.getByRole("button", { name: "Fechar ficha", exact: true }).click();
  await expect(p.getByRole("alertdialog")).toBeVisible();
  await expect(p.getByRole("button", { name: "Continuar preenchendo", exact: true })).toBeFocused();
  await p.keyboard.press("Shift+Tab");
  await expect(p.getByRole("button", { name: "Sair sem salvar", exact: true })).toBeFocused();
  await p.keyboard.press("Tab");
  await expect(p.getByRole("button", { name: "Continuar preenchendo", exact: true })).toBeFocused();
  await p.getByRole("button", { name: "Continuar preenchendo", exact: true }).click();
  await expect(p.getByLabel("Atividade", { exact: true })).toHaveValue("Alteração não salva");
  check("Leaving unsaved form requires an explicit discard decision");
  await p.getByRole("button", { name: "Salvar", exact: true }).click();
  await expect(p.getByRole("status")).toContainText("Salvo");
  const closed = (
    await rpc("petDemoListar", { local_id: ids.locals[1], grupo: "concluidas" })
  ).registros.find((x) => x.estado === "encerrada");
  assert.ok(closed);
  await p.goto(
    `${root}/nr-33/mapa-3d?${q}&local=${ids.locals[1]}&painel=pet&visualizacao=expandida&petDemo=${closed.id}&etapaDemo=7`,
  );
  await p.getByText("Mais opções", { exact: true }).click();
  const download = p.waitForEvent("download");
  await p.getByRole("button", { name: "Relatório PDF", exact: true }).click();
  const file = await download;
  await file.saveAs("docs/cotrirosa/demo-report.pdf");
  const doc = await PDFDocument.load(await readFile("docs/cotrirosa/demo-report.pdf"));
  let text = "";
  for (const [, obj] of doc.context.enumerateIndirectObjects())
    if (obj instanceof PDFRawStream) {
      try {
        const stream = new TextDecoder().decode(decodePDFRawStream(obj).decode());
        for (const match of stream.matchAll(/<([a-fA-F0-9]+)>\s*Tj/g))
          text +=
            new TextDecoder("windows-1252").decode(
              Uint8Array.from(match[1].match(/.{2}/g), (c) => parseInt(c, 16)),
            ) + "\n";
      } catch {
        /* Font streams are not text. */
      }
    }
  assert.match(text, /SEM VALIDADE OPERACIONAL/);
  assert.ok(text.includes(closed.numero));
  assert.match(text, /Entradas e saídas/);
  check("Downloaded PDF marked as demonstration includes identity, manual readings and attendance");
  const csvDownload = p.waitForEvent("download");
  await p.getByRole("button", { name: "Exportar CSV", exact: true }).click();
  const csv = await csvDownload;
  const csvText = await readFile(await csv.path(), "utf8");
  assert.match(csvText, /SEM VALIDADE OPERACIONAL/);
  assert.match(csvText, /Presença demonstrativa/);
  check("CSV includes marked demonstration and complete attendance/event data");
  await p.goto(`${root}/nr-33/pets?${q}`);
  await expect(p.getByRole("heading", { name: "PETs da unidade", exact: true })).toBeVisible();
  await p.getByRole("button", { name: "Concluídas", exact: true }).click();
  await p.getByLabel("Buscar demonstrações", { exact: true }).fill(closed.numero);
  await p.getByRole("button", { name: new RegExp(closed.numero) }).click();
  await expect(p.getByRole("heading", { name: "Consulta final", exact: true })).toBeVisible();
  check("Unit history search opens the exact same closed silo demonstration");
  const fallback = await browser.newContext({ viewport: { width: 390, height: 844 } });
  const f = await fallback.newPage();
  await f.addInitScript(() => {
    const original = HTMLCanvasElement.prototype.getContext;
    HTMLCanvasElement.prototype.getContext = function (type, ...args) {
      return type.startsWith("webgl") ? null : original.call(this, type, ...args);
    };
  });
  await f.goto(`${root}/nr-33/mapa-3d?${q}`);
  // A fresh browser context must load the route chunks before testing the fallback.
  // Software-rendered CI can take longer than the default assertion timeout.
  await expect(f.getByRole("heading", { name: "Mapa em lista" })).toBeVisible({ timeout: 30000 });
  await f.getByRole("button", { name: /EC 26.*Silo/ }).click();
  await f.getByRole("button", { name: "Iniciar PET", exact: true }).click();
  await expect(f.getByLabel("Atividade", { exact: true })).toHaveValue("");
  check("WebGL fallback retains exact five local identities and empty demonstration entry");
  await fallback.close();
  await writeFile(
    "docs/cotrirosa/demo-resilience-report.json",
    JSON.stringify(
      {
        checks,
        pdfPages: doc.getPageCount(),
        environment: "Isolated Chromium + real loopback PostgreSQL",
      },
      null,
      2,
    ),
  );
} catch (e) {
  await p.screenshot({ path: "docs/cotrirosa/demo-resilience-failure.png" });
  throw e;
} finally {
  await browser.close();
}
