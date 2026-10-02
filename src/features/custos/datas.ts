import { dataBR } from "@/lib/format";

/** Datas de documento são dias do calendário, sem conversão de fuso horário. */
export function dataCalendarioValida(valor: string) {
  if (!/^\d{4}-\d{2}-\d{2}$/.test(valor)) return false;
  const data = new Date(`${valor}T00:00:00Z`);
  return Number.isFinite(data.getTime()) && data.toISOString().slice(0, 10) === valor;
}

/** Preserva date-only; timestamps de criação continuam usando a formatação local existente. */
export function dataCustoBR(valor: string | null | undefined) {
  if (valor && /^\d{4}-\d{2}-\d{2}$/.test(valor)) {
    return dataCalendarioValida(valor) ? valor.split("-").reverse().join("/") : "—";
  }
  return dataBR(valor);
}
