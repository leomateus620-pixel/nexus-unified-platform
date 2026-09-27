import { createFileRoute, Link } from "@tanstack/react-router";

import {
  EmptyState,
  PageHeader,
  QueryView,
  Section,
  StatCard,
  StatusBadge,
} from "@/components/nexus/Page";
import { useOrg } from "@/features/org/session";
import { usePropostas } from "@/features/propostas/lista";
import { useProjetos } from "@/features/projetos/queries";
import { useDemandasOrg } from "@/features/suprimentos/queries";
import { flowSteps } from "@/lib/nexus-nav";
import { brl } from "@/lib/format";

export const Route = createFileRoute("/_authenticated/")({
  head: () => ({
    meta: [
      { title: "Dashboard — Sistema Nexus" },
      {
        name: "description",
        content: "Indicadores reais de propostas, projetos e suprimentos da operação Nexus.",
      },
      { property: "og:title", content: "Dashboard — Sistema Nexus" },
      { property: "og:description", content: "Indicadores de propostas, projetos e suprimentos." },
    ],
  }),
  component: Dashboard,
});

function Dashboard() {
  const org = useOrg();
  const orgId = org.data?.orgId ?? "";
  const prop = usePropostas(orgId);
  const proj = useProjetos(orgId);
  const dem = useDemandasOrg(orgId);
  const ps = prop.data ?? [];
  const abertas = ps.filter(
    (p) => p.revisao && ["rascunho", "em_revisao", "enviada"].includes(p.revisao.status),
  );
  const enviadas = ps.filter((p) => p.revisao?.status === "enviada");
  const valorEnv = enviadas.some((p) => p.final == null)
    ? null
    : enviadas.reduce((s, p) => s + (p.final ?? 0), 0);
  const pendentes = ps.filter(
    (p) => p.revisao?.status === "rascunho" && (p.revisao.desatualizada || p.final == null),
  );
  return (
    <div className="space-y-6">
      <PageHeader
        eyebrow="Visão geral"
        title="Dashboard"
        description="Indicadores calculados a partir dos registros da organização."
      />
      <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-4">
        <StatCard
          label="Propostas em aberto"
          value={prop.isSuccess ? String(abertas.length) : "—"}
        />
        <StatCard
          label="Em negociação (enviadas)"
          value={prop.isSuccess ? brl(valorEnv) : "—"}
          tone="info"
          hint={prop.isSuccess ? `${enviadas.length} proposta(s)` : ""}
        />
        <StatCard
          label="Projetos"
          value={proj.isSuccess ? String(proj.data.length) : "—"}
          tone="primary"
        />
        <StatCard
          label="Demandas sem ordem"
          value={
            dem.isSuccess ? String(dem.data.filter((d) => d.status === "planejada").length) : "—"
          }
        />
      </div>
      <Section title="Fluxo operacional">
        <ol className="flex flex-wrap gap-2 text-xs text-muted-foreground">
          {flowSteps.map((s, i) => (
            <li key={s} className="rounded border border-border px-2 py-1">
              {i + 1}. {s}
            </li>
          ))}
        </ol>
      </Section>
      <div className="grid gap-4 lg:grid-cols-2">
        <Section title="Rascunhos que precisam de cálculo">
          <QueryView
            query={{ ...prop, data: prop.data ? pendentes : undefined }}
            empty={<p className="text-sm text-muted-foreground">Nenhum rascunho pendente.</p>}
          >
            {(rows) => (
              <ul className="divide-y divide-border/60 text-sm">
                {rows.map((p) => (
                  <li key={p.id} className="py-2">
                    <Link
                      to="/comercial/propostas/$propostaId"
                      params={{ propostaId: p.id }}
                      className="text-primary hover:underline"
                    >
                      {p.numero} · {p.cliente}
                    </Link>
                  </li>
                ))}
              </ul>
            )}
          </QueryView>
        </Section>
        <Section title="Projetos recentes">
          <QueryView
            query={proj}
            empty={
              <EmptyState
                title="Nenhum projeto"
                hint="Projetos nascem do aceite de uma proposta."
              />
            }
          >
            {(rows) => (
              <ul className="divide-y divide-border/60 text-sm">
                {rows.slice(0, 6).map((p) => (
                  <li key={p.id} className="flex justify-between py-2">
                    <Link
                      to="/projetos/$projetoId"
                      params={{ projetoId: p.id }}
                      className="text-primary hover:underline"
                    >
                      {p.codigo} · {p.cliente}
                    </Link>
                    <StatusBadge value={p.status} />
                  </li>
                ))}
              </ul>
            )}
          </QueryView>
        </Section>
      </div>
    </div>
  );
}
