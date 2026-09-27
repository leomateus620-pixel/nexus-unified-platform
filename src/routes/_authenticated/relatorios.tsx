import { createFileRoute } from "@tanstack/react-router";

import { EmptyState, PageHeader, QueryView, Section } from "@/components/nexus/Page";
import { useOrgId } from "@/features/org/session";
import { usePropostas } from "@/features/propostas/lista";
import { brl } from "@/lib/format";

export const Route = createFileRoute("/_authenticated/relatorios")({
  head: () => ({
    meta: [
      { title: "Relatórios — Sistema Nexus" },
      {
        name: "description",
        content: "Agregações de propostas por status a partir dos registros reais.",
      },
      { property: "og:title", content: "Relatórios — Sistema Nexus" },
      { property: "og:description", content: "Desempenho comercial." },
    ],
  }),
  component: Page,
});

const STATUS = ["rascunho", "enviada", "aceita", "recusada"] as const;

function Page() {
  const q = usePropostas(useOrgId());
  return (
    <div className="space-y-6">
      <PageHeader
        eyebrow="Relatórios"
        title="Propostas por status"
        description="Totais pela revisão corrente de cada proposta. Revisões sem cálculo atualizado ficam como “—”."
      />
      <Section title="Resumo">
        <QueryView query={q} empty={<EmptyState title="Sem dados para relatório" />}>
          {(rows) => {
            const decididas = rows.filter(
              (r) => r.revisao?.status === "aceita" || r.revisao?.status === "recusada",
            );
            const aceitas = rows.filter((r) => r.revisao?.status === "aceita").length;
            return (
              <>
                <table className="w-full text-sm">
                  <thead className="text-left text-xs uppercase text-muted-foreground">
                    <tr>
                      <th className="py-2">Status</th>
                      <th className="text-right">Qtd.</th>
                      <th className="text-right">Valor</th>
                    </tr>
                  </thead>
                  <tbody>
                    {STATUS.map((s) => {
                      const xs = rows.filter((r) => r.revisao?.status === s);
                      const v = xs.some((x) => x.final == null)
                        ? null
                        : xs.reduce((a, x) => a + (x.final ?? 0), 0);
                      return (
                        <tr key={s} className="border-t border-border/60">
                          <td className="py-2">{s}</td>
                          <td className="text-right tabular-nums">{xs.length}</td>
                          <td className="text-right tabular-nums">{brl(v)}</td>
                        </tr>
                      );
                    })}
                  </tbody>
                </table>
                <p className="mt-3 text-sm text-muted-foreground">
                  Taxa de aceite:{" "}
                  {decididas.length
                    ? `${Math.round((aceitas / decididas.length) * 100)}% (${aceitas}/${decididas.length})`
                    : "—"}
                </p>
              </>
            );
          }}
        </QueryView>
      </Section>
    </div>
  );
}
