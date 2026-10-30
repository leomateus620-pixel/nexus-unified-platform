import { beforeEach, describe, it, expect, vi } from "vitest";
const harness = vi.hoisted(() => ({
  signal: new AbortController().signal,
  middleware: [] as unknown[][],
  auth: {},
}));
vi.mock("@/integrations/supabase/auth-middleware", () => ({ requireSupabaseAuth: harness.auth }));
vi.mock("@tanstack/react-start/server", () => ({ getRequest: () => ({ signal: harness.signal }) }));
vi.mock("@tanstack/react-start", () => ({
  createServerFn: () => {
    let parse: (value: unknown) => unknown;
    const chain = {
      middleware: (items: unknown[]) => {
        harness.middleware.push(items);
        return chain;
      },
      inputValidator: (schema: { parse: (v: unknown) => unknown }) => {
        parse = (v) => schema.parse(v);
        return chain;
      },
      handler: (fn: (args: unknown) => unknown) => (arg: { data: unknown; context: unknown }) =>
        fn({ ...arg, data: parse(arg.data) }),
    };
    return chain;
  },
}));
import {
  buscarOpcoesAgenda,
  executarAgenda,
  listarAgenda,
  listarHistoricoAgenda,
  listarNotificacoesAgenda,
  listarPendentesAgenda,
  obterAcaoAgenda,
  obterConfiguracaoAgenda,
  obterEventoAgenda,
  obterDashboardAgenda,
} from "../src/features/agenda-equipe/agenda.functions";
import { AGENDA_ACESSO_NEGADO } from "../src/features/agenda-equipe/domain";
const id = (n: number) => `00000000-0000-4000-8000-${String(n).padStart(12, "0")}`;
const iso = "2026-10-22T12:00:00Z",
  org = id(1);
