import { createHash } from "node:crypto";
import type { SupabaseClient } from "@supabase/supabase-js";
import { beforeEach, describe, expect, it, vi } from "vitest";
import type { Json } from "../src/features/pet/schemas";
import { petPdfFixture } from "./fixtures/pet-pdf.fixture";
const pdf = vi.hoisted(() => ({ gerar: vi.fn() }));
vi.mock("../src/features/pet/pdf", () => ({ gerarPetPdf: pdf.gerar }));
import { gerarRelatorioPersistido } from "../src/features/pet/relatorios.server";

const id = (n: number) => `b7330000-0000-4000-8000-${String(n).padStart(12, "0")}`;
const bytes = new TextEncoder().encode("%PDF-1.7\nDERIVED TEST ONLY\n%%EOF");
const hash = createHash("sha256").update(bytes).digest("hex");
const snapshotHash = "b".repeat(64);
const meta = {
  id: id(6),
  nome: "relatorio.pdf",
  mime: "application/pdf",
  tamanho: bytes.length,
  sha256: hash,
  caminho: `${id(1)}/anexos/${id(6)}`,
  estado: "pendente",
  pet_id: id(3),
  pet_item: `documento:${id(5)}`,
};
const snapshot = () => {
  const detail = petPdfFixture(1);
  (detail["pet"] as Record<string, Json>)["version"] = 7;
  detail["anexos"] = [];
  detail["permissoes"] = { baixar: true };
  return detail;
};
const success = (data: unknown) => ({ data, error: null });
function database(
  options: {
    missingSchema?: boolean;
    denied?: boolean;
    revoked?: boolean;
    available?: boolean;
    corrupted?: boolean;
    needsUpload?: boolean;
  } = {},
) {
  const detail = snapshot();
  const document = {
    id: id(5),
    estado: options.available ? "disponivel" : "gerando",
    anexo_id: options.available ? meta.id : null,
    sha256: options.available ? hash : null,
  };
  const rpc = vi.fn(async (name: string) => {
    if (name === "pet_obter")
      return options.denied
        ? { data: null, error: { code: "42501", message: "private" } }
        : success(detail);
    if (name === "pet_preparar_relatorio")
      return options.missingSchema
        ? { data: null, error: { code: "PGRST202", message: "missing" } }
        : success({
            documento: document,
            snapshot: detail,
            snapshot_sha256: snapshotHash,
            pet_version: 7,
          });
    if (name === "pet_ler") return success(!options.revoked);
    if (name === "iniciar_anexo_pet") return success(meta);
    return success(true);
  });
  const builder = {
    select: vi.fn(),
    eq: vi.fn(),
    order: vi.fn(),
    single: vi.fn(async () =>
      success({ ...meta, estado: options.available ? "vinculado" : "pendente" }),
    ),
    limit: vi.fn(async () => success([])),
  };
  for (const fn of [builder.select, builder.eq, builder.order]) fn.mockReturnValue(builder);
  const store = {
    download: vi.fn(async () => success(new Blob([bytes]))),
    createSignedUploadUrl: vi.fn(async () => success({ token: "test-token" })),
    uploadToSignedUrl: vi.fn(async () => success({ path: meta.caminho })),
  };
  const db = { rpc, from: vi.fn(() => builder), storage: { from: vi.fn(() => store) } };
  let reads = 0;
  const adminStore = {
    download: vi.fn(async () => {
      reads++;
      if (options.needsUpload && reads === 1)
        return { data: null, error: { message: "not uploaded" } };
      return success(new Blob([options.corrupted ? new Uint8Array([1, 2]) : bytes]));
    }),
  };
  const admin = {
    rpc: vi.fn(async () => success(true)),
    storage: { from: vi.fn(() => adminStore) },
  };
  const loadAdmin = vi.fn(async () => admin as unknown as SupabaseClient);
  const params = {
    db: db as unknown as SupabaseClient,
    organizationId: id(1),
    userId: id(2),
    petId: id(3),
    chave: id(4),
    expectedVersion: 7,
  };
  return { db, builder, store, admin, adminStore, loadAdmin, params };
}

