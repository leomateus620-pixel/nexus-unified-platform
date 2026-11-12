import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";
import type { SupabaseClient } from "@supabase/supabase-js";
import { createServerFn } from "@tanstack/react-start";
import { z } from "zod";
import type { InspecoesRegistro } from "./ui-contract";

const uuid = z.string().uuid();
const organization = z.object({ organizationId: uuid });
const work = organization.extend({ levantamentoId: uuid });
const tag = z.string().trim().min(1).max(80);
const decimal = z.string().regex(/^-?\d{1,9}(\.\d{1,9})?$/);
const pageSize = 20;

const asset = z.object({
  tag,
  nome: z.string().trim().min(2).max(240),
  familia: z.string().trim().min(1).max(32),
  local: z.string().trim().max(500).optional(),
  setor: z.string().trim().max(500).optional(),
  componentes: z.array(z.object({ codigo: tag, nome: z.string().trim().min(2).max(200) })).max(100),
  pontos: z
    .array(
      z.object({
        codigo: tag,
        nome: z.string().trim().max(200).optional(),
        componente_codigo: tag.optional(),
      }),
    )
    .max(300),
});

const assay = z
  .object({
    ponto_codigo: tag,
    data_hora: z
      .string()
      .regex(/^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}(:\d{2}(\.\d{1,6})?)?(Z|[+-]\d{2}:\d{2})$/),
    equipamento_codigo: z.enum(["EQ-01", "EQ-02"]),
    certificado_numero: z.string().trim().max(120),
    area_pistao_cm2: decimal,
    capacidade_kn: decimal,
    carga_alvo_kn: decimal,
    carga_pico: decimal,
    unidade_carga: z.enum(["kN", "kgf", "lbf"]),
    sustentacao_s: z.string().regex(/^\d{1,6}$/),
    deslocamento_valor: decimal,
    deslocamento_unidade: z.string().trim().max(30),
    deslocamento_obs: z.string().trim().max(2000),
    resultado_app: z.enum(["aprovado", "reprovado", "sem_resultado"]),
    relatorio_id: uuid,
    relatorio_numero: z.string().trim().max(120),
    fotos_ids: z.array(uuid).max(20),
    video_id: uuid,
    horario_visivel: z.boolean(),
    lat: decimal,
    lon: decimal,
    croqui: z.string().trim().max(120),
    lacre: z.string().trim().max(120),
    temperatura_c: decimal,
    chuva: z.boolean(),
    motivo_reserva: z.string().trim().max(2000),
  })
  .partial();

export type InspecoesDadosAtivo = z.infer<typeof asset>;
export type InspecoesDadosEnsaio = z.infer<typeof assay>;

export type InspecoesEnsaio = {
  id: string;
  estado: "rascunho" | "cancelado";
  version: number;
  created_by: string;
  conteudo: InspecoesDadosEnsaio;
  carga_pico_kn: number | null;
  carga_pico_kgf: number | null;
  calculo_versao: string;
  bloqueios: string[];
  alertas: string[];
};

export type InspecoesCampoDados = {
  ensaios: InspecoesEnsaio[];
  pontos: { codigo: string; nome: string | null }[];
  evidencias: { id: string; nome: string; mime: string | null }[];
  total: number;
  pageSize: number;
};

function result<T>(response: {
  data: unknown;
  error: { code?: string; message: string } | null;
}): T {
  const { error } = response;
  if (!error) return response.data as T;
  if (error.code === "42501" || error.code === "PGRST116") {
    throw new Error("Ação indisponível para a atribuição e o trabalho selecionados.");
  }
  if (error.code === "40001") {
    throw new Error("A versão do ensaio mudou. Confira a versão atual antes de conciliar.");
  }
  if (error.code === "23505") {
    throw new Error(
      "Já existe um registro com esta TAG, código de componente ou ponto na unidade.",
    );
  }
  if (error.code === "23514" || error.code === "23503") throw new Error(error.message);
  throw new Error("Não foi possível acessar os registros de campo.");
}

