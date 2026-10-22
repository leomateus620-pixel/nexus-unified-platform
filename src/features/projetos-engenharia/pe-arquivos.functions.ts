import { createServerFn } from "@tanstack/react-start";
import { getRequest, setResponseHeader } from "@tanstack/react-start/server";
import type { SupabaseClient } from "@supabase/supabase-js";
import { z } from "zod";

import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";
import { validarBinario } from "@/features/operacao/files";

export const peArquivoSchema = z.object({
  id: z.string().uuid(),
  organization_id: z.string().uuid(),
  projeto_id: z.string().uuid(),
  versao_id: z.string().uuid(),
  nome: z.string(),
  mime: z.enum(["application/pdf", "image/png", "image/jpeg", "image/webp"]),
  tamanho: z.number().int().positive(),
  sha256: z.string().regex(/^[a-f0-9]{64}$/),
  caminho: z.string(),
  estado: z.enum(["pendente", "enviado", "vinculado", "cancelado"]),
  created_by: z.string().uuid(),
  created_at: z.string(),
  confirmado_em: z.string().nullable(),
});
export type PeArquivo = z.infer<typeof peArquivoSchema>;
const idInput = z.object({ organization_id: z.string().uuid(), id: z.string().uuid() });
const versaoInput = z.object({ organization_id: z.string().uuid(), versao_id: z.string().uuid() });
function dbClient(db: unknown) {
  return db as SupabaseClient;
}
function resultado<T>(r: { data: T; error: { message: string; code?: string } | null }): T {
  if (r.error) {
    if (r.error.code === "42501") throw new Error("Arquivo indisponível para seu acesso atual.");
    if (["PGRST202", "42P01"].includes(r.error.code ?? ""))
      throw new Error(
        "O banco ainda não recebeu o fluxo de arquivos de Projetos de Engenharia (migração 0017).",
      );
    throw new Error(r.error.message);
  }
  return r.data;
}
function exigirConfirmacaoConfigurada() {
  if (!process.env["SUPABASE_SERVICE_ROLE_KEY"])
    throw new Error(
      "Confirmação de arquivos não configurada: falta a credencial de serviço no servidor. A edição documental continua disponível.",
    );
}
async function lerArquivo(db: SupabaseClient, org: string, id: string): Promise<PeArquivo> {
  return peArquivoSchema.parse(
    resultado(
      await db.from("pe_arquivos").select("*").eq("organization_id", org).eq("id", id).single(),
    ),
  );
}
async function prepararToken(db: SupabaseClient, arquivo: PeArquivo) {
  if (arquivo.estado === "vinculado") return { arquivo, token: null };
  if (
    !resultado(
      await db.rpc("pe_pode_enviar_arquivo", { _org: arquivo.organization_id, _id: arquivo.id }),
    )
  )
    throw new Error(
      "O arquivo exige seu autor, uma versão em rascunho e um projeto ativo para retomar.",
    );
  const assinado = resultado(
    await db.storage
      .from("nexus-operacional")
      .createSignedUploadUrl(arquivo.caminho, { upsert: false }),
  );
  if (!assinado)
    throw new Error(
      "Não foi possível preparar o envio. Se o arquivo já foi enviado, use Reverificar armazenamento.",
    );
  return { arquivo, token: assinado.token };
}

