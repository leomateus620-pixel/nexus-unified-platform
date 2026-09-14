import { createFileRoute } from "@tanstack/react-router";

import {
  ActionButton,
  DataTable,
  PageHeader,
  Section,
  StatCard,
  StatusBadge,
} from "@/components/nexus/Page";
import { brl, compras } from "@/lib/nexus-data";

export const Route = createFileRoute("/compras")({
  head: () => ({
    meta: [
      { title: "Compras e Produção — Sistema Nexus" },
      {
        name: "description",
        content: "Solicitações, fornecedores, materiais, compras e itens a fabricar.",
      },
      { property: "og:title", content: "Compras e Produção — Sistema Nexus" },
      {
        property: "og:description",
        content: "Controle de solicitações de compra, fornecedores e fabricação interna.",
      },
    ],
  }),
  component: Compras,
});

function Compras() {
  return (
    <div className="space-y-6">
      <PageHeader
        eyebrow="Compras e Produção"
        title="Suprimentos e fabricação"
        description="Solicitações geradas pela lista de materiais do projeto, cotações, pedidos e itens fabricados internamente."
        actions={<ActionButton>Nova solicitação</ActionButton>}
      />

      <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-4">
        <StatCard label="Solicitações abertas" value="16" />
        <StatCard label="Em cotação" value="7" tone="info" />
        <StatCard label="Valor comprometido" value={brl(1284000)} tone="primary" />
        <StatCard label="Atrasos de fornecedor" value="3" tone="danger" />
      </div>

      <Section title="Solicitações e ordens de produção">
        <DataTable
          columns={[
            { key: "codigo", label: "Código" },
            { key: "item", label: "Item" },
            { key: "fornecedor", label: "Fornecedor" },
            { key: "projeto", label: "Projeto" },
            { key: "valor", label: "Valor", align: "right", render: (r) => brl(r.valor) },
            { key: "status", label: "Status", render: (r) => <StatusBadge value={r.status} /> },
          ]}
          rows={compras}
        />
      </Section>
    </div>
  );
}
