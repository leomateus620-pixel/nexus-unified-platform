import { useQuery, useQueryClient } from "@tanstack/react-query";
import { useServerFn } from "@tanstack/react-start";
import { consultarAcessoOperacional } from "./operacao.functions";

export type OperationalAccess = {
  gerirEquipe: boolean;
  gerirOperacao: boolean;
  revisarOperacao: boolean;
  pessoaId: string | null;
};
export function useOperationalAccess(org: string, user: string) {
  const load = useServerFn(consultarAcessoOperacional);
  const client = useQueryClient();
  const queryKey = ["operacao-acesso", org, user];
  return useQuery({
    queryKey,
    enabled: !!org && !!user,
    queryFn: async ({ signal }) => {
      const access = await load({ data: { organization_id: org }, signal });
      const previous = client.getQueryData<OperationalAccess>(queryKey);
      if (previous && JSON.stringify(previous) !== JSON.stringify(access)) {
        const sensitive = {
          predicate: (q: { queryKey: readonly unknown[] }) =>
            ["pessoas", "acoes-operacionais", "anexos"].includes(String(q.queryKey[0])),
        };
        await client.cancelQueries(sensitive);
        client.removeQueries(sensitive);
      }
      return access;
    },
    staleTime: 30_000,
    refetchInterval: 30_000,
    refetchOnWindowFocus: "always",
    retry: false,
  });
}
