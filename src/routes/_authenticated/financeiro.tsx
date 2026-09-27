import { createFileRoute } from "@tanstack/react-router";

import {
  DataTable,
  EmptyState,
  NotConfigured,
  PageHeader,
  QueryView,
  Section,
} from "@/components/nexus/Page";
import { useOrg } from "@/features/org/session";
import { useProjetos } from "@/features/projetos/queries";
import { useOrdensCompra } from "@/features/suprimentos/queries";
import { brl, pct } from "@/lib/format";

export const Route = createFileRoute("/_authenticated/financeiro")({
  head: () => ({
    meta: [
      { title: "Financeiro — Sistema Nexus" },
      {
        name: "description",
        content: "Orçamento aprovado, compromissos de compra e margens previstas por projeto.",
      },
      { property: "og:title", content: "Financeiro — Sistema Nexus" },
      { property: "og:description", content: "Orçado x comprometido por projeto." },
    ],
  }),
  component: Page,
});

function Page() {
  const org = useOrg();
  const orgId = org.data?.orgId ?? "";
  const proj = useProjetos(orgId);
  const oc = useOrdensCompra(orgId);
  if (org.data && !org.data.canSeeCosts)
    return <NotConfigured what="Seu perfil não tem acesso a custos e margens." />;
  const comprometido = (id: string) =>
    (oc.data ?? [])
      .filter((o) => o.projeto_id === id && o.status === "emitida")
      .reduce((s, o) => s + o.total, 0);
  return (
    <div className="space-y-6">
      <PageHeader
        eyebrow="Financeiro"
        title="Orçado x comprometido"
        description="Consome a revisão aprovada e as OCs emitidas. Propostas em negociação não aparecem como receita."
      />
      <Section title="Projetos">
        <QueryView query={proj} empty={<EmptyState title="Nenhum projeto aprovado" />}>
          {(rows) => (
            <DataTable
              getRowId={(p) => p.id}
              rows={rows}
              columns={[
                { key: "codigo", label: "Projeto" },
                { key: "cliente", label: "Cliente" },
                {
                  key: "final",
                  label: "Valor aprovado",
                  align: "right",
                  render: (p) => brl(p.totais?.final ?? null),
                },
                {
                  key: "cm",
                  label: "Custo materiais orçado",
                  align: "right",
                  render: (p) => brl(p.totais?.custo_materiais ?? null),
                },
                {
                  key: "comp",
                  label: "Comprometido (OCs emitidas)",
                  align: "right",
                  render: (p) => (oc.isSuccess ? brl(comprometido(p.id)) : "—"),
                },
                {
                  key: "margem",
                  label: "Margem prevista",
                  align: "right",
                  render: (p) => pct(p.totais?.margem ?? null),
                },
              ]}
            />
          )}
        </QueryView>
      </Section>
      <Section title="Faturamento e custos realizados">
        <NotConfigured what="Integração com faturamento, contas a pagar e apropriação de horas ainda não configurada." />
      </Section>
    </div>
  );
}
