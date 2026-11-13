import type { SupabaseClient } from "@supabase/supabase-js";
import { createServerFn } from "@tanstack/react-start";
import { z } from "zod";
import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";
import {
  inspecoesAnexoPapeis,
  inspecoesAnexoTipos,
  inspecoesUploadLimite,
  inspecoesUploadMimes,
  mimesPorPapel,
  validarArquivoInspecoes,
  type InspecoesAnexoAlvo,
} from "./arquivo-formatos";
import type { InspecoesArquivo } from "./ui-contract";

export const inspecoesLimiteEnvio = inspecoesUploadLimite;
const bucket = "inspecoes-acervo";
const id = z.string().uuid();
const organization = z.object({ organizationId: id });
const fileId = organization.extend({ id });
const target = z.object({ tipo: z.enum(inspecoesAnexoTipos), id });
const scope = organization.extend({ clienteId: id.optional(), unidadeId: id.optional() });
const columns =
  "id,nome,papel,estado,bytes,mime,sha256,legenda,caminho,created_by,miniatura_caminho,previa_caminho,ordem";
const targetColumn = {
  levantamento: "levantamento_id",
  registro: "registro_id",
  contrato: "contrato_id",
  unidade: "unidade_id",
} as const;
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
  miniatura_caminho: z.string().nullable(),
  previa_caminho: z.string().nullable(),
  ordem: z.number().int().nullable(),
  apresentacao_versao: z.number().int().optional(),
});
const event = z.object({
  id: z.number(),
  arquivo_nome: z.string(),
  autor_nome: z.string().nullable(),
  evento: z.string(),
  ocorrido_em: z.string(),
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

function publicFile(
  file: z.infer<typeof record>,
  userId: string,
): InspecoesArquivo & { autoriaPropria: boolean } {
  return {
    id: file.id,
    nome: file.nome,
    papel: file.papel,
    estado: file.estado,
    bytes: file.bytes,
    mime: file.mime,
    sha256: file.sha256,
    legenda: file.legenda,
    ordem: file.ordem,
    apresentacaoVersao: file.apresentacao_versao ?? 0,
    possuiMiniatura: !!file.miniatura_caminho,
    possuiPrevia: !!file.previa_caminho,
    autoriaPropria: userId === file.created_by,
  };
}

function checkSetup() {
  if (!process.env["SUPABASE_SERVICE_ROLE_KEY"])
    throw new Error("Integração não configurada para confirmar os bytes do envio.");
}

async function listTarget(
  client: SupabaseClient,
  data: z.infer<typeof scope> & { alvo: InspecoesAnexoAlvo; pagina?: number | undefined },
  userId: string,
) {
  const { alvo } = data;
  let query = client
    .from("inspecoes_arquivos_apresentados")
    .select(columns + ",apresentacao_versao", { count: "exact" })
    .eq("organization_id", data.organizationId)
    .eq(targetColumn[alvo.tipo], alvo.id)
    .neq("estado", "envio_cancelado");
  let history = client
    .from("inspecoes_arquivo_eventos")
    .select("id,arquivo_nome,autor_nome,evento,ocorrido_em")
    .eq("organization_id", data.organizationId)
    .eq(targetColumn[alvo.tipo], alvo.id);
  if (data.unidadeId) {
    query = query.eq("unidade_id", data.unidadeId);
    history = history.eq("unidade_id", data.unidadeId);
  }
  if (data.clienteId) {
    query = query.eq("cliente_id", data.clienteId);
    history = history.eq("cliente_id", data.clienteId);
  }
  if (alvo.tipo === "unidade") {
    query = query.eq("anexo_unidade", true);
    history = history.eq("anexo_unidade", true);
  }
  const pageSize = 50;
  const start = (data.pagina ?? 0) * pageSize;
  const [response, events] = await Promise.all([
    query
      .order("ordem")
      .order("created_at")
      .order("id")
      .range(start, start + pageSize - 1),
    history.order("ocorrido_em", { ascending: false }).order("id", { ascending: false }).limit(100),
  ]);
  return {
    files: z
      .array(record)
      .parse(result(response))
      .map((file) => publicFile(file, userId)),
    history: z.array(event).parse(result(events)),
    total: response.count ?? 0,
    pageSize,
  };
}

export const inspecoesAnexosPorAlvo = createServerFn({ method: "GET" })
  .middleware([requireSupabaseAuth])
  .inputValidator(
    scope.extend({ alvo: target, pagina: z.number().int().min(0).max(10_000).optional() }),
  )
  .handler(({ context, data }) => listTarget(db(context.supabase), data, context.userId));

export const inspecoesUploadReservar = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator(
    organization.extend({
      alvo: target,
      chave: id,
      nome: z.string().trim().min(1).max(255),
      papel: z.enum(inspecoesAnexoPapeis),
      mime: z.enum(inspecoesUploadMimes),
      bytes: z.number().int().min(1).max(inspecoesLimiteEnvio),
      sha256: z.string().regex(/^[a-f0-9]{64}$/),
      legenda: z.string().trim().max(2000).optional(),
    }),
  )
  .handler(async ({ context, data }) => {
    checkSetup();
    if (!mimesPorPapel(data.papel).includes(data.mime))
      throw new Error("O formato do arquivo não corresponde ao papel escolhido.");
    const client = db(context.supabase);
    const file = record.parse(
      result(
        await client.rpc("inspecoes_arquivo_reservar_alvo", {
          p_org: data.organizationId,
          p_tipo: data.alvo.tipo,
          p_alvo: data.alvo.id,
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
    return { file: publicFile(file, context.userId), caminho: file.caminho };
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
          .select(columns)
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

    const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
    const { gerarDerivadosInspecoes, lerArquivoLimitado } =
      await import("./arquivo-derivados.server");
    const needsPreview = file.papel === "foto" && (!file.miniatura_caminho || !file.previa_caminho);
    let original: Uint8Array | undefined;
    if (file.estado === "envio_pendente" || (needsPreview && file.bytes <= 10 * 1024 * 1024)) {
      if (file.estado === "envio_pendente") {
        const allowed = result(
          await client.rpc("inspecoes_arquivo_pode_enviar", { p_caminho: file.caminho }),
        );
        if (allowed !== true)
          throw new Error("O acesso ou estado do registro mudou antes da confirmação.");
      }
      if (file.bytes > inspecoesLimiteEnvio)
        throw new Error("O tamanho do arquivo armazenado excede o limite de envio.");
      const stream = result(
        await client.storage
          .from(bucket)
          .download(file.caminho, {}, { signal: AbortSignal.timeout(15_000), cache: "no-store" })
          .asStream(),
      );
      original = await lerArquivoLimitado(stream, file.bytes);
      await validarArquivoInspecoes(original, {
        tamanho: file.bytes,
        sha256: file.sha256,
        mime: file.mime,
      });
    }
    const admin = db(supabaseAdmin);
    const verified = record.parse(
      result(
        await admin.rpc("inspecoes_arquivo_atestar", {
          p_org: data.organizationId,
          p_id: data.id,
          p_actor: context.userId,
          p_bytes: file.bytes,
          p_sha256: file.sha256,
        }),
      ),
    );
    if (!needsPreview || (verified.miniatura_caminho && verified.previa_caminho))
      return publicFile(verified, context.userId);
    const derivatives = original
      ? await gerarDerivadosInspecoes(
          { ...verified, caminho: file.caminho, mime: file.mime },
          original,
        )
      : {};
    const processed = record.parse(
      result(
        await admin.rpc("inspecoes_arquivo_derivados", {
          p_org: data.organizationId,
          p_id: data.id,
          p_actor: context.userId,
          p_derivados: derivatives,
        }),
      ),
    );
    return publicFile(processed, context.userId);
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
