import { afterEach, beforeEach, describe, it, expect, vi } from "vitest";
const service = vi.hoisted(() => ({ download: vi.fn(), rpc: vi.fn() }));
vi.mock("@/integrations/supabase/auth-middleware", () => ({ requireSupabaseAuth: {} }));
vi.mock("@/integrations/supabase/client.server", () => ({
  supabaseAdmin: { rpc: service.rpc, storage: { from: () => ({ download: service.download }) } },
}));
vi.mock("@tanstack/react-start", () => ({
  createServerFn: () => {
    let parse: (v: unknown) => unknown;
    const chain = {
      middleware: () => chain,
      inputValidator: (schema: { parse: (v: unknown) => unknown }) => {
        parse = (v) => schema.parse(v);
        return chain;
      },
      handler: (fn: (args: unknown) => unknown) => (args: { data: unknown; context: unknown }) =>
        fn({ ...args, data: parse(args.data) }),
    };
    return chain;
  },
}));
import {
  baixarAnexo,
  cancelarAnexo,
  confirmarUpload,
  listarAnexos,
  prepararUpload,
} from "../src/features/operacao/files.functions";
import { anexoPai, anexoRow } from "../src/features/operacao/schemas";
import { sha256 } from "../src/features/operacao/files";
const id = (n: number) => `00000000-0000-4000-8000-${String(n).padStart(12, "0")}`;
const bytes = new TextEncoder().encode("%PDF-1.7\nfixture-agenda-isolada"),
  pai = { organization_id: id(1), agenda_evento_id: id(3) };
