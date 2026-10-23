// Laboratory-only transport. Canonical SQL/RLS/concurrency and persistence are tested separately.
// Fixtures never enter application builds and do not implement a second scheduling engine.
import { scenario } from "./data";
import * as s from "@/features/agenda-equipe/schemas";
import { AGENDA_ACESSO_NEGADO } from "@/features/agenda-equipe/domain";
import {
  pendenciasSerieInput,
  pendenciasSeriePage,
} from "@/features/agenda-equipe/serie-pendencias.schemas";
const org = "10000000-0000-4000-8000-000000000001",
  actor = "00000000-0000-4000-8000-000000000001",
  person = "30000000-0000-4000-8000-000000000001",
  other = "30000000-0000-4000-8000-000000000002",
  actionId = "a7000000-0000-4000-8000-000000000001",
  lev = "70000000-0000-4000-8000-000000000001",
  client = "20000000-0000-4000-8000-000000000001",
  unit = "21000000-0000-4000-8000-000000000001",
  tool = "93000000-0000-4000-8000-000000000001",
  skill = "a8000000-0000-4000-8000-000000000001",
  team = "a1000000-0000-4000-8000-000000000001",
  now = "2026-11-10T12:00:00.000Z";
const copy = (v) => structuredClone(v),
  manage = () => scenario !== "restricted" && !window.__agendaReadOnly,
  responseTimezone =
    scenario === "unsupported-timezone" ? "Unsupported/Legacy" : "America/Sao_Paulo";
const privileges = () => ({ criar: manage(), criar_acao: manage(), gerir_series: manage() });
const names = {
  [person]: "Responsável técnico do laboratório",
  [other]: "Pessoa de apoio do laboratório",
};
const permissions = (e) => ({
  editar: manage() && ["rascunho", "publicado"].includes(e.estado),
  publicar: manage() && e.estado === "rascunho",
  iniciar: e.estado === "publicado",
  concluir: e.estado === "em_andamento",
  cancelar: manage() && ["rascunho", "publicado"].includes(e.estado),
  confirmar: true,
  comentar: true,
  editar_serie: manage() && ["rascunho", "publicado"].includes(e.estado),
  abrir_origem: !!(e.acao_id || e.levantamento_id),
});
const makeEvent = (id, titulo, start, end, extra = {}) => ({
  id,
  organization_id: org,
  titulo,
  descricao: "Contexto autorizado exclusivamente do laboratório isolado.",
  tipo: "visita_tecnica",
  inicio: start,
  fim: end,
  timezone: responseTimezone,
  dia_inteiro: false,
  data_inicio: null,
  data_fim: null,
  local: "Unidade de validação — acesso norte",
  responsavel_id: person,
  acao_id: null,
  levantamento_id: null,
  origem_ocorrencia: null,
  bloqueia_recursos: true,
  estado: "rascunho",
  motivo: null,
  version: 1,
  created_by: actor,
  created_at: now,
  updated_at: now,
  cliente_id: null,
  unidade_id: null,
  projeto_id: null,
  visibilidade: "participantes",
  serie_id: null,
  serie_versao_id: null,
  ocorrencia_data: null,
  excecao: false,
  gerado_automaticamente: false,
  responsavel_nome: names[person],
  cliente_nome: null,
  unidade_nome: null,
  minha_confirmacao: "pendente",
  dias_visiveis: [],
  origem: { tipo: "independente", id: null, titulo: null, estado: null },
  permissoes: {},
  ...extra,
});
const state = {
  events:
    scenario === "empty"
      ? []
      : [
          makeEvent(
            "a6000000-0000-4000-8000-000000000001",
            "Visita de validação da unidade norte",
            "2026-11-10T11:00:00Z",
            "2026-11-10T12:00:00Z",
          ),
          makeEvent(
            "a6000000-0000-4000-8000-000000000002",
            "Reunião de coordenação com título extenso para inspeção móvel",
            "2026-11-11T12:00:00Z",
            "2026-11-11T13:00:00Z",
            { estado: "publicado", tipo: "reuniao", bloqueia_recursos: false, version: 2 },
          ),
          makeEvent(
            "a6000000-0000-4000-8000-000000000003",
            "Coleta noturna vinculada ao levantamento existente",
            "2026-11-13T02:30:00Z",
            "2026-11-13T03:30:00Z",
            {
              estado: "publicado",
              version: 2,
              tipo: "levantamento",
              levantamento_id: lev,
              origem_ocorrencia: "visita-lab",
              cliente_id: client,
              unidade_id: unit,
              cliente_nome: "Cliente de teste",
              unidade_nome: "Unidade norte",
            },
          ),
        ],
  actions: [
    {
      id: actionId,
      organization_id: org,
      titulo: "Ação sem horário permanece canônica",
      descricao: "Prazo e responsabilidade não inventam reserva no calendário.",
      responsavel_id: person,
      prazo: "2026-11-20",
      prioridade: "normal",
      exige_verificacao: true,
      estado: "aberta",
      conclusao: null,
      verificado_por: null,
      motivo: null,
      version: 1,
      created_by: actor,
      created_at: now,
      updated_at: now,
    },
  ],
  participants: {},
  comments: {},
  history: {},
  series: {},
  preferences: { antecedencia_minutos: 60, notificar_atrasos: true, notificar: true },
  notifications: [],
  writes: 0,
};
window.__nexusAgenda = state;
window.__agendaIds = {
  person,
  other,
  actionId,
  lev,
  tool,
  skill,
  team,
  event: "a6000000-0000-4000-8000-000000000001",
};
const operations = new Map(),
  deferred = [];
