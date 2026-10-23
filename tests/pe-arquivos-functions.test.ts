import { describe, expect, it, vi } from "vitest";

const request = vi.hoisted(() => ({ signal: new AbortController().signal }));
vi.mock("@/integrations/supabase/auth-middleware", () => ({ requireSupabaseAuth: {} }));
const responseHeader = vi.hoisted(() => vi.fn());
vi.mock("@tanstack/react-start/server", () => ({
  getRequest: () => request,
  setResponseHeader: responseHeader,
}));
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
import {
  baixarArquivoPe,
  listarArquivosPe,
  obterArquivoPe,
} from "../src/features/projetos-engenharia/pe-arquivos.functions";

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

function directFileFixture() {
  const file = {
    id: id(14),
    organization_id: id(11),
    projeto_id: id(12),
    versao_id: id(13),
    nome: "Original histórico autorizado.pdf",
    mime: "application/pdf",
    tamanho: 321,
    sha256: "b".repeat(64),
    caminho: id(11) + "/pe/" + id(14),
    estado: "vinculado",
    created_by: id(15),
    created_at: "2026-10-22T10:00:00Z",
    confirmado_em: "2026-10-22T10:00:01Z",
  };
  const state = {
    missing: false,
    readable: true as boolean | null,
    queryError: null as { message: string; code?: string } | null,
    parentError: null as { message: string; code?: string } | null,
    afterMetadata: null as (() => void) | null,
  };
  const filters: Array<[string, unknown]> = [],
    signals: AbortSignal[] = [],
    trace: string[] = [],
    columns: string[] = [];
  let querySignal: AbortSignal | undefined;
  const response = async () => {
    if (querySignal?.aborted) throw new DOMException("Consulta cancelada", "AbortError");
    trace.push("metadata");
    state.afterMetadata?.();
    return { data: state.missing ? null : { ...file }, error: state.queryError };
  };
  const signed = vi.fn().mockResolvedValue({
    data: { signedUrl: "https://storage.test.invalid/original" },
    error: null,
  });
  const storage = { from: vi.fn(() => ({ createSignedUrl: signed })) };
  const db = {
    from: vi.fn((table: string) => {
      expect(table).toBe("pe_arquivos");
      const chain = {
        select: (projection: string) => {
          columns.push(projection);
          return chain;
        },
        eq: (name: string, value: unknown) => {
          filters.push([name, value]);
          return chain;
        },
        abortSignal: (signal: AbortSignal) => {
          querySignal = signal;
          signals.push(signal);
          return chain;
        },
        maybeSingle: response,
        single: response,
      };
      return chain;
    }),
    rpc: vi.fn((name: string) => {
      expect(name).toBe("pe_ler_projeto");
      return {
        abortSignal: async (signal: AbortSignal) => {
          signals.push(signal);
          if (signal.aborted) throw new DOMException("Consulta cancelada", "AbortError");
          trace.push("parent");
          return { data: state.readable, error: state.parentError };
        },
      };
    }),
    storage,
  };
  const data = { organization_id: file.organization_id, id: file.id };
  const call = (extra: Record<string, unknown> = {}) =>
    obterArquivoPe({
      data: { ...data, ...extra },
      context: { supabase: db, userId: id(15) },
    } as never);
  return { file, state, db, filters, signals, trace, columns, signed, call, data };
}

