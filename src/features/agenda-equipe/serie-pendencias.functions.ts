import { createServerFn } from "@tanstack/react-start";
import { getRequest } from "@tanstack/react-start/server";
import type { SupabaseClient } from "@supabase/supabase-js";
import { z } from "zod";
import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";
import { AGENDA_ACESSO_NEGADO } from "./domain";
import { agendaResult } from "./agenda.functions";
import * as s from "./serie-pendencias.schemas";
const versionColumns = "id,numero,inicio_aplicacao";
const serieColumns =
  "id,organization_id,version,versao_atual_id,estado,cancelamento_corte,materializado_ate,materializacao_pendente,ultima_falha_codigo,ultima_tentativa";
const occurrenceColumns =
  "serie_versao_id,data,estado,codigo,tentativas,proxima_tentativa,updated_at";
const parent = z.object({
  evento: z.object({
    id: z.string().uuid(),
    organization_id: z.string().uuid(),
  }),
  serie: z
    .object({
      id: z.string().uuid(),
      version: z.number().int().positive(),
      versao_id: z.string().uuid(),
    })
    .nullable(),
});
const configuration = z.object({
  permissoes: z.object({ gerir_series: z.boolean() }),
});
async function authorize(db: SupabaseClient, org: string, event: string) {
  const signal = getRequest().signal;
  const detail = parent.parse(
    agendaResult(await db.rpc("ag_obter", { _org: org, _id: event }).abortSignal(signal)),
  );
  const config = configuration.parse(
    agendaResult(await db.rpc("ag_configuracao", { _org: org }).abortSignal(signal)),
  );
  if (!config.permissoes.gerir_series) throw new Error(AGENDA_ACESSO_NEGADO);
  if (!detail.serie || detail.evento.id !== event || detail.evento.organization_id !== org)
    throw new Error(AGENDA_ACESSO_NEGADO);
  return detail.serie;
}
function changed() {
  throw new Error("A série mudou durante a consulta. Recarregue suas pendências.");
}
function exact<T>(
  response: {
    data: unknown;
    error: { code?: string; message: string } | null;
    count: number | null;
  },
  schema: z.ZodType<T>,
) {
  const value = agendaResult(response);
  if (
    !Array.isArray(value) ||
    response.count === null ||
    !Number.isSafeInteger(response.count) ||
    response.count < 0
  )
    throw new Error("A consulta não confirmou as ocorrências e sua contagem. Tente novamente.");
  return {
    registros: schema.array().max(25).parse(value),
    total: response.count,
  };
}
export const listarPendenciasSerieAgenda = createServerFn({ method: "GET" })
  .middleware([requireSupabaseAuth])
  .inputValidator(s.pendenciasSerieInput)
  .handler(async ({ context, data }) => {
    const db = context.supabase as unknown as SupabaseClient,
      signal = getRequest().signal;
    const permission = await authorize(db, data.organization_id, data.evento_id);
    async function revalidate() {
      const current = await authorize(db, data.organization_id, data.evento_id);
      if (current.id !== permission.id) throw new Error(AGENDA_ACESSO_NEGADO);
      if (current.version !== permission.version || current.versao_id !== permission.versao_id)
        changed();
    }
    const serie = s.estadoSerieResumo
      .nullable()
      .parse(
        agendaResult(
          await db
            .from("agenda_series")
            .select(serieColumns)
            .eq("organization_id", data.organization_id)
            .eq("id", permission.id)
            .abortSignal(signal)
            .maybeSingle(),
        ),
      );
    await revalidate();
    if (!serie) throw new Error(AGENDA_ACESSO_NEGADO);
    if (serie.version !== permission.version || serie.versao_atual_id !== permission.versao_id)
      changed();
    const versions = exact(
      await db
        .from("agenda_serie_versoes")
        .select(versionColumns, { count: "exact" })
        .eq("organization_id", data.organization_id)
        .eq("serie_id", serie.id)
        .order("numero", { ascending: false })
        .range(data.pagina_versoes * 25, data.pagina_versoes * 25 + 24)
        .abortSignal(signal),
      s.versaoSerieResumo,
    );
    await revalidate();
    const id = data.versao_id ?? serie.versao_atual_id;
    let version = versions.registros.find((row) => row.id === id);
    if (!version) {
      const selected = s.versaoSerieResumo
        .nullable()
        .parse(
          agendaResult(
            await db
              .from("agenda_serie_versoes")
              .select(versionColumns)
              .eq("organization_id", data.organization_id)
              .eq("serie_id", serie.id)
              .eq("id", id)
              .abortSignal(signal)
              .maybeSingle(),
          ),
        );
      await revalidate();
      if (!selected) throw new Error(AGENDA_ACESSO_NEGADO);
      version = selected;
    }
    const next = s.versaoSerieResumo
      .array()
      .max(1)
      .parse(
        agendaResult(
          await db
            .from("agenda_serie_versoes")
            .select(versionColumns)
            .eq("organization_id", data.organization_id)
            .eq("serie_id", serie.id)
            .gt("numero", version.numero)
            .order("inicio_aplicacao", { ascending: true })
            .order("numero", { ascending: true })
            .limit(1)
            .abortSignal(signal),
        ),
      );
    await revalidate();
    const boundaries = [serie.cancelamento_corte, next[0]?.inicio_aplicacao]
      .filter((value): value is string => !!value)
      .sort();
    const cutoff = boundaries[0] ?? null;
    let query = db
      .from("agenda_serie_ocorrencias")
      .select(occurrenceColumns, { count: "exact" })
      .eq("organization_id", data.organization_id)
      .eq("serie_versao_id", version.id)
      .in("estado", ["bloqueada", "ignorada"])
      .gte("data", version.inicio_aplicacao);
    if (cutoff) query = query.lt("data", cutoff);
    const occurrences = exact(
      await query
        .order("data", { ascending: true })
        .range(data.pagina * 25, data.pagina * 25 + 24)
        .abortSignal(signal),
      s.ocorrenciaSeriePendente,
    );
    await revalidate();
    return s.pendenciasSeriePage.parse({
      serie,
      versao: version,
      corte_exclusivo: cutoff,
      versoes: { ...versions, pagina: data.pagina_versoes, limite: 25 },
      ...occurrences,
      pagina: data.pagina,
      limite: 25,
      permissoes: { ler: true },
    });
  });
