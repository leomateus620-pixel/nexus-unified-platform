/** Datas civis para apresentação: nunca representam uma reserva ou regra de recorrência. */
const civilPattern = /^\d{4}-\d{2}-\d{2}$/;
export function civilDate(value: string): Date {
  if (!civilPattern.test(value)) throw new Error("A data do calendário é inválida.");
  const parsed = new Date(value + "T12:00:00Z");
  if (
    !Number.isFinite(parsed.getTime()) ||
    parsed.toISOString().slice(0, 10) !== value ||
    parsed.getUTCFullYear() < 1
  )
    throw new Error("A data do calendário é inválida.");
  return parsed;
}
export function addCivilDays(value: string, delta: number): string {
  if (!Number.isSafeInteger(delta) || Math.abs(delta) > 370)
    throw new Error("O deslocamento do calendário excede o intervalo permitido.");
  const parsed = civilDate(value);
  parsed.setUTCDate(parsed.getUTCDate() + delta);
  return parsed.toISOString().slice(0, 10);
}
export function mondayOf(value: string): string {
  const day = civilDate(value).getUTCDay();
  return addCivilDays(value, day === 0 ? -6 : 1 - day);
}
export function daysInWindow(start: string, endExclusive: string): string[] {
  civilDate(start);
  civilDate(endExclusive);
  if (endExclusive <= start) throw new Error("O fim da janela deve ser posterior ao início.");
  const days: string[] = [];
  for (let value = start; value < endExclusive; value = addCivilDays(value, 1)) {
    if (days.length >= 93) throw new Error("A janela do calendário não pode exceder 93 dias.");
    days.push(value);
  }
  return days;
}
export function calendarWindow(date: string, view: "semana" | "mes" | "lista") {
  if (view === "mes") {
    const parsed = civilDate(date);
    const first = date.slice(0, 8) + "01";
    const start = mondayOf(first);
    return {
      start,
      endExclusive: addCivilDays(start, 42),
      month: parsed.getUTCMonth() + 1,
    };
  }
  const start = mondayOf(date);
  return {
    start,
    endExclusive: addCivilDays(start, 7),
    month: civilDate(date).getUTCMonth() + 1,
  };
}
export function civilInZone(instant: string, timezone: string): string {
  const formatter = new Intl.DateTimeFormat("en-CA", {
    timeZone: timezone,
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
  });
  const parts = formatter.formatToParts(new Date(instant));
  const part = (type: Intl.DateTimeFormatPartTypes) =>
    parts.find((p) => p.type === type)?.value ?? "";
  const value = part("year") + "-" + part("month") + "-" + part("day");
  civilDate(value);
  return value;
}
export function formatCivil(
  value: string,
  options: Intl.DateTimeFormatOptions = { day: "2-digit", month: "2-digit" },
): string {
  return new Intl.DateTimeFormat("pt-BR", {
    ...options,
    timeZone: "UTC",
  }).format(civilDate(value));
}
export function formatInstant(instant: string, timezone: string): string {
  if (!supportsTimezone(timezone))
    return (
      "Instante original: " + instant + " (fuso não suportado neste navegador: " + timezone + ")"
    );
  return new Intl.DateTimeFormat("pt-BR", {
    timeZone: timezone,
    dateStyle: "short",
    timeStyle: "short",
  }).format(new Date(instant));
}
export function supportsTimezone(timezone: string): boolean {
  try {
    new Intl.DateTimeFormat("pt-BR", { timeZone: timezone });
    return true;
  } catch {
    return false;
  }
}
