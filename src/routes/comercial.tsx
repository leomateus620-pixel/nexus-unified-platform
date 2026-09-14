import { createFileRoute } from "@tanstack/react-router";

import {
  ActionButton,
  DataTable,
  PageHeader,
  Section,
  StatCard,
  StatusBadge,
} from "@/components/nexus/Page";
import { brl, funilComercial, oportunidades, propostas } from "@/lib/nexus-data";

export const Route = createFileRoute("/comercial")({
  head: () => ({
    meta: [
      { title: "Comercial — Sistema Nexus" },
      {
        name: "description",
        content: "Oportunidades, negociações, propostas e aprovações comerciais no Sistema Nexus.",
      },
      { property: "og:title", content: "Comercial — Sistema Nexus" },
      {
        property: "og:description",
        content: "Funil de oportunidades, propostas e aprovações comerciais.",
      },
    ],
  }),
  component: Comercial,
});

function Comercial() {
  return (
    <div className="space-y-6">
      <PageHeader
        eyebrow="Comercial"
        title="Oportunidades e propostas"
        description="Acompanhe o funil, gere propostas versionadas e controle as aprovações antes de virar projeto."
        actions={<ActionButton>Nova oportunidade</ActionButton>}
      />

      <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-4">
        <StatCard label="Oportunidades abertas" value="42" hint="Em todas as etapas" />
        <StatCard label="Valor em funil" value={brl(6890000)} tone="primary" />
        <StatCard label="Propostas aguardando" value="8" hint="3 há mais de 15 dias" tone="info" />
        <StatCard label="Taxa de conversão" value="34%" hint="Últimos 90 dias" />
      </div>

      <Section title="Funil por etapa">
        <div className="grid gap-3 md:grid-cols-5">
          {funilComercial.map((e) => (
            <div key={e.etapa} className="rounded-md border border-border bg-background/40 p-3">
              <p className="text-xs text-muted-foreground">{e.etapa}</p>
              <p className="mt-1 text-xl font-bold text-foreground">{e.quantidade}</p>
              <p className="text-xs text-primary">{brl(e.valor)}</p>
            </div>
          ))}
        </div>
      </Section>

      <Section title="Oportunidades">
        <DataTable
          columns={[
            { key: "codigo", label: "Código" },
            { key: "cliente", label: "Cliente" },
            { key: "solucao", label: "Solução" },
            { key: "valor", label: "Valor", align: "right", render: (r) => brl(r.valor) },
            { key: "etapa", label: "Etapa", render: (r) => <StatusBadge value={r.etapa} /> },
            { key: "responsavel", label: "Responsável" },
          ]}
          rows={oportunidades}
        />
      </Section>

      <Section title="Propostas" description="Versões, margens e status de aprovação">
        <DataTable
          columns={[
            { key: "codigo", label: "Proposta" },
            { key: "cliente", label: "Cliente" },
            { key: "versao", label: "Versão" },
            { key: "valor", label: "Valor", align: "right", render: (r) => brl(r.valor) },
            { key: "margem", label: "Margem", align: "right" },
            { key: "status", label: "Status", render: (r) => <StatusBadge value={r.status} /> },
          ]}
          rows={propostas}
        />
      </Section>
    </div>
  );
}