describe("Arquivo PE por ID: metadados atuais sem assinatura ou leitura de bytes", () => {
  it("consulta ID e organização exatos e revalida o projeto depois da leitura", async () => {
    const f = directFileFixture();
    const value = await f.call();
    expect(value).toEqual(f.file);
    expect(responseHeader).toHaveBeenCalledWith("Cache-Control", "private, no-store");
    expect(f.filters).toEqual([
      ["organization_id", id(11)],
      ["id", id(14)],
    ]);
    expect(f.columns).toHaveLength(1);
    expect(f.columns[0]).not.toBe("*");
    expect(f.trace).toEqual(["metadata", "parent"]);
    expect(f.db.rpc).toHaveBeenCalledWith("pe_ler_projeto", { _org: id(11), _id: id(12) });
    expect(f.db.storage.from).not.toHaveBeenCalled();
  });
  it("retorna hash e versão do registro, sem aceitar caminho ou projeto arbitrário", async () => {
    const f = directFileFixture();
    const value = await f.call({
      caminho: "outro/arquivo",
      projeto_id: id(999),
      sha256: "c".repeat(64),
      url: "https://example.invalid",
    });
    expect(value.sha256).toBe(f.file.sha256);
    expect(value.versao_id).toBe(id(13));
    expect(f.db.rpc).toHaveBeenCalledWith("pe_ler_projeto", { _org: id(11), _id: id(12) });
    expect(value).not.toHaveProperty("url");
    expect(f.db.storage.from).not.toHaveBeenCalled();
  });
  it.each(["42501", "PGRST116"])(
    "normaliza %s na consulta sem revelar detalhe interno",
    async (code) => {
      const f = directFileFixture();
      f.state.queryError = { code, message: "PRIVATE DATABASE DETAIL" };
      await expect(f.call()).rejects.toThrow(/^Arquivo indisponível para seu acesso atual\.$/);
      expect(f.db.rpc).not.toHaveBeenCalled();
    },
  );
  it("registro ausente/RLS silencioso é negação, não metadado vazio", async () => {
    const f = directFileFixture();
    f.state.missing = true;
    await expect(f.call()).rejects.toThrow("Arquivo indisponível para seu acesso atual.");
    expect(f.db.rpc).not.toHaveBeenCalled();
  });
  it.each(["pendente", "enviado", "cancelado"])(
    "não expõe original %s como disponível",
    async (state) => {
      const f = directFileFixture();
      f.file.estado = state;
      await expect(f.call()).rejects.toThrow("Arquivo indisponível para seu acesso atual.");
      expect(f.db.rpc).not.toHaveBeenCalled();
      expect(f.db.storage.from).not.toHaveBeenCalled();
    },
  );
  it.each([false, null])(
    "nega autorização atual de pai %s sem devolver metadados",
    async (readable) => {
      const f = directFileFixture();
      f.state.readable = readable;
      await expect(f.call()).rejects.toThrow("Arquivo indisponível para seu acesso atual.");
      expect(f.trace).toEqual(["metadata", "parent"]);
    },
  );
  it("nega revogação ocorrida após a consulta dos metadados", async () => {
    const f = directFileFixture();
    f.state.afterMetadata = () => {
      f.state.readable = false;
    };
    await expect(f.call()).rejects.toThrow("Arquivo indisponível para seu acesso atual.");
  });
  it.each(["42501", "PGRST116"])("normaliza %s também na consulta do pai", async (code) => {
    const f = directFileFixture();
    f.state.parentError = { code, message: "PRIVATE PARENT DETAIL" };
    await expect(f.call()).rejects.toThrow(/^Arquivo indisponível para seu acesso atual\.$/);
  });
  it("não mistura ID/tenant mesmo diante de uma resposta incompatível do transporte", async () => {
    const f = directFileFixture();
    await expect(f.call({ organization_id: id(888) })).rejects.toThrow(
      "Arquivo indisponível para seu acesso atual.",
    );
    await expect(f.call({ id: id(889) })).rejects.toThrow(
      "Arquivo indisponível para seu acesso atual.",
    );
    expect(f.db.rpc).not.toHaveBeenCalled();
  });
  it("erro de rede permanece recuperável e distinto de acesso negado", async () => {
    const f = directFileFixture();
    f.state.missing = true;
    f.state.queryError = { message: "Falha de rede isolada" };
    await expect(f.call()).rejects.toThrow(/^Falha de rede isolada$/);
    f.state.missing = false;
    f.state.queryError = null;
    f.state.parentError = { message: "Falha de rede no pai" };
    await expect(f.call()).rejects.toThrow(/^Falha de rede no pai$/);
  });
  it("propaga o signal HTTP para metadado e autorização do pai", async () => {
    const f = directFileFixture();
    await f.call();
    expect(f.signals).toHaveLength(2);
    expect(f.signals.every((signal) => signal === request.signal)).toBe(true);
  });
  it("cancelamento durante a leitura alcança a consulta seguinte e não vira negação", async () => {
    const prior = request.signal,
      controller = new AbortController();
    request.signal = controller.signal;
    try {
      const f = directFileFixture();
      f.state.afterMetadata = () => controller.abort();
      await expect(f.call()).rejects.toMatchObject({ name: "AbortError" });
      expect(f.db.storage.from).not.toHaveBeenCalled();
    } finally {
      request.signal = prior;
    }
  });
  it("payload inválido é recusado antes de consultar tabelas", async () => {
    const f = directFileFixture();
    await expect(f.call({ id: "id-inválido" })).rejects.toThrow();
    expect(f.db.from).not.toHaveBeenCalled();
  });
  it("download existente conserva URL temporária, 60 segundos e nome original", async () => {
    const f = directFileFixture();
    const response = await baixarArquivoPe({
      data: f.data,
      context: { supabase: f.db, userId: id(15) },
    } as never);
    expect(response).toEqual({ url: "https://storage.test.invalid/original" });
    expect(f.db.storage.from).toHaveBeenCalledWith("nexus-operacional");
    expect(f.signed).toHaveBeenCalledWith(f.file.caminho, 60, { download: f.file.nome });
    expect(f.db.rpc).not.toHaveBeenCalled();
  });
});
