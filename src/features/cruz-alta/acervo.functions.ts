import { createServerFn } from "@tanstack/react-start";
import type { SupabaseClient } from "@supabase/supabase-js";
import { z } from "zod";
import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";
import { nrResult } from "@/features/nr/nr.functions";
import { NR_ARQUIVO_BUCKET, validarBinarioNr, validarMetadataNr } from "@/features/nr/files";
import { nrFileLimits } from "@/features/nr/files.schemas";

const uuid = z.string().uuid();
const org = z.object({ organization_id: uuid });
const alvo = org.extend({ chave: z.string().trim().min(1).max(160) });
const escopo = z.enum(["individual", "estrutura", "conjunto", "unidade"]);
const vinculo = alvo.extend({ documento_id: uuid, escopo });
const operacao = alvo.extend({ operacao: uuid, arquivo_id: uuid });
const origem = z.object({
  sistema: z.enum(["google_drive", "anexo"]),
  id: z.string().min(1).max(500),
  pagina: z.number().int().positive(),
  autor: z.string().max(500).optional(),
  documento_chave: z.string().min(1).max(500).optional(),
  nota: z.string().max(4000).optional(),
});
const dimensao = z.object({
  valor: z.number().finite().nullable(),
  unidade: z.string().trim().min(1).max(32),
  fonte: z.string().trim().min(1).max(2000),
  confirmacao: z.enum(["medido", "cotado", "interpretado", "estimado", "pendente"]),
});
const ficha = z.object({
  id: uuid,
  chave: z.string(),
  titulo: z.string(),
  descricao: z.string(),
  observacoes: z.string(),
  version: z.number().int(),
  pode_editar: z.boolean(),
  pode_publicar: z.boolean(),
  cliente_id: uuid,
  unidade_id: uuid,
  atualizado_em: z.string(),
  atualizado_por: uuid,
  atributos: z.record(z.string(), dimensao),
  historico: z.array(z.object({ comando: z.string(), autor: uuid.nullable(), em: z.string() })),
  documentos: z.array(
    z.object({
      id: uuid,
      titulo: z.string(),
      escopo,
      objeto: z.string(),
      version: z.number().int(),
      descricao: z.string(),
      pode_corrigir: z.boolean(),
      vigente_id: uuid.nullable(),
      revisoes: z.array(
        z.object({
          id: uuid,
          rotulo: z.string(),
          data: z.string().nullable(),
          nota: z.string().nullable().optional(),
          autor: uuid.optional(),
          publicado_em: z.string().optional(),
          arquivo_id: uuid.nullable(),
          mime: z.string().nullable(),
        }),
      ),
    }),
  ),
});
export type CaFicha = z.infer<typeof ficha>;
const arquivo = z.object({
  id: uuid,
  estado: z.string(),
  nome: z.string(),
  caminho: z.string(),
  mime: z.string(),
  sha256: z.string(),
  tamanho: z.number(),
});
const idRevisao = z.object({ documento_id: uuid, revisao_id: uuid });
const db = (client: unknown) => client as SupabaseClient;
const params = (data: z.infer<typeof alvo>) => ({
  p_org: data.organization_id,
  p_chave: data.chave,
});
async function rpc(client: unknown, nome: string, argumentos: Record<string, unknown>) {
  const response = await db(client).rpc(nome, argumentos);
  if (response.error?.code === "40001")
    throw new Error(
      "Conflito de edição. Recarregue para comparar a versão atual com suas alterações.",
    );
  return nrResult(response);
}
async function adminPrivado() {
  if (!process.env["SUPABASE_SERVICE_ROLE_KEY"] || !process.env["SUPABASE_URL"]) {
    throw new Error("Integração não configurada: verificação privada do acervo.");
  }
  return db((await import("@/integrations/supabase/client.server")).supabaseAdmin);
}
export const caEstado = createServerFn({ method: "GET" })
  .middleware([requireSupabaseAuth])
  .inputValidator(org)
  .handler(async ({ context, data }) =>
    z
      .object({ provisionada: z.boolean(), pode_provisionar: z.boolean() })
      .parse(await rpc(context.supabase, "ca_estado", { p_org: data.organization_id })),
  );
