import { describe, expect, it, vi } from "vitest";
vi.mock("@/integrations/supabase/auth-middleware", () => ({ requireSupabaseAuth: {} }));
vi.mock("@tanstack/react-start/server", () => ({
  getRequest: () => ({ signal: new AbortController().signal }),
}));
vi.mock("@tanstack/react-start", () => ({
  createServerFn: () => {
    let schema: { parse: (input: unknown) => unknown };
    const chain = {
      middleware: () => chain,
      inputValidator: (value: typeof schema) => {
        schema = value;
        return chain;
      },
      handler:
        (fn: (value: unknown) => unknown) => async (input: { data: unknown; context: unknown }) =>
          fn({ ...input, data: schema.parse(input.data) }),
    };
    return chain;
  },
}));
import { nrArquivoImagem } from "../src/features/nr/files.functions";
const id = (n: number) => `c7330000-0000-4000-8000-${String(n).padStart(12, "0")}`;
function setup({
  permission = true,
  revoked = false,
  state = "disponivel",
  processor = "nexus-pillow-v1",
} = {}) {
  const file = {
    id: id(4),
    organization_id: id(1),
    cliente_id: id(2),
    unidade_id: id(3),
    normas: ["NR33"],
    pasta_id: null,
    documento_id: null,
    revisao_id: null,
    local_id: null,
    nome: "Campo.jpg",
    mime: "image/jpeg",
    extensao: "jpg",
    tamanho: 12000,
    sha256: "a".repeat(64),
    caminho: "org/acervo/original.jpg",
    estado: "vinculado",
    papel: "foto",
    bytes_verificados: true,
    created_by: id(5),
    created_at: "2026-10-31T00:00:00Z",
    confirmado_em: "2026-10-31T00:00:00Z",
    erro: null,
    version: 1,
    origem_metadata: {} as Record<string, unknown>,
  };
  const query = {
    select: vi.fn(),
    eq: vi.fn(),
    single: vi.fn(async () => ({ data: file, error: null })),
  };
  query.select.mockReturnValue(query);
  query.eq.mockReturnValue(query);
  let reads = 0;
  const rpc = vi.fn(async (name: string) => ({
    data:
      name === "nr_arquivo_ler"
        ? permission && (!revoked || ++reads === 1)
        : {
            estado: state,
            caminho: "org/representacoes/confirmed.webp",
            sha256: "b".repeat(64),
            largura: 288,
            altura: 384,
            processador: processor,
          },
    error: null,
  }));
  const sign = vi.fn(async () => ({
    data: { signedUrl: "https://private.invalid/temporary" },
    error: null,
  }));
  return {
    context: {
      supabase: { from: () => query, rpc, storage: { from: () => ({ createSignedUrl: sign }) } },
    },
    sign,
    rpc,
    file,
  };
}
const invoke = nrArquivoImagem as unknown as (input: unknown) => Promise<Record<string, unknown>>;
describe("representações privadas de imagem NR", () => {
  it("resolve a miniatura comprovada no servidor e nunca assina o original para formar a grade", async () => {
    const test = setup();
    const result = await invoke({
      context: test.context,
      data: { organization_id: id(1), id: id(4), variante: "miniatura_384" },
    });
    expect(test.sign).toHaveBeenCalledWith("org/representacoes/confirmed.webp", 60);
    expect(result).toMatchObject({
      estado: "disponivel",
      original_disponivel: true,
      largura: 288,
      altura: 384,
      versao: `nexus-pillow-v1:${"b".repeat(64)}`,
    });
  });
  it("distingue a versão do processador mesmo quando o hash do derivado é igual", async () => {
    const test = setup({ processor: "nexus-storage-transform-v1" });
    const result = await invoke({
      context: test.context,
      data: { organization_id: id(1), id: id(4), variante: "miniatura_384" },
    });
    expect(result.versao).toBe(`nexus-storage-transform-v1:${"b".repeat(64)}`);
    expect(test.sign).toHaveBeenCalledWith("org/representacoes/confirmed.webp", 60);
  });
  it("mantém original disponível sem baixar bytes quando miniatura está pendente", async () => {
    const test = setup({ state: "processando" });
    const result = await invoke({
      context: test.context,
      data: { organization_id: id(1), id: id(4) },
    });
    expect(test.sign).not.toHaveBeenCalled();
    expect(result).toMatchObject({ estado: "processando", original_disponivel: true, url: null });
  });
  it("rejeita caminhos arbitrários e variantes desconhecidas", async () => {
    const test = setup();
    await expect(
      invoke({
        context: test.context,
        data: { organization_id: id(1), id: id(4), caminho: "outro-cliente.jpg" },
      }),
    ).rejects.toThrow();
    await expect(
      invoke({
        context: test.context,
        data: { organization_id: id(1), id: id(4), variante: "qualquer" },
      }),
    ).rejects.toThrow();
    expect(test.sign).not.toHaveBeenCalled();
  });
  it("nega acesso antes de assinar e verifica revogação depois de assinar", async () => {
    const denied = setup({ permission: false });
    await expect(
      invoke({ context: denied.context, data: { organization_id: id(1), id: id(4) } }),
    ).rejects.toThrow(/autorizado/);
    expect(denied.sign).not.toHaveBeenCalled();
    const revoked = setup({ revoked: true });
    await expect(
      invoke({ context: revoked.context, data: { organization_id: id(1), id: id(4) } }),
    ).rejects.toThrow(/revogado/);
  });
  it("não declara original de campo recuperado quando o ativo é apenas miniatura da origem", async () => {
    const test = setup();
    test.file.origem_metadata = { tipo: "miniatura_origem" };
    const result = await invoke({
      context: test.context,
      data: { organization_id: id(1), id: id(4), variante: "original" },
    });
    expect(result).toMatchObject({ estado: "disponivel", original_disponivel: false });
  });
  it("ampliação solicita original explicitamente e conserva sua identidade", async () => {
    const test = setup();
    const result = await invoke({
      context: test.context,
      data: { organization_id: id(1), id: id(4), variante: "original" },
    });
    expect(test.sign).toHaveBeenCalledWith(test.file.caminho, 60);
    expect(result.versao).toBe(test.file.sha256);
    expect(test.rpc.mock.calls.every(([name]) => name === "nr_arquivo_ler")).toBe(true);
  });
});