async function fixture() {
  const row = {
    id: id(4),
    organization_id: id(1),
    agenda_evento_id: id(3),
    pessoa_id: null,
    acao_id: null,
    qualificacao_id: null,
    ferramenta_id: null,
    calibracao_id: null,
    created_by: id(2),
    nome: "original-isolado.pdf",
    mime: "application/pdf",
    tamanho: bytes.length,
    sha256: await sha256(bytes),
    caminho: `${id(1)}/anexos/${id(4)}`,
    estado: "pendente",
  };
  const state = { row, canRead: true, canSend: true, afterDownload: null as null | (() => void) };
  const upload = vi.fn().mockResolvedValue({ data: { token: "isolated" }, error: null }),
    signed = vi.fn().mockResolvedValue({
      data: { signedUrl: "https://storage.test.invalid/private" },
      error: null,
    });
  const rpc = vi.fn(async (name: string) =>
    name === "iniciar_anexo_agenda" || name === "preparar_anexo_operacional"
      ? { data: { ...row, estado: "pendente" }, error: null }
      : name === "operacao_pode_enviar_anexo"
        ? { data: state.canSend, error: null }
        : name === "listar_anexos_operacionais"
          ? {
              data: {
                registros: [{ ...row, pode_retomar: state.canSend, pode_cancelar: state.canSend }],
                permissoes: { adicionar: state.canSend },
              },
              error: null,
            }
          : name === "cancelar_anexo_operacional"
            ? { data: { ...row, estado: "cancelado" }, error: null }
            : { data: null, error: { code: "42501", message: "PRIVATE" } },
  );
  const filters: Array<[string, unknown]> = [],
    db = {
      rpc,
      from: vi.fn(() => {
        const chain = {
          select: () => chain,
          eq: (k: string, v: unknown) => {
            filters.push([k, v]);
            return chain;
          },
          single: async () =>
            state.canRead
              ? { data: row, error: null }
              : { data: null, error: { code: "42501", message: "PRIVATE" } },
        };
        return chain;
      }),
      storage: { from: () => ({ createSignedUploadUrl: upload, createSignedUrl: signed }) },
    };
  service.download.mockImplementation(async () => {
    state.afterDownload?.();
    return { data: new Blob([bytes]), error: null };
  });
  service.rpc.mockResolvedValue({ data: null, error: null });
  return { state, db, context: { supabase: db, userId: id(2) }, rpc, upload, signed, filters };
}
async function invoke(fn: unknown, f: Awaited<ReturnType<typeof fixture>>, data: unknown) {
  return (fn as (args: { data: unknown; context: unknown }) => Promise<unknown>)({
    data,
    context: f.context,
  });
}
describe("Agenda: anexos canônicos e bytes privados", () => {
  beforeEach(() => {
    vi.stubEnv("SUPABASE_SERVICE_ROLE_KEY", "isolated-fixture");
    service.download.mockReset();
    service.rpc.mockReset();
  });
  afterEach(() => vi.unstubAllEnvs());
  it("aceita somente um pai explícito e não acrescenta Agenda aos payloads legados", () => {
    expect(anexoPai.safeParse(pai).success).toBe(true);
    expect(anexoPai.safeParse({ ...pai, pessoa_id: id(5) }).success).toBe(false);
    expect(anexoPai.parse({ organization_id: id(1), pessoa_id: id(5) })).not.toHaveProperty(
      "agenda_evento_id",
    );
  });
  it("recibos antigos continuam legíveis com novo pai nulo", async () => {
    const f = await fixture(),
      { agenda_evento_id, ...legacy } = f.state.row;
    expect(anexoRow.parse(legacy).agenda_evento_id).toBeNull();
  });
  it("staging Agenda envia FK separada e somente metadados autorizados", async () => {
    const f = await fixture();
    await invoke(prepararUpload, f, {
      pai,
      chave: id(7),
      nome: f.state.row.nome,
      mime: f.state.row.mime,
      tamanho: f.state.row.tamanho,
      sha256: f.state.row.sha256,
    });
    expect(f.rpc).toHaveBeenCalledWith("iniciar_anexo_agenda", {
      _org: id(1),
      _evento: id(3),
      _chave: id(7),
      _dados: {
        nome: f.state.row.nome,
        mime: f.state.row.mime,
        tamanho: f.state.row.tamanho,
        sha256: f.state.row.sha256,
      },
    });
    expect(f.rpc).not.toHaveBeenCalledWith("preparar_anexo_operacional", expect.anything());
  });
  it("replay confirmado relê estado atual sem gerar token nem substituir o original", async () => {
    const f = await fixture();
    f.state.row.estado = "vinculado";
    const result = await invoke(prepararUpload, f, {
      pai,
      chave: id(7),
      nome: f.state.row.nome,
      mime: f.state.row.mime,
      tamanho: f.state.row.tamanho,
      sha256: f.state.row.sha256,
    });
    expect(result).toMatchObject({
      token: null,
      anexo: { estado: "vinculado", nome: f.state.row.nome },
    });
    expect(f.upload).not.toHaveBeenCalled();
  });
  it("listagem delega ao leitor autorizado com o pai canônico", async () => {
    const f = await fixture();
    await invoke(listarAnexos, f, pai);
    expect(f.rpc).toHaveBeenCalledWith("listar_anexos_operacionais", {
      _org: id(1),
      _pai: { pessoa_id: null, acao_id: null, qualificacao_id: null, agenda_evento_id: id(3) },
    });
  });
  it("sem credencial de confirmação não anuncia upload nem cria intenção", async () => {
    const f = await fixture();
    vi.stubEnv("SUPABASE_SERVICE_ROLE_KEY", "");
    await expect(
      invoke(prepararUpload, f, {
        pai,
        chave: id(7),
        nome: f.state.row.nome,
        mime: f.state.row.mime,
        tamanho: f.state.row.tamanho,
        sha256: f.state.row.sha256,
      }),
    ).rejects.toThrow("falta a credencial de serviço no servidor");
    expect(f.rpc).not.toHaveBeenCalled();
  });
  it("arquivo privado é autorizado antes de qualquer download com service role", async () => {
    const f = await fixture();
    f.state.canRead = false;
    await expect(
      invoke(confirmarUpload, f, { organization_id: id(1), id: id(4) }),
    ).rejects.toThrow();
    expect(service.download).not.toHaveBeenCalled();
    expect(service.rpc).not.toHaveBeenCalled();
  });
  it("verifica bytes, tamanho, MIME e hash antes da confirmação privilegiada", async () => {
    const f = await fixture();
    await invoke(confirmarUpload, f, { organization_id: id(1), id: id(4), created_by: id(8) });
    expect(service.download).toHaveBeenCalledWith(f.state.row.caminho);
    expect(service.rpc).toHaveBeenCalledWith("confirmar_anexo_operacional", {
      _org: id(1),
      _id: id(4),
      _autor: id(2),
      _sha256: f.state.row.sha256,
    });
  });
  it("hash divergente nunca chega à mutação privilegiada", async () => {
    const f = await fixture();
    f.state.row.sha256 = "b".repeat(64);
    await expect(
      invoke(confirmarUpload, f, { organization_id: id(1), id: id(4) }),
    ).rejects.toThrow();
    expect(service.rpc).not.toHaveBeenCalled();
  });
  it("revogação durante a leitura do binário impede confirmar", async () => {
    const f = await fixture();
    f.state.afterDownload = () => {
      f.state.canSend = false;
    };
    await expect(invoke(confirmarUpload, f, { organization_id: id(1), id: id(4) })).rejects.toThrow(
      "mudou durante a verificação",
    );
    expect(service.rpc).not.toHaveBeenCalled();
  });
  it("retry já vinculado continua revalidado pelo comando SQL e autor de sessão", async () => {
    const f = await fixture();
    f.state.row.estado = "vinculado";
    await invoke(confirmarUpload, f, { organization_id: id(1), id: id(4) });
    expect(service.download).not.toHaveBeenCalled();
    expect(service.rpc).toHaveBeenCalledWith(
      "confirmar_anexo_operacional",
      expect.objectContaining({ _autor: id(2) }),
    );
  });
  it("download assinado dura60s e não evita leitura privada do pai", async () => {
    const f = await fixture();
    f.state.row.estado = "vinculado";
    await invoke(baixarAnexo, f, { organization_id: id(1), id: id(4) });
    expect(f.filters).toContainEqual(["estado", "vinculado"]);
    expect(f.signed).toHaveBeenCalledWith(f.state.row.caminho, 60, { download: f.state.row.nome });
    f.state.canRead = false;
    f.signed.mockClear();
    await expect(invoke(baixarAnexo, f, { organization_id: id(1), id: id(4) })).rejects.toThrow();
    expect(f.signed).not.toHaveBeenCalled();
  });
  it("cancelamento mantém comando/idempotência canônicos e motivo, sem autoria do cliente", async () => {
    const f = await fixture();
    await invoke(cancelarAnexo, f, {
      organization_id: id(1),
      id: id(4),
      chave: id(7),
      motivo: "Envio interrompido pelo responsável",
      created_by: id(8),
    });
    expect(f.rpc).toHaveBeenCalledWith("cancelar_anexo_operacional", {
      _org: id(1),
      _id: id(4),
      _chave: id(7),
      _motivo: "Envio interrompido pelo responsável",
    });
  });
});