export const caProvisionar = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator(org)
  .handler(async ({ context, data }) =>
    z
      .object({ quantidade: z.number() })
      .parse(await rpc(context.supabase, "ca_provisionar", { p_org: data.organization_id })),
  );
export const caFicha = createServerFn({ method: "GET" })
  .middleware([requireSupabaseAuth])
  .inputValidator(alvo)
  .handler(async ({ context, data }) =>
    ficha.parse(await rpc(context.supabase, "ca_ficha", params(data))),
  );
export const caSalvarFicha = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator(
    alvo.extend({
      version: z.number().int().positive(),
      alteracoes: z
        .object({
          titulo: z.string().trim().min(2).max(240).optional(),
          descricao: z.string().max(20000).optional(),
          observacoes: z.string().max(20000).optional(),
          atributos: z.record(z.string().min(1).max(100), dimensao).optional(),
        })
        .strict(),
    }),
  )
  .handler(async ({ context, data }) =>
    ficha.parse(
      await rpc(context.supabase, "ca_salvar", {
        ...params(data),
        p_version: data.version,
        p_dados: data.alteracoes,
      }),
    ),
  );
export const caDocumentosDisponiveis = createServerFn({ method: "GET" })
  .middleware([requireSupabaseAuth])
  .inputValidator(alvo)
  .handler(async ({ context, data }) =>
    z
      .array(z.object({ id: uuid, titulo: z.string() }))
      .parse(await rpc(context.supabase, "ca_disponiveis", params(data))),
  );
async function mudarVinculo(client: unknown, data: z.infer<typeof vinculo>, remover: boolean) {
  return ficha.parse(
    await rpc(client, "ca_vinculo", {
      ...params(data),
      p_documento: data.documento_id,
      p_escopo: data.escopo,
      p_remover: remover,
    }),
  );
}
export const caVincular = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator(vinculo)
  .handler(async ({ context, data }) => mudarVinculo(context.supabase, data, false));
export const caDesvincular = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator(vinculo)
  .handler(async ({ context, data }) => mudarVinculo(context.supabase, data, true));

export const caPreparar = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator(
    alvo.extend({
      operacao: uuid,
      nome: z.string().min(1).max(500),
      mime: z.string(),
      tamanho: z.number().int().positive(),
      sha256: z.string().regex(/^[0-9a-f]{64}$/),
    }),
  )
  .handler(async ({ context, data }) => {
    await adminPrivado();
    const { organization_id, chave, operacao, ...meta } = data;
    const limits = nrFileLimits.parse(
      await rpc(context.supabase, "nr_arquivo_limites", { p_org: organization_id }),
    );
    validarMetadataNr(meta, limits);
    const a = arquivo.parse(
      await rpc(context.supabase, "ca_preparar", {
        p_org: organization_id,
        p_chave: chave,
        p_operacao: operacao,
        p_meta: meta,
      }),
    );
    let token: string | null = null;
    if (a.estado !== "vinculado" && a.estado !== "verificado") {
      const signed = await db(context.supabase)
        .storage.from(NR_ARQUIVO_BUCKET)
        .createSignedUploadUrl(a.caminho, { upsert: false });
      if (signed.error || !signed.data)
        throw new Error("Envio privado indisponível. Retome a operação.");
      token = signed.data.token;
    }
    return { arquivo_id: a.id, bucket: NR_ARQUIVO_BUCKET, caminho: a.caminho, token };
  });
