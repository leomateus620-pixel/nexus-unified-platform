import { createFileRoute } from "@tanstack/react-router";
import { InspecoesWorkspace } from "@/features/inspecoes/InspecoesWorkspace";
import { inspecoesSearchSchema } from "@/features/inspecoes/route-state";

export const Route = createFileRoute("/_authenticated/inspecoes")({
  validateSearch: inspecoesSearchSchema,
  head: () => ({
    meta: [
      { title: "Inspeções SPIQ & SPCQ — Sistema Nexus" },
      {
        name: "description",
        content: "Ativos, laudos e reinspeções dos sistemas de proteção contra quedas.",
      },
    ],
  }),
  component: InspecoesRoute,
});

function InspecoesRoute() {
  const search = Route.useSearch();
  const navigate = Route.useNavigate();
  return (
    <InspecoesWorkspace
      search={search}
      atualizar={(update, replace = false) =>
        void navigate({ search: update, replace, resetScroll: false })
      }
    />
  );
}
