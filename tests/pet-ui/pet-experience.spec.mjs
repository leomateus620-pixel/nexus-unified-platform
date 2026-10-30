// Real PET components + canonical SQL writes in the explicit loopback laboratory only.
// Run: PET_LAB_SEED=/path/to/seed-output.json node tests/pet-ui/pet-experience.spec.mjs
// Creates its own PETs. It never resets the cluster or changes the baseline PET.
import { chromium, expect } from "@playwright/test";
import { randomUUID } from "node:crypto";
import { mkdir, readFile, writeFile } from "node:fs/promises";

const base = new URL(process.env.PET_LAB_URL || "http://127.0.0.1:4193");
if (!["127.0.0.1", "localhost"].includes(base.hostname) || base.protocol !== "http:")
  throw new Error("PET experience tests require the explicit local HTTP laboratory.");
if (!process.env.PET_LAB_SEED)
  throw new Error("Set PET_LAB_SEED to the isolated seed's JSON output.");
const seed = JSON.parse(await readFile(process.env.PET_LAB_SEED, "utf8"));
if (seed.org !== "a0300000-0000-4000-8000-000000000001")
  throw new Error("The seed is not the controlled PET laboratory organization.");
const evidence = process.env.PET_LAB_EVIDENCE || "/tmp/nexus-pet-experience";
await mkdir(evidence, { recursive: true });
const browser = await chromium.launch({
  headless: true,
  ...(process.env.NEXUS_UI_BROWSER_EXECUTABLE
    ? { executablePath: process.env.NEXUS_UI_BROWSER_EXECUTABLE }
    : process.platform === "darwin"
      ? { executablePath: "/Applications/Google Chrome.app/Contents/MacOS/Google Chrome" }
      : {}),
});
const context = await browser.newContext({
  locale: "pt-BR",
  timezoneId: "Asia/Tokyo",
  reducedMotion: "reduce",
  viewport: { width: 1366, height: 1000 },
});
const page = await context.newPage();
const report = {
  method:
    "Real PET JSX/hooks and canonical PostgreSQL functions through tests/pet-ui. Browser timezone Tokyo; PET timezone São Paulo. No real Supabase Auth, private Storage HTTP or signature provider.",
  limitations: [
    "The laboratory useBlocker is a stub: navigation-discard guards are not claimed as exercised.",
    "Network loss is injected only at the local browser transport.",
    "All new records belong to the explicit disposable laboratory and remain available for inspection.",
  ],
  checks: [],
  createdPetIds: [],
  createdOsIds: [],
  errors: [],
  commands: [],
};
const marker = "PET UI " + Date.now();
let petId;
let injection = "";
let lostResponse;
page.on("pageerror", (error) => report.errors.push(error.message));
await page.route("**/__pet_lab", async (route) => {
  const body = route.request().postDataJSON();
  if (body.name === "pet_executar") {
    report.commands.push(structuredClone(body.data.comando));
    if (body.data.comando.comando === "salvar_rascunho" && injection) {
      const mode = injection;
      injection = "";
      if (mode === "lost-response") {
        const response = await route.fetch();
        if (!response.ok())
          throw new Error("Lost-response setup did not commit in the laboratory.");
        lostResponse = await response.json();
      }
      await route.abort("failed");
      return;
    }
  }
  await route.continue();
});
async function rpc(name, data) {
  const response = await context.request.post(new URL("/__pet_lab", base).href, {
    data: { name, data: { organization_id: seed.org, ...data } },
  });
  const value = await response.json();
  if (!response.ok()) throw new Error(`${name}: ${value.error}`);
  return value;
}
const detail = () => rpc("pet_obter", { id: petId });
const command = (comando, dados) =>
  rpc("pet_executar", { comando: { comando, dados, chave: randomUUID() } });
const steps = () => page.getByRole("navigation", { name: "Etapas da preparação", exact: true });
const phase = (name) =>
  page
    .getByRole("navigation", { name: "Fases da PET", exact: true })
    .getByRole("button", { name: new RegExp(name + "$") });
