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
  buscarOpcoesQualificacao,
  listarCompetencias,
  listarQualificacoes,
  obterCompetencia,
  obterQualificacao,
  salvarCompetencia,
  salvarQualificacao,
  transicionarQualificacao,
} from "../src/features/pessoas-competencias/qualificacoes/functions";
import { QUALIFICACAO_ACESSO_INDISPONIVEL } from "../src/features/pessoas-competencias/qualificacoes/domain";
const id = (n: number) => `00000000-0000-4000-8000-${String(n).padStart(12, "0")}`;
const org = id(1),
  user = id(2),
  competence = id(3),
  person = id(4),
  qualification = id(5);
const audit = {
  organization_id: org,
  version: 3,
  created_by: user,
  created_at: "2026-10-22T10:00:00Z",
  updated_at: "2026-10-22T10:01:00Z",
};
const comp = {
  ...audit,
  id: competence,
  nome: "Competência técnica",
  descricao: "Política autorizada",
  exige_evidencia: true,
  exige_validade: false,
  ativa: true,
};
const qual = {
  ...audit,
  id: qualification,
  pessoa_id: person,
  competencia_id: competence,
  emissor: "Instituição",
  conclusao: "2026-10-01",
  validade: null,
  estado: "enviada",
  conferido_por: null,
  conferido_em: null,
  motivo: null,
  pessoa: { id: person, nome: "Pessoa técnica", user_id: id(7), ativa: true },
  competencia: {
    id: competence,
    nome: comp.nome,
    ativa: true,
    exige_evidencia: true,
    exige_validade: false,
  },
};
type Item = Record<string, unknown>;
function makeFixture() {
  const state = {
    ler: true,
    gerir: true,
    revisar: true,
    pessoaId: person as string | null,
    ownActive: true,
    missingCount: false,
    missingData: false,
    missingRow: false,
    readCode: "",
    afterRead: null as ((table: string) => void) | null,
    afterWrite: null as (() => void) | null,
    rpcError: null as { code: string; message: string } | null,
    formerAssociation: false,
    projectionError: null as { code: string; message: string } | null,
    comp: { ...comp },
    qual: { ...qual, pessoa: { ...qual.pessoa, user_id: qual.pessoa.user_id as string | null } },
  };
  const queries: Array<{
    table: string;
    columns: string;
    eq: Array<[string, unknown]>;
    order: string[];
    range?: number[];
    term?: string;
  }> = [];
  const asyncValue = (value: unknown) => {
    const p = Promise.resolve(value);
    return Object.assign(p, { abortSignal: () => p });
  };
  const db = {
    rpc: vi.fn((name: string, args: Record<string, unknown>) => {
      if (name === "operacao_pode")
        return asyncValue({
          data:
            args["_acao"] === "ver_equipe"
              ? state.ler
              : args["_acao"] === "gerir_equipe"
                ? state.gerir
                : state.revisar,
          error: null,
        });
      if (name === "qualificacao_validacao_permitida")
        return asyncValue({
          data: !state.formerAssociation && state.qual.pessoa.user_id !== user,
          error: state.projectionError,
        });
      state.afterWrite?.();
      return asyncValue({
        data: {
          id: name === "salvar_competencia" ? competence : qualification,
          version: 1,
          estado: "enviada",
        },
        error: state.rpcError,
      });
    }),
    from: vi.fn((table: string) => {
      const query: (typeof queries)[number] = { table, columns: "", eq: [], order: [] };
      queries.push(query);
      const resolve = () => {
        let rows: Item[] =
          table === "competencias"
            ? [{ ...state.comp }]
            : table === "pessoa_qualificacoes"
              ? [{ ...state.qual }]
              : [
                  {
                    id: person,
                    organization_id: org,
                    nome: "Pessoa vinculada",
                    user_id: user,
                    ativa: state.ownActive,
                  },
                  {
                    id: id(8),
                    organization_id: org,
                    nome: "Outra pessoa",
                    user_id: id(9),
                    ativa: true,
                  },
                ].filter((p) => state.gerir || p.id === state.pessoaId);
        if (state.missingRow && table !== "pessoas") rows = [];
        for (const [k, v] of query.eq) rows = rows.filter((r) => r[k] === v);
        const count = rows.length;
        if (query.range) rows = rows.slice(query.range[0], query.range[1]! + 1);
        state.afterRead?.(table);
        return {
          data: state.missingData && table !== "pessoas" ? null : rows,
          count: state.missingCount ? null : count,
          error:
            state.readCode && table !== "pessoas"
              ? { code: state.readCode, message: "isolated transport failure" }
              : null,
        };
      };
      const chain = {
        select: (s: string) => {
          query.columns = s;
          return chain;
        },
        eq: (k: string, v: unknown) => {
          query.eq.push([k, v]);
          return chain;
        },
        ilike: (_k: string, v: string) => {
          query.term = v;
          return chain;
        },
        limit: (_n: number) => chain,
        order: (k: string) => {
          query.order.push(k);
          return chain;
        },
        range: (a: number, b: number) => {
          query.range = [a, b];
          return chain;
        },
        abortSignal: (_s: unknown) => chain,
        maybeSingle: () => {
          const r = resolve();
          return Promise.resolve({ ...r, data: r.data?.[0] ?? null });
        },
        then: (success: (r: unknown) => unknown, failure?: (e: unknown) => unknown) =>
          Promise.resolve(resolve()).then(success, failure),
      };
      return chain;
    }),
  };
  return { db, state, queries };
}
let fixture: ReturnType<typeof makeFixture>;
function call(fn: unknown, data: unknown) {
  return (fn as (args: unknown) => Promise<unknown>)({
    data,
    context: { supabase: fixture.db, userId: user },
  });
}
beforeEach(() => {
  fixture = makeFixture();
});
describe("Qualificações: fronteiras autenticadas, transporte isolado", () => {
  it("aplica paginação estável e tenant explícito sem payload financeiro", async () => {
    await call(listarCompetencias, { organization_id: org, pagina: 2, busca: "Téc_%" });
    const q = fixture.queries.find((q) => q.table === "competencias")!;
    expect(q.eq).toContainEqual(["organization_id", org]);
    expect(q.eq).toContainEqual(["ativa", true]);
    expect(q.range).toEqual([50, 74]);
    expect(q.order).toEqual(["nome", "id"]);
    expect(q.term).toBe("%Téc\\_\\%%");
    expect(q.columns).not.toMatch(/custo|salario|valor|saude/i);
  });
  it("qualificações filtram emissor, pessoa e estado no servidor", async () => {
    await call(listarQualificacoes, {
      organization_id: org,
      pessoa_id: person,
      estado: "enviada",
      busca: "Instituição",
    });
    const q = fixture.queries.find((q) => q.table === "pessoa_qualificacoes")!;
    expect(q.eq).toContainEqual(["pessoa_id", person]);
    expect(q.eq).toContainEqual(["estado", "enviada"]);
    expect(q.order).toEqual(["created_at", "id"]);
  });
  it.each([listarCompetencias, listarQualificacoes])(
    "contagem ou dados ausentes são recuperáveis, não zero",
    async (fn) => {
      fixture.state.missingCount = true;
      await expect(call(fn, { organization_id: org })).rejects.toThrow("contagem");
      fixture.state.missingCount = false;
      fixture.state.missingData = true;
      await expect(call(fn, { organization_id: org })).rejects.toThrow("contagem");
    },
  );
  it.each([obterCompetencia, obterQualificacao])(
    "ausência e PGRST116 negam acesso sem distinguir existência",
    async (fn) => {
      fixture.state.missingRow = true;
      await expect(
        call(fn, {
          organization_id: org,
          id: fn === obterCompetencia ? competence : qualification,
        }),
      ).rejects.toThrow(QUALIFICACAO_ACESSO_INDISPONIVEL);
      fixture.state.missingRow = false;
      fixture.state.readCode = "PGRST116";
      await expect(
        call(fn, {
          organization_id: org,
          id: fn === obterCompetencia ? competence : qualification,
        }),
      ).rejects.toThrow(QUALIFICACAO_ACESSO_INDISPONIVEL);
    },
  );
  it("mudança gerencial durante leitura não retorna dados do escopo anterior", async () => {
    fixture.state.afterRead = (table) => {
      if (table === "pessoa_qualificacoes") fixture.state.gerir = false;
    };
    await expect(call(listarQualificacoes, { organization_id: org })).rejects.toThrow(
      QUALIFICACAO_ACESSO_INDISPONIVEL,
    );
  });
  it("revogação técnica durante detalhe não retorna permissão antiga", async () => {
    fixture.state.afterRead = (table) => {
      if (table === "competencias") fixture.state.revisar = false;
    };
    await expect(call(obterCompetencia, { organization_id: org, id: competence })).rejects.toThrow(
      QUALIFICACAO_ACESSO_INDISPONIVEL,
    );
  });
  it("próprio usuário inativo não ganha permissão de autovalidação", async () => {
    fixture.state.qual.pessoa = { ...fixture.state.qual.pessoa, user_id: user, ativa: false };
    await expect(
      call(obterQualificacao, { organization_id: org, id: qualification }),
    ).resolves.toMatchObject({ permissoes: { validar: false, editar: false } });
  });
  it("a conferência usa a identidade histórica do servidor após desvincular o login", async () => {
    fixture.state.qual.pessoa.user_id = null;
    fixture.state.formerAssociation = true;
    await expect(
      call(obterQualificacao, { organization_id: org, id: qualification }),
    ).resolves.toMatchObject({ permissoes: { validar: false } });
    expect(fixture.db.rpc).toHaveBeenCalledWith("qualificacao_validacao_permitida", {
      _org: org,
      _id: qualification,
    });
  });
  it("falha da projeção atual não reutiliza a permissão local de conferência", async () => {
    fixture.state.projectionError = { code: "42501", message: "restricted" };
    await expect(
      call(obterQualificacao, { organization_id: org, id: qualification }),
    ).rejects.toThrow(QUALIFICACAO_ACESSO_INDISPONIVEL);
  });
  it("Campo busca somente pessoa própria ativa, sem seletor gerencial", async () => {
    fixture.state.gerir = false;
    await expect(
      call(buscarOpcoesQualificacao, { organization_id: org, tipo: "pessoas" }),
    ).resolves.toMatchObject({ rows: [{ id: person }], total: 1 });
    expect(
      fixture.queries
        .filter((q) => q.table === "pessoas")
        .some((q) => q.columns === "id,nome" && q.eq.some(([k, v]) => k === "id" && v === person)),
    ).toBe(true);
  });
  it("seletor revalida acesso após a busca", async () => {
    fixture.state.afterRead = (table) => {
      if (table === "competencias") fixture.state.gerir = false;
    };
    await expect(
      call(buscarOpcoesQualificacao, { organization_id: org, tipo: "competencias" }),
    ).rejects.toThrow(QUALIFICACAO_ACESSO_INDISPONIVEL);
  });
  it("salvar competência relê versão atual em vez do recibo antigo", async () => {
    await expect(
      call(salvarCompetencia, {
        organization_id: org,
        chave: id(10),
        dados: { nome: comp.nome, exige_evidencia: true, exige_validade: false },
      }),
    ).resolves.toMatchObject({ registro: { id: competence, version: 3 } });
  });
  it("salvar qualificação relê estado atual autorizado", async () => {
    fixture.state.afterWrite = () => {
      fixture.state.qual.estado = "validada";
      fixture.state.qual.version = 8;
    };
    await expect(
      call(salvarQualificacao, {
        organization_id: org,
        chave: id(10),
        dados: {
          pessoa_id: person,
          competencia_id: competence,
          emissor: "Instituição",
          conclusao: "2026-10-01",
          validade: null,
        },
      }),
    ).resolves.toMatchObject({
      registro: { estado: "validada", version: 8 },
      permissoes: { editar: false },
    });
  });
  it("transição revalida leitura após receipt, inclusive retry após revogação", async () => {
    fixture.state.afterWrite = () => {
      fixture.state.ler = false;
    };
    await expect(
      call(transicionarQualificacao, {
        organization_id: org,
        chave: id(10),
        id: qualification,
        expected_version: 3,
        estado: "em_conferencia",
      }),
    ).rejects.toThrow(QUALIFICACAO_ACESSO_INDISPONIVEL);
  });
  it("conflito e rede preservam mensagem recuperável, não negação", async () => {
    const input = {
      organization_id: org,
      chave: id(10),
      id: qualification,
      expected_version: 3,
      estado: "em_conferencia",
    };
    fixture.state.rpcError = { code: "40001", message: "stale" };
    await expect(call(transicionarQualificacao, input)).rejects.toThrow(
      "preenchimento foi preservado",
    );
    fixture.state.rpcError = { code: "NETWORK", message: "offline" };
    await expect(call(transicionarQualificacao, input)).rejects.toThrow("Tente novamente");
  });
});
