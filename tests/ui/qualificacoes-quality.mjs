// Actual source components, synthetic boundary only. Database/Auth/Storage are separate evidence.
import { chromium, expect } from "@playwright/test";
import { mkdir, writeFile } from "node:fs/promises";
import { evidenceRoot } from "./evidence.mjs";
const directory = `${evidenceRoot}/qualificacoes`;
await mkdir(directory, { recursive: true });
const browser = await chromium.launch({ headless: true });
const page = await browser.newPage({ locale: "pt-BR", reducedMotion: "reduce" });
page.setDefaultTimeout(10000);
const base = process.env.NEXUS_UI_URL || "http://127.0.0.1:4182";
const qualificationId = "a3000000-0000-4000-8000-000000000001",
  competenceId = "a2000000-0000-4000-8000-000000000001";
const form = page.getByRole("dialog"),
  detail = page.getByRole("region", { name: "Ficha da qualificação", exact: true });
const report = {
  method:
    "Source UI with synthetic transport; no connected Auth/SQL/RLS/Storage HTTP, durable persistence or physical-device proof",
  layouts: [],
  checks: [],
  errors: [],
  success: false,
};
page.on("pageerror", (error) => report.errors.push(error.message));
async function go(area = "qualificacoes", extra = "") {
  await page.goto(`${base}/?page=equipe&area=${area}${extra}`, { waitUntil: "networkidle" });
  await page
    .getByRole("heading", {
      level: 1,
      name: area === "competencias" ? "Competências" : "Qualificações",
      exact: true,
    })
    .waitFor();
}
async function openQualification() {
  await go("qualificacoes", `&qualificacao=${qualificationId}`);
  await expect(detail).toBeVisible();
}
async function close() {
  await form.getByRole("button", { name: "Fechar formulário", exact: true }).click();
  const discard = form.getByRole("button", { name: "Descartar alterações", exact: true });
  if (await discard.count()) await discard.click();
  await expect(form).toHaveCount(0);
}
async function decide(state, reason = "") {
  await page.getByRole("button", { name: "Conferir qualificação", exact: true }).click();
  await form.getByLabel("Decisão", { exact: false }).selectOption(state);
  if (reason) await form.getByLabel("Motivo", { exact: false }).fill(reason);
  await form.getByRole("button", { name: "Confirmar decisão", exact: true }).click();
}
async function check(name, work) {
  await work();
  report.checks.push({ name, pass: true });
}
async function refresh(values) {
  await page.evaluate((patch) => {
    Object.assign(window, patch);
    window.dispatchEvent(new Event("visibilitychange"));
  }, values);
}
async function layout(name, width) {
  const metrics = await page.evaluate(() => ({
    width: innerWidth,
    scrollWidth: document.documentElement.scrollWidth,
  }));
  expect(metrics.scrollWidth, name).toBeLessThanOrEqual(width);
  if (await form.count()) {
    const box = await form.boundingBox();
    expect(box.x).toBeGreaterThanOrEqual(0);
    expect(box.x + box.width).toBeLessThanOrEqual(width + 1);
  }
  report.layouts.push({ name, ...metrics });
  if ([390, 1366].includes(width))
    await page.screenshot({ path: `${directory}/${name}-${width}.png` });
}
try {
  for (const width of [360, 390, 768, 1024, 1366, 1440]) {
    await page.setViewportSize({ width, height: width < 768 ? 844 : 900 });
    await go("competencias");
    await layout("competencias-lista", width);
    await go("competencias", `&competencia=${competenceId}`);
    await layout("competencia-ficha", width);
    await page.getByRole("button", { name: "Editar política e situação", exact: true }).click();
    await form.getByLabel("Nome da competência", { exact: false }).fill("");
    await form.getByRole("button", { name: "Salvar competência", exact: true }).click();
    const nameField = form.getByRole("textbox", { name: "Nome da competência *", exact: true });
    await expect(nameField).toBeFocused();
    await expect(nameField).toHaveAttribute("aria-invalid", "true");
    await expect(nameField).toHaveAccessibleDescription("Informe o nome da competência.");
    await layout("competencia-formulario", width);
    await close();
    await openQualification();
    if (width < 1280) {
      await expect(
        page.getByRole("heading", { name: "Qualificações e conferência", exact: true }),
      ).toHaveCount(0);
      await expect(
        page.getByRole("searchbox", { name: "Buscar pelo emissor", exact: true }),
      ).toHaveCount(0);
    }
    await layout("qualificacao-ficha", width);
    await page.getByRole("button", { name: "Editar qualificação enviada", exact: true }).click();
    await layout("qualificacao-formulario", width);
    await close();
  }
  await page.setViewportSize({ width: 390, height: 844 });
  await check(
    "used competence preserves requirement flags and supports current-version comparison",
    async () => {
      await go("competencias", `&competencia=${competenceId}`);
      await page.getByRole("button", { name: "Editar política e situação", exact: true }).click();
      await expect(
        form.getByLabel("Exige comprovante para validar", { exact: false }),
      ).toBeDisabled();
      await expect(
        form.getByLabel("Exige data de validade para validar", { exact: false }),
      ).toBeDisabled();
      await form
        .getByLabel("Nome da competência", { exact: false })
        .fill("Nome editado com versão fixa");
      await page.evaluate(() => {
        window.__nexusPeople.competencias[0].version = 2;
        window.dispatchEvent(new Event("visibilitychange"));
      });
      await form.getByRole("button", { name: "Salvar competência", exact: true }).click();
      await expect(form.getByRole("alert")).toContainText("registro mudou");
      expect(
        await page.evaluate(
          () =>
            window.__nexusCalls.filter((c) => c.name === "salvarCompetencia").at(-1).payload.data
              .expected_version,
        ),
      ).toBe(1);
      await form.getByRole("button", { name: "Consultar versão atual", exact: true }).click();
      await expect(
        form.getByRole("region", { name: "Comparação do registro atual" }),
      ).toContainText("Versão salva: 2");
      await expect(form.getByLabel("Nome da competência", { exact: false })).toHaveValue(
        "Nome editado com versão fixa",
      );
      await form
        .getByRole("button", { name: "Usar versão atual e manter preenchimento", exact: true })
        .click();
      await form.getByRole("button", { name: "Salvar competência", exact: true }).click();
      await expect(form).toHaveCount(0);
      expect(
        await page.evaluate(
          () =>
            window.__nexusCalls.filter((c) => c.name === "salvarCompetencia").at(-1).payload.data
              .expected_version,
        ),
      ).toBe(2);
    },
  );
  await check("failed qualification save keeps fields and retries the same intent", async () => {
    await openQualification();
    await page.getByRole("button", { name: "Editar qualificação enviada", exact: true }).click();
    await form.getByLabel("Emissor", { exact: false }).fill("Emissor corrigido após falha de rede");
    await page.evaluate(() => {
      window.__failNextWrite = true;
    });
    await form.getByRole("button", { name: "Salvar qualificação", exact: true }).click();
    await expect(form.getByRole("alert")).toContainText("Falha de rede");
    await expect(form.getByLabel("Emissor", { exact: false })).toHaveValue(
      "Emissor corrigido após falha de rede",
    );
    await form.getByRole("button", { name: "Salvar qualificação", exact: true }).click();
    await expect(form).toHaveCount(0);
    const calls = await page.evaluate(() =>
      window.__nexusCalls.filter((c) => c.name === "salvarQualificacao"),
    );
    expect(calls).toHaveLength(2);
    expect(calls[0].payload.data.chave).toBe(calls[1].payload.data.chave);
  });
  await check(
    "review, return, correction, private evidence, validation and revocation retain one qualification",
    async () => {
      await openQualification();
      await decide("em_conferencia");
      await expect(form).toHaveCount(0);
      await decide("enviada");
      await expect(form.getByLabel("Motivo", { exact: false })).toHaveAttribute(
        "aria-invalid",
        "true",
      );
      await form
        .getByLabel("Motivo", { exact: false })
        .fill("Conferir identificação do emissor no comprovante");
      await form.getByRole("button", { name: "Confirmar decisão", exact: true }).click();
      await expect(form).toHaveCount(0);
      await page.getByRole("button", { name: "Editar qualificação enviada", exact: true }).click();
      await form.getByLabel("Emissor", { exact: false }).fill("Emissor conferido documentalmente");
      await form.getByRole("button", { name: "Salvar qualificação", exact: true }).click();
      await expect(form).toHaveCount(0);
      await decide("em_conferencia");
      await expect(form).toHaveCount(0);
      await decide("validada");
      await expect(form.getByRole("alert")).toContainText("Anexe evidência");
      await close();
      await page.getByLabel("Adicionar PDF ou imagem (até 20 MB)", { exact: true }).setInputFiles({
        name: "comprovante-isolado.png",
        mimeType: "image/png",
        buffer: Buffer.from(
          "iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mP8/x8AAwMCAO+aIOsAAAAASUVORK5CYII=",
          "base64",
        ),
      });
      await expect(
        page.getByRole("listitem").filter({ hasText: "comprovante-isolado.png" }),
      ).toBeVisible();
      await decide("validada");
      await expect(form).toHaveCount(0);
      await expect(
        page.getByLabel("Adicionar PDF ou imagem (até 20 MB)", { exact: true }),
      ).toHaveCount(0);
      await page.getByLabel("Consultar situação na data", { exact: true }).fill("2027-10-02");
      await expect(detail).toContainText("Validade encerrada na data consultada");
      expect(await page.evaluate(() => window.__nexusPeople.qualificacoes[0].estado)).toBe(
        "validada",
      );
      await decide("revogada", "Revogação documental justificada para teste isolado");
      await expect(form).toHaveCount(0);
      await expect(detail).toContainText("Revogada");
      await expect(
        page.getByRole("listitem").filter({ hasText: "comprovante-isolado.png" }),
      ).toBeVisible();
      expect(await page.evaluate(() => window.__nexusPeople.qualificacoes.length)).toBe(1);
    },
  );
  await check(
    "a network refresh failure hides stale detail while preserving the open draft",
    async () => {
      await openQualification();
      await page.getByRole("button", { name: "Editar qualificação enviada", exact: true }).click();
      await form
        .getByLabel("Emissor", { exact: false })
        .fill("Rascunho preservado na indisponibilidade");
      await refresh({ __peopleModuleNetwork: true });
      await expect(
        detail.getByText("Entidade emissora do ambiente de validação", { exact: true }),
      ).toHaveCount(0);
      await expect(form.getByLabel("Emissor", { exact: false })).toHaveValue(
        "Rascunho preservado na indisponibilidade",
      );
      await close();
    },
  );
  await check(
    "list, detail, mutation and comparison denials remove the editor and private files",
    async () => {
      for (const mode of ["list", "detail", "mutation", "comparison"]) {
        await openQualification();
        await page
          .getByRole("button", { name: "Editar qualificação enviada", exact: true })
          .click();
        await form.getByLabel("Emissor", { exact: false }).fill(`Rascunho privado ${mode}`);
        const name =
          mode === "list"
            ? "listarQualificacoes"
            : mode === "mutation"
              ? "salvarQualificacao"
              : "obterQualificacao";
        await page.evaluate((name) => {
          window.__peopleModuleDeniedName = name;
        }, name);
        if (mode === "mutation")
          await form.getByRole("button", { name: "Salvar qualificação", exact: true }).click();
        else if (mode === "comparison")
          await form.getByRole("button", { name: "Consultar versão atual", exact: true }).click();
        else await refresh({});
        await expect(form).toHaveCount(0);
        await expect(
          page.getByRole("region", { name: "Arquivos privados", exact: true }),
        ).toHaveCount(0);
        await expect(page.getByRole("alert")).toContainText("indisponível para seu acesso atual");
        await page.evaluate(() => {
          window.__peopleModuleDeniedName = "";
        });
        await page.getByRole("button", { name: "Tentar novamente", exact: true }).click();
        await expect(detail).toBeVisible();
      }
    },
  );
  await check(
    "canonical links open the same person and competence, with browser return to the qualification",
    async () => {
      await openQualification();
      await page.getByRole("button", { name: "Abrir cadastro da pessoa", exact: true }).click();
      await expect(page).toHaveURL(/area=pessoas.*pessoa=30000000-0000-4000-8000-000000000001/);
      await expect(
        page.getByRole("region", { name: "Ficha da pessoa selecionada", exact: true }),
      ).toBeVisible();
      await page.goBack({ waitUntil: "networkidle" });
      await expect(detail).toBeVisible();
      await page.getByRole("button", { name: "Abrir competência", exact: true }).click();
      await expect(
        page.getByRole("region", { name: "Ficha da competência", exact: true }),
      ).toBeVisible();
      expect(new URL(page.url()).searchParams.get("competencia")).toBe(competenceId);
    },
  );
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
console.log(
  JSON.stringify({
    layouts: report.layouts.length,
    checks: report.checks.length,
    errors: report.errors,
  }),
);
