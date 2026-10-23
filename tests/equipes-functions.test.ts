import { beforeEach, describe, expect, it, vi } from "vitest";
vi.mock("@/integrations/supabase/auth-middleware", () => ({ requireSupabaseAuth: {} }));
vi.mock("@tanstack/react-start/server", () => ({
  getRequest: () => ({ signal: new AbortController().signal }),
}));
vi.mock("@tanstack/react-start", () => ({
  createServerFn: () => {
    let parse: (input: unknown) => unknown;
    const chain = {
      middleware: () => chain,
      inputValidator: (schema: { parse: (input: unknown) => unknown }) => {
        parse = (input) => schema.parse(input);
        return chain;
      },
      handler: (fn: (args: unknown) => unknown) => (arg: { data: unknown; context: unknown }) =>
        fn({ ...arg, data: parse(arg.data) }),
    };
    return chain;
  },
}));
import {
  buscarPessoasEquipe,
  encerrarMembroEquipe,
  listarEquipes,
  obterEquipe,
  salvarEquipe,
  vincularMembroEquipe,
} from "../src/features/pessoas-competencias/equipes/functions";
import { EQUIPE_ACESSO_INDISPONIVEL } from "../src/features/pessoas-competencias/equipes/domain";

const id = (n: number) => `00000000-0000-4000-8000-${String(n).padStart(12, "0")}`;
const org = id(1),
  user = id(2),
  team = id(3),
  person = id(4),
  leader = id(5),
  member = id(6);
