import type { EstadoQualificacao } from "./types";

export const QUALIFICACAO_ACESSO_INDISPONIVEL =
  "Competência ou qualificação indisponível para seu acesso atual.";
export function acessoQualificacaoNegado(error: unknown) {
  return (
    !!error &&
    typeof error === "object" &&
    "message" in error &&
    error.message === QUALIFICACAO_ACESSO_INDISPONIVEL
  );
}
export const estadoLabels: Record<EstadoQualificacao, string> = {
  enviada: "Enviada",
  em_conferencia: "Em conferência",
  validada: "Validada",
  revogada: "Revogada",
};
export function proximasDecisoes(
  estado: EstadoQualificacao,
  podeValidar: boolean,
): Record<string, string> {
  if (estado === "enviada") return { em_conferencia: "Iniciar conferência" };
  if (estado === "em_conferencia")
    return {
      enviada: "Devolver para correção",
      ...(podeValidar ? { validada: "Validar qualificação" } : {}),
    };
  if (estado === "validada") return { revogada: "Revogar validação" };
  return {};
}
/** A data de comparação é civil e explícita; não converte nem altera o estado histórico. */
export function situacaoNaData(
  estado: EstadoQualificacao,
  conclusao: string,
  validade: string | null,
  data: string,
) {
  if (estado !== "validada") return "Sem validação vigente";
  if (conclusao > data) return "Conclusão posterior à data consultada";
  if (validade && validade < data) return "Validade encerrada na data consultada";
  return validade
    ? "Dentro da validade declarada na data consultada"
    : "Sem data de validade cadastrada";
}
