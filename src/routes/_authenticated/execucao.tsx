import { createFileRoute } from "@tanstack/react-router";

import { NotConfigured, PageHeader } from "@/components/nexus/Page";

export const Route = createFileRoute("/_authenticated/execucao")({
  head: () => ({
    meta: [
      { title: "Execução / OS — Sistema Nexus" },
      { name: "description", content: "Ordens de serviço, equipes e horas em campo." },
      { property: "og:title", content: "Execução / OS — Sistema Nexus" },
      { property: "og:description", content: "Ordens de serviço, equipes e horas em campo." },
    ],
  }),
  component: () => (
    <div className="space-y-6">
      <PageHeader eyebrow="Execução / OS" title="Execução / OS" description="Ordens de serviço, equipes e horas em campo." />
      <NotConfigured what="Ordens de serviço e integração com o RDO NEXUS ainda não estão configuradas." />
    </div>
  ),
});
