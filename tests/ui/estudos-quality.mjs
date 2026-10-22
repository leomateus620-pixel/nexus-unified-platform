// Real source components with isolated transport fixtures; not connected Auth/DB/Storage E2E.
import { chromium, expect } from "@playwright/test";
import { mkdir, writeFile } from "node:fs/promises";
import { evidenceRoot } from "./evidence.mjs";

const base = process.env.NEXUS_UI_URL || "http://127.0.0.1:4182";
const directory = `${evidenceRoot}/estudos`;
await mkdir(directory, { recursive: true });
const browser = await chromium.launch({ headless: true });
const page = await browser.newPage({ locale: "pt-BR", reducedMotion: "reduce" });
page.setDefaultTimeout(10000);
const report = {
  profile: process.env.NEXUS_UI_BEHAVIORS_ONLY === "1" ? "behaviors-only" : "layouts-and-behaviors",
  method:
    "Source UI with synthetic transport only; no real Auth, SQL, Storage HTTP, operational persistence or physical device proof",
  layouts: [],
  checks: [],
  errors: [],
  success: false,
};
page.on("pageerror", (error) => report.errors.push(error.message));
const studyId = "80000000-0000-4000-8000-000000000001";
const revisionId = "81000000-0000-4000-8000-000000000001";
const hazardId = "82000000-0000-4000-8000-000000000001";
const personId = "30000000-0000-4000-8000-000000000001";
const detail = `&estudo=${studyId}&revisao=${revisionId}&perigo=${hazardId}`;
async function go(extra = "") {
  await page.goto(`${base}/?page=engenharia${extra}`, { waitUntil: "networkidle" });
  await page.getByRole("heading", { level: 1 }).waitFor();
  await page.evaluate(() => document.fonts.ready);
}
async function check(name, work) {
  await work();
  report.checks.push({ name, pass: true });
}
async function layout(name, width) {
  const metrics = await page.evaluate(() => ({
    width: innerWidth,
    scrollWidth: document.documentElement.scrollWidth,
  }));
  expect(metrics.scrollWidth, `${name} at ${width}px`).toBeLessThanOrEqual(width);
  const dialog = page.getByRole("dialog");
  if (await dialog.count()) {
    const box = await dialog.boundingBox();
    expect(box.x).toBeGreaterThanOrEqual(0);
    expect(box.y).toBeGreaterThanOrEqual(0);
    expect(box.x + box.width).toBeLessThanOrEqual(width + 1);
    expect(box.y + box.height).toBeLessThanOrEqual((width < 768 ? 844 : 900) + 1);
  }
  report.layouts.push({ name, ...metrics });
  if ([390, 1366].includes(width))
    await page.screenshot({ path: `${directory}/${name}-${width}.png` });
}
async function hazards() {
  await page.getByRole("tab", { name: "Perigos e medidas", exact: true }).click();
  await page
    .getByRole("navigation", { name: "Selecionar perigo", exact: true })
    .getByRole("button")
    .first()
    .click();
}
async function createFields(title) {
  const form = page.getByRole("dialog");
  await form.getByRole("textbox", { name: "Título", exact: true }).fill(title);
  await form
    .getByRole("combobox", { name: /^Cliente/ })
    .selectOption("20000000-0000-4000-8000-000000000001");
  await form
    .getByRole("combobox", { name: /^Unidade/ })
    .selectOption("21000000-0000-4000-8000-000000000001");
  await form.getByRole("combobox", { name: /^Responsável pelo estudo/ }).selectOption(personId);
}
async function reason(command, value) {
  await page.getByRole("button", { name: command, exact: true }).click();
  const form = page.getByRole("dialog");
  if (await form.getByRole("textbox", { name: "Motivo e decisão", exact: true }).count())
    await form.getByRole("textbox", { name: "Motivo e decisão", exact: true }).fill(value);
  await form
    .getByRole("button", {
      name: command === "Enviar para revisão" ? "Enviar estudo para revisão" : command,
      exact: true,
    })
    .click();
  await expect(form).not.toBeVisible();
}
try {
  for (const width of process.env.NEXUS_UI_BEHAVIORS_ONLY === "1"
    ? []
    : [360, 390, 768, 1024, 1366, 1440]) {
    await page.setViewportSize({ width, height: width < 768 ? 844 : 900 });
    await go();
    await expect(page.getByRole("list", { name: "Estudos técnicos encontrados" })).toBeVisible();
    await layout("lista", width);
    await page.getByRole("button", { name: "Criar estudo técnico", exact: true }).click();
    await layout("cadastro", width);
    await page.keyboard.press("Escape");
    await go(detail);
    await page.getByRole("heading", { name: "Conteúdo da revisão", exact: true }).waitFor();
    await layout("conteudo", width);
    await page.getByRole("button", { name: "Editar conteúdo", exact: true }).click();
    await layout("editar-conteudo", width);
    await page.keyboard.press("Escape");
    await hazards();
    await layout("perigo-detalhe", width);
    await page.getByRole("button", { name: "Adicionar perigo", exact: true }).click();
    await layout("perigo-form", width);
    await page.keyboard.press("Escape");
    await page.getByRole("button", { name: "Adicionar medida", exact: true }).click();
    await layout("medida-form", width);
    await page.keyboard.press("Escape");
    await page.getByRole("tab", { name: "Fontes e evidências", exact: true }).click();
    await page.getByRole("button", { name: "Vincular fonte", exact: true }).click();
    await layout("fonte-form", width);
    await page.keyboard.press("Escape");
    await page.getByRole("tab", { name: "Conteúdo e método", exact: true }).click();
    await page.getByRole("button", { name: "Publicar nova versão do método", exact: true }).click();
    await layout("metodo-form", width);
    await page.keyboard.press("Escape");
    await go(`${detail}&scenario=approved`);
    await hazards();
    await page
      .getByRole("button", { name: "Liberar ou vincular ação operacional", exact: true })
      .click();
    await layout("acao-form", width);
    await page.keyboard.press("Escape");
  }
  await page.setViewportSize({ width: 390, height: 844 });
  await check(
    "creation validates fields, focuses the first error and restores the trigger",
    async () => {
      await go();
      const trigger = page.getByRole("button", { name: "Criar estudo técnico", exact: true });
      await trigger.click();
      const form = page.getByRole("dialog");
      await form.getByRole("button", { name: "Criar estudo técnico", exact: true }).click();
      await expect(form.getByRole("alert")).toContainText("Confira os campos");
      await expect(form.getByRole("textbox", { name: "Título", exact: true })).toBeFocused();
      await expect(form.getByRole("textbox", { name: "Título", exact: true })).toHaveAttribute(
        "aria-invalid",
        "true",
      );
      await page.keyboard.press("Escape");
      await expect(form).not.toBeVisible();
      await expect(trigger).toBeFocused();
    },
  );
  await check("dirty creation keeps local data until explicit discard", async () => {
    await page.getByRole("button", { name: "Criar estudo técnico", exact: true }).click();
    await page
      .getByRole("textbox", { name: "Título", exact: true })
      .fill("Rascunho ainda não salvo");
    await page.keyboard.press("Escape");
    await page.getByRole("button", { name: "Continuar editando", exact: true }).click();
    await expect(page.getByRole("textbox", { name: "Título", exact: true })).toHaveValue(
      "Rascunho ainda não salvo",
    );
    await page.getByRole("button", { name: "Voltar sem salvar", exact: true }).click();
    await page.getByRole("button", { name: "Descartar alterações", exact: true }).click();
    await expect(page.getByRole("dialog")).not.toBeVisible();
  });
  await check("failed save keeps the completed form and the error is recoverable", async () => {
    await go("&scenario=write-error");
    await page.getByRole("button", { name: "Criar estudo técnico", exact: true }).click();
    await createFields("Título preservado após falha");
    await page
      .getByRole("dialog")
      .getByRole("button", { name: "Criar estudo técnico", exact: true })
      .click();
    await expect(
      page.getByText("O servidor não confirmou esta operação. Seu preenchimento foi mantido.", {
        exact: true,
      }),
    ).toBeVisible();
    await expect(page.getByRole("textbox", { name: "Título", exact: true })).toHaveValue(
      "Título preservado após falha",
    );
    await page.screenshot({ path: `${directory}/falha-escrita-390.png` });
  });
  await check(
    "creation preserves the declared initial scope in the returned revision",
    async () => {
      await go();
      await page.getByRole("button", { name: "Criar estudo técnico", exact: true }).click();
      await createFields("Estudo com escopo inicial preservado");
      const form = page.getByRole("dialog");
      const scope = "Escopo declarado exclusivamente no laboratório isolado.";
      await form.getByText("Contexto e método", { exact: true }).click();
      await form.getByRole("textbox", { name: "Escopo", exact: true }).fill(scope);
      await form.getByRole("button", { name: "Criar estudo técnico", exact: true }).click();
      await expect(form).not.toBeVisible();
      await expect(
        page.getByRole("heading", { name: "Conteúdo da revisão", exact: true }),
      ).toBeVisible();
      await expect(page.getByText(scope, { exact: true })).toBeVisible();
      expect(await page.evaluate(() => window.__nexusEstudos.revisoes.at(-1).escopo)).toBe(scope);
    },
  );
  await check("focus refetch cannot advance the form expected_version", async () => {
    await go(detail);
    await page.getByRole("button", { name: "Editar conteúdo", exact: true }).click();
    const local = "Escopo local preservado durante atualização concorrente";
    await page.getByRole("textbox", { name: "Escopo", exact: true }).fill(local);
    await page.evaluate(() => {
      window.__estudoAdvanceRevision = true;
      window.dispatchEvent(new Event("visibilitychange"));
    });
    await expect.poll(() => page.evaluate(() => window.__nexusEstudos.revisoes[0].version)).toBe(2);
    await page
      .getByRole("dialog")
      .getByRole("button", { name: "Editar conteúdo e responsabilidade", exact: true })
      .click();
    await expect(page.getByRole("alert").filter({ hasText: /Outra pessoa alterou/ })).toBeVisible();
    await expect(page.getByRole("textbox", { name: "Escopo", exact: true })).toHaveValue(local);
    const sent = await page.evaluate(
      () =>
        window.__nexusCalls.filter((call) => call.name === "executarEstudo").at(-1)?.payload.data,
    );
    expect(sent.expected_version).toBe(1);
    expect(sent.comando).toBe("salvar_revisao");
    await page.screenshot({ path: `${directory}/refetch-conflito-390.png` });
  });
  await check(
    "return, resubmit, approve and new revision preserve the submitted history",
    async () => {
      await go(`${detail}&scenario=review`);
      await reason("Devolver para elaboração", "Conferir a análise com a fonte autorizada");
      await expect(page.getByText("Em elaboração", { exact: true }).first()).toBeVisible();
      await reason("Enviar para revisão", "");
      await reason("Aprovar revisão técnica", "Conferência técnica registrada no cenário isolado");
      await expect(
        page.getByRole("button", { name: "Adicionar revisão", exact: true }),
      ).toBeVisible();
      await reason("Adicionar revisão", "Atualizar a análise em outra revisão");
      const state = await page.evaluate(() => window.__nexusEstudos);
      expect(state.revisoes).toHaveLength(2);
      expect(state.submissoes).toHaveLength(2);
      expect(state.decisoes.map((d) => d.decisao)).toEqual(["devolver", "aprovar"]);
      expect(state.revisoes[0].snapshot_sha256).toBeTruthy();
      expect(state.revisoes[1].snapshot).toBeNull();
      await page.getByRole("tab", { name: "Revisões e decisões", exact: true }).click();
      await layout("historico-versionado", 390);
    },
  );
  await check("method publication keeps the study fixed to its original version", async () => {
    await go(detail);
    await page.getByRole("button", { name: "Publicar nova versão do método", exact: true }).click();
    const form = page.getByRole("dialog");
    await form
      .getByRole("textbox", { name: "Instruções e critérios validados *", exact: true })
      .fill("Instruções revisadas somente no laboratório isolado");
    await form.getByRole("checkbox", { name: /Conferi as fontes, suas versões/ }).check();
    await form.getByRole("button", { name: "Publicar versão", exact: true }).click();
    await expect(form).not.toBeVisible();
    const state = await page.evaluate(() => window.__nexusEstudos);
    expect(state.metodos).toHaveLength(2);
    expect(state.revisoes[0].metodo_versao_id).toBe("85000000-0000-4000-8000-000000000001");
  });
  await check(
    "action starts blank and opens the canonical task with only released instructions",
    async () => {
      await go(`${detail}&scenario=approved`);
      await hazards();
      await page
        .getByRole("button", { name: "Liberar ou vincular ação operacional", exact: true })
        .click();
      const form = page.getByRole("dialog");
      await expect(
        form.getByRole("textbox", { name: "Instrução para a equipe *", exact: true }),
      ).toHaveValue("");
      await expect(
        form.getByRole("textbox", { name: "Descrição liberada", exact: true }),
      ).toHaveValue("");
      await form
        .getByRole("textbox", { name: "Instrução para a equipe *", exact: true })
        .fill("Instrução liberada exclusivamente na fixture");
      await form.getByRole("combobox", { name: /^Responsável pela ação/ }).selectOption(personId);
      await form.getByRole("checkbox", { name: /Conferi as instruções e autorizo/ }).check();
      await form.getByRole("button", { name: "Criar e vincular ação", exact: true }).click();
      await expect(form).not.toBeVisible();
      const sent = await page.evaluate(
        () =>
          window.__nexusCalls.filter((call) => call.name === "vincularAcaoEstudo").at(-1)?.payload
            .data,
      );
      expect(sent.descricao).toBe("");
      expect(sent.titulo).toBe("Instrução liberada exclusivamente na fixture");
      expect(sent).not.toHaveProperty("analise");
      expect(await page.evaluate(() => window.__nexusEstudos.acoes.length)).toBe(1);
      const actionId = await page.evaluate(() => window.__nexusEstudos.acoes[0].acao_id);
      await page.getByRole("link", { name: "Abrir ação", exact: true }).click();
      await expect(
        page.getByRole("heading", { level: 1, name: "Ações operacionais" }),
      ).toBeVisible();
      const region = page.getByRole("region", { name: "Detalhe da ação selecionada" });
      await expect(
        region.getByRole("heading", {
          name: "Instrução liberada exclusivamente na fixture",
          exact: true,
        }),
      ).toBeVisible();
      expect(new URL(page.url()).searchParams.get("acao")).toBe(actionId);
      await expect(
        page.getByText(
          "Análise de teste sem critério normativo, fórmula ou declaração de conformidade.",
          { exact: true },
        ),
      ).toHaveCount(0);
    },
  );
  await check("file query revocation hides cached original and upload controls", async () => {
    await go(detail);
    await hazards();
    const evidence = page.getByRole("region", { name: "Evidências deste perigo", exact: true });
    await expect(evidence.getByText("evidencia-perigo-teste.jpg", { exact: true })).toBeVisible();
    await page.evaluate(() => {
      window.__estudoFileQueryError = true;
      window.dispatchEvent(new Event("visibilitychange"));
    });
    await expect(evidence.getByRole("alert")).toContainText(
      "Evidências indisponíveis após mudança de acesso na fixture.",
    );
    await expect(evidence.getByText("evidencia-perigo-teste.jpg", { exact: true })).toHaveCount(0);
    await expect(evidence.getByLabel("Adicionar foto", { exact: true })).toHaveCount(0);
  });
  await check(
    "an open draft survives a network error and is removed when source access is denied",
    async () => {
      await go(detail);
      await page.getByRole("button", { name: "Editar conteúdo", exact: true }).click();
      const analysis = page.getByRole("textbox", { name: "Análise técnica", exact: true });
      const local = "Análise local exclusiva do cenário de revogação.";
      await analysis.fill(local);
      await page.evaluate(() => {
        window.__estudoQueryError = true;
        window.dispatchEvent(new Event("visibilitychange"));
      });
      await expect
        .poll(() =>
          page.evaluate(() => window.__nexusCalls.filter((c) => c.name === "obterEstudo").length),
        )
        .toBeGreaterThanOrEqual(2);
      await expect(analysis).toHaveValue(local);
      await page.evaluate(() => {
        window.__estudoQueryError = false;
        window.__estudoSourceUnavailable = true;
        window.dispatchEvent(new Event("visibilitychange"));
      });
      await expect(page.getByRole("dialog")).toHaveCount(0);
      await expect(page.getByRole("textbox", { name: "Análise técnica", exact: true })).toHaveCount(
        0,
      );
      await expect(page.getByRole("alert").first()).toContainText(
        "Estudo ou fonte indisponível para seu acesso atual.",
      );
    },
  );
  await check("pending upload can fail, be cancelled and retried as a fresh intent", async () => {
    await go(`${detail}&scenario=upload-error`);
    await hazards();
    const file = {
      name: "evidencia-da-fixture.png",
      mimeType: "image/png",
      buffer: Buffer.from(
        "iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mP8/x8AAwMCAO+aIOsAAAAASUVORK5CYII=",
        "base64",
      ),
    };
    await page.getByLabel("Adicionar foto", { exact: true }).setInputFiles(file);
    await expect(
      page.getByRole("button", { name: "Reverificar armazenamento", exact: true }),
    ).toBeVisible();
    await page.getByRole("button", { name: "Cancelar envio pendente", exact: true }).click();
    await page
      .getByRole("textbox", { name: "Motivo do cancelamento", exact: true })
      .fill("Cancelar a intenção de upload do cenário de teste");
    await page.getByRole("button", { name: "Confirmar cancelamento", exact: true }).click();
    await expect(page.getByText("evidencia-da-fixture.png", { exact: true })).toHaveCount(0);
    await page.getByLabel("Adicionar foto", { exact: true }).setInputFiles(file);
    await expect(
      page.getByRole("button", { name: "Reverificar armazenamento", exact: true }),
    ).toBeVisible();
    const uploads = await page.evaluate(() =>
      window.__nexusEstudos.arquivos.filter((a) => a.nome === "evidencia-da-fixture.png"),
    );
    expect(uploads).toHaveLength(2);
    expect(uploads.map((a) => a.estado)).toEqual(["cancelado", "pendente"]);
  });
  await check("empty, query failure and revoked source are distinct states", async () => {
    await go("&scenario=empty");
    await expect(page.getByText("Nenhum estudo técnico cadastrado", { exact: true })).toBeVisible();
    await go("&scenario=error");
    await expect(
      page.getByRole("button", { name: "Tentar novamente", exact: true }).first(),
    ).toBeVisible();
    await expect(page.getByText("Nenhum estudo técnico cadastrado", { exact: true })).toHaveCount(
      0,
    );
    await go(`${detail}&scenario=restricted`);
    await expect(page.getByRole("alert").first()).toContainText(
      "Estudo ou fonte indisponível para seu acesso atual.",
    );
    await expect(page.getByRole("button", { name: "Editar conteúdo", exact: true })).toHaveCount(0);
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
