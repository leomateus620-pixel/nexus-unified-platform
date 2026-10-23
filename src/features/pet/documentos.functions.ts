import { z } from "zod";
import { createServerFn } from "@tanstack/react-start";
import { getRequest } from "@tanstack/react-start/server";
import type { SupabaseClient } from "@supabase/supabase-js";
import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";
import { obterInput, detalheResult, type Json } from "./schemas";
import { petResult } from "./pet.functions";
import { validarBinario } from "@/features/operacao/files";

/** A derived download is useful even when private archival is not configured.
 * Availability in the document ledger requires verified storage and finalization. */
export const petGerarRelatorio = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator(
    obterInput.extend({
      chave: z.string().uuid().optional(),
      expected_version: z.number().int().positive().optional(),
    }),
  )
  .handler(async ({ context, data }) => {
    const { gerarRelatorioPersistido } = await import("./relatorios.server");
    return gerarRelatorioPersistido({
      db: context.supabase as unknown as SupabaseClient,
      organizationId: data.organization_id,
      petId: data.id,
      userId: context.userId,
      chave: data.chave ?? crypto.randomUUID(),
      ...(data.expected_version !== undefined ? { expectedVersion: data.expected_version } : {}),
      carregarAdmin:
        process.env["SUPABASE_SERVICE_ROLE_KEY"] && process.env["SUPABASE_URL"]
          ? async () => {
              const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
              return supabaseAdmin as unknown as SupabaseClient;
            }
          : undefined,
    });
  });

/** An emitted original is copied from private storage, never reconstructed by the PDF renderer. */
export const petObterPacote = createServerFn({ method: "GET" })
  .middleware([requireSupabaseAuth])
  .inputValidator(obterInput)
  .handler(async ({ context, data }) => {
    const db = context.supabase as unknown as SupabaseClient;
    const detalhe = detalheResult.parse(
      petResult(
        await db
          .rpc("pet_obter", { p_org: data.organization_id, p_id: data.id })
          .abortSignal(getRequest().signal),
      ),
    );
    if (!detalhe.pet["emitida_em"])
      throw new Error("Somente uma PET emitida possui pacote autorizado para contingência.");
    const original = detalhe.documentos.find(
      (x) =>
        x["tipo"] === "original_assinado" &&
        x["estado"] === "disponivel" &&
        x["revisao_id"] === detalhe.pet["revisao_atual_id"],
    );
    if (!original)
      throw new Error(
        "Documento original assinado ainda não disponível. A cópia local não foi ativada.",
      );
    const anexo = petResult(
      await db
        .from("anexos")
        .select("*")
        .eq("organization_id", data.organization_id)
        .eq("id", original["anexo_id"])
        .single(),
    ) as { caminho: string; tamanho: number; mime: string; sha256: string };
    const file = await db.storage.from("nexus-operacional").download(anexo.caminho);
    if (file.error || !file.data)
      throw new Error("Não foi possível obter o original autorizado. Tente novamente com conexão.");
    const bytes = new Uint8Array(await file.data.arrayBuffer());
    await validarBinario(bytes, anexo);
    if (anexo.sha256 !== original["sha256"])
      throw new Error("Integridade do documento divergente. Cópia local recusada.");
    // Storage/verification await can outlive a membership or record revocation.
    // Revalidate the same private parent immediately before returning its bytes.
    if (petResult(await db.rpc("pet_ler", { p_org: data.organization_id, p_id: data.id })) !== true)
      throw new Error("Registro indisponível para seu acesso atual.");
    return {
      formato: 1 as const,
      organizationId: data.organization_id,
      userId: context.userId,
      petId: data.id,
      version: Number(detalhe.pet["version"]),
      sincronizadoEm: new Date().toISOString(),
      documentoHash: anexo.sha256,
      pdf: Buffer.from(bytes).toString("base64"),
      snapshot: detalhe as Record<string, Json>,
      pendentes: [],
    };
  });
