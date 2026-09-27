import { createFileRoute, useNavigate } from "@tanstack/react-router";

import {
  DataTable,
  EmptyState,
  PageHeader,
  QueryView,
  Section,
  StatusBadge,
} from "@/components/nexus/Page";
import { useOrg } from "@/features/org/session";
import { useOrdensCompra } from "@/features/suprimentos/queries";
import { brl, dataBR, qtd } from "@/lib/format";

export const Route = createFileRoute("/_authenticated/compras/ordens-compra/")({
  head: () => ({
    meta: [
      { title: "Ordens de compra — Sistema Nexus" },
      { name: "description", content: "Ordens de compra por fornecedor com origem na revisão." },
      { property: "og:title", content: "Ordens de compra — Sistema Nexus" },
      { property: "og:description", content: "Ordens de compra por fornecedor." },
    ],
  }),
  component: Page,
});

function Page() {
  const org = useOrg();
  const q = useOrdensCompra(org.data?.orgId ?? "");
  const navigate = useNavigate();
  const verCusto = org.data?.canSeeCosts ?? false;
  return (
    <div className="space-y-4">
      <PageHeader
        eyebrow="Compras e Produção"
        title="Ordens de compra"
        description="Geradas por fornecedor a partir da demanda de revisões aceitas."
      />
      <Section title="Ordens de compra">
        <QueryView
          query={q}
          empty={
            <EmptyState
              title="Nenhuma ordem de compra"
              hint="Ordens são geradas no planejamento de compras de uma revisão aceita."
            />
          }
        >
          {(rows) => (
            <DataTable
              getRowId={(o) => o.id}
              rows={rows}
              onRowClick={(o) =>
                navigate({ to: "/compras/ordens-compra/$ordemId", params: { ordemId: o.id } })
              }
              columns={[
                { key: "numero", label: "Número" },
                { key: "fornecedor", label: "Fornecedor" },
                { key: "origem", label: "Origem" },
                { key: "entrega", label: "Entrega", render: (o) => dataBR(o.entrega_prevista) },
                ...(verCusto
                  ? [
                      {
                        key: "total",
                        label: "Total",
                        align: "right" as const,
                        render: (o: { total: number }) => brl(o.total),
                      },
                    ]
                  : []),
                {
                  key: "pendente",
                  label: "Qtd. pendente",
                  align: "right",
                  render: (o) => qtd(o.pendente),
                },
                { key: "status", label: "Status", render: (o) => <StatusBadge value={o.status} /> },
              ]}
            />
          )}
        </QueryView>
      </Section>
    </div>
  );
}
