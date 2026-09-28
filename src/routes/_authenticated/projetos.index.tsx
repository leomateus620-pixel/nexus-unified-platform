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
import { useProjetos } from "@/features/projetos/queries";
import { brl, dataBR } from "@/lib/format";
import { RecordIdentity } from "@/components/nexus/OperationalDetails";

export const Route = createFileRoute("/_authenticated/projetos/")({
  head: () => ({
    meta: [
      { title: "Projetos — Sistema Nexus" },
      { name: "description", content: "Projetos criados a partir de propostas aceitas." },
      { property: "og:title", content: "Projetos — Sistema Nexus" },
      { property: "og:description", content: "Projetos vinculados à revisão aprovada." },
    ],
  }),
  component: Page,
});

function Page() {
  const q = useProjetos(useOrgId());
  const navigate = useNavigate();
  return (
    <div className="space-y-4">
      <PageHeader
        eyebrow="Projetos"
        title="Projetos"
        description="Criados ao registrar o aceite de uma revisão. Não é preciso projeto para iniciar uma proposta."
      />
      <Section title="Projetos">
        <QueryView
          query={q}
          empty={
            <EmptyState
              title="Nenhum projeto"
              hint="Registre o aceite de uma proposta no Resumo executivo para criar o projeto."
            />
          }
        >
          {(rows) => (
            <DataTable
              getRowId={(p) => p.id}
              rows={rows}
              onRowClick={(p) =>
                navigate({ to: "/projetos/$projetoId", params: { projetoId: p.id } })
              }
              columns={[
                {
                  key: "codigo",
                  label: "Projeto / revisão aprovada",
                  render: (p) => <RecordIdentity code primary={p.codigo} secondary={p.origem} />,
                },
                {
                  key: "cliente",
                  label: "Cliente",
                  render: (p) => <RecordIdentity primary={p.cliente} />,
                },
                {
                  key: "valor",
                  label: "Valor aprovado",
                  align: "right",
                  render: (p) => brl(p.totais?.final ?? null),
                },
                { key: "status", label: "Status", render: (p) => <StatusBadge value={p.status} /> },
                { key: "created_at", label: "Criado", render: (p) => dataBR(p.created_at) },
              ]}
            />
          )}
        </QueryView>
      </Section>
    </div>
  );
}
