import { addCivilDays } from "./calendar-domain";
import type { EventoInput } from "./types";

/** The end date persisted by the agenda is exclusive; the editor always shows the last included day. */
export function includedLastDay(exclusive: string | null | undefined) {
  if (!exclusive) return "";
  try {
    return addCivilDays(exclusive, -1);
  } catch {
    return "";
  }
}
export function exclusiveAfterDay(inclusive: string) {
  if (!inclusive) return "";
  try {
    return addCivilDays(inclusive, 1);
  } catch {
    return "";
  }
}
export function durationLabel(value: EventoInput) {
  if (value.dia_inteiro) {
    if (!value.data_inicio || !value.data_fim || value.data_fim <= value.data_inicio) return "";
    const days = (Date.parse(value.data_fim) - Date.parse(value.data_inicio)) / 86_400_000;
    return `${days} ${days === 1 ? "dia" : "dias"}`;
  }
  if (!value.inicio_local || !value.fim_local) return "";
  const minutes =
    (Date.parse(value.fim_local + "Z") - Date.parse(value.inicio_local + "Z")) / 60_000;
  if (!Number.isFinite(minutes) || minutes <= 0) return "";
  const hours = Math.floor(minutes / 60),
    rest = Math.round(minutes % 60);
  return hours ? `${hours}h${rest ? String(rest).padStart(2, "0") : ""}` : `${rest} min`;
}
export function chooseResponsible(value: EventoInput, person: string): EventoInput {
  return {
    ...value,
    responsavel_id: person,
    participantes: value.participantes.map((p) => ({
      ...p,
      funcao:
        p.pessoa_id === person
          ? "responsavel"
          : p.funcao === "responsavel"
            ? "participante"
            : p.funcao,
    })),
  };
}
