import { createFileRoute, Link } from "@tanstack/react-router";
import {
  Bar,
  BarChart,
  CartesianGrid,
  Line,
  LineChart,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis,
} from "recharts";

import {
  DataTable,
  PageHeader,
  Section,
  StatCard,
  StatusBadge,
  Progress,
  ActionButton,
} from "@/components/nexus/Page";
import {
  brl,
  dashboardKpis,
  faturamentoMensal,
  funilComercial,
  pendencias,
  projetos,
} from "@/lib/nexus-data";
import { flowSteps } from "@/lib/nexus-nav";

export const Route = createFileRoute("/")({
  head: () => ({
    meta: [
      { title: "Dashboard — Sistema Nexus" },
      {
        name: "description",
        content:
          "Indicadores de propostas, projetos, execução, financeiro e pendências da operação Nexus.",
      },
      { property: "og:title", content: "Dashboard — Sistema Nexus" },
      {
        property: "og:description",
        content: "Visão geral da operação comercial, técnica e documental no Sistema Nexus.",
      },
    ],
  }),
  component: Dashboard,
});

function FlowTrail() {
  return (
    <div className="flex flex-wrap gap-1.5">
      {flowSteps.map((step, i) => (
        <span
          key={step}
          className="rounded-full border border-border bg-muted/40 px-3 py-1 text-xs text-muted-foreground"
        >
          <span className="mr-1.5 text-primary">{String(i + 1).padStart(2, "0")}</span>
          {step}
        </span>
      ))}
    </div>
  );
}

function Dashboard() {
  return (
    <div className="space-y-6">
      <PageHeader
        eyebrow="Visão geral"
        title="Dashboard Nexus"
        description="Indicadores gerais de propostas, projetos, execução, financeiro e pendências, em um único lugar."
        actions={
          <>
            <ActionButton variant="ghost">Exportar</ActionButton>
            <ActionButton>Nova oportunidade</ActionButton>
          </>
        }
      />

      <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-4">
        {dashboardKpis.map((kpi) => (
          <StatCard
            key={kpi.label}
            label={kpi.label}
            value={kpi.value}
            hint={kpi.delta}
            tone={kpi.tone as "primary" | "info" | "danger"}
          />
        ))}
      </div>

      <Section
        title="Fluxo do Nexus"
        description="Do primeiro contato comercial ao histórico do cliente."
      >
        <FlowTrail />
      </Section>

      <div className="grid gap-4 lg:grid-cols-2">
        <Section title="Funil comercial" description="Oportunidades por etapa">
          <div className="h-64">
            <ResponsiveContainer width="100%" height="100%">
              <BarChart data={funilComercial}>
                <CartesianGrid strokeDasharray="3 3" stroke="var(--border)" vertical={false} />
                <XAxis dataKey="etapa" stroke="var(--muted-foreground)" fontSize={11} />
                <YAxis stroke="var(--muted-foreground)" fontSize={11} />
                <Tooltip
                  contentStyle={{
                    background: "var(--popover)",
                    border: "1px solid var(--border)",
                    borderRadius: 8,
                    color: "var(--popover-foreground)",
                  }}
                  formatter={(v: number, name) =>
                    name === "valor" ? brl(v) : `${v} oportunidades`
                  }
                />
                <Bar dataKey="quantidade" fill="var(--chart-1)" radius={[4, 4, 0, 0]} />
              </BarChart>
            </ResponsiveContainer>
          </div>
        </Section>

        <Section title="Faturado x custo" description="Valores em milhares de reais">
          <div className="h-64">
            <ResponsiveContainer width="100%" height="100%">
              <LineChart data={faturamentoMensal}>
                <CartesianGrid strokeDasharray="3 3" stroke="var(--border)" vertical={false} />
                <XAxis dataKey="mes" stroke="var(--muted-foreground)" fontSize={11} />
                <YAxis stroke="var(--muted-foreground)" fontSize={11} />
                <Tooltip
                  contentStyle={{
                    background: "var(--popover)",
                    border: "1px solid var(--border)",
                    borderRadius: 8,
                    color: "var(--popover-foreground)",
                  }}
                />
                <Line type="monotone" dataKey="faturado" stroke="var(--chart-1)" strokeWidth={2} />
                <Line type="monotone" dataKey="custo" stroke="var(--chart-3)" strokeWidth={2} />
              </LineChart>
            </ResponsiveContainer>
          </div>
        </Section>
      </div>

      <div className="grid gap-4 lg:grid-cols-3">
        <Section title="Projetos em andamento" className="lg:col-span-2">
          <DataTable
            columns={[
              { key: "codigo", label: "Código" },
              { key: "cliente", label: "Cliente" },
              { key: "etapa", label: "Etapa", render: (r) => <StatusBadge value={r.etapa} /> },
              { key: "prazo", label: "Prazo" },
              { key: "avanco", label: "Avanço", render: (r) => <Progress value={r.avanco} /> },
            ]}
            rows={projetos}
          />
        </Section>

        <Section title="Pendências" description="Itens que precisam de ação">
          <ul className="space-y-3">
            {pendencias.map((p) => (
              <li key={p.item} className="border-b border-border/60 pb-3 last:border-0 last:pb-0">
                <p className="text-sm text-foreground">{p.item}</p>
                <p className="mt-1 text-xs text-muted-foreground">
                  {p.tipo} · vence em {p.prazo}
                </p>
              </li>
            ))}
          </ul>
          <Link
            to="/projetos"
            className="mt-4 inline-block text-xs font-medium text-primary hover:underline"
          >
            Ver todos os projetos
          </Link>
        </Section>
      </div>
    </div>
  );
}
