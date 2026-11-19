import { useQuery } from "@tanstack/react-query";
import { useServerFn } from "@tanstack/react-start";
import { cruzAlta } from "./context";
import { caRdoPhotos } from "./rdo-photos.functions";
import type { CruzObject } from "./scene-types";

export function useRdoPhotos(user: string, object: CruzObject, active: boolean) {
  const listPhotos = useServerFn(caRdoPhotos);
  const scoped =
    object.kind === "estrutura" || object.kind === "componente" || object.kind === "lvhf";
  return useQuery({
    queryKey: ["cruz-alta", user, cruzAlta.org, object.id, "fotos-montagem"],
    queryFn: ({ signal }) =>
      listPhotos({ data: { organization_id: cruzAlta.org, chave: object.id }, signal }),
    enabled: scoped && active,
    gcTime: 60_000,
    staleTime: 30_000,
    refetchInterval: 60_000,
    retry: false,
  });
}
