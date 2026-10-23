import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { sha256 } from "../src/features/operacao/files";
import type { EstudoArquivo } from "../src/features/estudos/types";

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
      inputValidator: (
        schema: { parse: (value: unknown) => unknown } | ((value: unknown) => unknown),
      ) => {
        parse = typeof schema === "function" ? schema : (value) => schema.parse(value);
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
  baixarArquivoEstudo,
  cancelarArquivoEstudo,
  confirmarArquivoEstudo,
  listarArquivosEstudo,
  prepararArquivoEstudo,
  retomarArquivoEstudo,
} from "../src/features/estudos/est-arquivos.functions";

const id = (n: number) => `00000000-0000-4000-8000-${String(n).padStart(12, "0")}`;
const destino = { organization_id: id(1), estudo_id: id(3), revisao_id: id(4), perigo_id: id(5) };
const bytes = new TextEncoder().encode("%PDF-1.7\nfixture-unit-test");
let original: EstudoArquivo;
beforeEach(async () => {
  vi.stubEnv("SUPABASE_SERVICE_ROLE_KEY", "isolated-unit-test-only");
  service.download.mockReset();
  service.rpc.mockReset();
  original = {
    ...destino,
    id: id(6),
    nome: "original.pdf",
    mime: "application/pdf",
    tamanho: bytes.length,
    sha256: await sha256(bytes),
    caminho: `${id(1)}/estudos/${id(3)}/${id(6)}`,
    estado: "pendente",
    created_by: id(2),
    created_at: "2026-10-22T12:00:00Z",
    confirmado_em: null,
  };
});
afterEach(() => vi.unstubAllEnvs());

function fixture() {
  const state = {
    row: { ...original },
    canRead: true,
    canSend: true,
    revisionExists: true,
    dangerExists: true,
  };
  const upload = vi.fn().mockResolvedValue({ data: { token: "fixture-token" }, error: null });
  const signed = vi.fn().mockResolvedValue({
    data: { signedUrl: "https://storage.test.invalid/private" },
    error: null,
  });
  const filters: Array<[string, unknown]> = [];
  const range = vi.fn();
  const db = {
    rpc: vi.fn(async (name: string) => {
      if (name === "est_ler" || name === "est_ler_arquivo")
        return { data: state.canRead, error: null };
      if (name === "est_pode_enviar_arquivo") return { data: state.canSend, error: null };
      if (name === "est_preparar_arquivo") return { data: { ...original }, error: null };
      if (name === "est_cancelar_arquivo")
        return { data: { ...state.row, estado: "cancelado" }, error: null };
      throw new Error(`Unexpected test RPC ${name}`);
    }),
    from: vi.fn((table: string) => {
      const response = () => ({
        data:
          table === "estudo_revisoes"
            ? state.revisionExists
              ? { id: id(4) }
              : null
            : table === "estudo_perigos"
              ? state.dangerExists
                ? { id: id(5) }
                : null
              : { ...state.row },
        error: null,
      });
      const chain = {
        select: () => chain,
        eq: (key: string, value: unknown) => {
          filters.push([key, value]);
          return chain;
        },
        neq: () => chain,
        is: (key: string, value: unknown) => {
          filters.push([key, value]);
          return chain;
        },
        order: () => chain,
        range: (from: number, to: number) => {
          range(from, to);
          return chain;
        },
        single: async () => response(),
        maybeSingle: async () => response(),
        then: (resolve: (value: unknown) => unknown) =>
          Promise.resolve({ data: [{ ...state.row }], count: 1, error: null }).then(resolve),
      };
      return chain;
    }),
    storage: { from: () => ({ createSignedUploadUrl: upload, createSignedUrl: signed }) },
  };
  return { db, state, upload, signed, filters, range };
}
function call(fn: unknown, db: unknown, data: unknown) {
  return (
    fn as (arg: {
      context: { supabase: unknown; userId: string };
      data: unknown;
    }) => Promise<unknown>
  )({
    context: { supabase: db, userId: id(2) },
    data,
  });
}
const metadata = () => ({
  ...destino,
  chave: id(7),
  nome: original.nome,
  mime: original.mime,
  tamanho: original.tamanho,
  sha256: original.sha256,
});