/** Consulta por ID para revalidar um original, independente da página/lista aberta. */
export const obterArquivoPe = createServerFn({ method: "GET" })
  .middleware([requireSupabaseAuth])
  .inputValidator((input) => idInput.parse(input))
  .handler(async ({ context, data }) => {
    setResponseHeader("Cache-Control", "private, no-store");
    const db = dbClient(context.supabase);
    const signal = getRequest().signal;
    const response = await db
      .from("pe_arquivos")
      .select(
        "id,organization_id,projeto_id,versao_id,nome,mime,tamanho,sha256,caminho,estado,created_by,created_at,confirmado_em",
      )
      .eq("organization_id", data.organization_id)
      .eq("id", data.id)
      .abortSignal(signal)
      .maybeSingle();
    if (
      ["42501", "PGRST116"].includes(response.error?.code ?? "") ||
      (!response.error && (response.data === null || response.data === undefined))
    )
      throw new Error("Arquivo indisponível para seu acesso atual.");
    const arquivo = peArquivoSchema.parse(resultado(response));
    if (
      arquivo.organization_id !== data.organization_id ||
      arquivo.id !== data.id ||
      arquivo.estado !== "vinculado"
    )
      throw new Error("Arquivo indisponível para seu acesso atual.");
    // Autoriza novamente o pai depois da leitura: a lista limitada não prova acesso atual.
    const parent = await db
      .rpc("pe_ler_projeto", { _org: data.organization_id, _id: arquivo.projeto_id })
      .abortSignal(signal);
    if (["42501", "PGRST116"].includes(parent.error?.code ?? ""))
      throw new Error("Arquivo indisponível para seu acesso atual.");
    if (resultado(parent) !== true) throw new Error("Arquivo indisponível para seu acesso atual.");
    return arquivo;
  });

export const listarArquivosPe = createServerFn({ method: "GET" })
  .middleware([requireSupabaseAuth])
  .inputValidator((input) => versaoInput.parse(input))
  .handler(async ({ context, data }) => {
    const db = dbClient(context.supabase);
    const signal = getRequest().signal;
    const versao = z
      .object({ id: z.string().uuid(), projeto_id: z.string().uuid(), estado: z.string() })
      .nullable()
      .parse(
        resultado(
          await db
            .from("pe_versoes")
            .select("id,projeto_id,estado")
            .eq("organization_id", data.organization_id)
            .eq("id", data.versao_id)
            .abortSignal(signal)
            .maybeSingle(),
        ),
      );
    if (!versao) throw new Error("Arquivo indisponível para seu acesso atual.");
    const projeto = z
      .object({ id: z.string().uuid(), arquivado: z.boolean() })
      .nullable()
      .parse(
        resultado(
          await db
            .from("pe_projetos")
            .select("id,arquivado")
            .eq("organization_id", data.organization_id)
            .eq("id", versao.projeto_id)
            .abortSignal(signal)
            .maybeSingle(),
        ),
      );
    if (!projeto) throw new Error("Arquivo indisponível para seu acesso atual.");
    const arquivos = peArquivoSchema
      .array()
      .parse(
        resultado(
          await db
            .from("pe_arquivos")
            .select(
              "id,organization_id,projeto_id,versao_id,nome,mime,tamanho,sha256,caminho,estado,created_by,created_at,confirmado_em",
            )
            .eq("organization_id", data.organization_id)
            .eq("versao_id", data.versao_id)
            .neq("estado", "cancelado")
            .order("created_at", { ascending: false })
            .abortSignal(signal)
            .limit(100),
        ) ?? [],
      );
    // Um SELECT de arquivos vazio também pode ser uma recusa silenciosa do RLS.
    // Revalidar o pai evita tratar revogação como lista autorizada sem originais.
    const podeLer = resultado(
      await db
        .rpc("pe_ler_projeto", { _org: data.organization_id, _id: projeto.id })
        .abortSignal(signal),
    );
    if (podeLer !== true) throw new Error("Arquivo indisponível para seu acesso atual.");
    const podeGerir = resultado(
      await db
        .rpc("operacao_pode", {
          _org: data.organization_id,
          _acao: "gerir_projetos_engenharia",
        })
        .abortSignal(signal),
    );
    return {
      rows: arquivos.map((a) => ({ ...a, meu_envio: a.created_by === context.userId })),
      permissoes: {
        ler: true as const,
        adicionar: podeGerir === true && versao.estado === "rascunho" && !projeto.arquivado,
      },
    };
  });

