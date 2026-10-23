export const qualificacoesKeys = {
  all: (org: string) => ["pessoas", org] as const,
  competencia: (org: string, id: string) =>
    ["pessoas", org, "competencias", "detalhe", id] as const,
  qualificacao: (org: string, id: string) =>
    ["pessoas", org, "qualificacoes", "detalhe", id] as const,
};
export const qualificacoesFreshness = {
  staleTime: 30_000,
  refetchInterval: 30_000,
  refetchOnWindowFocus: "always" as const,
  retry: false,
};
