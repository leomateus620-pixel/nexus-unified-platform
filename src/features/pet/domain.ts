/** Presentation helpers only. Authoritative intervals and transitions belong to SQL. */
export const PET_VERSAO = "1.0.0";
export function decimalCampo(value: string): number | null {
  if (!/^[+-]?\d+(?:[.,]\d+)?$/.test(value.trim())) return null;
  const n = Number(value.trim().replace(",", "."));
  return Number.isFinite(n) ? n : null;
}
export function duracaoApresentada(seconds: number): string {
  const s = Math.max(0, Math.floor(seconds));
  return `${Math.floor(s / 3600)}h ${String(Math.floor((s % 3600) / 60)).padStart(2, "0")}min ${String(s % 60).padStart(2, "0")}s`;
}
export function validadeTemporal(
  termino: string | null,
  agora: number,
): "nao_emitida" | "valida" | "expirada" {
  if (!termino || !Number.isFinite(Date.parse(termino))) return "nao_emitida";
  return agora >= Date.parse(termino) ? "expirada" : "valida";
}
export const DECLARACOES = {
  entrada:
    "Confirmo minha identidade e ciência dos perigos, controles, procedimentos de comunicação e resgate desta versão da PET. A entrada depende da autorização vigente e das condições verificadas no local.",
  saida:
    "Confirmo minha saída do espaço confinado no horário declarado. Esta confirmação não altera o registro imediato do fato pelo vigia.",
  emissao:
    "Conferi esta versão da PET e suas condições conforme o procedimento aprovado. A autorização é restrita ao espaço, atividade, equipe e jornada indicados.",
  encerramento:
    "Conferi as presenças, o término operacional, a condição final declarada e as pendências documentais registradas.",
} as const;
