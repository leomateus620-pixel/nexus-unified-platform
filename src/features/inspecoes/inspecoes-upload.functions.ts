import type { SupabaseClient } from "@supabase/supabase-js";
import { createServerFn } from "@tanstack/react-start";
import { z } from "zod";
import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";
import { inspecoesUploadMimes, validarArquivoInspecoes } from "./arquivo-formatos";
import type { InspecoesArquivo } from "./ui-contract";

export const inspecoesLimiteEnvio = 20 * 1024 * 1024;
const bucket = "inspecoes-acervo";
const id = z.string().uuid();
const organization = z.object({ organizationId: id });
const fileId = organization.extend({ id });
const record = z.object({
  id,
  nome: z.string(),
  papel: z.string(),
  estado: z.string(),
  bytes: z.number().nullable(),
  mime: z.string().nullable(),
  sha256: z.string().nullable(),
  legenda: z.string().nullable(),
  caminho: z.string().nullable(),
  created_by: id.nullable(),
});

function db(value: unknown) {
  return value as SupabaseClient;
}

function result<T>(response: { data: T; error: { code?: string; message: string } | null }): T {
  if (!response.error) return response.data;
  if (["23514", "22023", "23505"].includes(response.error.code ?? ""))
    throw new Error(response.error.message);
  if (["42501", "PGRST116"].includes(response.error.code ?? ""))
    throw new Error("Arquivo indisponível no contexto autorizado.");
  throw new Error("Não foi possível completar a operação com o arquivo.");
}

function publicFile(file: z.infer<typeof record>): InspecoesArquivo {
  return {
    id: file.id,
    nome: file.nome,
    papel: file.papel,
    estado: file.estado,
    bytes: file.bytes,
    mime: file.mime,
    sha256: file.sha256,
    legenda: file.legenda,
  };
}

function checkSetup() {
  if (!process.env["SUPABASE_SERVICE_ROLE_KEY"])
    throw new Error("Integração não configurada para confirmar os bytes do envio.");
}

export const inspecoesAnexos = createServerFn({ method: "GET" })
  .middleware([requireSupabaseAuth])
  .inputValidator(organization.extend({ levantamentoId: id }))
  .handler(async ({ context, data }): Promise<InspecoesArquivo[]> => {
    const rows = result(
      await db(context.supabase)
        .from("inspecoes_arquivos")
        .select("id,nome,papel,estado,bytes,mime,sha256,legenda,caminho,created_by")
        .eq("organization_id", data.organizationId)
        .eq("levantamento_id", data.levantamentoId)
        .order("ordem")
        .order("created_at")
        .order("id")
        .limit(100),
    );
    return z.array(record).parse(rows).map(publicFile);
  });

export const inspecoesUploadReservar = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator(
    organization.extend({
      levantamentoId: id,
      chave: id,
      nome: z.string().trim().min(1).max(255),
      papel: z.enum(["original", "foto", "art", "ensaio", "evidencia"]),
      mime: z.enum(inspecoesUploadMimes),
      bytes: z.number().int().min(1).max(inspecoesLimiteEnvio),
      sha256: z.string().regex(/^[a-f0-9]{64}$/),
      legenda: z.string().trim().max(2000).optional(),
    }),
  )
  .handler(async ({ context, data }) => {
    checkSetup();
    const client = db(context.supabase);
    const file = record.parse(
      result(
        await client.rpc("inspecoes_arquivo_reservar", {
          p_org: data.organizationId,
          p_levantamento: data.levantamentoId,
          p_chave: data.chave,
          p_nome: data.nome,
          p_papel: data.papel,
          p_mime: data.mime,
          p_bytes: data.bytes,
          p_sha256: data.sha256,
          p_legenda: data.legenda || null,
        }),
      ),
    );
    if (!file.caminho) throw new Error("O vínculo de armazenamento do envio está indisponível.");
    return { file: publicFile(file), caminho: file.caminho };
  });

export const inspecoesUploadConfirmar = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator(fileId)
  .handler(async ({ context, data }) => {
    checkSetup();
    const client = db(context.supabase);
    const file = record.parse(
      result(
        await client
          .from("inspecoes_arquivos")
          .select("id,nome,papel,estado,bytes,mime,sha256,legenda,caminho,created_by")
          .eq("organization_id", data.organizationId)
          .eq("id", data.id)
          .single(),
      ),
    );
    if (
      file.created_by !== context.userId ||
      !file.caminho ||
      !file.mime ||
      !file.sha256 ||
      !file.bytes
    )
      throw new Error("Somente o autor autorizado pode confirmar este envio.");
    if (!["original_verificado", "falha_processamento", "envio_pendente"].includes(file.estado))
      throw new Error("O envio foi encerrado.");
    if (file.estado === "envio_pendente") {
      const allowed = result(
        await client.rpc("inspecoes_arquivo_pode_enviar", { p_caminho: file.caminho }),
      );
      if (allowed !== true)
        throw new Error("O acesso ou estado do levantamento mudou antes da confirmação.");
      const blob = result(await client.storage.from(bucket).download(file.caminho));
      if (!blob) throw new Error("Arquivo ainda não disponível no armazenamento.");
      if (blob.size !== file.bytes || blob.size > inspecoesLimiteEnvio)
        throw new Error("O tamanho dos bytes armazenados diverge do envio.");
      await validarArquivoInspecoes(new Uint8Array(await blob.arrayBuffer()), {
        tamanho: file.bytes,
        sha256: file.sha256,
        mime: file.mime,
      });
    }
    const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
    const verified = result(
      await db(supabaseAdmin).rpc("inspecoes_arquivo_atestar", {
        p_org: data.organizationId,
        p_id: data.id,
        p_actor: context.userId,
        p_bytes: file.bytes,
        p_sha256: file.sha256,
      }),
    );
    return publicFile(record.parse(verified));
  });

export const inspecoesUploadCancelar = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator(fileId)
  .handler(async ({ context, data }) => {
    const client = db(context.supabase);
    result(
      await client.rpc("inspecoes_arquivo_cancelar", { p_org: data.organizationId, p_id: data.id }),
    );
    return true;
  });
