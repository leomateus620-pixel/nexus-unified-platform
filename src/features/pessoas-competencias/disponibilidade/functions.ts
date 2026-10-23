import { createServerFn } from "@tanstack/react-start";
import { getRequest } from "@tanstack/react-start/server";
import type { SupabaseClient } from "@supabase/supabase-js";
import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";
import * as s from "./schemas";

const client = (db: unknown) => db as SupabaseClient;
export function disponibilidadeResult(r: {
  data: unknown;
  error: { code?: string; message: string } | null;
}) {
  if (r.error) {
    if (["42501", "23503", "PGRST116"].includes(r.error.code ?? ""))
      throw new Error(s.DISPONIBILIDADE_NEGADA);
    if (r.error.code === "40001")
      throw new Error(
        "O bloqueio mudou. Recarregue a lista antes de cancelar; seu motivo foi preservado.",
      );
    if (r.error.code === "23P01")
      throw new Error(
        "A pessoa tem compromisso confirmado neste período. Reprograme a visita na Agenda antes de registrar a indisponibilidade.",
      );
    if (r.error.code === "23505")
      throw new Error(
        "A mesma operação foi enviada com outro conteúdo. Confira a lista antes de repetir.",
      );
    if (r.error.code === "23514") throw new Error(r.error.message);
    throw new Error(
      "Não foi possível confirmar a disponibilidade. Tente novamente; o preenchimento foi preservado.",
    );
  }
  return r.data;
}
export const listarIndisponibilidades = createServerFn({ method: "GET" })
  .middleware([requireSupabaseAuth])
  .inputValidator(s.listaInput)
  .handler(async ({ context, data }) =>
    s.lista.parse(
      disponibilidadeResult(
        await client(context.supabase)
          .rpc("eq_listar_indisponibilidades", {
            _org: data.organization_id,
            _pessoa: data.pessoa_id,
            _pagina: data.pagina,
            _limite: 25,
          })
          .abortSignal(getRequest().signal),
      ),
    ),
  );
export const executarIndisponibilidade = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator(s.comandoInput)
  .handler(async ({ context, data }) =>
    s.registro.parse(
      disponibilidadeResult(
        await client(context.supabase)
          .rpc("eq_executar_indisponibilidade", {
            _org: data.organization_id,
            _chave: data.chave,
            _comando: data.comando,
            _dados: data.dados,
          })
          .abortSignal(getRequest().signal),
      ),
    ),
  );
