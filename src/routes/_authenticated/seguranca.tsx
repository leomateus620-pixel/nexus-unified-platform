import { createFileRoute, useNavigate } from "@tanstack/react-router";
import { z } from "zod";
import { AcoesWorkspace } from "@/features/operacao/AcoesWorkspace";
export const Route = createFileRoute("/_authenticated/seguranca")({
  validateSearch: z.object({ acao: z.string().uuid().optional().catch(undefined) }),
  component: Pagina,
});
function Pagina() {
  const search = Route.useSearch();
  const navigate = useNavigate({ from: Route.fullPath });
  return (
    <AcoesWorkspace
      selectedId={search.acao}
      onSelect={(acao) =>
        navigate({ search: (previous) => ({ ...previous, acao: acao || undefined }) })
      }
    />
  );
}
