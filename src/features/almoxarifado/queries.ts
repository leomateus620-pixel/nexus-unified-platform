import { useQuery, type QueryClient } from "@tanstack/react-query";
import { useServerFn } from "@tanstack/react-start";
import {
  buscarOpcoesAlmoxarifado,
  listarAlmoxarifado,
  obterAlmoxarifado,
} from "./almoxarifado.functions";
import type {
  AlmoxarifadoFiltros,
  TipoConsultaEstoque,
  TipoDetalheEstoque,
  TipoOpcaoAlmoxarifado,
} from "./types";

export const almoxarifadoKeys = {
  all: (org: string) => ["almoxarifado", org] as const,
  list: (org: string, tipo: TipoConsultaEstoque, filters: AlmoxarifadoFiltros) =>
    ["almoxarifado", org, "lista", tipo, filters] as const,
  detail: (org: string, tipo: TipoDetalheEstoque, id: string | null) =>
    ["almoxarifado", org, "ficha", tipo, id] as const,
  options: (
    org: string,
    tipo: TipoOpcaoAlmoxarifado,
    busca: string,
    local: string | null,
    pagina: number,
  ) => ["almoxarifado-opcoes", org, tipo, busca, local, pagina] as const,
};
const freshness = {
  staleTime: 30_000,
  refetchInterval: 30_000,
  refetchOnWindowFocus: "always" as const,
  retry: false as const,
};

export function useAlmoxarifadoList(
  org: string,
  tipo: TipoConsultaEstoque,
  filters: AlmoxarifadoFiltros = {},
) {
  const load = useServerFn(listarAlmoxarifado);
  return useQuery({
    queryKey: almoxarifadoKeys.list(org, tipo, filters),
    enabled: !!org,
    ...freshness,
    queryFn: ({ signal }) => load({ data: { organization_id: org, tipo, ...filters }, signal }),
  });
}

export function useAlmoxarifadoDetail(org: string, tipo: TipoDetalheEstoque, id: string | null) {
  const load = useServerFn(obterAlmoxarifado);
  return useQuery({
    queryKey: almoxarifadoKeys.detail(org, tipo, id),
    enabled: !!org && !!id,
    ...freshness,
    queryFn: ({ signal }) => load({ data: { organization_id: org, tipo, id: id! }, signal }),
  });
}

export function useAlmoxarifadoOptions(
  org: string,
  tipo: TipoOpcaoAlmoxarifado,
  busca = "",
  local: string | null = null,
  pagina = 0,
) {
  const load = useServerFn(buscarOpcoesAlmoxarifado);
  return useQuery({
    queryKey: almoxarifadoKeys.options(org, tipo, busca, local, pagina),
    enabled: !!org,
    ...freshness,
    queryFn: ({ signal }) =>
      load({ data: { organization_id: org, tipo, busca, local_id: local, pagina }, signal }),
  });
}

export async function invalidarAlmoxarifado(
  client: QueryClient,
  org: string,
  origem?: { projetoId?: string; ordemCompraId?: string; ordemProducaoId?: string },
) {
  await Promise.all([
    client.invalidateQueries({ queryKey: almoxarifadoKeys.all(org) }),
    client.invalidateQueries({ queryKey: ["almoxarifado-opcoes", org] }),
    client.invalidateQueries({ queryKey: ["ordens", "oc", org] }),
    client.invalidateQueries({ queryKey: ["ordens", "op", org] }),
    client.invalidateQueries({ queryKey: ["ordens", "demandas", org] }),
    client.invalidateQueries({ queryKey: ["projetos", org] }),
    ...(origem?.projetoId
      ? [client.invalidateQueries({ queryKey: ["projetos", "det", origem.projetoId] })]
      : []),
    ...(origem?.ordemCompraId
      ? [client.invalidateQueries({ queryKey: ["ordens", "oc-det", origem.ordemCompraId] })]
      : []),
    ...(origem?.ordemProducaoId
      ? [client.invalidateQueries({ queryKey: ["ordens", "op-det", origem.ordemProducaoId] })]
      : []),
  ]);
}
