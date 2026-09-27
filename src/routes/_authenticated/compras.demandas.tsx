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
import { useDemandasOrg } from "@/features/suprimentos/queries";
import { qtd } from "@/lib/format";

export const Route = createFileRoute("/_authenticated/compras/demandas")({
  head: () => ({
    meta: [
      { title: "Demandas — Sistema Nexus" },
      { name: "description", content: "Demandas de suprimento geradas a partir das revisões." },
      { property: "og:title", content: "Demandas — Sistema Nexus" },
      { property: "og:description", content: "Demandas de compra e fabricação." },
    ],
  }),
  component: Page,
});

function Page() {
  const orgId = useOrgId();
  const q = useDemandasOrg(orgId);
  const navigate = useNavigate();
  return (
    <div className="space-y-4">
      <PageHeader
        eyebrow="Compras e Produção"
        title="Demandas"
        description="Necessária, em ordens, realizada e pendente são quantidades separadas para evitar dupla contagem."
      />
      <Section title="Demandas">
        <QueryView
          query={q}
          empty={
            <EmptyState
              title="Nenhuma demanda"
              hint="Planeje a demanda na etapa “Planejamento de compras” de uma proposta."
            />
          }
        >
          {(rows) => (
            <DataTable
              getRowId={(d) => d.id}
              rows={rows}
              onRowClick={(d) =>
                d.proposta_id &&
                navigate({
                  to: "/comercial/propostas/$propostaId/revisoes/$revisaoId/compras",
                  params: { propostaId: d.proposta_id, revisaoId: d.revisao_id },
                })
              }
              columns={[
                { key: "origem", label: "Origem" },
                { key: "cod", label: "Código", render: (d) => d.comp?.codigo ?? "—" },
                { key: "desc", label: "Descrição", render: (d) => d.comp?.descricao ?? "—" },
                { key: "modalidade", label: "Modalidade" },
                {
                  key: "forn",
                  label: "Fornecedor",
                  render: (d) => d.comp?.fornecedores?.nome ?? "—",
                },
                {
                  key: "nec",
                  label: "Necessária",
                  align: "right",
                  render: (d) => qtd(Number(d.quantidade_necessaria), d.comp?.unidade),
                },
                {
                  key: "aloc",
                  label: "Em ordens",
                  align: "right",
                  render: (d) => qtd(d.alocada, d.comp?.unidade),
                },
                {
                  key: "real",
                  label: "Realizada",
                  align: "right",
                  render: (d) => qtd(d.realizada, d.comp?.unidade),
                },
                {
                  key: "pend",
                  label: "Pendente",
                  align: "right",
                  render: (d) =>
                    qtd(Math.max(0, Number(d.quantidade_planejada) - d.realizada), d.comp?.unidade),
                },
                { key: "status", label: "Status", render: (d) => <StatusBadge value={d.status} /> },
              ]}
            />
          )}
        </QueryView>
      </Section>
    </div>
  );
}
