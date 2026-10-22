import { createServerFn } from "@tanstack/react-start";
import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";
import {
  anexoPai,
  anexoRow,
  anexosListaSchema,
  cancelarAnexoInput,
  fileInput,
  uploadInput,
} from "./schemas";
import { operationalDb, result } from "./operacao.functions";
import { validarBinario } from "./files";

export const listarAnexos = createServerFn({ method: "GET" })
  .middleware([requireSupabaseAuth])
  .inputValidator(anexoPai)
  .handler(async ({ context, data }) => {
    const { organization_id, ...pai } = data;
    return anexosListaSchema.parse(
      result(
        await operationalDb(context.supabase).rpc("listar_anexos_operacionais", {
          _org: organization_id,
          _pai: pai,
        }),
      ),
    );
  });

function exigirConfirmacaoConfigurada() {
  if (!process.env["SUPABASE_SERVICE_ROLE_KEY"])
    throw new Error(
      "Confirmação de arquivos não configurada: falta a credencial de serviço no servidor. O cadastro permanece disponível.",
    );
}
async function podeEnviar(db: ReturnType<typeof operationalDb>, org: string, id: string) {
  return result(await db.rpc("operacao_pode_enviar_anexo", { _org: org, _id: id })) === true;
}
async function prepararToken(
  db: ReturnType<typeof operationalDb>,
  a: ReturnType<typeof anexoRow.parse>,
) {
  if (a.estado === "vinculado") return { anexo: a, token: null };
  if (!(await podeEnviar(db, a.organization_id, a.id)))
    throw new Error("O acesso ou estado do registro não permite retomar este envio.");
  const signed = result(
    await db.storage.from("nexus-operacional").createSignedUploadUrl(a.caminho, { upsert: false }),
  );
  if (!signed) throw new Error("Não foi possível preparar o envio. Tente novamente.");
  return { anexo: a, token: signed.token };
}

export const prepararUpload = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator(uploadInput)
  .handler(async ({ context, data }) => {
    exigirConfirmacaoConfigurada();
    const db = operationalDb(context.supabase);
    const { organization_id, ...pai } = data.pai;
    const prepared = anexoRow.parse(
      result(
        await db.rpc("preparar_anexo_operacional", {
          _org: organization_id,
          _chave: data.chave,
          _dados: {
            ...pai,
            nome: data.nome,
            mime: data.mime,
            tamanho: data.tamanho,
            sha256: data.sha256,
          },
        }),
      ),
    );
    // O resultado idempotente guarda o estado da criação; consulta o estado atual antes de retomar.
    const a = anexoRow.parse(
      result(
        await db
          .from("anexos")
          .select("*")
          .eq("organization_id", organization_id)
          .eq("id", prepared.id)
          .single(),
      ),
    );
    return prepararToken(db, a);
  });

export const retomarUpload = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator(fileInput)
  .handler(async ({ context, data }) => {
    exigirConfirmacaoConfigurada();
    const db = operationalDb(context.supabase);
    const raw = result(
      await db
        .from("anexos")
        .select("*")
        .eq("organization_id", data.organization_id)
        .eq("id", data.id)
        .single(),
    );
    if (!raw || raw.created_by !== context.userId)
      throw new Error("Somente o autor pode retomar este envio.");
    const a = anexoRow.parse(raw);
    return prepararToken(db, a);
  });

export const confirmarUpload = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator(fileInput)
  .handler(async ({ context, data }) => {
    const db = operationalDb(context.supabase);
    // Primeiro autoriza pelo cliente do usuário/RLS, antes de usar service role.
    const a = anexoRow.parse(
      result(
        await db
          .from("anexos")
          .select("*")
          .eq("organization_id", data.organization_id)
          .eq("id", data.id)
          .single(),
      ),
    );
    if (a.estado !== "vinculado" && !(await podeEnviar(db, data.organization_id, data.id)))
      throw new Error("O acesso ou estado do registro não permite confirmar este envio.");
    exigirConfirmacaoConfigurada();
    const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
    const admin = operationalDb(supabaseAdmin);
    if (a.estado !== "vinculado") {
      const blob = result(await admin.storage.from("nexus-operacional").download(a.caminho));
      if (!blob) throw new Error("Arquivo ainda não disponível no armazenamento.");
      await validarBinario(new Uint8Array(await blob.arrayBuffer()), a);
      // Leitura não autoriza envio; o pai pode ter fechado ou mudado de custodiante.
      if (!(await podeEnviar(db, data.organization_id, data.id)))
        throw new Error("O acesso ou estado do registro mudou durante a verificação.");
    }
    // Inclusive retry já vinculado: o comando revalida autor, leitura e locks atuais.
    result(
      await admin.rpc("confirmar_anexo_operacional", {
        _org: data.organization_id,
        _id: data.id,
        _autor: context.userId,
        _sha256: a.sha256,
      }),
    );
    return anexoRow.parse(
      result(
        await db
          .from("anexos")
          .select("*")
          .eq("organization_id", data.organization_id)
          .eq("id", data.id)
          .single(),
      ),
    );
  });

export const cancelarAnexo = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator(cancelarAnexoInput)
  .handler(async ({ context, data }) =>
    anexoRow.parse(
      result(
        await operationalDb(context.supabase).rpc("cancelar_anexo_operacional", {
          _org: data.organization_id,
          _id: data.id,
          _chave: data.chave,
          _motivo: data.motivo,
        }),
      ),
    ),
  );

export const baixarAnexo = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator(fileInput)
  .handler(async ({ context, data }) => {
    const db = operationalDb(context.supabase);
    const a = anexoRow.parse(
      result(
        await db
          .from("anexos")
          .select("*")
          .eq("organization_id", data.organization_id)
          .eq("id", data.id)
          .eq("estado", "vinculado")
          .single(),
      ),
    );
    // URL não vai para cache persistido; expira em 60 s. Não concede acesso público ao bucket.
    const signed = result(
      await db.storage
        .from("nexus-operacional")
        .createSignedUrl(a.caminho, 60, { download: a.nome }),
    );
    if (!signed) throw new Error("Download indisponível. Tente novamente.");
    return { url: signed.signedUrl };
  });
