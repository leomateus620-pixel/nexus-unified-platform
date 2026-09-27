import { createFileRoute } from "@tanstack/react-router";

import { ItensComerciais } from "@/features/propostas/ItensComerciais";

export const Route = createFileRoute(
  "/_authenticated/comercial/propostas/$propostaId/revisoes/$revisaoId/itens-comerciais",
)({
  head: () => ({
    meta: [
      { title: "Itens comerciais — Proposta — Sistema Nexus" },
      { name: "description", content: "Itens comerciais da revisão da proposta." },
    ],
  }),
  component: Page,
});

function Page() {
  const { propostaId, revisaoId } = Route.useParams();
  void propostaId;
  return <ItensComerciais revisaoId={revisaoId} />;
}