const page = { registros: [], total: 0, pagina: 0, limite: 25 };
function fixture() {
  const signals: AbortSignal[] = [];
  let response: { data: unknown; error: { code: string; message: string } | null } = {
    data: null,
    error: null,
  };
  const rpc = vi.fn((_name: string, _args: Record<string, unknown>) => ({
    abortSignal: (signal: AbortSignal) => {
      signals.push(signal);
      return Promise.resolve(response);
    },
  }));
  const context = { supabase: { rpc }, userId: id(2) };
  return {
    rpc,
    signals,
    context,
    set(data: unknown, error: { code: string; message: string } | null = null) {
      response = { data, error };
    },
  };
}
async function invoke(fn: unknown, fx: ReturnType<typeof fixture>, data: unknown) {
  return (fn as (input: { data: unknown; context: unknown }) => Promise<unknown>)({
    data,
    context: fx.context,
  });
}
describe("Agenda: fronteiras autenticadas e DTO sem fallback silencioso", () => {
  beforeEach(() => vi.clearAllMocks());
  it("todas as dez funções declaram o middleware de sessão", () => {
    expect(harness.middleware).toHaveLength(10);
    expect(harness.middleware.every((m) => m.includes(harness.auth))).toBe(true);
  });
  it("lista usa recorte civil/filtros exatos e sinal da requisição", async () => {
    const f = fixture();
    f.set({
      ...page,
      limite: 50,
      inicio: "2026-10-22",
      fim: "2026-10-23",
      timezone: "America/Sao_Paulo",
      dias: [{ data: "2026-10-22", total: 0 }],
      permissoes: { criar: false, criar_acao: false, gerir_series: false },
      minha_pessoa_id: null,
    });
    await invoke(listarAgenda, f, {
      organization_id: org,
      inicio: "2026-10-22",
      fim: "2026-10-23",
      timezone: "America/Sao_Paulo",
      busca: "Equipe A",
      minha: true,
      pagina: 2,
    });
    expect(f.rpc).toHaveBeenCalledWith("ag_listar_v2", {
      _org: org,
      _inicio: "2026-10-22",
      _fim: "2026-10-23",
      _filtros: {
        demanda: false,
        minha: true,
        busca: "Equipe A",
        estado: null,
        tipo: null,
        equipe_id: null,
        pessoa_id: null,
        cliente_id: null,
        projeto_id: null,
        natureza: null,
        hora: null,
      },
      _pagina: 2,
      _limite: 50,
    });
    expect(f.signals).toEqual([harness.signal]);
  });
  it("dashboard usa agregado completo autenticado e preserva todos os filtros sem paginação", async () => {
    const f = fixture();
    f.set({
      inicio: "2026-10-01",
      fim: "2026-11-01",
      timezone: "America/Sao_Paulo",
      total: 0,
      pessoas: [],
      dias: [],
      horas: [],
      categorias: [],
      semanas: [],
    });
    await invoke(obterDashboardAgenda, f, {
      organization_id: org,
      inicio: "2026-10-01",
      fim: "2026-11-01",
      pessoa_id: id(6),
      natureza: "acao",
      hora: 9,
    });
    expect(f.rpc).toHaveBeenCalledWith("ag_dashboard", {
      _org: org,
      _inicio: "2026-10-01",
      _fim: "2026-11-01",
      _filtros: {
        demanda: undefined,
        minha: false,
        busca: "",
        estado: null,
        tipo: null,
        equipe_id: null,
        pessoa_id: id(6),
        cliente_id: null,
        projeto_id: null,
        natureza: "acao",
        hora: 9,
      },
    });
    f.set(null);
    await expect(
      invoke(obterDashboardAgenda, f, {
        organization_id: org,
        inicio: "2026-10-01",
        fim: "2026-11-01",
      }),
    ).rejects.toThrow();
  });
  it("não consulta nem escreve com janela ilimitada ou autoria forjada", async () => {
    const f = fixture();
    await expect(
      invoke(listarAgenda, f, {
        organization_id: org,
        inicio: "2026-01-01",
        fim: "2027-01-01",
        timezone: "UTC",
      }),
    ).rejects.toThrow();
    await expect(
      invoke(executarAgenda, f, {
        organization_id: org,
        chave: id(3),
        comando: "comentar",
        dados: { evento_id: id(4), texto: "Inspeção agendada", created_by: id(5) },
      }),
    ).rejects.toThrow();
    expect(f.rpc).not.toHaveBeenCalled();
  });
  it("ausência de total/dados não vira lista vazia ou zero", async () => {
    const f = fixture();
    f.set({ registros: [] });
    await expect(invoke(listarPendentesAgenda, f, { organization_id: org })).rejects.toThrow();
    f.set(null);
    await expect(invoke(listarNotificacoesAgenda, f, { organization_id: org })).rejects.toThrow();
  });
  it("seletor usa whitelist e parâmetro do cliente, sem endpoint de custos", async () => {
    const f = fixture();
    f.set(page);
    await invoke(buscarOpcoesAgenda, f, {
      organization_id: org,
      tipo: "unidades",
      cliente_id: id(3),
      busca: "Unidade",
      pagina: 1,
    });
    expect(f.rpc).toHaveBeenCalledWith("ag_opcoes", {
      _org: org,
      _tipo: "unidades",
      _busca: "Unidade",
      _cliente: id(3),
      _pagina: 1,
      _limite: 25,
    });
    await expect(
      invoke(buscarOpcoesAgenda, f, { organization_id: org, tipo: "custos" }),
    ).rejects.toThrow();
    expect(f.rpc).toHaveBeenCalledTimes(1);
  });
  it("confirmar presença envia versão da participação e nenhuma alteração de origem", async () => {
    const f = fixture();
    f.set({ tipo: "evento", id: id(4), evento_id: id(4), acao_id: null, detalhe: null });
    await invoke(executarAgenda, f, {
      organization_id: org,
      chave: id(3),
      comando: "confirmar",
      dados: { participante_id: id(5), expected_version: 2, confirmacao: "confirmada" },
    });
    expect(f.rpc).toHaveBeenCalledWith("ag_executar", {
      _org: org,
      _chave: id(3),
      _comando: "confirmar",
      _dados: { participante_id: id(5), expected_version: 2, confirmacao: "confirmada" },
    });
    expect(f.rpc).toHaveBeenCalledTimes(1);
  });
  it("ação sem horário passa pelo comando canônico transacional, sem outro cadastro", async () => {
    const f = fixture(),
      acao = {
        titulo: "Tratar achado",
        descricao: "Conferir evidência",
        responsavel_id: id(5),
        prioridade: "alta",
        exige_verificacao: true,
      };
    f.set({ tipo: "acao", id: id(4), acao_id: id(4), evento_id: null, detalhe: null });
    await invoke(executarAgenda, f, {
      organization_id: org,
      chave: id(3),
      comando: "criar_acao",
      dados: { acao },
    });
    expect(f.rpc).toHaveBeenCalledWith("ag_executar", {
      _org: org,
      _chave: id(3),
      _comando: "criar_acao",
      _dados: { acao },
    });
  });
  it("ação atual vem da projeção autorizada de flags e nome, sem inferir papel no browser", async () => {
    const f = fixture();
    f.set({
      acao: {
        id: id(4),
        organization_id: org,
        titulo: "Tratar achado",
        descricao: "",
        responsavel_id: id(5),
        prazo: null,
        prioridade: "normal",
        exige_verificacao: true,
        estado: "aberta",
        conclusao: null,
        motivo: null,
        version: 1,
        custo_interno: "proibido",
      },
      responsavel_nome: "Pessoa autorizada",
      permissoes: {
        iniciar: false,
        devolver: false,
        enviar_verificacao: false,
        concluir: false,
        cancelar: false,
        agendar: false,
      },
    });
    const result = await invoke(obterAcaoAgenda, f, { organization_id: org, id: id(4) });
    expect(f.rpc).toHaveBeenCalledWith("ag_obter_acao", { _org: org, _id: id(4) });
    expect(JSON.stringify(result)).not.toContain("custo_interno");
  });
  it("negação de fonte mantém somente mensagem pública estável", async () => {
    const f = fixture();
    f.set(null, { code: "42501", message: "contexto privado não deve sair" });
    await expect(invoke(obterEventoAgenda, f, { organization_id: org, id: id(4) })).rejects.toThrow(
      AGENDA_ACESSO_NEGADO,
    );
  });
  it("conflito de versão e conflito de recurso preservam explicação recuperável distinta", async () => {
    const f = fixture(),
      input = {
        organization_id: org,
        chave: id(3),
        comando: "publicar",
        dados: { evento_id: id(4), expected_version: 2 },
      };
    f.set(null, { code: "40001", message: "Privado" });
    await expect(invoke(executarAgenda, f, input)).rejects.toThrow("compare a versão atual");
    f.set(null, { code: "23P01", message: "Privado" });
    await expect(invoke(executarAgenda, f, input)).rejects.toThrow(
      "conflito de horário ou recurso",
    );
  });
  it("histórico é paginado e não exige baixar coleção inteira", async () => {
    const f = fixture();
    f.set({
      ...page,
      registros: [
        { versao: 2, snapshot: { titulo: "Origem autorizada" }, autor: id(2), created_at: iso },
      ],
    });
    await invoke(listarHistoricoAgenda, f, {
      organization_id: org,
      id: id(4),
      tipo: "revisoes",
      pagina: 3,
    });
    expect(f.rpc).toHaveBeenCalledWith("ag_historico", {
      _org: org,
      _id: id(4),
      _tipo: "revisoes",
      _pagina: 3,
      _limite: 25,
    });
  });
  it("configuração exige relógio/fuso do servidor e resumo de processamento explícito", async () => {
    const f = fixture();
    f.set({
      minha_pessoa_id: null,
      permissoes: { criar: false, criar_acao: false, gerir_series: false },
      preferencias: { antecedencia_minutos: 60, notificar_atrasos: true, notificar: true },
      jobs: null,
      timezone: "America/Sao_Paulo",
      server_now: iso,
    });
    await expect(
      invoke(obterConfiguracaoAgenda, f, { organization_id: org }),
    ).resolves.toHaveProperty("server_now", iso);
    expect(f.signals).toEqual([harness.signal]);
  });
});
