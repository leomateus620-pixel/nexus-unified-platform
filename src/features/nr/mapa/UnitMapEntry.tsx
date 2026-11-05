import "./mapa.css";
import { Link } from "@tanstack/react-router";
import { useQuery } from "@tanstack/react-query";
import { useServerFn } from "@tanstack/react-start";
import { Box } from "lucide-react";
import { nrMapaContexto } from "./mapa.functions";
import type { NrSearch } from "../NrWorkspace";
import type { Norma } from "../domain";
export function UnitMapEntry({
  org,
  user,
  norma,
  search,
  option = false,
}: {
  org: string;
  user: string;
  norma: Norma;
  search: NrSearch;
  option?: boolean;
}) {
  const load = useServerFn(nrMapaContexto);
  const q = useQuery({
    queryKey: ["nr", org, user, norma, "cena-associada", search.cliente, search.unidade],
    enabled: !!search.cliente && !!search.unidade && search.escopo !== "todos",
    queryFn: ({ signal }) =>
      load({
        data: {
          organization_id: org,
          cliente_id: search.cliente,
          unidade_id: search.unidade,
          norma,
          manifesto: false,
        },
        signal,
      }),
    retry: false,
    staleTime: 15000,
  });
  if (!q.data?.cena) return null;
  if (option) return <option value="mapa-3d">Mapa 3D</option>;
  return (
    <Link
      className="nr-map-entry"
      to={String(`${norma === "NR33" ? "/nr-33" : "/nr-35"}/mapa-3d`)}
      search={{ ...search, local: "", objeto: "", painel: "resumo" }}
    >
      <Box size={18} aria-hidden /> <span>3D</span>
    </Link>
  );
}
