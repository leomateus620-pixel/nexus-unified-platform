import { useQuery } from "@tanstack/react-query";
import { useServerFn } from "@tanstack/react-start";
import type { UnitScope } from "@/features/nr/mapa/types";
import { petDemoContexto, petDemoListar } from "./demo.functions";
export type DemoScope = UnitScope & { local_id?: string | undefined };
export function demoKey(scope: DemoScope, user: string) {
  return [
    "pet-demo",
    scope.organization_id,
    user,
    scope.cliente_id,
    scope.unidade_id,
    scope.norma,
    scope.local_id ?? "",
  ] as const;
}
export function useDemoContext(scope: DemoScope, user: string) {
  const load = useServerFn(petDemoContexto);
  return useQuery({
    queryKey: [...demoKey(scope, user), "contexto"],
    queryFn: ({ signal }) => load({ data: scope, signal }),
    retry: false,
    staleTime: 30000,
  });
}
export function useDemoList(
  scope: DemoScope,
  user: string,
  enabled: boolean,
  busca = "",
  grupo: "andamento" | "concluidas" = "andamento",
  pagina = 0,
) {
  const load = useServerFn(petDemoListar);
  return useQuery({
    queryKey: [...demoKey(scope, user), "lista", busca, grupo, pagina],
    queryFn: ({ signal }) => load({ data: { ...scope, busca, grupo, pagina }, signal }),
    enabled,
    retry: false,
    refetchInterval: 30000,
  });
}
