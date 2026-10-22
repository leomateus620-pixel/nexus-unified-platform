import { useQuery, type QueryClient } from "@tanstack/react-query";
import { useServerFn } from "@tanstack/react-start";
import { listarLevantamentos, obterLevantamento } from "./levantamentos.functions";
import type { EstadoLevantamento } from "./types";

export const levantamentoKeys = {
  all: (org: string) => ["levantamentos", org] as const,
  list: (org: string, filters: LevantamentosFiltros) =>
    ["levantamentos", org, "lista", filters] as const,
  detail: (org: string, id: string | null, revisao: string | null) =>
    ["levantamentos", org, "ficha", id, revisao] as const,
};
export type LevantamentosFiltros = {
  busca?: string;
  estado?: EstadoLevantamento | null;
  cliente_id?: string | null;
  responsavel_id?: string | null;
  pagina?: number;
  limite?: number;
};
const freshness = {
  staleTime: 30_000,
  refetchInterval: 30_000,
  refetchOnWindowFocus: "always" as const,
  retry: false as const,
};
export function useLevantamentosList(org: string, filters: LevantamentosFiltros = {}) {
  const load = useServerFn(listarLevantamentos);
  return useQuery({
    queryKey: levantamentoKeys.list(org, filters),
    enabled: !!org,
    ...freshness,
    queryFn: ({ signal }) => load({ data: { organization_id: org, ...filters }, signal }),
  });
}
export function useLevantamentoDetail(
  org: string,
  id: string | null,
  revisao: string | null = null,
) {
  const load = useServerFn(obterLevantamento);
  return useQuery({
    queryKey: levantamentoKeys.detail(org, id, revisao),
    enabled: !!org && !!id,
    ...freshness,
    queryFn: ({ signal }) =>
      load({ data: { organization_id: org, levantamento_id: id!, revisao_id: revisao }, signal }),
  });
}
export async function invalidarLevantamentos(
  client: QueryClient,
  org: string,
  revisaoDestino?: string,
) {
  await Promise.all([
    client.invalidateQueries({ queryKey: levantamentoKeys.all(org) }),
    client.invalidateQueries({ queryKey: ["levantamento-arquivos", org] }),
    // Chave canônica legada da revisão: não reproduzir seus cálculos no novo domínio.
    ...(revisaoDestino ? [client.invalidateQueries({ queryKey: ["rev", revisaoDestino] })] : []),
  ]);
}
