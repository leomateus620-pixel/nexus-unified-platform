import { createFileRoute } from "@tanstack/react-router";

import { Planejamento } from "@/features/propostas/Etapas";

export const Route = createFileRoute(
  "/_authenticated/comercial/propostas/$propostaId/revisoes/$revisaoId/compras",
)({
  head: () => ({
    meta: [
      { title: "Planejamento de compras — Proposta — Sistema Nexus" },
      { name: "description", content: "Planejamento de compras da revisão da proposta." },
    ],
  }),
  component: Page,
});

function Page() {
  const { propostaId, revisaoId } = Route.useParams();
  void propostaId;
  return <Planejamento revisaoId={revisaoId} modo="compras" />;
}
