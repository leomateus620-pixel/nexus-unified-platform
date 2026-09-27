import { createFileRoute } from "@tanstack/react-router";

import { PageHeader, StatCard } from "@/components/nexus/Page";
import { useOrg } from "@/features/org/session";
import { useDemandasOrg, useOrdensCompra, useOrdensProducao } from "@/features/suprimentos/queries";
import { brl } from "@/lib/format";

export const Route = createFileRoute("/_authenticated/compras/")({
  head: () => ({
    meta: [
      { title: "Compras e Produção — Sistema Nexus" },
      { name: "description", content: "Demandas, ordens de compra, ordens de produção e fornecedores." },
      { property: "og:title", content: "Compras e Produção — Sistema Nexus" },
      { property: "og:description", content: "Suprimentos e fabricação ligados às propostas." },
    ],
  }),
  component: Page,
});

function Page() {
  const org = useOrg();
  const orgId = org.data?.orgId ?? "";
  const dem = useDemandasOrg(orgId);
  const oc = useOrdensCompra(orgId);
  const op = useOrdensProducao(orgId);
  const v = <T,>(q: { isSuccess: boolean; data?: T }, f: (d: T) => string) => (q.isSuccess && q.data !== undefined ? f(q.data) : "—");
  return (
    <div className="space-y-6">
      <PageHeader eyebrow="Compras e Produção" title="Suprimentos e fabricação" description="Demandas originadas da composição das revisões; ordens separadas por fornecedor e fabricação." />
      <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-4">
        <StatCard label="Demandas sem ordem" value={v(dem, (d) => String(d.filter((x) => x.status === "planejada").length))} />
        <StatCard label="OCs em rascunho" value={v(oc, (d) => String(d.filter((x) => x.status === "rascunho").length))} tone="info" />
        <StatCard label="Valor em OCs emitidas" value={org.data?.canSeeCosts ? v(oc, (d) => brl(d.filter((x) => x.status === "emitida").reduce((s, x) => s + x.total, 0))) : "—"} tone="primary" />
        <StatCard label="OPs liberadas" value={v(op, (d) => String(d.filter((x) => x.status === "liberada").length))} />
      </div>
    </div>
  );
}
