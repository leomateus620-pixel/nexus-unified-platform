import { createFileRoute, useNavigate } from "@tanstack/react-router";
import { z } from "zod";
import { PessoasWorkspace } from "@/features/operacao/PessoasWorkspace";
export const Route = createFileRoute("/_authenticated/equipe")({
  validateSearch: z.object({
    busca: z.string().max(120).default(""),
    pagina: z.coerce.number().int().min(0).max(10000).default(0).catch(0),
    arquivadas: z.enum(["true", "false"]).optional().catch(undefined),
    pessoa: z.string().uuid().optional().catch(undefined),
  }),
  component: Pagina,
});
function Pagina() {
  const search = Route.useSearch();
  const navigate = useNavigate({ from: Route.fullPath });
  return (
    <PessoasWorkspace
      search={{ ...search, arquivadas: search.arquivadas === "true", pessoa: search.pessoa || "" }}
      onSearch={(patch) =>
        navigate({
          replace: !("pessoa" in patch),
          search: (previous) => ({
            ...previous,
            ...patch,
            pessoa: (patch.pessoa ?? previous.pessoa) || undefined,
            arquivadas:
              patch.arquivadas === undefined
                ? previous.arquivadas
                : patch.arquivadas
                  ? "true"
                  : "false",
          }),
        })
      }
    />
  );
}
