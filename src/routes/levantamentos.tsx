import { createFileRoute } from "@tanstack/react-router";

import {
  ActionButton,
  DataTable,
  PageHeader,
  Section,
  StatCard,
  StatusBadge,
} from "@/components/nexus/Page";
import { levantamentos } from "@/lib/nexus-data";

export const Route = createFileRoute("/levantamentos")({
  head: () => ({
    meta: [
      { title: "Levantamentos Técnicos — Sistema Nexus" },
      {
        name: "description",
        content:
          "Coleta em campo com fotos, marcações, conformidades, não conformidades e quantitativos.",
      },
      { property: "og:title", content: "Levantamentos Técnicos — Sistema Nexus" },
      {
        property: "og:description",
        content: "Fichas de campo com fotos, não conformidades e quantitativos.",
      },
    ],
  }),
  component: Levantamentos,
});

function Levantamentos() {
  return (
    <div className="space-y-6">
      <PageHeader
        eyebrow="Levantamentos Técnicos"
        title="Coleta em campo"
        description="Fichas preenchidas na unidade, com fotos, marcações, conformidades e quantitativos que alimentam engenharia e proposta."
        actions={<ActionButton>Novo levantamento</ActionButton>}
      />

      <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-4">
        <StatCard label="Levantamentos no mês" value="14" />
        <StatCard label="Não conformidades abertas" value="71" tone="danger" />
        <StatCard label="Fotos anexadas" value="1.932" tone="info" />
        <StatCard label="Aguardando análise" value="3" tone="primary" />
      </div>

      <Section title="Fichas de campo">
        <DataTable
          columns={[
            { key: "codigo", label: "Código" },
            { key: "cliente", label: "Cliente" },
            { key: "unidade", label: "Unidade" },
            { key: "tecnico", label: "Técnico" },
            { key: "data", label: "Data" },
            { key: "naoConformidades", label: "N/C", align: "right" },
            { key: "status", label: "Status", render: (r) => <StatusBadge value={r.status} /> },
          ]}
          rows={levantamentos}
        />
      </Section>

      <Section title="Checklist padrão" description="Itens verificados em campo">
        <div className="grid gap-3 md:grid-cols-2">
          {[
            "Proteções fixas e móveis das máquinas",
            "Dispositivos de parada de emergência",
            "Acessos, escadas e plataformas",
            "Pontos de ancoragem e linhas de vida",
            "Sinalização de espaços confinados",
            "Quantitativos de materiais por área",
          ].map((c) => (
            <label key={c} className="flex items-center gap-3 rounded-md border border-border bg-background/40 p-3 text-sm">
              <span className="size-3.5 rounded-sm border border-primary bg-primary/20" />
              {c}
            </label>
          ))}
        </div>
      </Section>
    </div>
  );
}
