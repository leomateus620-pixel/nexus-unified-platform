import { createServerFn } from "@tanstack/react-start";
import { getRequest } from "@tanstack/react-start/server";
import type { SupabaseClient } from "@supabase/supabase-js";
import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";
import * as s from "./schemas";

import { petResult } from "./errors";
export { petResult } from "./errors";
const db = (value: unknown) => value as SupabaseClient;
export const petListar = createServerFn({ method: "GET" })
  .middleware([requireSupabaseAuth])
  .inputValidator(s.listarInput)
  .handler(async ({ context, data }) =>
    s.listaResult.parse(
      petResult(
        await db(context.supabase)
          .rpc("pet_listar", { p_org: data.organization_id, p_filtros: data.filtros ?? {} })
          .abortSignal(getRequest().signal),
      ),
    ),
  );
export const petObter = createServerFn({ method: "GET" })
  .middleware([requireSupabaseAuth])
  .inputValidator(s.obterInput)
  .handler(async ({ context, data }) =>
    s.detalheResult.parse(
      petResult(
        await db(context.supabase)
          .rpc("pet_obter", { p_org: data.organization_id, p_id: data.id })
          .abortSignal(getRequest().signal),
      ),
    ),
  );
export const petOpcoes = createServerFn({ method: "GET" })
  .middleware([requireSupabaseAuth])
  .inputValidator(s.orgInput)
  .handler(async ({ context, data }) =>
    s.opcoesResult.parse(
      petResult(
        await db(context.supabase)
          .rpc("pet_opcoes", { p_org: data.organization_id })
          .abortSignal(getRequest().signal),
      ),
    ),
  );
export const petExecutar = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator(s.executarInput)
  .handler(async ({ context, data }) =>
    s.objectResult.parse(
      petResult(
        await db(context.supabase).rpc("pet_executar", {
          p_org: data.organization_id,
          p_comando: data.comando,
        }),
      ),
    ),
  );
