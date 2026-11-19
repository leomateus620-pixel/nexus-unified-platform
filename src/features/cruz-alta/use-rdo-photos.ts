import { useQuery, useQueryClient } from "@tanstack/react-query";
import { useServerFn } from "@tanstack/react-start";
import { useEffect, useState } from "react";
import { cruzAlta } from "./context";
import { caRdoPhotos } from "./rdo-photos.functions";
import type { CruzObject } from "./scene-types";

export function useRdoPhotos(user: string, object: CruzObject, active: boolean) {
  const listPhotos = useServerFn(caRdoPhotos);
  const client = useQueryClient();
  const [page, setPage] = useState(0);
  const scoped =
    object.kind === "estrutura" || object.kind === "componente" || object.kind === "lvhf";
  const result = useQuery({
    queryKey: ["cruz-alta", user, cruzAlta.org, object.id, "fotos-montagem", page],
    queryFn: ({ signal }) =>
      listPhotos({ data: { organization_id: cruzAlta.org, chave: object.id, page }, signal }),
    enabled: scoped && active,
    gcTime: 60_000,
    staleTime: 30_000,
    refetchInterval: 60_000,
    retry: false,
  });
  useEffect(() => {
    if (active) return;
    void client.cancelQueries({
      queryKey: ["cruz-alta", user, cruzAlta.org, object.id, "fotos-montagem"],
    });
  }, [active, client, object.id, user]);
  return { ...result, page, setPage, active };
}
