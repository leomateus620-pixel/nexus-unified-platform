import { createServerFn } from "@tanstack/react-start";
import { getRequest } from "@tanstack/react-start/server";
import type { SupabaseClient } from "@supabase/supabase-js";
import { z } from "zod";
import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";
import { nrResult } from "./nr.functions";
import { nrJsonSchema, nrListaSchema, nrRowSchema } from "./schemas";

const uuid = z.string().uuid();
const scope = z.object({
  org: uuid,
  cliente: uuid,
  unidade: uuid,
  norma: z.enum(["NR33", "NR35"]),
});
type Scope = z.infer<typeof scope>;
const params = (s: Scope) => ({
  p_org: s.org,
  p_cliente: s.cliente,
  p_unidade: s.unidade,
  p_norma: s.norma,
});
const db = (value: unknown) => value as SupabaseClient;
const output = z.object({
  id: uuid,
  documento_id: uuid.optional(),
  existente: z.boolean().optional(),
});

export const nrColetaListar = createServerFn({ method: "GET" })
  .middleware([requireSupabaseAuth])
  .inputValidator(
    scope.extend({
      busca: z.string().max(120),
      estado: z.string().max(80),
      pagina: z.number().int().min(0).max(100000),
      local: uuid.optional(),
    }),
  )
  .handler(async ({ data, context }) =>
    nrListaSchema.parse(
      nrResult(
        await db(context.supabase)
          .rpc("nr_coleta_listar", {
            ...params(data),
            p_filtros: {
              busca: data.busca,
              estado: data.estado,
              pagina: data.pagina,
              local_id: data.local ?? null,
            },
          })
          .abortSignal(getRequest().signal),
      ),
    ),
  );

export const nrColetaContexto = createServerFn({ method: "GET" })
  .middleware([requireSupabaseAuth])
  .inputValidator(
    scope.extend({
      local: uuid.optional(),
      busca: z.string().max(120).default(""),
      pagina: z.number().int().min(0).max(100000).default(0),
    }),
  )
  .handler(async ({ data, context }) =>
    z
      .object({
        locais: z.array(
          z.object({
            id: uuid,
            tag: z.string(),
            titulo: z.string(),
            familia: z.string().nullable(),
            normas: z.array(z.string()),
            rascunho_id: uuid.nullable(),
          }),
        ),
        total: z.number(),
        piloto_altura: z.boolean(),
        modelos: z.array(
          z.object({
            id: uuid,
            titulo: z.string(),
            version: z.number(),
            numero: z.number().nullable(),
            normas: z.array(z.string()),
          }),
        ),
      })
      .parse(
        nrResult(
          await db(context.supabase)
            .rpc("nr_coleta_contexto", {
              ...params(data),
              p_local: data.local ?? null,
              p_busca: data.busca,
              p_pagina: data.pagina,
            })
            .abortSignal(getRequest().signal),
        ),
      ),
  );

export const nrColetaIniciar = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator(
    scope.extend({
      local: uuid,
      modelo: uuid.nullable(),
      modeloVersion: z.number().int().nullable(),
      duplo: z.boolean(),
      reinspecao: z.boolean().default(false),
      origem: uuid.nullable(),
      chave: uuid,
    }),
  )
  .handler(async ({ data, context }) =>
    output.parse(
      nrResult(
        await db(context.supabase).rpc("nr_coleta_iniciar", {
          ...params(data),
          p_local: data.local,
          p_modelo: data.modelo,
          p_modelo_version: data.modeloVersion,
          p_duplo: data.duplo,
          p_origem: data.origem,
          p_reinspecao: data.reinspecao,
          p_chave: data.chave,
        }),
      ),
    ),
  );

const collection = scope.extend({ id: uuid });
export const nrColetaDocumento = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator(
    collection.extend({
      revisao: uuid,
      modelo: uuid,
      modeloVersion: z.number().int().positive(),
      modeloVersao: uuid.nullable(),
    }),
  )
  .handler(async ({ data, context }) =>
    output.parse(
      nrResult(
        await db(context.supabase).rpc("nr_coleta_documento", {
          ...params(data),
          p_id: data.id,
          p_revisao: data.revisao,
          p_modelo: data.modelo,
          p_modelo_version: data.modeloVersion,
          p_modelo_versao: data.modeloVersao,
        }),
      ),
    ),
  );
