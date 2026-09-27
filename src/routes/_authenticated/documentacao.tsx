import { createFileRoute } from "@tanstack/react-router";

import { NotConfigured, PageHeader } from "@/components/nexus/Page";

export const Route = createFileRoute("/_authenticated/documentacao")({
  head: () => ({
    meta: [
      { title: "Documentação Técnica — Sistema Nexus" },
      { name: "description", content: "Documentos técnicos versionados." },
      { property: "og:title", content: "Documentação Técnica — Sistema Nexus" },
      { property: "og:description", content: "Documentos técnicos versionados." },
    ],
  }),
  component: () => (
    <div className="space-y-6">
      <PageHeader
        eyebrow="Documentação Técnica"
        title="Documentação Técnica"
        description="Documentos técnicos versionados."
      />
      <NotConfigured what="Laudos e dossiês ainda não foram implementados. Resumos executivos emitidos ficam na aba Resumo executivo de cada proposta, de forma imutável." />
    </div>
  ),
});
