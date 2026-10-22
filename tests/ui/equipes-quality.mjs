// Actual Equipes source UI, isolated mutable transport only. SQL/Auth/RLS are separate evidence.
import { chromium, expect } from "@playwright/test";
import { mkdir, writeFile } from "node:fs/promises";
import { evidenceRoot } from "./evidence.mjs";

const base = process.env.NEXUS_UI_URL || "http://127.0.0.1:4182";
const directory = `${evidenceRoot}/equipes`;
await mkdir(directory, { recursive: true });
const browser = await chromium.launch({ headless: true });
const page = await browser.newPage({ locale: "pt-BR", reducedMotion: "reduce" });
page.setDefaultTimeout(10000);
const form = page.getByRole("dialog");
const teamId = "a1000000-0000-4000-8000-000000000001";
const personId = "30000000-0000-4000-8000-000000000001";
const secondPersonId = "30000000-0000-4000-8000-000000000002";
const teamName = "Equipe técnica de instalação e inspeção da unidade norte";
const report = {
  profile: process.env.NEXUS_UI_BEHAVIORS_ONLY === "1" ? "behaviors-only" : "layouts-and-behaviors",
  method:
    "Source UI with synthetic transport fixtures. Does not prove connected Auth, SQL/RLS, real persistence, concurrent transactions or physical-device behavior. Reload check uses the fixed fixture identity; newly created state is in-memory only.",
  layouts: [],
  checks: [],
  errors: [],
  success: false,
};
page.on("pageerror", (error) => report.errors.push(error.message));

async function go(extra = "") {
  await page.goto(`${base}/?page=equipe&area=equipes${extra}`, {
    waitUntil: "networkidle",
    timeout: 30000,
  });
  await page.getByRole("heading", { name: "Equipes e participações", exact: true }).waitFor();
  await page.evaluate(() => document.fonts.ready);
}
async function detail() {
  await go(`&equipe=${teamId}`);
  await expect(page.getByRole("heading", { name: teamName, exact: true })).toBeVisible();
}
async function edit() {
  await page.getByRole("button", { name: "Editar equipe e situação", exact: true }).click();
  await expect(form).toBeVisible();
}
async function save() {
  await form.getByRole("button", { name: "Salvar equipe", exact: true }).click();
}
async function close() {
  await page.keyboard.press("Escape");
  const discard = form.getByRole("button", { name: "Descartar alterações", exact: true });
  if (await discard.count()) await discard.click();
  await expect(form).toHaveCount(0);
}
async function refetch(values = {}) {
  await page.evaluate((patch) => {
    Object.assign(window, patch);
    window.dispatchEvent(new Event("visibilitychange"));
  }, values);
}
async function calls(name) {
  return page.evaluate((value) => window.__nexusCalls.filter((call) => call.name === value), name);
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
  if (await form.count()) {
    const box = await form.boundingBox();
    expect(box.x).toBeGreaterThanOrEqual(0);
    expect(box.y).toBeGreaterThanOrEqual(0);
    expect(box.x + box.width).toBeLessThanOrEqual(width + 1);
    expect(box.y + box.height).toBeLessThanOrEqual((width < 768 ? 844 : 900) + 1);
  }
  report.layouts.push({ name, ...metrics });
  if ([390, 1366].includes(width))
    await page.screenshot({ path: `${directory}/${name}-${width}.png` });
}
async function includePerson(id, inicio, fim = "") {
  await page.getByRole("button", { name: "Incluir pessoa", exact: true }).click();
  const people = form.getByRole("combobox", { name: /^Pessoa/ });
  await expect(people.locator(`option[value="${id}"]`)).toHaveCount(1);
  await people.selectOption(id);
  await form.getByLabel(/^Primeiro dia da participação/).fill(inicio);
  if (fim) await form.getByLabel(/^Último dia da participação/).fill(fim);
  await form.getByRole("button", { name: "Confirmar participação", exact: true }).click();
  await expect(form).toHaveCount(0);
}
async function openBaseFromList() {
  const mobile = page.getByRole("button", { name: `Abrir equipe ${teamName}`, exact: true });
  if (await mobile.isVisible()) await mobile.click();
  else
    await page
      .getByRole("row")
      .filter({ hasText: teamName })
      .getByRole("button", { name: "Abrir", exact: true })
      .click();
  await expect(page.getByRole("heading", { name: teamName, exact: true })).toBeVisible();
}
async function assertDenied() {
  await expect(form).toHaveCount(0);
  await expect(page.getByRole("alert")).toContainText("Equipe indisponível para seu acesso atual");
  await expect(page.getByRole("heading", { name: teamName, exact: true })).toHaveCount(0);
  await expect(page.locator('[aria-label="Ficha da equipe"]')).toHaveCount(0);
  await expect(page.getByRole("button", { name: "Nova equipe", exact: true })).toHaveCount(0);
  await expect(page.getByRole("button", { name: "Incluir pessoa", exact: true })).toHaveCount(0);
}

