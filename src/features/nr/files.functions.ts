import { createServerFn } from "@tanstack/react-start";
import { getRequest } from "@tanstack/react-start/server";
import type { SupabaseClient } from "@supabase/supabase-js";
import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";
import { nrResult } from "./nr.functions";
import { NR_ARQUIVO_BUCKET, validarBinarioNr, validarMetadataNr, type NrArquivo } from "./files";
import * as s from "./files.schemas";
const db = (value: unknown) => value as SupabaseClient;
function configurado() {
  if (!process.env["SUPABASE_SERVICE_ROLE_KEY"] || !process.env["SUPABASE_URL"])
    throw new Error(
      "Integração não configurada: a confirmação privada de arquivos exige a credencial de serviço no servidor. Nenhum arquivo foi declarado migrado.",
    );
}
async function obter(client: SupabaseClient, org: string, id: string) {
  return s.nrFileRow.parse(
    nrResult(
      await client.from("nr_arquivos").select("*").eq("organization_id", org).eq("id", id).single(),
    ),
  );
}
async function podeEnviar(client: SupabaseClient, org: string, id: string) {
  return nrResult(await client.rpc("nr_arquivo_pode_enviar", { p_org: org, p_id: id })) === true;
}
async function token(client: SupabaseClient, arquivo: NrArquivo, user: string) {
  if (arquivo.created_by !== user) throw new Error("Somente o autor pode retomar este envio.");
  if (arquivo.estado === "vinculado")
    return { arquivo, token: null, bucket: NR_ARQUIVO_BUCKET, caminho: arquivo.caminho };
  if (!(await podeEnviar(client, arquivo.organization_id, arquivo.id)))
    throw new Error("O acesso ou estado do destino não permite retomar o upload.");
  const { data, error } = await client.storage
    .from(NR_ARQUIVO_BUCKET)
    .createSignedUploadUrl(arquivo.caminho, { upsert: false });
  if (error || !data)
    throw new Error("Não foi possível preparar a transferência privada. Tente retomar o envio.");
  return { arquivo, token: data.token, bucket: NR_ARQUIVO_BUCKET, caminho: arquivo.caminho };
}
export const nrArquivoLimites = createServerFn({ method: "GET" })
  .middleware([requireSupabaseAuth])
  .inputValidator(s.nrFileOrg)
  .handler(async ({ context, data }) =>
    s.nrFileLimits.parse(
      nrResult(
        await db(context.supabase)
          .rpc("nr_arquivo_limites", { p_org: data.organization_id })
          .abortSignal(getRequest().signal),
      ),
    ),
  );
export const nrArquivosListar = createServerFn({ method: "GET" })
  .middleware([requireSupabaseAuth])
  .inputValidator(s.nrFileList)
  .handler(async ({ context, data }) => {
    const { organization_id, norma, ...filters } = data;
    return s.nrFileListResult.parse(
      nrResult(
        await db(context.supabase)
          .rpc("nr_arquivo_listar", {
            p_org: organization_id,
            p_norma: norma,
            p_filtros: Object.fromEntries(
              Object.entries(filters).filter(([, v]) => v !== undefined),
            ),
          })
          .abortSignal(getRequest().signal),
      ),
    );
  });
export const nrArquivoPreparar = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator(s.nrFilePrepare)
  .handler(async ({ context, data }) => {
    configurado();
    const client = db(context.supabase);
    const limites = s.nrFileLimits.parse(
      nrResult(await client.rpc("nr_arquivo_limites", { p_org: data.organization_id })),
    );
    validarMetadataNr(data, limites);
    const { organization_id, norma, chave, ...metadata } = data;
    const prepared = s.nrFileRow.parse(
      nrResult(
        await client.rpc("nr_arquivo_preparar", {
          p_org: organization_id,
          p_chave: chave,
          p_dados: {
            ...Object.fromEntries(Object.entries(metadata).filter(([, v]) => v !== undefined)),
            normas: [norma],
          },
        }),
      ),
    );
    return token(client, await obter(client, organization_id, prepared.id), context.userId);
  });
export const nrArquivoRetomar = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator(s.nrFileId)
  .handler(async ({ context, data }) => {
    configurado();
    const client = db(context.supabase);
    return token(client, await obter(client, data.organization_id, data.id), context.userId);
  });
