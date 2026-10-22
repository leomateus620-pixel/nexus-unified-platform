import type { EstudoJson } from "./schemas";
import type { EstadoEstudo, EstudoDetalhe, EstudoSubmissao, TipoEstudo } from "./types";

export const ESTUDO_ACESSO_INDISPONIVEL = "Estudo ou fonte indisponível para seu acesso atual.";
export function acessoEstudoNegado(error: unknown): boolean {
  return (
    error !== null &&
    typeof error === "object" &&
    "message" in error &&
    error.message === ESTUDO_ACESSO_INDISPONIVEL
  );
}

export const estadosEstudo: Record<EstadoEstudo, string> = {
  elaboracao: "Em elaboração",
  em_revisao: "Em revisão",
  aprovado: "Aprovado",
  substituido: "Substituído",
  cancelado: "Cancelado",
};
export const tiposEstudo: Record<TipoEstudo, string> = {
  apreciacao_riscos: "Apreciação de riscos",
  classificacao: "Classificação",
  memorial: "Memorial",
  solucao: "Solução técnica",
};
export const prioridadesMedida = {
  baixa: "Baixa",
  normal: "Normal",
  alta: "Alta",
  critica: "Crítica",
} as const;
export const tiposFonteEstudo = {
  levantamento: "Levantamento aprovado",
  projeto_engenharia: "Acervo de engenharia congelado",
  documento: "Documento emitido",
} as const;

export function pendenciasEstudo(detail: EstudoDetalhe): string[] {
  // A lista é calculada pelo backend. A interface não inventa classificação ou critério normativo.
  return [...detail.bloqueios];
}
function objeto(value: EstudoJson | undefined): { [key: string]: EstudoJson } {
  return value && typeof value === "object" && !Array.isArray(value) ? value : {};
}
function estavel(value: EstudoJson | undefined): string {
  if (value === undefined || value === null) return "";
  if (typeof value === "string") return value;
  const normalized = (v: EstudoJson): EstudoJson => {
    if (Array.isArray(v)) return v.map(normalized);
    if (v && typeof v === "object")
      return Object.fromEntries(
        Object.keys(v)
          .sort()
          .map((key) => [key, normalized(v[key] ?? null)]),
      );
    return v;
  };
  return JSON.stringify(normalized(value));
}
export type MudancaEstudo = { campo: string; anterior: string; atual: string };
export function compararSubmissoesEstudo(
  anterior: Pick<EstudoSubmissao, "snapshot">,
  atual: Pick<EstudoSubmissao, "snapshot">,
): MudancaEstudo[] {
  const antes = anterior.snapshot,
    depois = atual.snapshot;
  const revAntes = objeto(antes["revisao"]),
    revDepois = objeto(depois["revisao"]);
  const changes: MudancaEstudo[] = [];
  const add = (campo: string, a: EstudoJson | undefined, b: EstudoJson | undefined) => {
    const oldValue = estavel(a),
      newValue = estavel(b);
    if (oldValue !== newValue) changes.push({ campo, anterior: oldValue, atual: newValue });
  };
  for (const field of [
    "escopo",
    "premissas",
    "analise",
    "conclusao",
    "responsavel_tecnico_id",
    "revisor_id",
    "responsabilidade_tecnica",
    "art_referencia",
    "metodo_versao_id",
  ])
    add(field, revAntes[field], revDepois[field]);
  // Os blocos preservam os IDs/fontes do snapshot e nunca aplicam mudanças ao estudo.
  for (const field of ["perigos", "medidas", "fontes", "metodo", "arquivos"])
    add(field, antes[field], depois[field]);
  return changes;
}