export const caPublicar = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator(
    operacao.extend({
      titulo: z.string().trim().min(2).max(240),
      rotulo: z.string().trim().min(1).max(100),
      data: z.string().date().nullable(),
      escopo,
      documento_id: uuid.optional(),
      anterior_id: uuid.optional(),
      categoria: z
        .enum(["individual", "conjunto", "layout", "foto", "video", "laudo", "outro"])
        .optional(),
      origem: origem.optional(),
    }),
  )
  .handler(async ({ context, data }) => {
    const { organization_id, chave, operacao, arquivo_id, ...dados } = data;
    const args = {
      p_org: organization_id,
      p_chave: chave,
      p_operacao: operacao,
      p_arquivo: arquivo_id,
    };
    const a = arquivo.parse(await rpc(context.supabase, "ca_envio", args));
    if (a.estado !== "vinculado" && a.estado !== "verificado") {
      const admin = await adminPrivado();
      const limites = nrFileLimits.parse(
        await rpc(context.supabase, "nr_arquivo_limites", { p_org: organization_id }),
      );
      const { data: bytes, error } = await admin.storage
        .from(NR_ARQUIVO_BUCKET)
        .download(a.caminho);
      if (error || !bytes)
        throw new Error("Transferência pendente. Retome o envio do mesmo arquivo.");
      try {
        await validarBinarioNr(new Uint8Array(await bytes.arrayBuffer()), a, limites);
      } catch (cause) {
        // O objeto privado foi lido integralmente e diverge do conteúdo declarado. O caminho
        // é exclusivo, não aceita sobrescrita e ainda não pode ter vínculos documentais.
        const retired = z.string().parse(await rpc(context.supabase, "ca_retirar_pendente", args));
        const removed = await admin.storage.from(NR_ARQUIVO_BUCKET).remove([retired]);
        if (removed.error)
          throw new Error(
            "Transferência inválida. A limpeza dos bytes pendentes falhou. Tente novamente.",
          );
        throw cause;
      }
      await rpc(admin, "ca_bytes_verificados", {
        p_org: organization_id,
        p_arquivo: a.id,
        p_autor: context.userId,
        p_sha256: a.sha256,
        p_tamanho: a.tamanho,
        p_mime: a.mime,
      });
    }
    return idRevisao.parse(await rpc(context.supabase, "ca_publicar", { ...args, p_dados: dados }));
  });
export const caLocalizarOrigem = createServerFn({ method: "GET" })
  .middleware([requireSupabaseAuth])
  .inputValidator(
    alvo.extend({
      documento_chave: z.string().min(1).max(500),
      source_id: z.string().min(1).max(500),
      sha256: z.string().regex(/^[a-f0-9]{64}$/),
    }),
  )
  .handler(async ({ context, data }) =>
    z
      .object({
        documento_id: uuid.nullable(),
        vigente_id: uuid.nullable(),
        revisao_id: uuid.nullable(),
      })
      .parse(
        await rpc(context.supabase, "ca_localizar_origem", {
          ...params(data),
          p_doc_chave: data.documento_chave,
          p_source: data.source_id,
          p_sha: data.sha256,
        }),
      ),
  );
export const caPrevia = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator(alvo.extend({ documento_id: uuid, revisao_id: uuid }))
  .handler(async ({ context, data }) => {
    const args = { ...params(data), p_doc: data.documento_id, p_rev: data.revisao_id };
    const shape = z.object({
      arquivo_id: uuid,
      caminho: z.string(),
      mime: z.string(),
      sha256: z.string(),
      tamanho: z.number(),
    });
    const meta = shape.parse(await rpc(context.supabase, "ca_previa", args));
    const admin = await adminPrivado();
    const signed = await admin.storage.from(NR_ARQUIVO_BUCKET).createSignedUrl(meta.caminho, 60);
    if (signed.error || !signed.data)
      throw new Error("Prévia temporariamente indisponível. Tente novamente.");
    const confirmado = shape.parse(await rpc(context.supabase, "ca_previa", args));
    if (confirmado.arquivo_id !== meta.arquivo_id)
      throw new Error("A revisão mudou durante a preparação da prévia.");
    return {
      url: signed.data.signedUrl,
      mime: meta.mime,
      sha256: meta.sha256,
      tamanho: meta.tamanho,
      arquivo_id: meta.arquivo_id,
      expira_em: new Date(Date.now() + 60000).toISOString(),
    };
  });

export const caMetadados = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator(
    alvo.extend({
      documento_id: uuid,
      version: z.number().int().positive(),
      titulo: z.string().trim().min(2).max(240),
      descricao: z.string().max(20000),
    }),
  )
  .handler(async ({ context, data }) =>
    ficha.parse(
      await rpc(context.supabase, "ca_metadados", {
        ...params(data),
        p_doc: data.documento_id,
        p_version: data.version,
        p_titulo: data.titulo,
        p_descricao: data.descricao,
      }),
    ),
  );
