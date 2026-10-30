import { createServerFn } from "@tanstack/react-start";
import type { SupabaseClient } from "@supabase/supabase-js";
import { z } from "zod";
import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";
import { nrResult } from "./nr.functions";
import { nrRowSchema } from "./schemas";
import {
  calcularSnapshotNr,
  lerCalculosNr,
  nrSalvarCalculosSchema,
  type NrSalvarCalculosInput,
} from "./calculos.schemas";

/** A RPC revalida acesso, contexto, idempotência e versão dentro da transação de escrita. */
export async function salvarCalculosNr(
  client: SupabaseClient,
  raw: NrSalvarCalculosInput,
  userId: string,
) {
  const data = nrSalvarCalculosSchema.parse(raw);
  const autor = z.string().uuid().parse(userId);
  if (
    nrResult(await client.rpc("pode", { _org: data.organization_id, _acao: "editar_nr" })) !== true
  )
    throw new Error("Sem permissão para editar os cálculos deste local.");
  const response = nrResult(
    await client.rpc("nr_consultar", {
      p_org: data.organization_id,
      p_norma: data.norma,
      p_recurso: "locais",
      p_filtros: { id: data.local_id },
    }),
  );
  const wrapped = z.object({ registro: nrRowSchema }).safeParse(response);
  const local = wrapped.success ? wrapped.data.registro : nrRowSchema.parse(response);
  if (
    local.id !== data.local_id ||
    local.organization_id !== data.organization_id ||
    !local.normas.includes(data.norma) ||
    local.arquivado_em
  )
    throw new Error("Local indisponível no contexto atual.");
  if (local.dados["calculos"] != null && !lerCalculosNr(local.dados["calculos"]))
    throw new Error(
      "O cálculo existente usa um formato não reconhecido. Seu conteúdo foi preservado; confira o histórico antes de substituí-lo.",
    );
  const snapshot = calcularSnapshotNr(data.entrada, autor, data.expected_version, data.chave);
  const saved = nrResult(
    await client.rpc("nr_executar", {
      p_org: data.organization_id,
      p_norma: data.norma,
      p_recurso: "locais",
      p_comando: "salvar",
      p_id: data.local_id,
      p_expected_version: data.expected_version,
      p_chave: data.chave,
      p_dados: { dados: { ...local.dados, calculos: JSON.parse(JSON.stringify(snapshot)) } },
    }),
  );
  const parsed = z.object({ registro: nrRowSchema }).safeParse(saved);
  return parsed.success ? parsed.data : { registro: nrRowSchema.parse(saved) };
}
export const nrSalvarCalculos = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator(nrSalvarCalculosSchema)
  .handler(async ({ context, data }) =>
    salvarCalculosNr(context.supabase as unknown as SupabaseClient, data, context.userId),
  );
