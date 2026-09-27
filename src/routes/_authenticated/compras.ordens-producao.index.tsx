import { createFileRoute, useNavigate } from "@tanstack/react-router";

import {
  DataTable,
  EmptyState,
  PageHeader,
  QueryView,
  Section,
  StatusBadge,
} from "@/components/nexus/Page";
import { useOrgId } from "@/features/org/session";
import { useOrdensProducao } from "@/features/suprimentos/queries";
import { dataBR } from "@/lib/format";
import { RecordIdentity } from "@/components/nexus/OperationalDetails";

export const Route = createFileRoute("/_authenticated/compras/ordens-producao/")({
  head: () => ({
    meta: [
      { title: "Ordens de produção — Sistema Nexus" },
      { name: "description", content: "Ordens de fabricação interna com origem na revisão." },
      { property: "og:title", content: "Ordens de produção — Sistema Nexus" },
      { property: "og:description", content: "Ordens de fabricação." },
    ],
  }),
  component: Page,
});

function Page() {
  const q = useOrdensProducao(useOrgId());
  const navigate = useNavigate();
  return (
    <div className="space-y-4">
      <PageHeader
        eyebrow="Compras e Produção"
        title="Ordens de produção"
        description="Liberação exige responsável, prazo e ficha técnica/matéria-prima de cada item."
      />
      <Section title="Ordens de produção">
        <QueryView
          query={q}
          empty={
            <EmptyState
              title="Nenhuma ordem de produção"
              hint="Geradas para itens com modalidade “fabricar” de revisões aceitas."
            />
          }
        >
          {(rows) => (
            <DataTable
              getRowId={(o) => o.id}
              rows={rows}
              onRowClick={(o) =>
                navigate({ to: "/compras/ordens-producao/$ordemId", params: { ordemId: o.id } })
              }
              columns={[
                {
                  key: "numero",
                  label: "Ordem / origem",
                  render: (o) => <RecordIdentity code primary={o.numero} secondary={o.origem} />,
                },
                { key: "responsavel", label: "Responsável", render: (o) => o.responsavel ?? "—" },
                { key: "prazo", label: "Prazo", render: (o) => dataBR(o.prazo) },
                { key: "itens", label: "Itens", align: "right" },
                { key: "status", label: "Status", render: (o) => <StatusBadge value={o.status} /> },
              ]}
            />
          )}
        </QueryView>
      </Section>
    </div>
  );
}
