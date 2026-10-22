export const EQUIPE_ACESSO_INDISPONIVEL = "Equipe indisponível para seu acesso atual.";

export function acessoEquipeNegado(error: unknown) {
  return (
    typeof error === "object" &&
    error !== null &&
    "message" in error &&
    error.message === EQUIPE_ACESSO_INDISPONIVEL
  );
}
/** Datas de participação são civis e inclusivas, diferentes das reservas [início,fim). */
export function periodoMembro(inicio: string, fim: string | null) {
  const civil = (value: string) => value.split("-").reverse().join("/");
  return `${civil(inicio)} até ${fim ? civil(fim) + " (inclusive)" : "sem término definido"}`;
}
export function validarFimMembro(inicio: string, fim: string) {
  return !fim || fim >= inicio;
}
export function escapeEquipeSearch(value: string) {
  return value.replace(/[%_\\]/g, "\\$&");
}