const equipe = {
  id: team,
  organization_id: org,
  nome: "Equipe campo",
  lider_id: leader,
  ativa: true,
  version: 3,
  created_by: user,
  created_at: "2026-10-22T10:00:00Z",
  updated_at: "2026-10-22T11:00:00Z",
};
const membro = {
  id: member,
  organization_id: org,
  equipe_id: team,
  pessoa_id: person,
  inicio: "2026-10-01",
  fim: null as string | null,
  created_by: user,
  created_at: "2026-10-01T10:00:00Z",
};
type Item = Record<string, unknown>;
let fixture: ReturnType<typeof makeFixture>;
function makeFixture() {
  const state = {
    ler: true,
    gerir: true,
    pessoaId: person as string | null,
    afterRead: null as (() => void) | null,
    afterWrite: null as (() => void) | null,
    missingCount: false,
    missingData: false,
    rpcError: null as { code: string; message: string } | null,
    root: { ...equipe },
    members: [{ ...membro }],
    receipt: { ...equipe, version: 1 },
  };
  const queries: Array<{
    table: string;
    columns: string;
    eq: Array<[string, unknown]>;
    range?: [number, number];
    order: string[];
    term?: string;
  }> = [];
  const asyncValue = (value: unknown) => {
    const promise = Promise.resolve(value);
    return Object.assign(promise, { abortSignal: () => promise });
  };
  const db = {
    rpc: vi.fn((name: string, args: Record<string, unknown>) => {
      if (name === "operacao_pode")
        return asyncValue({
          data: args["_acao"] === "ver_equipe" ? state.ler : state.gerir,
          error: null,
        });
      state.afterWrite?.();
      return asyncValue({
        data:
          name === "salvar_equipe"
            ? state.receipt
            : { ...membro, fim: name === "encerrar_membro_equipe" ? "2026-10-22" : null },
        error: state.rpcError,
      });
    }),
    from: vi.fn((table: string) => {
      const query: (typeof queries)[number] = { table, columns: "", eq: [], order: [] };
      queries.push(query);
      const resolve = () => {
        let rows: Item[] =
          table === "equipes"
            ? [{ ...state.root }]
            : table === "equipe_membros"
              ? state.members.filter((m) => state.gerir || m.pessoa_id === state.pessoaId)
              : [
                  {
                    id: person,
                    nome: "Pessoa sem login",
                    funcao: "Técnica",
                    ativa: true,
                    user_id: user,
                    organization_id: org,
                  },
                  {
                    id: leader,
                    nome: "Outra pessoa",
                    funcao: "Líder",
                    ativa: true,
                    user_id: id(9),
                    organization_id: org,
                  },
                ].filter((p) => state.gerir || p.id === state.pessoaId);
        for (const [key, value] of query.eq) rows = rows.filter((r) => r[key] === value);
        const count = rows.length;
        if (query.range) rows = rows.slice(query.range[0], query.range[1] + 1);
        state.afterRead?.();
        return {
          data: state.missingData ? null : rows,
          error: null,
          count: state.missingCount ? null : count,
        };
      };
      const chain = {
        select: (cols: string) => {
          query.columns = cols;
          return chain;
        },
        eq: (key: string, value: unknown) => {
          query.eq.push([key, value]);
          return chain;
        },
        in: (_key: string, _ids: unknown) => chain,
        order: (key: string) => {
          query.order.push(key);
          return chain;
        },
        range: (a: number, b: number) => {
          query.range = [a, b];
          return chain;
        },
        ilike: (_key: string, value: string) => {
          query.term = value;
          return chain;
        },
        abortSignal: () => chain,
        maybeSingle: () => {
          const r = resolve();
          return Promise.resolve({ ...r, data: r.data?.[0] ?? null });
        },
        then: (success: (data: unknown) => unknown, failure?: (error: unknown) => unknown) =>
          Promise.resolve(resolve()).then(success, failure),
      };
      return chain;
    }),
  };
  return { db, state, queries };
}
function call(fn: unknown, data: unknown) {
  return (fn as (arg: unknown) => Promise<unknown>)({
    data,
    context: { supabase: fixture.db, userId: user },
  });
}
beforeEach(() => {
  fixture = makeFixture();
});
describe("Equipes: handlers autenticados com transporte isolado", () => {
  it("nega leitura antes de consultar tabelas", async () => {
    fixture.state.ler = false;
    await expect(call(listarEquipes, { organization_id: org })).rejects.toThrow(
      EQUIPE_ACESSO_INDISPONIVEL,
    );
    expect(fixture.db.from).not.toHaveBeenCalled();
  });
  it("pagina e ordena no servidor, preservando tenant e busca literal", async () => {
    await call(listarEquipes, { organization_id: org, pagina: 2, busca: "Campo_%" });
    const q = fixture.queries.find((q) => q.table === "equipes")!;
    expect(q.eq).toContainEqual(["organization_id", org]);
    expect(q.eq).toContainEqual(["ativa", true]);
    expect(q.range).toEqual([50, 74]);
    expect(q.order).toEqual(["nome", "id"]);
    expect(q.term).toBe("%Campo\\_\\%%");
  });
  it("não enumera pessoas com perfil sem gestão", async () => {
    fixture.state.gerir = false;
    await expect(call(buscarPessoasEquipe, { organization_id: org })).rejects.toThrow(
      EQUIPE_ACESSO_INDISPONIVEL,
    );
    expect(fixture.queries.some((q) => q.columns.includes("nome"))).toBe(false);
  });
  it("contagem ausente não vira zero real na lista", async () => {
    fixture.state.missingCount = true;
    await expect(call(listarEquipes, { organization_id: org })).rejects.toThrow(
      "contagem dos registros",
    );
  });
  it("dados ausentes não viram estado vazio", async () => {
    fixture.state.missingData = true;
    await expect(call(listarEquipes, { organization_id: org })).rejects.toThrow("lista válida");
  });
  it("zero de membros é aceito somente com lista e contagem reais", async () => {
    fixture.state.members = [];
    await expect(call(obterEquipe, { organization_id: org, id: team })).resolves.toMatchObject({
      membros: { rows: [], total: 0 },
    });
  });
  it("detalhe de Campo preserva próprio vínculo sem ampliar nomes via service", async () => {
    fixture.state.gerir = false;
    const value = await call(obterEquipe, { organization_id: org, id: team });
    expect(value).toMatchObject({
      lider: null,
      membros: {
        rows: [{ pessoa_id: person, pessoa_nome: "Pessoa sem login", pode_encerrar: false }],
      },
      permissoes: { gerir: false, incluir: false },
    });
    expect(JSON.stringify(value)).not.toContain("Outra pessoa");
  });
  it("esconde payload se o escopo muda entre início e fim da leitura", async () => {
    fixture.state.afterRead = () => {
      fixture.state.gerir = false;
    };
    await expect(call(listarEquipes, { organization_id: org })).rejects.toThrow(
      EQUIPE_ACESSO_INDISPONIVEL,
    );
  });
  it("salvar mantém versão aberta e relê versão atual depois de recibo antigo", async () => {
    const value = await call(salvarEquipe, {
      organization_id: org,
      chave: id(7),
      id: team,
      expected_version: 1,
      dados: { nome: "Equipe nova", lider_id: null, ativa: true },
      created_by: id(99),
    });
    expect(value).toMatchObject({ equipe: { version: 3 } });
    expect(fixture.db.rpc).toHaveBeenCalledWith("salvar_equipe", {
      _org: org,
      _chave: id(7),
      _id: team,
      _expected_version: 1,
      _dados: { nome: "Equipe nova", lider_id: null, ativa: true },
    });
  });
  it("nega resposta de gravação quando gestão é revogada antes da releitura", async () => {
    fixture.state.afterWrite = () => {
      fixture.state.gerir = false;
    };
    await expect(
      call(salvarEquipe, { organization_id: org, chave: id(7), dados: { nome: "Equipe nova" } }),
    ).rejects.toThrow(EQUIPE_ACESSO_INDISPONIVEL);
  });
  it("traduz conflito de versão sem devolver registro ou sobrescrever", async () => {
    fixture.state.rpcError = { code: "40001", message: "PRIVATE" };
    await expect(
      call(salvarEquipe, {
        organization_id: org,
        chave: id(7),
        id: team,
        expected_version: 1,
        dados: { nome: "Equipe nova" },
      }),
    ).rejects.toThrow("Consulte a versão atual");
    expect(fixture.queries.some((q) => q.table === "equipes")).toBe(false);
  });
  it("inclui por RPC e mantém datas inclusivas sem produzir horas", async () => {
    await call(vincularMembroEquipe, {
      organization_id: org,
      chave: id(7),
      equipe_id: team,
      pessoa_id: person,
      inicio: "2026-10-22",
      fim: "2026-10-22",
    });
    expect(fixture.db.rpc).toHaveBeenCalledWith("vincular_membro_equipe", {
      _org: org,
      _chave: id(7),
      _equipe: team,
      _pessoa: person,
      _inicio: "2026-10-22",
      _fim: "2026-10-22",
    });
  });
  it("encerra o vínculo identificado com motivo e sem edição direta", async () => {
    await call(encerrarMembroEquipe, {
      organization_id: org,
      chave: id(7),
      id: member,
      fim: "2026-10-22",
      motivo: "Troca planejada",
    });
    expect(fixture.db.rpc).toHaveBeenCalledWith("encerrar_membro_equipe", {
      _org: org,
      _chave: id(7),
      _id: member,
      _fim: "2026-10-22",
      _motivo: "Troca planejada",
    });
  });
  it("vínculo fechado não recebe ação de encerramento", async () => {
    fixture.state.members[0]!.fim = "2026-10-20";
    await expect(call(obterEquipe, { organization_id: org, id: team })).resolves.toMatchObject({
      membros: { rows: [{ pode_encerrar: false }] },
    });
  });
});
