import type { Json } from "../src/features/pet/schemas";
import { createHash } from "node:crypto";
import { petPdfFixture } from "./fixtures/pet-pdf.fixture";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
const mocked = vi.hoisted(() => ({ generate: vi.fn() }));
vi.mock("../src/features/pet/relatorios.server", () => ({
  gerarRelatorioPersistido: mocked.generate,
}));
vi.mock("@/integrations/supabase/auth-middleware", () => ({ requireSupabaseAuth: {} }));
vi.mock("@tanstack/react-start/server", () => ({
  getRequest: () => ({ signal: new AbortController().signal }),
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
        async (value: { data: unknown; context: unknown }) =>
          handler({ data: parse(value.data), context: value.context }),
    };
    return chain;
  },
}));
import { petGerarRelatorio, petObterPacote } from "../src/features/pet/documentos.functions";
const id = (n: number) => `b7330000-0000-4000-8000-${String(n).padStart(12, "0")}`;
const db = { scope: "authenticated user client" };
const call = (data: unknown) =>
  (petGerarRelatorio as unknown as (input: unknown) => Promise<unknown>)({
    data,
    context: { supabase: db, userId: id(2) },
  });

beforeEach(() => {
  vi.clearAllMocks();
  vi.stubEnv("SUPABASE_SERVICE_ROLE_KEY", "");
  vi.stubEnv("SUPABASE_URL", "");
  mocked.generate.mockResolvedValue({
    persistido: false,
    mensagem: "Relatório de consulta gerado; arquivamento privado não configurado.",
    base64: "JVBERg==",
    tipo: "relatorio_derivado",
  });
});
afterEach(() => vi.unstubAllEnvs());

// Boundary unit tests; authentication middleware and Storage HTTP are verified separately.
describe("PET: contrato autenticado do relatório", () => {
  it("preserva o input legado e retorna explicitamente arquivamento não configurado", async () => {
    const response = await call({ organization_id: id(1), id: id(3) });
    expect(response).toMatchObject({ persistido: false, tipo: "relatorio_derivado" });
    expect(mocked.generate).toHaveBeenCalledWith(
      expect.objectContaining({
        db,
        organizationId: id(1),
        petId: id(3),
        userId: id(2),
        carregarAdmin: undefined,
      }),
    );
    expect(mocked.generate.mock.calls[0]?.[0].chave).toMatch(/^[0-9a-f-]{36}$/);
  });
  it("preserva chave e versão explícitas e deriva autoria da sessão", async () => {
    const request = {
      organization_id: id(1),
      id: id(3),
      chave: id(4),
      expected_version: 8,
      userId: id(99),
    };
    await call(request);
    await call(request);
    expect(mocked.generate).toHaveBeenNthCalledWith(
      1,
      expect.objectContaining({ chave: id(4), expectedVersion: 8, userId: id(2) }),
    );
    expect(mocked.generate.mock.calls[0]?.[0]).toEqual(mocked.generate.mock.calls[1]?.[0]);
  });
  it("recusa identificadores ou versão inválidos antes de preparar documento", async () => {
    await expect(call({ organization_id: "outra", id: id(3) })).rejects.toThrow();
    await expect(
      call({ organization_id: id(1), id: id(3), expected_version: 0 }),
    ).rejects.toThrow();
    expect(mocked.generate).not.toHaveBeenCalled();
  });
});

describe("PET: pacote original e revogação durante leitura", () => {
  function context(revokeDuringDownload: boolean) {
    const bytes = new TextEncoder().encode("%PDF-1.7\nORIGINAL TESTE\n%%EOF");
    const sha256 = createHash("sha256").update(bytes).digest("hex");
    const detail = petPdfFixture(1);
    const pet = detail["pet"] as Record<string, Json>;
    pet["emitida_em"] = "2026-10-23T12:00:00Z";
    pet["revisao_atual_id"] = id(8);
    detail["permissoes"] = { baixar: true };
    detail["documentos"] = [
      {
        id: id(9),
        tipo: "original_assinado",
        estado: "disponivel",
        revisao_id: id(8),
        anexo_id: id(10),
        sha256,
      },
    ];
    let revoked = false;
    const rpc = vi.fn((name: string) => {
      const result = { data: name === "pet_ler" ? !revoked : detail, error: null };
      return Object.assign(Promise.resolve(result), { abortSignal: () => Promise.resolve(result) });
    });
    const query = {
      select: vi.fn(),
      eq: vi.fn(),
      single: vi.fn(async () => ({
        data: {
          caminho: "org/private/original.pdf",
          tamanho: bytes.length,
          mime: "application/pdf",
          sha256,
        },
        error: null,
      })),
    };
    query.select.mockReturnValue(query);
    query.eq.mockReturnValue(query);
    const storage = {
      download: vi.fn(async () => {
        revoked = revokeDuringDownload;
        return { data: new Blob([bytes]), error: null };
      }),
    };
    return { db: { rpc, from: () => query, storage: { from: () => storage } }, rpc, bytes };
  }
  const callPackage = (db: unknown) =>
    (petObterPacote as unknown as (input: unknown) => Promise<Record<string, Json>>)({
      data: { organization_id: id(1), id: id(3) },
      context: { supabase: db, userId: id(2) },
    });
  it("recusa devolver os bytes se o acesso for revogado depois do Storage", async () => {
    const t = context(true);
    await expect(callPackage(t.db)).rejects.toThrow("acesso atual");
    expect(t.rpc).toHaveBeenLastCalledWith("pet_ler", { p_org: id(1), p_id: id(3) });
  });
  it("devolve o original somente com acesso revalidado", async () => {
    const t = context(false);
    const r = await callPackage(t.db);
    expect(r["pdf"]).toBe(Buffer.from(t.bytes).toString("base64"));
    expect(t.rpc).toHaveBeenLastCalledWith("pet_ler", { p_org: id(1), p_id: id(3) });
  });
});
