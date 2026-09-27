import { createFileRoute } from "@tanstack/react-router";

import { Resumo } from "@/features/propostas/Etapas";

export const Route = createFileRoute("/_authenticated/comercial/propostas/$propostaId/revisoes/$revisaoId/resumo-executivo")({
  head: () => ({ meta: [{ title: "Resumo executivo — Proposta — Sistema Nexus" }, { name: "description", content: "Resumo executivo da revisão da proposta." }] }),
  component: Page,
});

function Page() {
  const { propostaId, revisaoId } = Route.useParams();
  void propostaId;
  return <Resumo revisaoId={revisaoId} />;
}
