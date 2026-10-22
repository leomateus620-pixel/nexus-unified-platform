import type { EventoAgenda, EventoInput } from "./types";
import { addCivilDays, formatCivil, formatInstant } from "./calendar-domain";
import { civilInZone, supportsTimezone } from "./calendar-domain";
export const AGENDA_ACESSO_NEGADO = "Atividade da agenda indisponível para seu acesso atual.";
export const acessoAgendaNegado = (error: unknown) =>
  !!error &&
  typeof error === "object" &&
  "message" in error &&
  error.message === AGENDA_ACESSO_NEGADO;
export const estadoLabels: Record<EventoAgenda["estado"], string> = {
  rascunho: "Rascunho",
  publicado: "Publicado",
  em_andamento: "Em andamento",
  concluido: "Concluído",
  cancelado: "Cancelado",
};
export const tipoLabels: Record<EventoAgenda["tipo"], string> = {
  visita_tecnica: "Visita técnica",
  levantamento: "Levantamento",
  execucao: "Execução em campo",
  inspecao: "Inspeção",
  manutencao: "Manutenção",
  reuniao: "Reunião",
  treinamento: "Treinamento",
  acao_interna: "Ação interna",
  deslocamento: "Deslocamento",
};
export function periodoEvento(event: EventoAgenda, zone = event.timezone) {
  return event.dia_inteiro && event.data_inicio && event.data_fim
    ? formatCivil(event.data_inicio) +
        " a " +
        formatCivil(addCivilDays(event.data_fim, -1)) +
        " · Dia inteiro"
    : formatInstant(event.inicio, zone) + " → " + formatInstant(event.fim, zone);
}
export function periodoCurto(event: EventoAgenda, zone = event.timezone) {
  if (event.dia_inteiro) return "Dia inteiro";
  if (!supportsTimezone(zone)) return "Fuso de exibição não suportado";
  const clock = (value: string) =>
    new Intl.DateTimeFormat("pt-BR", {
      timeZone: zone,
      hour: "2-digit",
      minute: "2-digit",
      hourCycle: "h23",
    }).format(new Date(value));
  const sameDay = civilInZone(event.inicio, zone) === civilInZone(event.fim, zone);
  return (
    clock(event.inicio) +
    " → " +
    clock(event.fim) +
    (sameDay ? "" : " · até " + formatCivil(civilInZone(event.fim, zone)))
  );
}
export function localInZone(instant: string, timezone: string) {
  const parts = new Intl.DateTimeFormat("en-CA", {
    timeZone: timezone,
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
    hour: "2-digit",
    minute: "2-digit",
    second: "2-digit",
    hourCycle: "h23",
  }).formatToParts(new Date(instant));
  const part = (type: string) => parts.find((p) => p.type === type)?.value ?? "";
  return `${part("year")}-${part("month")}-${part("day")}T${part("hour")}:${part("minute")}:${part("second")}`;
}
export function inputFromDetail(detail: import("./types").DetalheAgenda): EventoInput {
  const e = detail.evento;
  return {
    titulo: e.titulo,
    descricao: e.descricao,
    tipo: e.tipo,
    timezone: e.timezone,
    dia_inteiro: e.dia_inteiro,
    ...(e.dia_inteiro
      ? { data_inicio: e.data_inicio, data_fim: e.data_fim }
      : supportsTimezone(e.timezone)
        ? {
            inicio_local: localInZone(e.inicio, e.timezone),
            fim_local: localInZone(e.fim, e.timezone),
          }
        : { inicio: e.inicio, fim: e.fim }),
    local: e.local,
    responsavel_id: e.responsavel_id,
    acao_id: e.acao_id,
    levantamento_id: e.levantamento_id,
    origem_ocorrencia: e.origem_ocorrencia,
    bloqueia_recursos: e.bloqueia_recursos,
    participantes: detail.participantes
      .filter((p) => p.vigente)
      .map((p) => ({ pessoa_id: p.pessoa_id, funcao: p.funcao })),
    competencias: detail.competencias.map((c) => c.competencia_id),
    equipes: [],
    ferramentas: detail.ferramentas
      .filter((f) => f.estado !== "cancelada")
      .map((f) => ({ ferramenta_id: f.ferramenta_id, pessoa_id: f.pessoa_id })),
    cliente_id: e.cliente_id,
    unidade_id: e.unidade_id,
    projeto_id: e.projeto_id,
    visibilidade: e.visibilidade,
  };
}
/** Edição apenas textual não pode mudar a ocorrência de um horário repetido no fuso. */
export function eventForSave(
  value: EventoInput,
  base: import("./types").DetalheAgenda | null,
): EventoInput {
  if (!base || value.dia_inteiro || base.evento.dia_inteiro) return value;
  const original = inputFromDetail(base);
  if (
    value.timezone !== original.timezone ||
    value.inicio_local !== original.inicio_local ||
    value.fim_local !== original.fim_local
  )
    return value;
  const { inicio_local, fim_local, ...rest } = value;
  return { ...rest, inicio: base.evento.inicio, fim: base.evento.fim };
}
