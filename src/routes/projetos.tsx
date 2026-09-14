import { createFileRoute } from "@tanstack/react-router";

import {
  ActionButton,
  DataTable,
  PageHeader,
  Progress,
  Section,
  StatCard,
  StatusBadge,
} from "@/components/nexus/Page";
import { projetos } from "@/lib/nexus-data";
import { flowSteps } from "@/lib/nexus-nav";

export const Route = createFileRoute("/projetos")({
  head: () => ({
    meta: [
      { title: "Projetos — Sistema Nexus" },
      {
        name: "description",
        content:
          "Projetos aprovados, listas de materiais, prazos, ordens de produção e acompanhamento.",
      },
      { property: "og:title", content: "Projetos — Sistema Nexus" },
      {
        property: "og:description",
        content: "Acompanhamento de projetos aprovados, materiais e prazos.",
      },
    ],
  }),
  component: Projetos,
});

const etapaAtual = 10; // Execução

function Projetos() {
  return (
    <div className="space-y-6">
      <PageHeader
        eyebrow="Projetos"
        title="Projetos aprovados"
        description="Da aprovação da proposta à entrega: materiais, prazos, ordens de produção e avanço físico."
        actions={<ActionButton>Novo projeto</ActionButton>}
      />

      <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-4">
        <StatCard label="Projetos ativos" value="27" />
        <StatCard label="Entregas neste mês" value="6" tone="primary" />
        <StatCard label="Com prazo em risco" value="4" tone="danger" />
        <StatCard label="Avanço médio" value="57%" tone="info" />
      </div>

      <Section
        title="Trilha do projeto PRJ-0338"
        description="Cooperativa Vale Verde — adequação NR-12"
      >
        <ol className="flex flex-wrap gap-1.5">
          {flowSteps.map((step, i) => {
            const done = i < etapaAtual;
            const current = i === etapaAtual;
            return (
              <li
                key={step}
                className={
                  current
                    ? "rounded-full border border-primary bg-primary/15 px-3 py-1 text-xs font-medium text-primary"
                    : done
                      ? "rounded-full border border-primary/30 bg-primary/5 px-3 py-1 text-xs text-foreground/80"
                      : "rounded-full border border-border px-3 py-1 text-xs text-muted-foreground"
                }
              >
                {step}
              </li>
            );
          })}
        </ol>
      </Section>

      <Section title="Carteira de projetos">
        <DataTable
          columns={[
            { key: "codigo", label: "Projeto" },
            { key: "cliente", label: "Cliente" },
            { key: "escopo", label: "Escopo" },
            { key: "etapa", label: "Etapa", render: (r) => <StatusBadge value={r.etapa} /> },
            { key: "prazo", label: "Prazo" },
            { key: "avanco", label: "Avanço", render: (r) => <Progress value={r.avanco} /> },
          ]}
          rows={projetos}
        />
      </Section>
    </div>
  );
}
