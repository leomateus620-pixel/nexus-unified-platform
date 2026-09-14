import { createFileRoute } from "@tanstack/react-router";

import {
  ActionButton,
  DataTable,
  PageHeader,
  Section,
  StatCard,
  StatusBadge,
} from "@/components/nexus/Page";
import { documentos } from "@/lib/nexus-data";

export const Route = createFileRoute("/documentacao")({
  head: () => ({
    meta: [
      { title: "Documentação Técnica — Sistema Nexus" },
      {
        name: "description",
        content: "Laudos, relatórios, análises de risco, memoriais, dossiês e modelos de documentos.",
      },
      { property: "og:title", content: "Documentação Técnica — Sistema Nexus" },
      {
        property: "og:description",
        content: "Emissão e controle de revisões de laudos, memoriais e dossiês técnicos.",
      },
    ],
  }),
  component: Documentacao,
});

function Documentacao() {
  return (
    <div className="space-y-6">
      <PageHeader
        eyebrow="Documentação Técnica"
        title="Laudos, memoriais e dossiês"
        description="Documentos gerados a partir dos dados do projeto, com controle de revisão e modelos padronizados."
        actions={<ActionButton>Emitir documento</ActionButton>}
      />

      <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-4">
        <StatCard label="Documentos emitidos no ano" value="412" />
        <StatCard label="Em revisão" value="9" tone="info" />
        <StatCard label="Modelos disponíveis" value="23" tone="primary" />
        <StatCard label="Pendentes de assinatura" value="4" tone="danger" />
      </div>

      <Section title="Documentos">
        <DataTable
          columns={[
            { key: "codigo", label: "Código" },
            { key: "tipo", label: "Tipo" },
            { key: "cliente", label: "Cliente" },
            { key: "projeto", label: "Projeto" },
            { key: "revisao", label: "Revisão" },
            { key: "status", label: "Status", render: (r) => <StatusBadge value={r.status} /> },
          ]}
          rows={documentos}
        />
      </Section>

      <Section title="Modelos de documento">
        <div className="grid gap-3 md:grid-cols-3">
          {[
            "Laudo de conformidade NR-12",
            "Apreciação de risco",
            "Memorial descritivo",
            "Memorial de cálculo estrutural",
            "Relatório fotográfico",
            "Dossiê técnico do projeto",
          ].map((m) => (
            <div key={m} className="rounded-md border border-border bg-background/40 p-3 text-sm">
              {m}
            </div>
          ))}
        </div>
      </Section>
    </div>
  );
}
