import { createFileRoute, useNavigate } from "@tanstack/react-router";
import { z } from "zod";
import { EstudosWorkspace } from "@/features/estudos/EstudosWorkspace";
import { estadoEstudoSchema } from "@/features/estudos/schemas";

export const Route = createFileRoute("/_authenticated/engenharia/")({
  validateSearch: z.object({
    estudo: z.string().uuid().optional().catch(undefined),
    revisao: z.string().uuid().optional().catch(undefined),
    perigo: z.string().uuid().optional().catch(undefined),
    busca: z.string().max(120).default(""),
    estado: estadoEstudoSchema.optional().catch(undefined),
    pagina: z.coerce.number().int().min(0).max(10000).default(0).catch(0),
  }),
  head: () => ({
    meta: [
      { title: "Engenharia — Sistema Nexus" },
      { name: "description", content: "Estudos técnicos, métodos versionados e dimensionamentos." },
      { property: "og:title", content: "Engenharia — Sistema Nexus" },
      { property: "og:description", content: "Estudos técnicos e dimensionamentos." },
    ],
  }),
  component: Pagina,
});

function Pagina() {
  const search = Route.useSearch();
  const navigate = useNavigate({ from: Route.fullPath });
  return (
    <EstudosWorkspace
      search={{
        ...search,
        estudo: search.estudo || "",
        revisao: search.revisao || "",
        perigo: search.perigo || "",
        estado: search.estado || "",
      }}
      onSearch={(patch) =>
        navigate({
          search: (previous) => ({
            ...previous,
            ...patch,
            estudo: (patch.estudo ?? previous.estudo) || undefined,
            revisao: (patch.revisao ?? previous.revisao) || undefined,
            perigo: (patch.perigo ?? previous.perigo) || undefined,
            estado: (patch.estado ?? previous.estado) || undefined,
          }),
        })
      }
    />
  );
}
