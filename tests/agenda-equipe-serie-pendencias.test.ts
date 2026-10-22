import { describe, it, expect, vi } from "vitest";
const harness = vi.hoisted(() => ({
  signal: new AbortController().signal,
  middleware: [] as unknown[][],
  auth: {},
}));
vi.mock("@/integrations/supabase/auth-middleware", () => ({
  requireSupabaseAuth: harness.auth,
}));
vi.mock("@tanstack/react-start/server", () => ({
  getRequest: () => ({ signal: harness.signal }),
}));
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
import { listarPendenciasSerieAgenda } from "../src/features/agenda-equipe/serie-pendencias.functions";
import { AGENDA_ACESSO_NEGADO } from "../src/features/agenda-equipe/domain";
const id = (n: number) => `00000000-0000-4000-8000-${String(n).padStart(12, "0")}`;
const org = id(1),
  event = id(2),
  serie = id(3),
  current = id(4),
  old = id(5),
  iso = "2026-11-10T12:00:00Z";
const root = {
  id: serie,
  organization_id: org,
  version: 3,
  versao_atual_id: current,
  estado: "ativa",
  cancelamento_corte: null as string | null,
  materializado_ate: "2026-12-20",
  materializacao_pendente: true,
  ultima_falha_codigo: "23P01",
  ultima_tentativa: iso,
};
const version = { id: current, numero: 3, inicio_aplicacao: "2026-11-10" };
type Response = {
  data: unknown;
  error: { code: string; message: string } | null;
  count?: number | null;
};
type Call = { table: string; ops: [string, unknown[]][] };
function fixture() {
  const calls: Call[] = [],
    signals: AbortSignal[] = [];
  const f = {
    manage: true,
    allowed: true,
    rootVersion: 3,
    row: { ...root },
    versions: [version],
    selected: { id: old, numero: 1, inicio_aplicacao: "2026-11-01" },
    cut: [] as unknown[],
    total: 1,
    versionCount: 1 as number | null,
    rows: [
      {
        serie_versao_id: current,
        data: "2026-11-11",
        estado: "bloqueada",
        codigo: "23P01",
        tentativas: 2,
        proxima_tentativa: iso,
        updated_at: iso,
        evento_modelo: { privado: true },
      },
    ],
    responseCount: undefined as number | null | undefined,
    afterRead: (_call: Call) => {},
    error: null as Response["error"],
  };
  const rpc = vi.fn((name: string) => ({
    abortSignal: (signal: AbortSignal) => {
      signals.push(signal);
      return Promise.resolve(
        name === "ag_configuracao"
          ? { data: { permissoes: { gerir_series: f.manage } }, error: null }
          : f.allowed
            ? {
                data: {
                  evento: { id: event, organization_id: org },
                  serie: {
                    id: serie,
                    version: f.rootVersion,
                    versao_id: current,
                  },
                },
                error: null,
              }
            : { data: null, error: { code: "42501", message: "privado" } },
      );
    },
  }));
  const from = (table: string) => {
    const call: Call = { table, ops: [] };
    calls.push(call);
    const result = () => {
      let response: Response;
      if (table === "agenda_series") response = { data: f.row, error: f.error };
      else if (table === "agenda_serie_ocorrencias")
        response = {
          data: f.rows,
          error: f.error,
          count: f.responseCount === undefined ? f.total : f.responseCount,
        };
      else if (call.ops.some(([name]) => name === "gt")) response = { data: f.cut, error: f.error };
      else if (call.ops.some(([name]) => name === "maybeSingle"))
        response = { data: f.selected, error: f.error };
      else response = { data: f.versions, error: f.error, count: f.versionCount };
      f.afterRead(call);
      return response;
    };
    const chain: Record<string, unknown> = {};
    for (const name of [
      "select",
      "eq",
      "order",
      "range",
      "limit",
      "gt",
      "gte",
      "lt",
      "in",
      "maybeSingle",
      "abortSignal",
    ])
      chain[name] = (...args: unknown[]) => {
        call.ops.push([name, args]);
        if (name === "abortSignal") signals.push(args[0] as AbortSignal);
        return chain;
      };
    chain["then"] = (resolve: (value: Response) => unknown, reject: (reason: unknown) => unknown) =>
      Promise.resolve(result()).then(resolve, reject);
    return chain;
  };
  return { f, calls, signals, rpc, context: { supabase: { rpc, from } } };
}
const invoke = async (f: ReturnType<typeof fixture>, extra: Record<string, unknown> = {}) =>
  (
    listarPendenciasSerieAgenda as unknown as (
      args: unknown,
    ) => Promise<{ registros: unknown[]; corte_exclusivo: string | null }>
  )({
    context: f.context,
    data: { organization_id: org, evento_id: event, ...extra },
  });
