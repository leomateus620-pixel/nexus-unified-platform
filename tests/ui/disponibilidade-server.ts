// Isolated presentation transport. Never imported by application routes.
import { scenario } from "./data";
import "./operacional-server";
import { DISPONIBILIDADE_NEGADA } from "@/features/pessoas-competencias/disponibilidade/schemas";
const rows = [],
  receipts = new Map();
window.__nexusDisponibilidade = rows;
const clone = (value) => structuredClone(value);
export async function listarIndisponibilidades({ data }) {
  window.__nexusCalls.push({ name: "listarIndisponibilidades", payload: { data } });
  if (window.__disponibilidadeDenied) throw new Error(DISPONIBILIDADE_NEGADA);
  if (window.__disponibilidadeReadFail) throw new Error("Falha de rede na disponibilidade.");
  const items = rows.filter(
    (r) => r.organization_id === data.organization_id && r.pessoa_id === data.pessoa_id,
  );
  return {
    registros: clone(items.slice(data.pagina * 25, data.pagina * 25 + 25)),
    total: items.length,
    pagina: data.pagina,
    limite: 25,
    pode_gerir: scenario !== "restricted",
    timezone: window.__disponibilidadeTimezone || "America/Sao_Paulo",
  };
}
export async function executarIndisponibilidade({ data }) {
  window.__nexusCalls.push({ name: "executarIndisponibilidade", payload: { data } });
  if (window.__disponibilidadeDenied) throw new Error(DISPONIBILIDADE_NEGADA);
  if (window.__disponibilidadeFail)
    throw new Error(
      "Não foi possível confirmar a disponibilidade. Tente novamente; o preenchimento foi preservado.",
    );
  if (window.__disponibilidadeConflict)
    throw new Error(
      "A pessoa tem compromisso confirmado neste período. Reprograme a visita na Agenda antes de registrar a indisponibilidade.",
    );
  const hash = JSON.stringify({ comando: data.comando, dados: data.dados });
  if (receipts.has(data.chave)) {
    const previous = receipts.get(data.chave);
    if (previous.hash !== hash) throw new Error("Chave reutilizada com outro conteúdo.");
    return clone(rows.find((r) => r.id === previous.id));
  }
  let row;
  if (data.comando === "registrar") {
    row = {
      id: crypto.randomUUID(),
      organization_id: data.organization_id,
      pessoa_id: data.dados.pessoa_id,
      inicio: data.dados.inicio_local + ":00-03:00",
      fim: data.dados.fim_local + ":00-03:00",
      motivo_operacional: data.dados.motivo,
      version: 1,
      cancelada_em: null,
      motivo_cancelamento: null,
      created_at: new Date().toISOString(),
    };
    rows.unshift(row);
  } else {
    row = rows.find((r) => r.id === data.dados.id);
    if (row.version !== data.dados.expected_version)
      throw new Error(
        "O bloqueio mudou. Recarregue a lista antes de cancelar; seu motivo foi preservado.",
      );
    row.version += 1;
    row.cancelada_em = new Date().toISOString();
    row.motivo_cancelamento = data.dados.motivo;
  }
  receipts.set(data.chave, { hash, id: row.id });
  return clone(row);
}
