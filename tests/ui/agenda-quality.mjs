// Actual source UI with isolated transport fixtures; SQL/Auth/Storage and physical devices are separate evidence.
import { chromium, expect } from "@playwright/test";
import { mkdir, writeFile } from "node:fs/promises";
import { evidenceRoot } from "./evidence.mjs";
const browser = await chromium.launch({ headless: true }),
  page = await browser.newPage({ locale: "pt-BR", reducedMotion: "reduce" });
const base = process.env.NEXUS_UI_URL || "http://127.0.0.1:4208",
  root = `${evidenceRoot}/agenda-equipe`;
await mkdir(root, { recursive: true });
const report = {
  method:
    "Actual source route/components/hooks with synthetic mutable transport fixtures. No connected Auth, SQL/RLS, Storage HTTP, real recurrence/concurrent reservations, production persistence, deployment or physical-device proof.",
  layouts: [],
  checks: [],
  errors: [],
  consoleErrors: [],
};
page.on("pageerror", (e) => report.errors.push(e.message));
page.on("console", (message) => {
  if (message.type() === "error") report.consoleErrors.push(message.text());
});
const id = "a6000000-0000-4000-8000-000000000001",
  person = "30000000-0000-4000-8000-000000000001",
  action = "a7000000-0000-4000-8000-000000000001";