export const inspecoesAtivoCriar = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator(
    organization.extend({ clienteId: uuid, unidadeId: uuid, chave: uuid, dados: asset }),
  )
  .handler(async ({ context, data }): Promise<InspecoesRegistro> => {
    const db = context.supabase as unknown as SupabaseClient;
    return result(
      await db.rpc("inspecoes_ativo_criar", {
        p_org: data.organizationId,
        p_cliente: data.clienteId,
        p_unidade: data.unidadeId,
        p_chave: data.chave,
        p_dados: data.dados,
      }),
    );
  });

export const inspecoesCampoConsultar = createServerFn({ method: "GET" })
  .middleware([requireSupabaseAuth])
  .inputValidator(work.extend({ pagina: z.number().int().min(0).max(10000) }))
  .handler(async ({ context, data }): Promise<InspecoesCampoDados> => {
    const db = context.supabase as unknown as SupabaseClient;
    const { ativo_id: assetId } = result<{ ativo_id: string }>(
      await db
        .from("inspecoes_levantamentos")
        .select("ativo_id")
        .eq("organization_id", data.organizationId)
        .eq("id", data.levantamentoId)
        .single(),
    );
    const start = data.pagina * pageSize;
    const [ensaios, pontos, evidencias] = await Promise.all([
      db
        .from("inspecoes_ensaios")
        .select(
          "id,estado,version,created_by,conteudo,carga_pico_kn,carga_pico_kgf,calculo_versao,bloqueios,alertas",
          { count: "exact" },
        )
        .eq("organization_id", data.organizationId)
        .eq("levantamento_id", data.levantamentoId)
        .order("created_at", { ascending: false })
        .order("id")
        .range(start, start + pageSize - 1),
      db
        .from("inspecoes_pontos")
        .select("codigo,nome")
        .eq("organization_id", data.organizationId)
        .eq("ativo_id", assetId)
        .order("codigo")
        .limit(300),
      db
        .from("inspecoes_arquivos")
        .select("id,nome,mime")
        .eq("organization_id", data.organizationId)
        .eq("levantamento_id", data.levantamentoId)
        .in("estado", ["original_verificado", "falha_processamento"])
        .in("papel", ["foto", "ensaio", "evidencia"])
        .order("nome")
        .order("id"),
    ]);
    return {
      ensaios: result(ensaios),
      pontos: result(pontos),
      evidencias: result(evidencias),
      total: ensaios.count ?? 0,
      pageSize,
    };
  });

export const inspecoesEnsaioSalvar = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator(
    work.extend({
      id: uuid,
      version: z.number().int().min(0),
      atribuicaoId: uuid,
      dados: assay,
    }),
  )
  .handler(async ({ context, data }): Promise<InspecoesEnsaio> => {
    const db = context.supabase as unknown as SupabaseClient;
    return result(
      await db.rpc("inspecoes_ensaio_salvar", {
        p_org: data.organizationId,
        p_levantamento: data.levantamentoId,
        p_id: data.id,
        p_version: data.version,
        p_dados: data.dados,
        p_atribuicao: data.atribuicaoId,
      }),
    );
  });

export const inspecoesEnsaioCancelar = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator(
    organization.extend({
      id: uuid,
      version: z.number().int().positive(),
      atribuicaoId: uuid,
      motivo: z.string().trim().min(5).max(2000),
    }),
  )
  .handler(async ({ context, data }): Promise<InspecoesEnsaio> => {
    const db = context.supabase as unknown as SupabaseClient;
    return result(
      await db.rpc("inspecoes_ensaio_cancelar", {
        p_org: data.organizationId,
        p_id: data.id,
        p_version: data.version,
        p_motivo: data.motivo,
        p_atribuicao: data.atribuicaoId,
      }),
    );
  });
