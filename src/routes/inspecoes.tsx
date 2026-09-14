import { createFileRoute } from "@tanstack/react-router";

import {
  ActionButton,
  DataTable,
  PageHeader,
  Section,
  StatCard,
  StatusBadge,
} from "@/components/nexus/Page";
import { inspecoes } from "@/lib/nexus-data";

export const Route = createFileRoute("/inspecoes")({
  head: () => ({
    meta: [
      { title: "Inspeções — Sistema Nexus" },
      {
        name: "description",
        content: "Inspeções periódicas, validade, histórico e próximas revisões por unidade.",
      },
      { property: "og:title", content: "Inspeções — Sistema Nexus" },
      {
        property: "og:description",
        content: "Calendário de inspeções periódicas com validade e histórico.",
      },
    ],
  }),
  component: Inspecoes,
});

function Inspecoes() {
  return (
    <div className="space-y-6">
      <PageHeader
        eyebrow="Inspeções"
        title="Periodicidade e validade"
        description="Controle do que precisa ser reinspecionado, com histórico completo por item instalado."
        actions={<ActionButton>Agendar inspeção</ActionButton>}
      />

      <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-4">
        <StatCard label="Itens monitorados" value="486" />
        <StatCard label="Vencendo em 30 dias" value="17" tone="info" />
        <StatCard label="Vencidos" value="5" tone="danger" />
        <StatCard label="Em dia" value="464" tone="primary" />
      </div>

      <Section title="Agenda de inspeções">
        <DataTable
          columns={[
            { key: "codigo", label: "Código" },
            { key: "item", label: "Item" },
            { key: "periodicidade", label: "Periodicidade" },
            { key: "ultima", label: "Última" },
            { key: "proxima", label: "Próxima" },
            { key: "status", label: "Status", render: (r) => <StatusBadge value={r.status} /> },
          ]}
          rows={inspecoes}
        />
      </Section>
    </div>
  );
}
