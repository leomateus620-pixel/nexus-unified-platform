import { tipoLabels } from "../domain";
export const number = new Intl.NumberFormat("pt-BR");
export const countLabel = (value: number) =>
  `${number.format(value)} ${value === 1 ? "evento" : "eventos"}`;
export const occupancyLabel = (value: number) =>
  `${number.format(value)} ${value === 1 ? "ocupação" : "ocupações"}`;
export const hourLabel = (value: number) =>
  `${String(value).padStart(2, "0")}h–${String(value + 1).padStart(2, "0")}h`;
export const categoryLabel = (value: string) =>
  tipoLabels[value as keyof typeof tipoLabels] ?? "Sem categoria";
export const minutesLabel = (value: number) => {
  const minutes = Math.round(value);
  if (minutes === 0) return "0h";
  const hours = Math.floor(minutes / 60);
  return hours
    ? `${hours}h${minutes % 60 ? String(minutes % 60).padStart(2, "0") : ""}`
    : `${minutes}min`;
};
export const initials = (value: string) =>
  value
    .trim()
    .split(/\s+/)
    .slice(0, 2)
    .map((part) => part[0])
    .join("")
    .toLocaleUpperCase("pt-BR");
