import { createFileRoute, Link } from "@tanstack/react-router";

import { EmptyState, PageHeader, QueryView, Section, StatCard } from "@/components/nexus/Page";
import { useOrgId } from "@/features/org/session";
import { usePropostas } from "@/features/propostas/lista";
import { brl } from "@/lib/format";

export const Route = createFileRoute("/_authenticated/comercial/")({
  head: () => ({
    meta: [
      { title: "Comercial — Sistema Nexus" },
      {
        name: "description",
        content: "Propostas, revisões e aprovações comerciais no Sistema Nexus.",
      },
      { property: "og:title", content: "Comercial — Sistema Nexus" },
      { property: "og:description", content: "Propostas, revisões e aprovações comerciais." },
    ],
  }),
  component: Comercial,
});

function Comercial() {
  const orgId = useOrgId();
  const q = usePropostas(orgId);
  const rows = q.data ?? [];
  const por = (s: string) => rows.filter((r) => r.revisao?.status === s);
  const soma = (xs: typeof rows) =>
    xs.some((x) => x.final == null) ? null : xs.reduce((a, x) => a + (x.final ?? 0), 0);
  const ok = q.isSuccess;
  return (
    <div className="space-y-6">
      <PageHeader
        eyebrow="Comercial"
        title="Visão comercial"
        description="Situação das propostas pela revisão corrente. Valores em negociação não são receita realizada."
        actions={
          <Link
            to="/comercial/propostas/nova"
            className="rounded-md bg-primary px-4 py-2 text-sm font-medium text-primary-foreground"
          >
            Nova proposta
          </Link>
        }
      />
      <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-4">
        <StatCard label="Propostas" value={ok ? String(rows.length) : "—"} />
        <StatCard label="Em rascunho" value={ok ? String(por("rascunho").length) : "—"} />
        <StatCard
          label="Enviadas (em negociação)"
          value={ok ? brl(soma(por("enviada"))) : "—"}
          hint={ok ? `${por("enviada").length} proposta(s)` : ""}
          tone="info"
        />
        <StatCard
          label="Aceitas"
          value={ok ? brl(soma(por("aceita"))) : "—"}
          hint={ok ? `${por("aceita").length} proposta(s)` : ""}
          tone="primary"
        />
      </div>
      <Section title="Oportunidades">
        <EmptyState
          title="Cadastro de oportunidades ainda não disponível"
          hint="As propostas são criadas diretamente a partir do cliente. O funil de oportunidades será ligado quando o cadastro for implementado."
        />
      </Section>
      <Section title="Últimas propostas">
        <QueryView
          query={q}
          empty={
            <EmptyState
              title="Nenhuma proposta"
              action={
                <Link to="/comercial/propostas/nova" className="text-sm text-primary">
                  Criar a primeira proposta
                </Link>
              }
            />
          }
        >
          {(r) => (
            <ul className="divide-y divide-border/60 text-sm">
              {r.slice(0, 8).map((p) => (
                <li key={p.id} className="flex justify-between py-2">
                  <Link
                    to="/comercial/propostas/$propostaId"
                    params={{ propostaId: p.id }}
                    className="text-primary hover:underline"
                  >
                    {p.numero} · {p.cliente}
                  </Link>
                  <span className="tabular-nums text-muted-foreground">{brl(p.final)}</span>
                </li>
              ))}
            </ul>
          )}
        </QueryView>
      </Section>
    </div>
  );
}
