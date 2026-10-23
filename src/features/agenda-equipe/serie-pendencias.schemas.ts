import { z } from "zod";
import { date, instant } from "./schemas";
const uuid = z.string().uuid(),
  positive = z.number().int().positive();
export const pendenciasSerieInput = z
  .object({
    organization_id: uuid,
    evento_id: uuid,
    versao_id: uuid.nullable().default(null),
    pagina: z.number().int().min(0).max(100000).default(0),
    pagina_versoes: z.number().int().min(0).max(100000).default(0),
  })
  .strict();
export const versaoSerieResumo = z.object({
  id: uuid,
  numero: positive,
  inicio_aplicacao: date,
});
export const estadoSerieResumo = z.object({
  id: uuid,
  organization_id: uuid,
  version: positive,
  versao_atual_id: uuid,
  estado: z.enum(["ativa", "cancelada"]),
  cancelamento_corte: date.nullable(),
  materializado_ate: date.nullable(),
  materializacao_pendente: z.boolean(),
  ultima_falha_codigo: z.string().max(120).nullable(),
  ultima_tentativa: instant.nullable(),
});
export const ocorrenciaSeriePendente = z.object({
  serie_versao_id: uuid,
  data: date,
  estado: z.enum(["bloqueada", "ignorada"]),
  codigo: z.string().max(120).nullable(),
  tentativas: z.number().int().nonnegative(),
  proxima_tentativa: instant,
  updated_at: instant,
});
export const pendenciasSeriePage = z.object({
  serie: estadoSerieResumo,
  versao: versaoSerieResumo,
  corte_exclusivo: date.nullable(),
  versoes: z.object({
    registros: versaoSerieResumo.array().max(25),
    total: z.number().int().nonnegative(),
    pagina: z.number().int().nonnegative(),
    limite: z.literal(25),
  }),
  registros: ocorrenciaSeriePendente.array().max(25),
  total: z.number().int().nonnegative(),
  pagina: z.number().int().nonnegative(),
  limite: z.literal(25),
  permissoes: z.object({ ler: z.literal(true) }),
});
