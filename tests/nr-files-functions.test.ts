import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { NR_ARQUIVO_MIMES, sha256Nr } from "../src/features/nr/files";
const mock = vi.hoisted(() => ({
  admin: { rpc: vi.fn(), storage: { from: vi.fn() } },
  signal: new AbortController().signal,
}));
vi.mock("@/integrations/supabase/client.server", () => ({ supabaseAdmin: mock.admin }));
vi.mock("@/integrations/supabase/auth-middleware", () => ({ requireSupabaseAuth: {} }));
vi.mock("@tanstack/react-start/server", () => ({ getRequest: () => ({ signal: mock.signal }) }));
vi.mock("@tanstack/react-start", () => ({
  createServerFn: () => {
    let parse: (input: unknown) => unknown;
    const chain = {
      middleware: () => chain,
      inputValidator: (schema: { parse: (input: unknown) => unknown }) => {
        parse = (value) => schema.parse(value);
        return chain;
      },
      handler:
        (fn: (input: unknown) => unknown) => async (input: { data: unknown; context: unknown }) =>
          fn({ data: parse(input.data), context: input.context }),
    };
    return chain;
  },
}));
import {
  nrArquivoBaixar,
  nrArquivoConfirmar,
  nrDocumentoImagensVinculadas,
} from "../src/features/nr/files.functions";
const id = (n: number) => `c7330000-0000-4000-8000-${String(n).padStart(12, "0")}`;
const bytes = new TextEncoder().encode("%PDF-1.7\n1 0 obj <</Type/Catalog>> endobj\n%%EOF");
async function setup(mode: "ok" | "denied" | "revoked" | "invalid" = "ok") {
  const hash = await sha256Nr(bytes);
  let linked = false,
    readCount = 0;
  const a = {
    id: id(4),
    organization_id: id(1),
    cliente_id: id(2),
    unidade_id: id(3),
    normas: ["NR33"],
    nome: "Original.pdf",
    mime: NR_ARQUIVO_MIMES.pdf,
    tamanho: bytes.length,
    sha256: hash,
    extensao: "pdf",
    caminho: `${id(1)}/acervo/${id(4)}.pdf`,
    estado: "preparado",
    papel: "original",
    pasta_id: null,
    documento_id: null,
    revisao_id: null,
    local_id: null,
    bytes_verificados: false,
    created_by: id(5),
    created_at: "2026-10-30T00:00:00Z",
    confirmado_em: null,
    erro: null,
    version: 1,
  };
  const query = {
    select: vi.fn(),
    eq: vi.fn(),
    single: vi.fn(async () => ({
      data: linked ? { ...a, estado: "vinculado", bytes_verificados: true } : a,
      error: null,
    })),
  };
  query.select.mockReturnValue(query);
  query.eq.mockReturnValue(query);
  const rpc = vi.fn((name: string) =>
    Promise.resolve({
      data:
        name === "nr_arquivo_limites"
          ? {
              bucket: "nexus-nr-acervo",
              max_bytes: 52428800,
              mime_types: Object.values(NR_ARQUIVO_MIMES),
              extensoes: Object.keys(NR_ARQUIVO_MIMES),
            }
          : mode === "denied"
            ? false
            : mode === "revoked"
              ? ++readCount === 1
              : true,
      error: null,
    }),
  );
  const download = vi.fn(async () => ({
    data: new Blob([mode === "invalid" ? new TextEncoder().encode("<html>login</html>") : bytes]),
    error: null,
  }));
  mock.admin.storage.from.mockReturnValue({ download });
  mock.admin.rpc.mockImplementation(async () => {
    linked = true;
    return { data: { ...a, estado: "vinculado", bytes_verificados: true }, error: null };
  });
  const storage = {
    createSignedUrl: vi.fn(async () => ({
      data: { signedUrl: "https://private.invalid/signed" },
      error: null,
    })),
  };
  const client = { from: vi.fn(() => query), rpc, storage: { from: vi.fn(() => storage) } };
  return { client, rpc, download, a, storage };
}
const call = (fn: unknown, client: unknown) =>
  (fn as (input: unknown) => Promise<unknown>)({
    data: { organization_id: id(1), id: id(4) },
    context: { supabase: client, userId: id(5) },
  });
