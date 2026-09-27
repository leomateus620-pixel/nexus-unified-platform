/** Moeda pt-BR com duas casas (documentos e totais). */
export function brl(value: number | null | undefined, casas = 2) {
  if (value == null || !Number.isFinite(value)) return "—";
  return value.toLocaleString("pt-BR", {
    style: "currency",
    currency: "BRL",
    minimumFractionDigits: casas,
    maximumFractionDigits: casas,
  });
}
/** Custo unitário preservando precisão adicional quando existir. */
export function brlUnit(value: number | null | undefined) {
  if (value == null || !Number.isFinite(value)) return "—";
  const casas = Math.round(value * 100) === value * 100 ? 2 : 4;
  return brl(value, casas);
}
export function qtd(value: number | null | undefined, unidade?: string, casas = 2) {
  if (value == null || !Number.isFinite(value)) return "—";
  const s = value.toLocaleString("pt-BR", { maximumFractionDigits: casas });
  return unidade ? `${s} ${unidade}` : s;
}
export function pct(value: number | null | undefined) {
  if (value == null || !Number.isFinite(value)) return "—";
  return `${(value * 100).toLocaleString("pt-BR", { maximumFractionDigits: 2 })}%`;
}
export function dataBR(value: string | null | undefined) {
  if (!value) return "—";
  return new Date(value).toLocaleDateString("pt-BR");
}
