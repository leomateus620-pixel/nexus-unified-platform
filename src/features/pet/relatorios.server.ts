import type { SupabaseClient } from "@supabase/supabase-js";
import { z } from "zod";
import { detalheResult, objectResult, type Json } from "./schemas";
import { gerarPetPdf, type PetPdfImagem } from "./pdf";
import { sha256, validarBinario } from "@/features/operacao/files";

const metadataSchema = z
  .object({
    id: z.string().uuid(),
    nome: z.string(),
    mime: z.string(),
    tamanho: z
      .number()
      .int()
      .positive()
      .max(20 * 1024 * 1024),
    sha256: z.string().regex(/^[0-9a-f]{64}$/),
    caminho: z.string(),
    estado: z.string(),
    pet_id: z.string().uuid(),
    pet_item: z.string().nullable(),
  })
  .passthrough();
type Metadata = z.infer<typeof metadataSchema>;
type RpcResult = { data: unknown; error: { code?: string; message: string } | null };
const unavailable = new Set(["42883", "42P01", "PGRST202"]);
const result = (response: RpcResult) => {
  if (!response.error) return response.data;
  if (["42501", "PGRST116"].includes(response.error.code ?? ""))
    throw new Error("Registro indisponível para seu acesso atual.");
  if (response.error.code === "40001")
    throw new Error("A PET mudou; confira a versão antes de gerar o relatório.");
  if (["23514", "23505"].includes(response.error.code ?? ""))
    throw new Error(response.error.message);
  throw new Error("Não foi possível confirmar o arquivamento privado do relatório.");
};
const asObject = (value: Json | undefined): Record<string, Json> =>
  value && typeof value === "object" && !Array.isArray(value) ? value : {};

export type GerarRelatorioOptions = {
  db: SupabaseClient;
  organizationId: string;
  petId: string;
  userId: string;
  chave: string;
  expectedVersion?: number;
  carregarAdmin?: (() => Promise<SupabaseClient>) | undefined;
};

/** Snapshot -> derived PDF -> canonical private attachment -> verified receipt.
 * Missing storage configuration keeps a useful, explicitly unarchived download.
 * No operation here issues a permit or creates a certified signature. */
