import { createFileRoute } from "@tanstack/react-router";

import { ParametrosRevisao } from "@/features/propostas/Etapas";

export const Route = createFileRoute(
  "/_authenticated/comercial/propostas/$propostaId/revisoes/$revisaoId/parametros",
)({
  head: () => ({
    meta: [
      { title: "Parâmetros — Proposta — Sistema Nexus" },
      { name: "description", content: "Parâmetros da revisão da proposta." },
    ],
  }),
  component: Page,
});

function Page() {
  const { propostaId, revisaoId } = Route.useParams();
  void propostaId;
  return <ParametrosRevisao revisaoId={revisaoId} />;
}