export const nrArquivoConfirmar = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator(s.nrFileId)
  .handler(async ({ context, data }) => {
    const client = db(context.supabase),
      a = await obter(client, data.organization_id, data.id);
    if (
      a.created_by !== context.userId ||
      (a.estado !== "vinculado" && !(await podeEnviar(client, data.organization_id, data.id)))
    )
      throw new Error("O acesso ou estado do destino não permite confirmar o envio.");
    configurado();
    const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
    const admin = db(supabaseAdmin);
    if (a.estado !== "vinculado") {
      const limites = s.nrFileLimits.parse(
        nrResult(await client.rpc("nr_arquivo_limites", { p_org: data.organization_id })),
      );
      const { data: blob, error } = await admin.storage.from(NR_ARQUIVO_BUCKET).download(a.caminho);
      if (error || !blob)
        throw new Error(
          "Arquivo ainda não disponível no acervo. Retome a transferência ou tente confirmar novamente.",
        );
      try {
        await validarBinarioNr(new Uint8Array(await blob.arrayBuffer()), a, limites);
      } catch (error) {
        await admin.rpc("nr_arquivo_falhar", {
          p_org: data.organization_id,
          p_id: data.id,
          p_autor: context.userId,
          p_motivo: error instanceof Error ? error.message : "Verificação dos bytes falhou.",
        });
        throw error;
      }
      if (!(await podeEnviar(client, data.organization_id, data.id)))
        throw new Error(
          "O acesso ou estado do destino mudou durante a verificação. O arquivo permanece pendente.",
        );
    }
    // A RPC privilegiada revalida papéis/associação com locks; inclusive em retry já vinculado.
    nrResult(
      await admin.rpc("nr_arquivo_confirmar", {
        p_org: data.organization_id,
        p_id: data.id,
        p_autor: context.userId,
        p_sha256: a.sha256,
        p_tamanho: a.tamanho,
        p_mime: a.mime,
      }),
    );
    return obter(client, data.organization_id, data.id);
  });
export const nrArquivoBaixar = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator(s.nrFileDownload)
  .handler(async ({ context, data }) => {
    const client = db(context.supabase),
      arquivo = await obter(client, data.organization_id, data.id);
    if (
      nrResult(
        await client.rpc("nr_arquivo_ler", { p_org: data.organization_id, p_id: data.id }),
      ) !== true
    )
      throw new Error("Arquivo indisponível para download no acesso atual.");
    if (data.visualizar && arquivo.mime !== "application/pdf" && !arquivo.mime.startsWith("image/"))
      throw new Error(
        "Este formato preserva o original para download; a pré-visualização não executa arquivos Office.",
      );
    const { data: signed, error } = await client.storage
      .from(NR_ARQUIVO_BUCKET)
      .createSignedUrl(arquivo.caminho, 60, data.visualizar ? {} : { download: arquivo.nome });
    if (error || !signed) throw new Error("Download privado indisponível. Tente novamente.");
    if (
      nrResult(
        await client.rpc("nr_arquivo_ler", { p_org: data.organization_id, p_id: data.id }),
      ) !== true
    )
      throw new Error("Acesso revogado durante a preparação do download.");
    return {
      url: signed.signedUrl,
      expira_em: new Date(Date.now() + 60000).toISOString(),
      arquivo,
    };
  });
export const nrArquivoCancelar = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator(s.nrFileCancel)
  .handler(async ({ context, data }) =>
    s.nrFileRow.parse(
      nrResult(
        await db(context.supabase).rpc("nr_arquivo_cancelar", {
          p_org: data.organization_id,
          p_id: data.id,
          p_motivo: data.motivo,
          p_chave: data.chave,
        }),
      ),
    ),
  );
export const nrArquivoConsumo = createServerFn({ method: "GET" })
  .middleware([requireSupabaseAuth])
  .inputValidator(s.nrFileOrg)
  .handler(async ({ context, data }) =>
    s.nrFileConsumption.parse(
      nrResult(
        await db(context.supabase)
          .rpc("nr_arquivo_consumo", { p_org: data.organization_id })
          .abortSignal(getRequest().signal),
      ),
    ),
  );
export const nrArquivoAlterar = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator(s.nrFileChange)
  .handler(async ({ context, data }) =>
    s.nrFileRow.parse(
      nrResult(
        await db(context.supabase).rpc("nr_arquivo_alterar", {
          p_org: data.organization_id,
          p_id: data.id,
          p_expected_version: data.expected_version,
          p_chave: data.chave,
          p_comando: data.comando,
          p_dados: data.dados,
        }),
      ),
    ),
  );
