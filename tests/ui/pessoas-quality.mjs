// Actual components with isolated transport. No connected Auth, RLS, Storage or persistence proof.
import { chromium, expect } from "@playwright/test";
import { mkdir, writeFile } from "node:fs/promises";
import { evidenceRoot } from "./evidence.mjs";
const directory = `${evidenceRoot}/pessoas`;
await mkdir(directory, { recursive: true });
const browser = await chromium.launch({ headless: true });
const page = await browser.newPage({ locale: "pt-BR", reducedMotion: "reduce" });
page.setDefaultTimeout(10000);
const base = process.env.NEXUS_UI_URL || "http://127.0.0.1:4182";
const id = "30000000-0000-4000-8000-000000000001";
const name = "Responsável técnico de teste com nome completo extenso";
const form = page.getByRole("dialog");
const report = {
  method:
    "Source UI with synthetic transport only; not Auth/SQL/RLS/Storage HTTP or physical device proof",
  layouts: [],
  checks: [],
  errors: [],
  success: false,
};
page.on("pageerror", (error) => report.errors.push(error.message));
async function go(extra = "") {
  await page.goto(`${base}/?page=equipe${extra}`, { waitUntil: "networkidle" });
  await page.getByRole("heading", { level: 1 }).waitFor();
}
async function check(title, work) {
  await work();
  report.checks.push({ name: title, pass: true });
}
async function refetch(patch) {
  await page.evaluate((values) => {
    Object.assign(window, values);
    window.dispatchEvent(new Event("visibilitychange"));
  }, patch);
}
async function openDetail() {
  await go(`&pessoa=${id}`);
  await page.getByRole("heading", { name, exact: true }).waitFor();
}
async function edit() {
  await page.getByRole("button", { name: "Editar cadastro e situação", exact: true }).click();
}
async function save() {
  await form.getByRole("button", { name: "Salvar pessoa", exact: true }).click();
}
async function close() {
  await form.getByRole("button", { name: "Fechar formulário", exact: true }).click();
  const discard = form.getByRole("button", { name: "Descartar alterações", exact: true });
  if (await discard.count()) await discard.click();
  await expect(form).toHaveCount(0);
}
async function layout(state, width) {
  const metrics = await page.evaluate(() => ({
    width: innerWidth,
    scrollWidth: document.documentElement.scrollWidth,
  }));
  expect(metrics.scrollWidth).toBeLessThanOrEqual(width);
  if (await form.count()) {
    const bounds = await form.boundingBox();
    expect(bounds.x).toBeGreaterThanOrEqual(0);
    expect(bounds.x + bounds.width).toBeLessThanOrEqual(width + 1);
  }
  report.layouts.push({ state, ...metrics });
  if ([390, 1366].includes(width))
    await page.screenshot({ path: `${directory}/${state}-${width}.png` });
}
try {
  for (const width of [360, 390, 768, 1024, 1366, 1440]) {
    await page.setViewportSize({ width, height: width < 768 ? 844 : 900 });
    await go();
    await layout("lista", width);
    await openDetail();
    await layout("ficha", width);
    await edit();
    await layout("formulario", width);
    await close();
  }
  await page.setViewportSize({ width: 390, height: 844 });
  await check("search, selection, reload and return preserve the URL recut", async () => {
    await go();
    await page.getByRole("searchbox", { name: "Buscar pessoa", exact: true }).fill("Responsável");
    await expect(
      page.getByRole("list", { name: "Pessoas operacionais" }).getByRole("button"),
    ).toHaveCount(1);
    await page.getByRole("button", { name, exact: true }).click();
    await expect(page).toHaveURL(new RegExp(`pessoa=${id}`));
    await page.reload({ waitUntil: "networkidle" });
    await expect(page.getByRole("heading", { name, exact: true })).toBeVisible();
    await page.getByRole("button", { name: "Voltar à lista de pessoas" }).click();
    await expect(page.getByRole("searchbox", { name: "Buscar pessoa", exact: true })).toHaveValue(
      "Responsável",
    );
    expect(new URL(page.url()).searchParams.has("pessoa")).toBe(false);
  });
  await check("failed save keeps fields and reuses the same intent on retry", async () => {
    await go();
    await page.getByRole("button", { name: "Nova pessoa", exact: true }).click();
    await form
      .getByRole("textbox", { name: "Nome completo", exact: true })
      .fill("Pessoa salva após falha");
    await page.evaluate(() => {
      window.__failNextWrite = true;
    });
    await save();
    await expect(form.getByRole("alert")).toContainText("Falha de rede");
    await expect(form.getByRole("textbox", { name: "Nome completo", exact: true })).toHaveValue(
      "Pessoa salva após falha",
    );
    await save();
    await expect(form).toHaveCount(0);
    const calls = await page.evaluate(() =>
      window.__nexusCalls.filter((call) => call.name === "salvarPessoa"),
    );
    expect(calls).toHaveLength(2);
    expect(calls[0].payload.data.chave).toBe(calls[1].payload.data.chave);
    await expect(
      page.getByRole("status").filter({ hasText: "Cadastro confirmado no servidor" }),
    ).toBeVisible();
  });
  await check("background detail refresh never advances an open form's version", async () => {
    await openDetail();
    await edit();
    await form
      .getByRole("textbox", { name: "Nome completo", exact: true })
      .fill("Rascunho mantido antes da comparação");
    await page.evaluate(() => {
      const p = window.__nexusOperational.pessoas[0];
      p.version = 2;
      p.funcao = "Função atualizada em outra sessão";
      window.dispatchEvent(new Event("visibilitychange"));
    });
    await save();
    await expect(form.getByRole("alert")).toContainText("Conflito de versão");
    expect(
      await page.evaluate(
        () =>
          window.__nexusCalls.filter((call) => call.name === "salvarPessoa").at(-1).payload.data
            .expected_version,
      ),
    ).toBe(1);
    await form.getByRole("button", { name: "Comparar com a versão salva" }).click();
    await expect(form.getByRole("heading", { name: "Versão salva 2" })).toBeVisible();
    await expect(form.getByRole("textbox", { name: "Nome completo", exact: true })).toHaveValue(
      "Rascunho mantido antes da comparação",
    );
    await form.getByRole("button", { name: "Recarregar campos com a versão salva" }).click();
    await expect(form.getByRole("textbox", { name: "Nome completo", exact: true })).toHaveValue(
      name,
    );
    await save();
    await expect(form).toHaveCount(0);
    expect(
      await page.evaluate(
        () =>
          window.__nexusCalls.filter((call) => call.name === "salvarPessoa").at(-1).payload.data
            .expected_version,
      ),
    ).toBe(2);
  });
  await check("detail network error hides the old read but keeps the edit draft", async () => {
    await openDetail();
    await edit();
    await form
      .getByRole("textbox", { name: "Nome completo", exact: true })
      .fill("Preenchimento recuperável");
    await refetch({ __peopleDetailError: true });
    await expect(
      page
        .getByRole("region", { name: "Ficha da pessoa selecionada" })
        .getByText("engenharia@example.invalid"),
    ).toHaveCount(0);
    await expect(form.getByRole("textbox", { name: "Nome completo", exact: true })).toHaveValue(
      "Preenchimento recuperável",
    );
    await close();
    await refetch({ __peopleDetailError: false });
    await expect(page.getByRole("heading", { name, exact: true })).toBeVisible();
  });
  await check(
    "detail denial closes the editor and removes cached identity and attachments",
    async () => {
      await openDetail();
      await edit();
      await form
        .getByRole("textbox", { name: "Nome completo", exact: true })
        .fill("Nome privado não salvo");
      await refetch({ __peopleDetailDenied: true });
      await expect(form).toHaveCount(0);
      await expect(page.getByRole("alert")).toContainText(
        "Pessoa indisponível para seu acesso atual",
      );
      await expect(page.getByRole("heading", { name, exact: true })).toHaveCount(0);
      await expect(page.getByRole("region", { name: "Arquivos privados" })).toHaveCount(0);
      await page.evaluate(() => {
        window.__peopleDetailDenied = false;
      });
      await page.getByRole("button", { name: "Tentar novamente", exact: true }).click();
      await expect(page.getByRole("heading", { name, exact: true })).toBeVisible();
    },
  );
  await check(
    "a new draft survives list network failure and is removed on explicit list denial",
    async () => {
      await go();
      await page.getByRole("button", { name: "Nova pessoa", exact: true }).click();
      await form
        .getByRole("textbox", { name: "Nome completo", exact: true })
        .fill("Criação privada em andamento");
      await refetch({ __operationalFail: true });
      await expect(form.getByRole("textbox", { name: "Nome completo", exact: true })).toHaveValue(
        "Criação privada em andamento",
      );
      await refetch({ __operationalFail: false, __peopleDenied: true });
      await expect(form).toHaveCount(0);
      await expect(page.getByRole("alert")).toContainText("Pessoa indisponível");
    },
  );
  await check("mutation and comparison denial cannot leave a private form visible", async () => {
    for (const mode of ["mutation", "comparison"]) {
      await openDetail();
      await edit();
      await form
        .getByRole("textbox", { name: "Nome completo", exact: true })
        .fill(`Rascunho privado ${mode}`);
      if (mode === "comparison") {
        await page.evaluate(() => {
          window.__failNextWrite = true;
        });
        await save();
        await expect(form.getByRole("alert")).toContainText("Falha de rede");
        await page.evaluate(() => {
          window.__peopleDetailDenied = true;
        });
        await form.getByRole("button", { name: "Comparar com a versão salva" }).click();
      } else {
        await page.evaluate(() => {
          window.__peopleDenied = true;
        });
        await save();
      }
      await expect(form).toHaveCount(0);
      await expect(page.getByRole("alert")).toContainText("Pessoa indisponível");
    }
  });
  await check("no matches and query failure are different states with recovery", async () => {
    await go();
    await page
      .getByRole("searchbox", { name: "Buscar pessoa", exact: true })
      .fill("Sem correspondência no laboratório");
    await expect(page.getByText("Nenhuma pessoa encontrada", { exact: true })).toBeVisible();
    await refetch({ __operationalFail: true });
    await expect(page.getByRole("button", { name: "Tentar novamente", exact: true })).toBeVisible();
    await expect(page.getByText("Nenhuma pessoa encontrada", { exact: true })).toHaveCount(0);
  });
  expect(report.errors).toEqual([]);
  report.success = true;
} catch (error) {
  report.failure = String(error);
  await page.screenshot({ path: `${directory}/failure.png` });
  throw error;
} finally {
  await writeFile(`${directory}/results.json`, JSON.stringify(report, null, 2) + "\n");
  await browser.close();
}