function period(input) {
  const local = (v) => v + (/T\d{2}:\d{2}$/.test(v) ? ":00" : "") + "-03:00";
  return input.dia_inteiro
    ? {
        inicio: input.data_inicio + "T03:00:00Z",
        fim: input.data_fim + "T03:00:00Z",
        data_inicio: input.data_inicio,
        data_fim: input.data_fim,
      }
    : {
        inicio: input.inicio ?? local(input.inicio_local),
        fim: input.fim ?? local(input.fim_local),
        data_inicio: null,
        data_fim: null,
      };
}
function dayOf(instant) {
  return new Date(Date.parse(instant) - 3 * 3600_000).toISOString().slice(0, 10);
}
function days(e, start, end) {
  const values = [];
  for (
    let d = start;
    d < end;
    d = new Date(Date.parse(d + "T12:00:00Z") + 86400_000).toISOString().slice(0, 10)
  ) {
    if (
      e.dia_inteiro
        ? d >= e.data_inicio && d < e.data_fim
        : Date.parse(e.inicio) < Date.parse(d + "T03:00:00Z") + 86400_000 &&
          Date.parse(e.fim) > Date.parse(d + "T03:00:00Z")
    )
      values.push(d);
  }
  return values;
}
function canonicalAction(id) {
  return (
    state.actions.find((action) => action.id === id) ??
    window.__nexusOperational?.acoes.find(
      (action) => action.id === id && action.organization_id === org,
    )
  );
}
function eventView(e, start = null, end = null) {
  const origin = e.acao_id
    ? canonicalAction(e.acao_id)
    : e.levantamento_id
      ? { id: lev, titulo: "Levantamento existente do laboratório", estado: "em_coleta" }
      : null;
  return {
    ...copy(e),
    responsavel_nome: names[e.responsavel_id] ?? "Pessoa vinculada",
    permissoes: permissions(e),
    dias_visiveis: start && end ? days(e, start, end) : [],
    origem: {
      tipo: e.acao_id ? "acao" : e.levantamento_id ? "levantamento" : "independente",
      id: origin?.id ?? null,
      titulo: origin?.titulo ?? null,
      estado: origin?.estado ?? null,
    },
  };
}
function participant(e, p = { pessoa_id: e.responsavel_id, funcao: "responsavel" }) {
  return {
    id: crypto.randomUUID(),
    organization_id: org,
    evento_id: e.id,
    pessoa_id: p.pessoa_id,
    funcao: p.funcao,
    confirmacao: "pendente",
    ciencia_em: null,
    vigente: true,
    retirado_em: null,
    version: 1,
    created_by: actor,
    created_at: now,
    pessoa_nome: names[p.pessoa_id] ?? "Pessoa vinculada",
    equipe_origem_id: null,
    equipe_inicio: null,
    pode_confirmar: p.pessoa_id === person,
  };
}
for (const e of state.events) {
  state.participants[e.id] = [participant(e)];
  state.history[e.id] = [
    { versao: e.version, snapshot: { evento: copy(e) }, autor: actor, created_at: now },
  ];
  state.comments[e.id] = [];
}
state.notifications = state.events.slice(0, 1).map((e) => ({
  id: "a9000000-0000-4000-8000-000000000001",
  tipo: "atribuicao",
  lida_em: null,
  created_at: now,
  evento_id: e.id,
}));
const page = (rows, pagina = 0, limite = 25) => ({
  registros: copy(rows.slice(pagina * limite, (pagina + 1) * limite)),
  total: rows.length,
  pagina,
  limite,
});
async function before(name, data) {
  window.__nexusCalls.push({ name, payload: { data: copy(data) } });
  if (scenario === "loading") await new Promise(() => {});
  if (window.__agendaDenied || window.__agendaDeniedName === name || scenario === "denied")
    throw new Error(AGENDA_ACESSO_NEGADO);
  if (scenario === "error" || window.__agendaNetwork)
    throw new Error("Falha de rede na consulta da agenda (fixture).");
  if (window.__agendaHoldRead === name) {
    window.__agendaReadHeld = true;
    await new Promise((resolve) => {
      window.__releaseAgendaRead = () => {
        window.__agendaHoldRead = null;
        resolve();
      };
    });
  }
}
function detail(id) {
  const e = state.events.find((e) => e.id === id);
  if (!e) throw new Error(AGENDA_ACESSO_NEGADO);
  const v = eventView(e);
  return s.detalheAgenda.parse({
    evento: v,
    participantes: copy(state.participants[id] ?? [participant(e)]),
    competencias: (e.competencias ?? []).map((id) => ({
      competencia_id: id,
      nome: "Procedimento de validação configurado",
      exige_evidencia: false,
      exige_validade: true,
    })),
    ferramentas: (e.ferramentas ?? []).map((f) => ({
      id: f.id ?? crypto.randomUUID(),
      ferramenta_id: f.ferramenta_id,
      patrimonio: "LAB-FERR-01",
      descricao: "Ferramenta do ambiente isolado",
      pessoa_id: f.pessoa_id,
      pessoa_nome: names[f.pessoa_id],
      custodia_id: null,
      estado: e.estado === "rascunho" ? "planejada" : "reservada",
      version: 1,
    })),
    historico: page(state.history[id] ?? []),
    comentarios: page(state.comments[id] ?? []),
    serie: e.serie_id ? copy(state.series[e.serie_id]) : null,
    bloqueios: [],
    permissoes: v.permissoes,
    server_now: now,
  });
}
export const obterConfiguracaoAgenda = async ({ data }) => {
  await before("obterConfiguracaoAgenda", data);
  return s.configuracaoAgenda.parse({
    minha_pessoa_id: person,
    permissoes: privileges(),
    preferencias: state.preferences,
    timezone: responseTimezone,
    server_now: now,
    jobs: manage()
      ? {
          scheduler: {
            estado: "indisponivel",
            extensao: "pg_cron",
            verificado_em: now,
            detalhe: "Scheduler não é exercitado no laboratório UI",
          },
          ultima_execucao: null,
          fila_organizacao: { falhas: 0, pendentes: 0, concluidos: 0 },
        }
      : null,
  });
};
export const listarAgenda = async ({ data }) => {
  await before("listarAgenda", data);
  const q = s.listarInput.parse(data);
  const all = state.events
    .map((e) => eventView(e, q.inicio, q.fim))
    .filter(
      (e) =>
        e.dias_visiveis.length &&
        (!q.busca || e.titulo.toLocaleLowerCase().includes(q.busca.toLocaleLowerCase())) &&
        (!q.estado || e.estado === q.estado) &&
        (!q.tipo || e.tipo === q.tipo),
    );
  const counts = [];
  for (
    let d = q.inicio;
    d < q.fim;
    d = new Date(Date.parse(d + "T12:00:00Z") + 86400_000).toISOString().slice(0, 10)
  )
    counts.push({ data: d, total: all.filter((e) => e.dias_visiveis.includes(d)).length });
  return s.listaAgenda.parse({
    ...page(all, q.pagina, q.limite),
    inicio: q.inicio,
    fim: q.fim,
    timezone: q.timezone,
    dias: counts,
    permissoes: privileges(),
    minha_pessoa_id: person,
  });
};
export const obterEventoAgenda = async ({ data }) => {
  await before("obterEventoAgenda", data);
  return detail(data.id);
};
export const obterAcaoAgenda = async ({ data }) => {
  await before("obterAcaoAgenda", data);
  const a = canonicalAction(data.id);
  if (!a) throw new Error(AGENDA_ACESSO_NEGADO);
  return s.acaoAgenda.parse({
    acao: copy(a),
    responsavel_nome: state.actions.includes(a)
      ? names[a.responsavel_id]
      : (window.__nexusOperational?.pessoas.find((person) => person.id === a.responsavel_id)
          ?.nome ?? names[a.responsavel_id]),
    permissoes: {
      iniciar: a.estado === "aberta",
      enviar_verificacao: a.estado === "em_execucao",
      devolver: a.estado === "aguardando_verificacao",
      concluir: a.estado === "aguardando_verificacao",
      cancelar: manage() && !["cancelada", "concluida"].includes(a.estado),
      agendar: manage(),
    },
  });
};
export const listarHistoricoAgenda = async ({ data }) => {
  await before("listarHistoricoAgenda", data);
  const p = page(
    data.tipo === "comentarios" ? (state.comments[data.id] ?? []) : (state.history[data.id] ?? []),
    data.pagina,
    data.limite,
  );
  return {
    tipo: data.tipo,
    ...(data.tipo === "comentarios" ? s.comentariosPage : s.revisoesPage).parse(p),
  };
};
export const buscarOpcoesAgenda = async ({ data }) => {
  await before("buscarOpcoesAgenda", data);
  const q = s.opcoesInput.parse(data),
    items =
      {
        pessoas: [
          { id: person, nome: names[person], contexto: "Colaborador ativo" },
          { id: other, nome: names[other], contexto: "Colaborador ativo" },
        ],
        equipes: [
          { id: team, nome: "Equipe do laboratório", contexto: "Vigência real no cenário isolado" },
        ],
        acoes: state.actions.map((a) => ({ id: a.id, nome: a.titulo, contexto: a.estado })),
        levantamentos: [
          {
            id: lev,
            nome: "Levantamento existente do laboratório",
            contexto: "Em coleta",
            cliente_id: client,
            unidade_id: unit,
          },
        ],
        clientes: [
          { id: client, nome: "Cliente de teste", contexto: "Ativo" },
          {
            id: "20000000-0000-4000-8000-000000000002",
            nome: "Segundo cliente de teste",
            contexto: "Ativo",
          },
        ],
        unidades: [
          { id: unit, nome: "Unidade norte", contexto: "Cliente de teste", cliente_id: client },
        ],
        projetos: [
          {
            id: "40000000-0000-4000-8000-000000000009",
            nome: "Projeto operacional do laboratório",
            contexto: "Em andamento",
            cliente_id: client,
          },
        ],
        competencias: [
          {
            id: skill,
            nome: "Procedimento de validação configurado",
            contexto: "Validade exigida",
          },
        ],
        ferramentas: [
          { id: tool, nome: "LAB-FERR-01 — ferramenta de teste", contexto: "Disponível" },
        ],
      }[q.tipo] ?? [];
  return s.opcoesPage.parse(
    page(
      items.filter(
        (r) =>
          (!q.cliente_id || !r.cliente_id || r.cliente_id === q.cliente_id) &&
          (!q.busca || r.nome.toLocaleLowerCase().includes(q.busca.toLocaleLowerCase())),
      ),
      q.pagina,
      q.limite,
    ),
  );
};
export const listarPendentesAgenda = async ({ data }) => {
  await before("listarPendentesAgenda", data);
  const rows = [
    ...state.actions
      .filter(
        (a) =>
          !["concluida", "cancelada"].includes(a.estado) &&
          !state.events.some(
            (e) => e.acao_id === a.id && ["publicado", "em_andamento"].includes(e.estado),
          ),
      )
      .map((a) => ({
        id: a.id,
        tipo: "acao",
        titulo: a.titulo,
        estado: a.estado,
        responsavel_id: a.responsavel_id,
        responsavel_nome: names[a.responsavel_id],
        prazo: a.prazo,
        cliente_id: null,
        unidade_id: null,
      })),
    {
      id: lev,
      tipo: "levantamento",
      titulo: "Levantamento existente do laboratório",
      estado: "em_coleta",
      responsavel_id: person,
      responsavel_nome: names[person],
      prazo: null,
      cliente_id: client,
      unidade_id: unit,
    },
  ];
  return s.pendentesPage.parse(
    page(
      scenario === "empty"
        ? []
        : rows.filter(
            (r) =>
              !data.busca || r.titulo.toLocaleLowerCase().includes(data.busca.toLocaleLowerCase()),
          ),
      data.pagina,
      data.limite,
    ),
  );
};
export const listarNotificacoesAgenda = async ({ data }) => {
  await before("listarNotificacoesAgenda", data);
  const rows = state.notifications.map((n) => ({
    ...n,
    evento: eventView(state.events.find((e) => e.id === n.evento_id)),
  }));
  return s.notificacoesPage.parse({
    ...page(rows, data.pagina, data.limite),
    nao_lidas: rows.filter((n) => !n.lida_em).length,
  });
};
function receipt(tipo, id, evento_id = null, acao_id = null, detalhe = null) {
  return s.reciboAgenda.parse({ tipo, id, evento_id, acao_id, detalhe });
}
function save(data) {
  const input = data.evento,
    prior = state.events.find((e) => e.id === data.evento_id);
  if (prior && prior.version !== data.expected_version)
    throw new Error(
      "O compromisso mudou. Seu preenchimento foi preservado; compare a versão atual antes de salvar.",
    );
  const e = makeEvent(prior?.id ?? crypto.randomUUID(), input.titulo, "", "", {
    ...prior,
    ...input,
    ...period(input),
    estado: prior?.estado ?? "rascunho",
    version: (prior?.version ?? 0) + 1,
    excecao: !!prior?.serie_id,
  });
  state.events = state.events.filter((x) => x.id !== e.id).concat(e);
  state.participants[e.id] = input.participantes.map((p) => participant(e, p));
  state.history[e.id] = [
    ...(state.history[e.id] ?? []),
    { versao: e.version, snapshot: { evento: eventView(e) }, autor: actor, created_at: now },
  ];
  state.comments[e.id] ??= [];
  return e;
}
export const executarAgenda = async ({ data }) => {
  await before("executarAgenda", data);
  const parsed = s.comandoInput.parse(data);
  if (window.__agendaFailNextWrite || scenario === "write-error") {
    window.__agendaFailNextWrite = false;
    throw new Error("Falha de rede simulada; preenchimento preservado.");
  }
  if (window.__agendaConflictNext) {
    window.__agendaConflictNext = false;
    const e = state.events.find((e) => e.id === parsed.dados.evento_id);
    if (e) {
      e.version++;
      e.titulo = "Versão alterada em outra sessão";
    }
    throw new Error(
      "O compromisso mudou. Seu preenchimento foi preservado; compare a versão atual antes de salvar.",
    );
  }
  const payload = JSON.stringify({ ...parsed, chave: null }),
    prior = operations.get(parsed.chave);
  if (prior) {
    if (prior.payload !== payload)
      throw new Error("Chave reutilizada com outro conteúdo (fixture)");
    return copy(prior.receipt);
  }
  let r;
  const d = parsed.dados;
  if (parsed.comando === "salvar_evento") {
    const e = save(d);
    r = receipt("evento", e.id, e.id, e.acao_id, detail(e.id));
  } else if (["publicar", "iniciar", "concluir", "cancelar"].includes(parsed.comando)) {
    const e = state.events.find((e) => e.id === d.evento_id);
    if (!e) throw new Error(AGENDA_ACESSO_NEGADO);
    if (e.version !== d.expected_version)
      throw new Error(
        "O compromisso mudou. Seu preenchimento foi preservado; compare a versão atual antes de salvar.",
      );
    e.estado = {
      publicar: "publicado",
      iniciar: "em_andamento",
      concluir: "concluido",
      cancelar: "cancelado",
    }[parsed.comando];
    e.version++;
    e.motivo = d.motivo ?? null;
    r = receipt("evento", e.id, e.id, e.acao_id, detail(e.id));
  } else if (parsed.comando === "criar_acao") {
    const a = {
      ...copy(state.actions[0]),
      ...d.acao,
      id: crypto.randomUUID(),
      organization_id: org,
      estado: "aberta",
      version: 1,
      created_by: actor,
      created_at: now,
      updated_at: now,
      conclusao: null,
      verificado_por: null,
      motivo: null,
      prazo: d.acao.prazo ?? null,
    };
    state.actions.push(a);
    const e = d.evento
      ? save({ evento: { ...d.evento, acao_id: a.id, levantamento_id: null } })
      : null;
    r = receipt("acao", a.id, e?.id ?? null, a.id, { acao: a, evento: e ? detail(e.id) : null });
  } else if (parsed.comando === "transicionar_acao") {
    const a = canonicalAction(d.acao_id);
    if (!a || a.version !== d.expected_version)
      throw new Error("A ação mudou; compare a versão atual.");
    a.estado = d.estado;
    a.version++;
    a.motivo = d.motivo ?? null;
    r = receipt("acao", a.id, null, a.id, { acao: a, evento: null });
  } else if (parsed.comando === "confirmar") {
    const rows = Object.values(state.participants).flat(),
      p = rows.find((p) => p.id === d.participante_id);
    if (!p || p.version !== d.expected_version)
      throw new Error("Participação alterada; reabra a ficha.");
    p.confirmacao = d.confirmacao;
    p.version++;
    p.ciencia_em = now;
    r = receipt("evento", p.evento_id, p.evento_id, null, detail(p.evento_id));
  } else if (parsed.comando === "comentar") {
    const c = {
      id: crypto.randomUUID(),
      organization_id: org,
      evento_id: d.evento_id,
      texto: d.texto,
      created_by: actor,
      created_at: now,
      autor_nome: "Autor do laboratório",
    };
    (state.comments[d.evento_id] ??= []).push(c);
    r = receipt("comentario", c.id, d.evento_id, null, {
      comentario: c,
      evento: detail(d.evento_id),
    });
  } else if (parsed.comando === "criar_serie") {
    const e = state.events.find((e) => e.id === d.evento_id),
      id = crypto.randomUUID(),
      serie = {
        id,
        organization_id: org,
        version: 1,
        estado: "ativa",
        versao_id: crypto.randomUUID(),
        numero: 1,
        regra: d.regra,
        timezone: e.timezone,
        inicio_aplicacao: dayOf(e.inicio),
        materializado_ate: "2026-12-31",
        pendencias: 2,
        permissoes: { editar: manage(), cancelar: manage(), reprocessar: manage() },
      };
    state.series[id] = serie;
    e.serie_id = id;
    e.serie_versao_id = serie.versao_id;
    e.ocorrencia_data = dayOf(e.inicio);
    e.version++;
    r = receipt("serie", id, e.id, null, { serie, evento: detail(e.id) });
  } else if (["editar_serie", "cancelar_serie", "reprocessar_serie"].includes(parsed.comando)) {
    const serie = state.series[d.serie_id],
      e = state.events.find((e) => e.serie_id === d.serie_id);
    if (serie.version !== d.expected_version)
      throw new Error("A série mudou. Compare a versão atual.");
    serie.version++;
    if (parsed.comando === "editar_serie") {
      serie.regra = d.regra;
      serie.numero++;
      serie.versao_id = crypto.randomUUID();
      e.titulo = d.evento.titulo;
    }
    if (parsed.comando === "cancelar_serie") serie.estado = "cancelada";
    r = receipt("serie", serie.id, e.id, null, { serie, evento: detail(e.id) });
  } else if (parsed.comando === "preferencias") {
    state.preferences = copy(d);
    r = receipt("preferencias", null, null, null, state.preferences);
  } else if (parsed.comando === "marcar_lida") {
    const n = state.notifications.find((n) => n.id === d.notificacao_id);
    n.lida_em = now;
    r = receipt("leitura", n.id, null, null, { notificacao_id: n.id, lida_em: now });
  } else r = receipt("job", null, null, null, null);
  state.writes++;
  operations.set(parsed.chave, { payload, receipt: copy(r) });
  if (window.__agendaCommitThenFail) {
    window.__agendaCommitThenFail = false;
    throw new Error(
      "A resposta de rede foi perdida após confirmação no servidor isolado. Tente novamente com o preenchimento preservado.",
    );
  }
  if (window.__agendaHoldWrite) {
    window.__agendaWriteHeld = true;
    await new Promise((resolve) => {
      window.__releaseAgendaWrite = () => {
        window.__agendaHoldWrite = false;
        resolve();
      };
    });
  }
  window.__agendaWriteReturned = true;
  return copy(r);
};
// Append to tests/ui/agenda-server.ts after the new schema import is available.
// Synthetic DTO-only display cases. This is not a recurrence materializer or SQL proof.
export const listarPendenciasSerieAgenda = async ({ data }) => {
  await before("listarPendenciasSerieAgenda", data);
  const q = pendenciasSerieInput.parse(data);
  const event = state.events.find((row) => row.id === q.evento_id);
  const serie = event?.serie_id ? state.series[event.serie_id] : null;
  if (q.organization_id !== org || !event || !serie || !manage())
    throw new Error(AGENDA_ACESSO_NEGADO);
  if (q.versao_id && q.versao_id !== serie.versao_id)
    throw new Error("Versão da série indisponível neste recorte do laboratório.");
  const version = {
    id: serie.versao_id,
    numero: serie.numero,
    inicio_aplicacao: serie.inicio_aplicacao,
  };
  const dateAfter = (days) =>
    new Date(Date.parse(serie.inicio_aplicacao + "T12:00:00Z") + days * 86400000)
      .toISOString()
      .slice(0, 10);
  let rows = [
    {
      serie_versao_id: version.id,
      data: dateAfter(7),
      estado: "bloqueada",
      codigo: "23P01",
      tentativas: 2,
      proxima_tentativa: now,
      updated_at: now,
    },
    {
      serie_versao_id: version.id,
      data: dateAfter(14),
      estado: "ignorada",
      codigo: "HORARIO_CIVIL_INEXISTENTE",
      tentativas: 1,
      proxima_tentativa: now,
      updated_at: now,
    },
  ];
  if (window.__agendaSeriesMany)
    rows = [
      ...rows,
      ...Array.from({ length: 28 }, (_, index) => ({
        ...rows[index % 2],
        data: dateAfter(15 + index),
      })),
    ];
  if (window.__agendaSeriesShrunk) rows = rows.slice(0, 1);
  const cutoff = serie.estado === "cancelada" ? dateAfter(7) : null;
  const visibleRows = rows.filter((row) => !cutoff || row.data < cutoff);
  return pendenciasSeriePage.parse({
    serie: {
      id: serie.id,
      organization_id: org,
      version: serie.version,
      versao_atual_id: version.id,
      estado: serie.estado,
      cancelamento_corte: cutoff,
      materializado_ate: serie.materializado_ate,
      materializacao_pendente: true,
      ultima_falha_codigo: "23P01",
      ultima_tentativa: now,
    },
    versao: version,
    corte_exclusivo: cutoff,
    versoes: {
      registros: q.pagina_versoes === 0 ? [version] : [],
      total: 1,
      pagina: q.pagina_versoes,
      limite: 25,
    },
    registros: visibleRows.slice(q.pagina * 25, q.pagina * 25 + 25),
    total: visibleRows.length,
    pagina: q.pagina,
    limite: 25,
    permissoes: { ler: true },
  });
};
