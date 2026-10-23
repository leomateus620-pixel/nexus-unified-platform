import { createFileRoute, useNavigate } from "@tanstack/react-router";
import { z } from "zod";
import { AlmoxarifadoWorkspace } from "@/features/almoxarifado/AlmoxarifadoWorkspace";
import {
  tipoConsultaEstoqueSchema,
  tipoDetalheEstoqueSchema,
} from "@/features/almoxarifado/schemas";

export const Route = createFileRoute("/_authenticated/almoxarifado")({
  validateSearch: z.object({
    aba: tipoConsultaEstoqueSchema.default("materiais").catch("materiais"),
    detalhe: tipoDetalheEstoqueSchema.default("materiais").catch("materiais"),
    registro: z.string().uuid().optional().catch(undefined),
    busca: z.string().max(120).default(""),
    estado: z.string().max(40).default(""),
    local: z.string().uuid().optional().catch(undefined),
    pagina: z.coerce.number().int().min(0).max(10000).default(0).catch(0),
  }),
  head: () => ({ meta: [{ title: "Almoxarifado e Ferramentas — Sistema Nexus" }] }),
  component: Pagina,
});
function Pagina() {
  const search = Route.useSearch(),
    navigate = useNavigate({ from: Route.fullPath });
  return (
    <AlmoxarifadoWorkspace
      search={{ ...search, registro: search.registro || "", local: search.local || "" }}
      onSearch={(patch) =>
        navigate({
          replace: !("registro" in patch) && !("aba" in patch),
          search: (previous) => ({
            ...previous,
            ...patch,
            registro: (patch.registro ?? previous.registro) || undefined,
            local: (patch.local ?? previous.local) || undefined,
          }),
        })
      }
    />
  );
}
