import { createServerFn } from "@tanstack/react-start";
import { getRequest } from "@tanstack/react-start/server";
import type { SupabaseClient } from "@supabase/supabase-js";
import { z } from "zod";
import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";
import { nrResult } from "@/features/nr/nr.functions";
import { unitScopeSchema } from "@/features/nr/mapa/schemas";
import { jsonValue } from "./schemas";
const id = z.string().uuid();
const pet = z.object({ organization_id: id, pet_id: id });
const photo = z.object({
  id,
  nome: z.string(),
  item: z.string().nullable(),
  metadados: z
    .object({
      capturada_em: z.string(),
      latitude: z.number().nullable(),
      longitude: z.number().nullable(),
      precisao_m: z.number().nullable(),
      origem: z.string(),
      legenda: z.string(),
      sha256: z.string(),
      created_at: z.string(),
    })
    .nullable(),
});
export const petFotosListar = createServerFn({ method: "GET" })
  .middleware([requireSupabaseAuth])
  .inputValidator(pet)
  .handler(async ({ context, data }) =>
    z
      .array(photo)
      .parse(
        nrResult(
          await (context.supabase as SupabaseClient)
            .rpc("pet_fotos_listar", { p_org: data.organization_id, p_pet: data.pet_id })
            .abortSignal(getRequest().signal),
        ),
      ),
  );
export const petFotoRegistrar = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator(
    pet
      .extend({
        anexo_id: id,
        expected_version: z.number().int().positive(),
        chave: id,
        dados: z
          .object({
            capturada_em: z.string().datetime({ offset: true }),
            latitude: z.number().min(-90).max(90).nullable(),
            longitude: z.number().min(-180).max(180).nullable(),
            precisao_m: z.number().positive().max(100000).nullable(),
            origem: z.enum(["declarada", "dispositivo"]),
            legenda: z.string().trim().min(3).max(2000),
          })
          .strict(),
      })
      .strict(),
  )
  .handler(async ({ context, data }) =>
    z.object({ id }).parse(
      nrResult(
        await (context.supabase as SupabaseClient).rpc("pet_foto_registrar", {
          p_org: data.organization_id,
          p_pet: data.pet_id,
          p_anexo: data.anexo_id,
          p_expected_version: data.expected_version,
          p_chave: data.chave,
          p_dados: data.dados,
        }),
      ),
    ),
  );
export const petExportarUnidade = createServerFn({ method: "GET" })
  .middleware([requireSupabaseAuth])
  .inputValidator(
    unitScopeSchema.extend({
      filtros: z
        .object({
          espaco_id: id.optional(),
          grupo: z.enum(["andamento", "concluidas"]).optional(),
          estado: z.string().max(40).optional(),
          desde: z.string().datetime({ offset: true }).optional(),
          ate: z.string().datetime({ offset: true }).optional(),
          busca: z.string().max(120).optional(),
        })
        .strict(),
    }),
  )
  .handler(async ({ context, data }) =>
    z
      .object({
        registros: z.array(z.record(jsonValue)),
        total: z.number(),
        consultado_em: z.string(),
      })
      .parse(
        nrResult(
          await (context.supabase as SupabaseClient)
            .rpc("pet_exportar_unidade", {
              p_org: data.organization_id,
              p_cliente: data.cliente_id,
              p_unidade: data.unidade_id,
              p_norma: data.norma,
              p_filtros: data.filtros,
            })
            .abortSignal(getRequest().signal),
        ),
      ),
  );
