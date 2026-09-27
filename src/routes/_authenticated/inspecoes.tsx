import { createFileRoute } from "@tanstack/react-router";

import { NotConfigured, PageHeader } from "@/components/nexus/Page";

export const Route = createFileRoute("/_authenticated/inspecoes")({
  head: () => ({
    meta: [
      { title: "Inspeções — Sistema Nexus" },
      { name: "description", content: "Validades e revisões periódicas de sistemas instalados." },
      { property: "og:title", content: "Inspeções — Sistema Nexus" },
      {
        property: "og:description",
        content: "Validades e revisões periódicas de sistemas instalados.",
      },
    ],
  }),
  component: () => (
    <div className="space-y-6">
      <PageHeader
        eyebrow="Inspeções"
        title="Inspeções"
        description="Validades e revisões periódicas de sistemas instalados."
      />
      <NotConfigured what="O cadastro de inspeções periódicas ainda não foi implementado." />
    </div>
  ),
});