try {
  for (const width of process.env.NEXUS_UI_BEHAVIORS_ONLY === "1"
    ? []
    : [360, 390, 768, 1024, 1366, 1440]) {
    await page.setViewportSize({ width, height: width < 768 ? 844 : 900 });
    await go();
    await expect(page.getByRole("button", { name: "Nova equipe", exact: true })).toBeVisible();
    await layout("lista", width);
    await page.getByRole("button", { name: "Nova equipe", exact: true }).click();
    await layout("nova-equipe", width);
    await close();
    await detail();
    await layout("ficha", width);
    if (width < 1280)
      await expect(
        page.getByRole("searchbox", { name: "Buscar equipe", exact: true }),
      ).toBeHidden();
    else
      await expect(
        page.getByRole("searchbox", { name: "Buscar equipe", exact: true }),
      ).toBeVisible();
    await edit();
    await layout("editar-equipe", width);
    await close();
    await page.getByRole("button", { name: "Incluir pessoa", exact: true }).click();
    await layout("incluir-pessoa", width);
    await close();
    await page.getByRole("button", { name: "Encerrar participação", exact: true }).click();
    await layout("encerrar-participacao", width);
    await close();
  }
  await page.setViewportSize({ width: 390, height: 844 });
  await check(
    "a delayed post-save refetch never closes a later editor or discards its draft",
    async () => {
      await page.setViewportSize({ width: 1366, height: 900 });
      await detail();
      await edit();
      await form
        .getByRole("textbox", { name: "Nome da equipe *", exact: true })
        .fill("Equipe salva antes da resposta retida");
      await page.evaluate(() => {
        window.__equipesDeferList = true;
      });
      await save();
      await expect(form).toHaveCount(0);
      await expect.poll(() => page.evaluate(() => window.__equipesListHeld)).toBe(true);
      await page.getByRole("button", { name: "Nova equipe", exact: true }).click();
      const secondDraft = form.getByRole("textbox", { name: "Nome da equipe *", exact: true });
      await secondDraft.fill("Segundo rascunho preservado depois do retorno antigo");
      await expect(form.getByRole("heading", { name: "Nova equipe", exact: true })).toBeVisible();
      await page.evaluate(() => window.__releaseEquipesList());
      await expect.poll(() => page.evaluate(() => window.__equipesListReturned)).toBe(true);
      await page.evaluate(
        () => new Promise((resolve) => requestAnimationFrame(() => requestAnimationFrame(resolve))),
      );
      await expect(form.getByRole("heading", { name: "Nova equipe", exact: true })).toBeVisible();
      await expect(secondDraft).toHaveValue("Segundo rascunho preservado depois do retorno antigo");
      expect(
        await page.evaluate(
          (id) => window.__nexusPeople.equipes.find((row) => row.id === id).nome,
          teamId,
        ),
      ).toBe("Equipe salva antes da resposta retida");
      await page.keyboard.press("Escape");
      await expect(form.getByText(/Há alterações não salvas/)).toBeVisible();
      await form.getByRole("button", { name: "Continuar editando", exact: true }).click();
      await expect(secondDraft).toHaveValue("Segundo rascunho preservado depois do retorno antigo");
      await close();
      await page.setViewportSize({ width: 390, height: 844 });
    },
  );
  await check(
    "creation errors focus fields and dirty dismissal requires an explicit choice",
    async () => {
      await go();
      const trigger = page.getByRole("button", { name: "Nova equipe", exact: true });
      await trigger.focus();
      await page.keyboard.press("Enter");
      const name = form.getByRole("textbox", { name: /^Nome da equipe/ });
      await expect(name).toBeFocused();
      await save();
      await expect(name).toBeFocused();
      await expect(name).toHaveAttribute("aria-invalid", "true");
      await expect(name).toHaveAccessibleName("Nome da equipe *");
      await expect(name).toHaveAttribute("aria-describedby", /error/);
      await name.fill("Rascunho de equipe ainda não salvo");
      for (let i = 0; i < 8; i++) {
        await page.keyboard.press("Tab");
        expect(
          await page.evaluate(() => !!document.activeElement?.closest('[role="dialog"]')),
        ).toBe(true);
      }
      await page.keyboard.press("Escape");
      await expect(form.getByText(/Há alterações não salvas/)).toBeVisible();
      await form.getByRole("button", { name: "Continuar editando", exact: true }).click();
      await expect(name).toHaveValue("Rascunho de equipe ainda não salvo");
      await close();
      await expect(trigger).toBeFocused();
    },
  );
  await check(
    "team creation and temporal replacement preserve both people and the closed period",
    async () => {
      await go();
      await page.getByRole("button", { name: "Nova equipe", exact: true }).click();
      await form
        .getByRole("textbox", { name: /^Nome da equipe/ })
        .fill("Equipe da jornada de vigências");
      await save();
      await expect(form).toHaveCount(0);
      await expect(
        page.getByRole("heading", { name: "Equipe da jornada de vigências", exact: true }),
      ).toBeVisible();
      const createdId = new URL(page.url()).searchParams.get("equipe");
      expect(createdId).toMatch(/^[0-9a-f-]{36}$/);
      await includePerson(personId, "2026-10-01");
      await includePerson(secondPersonId, "2026-10-01");
      const firstName = await page.evaluate(
        (id) => window.__nexusOperational.pessoas.find((p) => p.id === id).nome,
        personId,
      );
      const memberCard = page
        .locator('[aria-label="Ficha da equipe"] li')
        .filter({ hasText: firstName });
      await memberCard.getByRole("button", { name: "Encerrar participação", exact: true }).click();
      await form.getByLabel(/^Último dia da participação/).fill("2026-10-22");
      await form
        .getByRole("textbox", { name: /^Motivo do encerramento/ })
        .fill("Substituição planejada preservando o histórico");
      await form.getByRole("button", { name: "Confirmar encerramento", exact: true }).click();
      await expect(form).toHaveCount(0);
      await includePerson(personId, "2026-10-23");
      const periods = await page.evaluate(
        (id) =>
          window.__nexusPeople.membros
            .filter((m) => m.equipe_id === id)
            .map((m) => ({ pessoa: m.pessoa_id, inicio: m.inicio, fim: m.fim })),
        createdId,
      );
      expect(periods).toHaveLength(3);
      expect(periods).toContainEqual({ pessoa: personId, inicio: "2026-10-01", fim: "2026-10-22" });
      expect(periods).toContainEqual({ pessoa: personId, inicio: "2026-10-23", fim: null });
      expect(periods).toContainEqual({ pessoa: secondPersonId, inicio: "2026-10-01", fim: null });
      const closed = page
        .locator('[aria-label="Ficha da equipe"] li')
        .filter({ hasText: /22\/10\/2026 \(inclusive\)/ });
      await expect(
        closed.getByRole("button", { name: "Encerrar participação", exact: true }),
      ).toHaveCount(0);
    },
  );
  await check("inclusive date overlap is rejected without losing the completed form", async () => {
    await detail();
    await page.getByRole("button", { name: "Incluir pessoa", exact: true }).click();
    const people = form.getByRole("combobox", { name: /^Pessoa/ });
    await expect(people.locator(`option[value="${personId}"]`)).toHaveCount(1);
    await people.selectOption(personId);
    await form.getByLabel(/^Primeiro dia da participação/).fill("2026-10-01");
    await form.getByRole("button", { name: "Confirmar participação", exact: true }).click();
    await expect(form.getByRole("alert")).toContainText(
      "A pessoa já pertence à equipe nesse período",
    );
    await expect(people).toHaveValue(personId);
    await expect(form.getByLabel(/^Primeiro dia da participação/)).toHaveValue("2026-10-01");
    await close();
  });
  await check(
    "fixed fixture URL reload and return preserve the search recut and focus",
    async () => {
      await go();
      await page
        .getByRole("searchbox", { name: "Buscar equipe", exact: true })
        .fill("unidade norte");
      await expect
        .poll(async () => (await calls("listarEquipes")).at(-1).payload.data.busca)
        .toBe("unidade norte");
      const trigger = page.getByRole("button", { name: `Abrir equipe ${teamName}`, exact: true });
      await trigger.click();
      await expect(page).toHaveURL(new RegExp(`equipe=${teamId}`));
      await page.getByRole("button", { name: "Voltar à lista de equipes", exact: true }).click();
      await expect(trigger).toBeFocused();
      await trigger.click();
      await page.reload({ waitUntil: "networkidle" });
      await expect(page.getByRole("heading", { name: teamName, exact: true })).toBeVisible();
      await page.getByRole("button", { name: "Voltar à lista de equipes", exact: true }).click();
      await expect(page.getByRole("searchbox", { name: "Buscar equipe", exact: true })).toHaveValue(
        "unidade norte",
      );
      expect(new URL(page.url()).searchParams.has("equipe")).toBe(false);
    },
  );
  await check(
    "authorized member opens the canonical person record and keeps the URL on reload",
    async () => {
      await detail();
      const personName = await page.evaluate(
        (id) => window.__nexusOperational.pessoas.find((p) => p.id === id).nome,
        personId,
      );
      await page
        .getByRole("region", { name: "Ficha da equipe", exact: true })
        .getByRole("button", { name: "Abrir cadastro da pessoa", exact: true })
        .click();
      await expect.poll(() => new URL(page.url()).searchParams.get("area")).toBe("pessoas");
      expect(new URL(page.url()).searchParams.get("pessoa")).toBe(personId);
      await expect(page.getByRole("heading", { name: personName, exact: true })).toBeVisible();
      await page.reload({ waitUntil: "networkidle" });
      await expect(page.getByRole("heading", { name: personName, exact: true })).toBeVisible();
    },
  );
  await check(
    "network failure keeps the draft and retries the same idempotent intent",
    async () => {
      await go();
      await page.getByRole("button", { name: "Nova equipe", exact: true }).click();
      await form
        .getByRole("textbox", { name: /^Nome da equipe/ })
        .fill("Equipe recuperada após falha");
      await page.evaluate(() => {
        window.__failNextWrite = true;
      });
      await save();
      await expect(form.getByRole("alert")).toContainText("Falha de rede");
      await expect(form.getByRole("textbox", { name: /^Nome da equipe/ })).toHaveValue(
        "Equipe recuperada após falha",
      );
      await save();
      await expect(form).toHaveCount(0);
      const writes = await calls("salvarEquipe");
      expect(writes).toHaveLength(2);
      expect(writes[0].payload.data.chave).toBe(writes[1].payload.data.chave);
      expect(
        await page.evaluate(
          () =>
            window.__nexusPeople.equipes.filter((e) => e.nome === "Equipe recuperada após falha")
              .length,
        ),
      ).toBe(1);
    },
  );
  await check(
    "polling and comparison do not advance the draft version until explicit adoption",
    async () => {
      await detail();
      await edit();
      const name = form.getByRole("textbox", { name: /^Nome da equipe/ });
      await name.fill("Nome local preservado durante comparação");
      const readCount = (await calls("obterEquipe")).length;
      await page.evaluate(() => {
        window.__nexusPeople.equipes[0].version = 2;
        window.__nexusPeople.equipes[0].nome = "Nome salvo por outra sessão";
        window.dispatchEvent(new Event("visibilitychange"));
      });
      await expect.poll(async () => (await calls("obterEquipe")).length).toBeGreaterThan(readCount);
      await save();
      await expect(form.getByRole("alert")).toContainText("O registro mudou");
      expect((await calls("salvarEquipe")).at(-1).payload.data.expected_version).toBe(1);
      await form.getByRole("button", { name: "Consultar versão atual", exact: true }).click();
      await expect(form.getByText("Versão salva 2", { exact: true })).toBeVisible();
      await expect(name).toHaveValue("Nome local preservado durante comparação");
      await save();
      expect((await calls("salvarEquipe")).at(-1).payload.data.expected_version).toBe(1);
      await form
        .getByRole("button", { name: "Usar versão atual e manter preenchimento", exact: true })
        .click();
      await expect(name).toHaveValue("Nome local preservado durante comparação");
      await save();
      await expect(form).toHaveCount(0);
      const writes = await calls("salvarEquipe");
      expect(writes.map((c) => c.payload.data.expected_version)).toEqual([1, 1, 2]);
      expect(writes[0].payload.data.chave).toBe(writes[1].payload.data.chave);
      expect(writes[2].payload.data.chave).not.toBe(writes[1].payload.data.chave);
    },
  );
  await check(
    "read network failure hides old detail while preserving an unsaved edit",
    async () => {
      await detail();
      await edit();
      await form
        .getByRole("textbox", { name: /^Nome da equipe/ })
        .fill("Texto recuperável sem conexão");
      await refetch({ __peopleModuleNetwork: true });
      await expect(
        page
          .locator('[aria-label="Ficha da equipe"]')
          .getByRole("heading", { name: teamName, exact: true }),
      ).toHaveCount(0);
      await expect(form.getByRole("textbox", { name: /^Nome da equipe/ })).toHaveValue(
        "Texto recuperável sem conexão",
      );
      await expect(form).toBeVisible();
      await close();
      await refetch({ __peopleModuleNetwork: false });
      await expect(page.getByRole("heading", { name: teamName, exact: true })).toBeVisible();
    },
  );
  await check(
    "list denial removes a new editor and recovers only through a fresh authorized read",
    async () => {
      await go();
      await page.getByRole("button", { name: "Nova equipe", exact: true }).click();
      await form
        .getByRole("textbox", { name: /^Nome da equipe/ })
        .fill("Rascunho privado não publicado");
      await refetch({ __peopleModuleDeniedKind: "equipes" });
      await assertDenied();
      await page.evaluate(() => {
        window.__peopleModuleDeniedKind = undefined;
        window.__nexusPeople.equipes[0].nome = "Equipe relida após autorização";
      });
      await page.getByRole("button", { name: "Tentar novamente", exact: true }).click();
      await expect(
        page.getByRole("article").getByText("Equipe relida após autorização", { exact: true }),
      ).toBeVisible();
      await expect(page.getByText(teamName, { exact: true })).toHaveCount(0);
    },
  );
  await check(
    "detail denial removes the editor and prevents cached private content from reappearing",
    async () => {
      await detail();
      await edit();
      await form.getByRole("textbox", { name: /^Nome da equipe/ }).fill("Nome privado em edição");
      await refetch({ __peopleModuleDenied: true });
      await assertDenied();
      const before = (await calls("obterEquipe")).length;
      await page.evaluate(() => {
        window.__peopleModuleDenied = false;
        window.__nexusPeople.equipes[0].nome = "Detalhe novo após reautorizar";
      });
      await page.getByRole("button", { name: "Tentar novamente", exact: true }).click();
      await expect(
        page.getByRole("heading", { name: "Detalhe novo após reautorizar", exact: true }),
      ).toBeVisible();
      expect((await calls("obterEquipe")).length).toBeGreaterThan(before);
      await expect(page.getByRole("heading", { name: teamName, exact: true })).toHaveCount(0);
    },
  );
  await check("command denial closes the private form immediately", async () => {
    await detail();
    await edit();
    await form.getByRole("textbox", { name: /^Nome da equipe/ }).fill("Rascunho negado no comando");
    await page.evaluate(() => {
      window.__peopleModuleDeniedKind = "equipes";
    });
    await save();
    await assertDenied();
    expect(await calls("salvarEquipe")).toHaveLength(1);
    expect(await page.evaluate(() => window.__nexusPeople.equipes[0].nome)).toBe(teamName);
  });
  await check("comparison denial closes the private form without adopting data", async () => {
    await detail();
    await edit();
    await form
      .getByRole("textbox", { name: /^Nome da equipe/ })
      .fill("Rascunho negado na comparação");
    await page.evaluate(() => {
      window.__peopleModuleDeniedKind = "equipes";
    });
    await form.getByRole("button", { name: "Consultar versão atual", exact: true }).click();
    await assertDenied();
    expect(await calls("salvarEquipe")).toHaveLength(0);
  });
  await check(
    "archiving preserves existing periods and reactivation restores new inclusions",
    async () => {
      await detail();
      await edit();
      await form.getByRole("combobox", { name: "Situação", exact: true }).selectOption("false");
      await save();
      await expect(form).toHaveCount(0);
      await expect(page.getByRole("button", { name: "Incluir pessoa", exact: true })).toHaveCount(
        0,
      );
      expect(await page.evaluate(() => window.__nexusPeople.membros.length)).toBe(1);
      await edit();
      await form.getByRole("combobox", { name: "Situação", exact: true }).selectOption("true");
      await save();
      await expect(form).toHaveCount(0);
      await expect(page.getByRole("button", { name: "Incluir pessoa", exact: true })).toBeVisible();
    },
  );
  await check(
    "pagination and internal Back preserve the server recut without resurrecting a cleared search",
    async () => {
      await go();
      await page.evaluate(() => {
        const base = window.__nexusPeople.equipes[0];
        for (let i = 2; i <= 31; i++)
          window.__nexusPeople.equipes.push({
            ...base,
            id: `a1000000-0000-4000-8000-${String(i).padStart(12, "0")}`,
            nome: `Equipe adicional ${String(i).padStart(2, "0")}`,
          });
        window.dispatchEvent(new Event("visibilitychange"));
      });
      const next = page.getByRole("button", { name: "Próxima", exact: true });
      await expect(next).toBeEnabled();
      await next.click();
      await expect
        .poll(async () => (await calls("listarEquipes")).at(-1).payload.data.pagina)
        .toBe(1);
      await expect(page).toHaveURL(/pagina=1/);
      await page
        .getByRole("button", { name: "Abrir equipe Equipe adicional 26", exact: true })
        .click();
      await expect(
        page.getByRole("heading", { name: "Equipe adicional 26", exact: true }),
      ).toBeVisible();
      await page.goBack();
      await expect(
        page.getByRole("searchbox", { name: "Buscar equipe", exact: true }),
      ).toBeVisible();
      expect(new URL(page.url()).searchParams.get("pagina")).toBe("1");
      expect(new URL(page.url()).searchParams.has("equipe")).toBe(false);
      const search = page.getByRole("searchbox", { name: "Buscar equipe", exact: true });
      await search.fill("adicional");
      await expect
        .poll(async () => (await calls("listarEquipes")).at(-1).payload.data.busca)
        .toBe("adicional");
      await page.getByRole("button", { name: "Limpar filtros", exact: true }).click();
      // The empty recut can be a fresh React Query cache hit; do not require a redundant call.
      await expect(
        page.getByRole("button", { name: `Abrir equipe ${teamName}`, exact: true }),
      ).toBeVisible();
      await page.waitForTimeout(450);
      await expect(search).toHaveValue("");
      expect(new URL(page.url()).searchParams.get("busca") || "").toBe("");
    },
  );
  await check(
    "empty search results and query failure remain distinct recoverable states",
    async () => {
      await go();
      await page
        .getByRole("searchbox", { name: "Buscar equipe", exact: true })
        .fill("Sem correspondência isolada");
      await expect(page.getByText("Nenhuma equipe neste recorte", { exact: true })).toBeVisible();
      await refetch({ __peopleModuleNetwork: true });
      await expect(
        page.getByRole("button", { name: "Tentar novamente", exact: true }),
      ).toBeVisible();
      await expect(page.getByText("Nenhuma equipe neste recorte", { exact: true })).toHaveCount(0);
    },
  );
  await check(
    "restricted profile cannot manage teams or enumerate other people's memberships",
    async () => {
      await go(`&scenario=restricted&equipe=${teamId}`);
      await expect(page.getByRole("heading", { name: teamName, exact: true })).toBeVisible();
      for (const name of [
        "Nova equipe",
        "Editar equipe e situação",
        "Incluir pessoa",
        "Encerrar participação",
      ])
        await expect(page.getByRole("button", { name, exact: true })).toHaveCount(0);
      await expect(
        page.getByText("Seu perfil consulta somente seus próprios vínculos autorizados.", {
          exact: true,
        }),
      ).toBeVisible();
      expect(await calls("buscarPessoasEquipe")).toHaveLength(0);
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
