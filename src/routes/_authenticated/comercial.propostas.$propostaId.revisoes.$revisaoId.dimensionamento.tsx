import { createFileRoute } from "@tanstack/react-router";

import { Dimensionamento } from "@/features/propostas/Dimensionamento";

export const Route = createFileRoute(
  "/_authenticated/comercial/propostas/$propostaId/revisoes/$revisaoId/dimensionamento",
)({
  head: () => ({
    meta: [
      { title: "Dimensionamento — Proposta — Sistema Nexus" },
      { name: "description", content: "Dimensionamento da revisão da proposta." },
    ],
  }),
  component: Page,
});

function Page() {
  const { propostaId, revisaoId } = Route.useParams();
  void propostaId;
  return <Dimensionamento revisaoId={revisaoId} />;
}
