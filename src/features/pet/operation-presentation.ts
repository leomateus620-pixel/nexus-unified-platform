import { decimalCampo } from "./domain";
import type { PetDetalhe, PetOpcoes, PetOption } from "./ui-types";

type ModelProcedure = { agentes?: unknown };
export type PetAgentField = { agente: string; unidade: string };
export type PetReadingField = PetAgentField & { valor: string };
export type PetFinalSnapshot = {
  id: string;
  versao?: number;
  sha256?: string;
  condicaoFinal: string;
  motivo: string;
  terminoOperacional?: string;
};

/** The model defines the agents and units. No atmospheric limit is inferred here. */
export function petAssessmentAgents(model: PetOption | null | undefined): PetAgentField[] {
  const procedure = model?.["procedimento"] as ModelProcedure | undefined;
  if (!Array.isArray(procedure?.agentes)) return [];
  const seen = new Set<string>();
  return procedure.agentes.flatMap((value) => {
    if (!value || typeof value !== "object") return [];
    const row = value as Record<string, unknown>;
    const agente = typeof row["agente"] === "string" ? row["agente"] : "";
    const unidade = typeof row["unidade"] === "string" ? row["unidade"] : "";
    if (!agente.trim() || !unidade.trim() || seen.has(agente)) return [];
    seen.add(agente);
    return [{ agente, unidade }];
  });
}

export function petCurrentApprovedModel(detail: PetDetalhe, options: PetOpcoes): PetOption | null {
  const returned = detail.modelo;
  const id = detail.pet.modelo_versao_id;
  const model =
    (returned?.id === id ? returned : null) || options.modelos.find((item) => item.id === id);
  return model?.estado === "aprovado" ? model : null;
}

export function petStructuredReadings(fields: PetReadingField[], origem: string) {
  const seen = new Set<string>();
  if (!fields.length) throw new Error("O modelo aprovado precisa definir os agentes e unidades.");
  return fields.map((field) => {
    const agente = field.agente;
    const unidade = field.unidade;
    const valor = decimalCampo(field.valor);
    if (!agente.trim() || !unidade.trim() || valor === null)
      throw new Error(
        "Preencha agente, unidade e valor numérico de cada leitura. Use ponto ou vírgula decimal.",
      );
    if (seen.has(agente)) throw new Error(`O agente ${agente} está repetido nesta avaliação.`);
    seen.add(agente);
    return { agente, unidade, valor, origem };
  });
}

/** Reads a persisted snapshot; opening a closing view never issues a command. */
export function petFinalSnapshot(detail: PetDetalhe): PetFinalSnapshot | null {
  type Revision = PetDetalhe["revisoes"][number] & {
    finalidade?: string;
    versao?: number;
    sha256?: string;
    created_at?: string;
  };
  const revisions = (detail.revisoes || []) as Revision[];
  const current = detail.pet.revisao_atual_id;
  const finals = revisions.filter((revision) => revision.finalidade === "encerramento");
  const revision =
    finals.find((item) => item.id === current) ||
    [...finals].sort((a, b) => (b.versao || 0) - (a.versao || 0))[0];
  if (!revision?.conteudo) return null;
  const condition = revision.conteudo["condicao_final"];
  const reason = revision.conteudo["motivo"];
  if (typeof condition !== "string" || typeof reason !== "string") return null;
  const end = revision.conteudo["termino_operacional_em"];
  return {
    id: revision.id,
    ...(revision.versao !== undefined ? { versao: revision.versao } : {}),
    ...(revision.sha256 ? { sha256: revision.sha256 } : {}),
    condicaoFinal: condition,
    motivo: reason,
    ...(typeof end === "string" ? { terminoOperacional: end } : {}),
  };
}

export function petHistoricalName(
  detail: PetDetalhe,
  options: PetOpcoes,
  pessoaId: string,
): string {
  const participant = detail.participantes.find((person) => person.pessoa_id === pessoaId);
  const current = options.pessoas.find((person) => person.id === pessoaId);
  return participant?.nome_snapshot || participant?.nome || current?.nome || "Pessoa não informada";
}

export function petExitSignaturePending(detail: PetDetalhe) {
  return detail.presencas.filter((event) => event.tipo === "saida" && event.assinatura_pendente);
}
