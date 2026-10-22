import { createServerFn } from "@tanstack/react-start";
import type { SupabaseClient } from "@supabase/supabase-js";
import { z } from "zod";

import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";
import { validarBinario } from "@/features/operacao/files";
import { levantamentoArquivoRow } from "./schemas";

export type LevantamentoArquivo = z.infer<typeof levantamentoArquivoRow>;
const idInput = z.object({ organization_id: z.string().uuid(), id: z.string().uuid() });
const destinoInput = z.object({
  organization_id: z.string().uuid(),
  levantamento_id: z.string().uuid(),
  revisao_id: z.string().uuid(),
  ponto_id: z.string().uuid().nullable(),
});
const formato = z.enum(["application/pdf", "image/png", "image/jpeg", "image/webp"]);
const arquivoInput = destinoInput.extend({
  chave: z.string().uuid(),
  nome: z.string().min(1).max(240),
  mime: formato,
  tamanho: z
    .number()
    .int()
    .positive()
    .max(20 * 1024 * 1024),
  sha256: z.string().regex(/^[a-f0-9]{64}$/),
});

function client(db: unknown) {
  return db as SupabaseClient;
}
function resultado<T>(r: { data: T; error: { message: string; code?: string } | null }): T {
  if (r.error) {
    if (["42501", "PGRST116"].includes(r.error.code ?? ""))
      throw new Error("Arquivo ou levantamento indisponível para seu acesso atual.");
    if (["PGRST202", "42P01"].includes(r.error.code ?? ""))
      throw new Error("O banco ainda não recebeu o fluxo de evidências de Levantamentos Técnicos.");
    throw new Error(r.error.message);
  }
  return r.data;
}
function exigirConfirmacaoConfigurada() {
  if (!process.env["SUPABASE_SERVICE_ROLE_KEY"])
    throw new Error(
      "Confirmação de evidências não configurada: falta a credencial de serviço no servidor. Os pontos e as medidas continuam disponíveis.",
    );
}
async function exigirLeitura(db: SupabaseClient, org: string, levantamento: string) {
  if (!resultado(await db.rpc("lev_ler", { _org: org, _id: levantamento })))
    throw new Error("Levantamento indisponível para seu acesso atual.");
}
async function lerArquivo(db: SupabaseClient, org: string, id: string) {
  return levantamentoArquivoRow.parse(
    resultado(
      await db
        .from("levantamento_arquivos")
        .select("*")
        .eq("organization_id", org)
        .eq("id", id)
        .single(),
    ),
  );
}
async function podeEnviar(db: SupabaseClient, arquivo: LevantamentoArquivo) {
  return !!resultado(
    await db.rpc("lev_pode_enviar_arquivo", {
      _org: arquivo.organization_id,
      _id: arquivo.id,
    }),
  );
}
async function prepararToken(db: SupabaseClient, arquivo: LevantamentoArquivo) {
  if (arquivo.estado === "vinculado") return { arquivo, token: null };
  if (!(await podeEnviar(db, arquivo)))
    throw new Error(
      "Retomada exige o autor do envio, acesso ao levantamento e revisão em coleta ou rascunho.",
    );
  const assinado = resultado(
    await db.storage
      .from("nexus-operacional")
      .createSignedUploadUrl(arquivo.caminho, { upsert: false }),
  );
  if (!assinado)
    throw new Error(
      "Não foi possível preparar o envio. Se já enviou o original, use Reverificar armazenamento.",
    );
  return { arquivo, token: assinado.token };
}

export const listarArquivosLevantamento = createServerFn({ method: "GET" })
  .middleware([requireSupabaseAuth])
  .inputValidator((input) =>
    destinoInput.extend({ pagina: z.number().int().min(0).default(0) }).parse(input),
  )
  .handler(async ({ context, data }) => {
    const db = client(context.supabase);
    await exigirLeitura(db, data.organization_id, data.levantamento_id);
    let consulta = db
      .from("levantamento_arquivos")
      .select("*", { count: "exact" })
      .eq("organization_id", data.organization_id)
      .eq("levantamento_id", data.levantamento_id)
      .eq("revisao_id", data.revisao_id)
      .neq("estado", "cancelado")
      .order("created_at", { ascending: false })
      .order("id")
      .range(data.pagina * 25, data.pagina * 25 + 24);
    consulta = data.ponto_id
      ? consulta.eq("ponto_id", data.ponto_id)
      : consulta.is("ponto_id", null);
    const resposta = await consulta;
    const arquivos = levantamentoArquivoRow.array().parse(resultado(resposta) ?? []);
    return {
      rows: arquivos.map((arquivo) => ({
        ...arquivo,
        meu_envio: arquivo.created_by === context.userId,
      })),
      total: resposta.count ?? 0,
    };
  });

