import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { sha256 } from "../src/features/operacao/files";

const service = vi.hoisted(() => ({ download: vi.fn(), rpc: vi.fn() }));
vi.mock("@/integrations/supabase/auth-middleware", () => ({ requireSupabaseAuth: {} }));
vi.mock("@/integrations/supabase/client.server", () => ({
  supabaseAdmin: { rpc: service.rpc, storage: { from: () => ({ download: service.download }) } },
}));
vi.mock("@tanstack/react-start", () => ({
  createServerFn: () => {
    let parse: (value: unknown) => unknown;
    const chain = {
      middleware: () => chain,
      inputValidator: (schema: { parse: (value: unknown) => unknown }) => {
        parse = (value) => schema.parse(value);
        return chain;
      },
      handler:
        (handler: (value: unknown) => unknown) =>
        async (arg: { data: unknown; context: unknown }) =>
          handler({ ...arg, data: parse(arg.data) }),
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
  retomarUpload,
} from "../src/features/operacao/files.functions";

const id = (n: number) => `00000000-0000-4000-8000-${String(n).padStart(12, "0")}`;
const bytes = new TextEncoder().encode("%PDF-1.7\nfixture-isolada");
const pai = { organization_id: id(1), ferramenta_id: id(3) };
const oldParent = { organization_id: id(1), pessoa_id: id(3) };
let original: {
  id: string;
  organization_id: string;
  nome: string;
  mime: string;
  tamanho: number;
  sha256: string;
  caminho: string;
  estado: string;
  pessoa_id: string | null;
  acao_id: null;
  qualificacao_id: null;
  ferramenta_id: string | null;
  calibracao_id: string | null;
  created_by: string;
};
beforeEach(async () => {
  vi.stubEnv("SUPABASE_SERVICE_ROLE_KEY", "fixture-isolada");
  service.download.mockReset();
  service.rpc.mockReset();
  original = {
    id: id(5),
    organization_id: id(1),
    nome: "original.pdf",
    mime: "application/pdf",
    tamanho: bytes.length,
    sha256: await sha256(bytes),
    caminho: `${id(1)}/anexos/${id(5)}`,
    estado: "pendente",
    pessoa_id: null,
    acao_id: null,
    qualificacao_id: null,
    ferramenta_id: id(3),
    calibracao_id: null,
    created_by: id(2),
  };
});
afterEach(() => vi.unstubAllEnvs());
function fixture() {
  const state = { row: { ...original }, receipt: { ...original }, canRead: true, canSend: true };
  const upload = vi.fn().mockResolvedValue({ data: { token: "fixture-token" }, error: null });
  const signed = vi
    .fn()
    .mockResolvedValue({ data: { signedUrl: "https://storage.test.invalid/file" }, error: null });
  const filters: Array<[string, unknown]> = [];
  const db = {
    rpc: vi.fn(async (name: string, _args?: Record<string, unknown>) => {
      if (name === "operacao_pode_enviar_anexo") return { data: state.canSend, error: null };
      if (name === "preparar_anexo_operacional") return { data: { ...state.receipt }, error: null };
      if (name === "listar_anexos_operacionais")
        return {
          data: {
            registros: [
              { ...state.row, pode_retomar: state.canSend, pode_cancelar: state.canSend },
            ],
            permissoes: { adicionar: state.canSend },
          },
          error: null,
        };
      if (name === "cancelar_anexo_operacional")
        return { data: { ...state.row, estado: "cancelado" }, error: null };
      throw new Error(`RPC inesperado: ${name}`);
    }),
    from: vi.fn(() => {
      const chain = {
        select: () => chain,
        eq: (key: string, value: unknown) => {
          filters.push([key, value]);
          return chain;
        },
        single: async () =>
          state.canRead
            ? { data: { ...state.row }, error: null }
            : { data: null, error: { code: "42501", message: "PRIVATE" } },
      };
      return chain;
    }),
    storage: { from: () => ({ createSignedUploadUrl: upload, createSignedUrl: signed }) },
  };
  service.download.mockResolvedValue({ data: new Blob([bytes]), error: null });
  service.rpc.mockImplementation(async () => {
    state.row.estado = "vinculado";
    return { data: null, error: null };
  });
  return { db, state, upload, signed, filters };
}
function call(fn: unknown, db: unknown, data: unknown) {
  return (
    fn as (arg: {
      context: { supabase: unknown; userId: string };
      data: unknown;
    }) => Promise<unknown>
  )({ context: { supabase: db, userId: id(2) }, data });
}
const metadata = () => ({
  pai,
  chave: id(7),
  nome: original.nome,
  mime: original.mime,
  tamanho: original.tamanho,
  sha256: original.sha256,
});
const onlyFile = () => ({ organization_id: id(1), id: id(5) });
describe("Anexos: fronteira de servidor e permissões separadas de leitura/envio", () => {
  it("lista em um RPC e recebe flags do servidor sem ampliar payload", async () => {
    const f = fixture();
    f.state.canSend = false;
    const data = await call(listarAnexos, f.db, pai);
    expect(data).toMatchObject({
      permissoes: { adicionar: false },
      registros: [{ pode_retomar: false, pode_cancelar: false }],
    });
    expect(f.db.rpc).toHaveBeenCalledWith("listar_anexos_operacionais", {
      _org: id(1),
      _pai: { pessoa_id: null, acao_id: null, qualificacao_id: null, ferramenta_id: id(3) },
    });
    expect(f.db.from).not.toHaveBeenCalled();
  });
  it("preserva o JSON legado que alimenta o hash idempotente", async () => {
    const f = fixture();
    await call(prepararUpload, f.db, { ...metadata(), pai: oldParent });
    const data = f.db.rpc.mock.calls.find(([name]) => name === "preparar_anexo_operacional");
    expect(data?.[1]).toEqual({
      _org: id(1),
      _chave: id(7),
      _dados: {
        pessoa_id: id(3),
        acao_id: null,
        qualificacao_id: null,
        nome: original.nome,
        mime: original.mime,
        tamanho: original.tamanho,
        sha256: original.sha256,
      },
    });
  });
  it("relê estado atual de um recibo antigo e não emite token para vinculado", async () => {
    const f = fixture();
    f.state.row.estado = "vinculado";
    await expect(call(prepararUpload, f.db, metadata())).resolves.toMatchObject({
      token: null,
      anexo: { estado: "vinculado" },
    });
    expect(f.upload).not.toHaveBeenCalled();
    expect(f.filters).toContainEqual(["organization_id", id(1)]);
    expect(f.filters).toContainEqual(["id", id(5)]);
  });
  it("leitura sem envio não recebe token nem baixa bytes com privilégio", async () => {
    const f = fixture();
    f.state.canSend = false;
    await expect(call(retomarUpload, f.db, onlyFile())).rejects.toThrow("não permite retomar");
    await expect(call(confirmarUpload, f.db, onlyFile())).rejects.toThrow("não permite confirmar");
    expect(f.upload).not.toHaveBeenCalled();
    expect(service.download).not.toHaveBeenCalled();
    expect(service.rpc).not.toHaveBeenCalled();
  });
  it("não retoma envio de outro autor", async () => {
    const f = fixture();
    f.state.row.created_by = id(99);
    await expect(call(retomarUpload, f.db, onlyFile())).rejects.toThrow("Somente o autor");
    expect(f.upload).not.toHaveBeenCalled();
  });
  it("nega RLS antes de qualquer acesso privilegiado", async () => {
    const f = fixture();
    f.state.canRead = false;
    await expect(call(confirmarUpload, f.db, onlyFile())).rejects.toThrow("sem permissão");
    expect(service.download).not.toHaveBeenCalled();
    expect(service.rpc).not.toHaveBeenCalled();
  });
  it("autor da confirmação vem da sessão, não de campos enviados", async () => {
    const f = fixture();
    await call(confirmarUpload, f.db, { ...onlyFile(), autor: id(99) });
    expect(service.rpc).toHaveBeenCalledWith("confirmar_anexo_operacional", {
      _org: id(1),
      _id: id(5),
      _autor: id(2),
      _sha256: original.sha256,
    });
  });
  it("revogação durante download impede a confirmação privilegiada", async () => {
    const f = fixture();
    service.download.mockImplementation(async () => {
      f.state.canSend = false;
      return { data: new Blob([bytes]), error: null };
    });
    await expect(call(confirmarUpload, f.db, onlyFile())).rejects.toThrow("mudou durante");
    expect(service.rpc).not.toHaveBeenCalled();
  });
  it("hash divergente não confirma nem altera metadados", async () => {
    const f = fixture();
    f.state.row.sha256 = "0".repeat(64);
    await expect(call(confirmarUpload, f.db, onlyFile())).rejects.toThrow("hash");
    expect(service.rpc).not.toHaveBeenCalled();
  });
  it("retry já vinculado ainda revalida no SQL sem baixar bytes outra vez", async () => {
    const f = fixture();
    f.state.row.estado = "vinculado";
    await call(confirmarUpload, f.db, onlyFile());
    expect(service.download).not.toHaveBeenCalled();
    expect(service.rpc).toHaveBeenCalledWith(
      "confirmar_anexo_operacional",
      expect.objectContaining({ _autor: id(2) }),
    );
  });
  it("retry vinculado rejeitado pelo banco não é apresentado como sucesso", async () => {
    const f = fixture();
    f.state.row.estado = "vinculado";
    service.rpc.mockResolvedValue({ data: null, error: { code: "42501", message: "PRIVATE" } });
    await expect(call(confirmarUpload, f.db, onlyFile())).rejects.toThrow("sem permissão");
  });
  it("cancelamento usa chave e motivo, sem autor escolhido pelo browser", async () => {
    const f = fixture();
    await expect(
      call(cancelarAnexo, f.db, {
        ...onlyFile(),
        chave: id(8),
        motivo: "  Corrigir evidência pendente  ",
        autor: id(99),
      }),
    ).resolves.toMatchObject({ estado: "cancelado" });
    expect(f.db.rpc).toHaveBeenCalledWith("cancelar_anexo_operacional", {
      _org: id(1),
      _id: id(5),
      _chave: id(8),
      _motivo: "Corrigir evidência pendente",
    });
  });
  it("motivo curto não chega ao banco", async () => {
    const f = fixture();
    await expect(
      call(cancelarAnexo, f.db, { ...onlyFile(), chave: id(8), motivo: "abc" }),
    ).rejects.toThrow();
    expect(f.db.rpc).not.toHaveBeenCalled();
  });
  it("download curto autoriza o registro e não depende da chave de serviço", async () => {
    const f = fixture();
    vi.stubEnv("SUPABASE_SERVICE_ROLE_KEY", "");
    f.state.row.estado = "vinculado";
    await call(baixarAnexo, f.db, onlyFile());
    expect(f.signed).toHaveBeenCalledWith(original.caminho, 60, { download: original.nome });
    expect(f.filters).toContainEqual(["estado", "vinculado"]);
    expect(service.download).not.toHaveBeenCalled();
  });
  it("credencial ausente informa dependência sem criar staging", async () => {
    const f = fixture();
    vi.stubEnv("SUPABASE_SERVICE_ROLE_KEY", "");
    await expect(call(prepararUpload, f.db, metadata())).rejects.toThrow("credencial de serviço");
    expect(f.db.rpc).not.toHaveBeenCalled();
  });
});