describe("document image identity adapter", () => {
  const input = (arquivo_ids: string[]) => ({
    organization_id: id(1),
    norma: "NR35",
    documento_id: id(6),
    revisao_id: id(7),
    arquivo_ids,
  });
  const invoke = (data: unknown, client: unknown) =>
    (nrDocumentoImagensVinculadas as unknown as (input: unknown) => Promise<{ rows: unknown[] }>)({
      data,
      context: { supabase: client, userId: id(5) },
    });
  it("uses the canonical authorized RPC with bounded IDs before paging and preserves relationship scopes", async () => {
    const { a } = await setup();
    const row = {
      ...a,
      mime: "image/jpeg",
      estado: "vinculado",
      bytes_verificados: true,
      contextos: [
        {
          organization_id: id(1),
          cliente_id: id(2),
          unidade_id: id(3),
          documento_id: id(6),
          revisao_id: id(7),
          local_id: id(8),
        },
      ],
    };
    const abortSignal = vi.fn(async () => ({
      data: { rows: [row, { ...row, id: id(9) }], total: 2, pagina: 0, limite: 100 },
      error: null,
    }));
    const rpc = vi.fn(() => ({ abortSignal })),
      client = { rpc, from: vi.fn() };
    const result = await invoke(input([id(4), id(4)]), client);
    expect(rpc).toHaveBeenCalledWith("nr_arquivo_listar", {
      p_org: id(1),
      p_norma: "NR35",
      p_filtros: {
        documento_id: id(6),
        revisao_id: id(7),
        arquivo_ids: [id(4)],
        pagina: 0,
        limite: 100,
      },
    });
    expect(abortSignal).toHaveBeenCalledWith(mock.signal);
    expect(client.from).not.toHaveBeenCalled();
    expect(result.rows).toHaveLength(1);
    expect((result.rows[0] as typeof row).contextos).toEqual(row.contextos);
  });
  it("rejects more than one hundred IDs and makes no reads for an empty manifest", async () => {
    const client = { rpc: vi.fn(), from: vi.fn() };
    await expect(invoke(input(Array.from({ length: 101 }, () => id(4))), client)).rejects.toThrow();
    expect(await invoke(input([]), client)).toEqual({ rows: [] });
    expect(client.rpc).not.toHaveBeenCalled();
    expect(client.from).not.toHaveBeenCalled();
  });
  it("propagates canonical authorization failures without a privileged fallback", async () => {
    const client = {
      rpc: vi.fn(() => ({
        abortSignal: async () => ({
          data: null,
          error: { code: "42501", message: "Acesso negado." },
        }),
      })),
      from: vi.fn(),
    };
    await expect(invoke(input([id(4)]), client)).rejects.toThrow(
      "Registro indisponível ou sem permissão",
    );
    expect(client.from).not.toHaveBeenCalled();
  });
});
beforeEach(() => {
  vi.clearAllMocks();
  vi.stubEnv("SUPABASE_SERVICE_ROLE_KEY", "isolated-test-sentinel");
  vi.stubEnv("SUPABASE_URL", "https://test.invalid");
});
afterEach(() => vi.unstubAllEnvs());
describe("NR arquivos: confirmação dos bytes e acesso atual", () => {
  it("nega antes de usar serviço se a sessão não puder enviar", async () => {
    const t = await setup("denied");
    await expect(call(nrArquivoConfirmar, t.client)).rejects.toThrow("não permite");
    expect(t.download).not.toHaveBeenCalled();
    expect(mock.admin.rpc).not.toHaveBeenCalled();
  });
  it("revalida o acesso após ler bytes e não confirma em caso de revogação", async () => {
    const t = await setup("revoked");
    await expect(call(nrArquivoConfirmar, t.client)).rejects.toThrow("mudou durante");
    expect(t.download).toHaveBeenCalledOnce();
    expect(mock.admin.rpc).not.toHaveBeenCalled();
  });
  it("não vincula HTML/tamanho/hash divergente e registra falha recuperável", async () => {
    const t = await setup("invalid");
    await expect(call(nrArquivoConfirmar, t.client)).rejects.toThrow("tamanho");
    expect(mock.admin.rpc).toHaveBeenCalledWith(
      "nr_arquivo_falhar",
      expect.objectContaining({ p_autor: id(5), p_id: id(4) }),
    );
    expect(mock.admin.rpc).not.toHaveBeenCalledWith("nr_arquivo_confirmar", expect.anything());
  });
  it("somente confirma os bytes após ler/verificar e envia a autoria derivada da sessão", async () => {
    const t = await setup();
    const r = await call(nrArquivoConfirmar, t.client);
    expect(r).toMatchObject({ estado: "vinculado", bytes_verificados: true });
    expect(mock.admin.rpc).toHaveBeenCalledWith("nr_arquivo_confirmar", {
      p_org: id(1),
      p_id: id(4),
      p_autor: id(5),
      p_sha256: t.a.sha256,
      p_tamanho: bytes.length,
      p_mime: NR_ARQUIVO_MIMES.pdf,
    });
  });
  it("download revalida autorização depois de assinar e não retorna a URL se revogada", async () => {
    const t = await setup("revoked");
    await expect(call(nrArquivoBaixar, t.client)).rejects.toThrow("revogado");
    expect(t.storage.createSignedUrl).toHaveBeenCalledWith(t.a.caminho, 60, { download: t.a.nome });
  });
});
