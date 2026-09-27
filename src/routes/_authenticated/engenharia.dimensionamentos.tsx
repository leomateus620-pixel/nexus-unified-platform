import { createFileRoute, useNavigate } from "@tanstack/react-router";
import { useQuery } from "@tanstack/react-query";

import { DataTable, EmptyState, PageHeader, QueryView, Section, StatusBadge } from "@/components/nexus/Page";
import { supabase } from "@/integrations/supabase/client";
import { useOrgId } from "@/features/org/session";
import { qtd } from "@/lib/format";

export const Route = createFileRoute("/_authenticated/engenharia/dimensionamentos")({
  head: () => ({
    meta: [
      { title: "Dimensionamentos — Sistema Nexus" },
      { name: "description", content: "Sistemas dimensionados nas revisões de propostas." },
      { property: "og:title", content: "Dimensionamentos — Sistema Nexus" },
      { property: "og:description", content: "Sistemas dimensionados por revisão." },
    ],
  }),
  component: Page,
});

function Page() {
  const orgId = useOrgId();
  const navigate = useNavigate();
  const q = useQuery({
    queryKey: ["dimensionamentos", orgId],
    enabled: !!orgId,
    queryFn: async () => {
      const { data, error } = await supabase
        .from("proposta_revisoes")
        .select("id,numero,status,proposta_id,propostas!proposta_revisoes_proposta_id_fkey(numero,clientes(razao_social)),sistemas_dimensionados(tipo,metragem,trechos)")
        .eq("organization_id", orgId)
        .neq("status", "substituida")
        .order("created_at", { ascending: false });
      if (error) throw error;
      return data.map((r) => {
        const p = r.propostas as unknown as { numero: string; clientes: { razao_social: string } | null };
        const s = r.sistemas_dimensionados;
        return {
          id: r.id,
          proposta_id: r.proposta_id,
          label: `${p.numero} · Rev. ${String(r.numero).padStart(2, "0")}`,
          cliente: p.clientes?.razao_social ?? "—",
          status: r.status,
          n: s.length,
          telhado: s.filter((x) => x.tipo === "TELHADO").reduce((a, x) => a + Number(x.metragem), 0),
          overhead: s.filter((x) => x.tipo === "OVERHEAD").reduce((a, x) => a + Number(x.metragem) * x.trechos, 0),
        };
      });
    },
  });
  return (
    <div className="space-y-4">
      <PageHeader eyebrow="Engenharia" title="Dimensionamentos" description="Os mesmos registros editados na proposta. Abrir leva ao editor de dimensionamento da revisão." />
      <Section title="Revisões com dimensionamento">
        <QueryView query={q} empty={<EmptyState title="Nenhuma revisão" hint="Dimensionamentos são criados dentro das propostas." />}>
          {(rows) => (
            <DataTable
              getRowId={(r) => r.id}
              rows={rows}
              onRowClick={(r) => navigate({ to: "/comercial/propostas/$propostaId/revisoes/$revisaoId/dimensionamento", params: { propostaId: r.proposta_id, revisaoId: r.id } })}
              columns={[
                { key: "label", label: "Proposta" },
                { key: "cliente", label: "Cliente" },
                { key: "status", label: "Status", render: (r) => <StatusBadge value={r.status} /> },
                { key: "n", label: "Sistemas", align: "right" },
                { key: "telhado", label: "Telhado", align: "right", render: (r) => qtd(r.telhado, "m") },
                { key: "overhead", label: "Overhead (instalado)", align: "right", render: (r) => qtd(r.overhead, "m") },
              ]}
            />
          )}
        </QueryView>
      </Section>
    </div>
  );
}
