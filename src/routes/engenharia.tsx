import { createFileRoute } from "@tanstack/react-router";

import {
  ActionButton,
  DataTable,
  PageHeader,
  Section,
  StatCard,
  StatusBadge,
} from "@/components/nexus/Page";
import { engenharia } from "@/lib/nexus-data";

export const Route = createFileRoute("/engenharia")({
  head: () => ({
    meta: [
      { title: "Engenharia — Sistema Nexus" },
      {
        name: "description",
        content:
          "NR-12, espaços confinados, trabalho em altura, análises de risco e dimensionamentos.",
      },
      { property: "og:title", content: "Engenharia — Sistema Nexus" },
      {
        property: "og:description",
        content: "Análises de risco e dimensionamentos técnicos conforme normas.",
      },
    ],
  }),
  component: Engenharia,
});

const normas = [
  { nome: "NR-12", tema: "Segurança em máquinas e equipamentos", estudos: 42 },
  { nome: "NR-33", tema: "Espaços confinados", estudos: 18 },
  { nome: "NR-35", tema: "Trabalho em altura", estudos: 27 },
  { nome: "NBR 14153", tema: "Categorias de segurança", estudos: 12 },
  { nome: "NBR 16325", tema: "Dispositivos de ancoragem", estudos: 9 },
  { nome: "NR-18", tema: "Condições no ambiente de trabalho", estudos: 7 },
];

function Engenharia() {
  return (
    <div className="space-y-6">
      <PageHeader
        eyebrow="Engenharia"
        title="Análises e dimensionamentos"
        description="Estudos técnicos por norma, com apreciação de risco, categorias de segurança e memoriais de cálculo ligados ao projeto."
        actions={<ActionButton>Novo estudo</ActionButton>}
      />

      <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-4">
        <StatCard label="Estudos em andamento" value="19" />
        <StatCard label="Aguardando revisão" value="5" tone="info" />
        <StatCard label="Aprovados no mês" value="11" tone="primary" />
        <StatCard label="Com pendência técnica" value="2" tone="danger" />
      </div>

      <Section title="Normas aplicadas">
        <div className="grid gap-3 md:grid-cols-3">
          {normas.map((n) => (
            <div key={n.nome} className="rounded-md border border-border bg-background/40 p-3">
              <p className="font-display text-sm font-semibold text-primary">{n.nome}</p>
              <p className="mt-1 text-xs text-muted-foreground">{n.tema}</p>
              <p className="mt-2 text-xs text-foreground">{n.estudos} estudos</p>
            </div>
          ))}
        </div>
      </Section>

      <Section title="Estudos técnicos">
        <DataTable
          columns={[
            { key: "codigo", label: "Código" },
            { key: "tema", label: "Tema" },
            { key: "norma", label: "Norma" },
            { key: "responsavel", label: "Responsável" },
            { key: "status", label: "Status", render: (r) => <StatusBadge value={r.status} /> },
          ]}
          rows={engenharia}
        />
      </Section>
    </div>
  );
}