async function go(extra = "") {
  const query = new URLSearchParams({
    page: "agenda-equipe",
    data: "2026-11-10",
    vista: "semana",
    foco: "minha",
  });
  for (const [key, value] of new URLSearchParams(extra.replace(/^&/, ""))) query.set(key, value);
  await page.goto(`${base}/?${query}`, {
    waitUntil: "networkidle",
  });
  await page.getByRole("heading", { name: "Agenda Equipe", exact: true, level: 1 }).waitFor();
  await page.evaluate(() => document.fonts.ready);
}
const dialog = () => page.getByRole("dialog");
async function commands() {
  return page.evaluate(() =>
    window.__nexusCalls.filter((c) => c.name === "executarAgenda").map((c) => c.payload.data),
  );
}
async function check(name, work) {
  await work();
  report.checks.push({ name, pass: true });
  console.log("PASS: " + name);
}
async function width(name, value) {
  await page.setViewportSize({ width: value, height: value < 768 ? 844 : 900 });
  const metrics = await page.evaluate(() => ({
    width: innerWidth,
    scrollWidth: document.documentElement.scrollWidth,
    overflow: document.documentElement.scrollWidth > innerWidth,
  }));
  expect(metrics.overflow, `${name} at ${value}`).toBe(false);
  report.layouts.push({ name, ...metrics });
  if ([390, 1366].includes(value)) await page.screenshot({ path: `${root}/${name}-${value}.png` });
}
async function create(title) {
  await page.getByRole("button", { name: "Novo evento", exact: true }).click();
  await dialog()
    .getByRole("textbox", { name: /^Título do compromisso/ })
    .fill(title);
  await dialog()
    .getByRole("combobox", { name: /^Responsável principal/ })
    .selectOption(person);
}
async function submit(name = "Salvar rascunho") {
  await dialog().getByRole("button", { name, exact: true }).click();
}
async function discard() {
  await page.keyboard.press("Escape");
  const discard = page.getByRole("button", { name: "Descartar alterações", exact: true });
  if (await discard.isVisible()) await discard.click();
  await expect(dialog()).toHaveCount(0);
}
async function refresh(patch = {}) {
  await page.evaluate((v) => {
    Object.assign(window, v);
    window.dispatchEvent(new Event("visibilitychange"));
  }, patch);
}
async function agendaSearch() {
  const search = page.getByRole("searchbox", { name: "Buscar na agenda", exact: true });
  if (!(await search.isVisible()))
    await page
      .locator("summary")
      .filter({ hasText: /Buscar e filtrar|Filtros/ })
      .click();
  return search;
}
async function detail() {
  await go(`&evento=${id}`);
  await page.getByRole("button", { name: "Editar compromisso", exact: true }).waitFor();
}
try {
  for (const view of ["semana", "mes", "lista"]) {
    for (const value of [360, 390, 768, 1024, 1366, 1440]) {
      await page.setViewportSize({ width: value, height: value < 768 ? 844 : 900 });
      await go(`&vista=${view}`);
      await expect(page.getByText(/3 compromissos/)).toBeVisible();
      await width(`calendario-${view}`, value);
    }
  }
  for (const value of [360, 390, 768, 1024, 1366, 1440]) {
    await page.setViewportSize({ width: value, height: value < 768 ? 844 : 900 });
    await detail();
    await width("ficha", value);
    await page.getByRole("button", { name: "Editar compromisso", exact: true }).click();
    await width("formulario", value);
    await discard();
  }
  await page.setViewportSize({ width: 390, height: 844 });
  await check(
    "invalid required fields focus correctly, dirty close preserves draft and Escape restores trigger",
    async () => {
      await go();
      const trigger = page.getByRole("button", { name: "Novo evento", exact: true });
      await trigger.click();
      await submit();
      await expect(dialog().getByRole("textbox", { name: /^Título do compromisso/ })).toBeFocused();
      await expect(
        dialog().getByRole("textbox", { name: /^Título do compromisso/ }),
      ).toHaveAttribute("aria-invalid", "true");
      await expect(dialog().getByRole("alert")).toContainText(
        "Informe ao menos três caracteres para o título.",
      );
      await expect(dialog().getByRole("alert")).toContainText("Selecione um cadastro válido.");
      await expect(dialog().getByRole("alert")).not.toContainText(
        /String must contain|Invalid uuid|Required|Invalid input/i,
      );
      await dialog()
        .getByRole("textbox", { name: /^Título do compromisso/ })
        .fill("Draft retained until explicit discard");
      await page.keyboard.press("Escape");
      await page.getByRole("button", { name: "Continuar editando", exact: true }).click();
      await expect(dialog().getByRole("textbox", { name: /^Título do compromisso/ })).toHaveValue(
        "Draft retained until explicit discard",
      );
      await discard();
      await expect(trigger).toBeFocused();
    },
  );
  await check("new whole-day event uses a valid exclusive end and canonical person", async () => {
    await go();
    await create("Evento de dia inteiro do laboratório");
    await dialog().getByRole("checkbox", { name: "Dia inteiro", exact: true }).check();
    await expect(dialog().getByLabel(/^Primeiro dia/)).toHaveValue("2026-11-10");
    await expect(dialog().getByLabel(/^Fim exclusivo/)).toHaveValue("2026-11-11");
    await submit();
    await expect(dialog()).toHaveCount(0);
    const c = (await commands()).at(-1);
    expect(c.comando).toBe("salvar_evento");
    expect(c.dados.evento.data_fim).toBe("2026-11-11");
    expect(
      c.dados.evento.participantes
        .filter((p) => p.funcao === "responsavel")
        .map((p) => p.pessoa_id),
    ).toEqual([person]);
  });
  await check(
    "action without schedule stays canonical without inventing a calendar event",
    async () => {
      await go();
      const count = await page.evaluate(() => window.__nexusAgenda.events.length);
      await page.getByRole("button", { name: "Nova ação", exact: true }).click();
      await dialog()
        .getByRole("textbox", { name: /^Título da ação/ })
        .fill("Ação criada sem horário");
      await dialog()
        .getByRole("combobox", { name: /^Responsável pela ação/ })
        .selectOption(person);
      await submit("Criar ação");
      await expect(dialog()).toHaveCount(0);
      await expect(
        page.getByText("Ação confirmada no servidor, sem horário reservado.", { exact: true }),
      ).toBeVisible();
      expect((await commands()).at(-1).dados.evento).toBeUndefined();
      expect(await page.evaluate(() => window.__nexusAgenda.events.length)).toBe(count);
    },
  );
  await check(
    "new action and scheduled event share one source and the visible principal",
    async () => {
      await go();
      await page.getByRole("button", { name: "Nova ação", exact: true }).click();
      await dialog()
        .getByRole("textbox", { name: /^Título da ação/ })
        .fill("Ação criada com horário");
      await dialog()
        .getByRole("combobox", { name: /^Responsável pela ação/ })
        .selectOption(person);
      await dialog()
        .getByRole("checkbox", { name: "Reservar um horário para esta ação", exact: true })
        .check();
      await expect(dialog().getByRole("combobox", { name: /^Responsável principal/ })).toHaveCount(
        0,
      );
      await submit("Criar ação e agendar");
      await expect(dialog()).toHaveCount(0);
      const c = (await commands()).at(-1);
      expect(c.comando).toBe("criar_acao");
      expect(c.dados.evento.responsavel_id).toBe(c.dados.acao.responsavel_id);
      const rows = await page.evaluate(() => ({
        actions: window.__nexusAgenda.actions,
        events: window.__nexusAgenda.events,
      }));
      const a = rows.actions.find((a) => a.titulo === "Ação criada com horário");
      expect(rows.events.filter((e) => e.acao_id === a.id)).toHaveLength(1);
    },
  );
  await check(
    "changing the principal preserves one responsible role and changing client clears the previous project",
    async () => {
      await go();
      await create("Troca explícita de pessoa e contexto");
      await dialog()
        .getByRole("combobox", { name: /^Responsável principal/ })
        .selectOption("30000000-0000-4000-8000-000000000002");
      await dialog().getByText("Origem e contexto", { exact: true }).click();
      await dialog()
        .getByRole("combobox", { name: "Cliente", exact: true })
        .selectOption("20000000-0000-4000-8000-000000000001");
      await dialog()
        .getByRole("combobox", { name: "Projeto operacional", exact: true })
        .selectOption("40000000-0000-4000-8000-000000000009");
      await dialog()
        .getByRole("combobox", { name: "Cliente", exact: true })
        .selectOption("20000000-0000-4000-8000-000000000002");
      await expect(
        dialog().getByRole("combobox", { name: "Projeto operacional", exact: true }),
      ).toHaveValue("");
      await submit();
      await expect(dialog()).toHaveCount(0);
      const sent = (await commands()).at(-1).dados.evento;
      expect(sent.responsavel_id).toBe("30000000-0000-4000-8000-000000000002");
      expect(sent.participantes.filter((p) => p.funcao === "responsavel")).toHaveLength(1);
      expect(sent.projeto_id).toBeNull();
      expect(sent.cliente_id).toBe("20000000-0000-4000-8000-000000000002");
    },
  );
  await check(
    "choosing an existing origin requires its identity and reuses that canonical action",
    async () => {
      await go();
      await create("Visita da ação existente");
      await dialog().getByText("Origem e contexto", { exact: true }).click();
      await dialog().getByRole("combobox", { name: "Agendar", exact: true }).selectOption("acao");
      await submit();
      expect(await commands()).toHaveLength(0);
      await expect(dialog()).toBeVisible();
      await dialog()
        .getByRole("combobox", { name: /^Ação de origem/ })
        .selectOption(action);
      await submit();
      await expect(dialog()).toHaveCount(0);
      expect((await commands()).at(-1).dados.evento.acao_id).toBe(action);
      expect(await page.evaluate(() => window.__nexusAgenda.actions.length)).toBe(1);
    },
  );
  await check(
    "existing pending source schedules a visit without duplicating the action",
    async () => {
      await go("&foco=pendentes");
      const card = page
        .locator("li")
        .filter({ has: page.getByText("Ação sem horário permanece canônica", { exact: true }) });
      await card.getByRole("button", { name: "Agendar registro existente", exact: true }).click();
      await expect(dialog().getByRole("textbox", { name: /^Título do compromisso/ })).toHaveValue(
        "Ação sem horário permanece canônica",
      );
      await submit();
      await expect(dialog()).toHaveCount(0);
      expect((await commands()).at(-1).dados.evento.acao_id).toBe(action);
      expect(await page.evaluate(() => window.__nexusAgenda.actions.length)).toBe(1);
    },
  );
  await check(
    "lost response preserves input and retries the same key with one persisted fixture effect",
    async () => {
      await go();
      await create("Retry idempotente após perda de resposta");
      await page.evaluate(() => (window.__agendaCommitThenFail = true));
      await submit();
      await expect(dialog().getByRole("alert")).toContainText("resposta de rede foi perdida");
      await expect(dialog().getByRole("textbox", { name: /^Título do compromisso/ })).toHaveValue(
        "Retry idempotente após perda de resposta",
      );
      await submit();
      await expect(dialog()).toHaveCount(0);
      const sent = await commands();
      expect(sent).toHaveLength(2);
      expect(sent[0].chave).toBe(sent[1].chave);
      expect(
        await page.evaluate(
          () =>
            window.__nexusAgenda.events.filter(
              (e) => e.titulo === "Retry idempotente após perda de resposta",
            ).length,
        ),
      ).toBe(1);
    },
  );
  await check(
    "version conflict keeps local input until explicit current-version adoption",
    async () => {
      await detail();
      await page.getByRole("button", { name: "Editar compromisso", exact: true }).click();
      const title = dialog().getByRole("textbox", { name: /^Título do compromisso/ });
      await title.fill("Texto local preservado no conflito");
      await page.evaluate(() => (window.__agendaConflictNext = true));
      await submit();
      await expect(dialog().getByRole("alert")).toContainText("O compromisso mudou");
      await expect(title).toHaveValue("Texto local preservado no conflito");
      expect((await commands()).at(-1).dados.expected_version).toBe(1);
      await dialog().getByRole("button", { name: "Comparar versão atual", exact: true }).click();
      await expect(dialog().getByText(/Versão atual: 2/)).toBeVisible();
      await expect(title).toHaveValue("Texto local preservado no conflito");
      await dialog()
        .getByRole("button", { name: "Usar versão atual e substituir preenchimento", exact: true })
        .click();
      await expect(title).toHaveValue("Versão alterada em outra sessão");
      await title.fill("Salvo após adoção explícita");
      await submit();
      await expect(dialog()).toHaveCount(0);
      expect((await commands()).at(-1).dados.expected_version).toBe(2);
    },
  );
  await check(
    "recurrence keeps anchor weekday, series version and explicit future scope/reason",
    async () => {
      await detail();
      await page.getByRole("button", { name: "Repetir compromisso", exact: true }).click();
      await dialog().getByLabel("Quantidade de ocorrências", { exact: true }).fill("3");
      await submit("Repetir compromisso");
      await expect(dialog()).toHaveCount(0);
      const created = (await commands()).at(-1);
      expect(created.comando).toBe("criar_serie");
      expect(created.dados.regra.dias_semana).toContain(2);
      const pending = page.getByRole("region", { name: "Ocorrências da série", exact: true });
      await expect(
        pending.getByRole("heading", { name: "Ocorrências a conferir", exact: true }),
      ).toBeVisible();
      await expect(pending.getByRole("listitem")).toHaveCount(2);
      await expect(pending.getByText(/17\/11\/2026.*Bloqueada/)).toBeVisible();
      await expect(pending.getByText(/24\/11\/2026.*Pulada/)).toBeVisible();
      await expect(pending).toContainText("Código: 23P01");
      await expect(pending).toContainText("Código: HORARIO_CIVIL_INEXISTENTE");
      await page.getByRole("button", { name: "Editar série futura", exact: true }).click();
      await dialog().getByLabel("Toda a série futura", { exact: true }).check();
      await dialog()
        .getByRole("textbox", { name: /^Título do compromisso/ })
        .fill("Série futura revisada explicitamente");
      await dialog()
        .getByRole("textbox", { name: /^Motivo/ })
        .fill("Revisão autorizada dos compromissos futuros");
      await submit("Alterar compromissos futuros");
      await expect(dialog()).toHaveCount(0);
      const edited = (await commands()).at(-1);
      expect(edited.comando).toBe("editar_serie");
      expect(edited.dados.expected_version).toBe(1);
      expect(edited.dados.escopo).toBe("todas_futuras");
      await expect(
        pending.getByRole("combobox", { name: "Versão da série", exact: true }),
      ).toHaveValue(
        await page.evaluate(() => Object.values(window.__nexusAgenda.series)[0].versao_id),
      );
    },
  );
  await check(
    "cancellation requires a reason and confirmation of presence does not conclude an event",
    async () => {
      await detail();
      await page.getByRole("button", { name: "Cancelar compromisso", exact: true }).click();
      await submit("Cancelar compromisso");
      expect(await commands()).toHaveLength(0);
      await dialog()
        .getByRole("textbox", { name: /^Motivo/ })
        .fill("Cancelamento operacional solicitado no laboratório");
      await submit("Cancelar compromisso");
      await expect(dialog()).toHaveCount(0);
      expect(await page.evaluate(() => window.__nexusAgenda.events[0].estado)).toBe("cancelado");
      await go("&evento=a6000000-0000-4000-8000-000000000002&scenario=restricted");
      await expect(page.getByRole("button", { name: "Novo evento", exact: true })).toHaveCount(0);
      await page.getByRole("button", { name: "Confirmar presença", exact: true }).click();
      await expect(page.getByText(/Participação confirmada/)).toBeVisible();
      expect(
        await page.evaluate(
          () => window.__nexusAgenda.events.find((e) => e.id.endsWith("0002")).estado,
        ),
      ).toBe("publicado");
    },
  );
  await check("notifications and preferences use explicit authenticated commands", async () => {
    await go("&foco=notificacoes");
    await expect(page.getByText("1 não lidas", { exact: true })).toBeVisible();
    await page.getByRole("button", { name: "Marcar como lida", exact: true }).click();
    await expect(page.getByText("0 não lidas", { exact: true })).toBeVisible();
    await page.getByRole("button", { name: "Preferências", exact: true }).click();
    await dialog().getByLabel("Antecedência do lembrete (minutos)", { exact: true }).fill("90");
    await submit("Salvar preferências");
    await expect(dialog()).toHaveCount(0);
    expect((await commands()).at(-1).dados.antecedencia_minutos).toBe(90);
  });
  await check("empty and network error states differ and a failed lookup can recover", async () => {
    await go("&scenario=empty");
    await expect(page.getByText(/0 compromissos/)).toBeVisible();
    await go("&scenario=error");
    await expect(
      page.getByRole("button", { name: "Tentar novamente", exact: true }).first(),
    ).toBeVisible();
    await go();
    await refresh({ __agendaNetwork: true });
    await expect(page.getByText(/Falha de rede na consulta da agenda/).first()).toBeVisible();
    await page.evaluate(() => (window.__agendaNetwork = false));
    await page.getByRole("button", { name: "Tentar novamente", exact: true }).first().click();
    await expect(page.getByText(/3 compromissos/)).toBeVisible();
  });
  await check(
    "unsupported legacy response timezone preserves ISO instants, blocks civil edits and recovers by explicit display timezone",
    async () => {
      await go(`&scenario=unsupported-timezone&evento=${id}`);
      await expect(
        page
          .getByRole("alert")
          .filter({ hasText: "O fuso Unsupported/Legacy não é suportado neste navegador." }),
      ).toBeVisible();
      await expect(page.getByText(/Instante original: 2026-11-10T11:00:00Z/).first()).toBeVisible();
      await expect(page.getByText(/2026-11-10T12:00:00Z/).first()).toBeVisible();
      await expect(
        page.getByRole("button", { name: "Editar compromisso", exact: true }),
      ).toHaveCount(0);
      expect(
        await page.evaluate(() =>
          window.__nexusCalls.filter((call) => call.name === "listarAgenda"),
        ),
      ).toHaveLength(0);
      expect(await commands()).toHaveLength(0);
      await page
        .getByRole("textbox", { name: "Fuso de exibição", exact: true })
        .fill("America/Sao_Paulo");
      await page.getByRole("button", { name: "Aplicar fuso de exibição", exact: true }).click();
      await expect(
        page.getByRole("button", { name: "Voltar à agenda", exact: true }).first(),
      ).toBeVisible();
      await expect(
        page
          .getByRole("status")
          .filter({ hasText: "A edição civil do período e da recorrência fica indisponível" }),
      ).toBeVisible();
      await expect(
        page.getByRole("button", { name: "Editar compromisso", exact: true }),
      ).toHaveCount(0);
      const original = await page.evaluate(() => window.__nexusAgenda.events[0]);
      expect([original.inicio, original.fim, original.timezone]).toEqual([
        "2026-11-10T11:00:00Z",
        "2026-11-10T12:00:00Z",
        "Unsupported/Legacy",
      ]);
      expect(new URL(page.url()).searchParams.get("fuso")).toBe("America/Sao_Paulo");
      const lists = await page.evaluate(() =>
        window.__nexusCalls.filter((call) => call.name === "listarAgenda"),
      );
      expect(lists.length).toBeGreaterThan(0);
      expect(lists.every((call) => call.payload.data.timezone === "America/Sao_Paulo")).toBe(true);
      expect(await commands()).toHaveLength(0);
    },
  );
  await check(
    "denial erases the open private editor and recovery reloads the current authorized data",
    async () => {
      await detail();
      await page.getByRole("button", { name: "Editar compromisso", exact: true }).click();
      await dialog()
        .getByRole("textbox", { name: /^Título do compromisso/ })
        .fill("Rascunho privado removido pela negação");
      await refresh({ __agendaDenied: true });
      await expect(dialog()).toHaveCount(0);
      await expect(
        page
          .getByRole("alert")
          .filter({ hasText: "Atividade da agenda indisponível para seu acesso atual." })
          .first(),
      ).toBeVisible();
      await expect(
        page.getByRole("button", { name: "Editar compromisso", exact: true }),
      ).toHaveCount(0);
      await page.evaluate(() => (window.__agendaDenied = false));
      await page.getByRole("button", { name: "Tentar novamente", exact: true }).first().click();
      await expect(
        page.getByRole("button", { name: "Editar compromisso", exact: true }),
      ).toBeVisible();
    },
  );
  await check(
    "late successful transport response after source denial cannot reopen detail or overwrite URL context",
    async () => {
      await go();
      await create("Resposta antiga não reabre atividade privada");
      await page.evaluate(() => (window.__agendaHoldWrite = true));
      await submit();
      await expect.poll(() => page.evaluate(() => window.__agendaWriteHeld)).toBe(true);
      await refresh({ __agendaDeniedName: "obterConfiguracaoAgenda" });
      await expect(dialog()).toHaveCount(0);
      await expect(
        page
          .getByRole("alert")
          .filter({ hasText: "Atividade da agenda indisponível para seu acesso atual." })
          .first(),
      ).toBeVisible();
      await page.evaluate(() => window.__releaseAgendaWrite());
      await expect.poll(() => page.evaluate(() => window.__agendaWriteReturned)).toBe(true);
      await page.evaluate(
        () => new Promise((resolve) => requestAnimationFrame(() => requestAnimationFrame(resolve))),
      );
      expect(new URL(page.url()).searchParams.get("evento") || "").toBe("");
      await expect(
        page.getByText("Alteração confirmada no servidor.", { exact: true }),
      ).toHaveCount(0);
    },
  );
  await check(
    "opening and returning preserves calendar context, URL state and a usable focus target",
    async () => {
      await go("&vista=mes&busca=Visita");
      const event = page
        .getByRole("button", { name: /^Visita de validação da unidade norte\./ })
        .last();
      await event.click();
      await expect(
        page.getByRole("button", { name: "Editar compromisso", exact: true }),
      ).toBeVisible();
      await page.getByRole("button", { name: "Voltar à agenda", exact: true }).first().click();
      await expect(await agendaSearch()).toHaveValue("Visita");
      expect(new URL(page.url()).searchParams.get("vista")).toBe("mes");
      expect(new URL(page.url()).searchParams.get("data")).toBe("2026-11-10");
      await expect
        .poll(() => page.evaluate(() => document.activeElement !== document.body))
        .toBe(true);
      await page.reload({ waitUntil: "networkidle" });
      await expect(await agendaSearch()).toHaveValue("Visita");
    },
  );
  expect(report.errors).toEqual([]);
  expect(report.consoleErrors).toEqual([]);
  console.log(
    JSON.stringify({
      layouts: report.layouts.length,
      checks: report.checks.length,
      errors: report.errors,
      consoleErrors: report.consoleErrors,
    }),
  );
} catch (e) {
  report.failure = e.message;
  throw e;
} finally {
  await writeFile(`${root}/results.json`, JSON.stringify(report, null, 2));
  await browser.close();
}
