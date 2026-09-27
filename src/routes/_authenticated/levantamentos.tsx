import { createFileRoute } from "@tanstack/react-router";

import { NotConfigured, PageHeader } from "@/components/nexus/Page";

export const Route = createFileRoute("/_authenticated/levantamentos")({
  head: () => ({
    meta: [
      { title: "Levantamentos Técnicos — Sistema Nexus" },
      { name: "description", content: "Coleta de medições em campo por cliente e unidade." },
      { property: "og:title", content: "Levantamentos Técnicos — Sistema Nexus" },
      { property: "og:description", content: "Coleta de medições em campo por cliente e unidade." },
    ],
  }),
  component: () => (
    <div className="space-y-6">
      <PageHeader eyebrow="Levantamentos Técnicos" title="Levantamentos Técnicos" description="Coleta de medições em campo por cliente e unidade." />
      <NotConfigured what="O cadastro de levantamentos ainda não foi implementado. Enquanto isso, o dimensionamento é feito manualmente na proposta e fica identificado como manual." />
    </div>
  ),
});