const save = () => page.getByRole("button", { name: "Salvar", exact: true });
async function check(name, work) {
  await work();
  report.checks.push(name);
  console.log("PASS: " + name);
}
async function saved() {
  await expect(page.locator(".nx-pet-save-state")).toContainText("confirmada no servidor");
}
function draftData(value, atividade = value.pet.atividade) {
  return {
    pet_id: value.pet.id,
    expected_version: value.pet.version,
    atividade,
    termino_previsto: value.pet.termino_previsto,
    conteudo: value.pet.conteudo || {},
    modelo_id: value.pet.modelo_versao_id || null,
    participantes: value.participantes
      .filter((person) => !person.fim && !person.fim_vigencia)
      .map((person) => ({
        pessoa_id: person.pessoa_id,
        funcao: person.funcao,
        classificacao: person.classificacao,
        empresa: person.empresa || "",
      })),
    respostas: value.respostas.map((answer) => ({
      item: answer.item,
      resposta: answer.resposta,
      justificativa: answer.justificativa || "",
    })),
  };
}
function futureCivil() {
  const parts = Object.fromEntries(
    new Intl.DateTimeFormat("en-CA", {
      timeZone: "America/Sao_Paulo",
      year: "numeric",
      month: "2-digit",
      day: "2-digit",
      hour: "2-digit",
      minute: "2-digit",
      hourCycle: "h23",
    })
      .formatToParts(new Date(Date.now() + 3 * 60 * 60 * 1000))
      .map((part) => [part.type, part.value]),
  );
  return `${parts.year}-${parts.month}-${parts.day}T${parts.hour}:${parts.minute}`;
}
try {
  await check(
    "OS creation picker supports keyboard, returns focus, and double-click creates one real PET",
    async () => {
      await page.goto(new URL(`/execucao/ordens/${seed.os}`, base).href, {
        waitUntil: "networkidle",
      });
      await page.getByRole("button", { name: "Criar PET", exact: true }).click();
      const dialog = page.getByRole("dialog", {
        name: "Criar permissão de entrada e trabalho",
        exact: true,
      });
      const trigger = dialog.getByRole("button", { name: "Espaço confinado", exact: true });
      await trigger.click();
      const search = page.getByRole("combobox", { name: "Buscar espaço confinado", exact: true });
      await expect(search).toBeFocused();
      await search.fill("EC-01");
      await search.press("Enter");
      await expect(trigger).toBeFocused();
      await dialog.getByLabel("Atividade a realizar", { exact: true }).fill(marker);
      await dialog.getByLabel(/^Validade prevista/).fill(futureCivil());
      const createCalls = report.commands.filter((value) => value.comando === "criar_pet").length;
      await dialog
        .getByRole("button", { name: "Criar e preparar PET", exact: true })
        .evaluate((button) => {
          button.click();
          button.click();
        });
      await expect(page).toHaveURL(/\/execucao\/pets\/[a-f0-9-]+$/);
      petId = new URL(page.url()).pathname.split("/").at(-1);
      report.createdPetIds.push(petId);
      await expect(page.getByLabel("Atividade a realizar", { exact: true })).toHaveValue(marker);
      expect(
        report.commands.filter((value) => value.comando === "criar_pet").length - createCalls,
      ).toBe(1);
      expect((await detail()).pet.atividade).toBe(marker);
    },
  );
  await check(
    "preparation navigation and responsive resize retain the same unsaved draft",
    async () => {
      await page.getByLabel("Atividade a realizar", { exact: true }).fill(marker + " · navegação");
      await steps().getByRole("button", { name: "Equipe" }).click();
      await page.setViewportSize({ width: 390, height: 844 });
      await steps().getByRole("button", { name: "Contexto" }).click();
      await expect(page.getByLabel("Atividade a realizar", { exact: true })).toHaveValue(
        marker + " · navegação",
      );
      await page.setViewportSize({ width: 1366, height: 1000 });
      const before = await detail();
      const count = report.commands.length;
      await save().evaluate((button) => {
        button.click();
        button.click();
      });
      await saved();
      const after = await detail();
      expect(after.pet.atividade).toBe(marker + " · navegação");
      expect(after.pet.version).toBe(before.pet.version + 1);
      expect(
        report.commands.slice(count).filter((value) => value.comando === "salvar_rascunho"),
      ).toHaveLength(1);
      await page.screenshot({ path: evidence + "/01-preparacao.png", fullPage: true });
    },
  );
  await check(
    "one searchable people picker adds an ID once in its role and persists it",
    async () => {
      await steps().getByRole("button", { name: "Equipe" }).click();
      const trigger = page.getByRole("button", { name: "Pessoa cadastrada", exact: true });
      await trigger.click();
      const search = page.getByRole("combobox", { name: "Buscar pessoa cadastrada", exact: true });
      await search.fill("trabalhador");
      await search.press("Enter");
      await expect(trigger).toBeFocused();
      await page.getByRole("button", { name: "Adicionar à equipe", exact: true }).click();
      await expect(
        page
          .locator(".pet-team-group")
          .filter({ has: page.getByRole("heading", { name: /Trabalhador autorizado/ }) }),
      ).toContainText("Trabalhador Demonstração");
      await trigger.click();
      await search.fill("trabalhador");
      await search.press("Enter");
      await expect(
        page.getByRole("button", { name: "Adicionar à equipe", exact: true }),
      ).toBeDisabled();
      await page
        .getByLabel("Contatos operacionais, emergência e resgate", { exact: true })
        .fill("Canal real descrito no procedimento de laboratório");
      await save().click();
      await saved();
      expect(
        (await detail()).participantes.filter(
          (person) => !person.fim && person.funcao === "trabalhador",
        ),
      ).toHaveLength(1);
      await page.screenshot({ path: evidence + "/02-equipe.png", fullPage: true });
    },
  );
  await check(
    "hazard fields stay inline; changing a control choice retains its justification",
    async () => {
      await steps().getByRole("button", { name: "Segurança" }).click();
      const chemicals = page
        .locator(".pet-danger-group")
        .filter({ has: page.locator("summary").filter({ hasText: "Químicos" }) });
      await chemicals.locator("summary").first().click();
      await chemicals.getByRole("checkbox", { name: "Poeiras", exact: true }).check();
      await chemicals
        .getByLabel("Medida preventiva · Poeiras", { exact: true })
        .fill("Medida informada na verificação de campo");
      await chemicals
        .getByLabel("Referência da evidência · Poeiras", { exact: true })
        .fill("Referência preservada no item selecionado");
      const isolation = page.locator(".pet-control-row").filter({
        has: page.locator("legend").filter({ hasText: "Isolamento com barreira física" }),
      });
      await isolation.getByRole("radio", { name: "Não", exact: true }).check();
      const justification = isolation.getByRole("textbox");
      await justification.fill("Observação preservada ao alternar a resposta");
      await isolation.getByRole("radio", { name: "Sim", exact: true }).check();
      await expect(justification).toHaveValue("Observação preservada ao alternar a resposta");
      const epi = page
        .locator(".pet-control-group")
        .filter({ has: page.locator("summary").filter({ hasText: "EPI · proteção individual" }) });
      expect(await epi.evaluate((element) => element.open)).toBe(false);
      await save().click();
      await saved();
      const value = await detail();
      expect(value.pet.conteudo.perigos).toEqual(
        expect.arrayContaining([
          expect.objectContaining({
            perigo: "Poeiras",
            medida: "Medida informada na verificação de campo",
          }),
        ]),
      );
      expect(value.respostas.find((answer) => answer.item === "isolamento")).toMatchObject({
        resposta: "sim",
        justificativa: "Observação preservada ao alternar a resposta",
      });
      await page.screenshot({ path: evidence + "/03-seguranca.png", fullPage: true });
    },
  );
  await check("network failure retains inputs and retry confirms one real write", async () => {
    await steps().getByRole("button", { name: "Contexto" }).click();
    const before = await detail();
    await page.getByLabel("Atividade a realizar", { exact: true }).fill(marker + " · rede");
    injection = "network";
    await save().click();
    await expect(page.getByRole("alert").first()).toBeVisible();
    await expect(save()).toBeEnabled();
    await expect(page.getByLabel("Atividade a realizar", { exact: true })).toHaveValue(
      marker + " · rede",
    );
    expect((await detail()).pet.version).toBe(before.pet.version);
    await save().click();
    await saved();
    expect((await detail()).pet.version).toBe(before.pet.version + 1);
  });
  await check(
    "a committed write with lost response retries with the same idempotency key",
    async () => {
      const before = await detail();
      await page
        .getByLabel("Atividade a realizar", { exact: true })
        .fill(marker + " · resposta perdida");
      const start = report.commands.length;
      injection = "lost-response";
      await save().click();
      await expect(page.getByRole("alert").first()).toBeVisible();
      await expect(save()).toBeEnabled();
      expect(lostResponse?.id).toBe(petId);
      expect((await detail()).pet.version).toBe(before.pet.version + 1);
      await save().click();
      await saved();
      const attempts = report.commands
        .slice(start)
        .filter((value) => value.comando === "salvar_rascunho");
      expect(attempts).toHaveLength(2);
      expect(attempts[0].chave).toBe(attempts[1].chave);
      expect((await detail()).pet.version).toBe(before.pet.version + 1);
    },
  );
  await check("pending links open the canonical preparation field and focus it", async () => {
    await phase("Conferir").click();
    const field = await detail();
    const pending = field.pendencias.find(
      (value) => typeof value !== "string" && value.campo === "participantes",
    );
    expect(pending).toBeTruthy();
    await page
      .getByRole("button", {
        name: new RegExp(pending.mensagem.replace(/[.*+?^${}()|[\]\\]/g, "\\$&")),
      })
      .first()
      .click();
    await expect(
      page.getByRole("heading", { name: "Equipe desta PET", exact: true }),
    ).toBeVisible();
    await expect(
      page.getByRole("button", { name: "Pessoa cadastrada", exact: true }),
    ).toBeFocused();
  });
  await check(
    "SQL version conflicts preserve local edits and never overwrite another device",
    async () => {
      await steps().getByRole("button", { name: "Contexto" }).click();
      await page
        .getByLabel("Atividade a realizar", { exact: true })
        .fill(marker + " · edição local em conflito");
      const before = await detail();
      await command("salvar_rascunho", draftData(before, marker + " · outro dispositivo"));
      await save().click();
      await expect(page.getByRole("alert").first()).toContainText("mudou em outro dispositivo");
      await expect(page.getByLabel("Atividade a realizar", { exact: true })).toHaveValue(
        marker + " · edição local em conflito",
      );
      expect((await detail()).pet.atividade).toBe(marker + " · outro dispositivo");
      await page.reload({ waitUntil: "networkidle" });
      await expect(page.getByLabel("Atividade a realizar", { exact: true })).toHaveValue(
        marker + " · outro dispositivo",
      );
    },
  );
  await check("OS PET search and real pagination use the server's full result count", async () => {
    const value = await detail();
    for (let index = 0; index < 20; index++) {
      const created = await command("criar_pet", {
        os_id: seed.os,
        espaco_id: seed.espaco,
        atividade: marker + " · página " + index,
        termino_previsto: value.pet.termino_previsto,
        timezone: value.pet.timezone,
      });
      report.createdPetIds.push(created.id);
    }
    await page.goto(new URL(`/execucao/ordens/${seed.os}`, base).href, {
      waitUntil: "networkidle",
    });
    await page.getByRole("searchbox", { name: /Buscar PET ou espaço/ }).fill(marker);
    const pagination = page.getByRole("navigation", { name: "Páginas de PETs", exact: true });
    await expect(pagination).toContainText("21 permissões · Página 1 de 2");
    await expect(page.locator(".nx-pet-list > .nx-pet-card")).toHaveCount(20);
    await pagination.getByRole("button", { name: "Próxima", exact: true }).click();
    await expect(pagination).toContainText("Página 2 de 2");
    await expect(page.locator(".nx-pet-list > .nx-pet-card")).toHaveCount(1);
    await page.evaluate(() =>
      window.scrollTo({
        top: document.documentElement.scrollHeight - innerHeight,
        behavior: "instant",
      }),
    );
    const listScroll = await page.evaluate(() => window.scrollY);
    expect(listScroll).toBeGreaterThan(0);
    await page
      .locator(".nx-pet-list > .nx-pet-card")
      .getByRole("link", { name: "Abrir PET", exact: true })
      .click();
    await expect(page).toHaveURL(new RegExp(`/execucao/pets/${petId}$`));
    await page.getByRole("link", { name: /Voltar à OS/ }).click();
    await expect(page).toHaveURL(new RegExp(`/execucao/ordens/${seed.os}$`));
    await expect(page.getByRole("searchbox", { name: /Buscar PET ou espaço/ })).toHaveValue(marker);
    await expect(pagination).toContainText("21 permissões · Página 2 de 2");
    await expect(page.locator(".nx-pet-list > .nx-pet-card")).toHaveCount(1);
    await expect
      .poll(async () => Math.abs((await page.evaluate(() => window.scrollY)) - listScroll))
      .toBeLessThanOrEqual(8);
    report.listReturn = {
      search: marker,
      page: 2,
      scrollBeforeOpen: listScroll,
      scrollAfterReturn: await page.evaluate(() => window.scrollY),
    };
    report.checks.push(
      "Opening a PET from filtered page two and returning to its OS restores search, page and scroll",
    );
    const otherOrder = await command("criar_os", {
      cliente_id: value.os.cliente_id,
      unidade_id: value.os.unidade_id,
      titulo: marker + " · outra OS",
      escopo: "Verificação isolada da troca de escopo e paginação.",
      responsavel_id: null,
    });
    report.createdOsIds.push(otherOrder.id);
    const otherPet = await command("criar_pet", {
      os_id: otherOrder.id,
      espaco_id: seed.espaco,
      atividade: marker + " · permissão em outra OS",
      termino_previsto: value.pet.termino_previsto,
      timezone: value.pet.timezone,
    });
    report.createdPetIds.push(otherPet.id);
    await page.evaluate((path) => {
      history.pushState({}, "", path);
      window.dispatchEvent(new PopStateEvent("popstate"));
    }, `/execucao/ordens/${otherOrder.id}`);
    await expect(
      page.getByRole("heading", { name: new RegExp(marker + " · outra OS") }),
    ).toBeVisible();
    await expect(page.getByRole("searchbox", { name: /Buscar PET ou espaço/ })).toHaveValue("");
    await expect(page.locator(".nx-pet-list > .nx-pet-card")).toHaveCount(1);
    await expect(
      page.getByRole("navigation", { name: "Páginas de PETs", exact: true }),
    ).toHaveCount(0);
    report.checks.push(
      "Changing the OS scope from page two resets search and pagination to the new OS",
    );
    await page.goto(new URL(`/execucao/ordens/${seed.os}`, base).href, {
      waitUntil: "networkidle",
    });
    await page
      .getByRole("searchbox", { name: /Buscar PET ou espaço/ })
      .fill(marker + " sem resultado");
    await expect(page.getByText("Nenhuma PET encontrada", { exact: true })).toBeVisible();
    await expect(pagination).toHaveCount(0);
    const queried = await rpc("pet_listar", {
      filtros: { os_id: seed.os, busca: marker, pagina: 1, limite: 20 },
    });
    expect(queried.total).toBe(21);
    expect(queried.registros).toHaveLength(1);
  });
  expect(report.errors).toEqual([]);
} catch (error) {
  report.failure = error.stack || String(error);
  await page.screenshot({ path: evidence + "/failure.png", fullPage: true }).catch(() => {});
  process.exitCode = 1;
} finally {
  await writeFile(evidence + "/report.json", JSON.stringify(report, null, 2));
  console.log(
    JSON.stringify(
      {
        checks: report.checks,
        createdPetIds: report.createdPetIds,
        errors: report.errors,
        failure: report.failure,
        evidence,
      },
      null,
      2,
    ),
  );
  await browser.close();
}
