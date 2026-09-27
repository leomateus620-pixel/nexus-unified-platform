import { createFileRoute, Link } from "@tanstack/react-router";

import { NotConfigured, PageHeader, Section } from "@/components/nexus/Page";

export const Route = createFileRoute("/_authenticated/engenharia/")({
  head: () => ({
    meta: [
      { title: "Engenharia — Sistema Nexus" },
      {
        name: "description",
        content: "Regras técnicas versionadas e dimensionamentos das propostas.",
      },
      { property: "og:title", content: "Engenharia — Sistema Nexus" },
      { property: "og:description", content: "Regras técnicas e dimensionamentos." },
    ],
  }),
  component: () => (
    <div className="space-y-6">
      <PageHeader
        eyebrow="Engenharia"
        title="Engenharia"
        description="Regras técnicas versionadas e acesso aos mesmos dimensionamentos usados nas propostas."
      />
      <div className="grid gap-4 md:grid-cols-2">
        <Section title="Regras de dimensionamento">
          <Link
            to="/engenharia/regras-dimensionamento"
            className="text-sm text-primary hover:underline"
          >
            Gerenciar versões das regras →
          </Link>
        </Section>
        <Section title="Dimensionamentos">
          <Link to="/engenharia/dimensionamentos" className="text-sm text-primary hover:underline">
            Ver sistemas dimensionados por revisão →
          </Link>
        </Section>
      </div>
      <Section title="Apreciações de risco e laudos">
        <NotConfigured what="O cadastro de estudos técnicos (apreciação de risco, classificação de espaços confinados) ainda não foi implementado." />
      </Section>
    </div>
  ),
});
