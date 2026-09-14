import { createFileRoute } from "@tanstack/react-router";

import {
  ActionButton,
  DataTable,
  PageHeader,
  Section,
  StatCard,
  StatusBadge,
} from "@/components/nexus/Page";
import { ordensServico } from "@/lib/nexus-data";

export const Route = createFileRoute("/execucao")({
  head: () => ({
    meta: [
      { title: "Execução e Ordens de Serviço — Sistema Nexus" },
      {
        name: "description",
        content:
          "Equipes, horas, deslocamentos, materiais utilizados, fotos e assinaturas em campo.",
      },
      { property: "og:title", content: "Execução e Ordens de Serviço — Sistema Nexus" },
      {
        property: "og:description",
        content: "Controle de equipes, horas, materiais e assinaturas das ordens de serviço.",
      },
    ],
  }),
  component: Execucao,
});

function Execucao() {
  return (
    <div className="space-y-6">
      <PageHeader
        eyebrow="Execução / Ordens de Serviço"
        title="Campo e apontamentos"
        description="Cada OS registra equipe, horas, deslocamento, materiais aplicados, fotos e assinatura do cliente."
        actions={<ActionButton>Abrir OS</ActionButton>}
      />

      <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-4">
        <StatCard label="OS em campo" value="5" tone="info" />
        <StatCard label="Horas apontadas no mês" value="1.184" />
        <StatCard label="Km percorridos" value="4.320" />
        <StatCard label="Aguardando assinatura" value="2" tone="danger" />
      </div>

      <Section title="Ordens de serviço">
        <DataTable
          columns={[
            { key: "codigo", label: "OS" },
            { key: "cliente", label: "Cliente" },
            { key: "equipe", label: "Equipe" },
            { key: "horas", label: "Horas", align: "right" },
            { key: "deslocamento", label: "Deslocamento", align: "right" },
            { key: "status", label: "Status", render: (r) => <StatusBadge value={r.status} /> },
          ]}
          rows={ordensServico}
        />
      </Section>

      <Section title="Registro em campo" description="O que a equipe envia pelo celular">
        <div className="grid gap-3 md:grid-cols-4">
          {["Fotos do antes e depois", "Materiais aplicados", "Horas por colaborador", "Assinatura do responsável"].map(
            (i) => (
              <div key={i} className="rounded-md border border-border bg-background/40 p-3 text-sm">
                {i}
              </div>
            ),
          )}
        </div>
      </Section>
    </div>
  );
}
