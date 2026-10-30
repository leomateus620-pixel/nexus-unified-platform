import { createServerFn } from "@tanstack/react-start";
import { getRequest } from "@tanstack/react-start/server";
import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";
import { nrResult } from "./nr.functions";
import {
  importQueuePrepare,
  importQueueStage,
  importQueueCommand,
  importQueueQuery,
  importQueueRow,
  importQueueResponse,
} from "./import-queue.schemas";
import { z } from "zod";
import type { SupabaseClient } from "@supabase/supabase-js";
const client = (value: unknown) => value as SupabaseClient;
function bounded(value: unknown, max: number) {
  if (new TextEncoder().encode(JSON.stringify(value)).byteLength > max)
    throw new Error("Etapa acima do limite de metadados; reduza o lote antes de enviar.");
}
export const nrImportFilaPreparar = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator(importQueuePrepare)
  .handler(async ({ context, data }) => {
    bounded(data.manifesto, 80000);
    return importQueueRow.parse(
      nrResult(
        await client(context.supabase).rpc("nr_import_fila_criar", {
          p_org: data.organization_id,
          p_norma: data.norma,
          p_origem: data.origem,
          p_chave: data.chave,
          p_inicio: data.inicio,
          p_fim: data.fim,
          p_manifesto: data.manifesto,
          p_total: data.total,
        }),
      ),
    );
  });
export const nrImportFilaStaging = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator(importQueueStage)
  .handler(async ({ context, data }) => {
    bounded(data.itens, 1500000);
    return z
      .object({
        confirmados: z.number().int().nonnegative(),
        recebidos: z.number().int().nonnegative(),
      })
      .parse(
        nrResult(
          await client(context.supabase).rpc("nr_import_fila_staging", {
            p_org: data.organization_id,
            p_fila: data.fila_id,
            p_itens: data.itens,
          }),
        ),
      );
  });
export const nrImportFilaComandar = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator(importQueueCommand)
  .handler(async ({ context, data }) =>
    importQueueRow.parse(
      nrResult(
        await client(context.supabase).rpc("nr_import_fila_comandar", {
          p_org: data.organization_id,
          p_fila: data.fila_id,
          p_acao: data.acao,
        }),
      ),
    ),
  );
export const nrImportFilaConsultar = createServerFn({ method: "GET" })
  .middleware([requireSupabaseAuth])
  .inputValidator(importQueueQuery)
  .handler(async ({ context, data }) =>
    importQueueResponse.parse(
      nrResult(
        await client(context.supabase)
          .rpc("nr_import_fila_consultar", {
            p_org: data.organization_id,
            p_id: data.id ?? null,
            p_pagina: data.pagina,
          })
          .abortSignal(getRequest().signal),
      ),
    ),
  );
