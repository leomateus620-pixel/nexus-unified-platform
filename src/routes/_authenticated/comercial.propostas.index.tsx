import { createFileRoute, Link, useNavigate } from "@tanstack/react-router";
import { z } from "zod";

import { DataTable, EmptyState, PageHeader, QueryView, Section, StatusBadge } from "@/components/nexus/Page";
import { useOrgId } from "@/features/org/session";
import { usePropostas } from "@/features/propostas/lista";
import { brl, dataBR } from "@/lib/format";

const search = z.object({ status: z.enum(["rascunho", "em_revisao", "enviada", "aceita", "recusada", "substituida"]).optional(), q: z.string().max(100).optional() });

export const Route = createFileRoute("/_authenticated/comercial/propostas/")({
  validateSearch: (s) => search.parse(s),
  head: () => ({
    meta: [
      { title: "Propostas — Sistema Nexus" },
      { name: "description", content: "Lista de propostas comerciais e suas revisões." },
      { property: "og:title", content: "Propostas — Sistema Nexus" },
      { property: "og:description", content: "Propostas comerciais e revisões." },
    ],
  }),
  component: Propostas,
});

function Propostas() {
  const orgId = useOrgId();
  const q = usePropostas(orgId);
  const { status, q: texto } = Route.useSearch();
  const navigate = useNavigate({ from: Route.fullPath });
  const filtradas = (q.data ?? []).filter(
    (p) => (!status || p.revisao?.status === status) && (!texto || `${p.numero} ${p.cliente} ${p.titulo ?? ""}`.toLowerCase().includes(texto.toLowerCase())),
  );
  return (
    <div className="space-y-4">
      <PageHeader
        eyebrow="Comercial"
        title="Propostas"
        description="Cada proposta tem revisões; a revisão corrente abre a área de trabalho."
        actions={<Link to="/comercial/propostas/nova" className="rounded-md bg-primary px-4 py-2 text-sm font-medium text-primary-foreground">Nova proposta</Link>}
      />
      <Section title="Propostas">
        <div className="mb-3 flex flex-wrap gap-2">
          <input
            aria-label="Buscar"
            placeholder="Buscar número ou cliente"
            defaultValue={texto ?? ""}
            onChange={(e) => navigate({ search: (s) => ({ ...s, q: e.target.value || undefined }), replace: true })}
            className="h-8 w-64 rounded border border-input bg-background px-2 text-sm text-foreground"
          />
          <select
            aria-label="Status"
            value={status ?? ""}
            onChange={(e) => navigate({ search: (s) => ({ ...s, status: (e.target.value || undefined) as z.infer<typeof search>["status"] }), replace: true })}
            className="h-8 rounded border border-input bg-background px-2 text-sm text-foreground"
          >
            <option value="">Todos os status</option>
            <option value="rascunho">Rascunho</option>
            <option value="enviada">Enviada</option>
            <option value="aceita">Aceita</option>
            <option value="recusada">Recusada</option>
          </select>
        </div>
        <QueryView query={{ ...q, data: q.data ? filtradas : undefined }} empty={<EmptyState title="Nenhuma proposta encontrada" hint="Crie uma proposta a partir de um cliente cadastrado." />}>
          {(rows) => (
            <DataTable
              getRowId={(p) => p.id}
              rows={rows}
              onRowClick={(p) => navigate({ to: "/comercial/propostas/$propostaId", params: { propostaId: p.id } })}
              columns={[
                { key: "numero", label: "Número" },
                { key: "cliente", label: "Cliente" },
                { key: "unidade", label: "Unidade", render: (p) => p.unidade ?? "—" },
                { key: "rev", label: "Rev.", render: (p) => (p.revisao ? String(p.revisao.numero).padStart(2, "0") : "—") },
                { key: "status", label: "Status", render: (p) => (p.revisao ? <StatusBadge value={p.revisao.status} /> : "—") },
                { key: "final", label: "Total", align: "right", render: (p) => brl(p.final) },
                { key: "created_at", label: "Criada", render: (p) => dataBR(p.created_at) },
              ]}
            />
          )}
        </QueryView>
      </Section>
    </div>
  );
}
