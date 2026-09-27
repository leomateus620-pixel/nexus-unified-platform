import { createFileRoute, Link, useNavigate } from "@tanstack/react-router";
import { z } from "zod";

import {
  DataTable,
  EmptyState,
  PageHeader,
  QueryView,
  Section,
  StatusBadge,
} from "@/components/nexus/Page";
import { useOrgId } from "@/features/org/session";
import { RecordIdentity } from "@/components/nexus/OperationalDetails";
import { usePropostas } from "@/features/propostas/lista";
import { brl, dataBR } from "@/lib/format";

const search = z.object({
  status: z
    .enum(["rascunho", "em_revisao", "enviada", "aceita", "recusada", "substituida"])
    .optional(),
  q: z.string().max(100).optional(),
});

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
    (p) =>
      (!status || p.revisao?.status === status) &&
      (!texto ||
        `${p.numero} ${p.cliente} ${p.titulo ?? ""}`.toLowerCase().includes(texto.toLowerCase())),
  );
  return (
    <div className="space-y-4">
      <PageHeader
        eyebrow="Comercial"
        title="Propostas"
        description="Cliente, obra e revisão corrente. Abra uma proposta para continuar o orçamento."
        actions={
          <Link
            to="/comercial/propostas/nova"
            className="rounded-md bg-primary px-4 py-2 text-sm font-medium text-primary-foreground"
          >
            Nova proposta
          </Link>
        }
      />
      <Section title="Carteira de propostas" className="nx-proposals-list">
        <div className="nx-filter-bar">
          <label>
            Buscar proposta
            <input
              aria-label="Buscar"
              placeholder="Buscar número ou cliente"
              defaultValue={texto ?? ""}
              onChange={(e) =>
                navigate({
                  search: (s) => ({ ...s, q: e.target.value || undefined }),
                  replace: true,
                })
              }
              className="h-10 rounded border border-input bg-background px-3 text-sm text-foreground"
            />
          </label>
          <label>
            Estado da revisão
            <select
              aria-label="Status"
              value={status ?? ""}
              onChange={(e) =>
                navigate({
                  search: (s) => ({
                    ...s,
                    status: (e.target.value || undefined) as z.infer<typeof search>["status"],
                  }),
                  replace: true,
                })
              }
              className="h-10 rounded border border-input bg-background px-3 text-sm text-foreground"
            >
              <option value="">Todos os status</option>
              <option value="rascunho">Rascunho</option>
              <option value="enviada">Enviada</option>
              <option value="aceita">Aceita</option>
              <option value="recusada">Recusada</option>
            </select>
          </label>
          {q.data && <p className="nx-filter-count">{filtradas.length} proposta(s)</p>}
        </div>
        <QueryView
          query={{ ...q, data: q.data ? filtradas : undefined }}
          empty={
            <EmptyState
              title={
                q.data?.length ? "Nenhum resultado para os filtros" : "Nenhuma proposta cadastrada"
              }
              hint={
                q.data?.length
                  ? "Ajuste a busca ou o estado da revisão para encontrar sua proposta."
                  : "Crie uma proposta a partir de um cliente cadastrado."
              }
            />
          }
        >
          {(rows) => (
            <DataTable
              getRowId={(p) => p.id}
              rows={rows}
              onRowClick={(p) =>
                navigate({ to: "/comercial/propostas/$propostaId", params: { propostaId: p.id } })
              }
              columns={[
                {
                  key: "cliente",
                  label: "Cliente / obra",
                  render: (p) => (
                    <RecordIdentity
                      primary={p.cliente}
                      secondary={p.unidade ?? "Unidade não informada"}
                    />
                  ),
                },
                {
                  key: "numero",
                  label: "Proposta / revisão",
                  render: (p) => (
                    <RecordIdentity
                      code
                      primary={p.numero}
                      secondary={
                        p.revisao
                          ? `Revisão ${String(p.revisao.numero).padStart(2, "0")}`
                          : "Sem revisão"
                      }
                    />
                  ),
                },
                {
                  key: "status",
                  label: "Status",
                  render: (p) => (p.revisao ? <StatusBadge value={p.revisao.status} /> : "—"),
                },
                {
                  key: "final",
                  label: "Valor da revisão",
                  align: "right",
                  render: (p) => <strong className="font-medium">{brl(p.final)}</strong>,
                },
                { key: "created_at", label: "Criada", render: (p) => dataBR(p.created_at) },
              ]}
            />
          )}
        </QueryView>
      </Section>
    </div>
  );
}
