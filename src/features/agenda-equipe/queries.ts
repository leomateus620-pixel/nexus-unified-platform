import { useQuery, type QueryClient } from "@tanstack/react-query";
import { useServerFn } from "@tanstack/react-start";
import type { z } from "zod";
import type { listarInput, pendentesInput } from "./schemas";
import {
  obterAcaoAgenda,
  obterDashboardAgenda,
  listarAgenda,
  obterConfiguracaoAgenda,
  obterEventoAgenda,
  listarPendentesAgenda,
  listarNotificacoesAgenda,
  listarHistoricoAgenda,
} from "./agenda.functions";
export function useAgendaAction(org: string, id: string | null, enabled = true) {
  const load = useServerFn(obterAcaoAgenda);
  return useQuery({
    queryKey: ["acoes-operacionais", org, "agenda", id],
    enabled: enabled && !!org && !!id,
    ...agendaFreshness,
    queryFn: ({ signal }) => load({ data: { organization_id: org, id: id! }, signal }),
  });
}
export const agendaFreshness = {
  staleTime: 30_000,
  refetchInterval: 30_000,
  refetchOnWindowFocus: "always" as const,
  retry: false as const,
};
export const agendaKeys = {
  all: (org: string) => ["agenda-equipe", org] as const,
  configuration: (org: string, user: string) =>
    ["agenda-equipe", org, "configuracao", user] as const,
  list: (data: z.input<typeof listarInput>) =>
    ["agenda-equipe", data.organization_id, "lista", data] as const,
  detail: (org: string, id: string | null) => ["agenda-equipe", org, "evento", id] as const,
  pending: (data: z.input<typeof pendentesInput>) =>
    ["agenda-equipe", data.organization_id, "pendentes", data] as const,
  notifications: (org: string, page: number) =>
    ["agenda-equipe", org, "notificacoes", page] as const,
  history: (org: string, id: string, tipo: string, page: number) =>
    ["agenda-equipe", org, "historico", id, tipo, page] as const,
};
export function useAgendaConfiguration(org: string, user: string, enabled = true) {
  const load = useServerFn(obterConfiguracaoAgenda);
  return useQuery({
    queryKey: agendaKeys.configuration(org, user),
    enabled: enabled && !!org && !!user,
    ...agendaFreshness,
    queryFn: ({ signal }) => load({ data: { organization_id: org }, signal }),
  });
}
export function useAgendaList(data: z.input<typeof listarInput>, enabled = true) {
  const load = useServerFn(listarAgenda);
  return useQuery({
    queryKey: agendaKeys.list(data),
    enabled: enabled && !!data.organization_id,
    ...agendaFreshness,
    queryFn: ({ signal }) => load({ data, signal }),
  });
}
export function useAgendaDetail(org: string, id: string | null, enabled = true) {
  const load = useServerFn(obterEventoAgenda);
  return useQuery({
    queryKey: agendaKeys.detail(org, id),
    enabled: enabled && !!org && !!id,
    ...agendaFreshness,
    queryFn: ({ signal }) => load({ data: { organization_id: org, id: id! }, signal }),
  });
}
export function useAgendaPending(data: z.input<typeof pendentesInput>, enabled: boolean) {
  const load = useServerFn(listarPendentesAgenda);
  return useQuery({
    queryKey: agendaKeys.pending(data),
    enabled: enabled && !!data.organization_id,
    ...agendaFreshness,
    queryFn: ({ signal }) => load({ data, signal }),
  });
}
export function useAgendaNotifications(org: string, page: number, enabled: boolean) {
  const load = useServerFn(listarNotificacoesAgenda);
  return useQuery({
    queryKey: agendaKeys.notifications(org, page),
    enabled: enabled && !!org,
    ...agendaFreshness,
    queryFn: ({ signal }) => load({ data: { organization_id: org, pagina: page }, signal }),
  });
}
export function useAgendaHistory(
  org: string,
  id: string,
  tipo: "revisoes" | "comentarios",
  page: number,
) {
  const load = useServerFn(listarHistoricoAgenda);
  return useQuery({
    queryKey: agendaKeys.history(org, id, tipo, page),
    enabled: !!org && !!id,
    ...agendaFreshness,
    queryFn: ({ signal }) =>
      load({ data: { organization_id: org, id, tipo, pagina: page }, signal }),
  });
}
export async function invalidateAgenda(qc: QueryClient, org: string) {
  await Promise.all([
    qc.invalidateQueries({ queryKey: agendaKeys.all(org) }),
    qc.invalidateQueries({ queryKey: ["acoes-operacionais", org] }),
    qc.invalidateQueries({ queryKey: ["levantamentos", org] }),
    qc.invalidateQueries({ queryKey: ["almoxarifado", org] }),
  ]);
}

export function useAgendaDashboard(data: import("./types").AgendaDashboardInput, enabled = true) {
  const load = useServerFn(obterDashboardAgenda);
  return useQuery({
    queryKey: [...agendaKeys.all(data.organization_id), "dashboard", data],
    enabled: enabled && !!data.organization_id,
    ...agendaFreshness,
    queryFn: ({ signal }) => load({ data, signal }),
  });
}