describe("Agenda: pendências da série pela versão e ACL atual", () => {
  it("declara sessão e recusa input sem identidade antes do banco", async () => {
    expect(harness.middleware.every((items) => items.includes(harness.auth))).toBe(true);
    const f = fixture();
    await expect(invoke(f, { evento_id: "inválido" })).rejects.toThrow();
    expect(f.calls).toHaveLength(0);
    expect(f.rpc).not.toHaveBeenCalled();
  });
  it("padrão é a versão atual, pagina25 com count exato, filtros tenant e sinal; não expõe modelo", async () => {
    const f = fixture(),
      result = await invoke(f, { pagina: 2 });
    const occurrences = f.calls.find((call) => call.table === "agenda_serie_ocorrencias")!;
    expect(occurrences.ops).toContainEqual(["eq", ["organization_id", org]]);
    expect(occurrences.ops).toContainEqual(["eq", ["serie_versao_id", current]]);
    expect(occurrences.ops).toContainEqual(["gte", ["data", "2026-11-10"]]);
    expect(occurrences.ops).toContainEqual(["range", [50, 74]]);
    expect(occurrences.ops).toContainEqual([
      "select",
      [
        "serie_versao_id,data,estado,codigo,tentativas,proxima_tentativa,updated_at",
        { count: "exact" },
      ],
    ]);
    expect(occurrences.ops).toContainEqual(["in", ["estado", ["bloqueada", "ignorada"]]]);
    expect(f.signals.every((s) => s === harness.signal)).toBe(true);
    expect(JSON.stringify(result)).not.toContain("evento_modelo");
    expect(f.rpc.mock.calls.filter(([name]) => name === "ag_configuracao")).toHaveLength(
      f.calls.length + 1,
    );
  });
  it("histórica consulta o menor corte das versões posteriores e cruza cancelamento sem baixar modelos", async () => {
    const f = fixture();
    f.f.row.cancelamento_corte = "2026-11-07";
    f.f.cut = [{ id: id(8), numero: 2, inicio_aplicacao: "2026-11-05" }];
    const result = await invoke(f, { versao_id: old, pagina_versoes: 1 });
    expect(result.corte_exclusivo).toBe("2026-11-05");
    const cut = f.calls.find((c) => c.ops.some(([name]) => name === "gt"))!;
    expect(cut.ops).toContainEqual(["gt", ["numero", 1]]);
    expect(cut.ops).toContainEqual(["order", ["inicio_aplicacao", { ascending: true }]]);
    expect(cut.ops).toContainEqual(["limit", [1]]);
    const occurrences = f.calls.find((c) => c.table === "agenda_serie_ocorrencias")!;
    expect(occurrences.ops).toContainEqual(["lt", ["data", "2026-11-05"]]);
    expect(occurrences.ops).toContainEqual(["eq", ["serie_versao_id", old]]);
    expect(f.calls.find((c) => c.table === "agenda_serie_versoes")!.ops).toContainEqual([
      "range",
      [25, 49],
    ]);
  });
  it("recusa gestor revogado mesmo mantendo leitura da origem, antes de retornar linhas", async () => {
    const f = fixture();
    f.f.afterRead = (call) => {
      if (call.table === "agenda_serie_ocorrencias") f.f.manage = false;
    };
    await expect(invoke(f)).rejects.toThrow(AGENDA_ACESSO_NEGADO);
  });
  it("revalida a fonte após cada consulta e não continua após negação", async () => {
    const f = fixture();
    f.f.afterRead = () => {
      f.f.allowed = false;
    };
    await expect(invoke(f)).rejects.toThrow(AGENDA_ACESSO_NEGADO);
    expect(f.calls).toHaveLength(1);
  });
  it("não transforma count/data ausente em zero; distingue rede de acesso negado", async () => {
    const f = fixture();
    f.f.responseCount = null;
    await expect(invoke(f)).rejects.toThrow("contagem");
    const network = fixture();
    network.f.error = { code: "NETWORK", message: "conteúdo restrito" };
    await expect(invoke(network)).rejects.toThrow("Tente novamente");
    const absent = fixture();
    absent.f.row = null as unknown as typeof root;
    await expect(invoke(absent)).rejects.toThrow(AGENDA_ACESSO_NEGADO);
  });
  it("mudança da série durante a leitura requer recarregar, sem usar novo corte silenciosamente", async () => {
    const f = fixture();
    f.f.afterRead = () => {
      f.f.rootVersion = 4;
    };
    await expect(invoke(f)).rejects.toThrow("A série mudou durante a consulta");
  });
  it("não permite consultar versão de outra série/tenant", async () => {
    const f = fixture();
    f.f.selected = null as unknown as typeof f.f.selected;
    await expect(invoke(f, { versao_id: id(9) })).rejects.toThrow(AGENDA_ACESSO_NEGADO);
    const selected = f.calls.find(
      (c) => c.ops.some(([name]) => name === "maybeSingle") && c.table === "agenda_serie_versoes",
    )!;
    expect(selected.ops).toContainEqual(["eq", ["organization_id", org]]);
    expect(selected.ops).toContainEqual(["eq", ["serie_id", serie]]);
  });
});