beforeEach(() => {
  vi.clearAllMocks();
  pdf.gerar.mockResolvedValue(bytes);
});
describe("PET: relatório derivado e arquivamento privado", () => {
  it("preserva download sem serviço, registra falha e não anuncia arquivo disponível", async () => {
    const t = database();
    const r = await gerarRelatorioPersistido(t.params);
    expect(r.persistido).toBe(false);
    expect(r.mensagem).toContain("arquivamento privado não configurado");
    expect(r.estado_arquivamento).toBe("falha");
    expect(r.base64).toBe(Buffer.from(bytes).toString("base64"));
    expect(t.db.rpc).toHaveBeenCalledWith("pet_preparar_relatorio", {
      p_org: id(1),
      p_pet: id(3),
      p_expected_version: 7,
      p_chave: id(4),
    });
    expect(t.db.rpc).toHaveBeenCalledWith(
      "pet_relatorio_falhar",
      expect.objectContaining({ p_documento: id(5) }),
    );
    expect(t.store.uploadToSignedUrl).not.toHaveBeenCalled();
  });

  it("mantém compatibilidade do download se a migração nova não estiver aplicada", async () => {
    const t = database({ missingSchema: true });
    const r = await gerarRelatorioPersistido(t.params);
    expect(r.persistido).toBe(false);
    expect(r.documento_id).toBeNull();
    expect(r.estado_arquivamento).toBe("nao_configurado");
    expect(t.db.rpc.mock.calls.some(([name]) => name === "pet_relatorio_falhar")).toBe(false);
  });

  it("usa snapshot fixado e confirma bytes antes de disponibilizar o documento", async () => {
    const t = database({ needsUpload: true });
    const r = await gerarRelatorioPersistido({ ...t.params, carregarAdmin: t.loadAdmin });
    expect(r.persistido).toBe(true);
    expect(r.documento_id).toBe(id(5));
    expect(r.anexo_id).toBe(meta.id);
    expect(pdf.gerar).toHaveBeenCalledWith(
      expect.objectContaining({ relatorio_snapshot_sha256: snapshotHash }),
      [],
    );
    expect(t.store.uploadToSignedUrl).toHaveBeenCalledWith(meta.caminho, "test-token", bytes, {
      contentType: "application/pdf",
      upsert: false,
    });
    expect(t.admin.rpc).toHaveBeenNthCalledWith(1, "confirmar_anexo_operacional", {
      _org: id(1),
      _id: meta.id,
      _autor: id(2),
      _sha256: hash,
    });
    expect(t.admin.rpc).toHaveBeenNthCalledWith(2, "pet_finalizar_relatorio", {
      p_org: id(1),
      p_documento: id(5),
      p_autor: id(2),
      p_anexo: meta.id,
      p_sha256: hash,
    });
  });

  it("não confirma bytes divergentes e mantém o relatório local explicitamente não arquivado", async () => {
    const t = database({ corrupted: true });
    const r = await gerarRelatorioPersistido({ ...t.params, carregarAdmin: t.loadAdmin });
    expect(r.persistido).toBe(false);
    expect(r.mensagem).toContain("não confirmado");
    expect(t.admin.rpc).not.toHaveBeenCalled();
  });

  it("repetição de documento disponível baixa o original arquivado sem regenerar ou sobrescrever", async () => {
    const t = database({ available: true });
    const r = await gerarRelatorioPersistido(t.params);
    expect(r.persistido).toBe(true);
    expect(pdf.gerar).not.toHaveBeenCalled();
    expect(t.store.uploadToSignedUrl).not.toHaveBeenCalled();
    expect(t.store.download).toHaveBeenCalledWith(meta.caminho);
  });

  it("nega leitura e revogação sem entregar bytes ou promover documento", async () => {
    const denied = database({ denied: true });
    await expect(
      gerarRelatorioPersistido({ ...denied.params, carregarAdmin: denied.loadAdmin }),
    ).rejects.toThrow("acesso atual");
    expect(denied.loadAdmin).not.toHaveBeenCalled();
    const revoked = database({ revoked: true });
    await expect(gerarRelatorioPersistido(revoked.params)).rejects.toThrow("acesso atual");
  });

  it("retoma objeto já enviado verificando hash sem enviar novamente", async () => {
    const t = database();
    const r = await gerarRelatorioPersistido({ ...t.params, carregarAdmin: t.loadAdmin });
    expect(r.persistido).toBe(true);
    expect(t.store.uploadToSignedUrl).not.toHaveBeenCalled();
    expect(t.admin.rpc).toHaveBeenCalledWith("confirmar_anexo_operacional", expect.any(Object));
  });
});
