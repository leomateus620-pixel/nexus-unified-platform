import { beforeEach, describe, expect, it, vi } from "vitest";
import { gerarDocxNr, type NrDocumentSnapshot } from "../src/features/nr/documents";
import { sha256Nr } from "../src/features/nr/files";
vi.mock("@/integrations/supabase/auth-middleware", () => ({ requireSupabaseAuth: {} }));
vi.mock("@tanstack/react-start", () => ({
  createServerFn: () => {
    const chain = {
      middleware: () => chain,
      inputValidator: () => chain,
      handler: (fn: unknown) => fn,
    };
    return chain;
  },
}));
import { converterDocumentoNr, exportarDocumentoNr } from "../src/features/nr/documents.server";
const id = (n: number) => `d7330000-0000-4000-8000-${String(n).padStart(12, "0")}`;
const input = {
  organization_id: id(1),
  norma: "NR33" as const,
  documento_id: id(2),
  expected_version: 7,
};
const source = {
  id: id(2),
  organization_id: id(1),
  cliente_id: id(3),
  unidade_id: id(4),
  normas: ["NR33"],
  titulo: "Documento do cenário isolado",
  descricao: "",
  tipo: "documento",
  estado: "emitido_origem",
  dados: {},
  version: 7,
  created_at: "2026-10-30T00:00:00Z",
  updated_at: "2026-10-30T00:00:00Z",
  arquivado_em: null,
  revisao_atual_id: id(5),
  revisao_numero: 3,
  conteudo: {
    schema_version: 1,
    blocos: [{ id: "p1", tipo: "paragrafo", texto: "Texto de origem preservado" }],
  },
};
async function setup(
  mode: "ok" | "denied" | "edited" | "cross" | "revoked" | "secondary" | "secondary_cross" = "ok",
) {
  const docx = await gerarDocxNr({
      id: source.id,
      titulo: source.titulo,
      normas: source.normas,
      estado: source.estado,
      version: 7,
      revisao_numero: 3,
      revisao_id: id(5),
      updated_at: source.updated_at,
      conteudo: source.conteudo,
    } as NrDocumentSnapshot),
    hash = await sha256Nr(docx.bytes);
  const original = {
    id: id(6),
    organization_id: id(1),
    cliente_id: id(3),
    unidade_id: id(4),
    normas: ["NR33"],
    nome: "original.docx",
    mime: "application/vnd.openxmlformats-officedocument.wordprocessingml.document",
    extensao: "docx",
    tamanho: docx.bytes.length,
    sha256: hash,
    caminho: `${id(1)}/acervo/${id(6)}.docx`,
    estado: "vinculado",
    papel: "original",
    pasta_id: null,
    documento_id: mode.startsWith("secondary") ? null : mode === "cross" ? id(99) : source.id,
    revisao_id: mode.startsWith("secondary") ? null : id(5),
    local_id: null,
    bytes_verificados: true,
    created_by: id(7),
    created_at: source.created_at,
    confirmado_em: source.created_at,
    erro: null,
    version: 2,
  };
  const download = vi.fn(async () => ({ data: new Blob([docx.bytes]), error: null }));
  let reads = 0;
  const rpc = vi.fn(async (name: string, args: Record<string, unknown>) => {
    if (name === "nr_consultar") {
      reads++;
      return mode === "revoked" && reads > 1
        ? { data: null, error: { code: "42501", message: "revoked" } }
        : { data: structuredClone(source), error: null };
    }
    if (name === "pode") return { data: mode !== "denied", error: null };
    if (name === "nr_executar") {
      if (args["p_id"] === null)
        return {
          data: {
            ...structuredClone(source),
            id: id(8),
            estado: "rascunho",
            version: mode === "edited" ? 4 : 2,
            revisao_atual_id: id(9),
            revisao_numero: 1,
            conteudo: { schema_version: 1, blocos: [] },
          },
          error: null,
        };
      if (mode === "edited")
        return { data: null, error: { code: "40001", message: "user edited" } };
      const data = args["p_dados"] as Record<string, unknown>;
      return {
        data: {
          ...structuredClone(source),
          id: id(8),
          estado: "rascunho",
          version: 3,
          revisao_atual_id: id(9),
          revisao_numero: 1,
          conteudo: data["conteudo"],
          dados: data["dados"],
        },
        error: null,
      };
    }
    throw new Error(`Unexpected RPC ${name}`);
  });
  const query = {
    select: vi.fn(),
    eq: vi.fn(),
    single: vi.fn(async () => ({ data: original, error: null })),
  };
  query.select.mockReturnValue(query);
  query.eq.mockReturnValue(query);
  const links = {
    select: vi.fn(),
    eq: vi.fn(),
    limit: vi.fn(async () => ({
      data: mode.startsWith("secondary")
        ? [
            {
              documento_id: source.id,
              revisao_id: id(5),
              cliente_id: mode === "secondary_cross" ? id(99) : source.cliente_id,
              unidade_id: source.unidade_id,
            },
          ]
        : [],
      error: null,
    })),
  };
  links.select.mockReturnValue(links);
  links.eq.mockReturnValue(links);
  return {
    client: {
      rpc,
      from: (table: string) => (table === "nr_arquivo_vinculos" ? links : query),
      storage: { from: () => ({ download }) },
    },
    rpc,
    download,
    docx,
    hash,
  };
}
beforeEach(() => vi.clearAllMocks());
describe("NR documentos: derivado rastreável e concorrência", () => {
  it("converte original importado com vínculo secundário exato e preserva sua revisão", async () => {
    const t = await setup("secondary");
    const result = await converterDocumentoNr(t.client, id(7), {
      ...input,
      arquivo_id: id(6),
      chave: id(10),
    });
    expect(result.registro.dados["conversao"]).toMatchObject({
      original_arquivo_id: id(6),
      documento_origem_id: source.id,
      revisao_origem_id: id(5),
    });
    const cross = await setup("secondary_cross");
    await expect(
      converterDocumentoNr(cross.client, id(7), { ...input, arquivo_id: id(6), chave: id(10) }),
    ).rejects.toThrow("deste documento");
    expect(cross.download).not.toHaveBeenCalled();
  });
  it("cria edição derivada sem escrever no documento de origem nem nos seus bytes", async () => {
    const t = await setup(),
      before = JSON.stringify(source);
    const result = await converterDocumentoNr(t.client, id(7), {
      ...input,
      arquivo_id: id(6),
      chave: id(10),
    });
    expect(result.registro.id).toBe(id(8));
    expect(result.tipo).toBe("edicao_derivada");
    expect(JSON.stringify(source)).toBe(before);
    expect(await sha256Nr(t.docx.bytes)).toBe(t.hash);
    const writes = t.rpc.mock.calls.filter(([name]) => name === "nr_executar");
    expect(writes).toHaveLength(2);
    expect(writes.every(([, args]) => args["p_id"] !== source.id)).toBe(true);
    expect(writes[1]?.[1]).toMatchObject({
      p_id: id(8),
      p_expected_version: 2,
      p_chave: `docx:save:${id(10)}`,
    });
    expect(result.registro.dados["conversao"]).toMatchObject({
      original_sha256: t.hash,
      documento_origem_id: source.id,
      revisao_origem_id: id(5),
    });
  });
  it("conflito em derivado parcialmente criado não sobrescreve uma edição posterior", async () => {
    const t = await setup("edited");
    await expect(
      converterDocumentoNr(t.client, id(7), { ...input, arquivo_id: id(6), chave: id(10) }),
    ).rejects.toThrow("Outra pessoa alterou");
    const save = t.rpc.mock.calls.find(
      ([name, args]) => name === "nr_executar" && args["p_id"] === id(8),
    );
    expect(save?.[1]["p_expected_version"]).toBe(2);
  });
  it("nega edição sem permissão e não associa original de outro documento", async () => {
    const denied = await setup("denied");
    await expect(
      converterDocumentoNr(denied.client, id(7), { ...input, arquivo_id: id(6), chave: id(10) }),
    ).rejects.toThrow("não permite");
    expect(denied.download).not.toHaveBeenCalled();
    const cross = await setup("cross");
    await expect(
      converterDocumentoNr(cross.client, id(7), { ...input, arquivo_id: id(6), chave: id(10) }),
    ).rejects.toThrow("deste documento");
    expect(cross.download).not.toHaveBeenCalled();
  });
  it("recusa versão desatualizada e não devolve bytes gerados após revogação", async () => {
    const t = await setup();
    await expect(
      exportarDocumentoNr(t.client, { ...input, expected_version: 6, formato: "docx" }),
    ).rejects.toThrow("mudou");
    const revoked = await setup("revoked");
    await expect(
      exportarDocumentoNr(revoked.client, { ...input, formato: "docx" }),
    ).rejects.toThrow("sem permissão");
  });
});
