import { createFileRoute } from "@tanstack/react-router";

import {
  ActionButton,
  DataTable,
  PageHeader,
  Section,
  StatCard,
} from "@/components/nexus/Page";
import { brl, produtos } from "@/lib/nexus-data";

export const Route = createFileRoute("/produtos")({
  head: () => ({
    meta: [
      { title: "Produtos e Soluções — Sistema Nexus" },
      {
        name: "description",
        content:
          "Produtos, códigos, NCM, custos, fornecedores, impostos e biblioteca técnica do Nexus.",
      },
      { property: "og:title", content: "Produtos e Soluções — Sistema Nexus" },
      {
        property: "og:description",
        content: "Catálogo técnico com custos, fornecedores, NCM e impostos.",
      },
    ],
  }),
  component: Produtos,
});

function Produtos() {
  return (
    <div className="space-y-6">
      <PageHeader
        eyebrow="Produtos e Soluções"
        title="Catálogo técnico e comercial"
        description="Base única de produtos com código, NCM, custo, fornecedor e impostos, alimentando propostas e listas de materiais."
        actions={<ActionButton>Novo produto</ActionButton>}
      />

      <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-4">
        <StatCard label="Itens cadastrados" value="612" />
        <StatCard label="Fornecedores" value="48" tone="primary" />
        <StatCard label="Custos desatualizados" value="21" tone="danger" hint="Acima de 90 dias" />
        <StatCard label="Documentos na biblioteca" value="187" tone="info" />
      </div>

      <Section title="Produtos">
        <DataTable
          columns={[
            { key: "codigo", label: "Código" },
            { key: "descricao", label: "Descrição" },
            { key: "ncm", label: "NCM" },
            { key: "custo", label: "Custo", align: "right", render: (r) => brl(r.custo) },
            { key: "fornecedor", label: "Fornecedor" },
            { key: "impostos", label: "Impostos" },
          ]}
          rows={produtos}
        />
      </Section>

      <Section title="Biblioteca técnica" description="Materiais de apoio vinculados às soluções">
        <div className="grid gap-3 md:grid-cols-3">
          {[
            "Catálogos de fornecedores",
            "Desenhos padrão de proteções",
            "Fichas técnicas de componentes",
            "Modelos de memorial de cálculo",
            "Tabelas de perfis estruturais",
            "Normas e referências aplicáveis",
          ].map((item) => (
            <div key={item} className="rounded-md border border-border bg-background/40 p-3 text-sm">
              {item}
            </div>
          ))}
        </div>
      </Section>
    </div>
  );
}