export const nrColetaSnapshot = createServerFn({ method: "GET" })
  .middleware([requireSupabaseAuth])
  .inputValidator(collection.extend({ revisao: uuid }))
  .handler(async ({ data, context }) =>
    z
      .object({
        numero: z.number().int(),
        roteiro: nrJsonSchema,
        valores: nrJsonSchema,
        local: z.object({
          id: uuid,
          titulo: z.string(),
          tag: z.string(),
          familia: z.string().nullable(),
          tipo: z.string(),
        }),
        medidas: nrJsonSchema,
        identificacao_verificada: nrJsonSchema,
      })
      .parse(
        nrResult(
          await db(context.supabase)
            .rpc("nr_coleta_snapshot", {
              ...params(data),
              p_id: data.id,
              p_revisao: data.revisao,
            })
            .abortSignal(getRequest().signal),
        ),
      ),
  );
const item = z.object({
  campo: z.string(),
  codigo: z.string(),
  acao: z.string().nullable(),
  quantidade: nrJsonSchema,
  unidade: z.string().nullable(),
  justificativa: z.string().nullable(),
  evidencias: nrJsonSchema,
  estado: z.enum(["pendente", "candidato", "observado"]),
});
const revision = z.object({
  id: uuid,
  numero: z.number(),
  documento_id: uuid,
  estado: z.enum(["em_revisao", "devolvida", "aprovada"]),
  motivo: z.string().nullable(),
  concluida_em: z.string(),
  documento_tecnico_id: uuid.nullable(),
  adequacoes: item.array(),
  itens_confirmados: item.array(),
  pdf_estado: z.string(),
});
export const nrColetaRevisoes = createServerFn({ method: "GET" })
  .middleware([requireSupabaseAuth])
  .inputValidator(collection)
  .handler(async ({ data, context }) =>
    z.object({ revisoes: revision.array(), pode_revisar: z.boolean() }).parse(
      nrResult(
        await db(context.supabase)
          .rpc("nr_coleta_revisoes_listar", { ...params(data), p_id: data.id })
          .abortSignal(getRequest().signal),
      ),
    ),
  );

const command = collection.extend({ version: z.number().int().positive(), chave: uuid });
export const nrColetaSalvar = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator(
    command.extend({
      bloco: z.string().min(1).max(160),
      identificacao_verificada: z.boolean(),
      medidas: z.record(nrJsonSchema),
      respostas: z.record(nrJsonSchema),
    }),
  )
  .handler(async ({ data, context }) => {
    const { bloco, identificacao_verificada, medidas, respostas } = data;
    const result = nrResult(
      await db(context.supabase).rpc("nr_coleta_salvar", {
        ...params(data),
        p_id: data.id,
        p_version: data.version,
        p_chave: data.chave,
        p_dados: { bloco, identificacao_verificada, medidas, respostas },
      }),
    );
    return (
      z.object({ registro: nrRowSchema }).safeParse(result).data ?? {
        registro: nrRowSchema.parse(result),
      }
    );
  });
export const nrColetaConcluir = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator(command)
  .handler(async ({ data, context }) =>
    output.parse(
      nrResult(
        await db(context.supabase).rpc("nr_coleta_concluir", {
          ...params(data),
          p_id: data.id,
          p_version: data.version,
          p_chave: data.chave,
        }),
      ),
    ),
  );

export const nrColetaRevisar = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator(
    command.extend({
      revisao: uuid,
      decisao: z.enum(["aprovar", "devolver"]),
      motivo: z.string().max(4000),
      itens: z
        .array(item.pick({ campo: true, codigo: true }))
        .max(100)
        .default([]),
    }),
  )
  .handler(async ({ data, context }) =>
    output.parse(
      nrResult(
        await db(context.supabase).rpc("nr_coleta_revisar", {
          ...params(data),
          p_id: data.id,
          p_revisao: data.revisao,
          p_version: data.version,
          p_decisao: data.decisao,
          p_motivo: data.motivo,
          p_itens: data.itens,
          p_chave: data.chave,
        }),
      ),
    ),
  );
