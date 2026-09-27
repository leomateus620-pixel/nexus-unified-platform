import { createFileRoute } from "@tanstack/react-router";

import { Historico } from "@/features/propostas/Etapas";

export const Route = createFileRoute(
  "/_authenticated/comercial/propostas/$propostaId/revisoes/$revisaoId/historico",
)({
  head: () => ({
    meta: [
      { title: "Histórico — Proposta — Sistema Nexus" },
      { name: "description", content: "Histórico da revisão da proposta." },
    ],
  }),
  component: Page,
});

function Page() {
  const { propostaId, revisaoId } = Route.useParams();
  void propostaId;
  return <Historico propostaId={propostaId} revisaoId={revisaoId} />;
}
