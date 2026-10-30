import { createServerFn } from "@tanstack/react-start";
import { getRequest } from "@tanstack/react-start/server";
import type { SupabaseClient } from "@supabase/supabase-js";
import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";
import { nrResult } from "./nr.functions";
import { nrImportInspectionInput, nrImportInspectionResponse } from "./import-inspection.schemas";

export const nrImportacaoInspecionar = createServerFn({ method: "GET" })
  .middleware([requireSupabaseAuth])
  .inputValidator(nrImportInspectionInput)
  .handler(async ({ context, data }) => {
    const { organization_id, lote_id, item_id, ...filters } = data;
    const result = nrResult(
      await (context.supabase as SupabaseClient)
        .rpc("nr_importacao_inspecionar", {
          p_org: organization_id,
          p_lote: lote_id ?? null,
          p_item: item_id ?? null,
          p_filtros: Object.fromEntries(
            Object.entries(filters).filter(([, value]) => value !== undefined),
          ),
        })
        .abortSignal(getRequest().signal),
    );
    return nrImportInspectionResponse.parse(result);
  });
