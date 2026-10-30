import { createServerFn } from "@tanstack/react-start";
import { getRequest } from "@tanstack/react-start/server";
import type { SupabaseClient } from "@supabase/supabase-js";
import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";
import { nrResult } from "./nr.functions";
import {
  nrRecordHistoryInput,
  nrRevisionsInput,
  nrEventDetailInput,
  nrRevisionDetailInput,
  nrHistoryPage,
  nrHistoryDetail,
} from "./history.schemas";
const client = (value: unknown) => value as SupabaseClient;
export const nrHistoricoListar = createServerFn({ method: "GET" })
  .middleware([requireSupabaseAuth])
  .inputValidator(nrRecordHistoryInput)
  .handler(async ({ context, data }) =>
    nrHistoryPage.parse(
      nrResult(
        await client(context.supabase)
          .rpc("nr_historico_listar", {
            p_org: data.organization_id,
            p_norma: data.norma,
            p_recurso: data.recurso,
            p_registro: data.registro_id,
            p_pagina: data.pagina,
            p_limite: data.limite,
          })
          .abortSignal(getRequest().signal),
      ),
    ),
  );
export const nrRevisoesListar = createServerFn({ method: "GET" })
  .middleware([requireSupabaseAuth])
  .inputValidator(nrRevisionsInput)
  .handler(async ({ context, data }) =>
    nrHistoryPage.parse(
      nrResult(
        await client(context.supabase)
          .rpc("nr_revisoes_listar", {
            p_org: data.organization_id,
            p_norma: data.norma,
            p_recurso: data.recurso,
            p_registro: data.registro_id,
            p_pagina: data.pagina,
            p_limite: data.limite,
          })
          .abortSignal(getRequest().signal),
      ),
    ),
  );
export const nrHistoricoDetalhe = createServerFn({ method: "GET" })
  .middleware([requireSupabaseAuth])
  .inputValidator(nrEventDetailInput)
  .handler(async ({ context, data }) =>
    nrHistoryDetail.parse(
      nrResult(
        await client(context.supabase)
          .rpc("nr_historico_detalhe", {
            p_org: data.organization_id,
            p_norma: data.norma,
            p_id: data.evento_id,
          })
          .abortSignal(getRequest().signal),
      ),
    ),
  );
export const nrRevisaoDetalhe = createServerFn({ method: "GET" })
  .middleware([requireSupabaseAuth])
  .inputValidator(nrRevisionDetailInput)
  .handler(async ({ context, data }) =>
    nrHistoryDetail.parse(
      nrResult(
        await client(context.supabase)
          .rpc("nr_revisao_detalhe", {
            p_org: data.organization_id,
            p_norma: data.norma,
            p_recurso: data.recurso,
            p_registro: data.registro_id,
            p_revisao: data.revisao_id,
          })
          .abortSignal(getRequest().signal),
      ),
    ),
  );
