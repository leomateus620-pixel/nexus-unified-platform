import { createFileRoute } from "@tanstack/react-router";
import {
  Bar,
  BarChart,
  CartesianGrid,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis,
} from "recharts";

import { DataTable, PageHeader, Section, StatCard } from "@/components/nexus/Page";
import { brl, faturamentoMensal, financeiro } from "@/lib/nexus-data";

export const Route = createFileRoute("/financeiro")({
  head: () => ({
    meta: [
      { title: "Financeiro — Sistema Nexus" },
      {
        name: "description",
        content: "Custos, margens, orçamento, faturamento e resultado por projeto.",
      },
      { property: "og:title", content: "Financeiro — Sistema Nexus" },
      {
        property: "og:description",
        content: "Resultado por projeto: orçado, realizado, faturado e margem.",
      },
    ],
  }),
  component: Financeiro,
});

function Financeiro() {
  return (
    <div className="space-y-6">
      <PageHeader
        eyebrow="Financeiro"
        title="Resultado por projeto"
        description="Comparação entre orçado, realizado e faturado, com margem acompanhada durante toda a execução."
      />

      <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-4">
        <StatCard label="Faturamento no ano" value={brl(5410000)} tone="primary" />
        <StatCard label="Custo realizado" value={brl(3560000)} />
        <StatCard label="Margem média" value="31,4%" tone="info" />
        <StatCard label="A faturar" value={brl(1180000)} />
      </div>

      <Section title="Faturado x custo" description="Valores em milhares de reais">
        <div className="h-64">
          <ResponsiveContainer width="100%" height="100%">
            <BarChart data={faturamentoMensal}>
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
              <Bar dataKey="faturado" fill="var(--chart-1)" radius={[4, 4, 0, 0]} />
              <Bar dataKey="custo" fill="var(--chart-4)" radius={[4, 4, 0, 0]} />
            </BarChart>
          </ResponsiveContainer>
        </div>
      </Section>

      <Section title="Resultado por projeto">
        <DataTable
          columns={[
            { key: "projeto", label: "Projeto" },
            { key: "cliente", label: "Cliente" },
            { key: "orcado", label: "Orçado", align: "right", render: (r) => brl(r.orcado) },
            { key: "realizado", label: "Realizado", align: "right", render: (r) => brl(r.realizado) },
            { key: "faturado", label: "Faturado", align: "right", render: (r) => brl(r.faturado) },
            { key: "margem", label: "Margem", align: "right" },
          ]}
          rows={financeiro}
        />
      </Section>
    </div>
  );
}
