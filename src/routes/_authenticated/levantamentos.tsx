import { createFileRoute, useNavigate } from "@tanstack/react-router";
import { z } from "zod";
import { LevantamentosWorkspace } from "@/features/levantamentos/LevantamentosWorkspace";
import { estadoLevantamentoSchema } from "@/features/levantamentos/schemas";

export const Route = createFileRoute("/_authenticated/levantamentos")({
  validateSearch: z.object({
    levantamento: z.string().uuid().optional().catch(undefined),
    revisao: z.string().uuid().optional().catch(undefined),
    ponto: z.string().uuid().optional().catch(undefined),
    busca: z.string().max(120).default(""),
    estado: estadoLevantamentoSchema.optional().catch(undefined),
    pagina: z.coerce.number().int().min(0).max(100000).default(0).catch(0),
  }),
  head: () => ({
    meta: [
      { title: "Levantamentos Técnicos — Sistema Nexus" },
      { name: "description", content: "Coleta de medições em campo por cliente e unidade." },
      { property: "og:title", content: "Levantamentos Técnicos — Sistema Nexus" },
      { property: "og:description", content: "Coleta de medições em campo por cliente e unidade." },
    ],
  }),
  component: Pagina,
});

function Pagina() {
  const search = Route.useSearch();
  const navigate = useNavigate({ from: Route.fullPath });
  return (
    <LevantamentosWorkspace
      search={{
        ...search,
        levantamento: search.levantamento || "",
        revisao: search.revisao || "",
        ponto: search.ponto || "",
        estado: search.estado || "",
      }}
      onSearch={(patch) =>
        navigate({
          search: (previous) => ({
            ...previous,
            ...patch,
            levantamento: (patch.levantamento ?? previous.levantamento) || undefined,
            revisao: (patch.revisao ?? previous.revisao) || undefined,
            ponto: (patch.ponto ?? previous.ponto) || undefined,
            estado: (patch.estado ?? previous.estado) || undefined,
          }),
        })
      }
    />
  );
}
