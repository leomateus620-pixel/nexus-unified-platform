import { createFileRoute } from "@tanstack/react-router";

import { Orcamento } from "@/features/propostas/Etapas";

export const Route = createFileRoute("/_authenticated/comercial/propostas/$propostaId/revisoes/$revisaoId/orcamento")({
  head: () => ({ meta: [{ title: "Orçamento — Proposta — Sistema Nexus" }, { name: "description", content: "Orçamento da revisão da proposta." }] }),
  component: Page,
});

function Page() {
  const { propostaId, revisaoId } = Route.useParams();
  void propostaId;
  return <Orcamento revisaoId={revisaoId} />;
}
