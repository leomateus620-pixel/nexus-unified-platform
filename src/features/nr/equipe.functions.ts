import { createServerFn } from "@tanstack/react-start";
import { getRequest } from "@tanstack/react-start/server";
import type { SupabaseClient } from "@supabase/supabase-js";
import { z } from "zod";
import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";
import { unitScopeSchema } from "./mapa/schemas";
import { nrResult } from "./nr.functions";
const certificate = z.object({
  id: z.string().uuid(),
  competencia: z.string(),
  emissor: z.string(),
  conclusao: z.string(),
  validade: z.string().nullable(),
  estado: z.string(),
  carga_horaria: z.number().nullable(),
  tipo_treinamento: z.string().nullable(),
  modalidade: z.string().nullable(),
  version: z.number(),
  alerta: z.string(),
});
export const unitTeamResult = z.object({
  pode_gerir: z.boolean(),
  data_referencia: z.string(),
  pagina: z.number(),
  total: z.number(),
  vencidas: z.number(),
  vence_em_30_dias: z.number(),
  registros: z.array(
    z.object({
      id: z.string().uuid(),
      nome: z.string(),
      ativa: z.boolean(),
      vinculada: z.boolean(),
      funcao: z.string(),
      version: z.number(),
      certificados_total: z.number(),
      certificados: z.array(certificate),
    }),
  ),
});
export const nrUnidadeEquipe = createServerFn({ method: "GET" })
  .middleware([requireSupabaseAuth])
  .inputValidator(
    unitScopeSchema.extend({
      pagina: z.number().int().min(0).max(10000).default(0),
      busca: z.string().max(120).default(""),
    }),
  )
  .handler(async ({ context, data }) =>
    unitTeamResult.parse(
      nrResult(
        await (context.supabase as SupabaseClient)
          .rpc("nr_unidade_equipe", {
            p_org: data.organization_id,
            p_cliente: data.cliente_id,
            p_unidade: data.unidade_id,
            p_norma: data.norma,
            p_pagina: data.pagina,
            p_busca: data.busca,
          })
          .abortSignal(getRequest().signal),
      ),
    ),
  );
export const nrUnidadePessoaSalvar = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator(
    unitScopeSchema
      .extend({
        pessoa_id: z.string().uuid(),
        funcao: z.string().trim().min(2).max(160),
        ativa: z.boolean(),
        expected_version: z.number().int().min(0),
        chave: z.string().uuid(),
      })
      .strict(),
  )
  .handler(async ({ context, data }) =>
    z.object({ pessoa_id: z.string().uuid(), version: z.number() }).parse(
      nrResult(
        await (context.supabase as SupabaseClient).rpc("nr_unidade_pessoa_salvar", {
          p_org: data.organization_id,
          p_cliente: data.cliente_id,
          p_unidade: data.unidade_id,
          p_norma: data.norma,
          p_pessoa: data.pessoa_id,
          p_funcao: data.funcao,
          p_ativa: data.ativa,
          p_expected_version: data.expected_version,
          p_chave: data.chave,
        }),
      ),
    ),
  );