export async function gerarRelatorioPersistido(options: GerarRelatorioOptions) {
  const { db, organizationId: org, petId, userId } = options;
  const current = detalheResult.parse(
    result(await db.rpc("pet_obter", { p_org: org, p_id: petId })),
  );
  const version = options.expectedVersion ?? Number(current.pet["version"]);
  let documento: Record<string, Json> | null = null;
  let snapshot: Record<string, Json> = current as Record<string, Json>;
  let snapshotHash: string | null = null;
  const prepared = await db.rpc("pet_preparar_relatorio", {
    p_org: org,
    p_pet: petId,
    p_expected_version: version,
    p_chave: options.chave,
  });
  if (!prepared.error || !unavailable.has(prepared.error.code ?? "")) {
    const job = objectResult.parse(result(prepared));
    documento = objectResult.parse(job["documento"]);
    snapshot = detalheResult.parse(job["snapshot"]) as Record<string, Json>;
    snapshotHash = typeof job["snapshot_sha256"] === "string" ? job["snapshot_sha256"] : null;
  }
  const authorize = async () => {
    if (result(await db.rpc("pet_ler", { p_org: org, p_id: petId })) !== true)
      throw new Error("Registro indisponível para seu acesso atual.");
  };
  const fail = async (message: string) => {
    if (documento)
      await db.rpc("pet_relatorio_falhar", {
        p_org: org,
        p_documento: documento["id"],
        p_motivo: message,
      });
  };
  const readFile = async (meta: Metadata) => {
    const file = await db.storage.from("nexus-operacional").download(meta.caminho);
    if (file.error || !file.data)
      throw new Error("Arquivo privado não disponível. Repita com conexão.");
    const bytes = new Uint8Array(await file.data.arrayBuffer());
    await validarBinario(bytes, meta);
    return bytes;
  };
  const returnBytes = async (
    bytes: Uint8Array,
    persistido: boolean,
    mensagem: string,
    anexoId?: string,
  ) => {
    await authorize();
    const pet = asObject(snapshot["pet"]);
    return {
      base64: Buffer.from(bytes).toString("base64"),
      sha256: await sha256(bytes),
      tamanho: bytes.length,
      version: Number(pet["version"]),
      tipo: "relatorio_derivado" as const,
      nome: `${String(pet["numero"])}-relatorio-v${String(pet["version"])}.pdf`,
      persistido,
      mensagem,
      documento_id: documento?.["id"] ?? null,
      anexo_id: anexoId ?? null,
      estado_arquivamento: persistido ? "disponivel" : documento ? "falha" : "nao_configurado",
      snapshot_sha256: snapshotHash,
    };
  };
  // A lost response reuses the original bytes; it never regenerates an archived file.
  if (documento?.["estado"] === "disponivel" && typeof documento["anexo_id"] === "string") {
    const meta = metadataSchema.parse(
      result(
        await db
          .from("anexos")
          .select("*")
          .eq("organization_id", org)
          .eq("id", documento["anexo_id"])
          .single(),
      ),
    );
    if (meta.pet_id !== petId || meta.sha256 !== documento["sha256"] || meta.estado !== "vinculado")
      throw new Error("Integridade do relatório arquivado divergente.");
    return returnBytes(
      await readFile(meta),
      true,
      "Relatório derivado arquivado no acervo privado.",
      meta.id,
    );
  }
  let metadata = snapshot["anexos"];
  if (!Array.isArray(metadata)) {
    metadata = result(
      await db
        .from("anexos")
        .select("*")
        .eq("organization_id", org)
        .eq("pet_id", petId)
        .eq("estado", "vinculado")
        .order("created_at")
        .order("id")
        .limit(201),
    ) as Json[];
  }
  if (metadata.length > 200) {
    await fail("A PET excede 200 evidências; é necessário processamento documental em lote.");
    throw new Error("A PET excede 200 evidências. Nenhum arquivo foi omitido silenciosamente.");
  }
  const anexos = metadata.map((entry) => metadataSchema.parse(entry));
  const imagens: PetPdfImagem[] = [];
  let budget = 12 * 1024 * 1024;
  try {
    for (const meta of anexos) {
      if (
        !["image/png", "image/jpeg"].includes(meta.mime) ||
        meta.tamanho > budget ||
        imagens.length >= 12
      )
        continue;
      const bytes = await readFile(meta);
      budget -= bytes.length;
      imagens.push({
        nome: meta.nome,
        mime: meta.mime,
        bytes,
        legenda: `Item: ${meta.pet_item ?? "Contexto da PET"} · SHA-256 ${meta.sha256}`,
      });
    }
  } catch (error) {
    await fail("Uma fotografia confirmada não pôde ser consultada/verificada.");
    throw error;
  }
  const bytes = await gerarPetPdf(
    {
      ...snapshot,
      anexos: metadata,
      relatorio_snapshot_sha256: snapshotHash,
      nota_imagens:
        "Fotos PNG/JPEG incorporadas até 12 imagens e 12 MiB. Todos os originais confirmados estão relacionados por contexto e hash; consulte os originais privados.",
    },
    imagens,
  );
  if (!documento || !options.carregarAdmin) {
    await fail("Arquivamento privado não configurado.");
    return returnBytes(
      bytes,
      false,
      "Relatório de consulta gerado; arquivamento privado não configurado.",
    );
  }
  const hash = await sha256(bytes);
  try {
    const nome = `${String(asObject(snapshot["pet"])["numero"])}-relatorio-${String(documento["id"])}.pdf`;
    const preparedAttachment = objectResult.parse(
      result(
        await db.rpc("iniciar_anexo_pet", {
          _org: org,
          _pet: petId,
          _chave: options.chave,
          _dados: {
            nome,
            mime: "application/pdf",
            tamanho: bytes.length,
            sha256: hash,
            pet_item: `documento:${String(documento["id"])}`,
          },
        }),
      ),
    );
    const meta = metadataSchema.parse(
      result(
        await db
          .from("anexos")
          .select("*")
          .eq("organization_id", org)
          .eq("id", preparedAttachment["id"])
          .single(),
      ),
    );
    if (meta.pet_id !== petId || meta.sha256 !== hash || meta.tamanho !== bytes.length)
      throw new Error("Intenção do arquivo divergente.");
    const admin = await options.carregarAdmin();
    if (meta.estado !== "vinculado") {
      if (result(await db.rpc("operacao_pode_enviar_anexo", { _org: org, _id: meta.id })) !== true)
        throw new Error("O acesso atual não permite confirmar o arquivo.");
      // No upsert: a previous upload after a lost response is verified as-is.
      let stored = await admin.storage.from("nexus-operacional").download(meta.caminho);
      if (stored.error || !stored.data) {
        const signed = result(
          await db.storage
            .from("nexus-operacional")
            .createSignedUploadUrl(meta.caminho, { upsert: false }),
        ) as { token: string };
        await db.storage
          .from("nexus-operacional")
          .uploadToSignedUrl(meta.caminho, signed.token, bytes, {
            contentType: "application/pdf",
            upsert: false,
          });
        stored = await admin.storage.from("nexus-operacional").download(meta.caminho);
      }
      if (stored.error || !stored.data) throw new Error("O envio privado não foi confirmado.");
      await validarBinario(new Uint8Array(await stored.data.arrayBuffer()), meta);
    }
    // The canonical confirmer rechecks author, current membership, parent lock,
    // storage metadata and immutable bytes before the document can be available.
    result(
      await admin.rpc("confirmar_anexo_operacional", {
        _org: org,
        _id: meta.id,
        _autor: userId,
        _sha256: hash,
      }),
    );
    result(
      await admin.rpc("pet_finalizar_relatorio", {
        p_org: org,
        p_documento: documento["id"],
        p_autor: userId,
        p_anexo: meta.id,
        p_sha256: hash,
      }),
    );
    return returnBytes(bytes, true, "Relatório derivado arquivado no acervo privado.", meta.id);
  } catch {
    await fail(
      "Arquivamento privado não confirmado. O relatório de consulta permanece disponível para download.",
    );
    return returnBytes(
      bytes,
      false,
      "Relatório de consulta gerado; arquivamento privado não confirmado. Tente novamente com a mesma solicitação.",
    );
  }
}
