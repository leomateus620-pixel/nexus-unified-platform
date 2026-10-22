import { describe, expect, it, vi } from "vitest";
vi.mock("@/integrations/supabase/auth-middleware", () => ({ requireSupabaseAuth: {} }));
vi.mock("@/features/auth/autorizacao", () => ({
  exigirAcao: vi.fn().mockResolvedValue(undefined),
}));
vi.mock("@tanstack/react-start", () => ({
  createServerFn: () => {
    let parse: (value: unknown) => unknown;
    const chain = {
      middleware: () => chain,
      inputValidator: (
        schema: ((value: unknown) => unknown) | { parse: (value: unknown) => unknown },
      ) => {
        parse = typeof schema === "function" ? schema : (value) => schema.parse(value);
        return chain;
      },
      handler:
        (handler: (value: unknown) => unknown) =>
        async (value: { data: unknown; context: unknown }) =>
          handler({ ...value, data: parse(value.data) }),
    };
    return chain;
  },
}));
import { transicionarRevisao } from "../src/features/propostas/propostas.functions";
const id = (n: number) => `00000000-0000-4000-8000-${String(n).padStart(12, "0")}`;
function fixture() {
  const records: Record<string, unknown> = {
    memberships: { organization_id: id(1) },
    proposta_revisoes: { id: id(2), organization_id: id(1), proposta_id: id(3), status: "enviada" },
  };
  const reads: string[] = [];
  const chain = { select: () => chain, eq: () => chain, limit: () => chain, maybeSingle: vi.fn() };
  const db = {
    from: vi.fn((table: string) => {
      reads.push(table);
      chain.maybeSingle.mockResolvedValue({ data: records[table], error: null });
      return chain;
    }),
    rpc: vi.fn().mockResolvedValue({
      data: { status: "aceitar", revisao_id: id(2), proposta_id: id(3), projeto_id: id(4) },
      error: null,
    }),
  };
  const invoke = transicionarRevisao as unknown as (input: {
    data: unknown;
    context: { supabase: typeof db; userId: string };
  }) => Promise<unknown>;
  return {
    db,
    reads,
    invoke: (data: unknown) => invoke({ data, context: { supabase: db, userId: id(5) } }),
  };
}
describe("Aceite: adaptador do comando transacional", () => {
  it("faz somente leituras de contexto e uma RPC, sem persistência parcial no handler", async () => {
    const f = fixture();
    await expect(f.invoke({ revisao_id: id(2), acao: "aceitar" })).resolves.toEqual({
      status: "aceitar",
    });
    expect(f.reads).toEqual(["memberships", "proposta_revisoes"]);
    expect(f.db.rpc).toHaveBeenCalledExactlyOnceWith("aceitar_projeto_operacional", {
      _org: id(1),
      _revisao: id(2),
      _chave: id(2),
      _motivo: null,
    });
  });
  it("mantém a identidade e o motivo na tentativa repetida", async () => {
    const f = fixture(),
      payload = { revisao_id: id(2), acao: "aceitar", motivo: "Aceite explícito do cliente" };
    await f.invoke(payload);
    await f.invoke(payload);
    expect(f.db.rpc.mock.calls[0]).toEqual(f.db.rpc.mock.calls[1]);
  });
  it("não confirma sucesso quando a RPC falha", async () => {
    const f = fixture();
    f.db.rpc.mockResolvedValue({
      data: null,
      error: { message: "Falha atômica ao vincular ordem." },
    });
    await expect(f.invoke({ revisao_id: id(2), acao: "aceitar" })).rejects.toThrow("Falha atômica");
    expect(f.reads).toEqual(["memberships", "proposta_revisoes"]);
  });
  it.each([
    { status: "aceitar", revisao_id: id(9), proposta_id: id(3), projeto_id: id(4) },
    { status: "aceitar", revisao_id: id(2), proposta_id: id(9), projeto_id: id(4) },
    { status: "aceitar", revisao_id: id(2), proposta_id: id(3) },
  ])("rejeita recibo trocado ou incompleto", async (result) => {
    const f = fixture();
    f.db.rpc.mockResolvedValue({ data: result, error: null });
    await expect(f.invoke({ revisao_id: id(2), acao: "aceitar" })).rejects.toThrow();
  });
});
