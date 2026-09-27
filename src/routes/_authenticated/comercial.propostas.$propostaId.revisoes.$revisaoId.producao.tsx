import { createFileRoute } from "@tanstack/react-router";

import { Planejamento } from "@/features/propostas/Etapas";

export const Route = createFileRoute("/_authenticated/comercial/propostas/$propostaId/revisoes/$revisaoId/producao")({
  head: () => ({ meta: [{ title: "Planejamento de produção — Proposta — Sistema Nexus" }, { name: "description", content: "Planejamento de produção da revisão da proposta." }] }),
  component: Page,
});

function Page() {
  const { propostaId, revisaoId } = Route.useParams();
  void propostaId;
  return <Planejamento revisaoId={revisaoId} modo="producao" />;
}