export const prepararArquivoLevantamento = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((input) => arquivoInput.parse(input))
  .handler(async ({ context, data }) => {
    exigirConfirmacaoConfigurada();
    const db = client(context.supabase);
    await exigirLeitura(db, data.organization_id, data.levantamento_id);
    const revisao = resultado(
      await db
        .from("levantamento_revisoes")
        .select("id")
        .eq("organization_id", data.organization_id)
        .eq("levantamento_id", data.levantamento_id)
        .eq("id", data.revisao_id)
        .maybeSingle(),
    );
    if (!revisao) throw new Error("Revisão indisponível neste levantamento.");
    const { organization_id, levantamento_id, revisao_id, ponto_id, chave, ...metadados } = data;
    const preparada = levantamentoArquivoRow.parse(
      resultado(
        await db.rpc("lev_preparar_arquivo", {
          _org: organization_id,
          _revisao: revisao_id,
          _ponto: ponto_id,
          _chave: chave,
          _dados: metadados,
        }),
      ),
    );
    if (preparada.levantamento_id !== levantamento_id)
      throw new Error("A revisão não pertence ao levantamento selecionado.");
    // Recibos de staging preservam o estado original. O token sempre usa o estado atual autorizado.
    return prepararToken(db, await lerArquivo(db, organization_id, preparada.id));
  });

export const retomarArquivoLevantamento = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((input) => idInput.parse(input))
  .handler(async ({ context, data }) => {
    exigirConfirmacaoConfigurada();
    const db = client(context.supabase);
    return prepararToken(db, await lerArquivo(db, data.organization_id, data.id));
  });

export const confirmarArquivoLevantamento = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((input) => idInput.parse(input))
  .handler(async ({ context, data }) => {
    exigirConfirmacaoConfigurada();
    const db = client(context.supabase);
    const arquivo = await lerArquivo(db, data.organization_id, data.id);
    if (arquivo.estado === "vinculado") return arquivo;
    if (arquivo.created_by !== context.userId || !(await podeEnviar(db, arquivo)))
      throw new Error("Envio indisponível para confirmação neste contexto.");
    // Autoriza pelo usuário/RLS antes de carregar o cliente privilegiado e ler qualquer binário.
    const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
    const admin = client(supabaseAdmin);
    const blob = resultado(await admin.storage.from("nexus-operacional").download(arquivo.caminho));
    if (!blob)
      throw new Error(
        "A evidência ainda não está no armazenamento. Selecione o mesmo original para retomar.",
      );
    await validarBinario(new Uint8Array(await blob.arrayBuffer()), arquivo);
    // Após o download pode ter ocorrido revogação ou confirmação por outra tentativa.
    const atual = await lerArquivo(db, data.organization_id, data.id);
    if (atual.estado === "vinculado") return atual;
    if (!(await podeEnviar(db, atual)))
      throw new Error("O acesso ou estado da revisão mudou durante a verificação.");
    resultado(
      await admin.rpc("lev_confirmar_arquivo", {
        _org: data.organization_id,
        _id: data.id,
        _autor: context.userId,
        _sha256: arquivo.sha256,
      }),
    );
    return lerArquivo(db, data.organization_id, data.id);
  });

export const cancelarArquivoLevantamento = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((input) =>
    idInput
      .extend({ chave: z.string().uuid(), motivo: z.string().trim().min(5).max(2000) })
      .parse(input),
  )
  .handler(async ({ context, data }) =>
    levantamentoArquivoRow.parse(
      resultado(
        await client(context.supabase).rpc("lev_cancelar_arquivo", {
          _org: data.organization_id,
          _id: data.id,
          _chave: data.chave,
          _motivo: data.motivo,
        }),
      ),
    ),
  );

export const baixarArquivoLevantamento = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((input) => idInput.parse(input))
  .handler(async ({ context, data }) => {
    const db = client(context.supabase);
    const arquivo = await lerArquivo(db, data.organization_id, data.id);
    if (arquivo.estado !== "vinculado")
      throw new Error("Confirme o armazenamento antes de baixar a evidência.");
    const assinado = resultado(
      await db.storage
        .from("nexus-operacional")
        .createSignedUrl(arquivo.caminho, 60, { download: arquivo.nome }),
    );
    if (!assinado) throw new Error("Download indisponível. Tente novamente.");
    return { url: assinado.signedUrl };
  });
