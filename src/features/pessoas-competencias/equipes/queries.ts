import { useQuery } from "@tanstack/react-query";
import { useServerFn } from "@tanstack/react-start";
import { listarEquipes, obterEquipe } from "./functions";
import type { EquipesSearch } from "./types";

export const equipesKeys = {
  all: (org: string) => ["pessoas", org, "equipes"] as const,
  list: (org: string, search: Pick<EquipesSearch, "busca" | "pagina" | "arquivadas">) =>
    ["pessoas", org, "equipes", "lista", search] as const,
  detail: (org: string, id: string, pagina: number) =>
    ["pessoas", org, "equipes", "ficha", id, pagina] as const,
};
const freshness = {
  staleTime: 30_000,
  refetchInterval: 30_000,
  refetchOnWindowFocus: "always" as const,
  retry: false as const,
};
export function useEquipes(
  org: string,
  search: Pick<EquipesSearch, "busca" | "pagina" | "arquivadas">,
  enabled = true,
) {
  const load = useServerFn(listarEquipes);
  return useQuery({
    queryKey: equipesKeys.list(org, search),
    enabled: !!org && enabled,
    ...freshness,
    queryFn: ({ signal }) => load({ data: { organization_id: org, ...search }, signal }),
  });
}
export function useEquipe(org: string, id: string, pagina: number, enabled = true) {
  const load = useServerFn(obterEquipe);
  return useQuery({
    queryKey: equipesKeys.detail(org, id, pagina),
    enabled: !!org && !!id && enabled,
    ...freshness,
    queryFn: ({ signal }) =>
      load({ data: { organization_id: org, id, paginaMembros: pagina }, signal }),
  });
}
