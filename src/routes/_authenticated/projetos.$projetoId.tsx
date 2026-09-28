import { createFileRoute, Link } from "@tanstack/react-router";
import { useQuery } from "@tanstack/react-query";

import {
  DataTable,
  EmptyState,
  ErrorState,
  LoadingState,
  PageHeader,
  Section,
  StatusBadge,
} from "@/components/nexus/Page";
import { supabase } from "@/integrations/supabase/client";
import { brl, qtd } from "@/lib/format";
import { RecordIdentity } from "@/components/nexus/OperationalDetails";

export const Route = createFileRoute("/_authenticated/projetos/$projetoId")({
  head: () => ({
    meta: [
      { title: "Projeto — Sistema Nexus" },
      { name: "description", content: "Materiais, ordens e andamento do projeto." },
    ],
  }),
  component: Page,
});

function Page() {
  const { projetoId } = Route.useParams();
  const q = useQuery({
    queryKey: ["projetos", "det", projetoId],
    queryFn: async () => {
      const { data, error } = await supabase
        .from("projetos")
        .select(
          "*, clientes(razao_social), proposta_revisoes(id,numero,totais,proposta_id,propostas!proposta_revisoes_proposta_id_fkey(numero)), ordens_compra(id,numero,status,fornecedores(nome)), ordens_producao(id,numero,status)",
        )
        .eq("id", projetoId)
        .single();
      if (error) throw error;
      const { data: dem, error: e2 } = await supabase
        .from("demandas")
        .select(
          "id,modalidade,quantidade_planejada,revisao_componentes(codigo,descricao,unidade),ordem_compra_itens(quantidade_recebida),ordem_producao_itens(quantidade_produzida)",
        )
        .eq("revisao_id", data.revisao_id);
      if (e2) throw e2;
      return { ...data, demandas: dem };
    },
  });
  if (q.isPending) return <LoadingState />;
  if (q.isError) return <ErrorState error={q.error} onRetry={() => q.refetch()} />;
  const p = q.data;
  const rev = p.proposta_revisoes as unknown as {
    id: string;
    numero: number;
    proposta_id: string;
    totais: { totais?: { final?: number } } | null;
    propostas: { numero: string };
  };
  const concl = p.demandas.length
    ? p.demandas.filter(
        (d) =>
          d.ordem_compra_itens.reduce((s, i) => s + Number(i.quantidade_recebida), 0) +
            d.ordem_producao_itens.reduce((s, i) => s + Number(i.quantidade_produzida), 0) >=
          Number(d.quantidade_planejada),
      ).length / p.demandas.length
    : null;
  return (
    <div className="space-y-4">
      <nav className="nx-order-context" aria-label="Projeto atual">
        <Link to="/projetos" className="hover:text-foreground">
          Projetos
        </Link>{" "}
        / {p.codigo}
      </nav>
      <PageHeader
        eyebrow="Projeto"
        title={`${p.codigo} · ${(p.clientes as { razao_social: string } | null)?.razao_social ?? "—"}`}
        description={`Valor aprovado ${brl(rev.totais?.totais?.final ?? null)} · Materiais atendidos ${concl == null ? "—" : `${Math.round(concl * 100)}%`}`}
        actions={
          <Link
            to="/comercial/propostas/$propostaId/revisoes/$revisaoId/resumo-executivo"
            params={{ propostaId: rev.proposta_id, revisaoId: rev.id }}
            className="rounded-md border border-border px-4 py-2 text-sm text-foreground"
          >
            Revisão aprovada {rev.propostas.numero} Rev. {String(rev.numero).padStart(2, "0")}
          </Link>
        }
      />
      <div className="grid gap-4 lg:grid-cols-2">
        <Section title="Ordens de compra">
          {p.ordens_compra.length === 0 ? (
            <EmptyState title="Nenhuma OC" />
          ) : (
            <ul className="nx-order-list">
              {p.ordens_compra.map((o) => (
                <li key={o.id}>
                  <Link
                    to="/compras/ordens-compra/$ordemId"
                    params={{ ordemId: o.id }}
                    className="text-primary"
                  >
                    <RecordIdentity
                      code
                      primary={o.numero}
                      secondary={(o.fornecedores as { nome: string } | null)?.nome}
                    />
                  </Link>
                  <StatusBadge value={o.status} />
                </li>
              ))}
            </ul>
          )}
        </Section>
        <Section title="Ordens de produção">
          {p.ordens_producao.length === 0 ? (
            <EmptyState title="Nenhuma OP" />
          ) : (
            <ul className="nx-order-list">
              {p.ordens_producao.map((o) => (
                <li key={o.id}>
                  <Link
                    to="/compras/ordens-producao/$ordemId"
                    params={{ ordemId: o.id }}
                    className="text-primary"
                  >
                    <RecordIdentity code primary={o.numero} />
                  </Link>
                  <StatusBadge value={o.status} />
                </li>
              ))}
            </ul>
          )}
        </Section>
      </div>
      <Section
        title="Materiais do projeto"
        description="Necessidade planejada e quantidade atendida por recebimento ou produção."
      >
        {p.demandas.length === 0 ? (
          <EmptyState title="Sem demanda planejada" />
        ) : (
          <DataTable
            getRowId={(d) => d.id}
            rows={p.demandas}
            columns={[
              { key: "c", label: "Código", render: (d) => d.revisao_componentes?.codigo ?? "—" },
              {
                key: "d",
                label: "Descrição",
                render: (d) => d.revisao_componentes?.descricao ?? "—",
              },
              { key: "modalidade", label: "Modalidade" },
              {
                key: "q",
                label: "Planejada",
                align: "right",
                render: (d) => qtd(Number(d.quantidade_planejada), d.revisao_componentes?.unidade),
              },
              {
                key: "r",
                label: "Atendida",
                align: "right",
                render: (d) =>
                  qtd(
                    d.ordem_compra_itens.reduce((s, i) => s + Number(i.quantidade_recebida), 0) +
                      d.ordem_producao_itens.reduce(
                        (s, i) => s + Number(i.quantidade_produzida),
                        0,
                      ),
                    d.revisao_componentes?.unidade,
                  ),
              },
            ]}
          />
        )}
      </Section>
    </div>
  );
}
