import { createServerFn } from "@tanstack/react-start";
import { getRequest } from "@tanstack/react-start/server";
import type { SupabaseClient } from "@supabase/supabase-js";
import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";
import { AGENDA_ACESSO_NEGADO } from "./domain";
import * as s from "./schemas";
const client = (db: unknown) => db as SupabaseClient;
export const obterAcaoAgenda = createServerFn({ method: "GET" })
  .middleware([requireSupabaseAuth])
  .inputValidator(s.obterInput)
  .handler(async ({ context, data }) =>
    s.acaoAgenda.parse(
      agendaResult(
        await client(context.supabase)
          .rpc("ag_obter_acao", { _org: data.organization_id, _id: data.id })
          .abortSignal(getRequest().signal),
      ),
    ),
  );
export function agendaResult(response: {
  data: unknown;
  error: { code?: string; message: string } | null;
}) {
  if (response.error) {
    const code = response.error.code ?? "";
    if (["42501", "23503", "PGRST116"].includes(code)) throw new Error(AGENDA_ACESSO_NEGADO);
    if (code === "40001")
      throw new Error(
        "O compromisso mudou. Seu preenchimento foi preservado; compare a versão atual antes de salvar.",
      );
    if (code === "23P01")
      throw new Error(
        "Há conflito de horário ou recurso. O compromisso não foi confirmado; escolha outro período ou recurso.",
      );
    if (code === "23505")
      throw new Error(
        "Esta operação já existe ou a mesma chave foi enviada com outro conteúdo. Confira o resultado antes de repetir.",
      );
    if (code === "23514") throw new Error(response.error.message);
    if (["42P01", "42883", "PGRST202"].includes(code))
      throw new Error(
        "O banco não disponibilizou o fluxo integrado da Agenda Equipe. Seu preenchimento foi preservado.",
      );
    throw new Error(
      "Não foi possível confirmar a consulta ou alteração da agenda. Tente novamente; seu preenchimento foi preservado.",
    );
  }
  return response.data;
}
export const listarAgenda = createServerFn({ method: "GET" })
  .middleware([requireSupabaseAuth])
  .inputValidator(s.listarInput)
  .handler(async ({ context, data }) =>
    s.listaAgenda.parse(
      agendaResult(
        await client(context.supabase)
          .rpc("ag_listar_v2", {
            _org: data.organization_id,
            _inicio: data.inicio,
            _fim: data.fim,
            _filtros: agendaFilters(data),
            _pagina: data.pagina,
            _limite: data.limite,
          })
          .abortSignal(getRequest().signal),
      ),
    ),
  );
export const obterEventoAgenda = createServerFn({ method: "GET" })
  .middleware([requireSupabaseAuth])
  .inputValidator(s.obterInput)
  .handler(async ({ context, data }) =>
    s.detalheAgenda.parse(
      agendaResult(
        await client(context.supabase)
          .rpc("ag_obter", { _org: data.organization_id, _id: data.id })
          .abortSignal(getRequest().signal),
      ),
    ),
  );
export const obterConfiguracaoAgenda = createServerFn({ method: "GET" })
  .middleware([requireSupabaseAuth])
  .inputValidator(s.configuracaoInput)
  .handler(async ({ context, data }) =>
    s.configuracaoAgenda.parse(
      agendaResult(
        await client(context.supabase)
          .rpc("ag_configuracao", { _org: data.organization_id })
          .abortSignal(getRequest().signal),
      ),
    ),
  );
export const buscarOpcoesAgenda = createServerFn({ method: "GET" })
  .middleware([requireSupabaseAuth])
  .inputValidator(s.opcoesInput)
  .handler(async ({ context, data }) =>
    s.opcoesPage.parse(
      agendaResult(
        await client(context.supabase)
          .rpc("ag_opcoes", {
            _org: data.organization_id,
            _tipo: data.tipo,
            _busca: data.busca,
            _cliente: data.cliente_id,
            _pagina: data.pagina,
            _limite: data.limite,
          })
          .abortSignal(getRequest().signal),
      ),
    ),
  );
export const listarPendentesAgenda = createServerFn({ method: "GET" })
  .middleware([requireSupabaseAuth])
  .inputValidator(s.pendentesInput)
  .handler(async ({ context, data }) =>
    s.pendentesPage.parse(
      agendaResult(
        await client(context.supabase)
          .rpc("ag_pendentes_v2", {
            _org: data.organization_id,
            _minhas: data.minhas,
            _filtros: agendaFilters({ ...data, minha: data.minhas }),
            _pagina: data.pagina,
            _limite: data.limite,
          })
          .abortSignal(getRequest().signal),
      ),
    ),
  );
export const listarNotificacoesAgenda = createServerFn({ method: "GET" })
  .middleware([requireSupabaseAuth])
  .inputValidator(s.notificacoesInput)
  .handler(async ({ context, data }) =>
    s.notificacoesPage.parse(
      agendaResult(
        await client(context.supabase)
          .rpc("ag_notificacoes", {
            _org: data.organization_id,
            _pagina: data.pagina,
            _limite: data.limite,
          })
          .abortSignal(getRequest().signal),
      ),
    ),
  );
export const listarHistoricoAgenda = createServerFn({ method: "GET" })
  .middleware([requireSupabaseAuth])
  .inputValidator(s.historicoInput)
  .handler(async ({ context, data }) => {
    const r = agendaResult(
      await client(context.supabase)
        .rpc("ag_historico", {
          _org: data.organization_id,
          _id: data.id,
          _tipo: data.tipo,
          _pagina: data.pagina,
          _limite: data.limite,
        })
        .abortSignal(getRequest().signal),
    );
    return data.tipo === "revisoes"
      ? { tipo: "revisoes" as const, ...s.revisoesPage.parse(r) }
      : { tipo: "comentarios" as const, ...s.comentariosPage.parse(r) };
  });
export const executarAgenda = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator(s.comandoInput)
  .handler(async ({ context, data }) =>
    s.reciboAgenda.parse(
      agendaResult(
        await client(context.supabase)
          .rpc("ag_executar", {
            _org: data.organization_id,
            _chave: data.chave,
            _comando: data.comando,
            _dados: data.dados,
          })
          .abortSignal(getRequest().signal),
      ),
    ),
  );

function agendaFilters(data: {
  demanda?: boolean;
  minha: boolean;
  busca: string;
  estado: string | null;
  tipo: string | null;
  equipe_id: string | null;
  pessoa_id: string | null;
  cliente_id: string | null;
  projeto_id: string | null;
  natureza: string | null;
  hora: number | null;
}) {
  return {
    demanda: data.demanda,
    minha: data.minha,
    busca: data.busca,
    estado: data.estado,
    tipo: data.tipo,
    equipe_id: data.equipe_id,
    pessoa_id: data.pessoa_id,
    cliente_id: data.cliente_id,
    projeto_id: data.projeto_id,
    natureza: data.natureza,
    hora: data.hora,
  };
}
export const obterDashboardAgenda = createServerFn({ method: "GET" })
  .middleware([requireSupabaseAuth])
  .inputValidator(s.dashboardInput)
  .handler(async ({ context, data }) =>
    s.dashboardAgenda.parse(
      agendaResult(
        await client(context.supabase)
          .rpc("ag_dashboard", {
            _org: data.organization_id,
            _inicio: data.inicio,
            _fim: data.fim,
            _filtros: agendaFilters(data),
          })
          .abortSignal(getRequest().signal),
      ),
    ),
  );
