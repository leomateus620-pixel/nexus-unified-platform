import { describe, expect, it, vi } from "vitest";

const request = vi.hoisted(() => ({ signal: new AbortController().signal }));
vi.mock("@/integrations/supabase/auth-middleware", () => ({ requireSupabaseAuth: {} }));
vi.mock("@tanstack/react-start/server", () => ({ getRequest: () => request }));
vi.mock("@tanstack/react-start", () => ({
  createServerFn: () => {
    let parse: (value: unknown) => unknown;
    const chain = {
      middleware: () => chain,
      inputValidator: (validator: (value: unknown) => unknown) => {
        parse = validator;
        return chain;
      },
      handler:
        (handle: (value: unknown) => unknown) => async (arg: { data: unknown; context: unknown }) =>
          handle({ ...arg, data: parse(arg.data) }),
    };
    return chain;
  },
}));
import { listarArquivosPe } from "../src/features/projetos-engenharia/pe-arquivos.functions";

const id = (n: number) => "00000000-0000-4000-8000-" + String(n).padStart(12, "0");
const input = { organization_id: id(1), versao_id: id(3) };
function fixture() {
  const state = {
    versionExists: true,
    projectExists: true,
    readable: true,
    manageable: true,
    archived: false,
    status: "rascunho",
    empty: false,
    error: null as { message: string; code?: string } | null,
  };
  const file = {
    id: id(4),
    organization_id: id(1),
    projeto_id: id(2),
    versao_id: id(3),
    nome: "Original isolado.pdf",
    mime: "application/pdf",
    tamanho: 123,
    sha256: "a".repeat(64),
    caminho: id(1) + "/pe/" + id(4),
    estado: "vinculado",
    created_by: id(5),
    created_at: "2026-10-22T12:00:00Z",
    confirmado_em: "2026-10-22T12:00:01Z",
  };
  const selects: Array<[string, string]> = [];
  const filters: Array<[string, string, unknown]> = [];
  const signals: AbortSignal[] = [];
  const db = {
    from: vi.fn((table: string) => {
      const response = () => ({
        data:
          table === "pe_versoes"
            ? state.versionExists
              ? { id: id(3), projeto_id: id(2), estado: state.status }
              : null
            : table === "pe_projetos"
              ? state.projectExists
                ? { id: id(2), arquivado: state.archived }
                : null
              : state.empty
                ? []
                : [{ ...file }],
        error: state.error,
      });
      const chain = {
        select: (fields: string) => {
          selects.push([table, fields]);
          return chain;
        },
        eq: (key: string, value: unknown) => {
          filters.push([table, key, value]);
          return chain;
        },
        neq: () => chain,
        order: () => chain,
        limit: () => chain,
        abortSignal: (signal: AbortSignal) => {
          signals.push(signal);
          return chain;
        },
        maybeSingle: async () => response(),
        then: (resolve: (value: unknown) => unknown) => Promise.resolve(response()).then(resolve),
      };
      return chain;
    }),
    rpc: vi.fn((name: string) => ({
      abortSignal: (signal: AbortSignal) => {
        signals.push(signal);
        return Promise.resolve({
          data: name === "pe_ler_projeto" ? state.readable : state.manageable,
          error: null,
        });
      },
    })),
  };
  const call = () =>
    listarArquivosPe({
      data: input,
      context: { supabase: db, userId: id(5) },
    } as never);
  return { state, file, db, call, selects, filters, signals };
}

describe("Arquivos PE: autorização atual e projeção mínima do pai", () => {
  it("não trata a recusa silenciosa de versão como lista vazia autorizada", async () => {
    const f = fixture();
    f.state.versionExists = false;
    await expect(f.call()).rejects.toThrow("Arquivo indisponível para seu acesso atual.");
    expect(f.db.from.mock.calls.map(([table]) => table)).toEqual(["pe_versoes"]);
  });

  it("nega pai removido antes de consultar os originais", async () => {
    const f = fixture();
    f.state.projectExists = false;
    await expect(f.call()).rejects.toThrow("Arquivo indisponível para seu acesso atual.");
    expect(f.db.from.mock.calls.map(([table]) => table)).toEqual(["pe_versoes", "pe_projetos"]);
  });

  it("revalida leitura do pai mesmo quando RLS devolve zero arquivos", async () => {
    const f = fixture();
    f.state.empty = true;
    f.state.readable = false;
    await expect(f.call()).rejects.toThrow("Arquivo indisponível para seu acesso atual.");
    expect(f.db.rpc).toHaveBeenCalledWith("pe_ler_projeto", {
      _org: id(1),
      _id: id(2),
    });
  });

  it.each(["congelada", "substituida"])(
    "preserva leitura histórica de versão %s sem permitir envio",
    async (status) => {
      const f = fixture();
      f.state.status = status;
      const response = await f.call();
      expect(response.rows[0]?.nome).toBe(f.file.nome);
      expect(response.permissoes).toEqual({ ler: true, adicionar: false });
    },
  );

  it("arquivamento mantém originais legíveis e impede novo envio", async () => {
    const f = fixture();
    f.state.archived = true;
    const response = await f.call();
    expect(response.rows).toHaveLength(1);
    expect(response.permissoes).toEqual({ ler: true, adicionar: false });
  });

  it("permissão de leitura não implica capacidade de envio", async () => {
    const f = fixture();
    f.state.manageable = false;
    expect((await f.call()).permissoes).toEqual({ ler: true, adicionar: false });
  });

  it("rascunho editável usa somente contexto mínimo e propaga cancelamento HTTP às consultas", async () => {
    const f = fixture();
    const response = await f.call();
    expect(response.permissoes).toEqual({ ler: true, adicionar: true });
    expect(response.rows[0]).toMatchObject({ id: f.file.id, meu_envio: true });
    expect(f.selects.slice(0, 2)).toEqual([
      ["pe_versoes", "id,projeto_id,estado"],
      ["pe_projetos", "id,arquivado"],
    ]);
    expect(f.filters).toContainEqual(["pe_versoes", "organization_id", id(1)]);
    expect(f.filters).toContainEqual(["pe_versoes", "id", id(3)]);
    expect(f.filters).toContainEqual(["pe_arquivos", "versao_id", id(3)]);
    expect(f.signals).toHaveLength(5);
    expect(f.signals.every((signal) => signal === request.signal)).toBe(true);
  });

  it("falha de consulta continua erro recuperável, sem simular ausência de arquivos", async () => {
    const f = fixture();
    f.state.error = { message: "Falha de transporte do ambiente isolado" };
    await expect(f.call()).rejects.toThrow("Falha de transporte");
  });
});
