import { useQuery, type QueryClient } from "@tanstack/react-query";
import { useServerFn } from "@tanstack/react-start";
import { listarEstudos, obterEstudo, listarMetodosEstudo } from "./estudos.functions";
import type { EstadoEstudo } from "./types";

export type EstudosFiltros = {
  busca?: string;
  estado?: EstadoEstudo | null;
  responsavel_id?: string | null;
  cliente_id?: string | null;
  pagina?: number;
  limite?: number;
};
export const estudoKeys = {
  all: (org: string) => ["estudos", org] as const,
  list: (org: string, filters: EstudosFiltros) => ["estudos", org, "lista", filters] as const,
  detail: (org: string, id: string | null, revisao: string | null) =>
    ["estudos", org, "ficha", id, revisao] as const,
  methods: (org: string, busca: string, pagina: number) =>
    ["estudo-opcoes", org, "metodos", busca, pagina] as const,
};
const freshness = {
  staleTime: 30_000,
  refetchInterval: 30_000,
  refetchOnWindowFocus: "always" as const,
  retry: false as const,
};
export function useEstudosList(org: string, filters: EstudosFiltros = {}) {
  const load = useServerFn(listarEstudos);
  return useQuery({
    queryKey: estudoKeys.list(org, filters),
    enabled: !!org,
    ...freshness,
    queryFn: ({ signal }) => load({ data: { organization_id: org, ...filters }, signal }),
  });
}
export function useEstudoDetail(org: string, id: string | null, revisao: string | null = null) {
  const load = useServerFn(obterEstudo);
  return useQuery({
    queryKey: estudoKeys.detail(org, id, revisao),
    enabled: !!org && !!id,
    ...freshness,
    queryFn: ({ signal }) =>
      load({ data: { organization_id: org, estudo_id: id!, revisao_id: revisao }, signal }),
  });
}
export function useMetodosEstudo(org: string, busca = "", pagina = 0) {
  const load = useServerFn(listarMetodosEstudo);
  return useQuery({
    queryKey: estudoKeys.methods(org, busca, pagina),
    enabled: !!org,
    ...freshness,
    queryFn: ({ signal }) => load({ data: { organization_id: org, busca, pagina }, signal }),
  });
}
export async function invalidarEstudos(client: QueryClient, org: string) {
  await Promise.all([
    client.invalidateQueries({ queryKey: estudoKeys.all(org) }),
    client.invalidateQueries({ queryKey: ["estudo-arquivos", org] }),
    client.invalidateQueries({ queryKey: ["estudo-opcoes", org] }),
    client.invalidateQueries({ queryKey: ["acoes-operacionais", org] }),
  ]);
}