export const prepararArquivoPe = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((input) =>
    versaoInput
      .extend({
        chave: z.string().uuid(),
        nome: z.string().min(1).max(240),
        mime: peArquivoSchema.shape.mime,
        tamanho: z
          .number()
          .int()
          .positive()
          .max(20 * 1024 * 1024),
        sha256: z.string().regex(/^[a-f0-9]{64}$/),
      })
      .parse(input),
  )
  .handler(async ({ context, data }) => {
    exigirConfirmacaoConfigurada();
    const db = dbClient(context.supabase);
    const { organization_id, versao_id, chave, ...metadados } = data;
    const preparada = peArquivoSchema.parse(
      resultado(
        await db.rpc("pe_preparar_arquivo", {
          _org: organization_id,
          _versao: versao_id,
          _chave: chave,
          _dados: metadados,
        }),
      ),
    );
    return prepararToken(db, await lerArquivo(db, organization_id, preparada.id));
  });

export const retomarArquivoPe = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((input) => idInput.parse(input))
  .handler(async ({ context, data }) => {
    exigirConfirmacaoConfigurada();
    const db = dbClient(context.supabase);
    return prepararToken(db, await lerArquivo(db, data.organization_id, data.id));
  });

export const confirmarArquivoPe = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((input) => idInput.parse(input))
  .handler(async ({ context, data }) => {
    exigirConfirmacaoConfigurada();
    const db = dbClient(context.supabase);
    const arquivo = await lerArquivo(db, data.organization_id, data.id);
    if (arquivo.estado === "vinculado") return arquivo;
    if (
      arquivo.created_by !== context.userId ||
      !resultado(
        await db.rpc("pe_pode_enviar_arquivo", { _org: data.organization_id, _id: data.id }),
      )
    )
      throw new Error("Envio indisponível para confirmação neste contexto.");
    // O usuário/RLS autoriza o pai antes de qualquer acesso privilegiado ao binário.
    const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
    const admin = dbClient(supabaseAdmin);
    const blob = resultado(await admin.storage.from("nexus-operacional").download(arquivo.caminho));
    if (!blob)
      throw new Error(
        "O arquivo ainda não está no armazenamento. Selecione o mesmo original para retomar.",
      );
    await validarBinario(new Uint8Array(await blob.arrayBuffer()), arquivo);
    if (
      !resultado(
        await db.rpc("pe_pode_enviar_arquivo", { _org: data.organization_id, _id: data.id }),
      )
    )
      throw new Error("O acesso ou estado da revisão mudou durante a verificação.");
    resultado(
      await admin.rpc("pe_confirmar_arquivo", {
        _org: data.organization_id,
        _id: data.id,
        _autor: context.userId,
        _sha256: arquivo.sha256,
      }),
    );
    return lerArquivo(db, data.organization_id, data.id);
  });

export const cancelarArquivoPe = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((input) =>
    idInput
      .extend({ chave: z.string().uuid(), motivo: z.string().trim().min(5).max(2000) })
      .parse(input),
  )
  .handler(async ({ context, data }) =>
    peArquivoSchema.parse(
      resultado(
        await dbClient(context.supabase).rpc("pe_cancelar_arquivo", {
          _org: data.organization_id,
          _id: data.id,
          _chave: data.chave,
          _motivo: data.motivo,
        }),
      ),
    ),
  );

export const baixarArquivoPe = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((input) => idInput.parse(input))
  .handler(async ({ context, data }) => {
    const db = dbClient(context.supabase);
    const arquivo = await lerArquivo(db, data.organization_id, data.id);
    if (arquivo.estado !== "vinculado")
      throw new Error("Confirme o armazenamento antes de baixar o original.");
    const assinado = resultado(
      await db.storage
        .from("nexus-operacional")
        .createSignedUrl(arquivo.caminho, 60, { download: arquivo.nome }),
    );
    if (!assinado) throw new Error("Download indisponível. Tente novamente.");
    return { url: assinado.signedUrl };
  });