describe("study evidence server boundary (isolated handler fixtures)", () => {
  it("rejects forged authors and invalid revision/danger before preparing a Storage token", async () => {
    const f = fixture();
    await expect(
      call(prepararArquivoEstudo, f.db, { ...metadata(), created_by: id(8) }),
    ).rejects.toThrow();
    expect(f.db.rpc).not.toHaveBeenCalled();
    f.state.dangerExists = false;
    await expect(call(prepararArquivoEstudo, f.db, metadata())).rejects.toThrow(
      "Perigo indisponível",
    );
    expect(f.db.rpc).not.toHaveBeenCalledWith("est_preparar_arquivo", expect.anything());
    expect(f.upload).not.toHaveBeenCalled();
  });
  it("reloads the current row after a stale idempotency receipt instead of resending a linked original", async () => {
    const f = fixture();
    f.state.row.estado = "vinculado";
    await expect(call(prepararArquivoEstudo, f.db, metadata())).resolves.toMatchObject({
      arquivo: { estado: "vinculado" },
      token: null,
    });
    expect(f.upload).not.toHaveBeenCalled();
  });
  it("rejects revoked source access before loading privileged binary data, including a linked retry", async () => {
    const f = fixture();
    f.state.canRead = false;
    f.state.row.estado = "vinculado";
    await expect(
      call(confirmarArquivoEstudo, f.db, { organization_id: id(1), id: id(6) }),
    ).rejects.toThrow("indisponível");
    await expect(
      call(retomarArquivoEstudo, f.db, { organization_id: id(1), id: id(6) }),
    ).rejects.toThrow("indisponível");
    expect(service.download).not.toHaveBeenCalled();
    expect(service.rpc).not.toHaveBeenCalled();
  });
  it("revalidates current source ACL after downloading, before service confirmation", async () => {
    const f = fixture();
    service.download.mockImplementation(async () => {
      f.state.canRead = false;
      return { data: new Blob([bytes]), error: null };
    });
    await expect(
      call(confirmarArquivoEstudo, f.db, { organization_id: id(1), id: id(6) }),
    ).rejects.toThrow("indisponível");
    expect(service.rpc).not.toHaveBeenCalled();
  });
  it.each(["hash", "size", "mime"])(
    "does not confirm a stored binary with mismatched %s",
    async (difference) => {
      const f = fixture();
      if (difference === "hash") f.state.row.sha256 = "a".repeat(64);
      if (difference === "size") f.state.row.tamanho++;
      if (difference === "mime") f.state.row.mime = "image/png";
      service.download.mockResolvedValue({ data: new Blob([bytes]), error: null });
      await expect(
        call(confirmarArquivoEstudo, f.db, { organization_id: id(1), id: id(6) }),
      ).rejects.toThrow();
      expect(service.rpc).not.toHaveBeenCalled();
    },
  );
  it("confirms checked bytes with the authenticated actor and returns an authorized current row", async () => {
    const f = fixture();
    service.download.mockResolvedValue({ data: new Blob([bytes]), error: null });
    service.rpc.mockImplementation(async () => {
      f.state.row.estado = "vinculado";
      return { data: { ...f.state.row }, error: null };
    });
    await expect(
      call(confirmarArquivoEstudo, f.db, { organization_id: id(1), id: id(6) }),
    ).resolves.toMatchObject({ estado: "vinculado" });
    expect(service.rpc).toHaveBeenCalledWith("est_confirmar_arquivo", {
      _org: id(1),
      _id: id(6),
      _autor: id(2),
      _sha256: original.sha256,
    });
    expect(f.db.rpc.mock.calls.filter(([name]) => name === "est_ler_arquivo")).toHaveLength(3);
  });
  it("reports absent server credentials without creating staging, while authorized linked downloads remain available", async () => {
    vi.stubEnv("SUPABASE_SERVICE_ROLE_KEY", "");
    const f = fixture();
    await expect(call(prepararArquivoEstudo, f.db, metadata())).rejects.toThrow(
      "credencial de serviço",
    );
    expect(f.db.rpc).not.toHaveBeenCalledWith("est_preparar_arquivo", expect.anything());
    f.state.row.estado = "vinculado";
    await expect(
      call(baixarArquivoEstudo, f.db, { organization_id: id(1), id: id(6) }),
    ).resolves.toMatchObject({ url: expect.any(String) });
    expect(f.signed).toHaveBeenCalledWith(original.caminho, 60, { download: original.nome });
    await expect(
      call(confirmarArquivoEstudo, f.db, { organization_id: id(1), id: id(6) }),
    ).resolves.toMatchObject({ estado: "vinculado" });
    expect(service.download).not.toHaveBeenCalled();
  });
  it("lists only the requested revision/danger in bounded server pages", async () => {
    const f = fixture();
    await expect(
      call(listarArquivosEstudo, f.db, { ...destino, pagina: 2 }),
    ).resolves.toMatchObject({ total: 1, rows: [{ meu_envio: true }] });
    expect(f.range).toHaveBeenCalledWith(50, 74);
    for (const [field, value] of Object.entries(destino))
      expect(f.filters).toContainEqual([field, value]);
  });
  it("delegates pending cancellation to the canonical command and keeps its idempotency key", async () => {
    const f = fixture();
    await expect(
      call(cancelarArquivoEstudo, f.db, {
        organization_id: id(1),
        id: id(6),
        chave: id(9),
        motivo: "Cancelar pendência da fixture",
      }),
    ).resolves.toMatchObject({ estado: "cancelado" });
    expect(f.db.rpc).toHaveBeenCalledWith("est_cancelar_arquivo", {
      _org: id(1),
      _id: id(6),
      _chave: id(9),
      _motivo: "Cancelar pendência da fixture",
    });
  });
});
