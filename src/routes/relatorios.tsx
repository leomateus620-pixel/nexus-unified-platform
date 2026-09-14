import { createFileRoute } from "@tanstack/react-router";

import { PageHeader, Section, StatCard } from "@/components/nexus/Page";

export const Route = createFileRoute("/relatorios")({
  head: () => ({
    meta: [
      { title: "Relatórios — Sistema Nexus" },
      {
        name: "description",
        content: "Relatórios de desempenho comercial, técnico, operacional e financeiro.",
      },
      { property: "og:title", content: "Relatórios — Sistema Nexus" },
      {
        property: "og:description",
        content: "Painéis e exportações de desempenho da operação Nexus.",
      },
    ],
  }),
  component: Relatorios,
});

const grupos = [
  {
    titulo: "Comercial",
    itens: ["Conversão por etapa", "Propostas por vendedor", "Motivos de perda", "Ticket médio"],
  },
  {
    titulo: "Técnico",
    itens: [
      "Não conformidades por norma",
      "Prazo de emissão de laudos",
      "Estudos por engenheiro",
      "Retrabalho técnico",
    ],
  },
  {
    titulo: "Operacional",
    itens: ["Horas por projeto", "Produtividade por equipe", "Deslocamentos", "Atrasos de OS"],
  },
  {
    titulo: "Financeiro",
    itens: ["Margem por projeto", "Orçado x realizado", "Faturamento mensal", "Custo por solução"],
  },
];

function Relatorios() {
  return (
    <div className="space-y-6">
      <PageHeader
        eyebrow="Relatórios"
        title="Desempenho da operação"
        description="Painéis prontos por área, com filtros por período, cliente, projeto e responsável, e exportação em planilha ou PDF."
      />

      <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-4">
        <StatCard label="Relatórios disponíveis" value="16" tone="primary" />
        <StatCard label="Agendados por e-mail" value="5" />
        <StatCard label="Exportações no mês" value="128" tone="info" />
        <StatCard label="Painéis personalizados" value="3" />
      </div>

      <div className="grid gap-4 md:grid-cols-2">
        {grupos.map((g) => (
          <Section key={g.titulo} title={g.titulo}>
            <ul className="space-y-2">
              {g.itens.map((i) => (
                <li
                  key={i}
                  className="flex items-center justify-between rounded-md border border-border bg-background/40 px-3 py-2 text-sm"
                >
                  {i}
                  <span className="text-xs text-primary">Abrir</span>
                </li>
              ))}
            </ul>
          </Section>
        ))}
      </div>
    </div>
  );
}
