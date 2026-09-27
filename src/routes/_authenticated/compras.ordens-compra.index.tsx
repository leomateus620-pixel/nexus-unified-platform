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
import { RecordIdentity } from "@/components/nexus/OperationalDetails";

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
                {
                  key: "numero",
                  label: "Ordem / origem",
                  render: (o) => <RecordIdentity code primary={o.numero} secondary={o.origem} />,
                },
                {
                  key: "fornecedor",
                  label: "Fornecedor",
                  render: (o) => <RecordIdentity primary={o.fornecedor} />,
                },
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
                  label: "Saldo a receber",
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
