import * as Dialog from "@radix-ui/react-dialog";
import { createFileRoute, Link, Outlet, useBlocker } from "@tanstack/react-router";
import {
  Boxes,
  Ruler,
  Calculator,
  ShoppingCart,
  Factory,
  FileText,
  SlidersHorizontal,
  History,
  Info,
} from "lucide-react";
import { ActionButton, ErrorState, LoadingState, StatusBadge } from "@/components/nexus/Page";
import { StepRuler, SaveFeedback } from "@/components/nexus/Workspace";
import { useSave, useRevisao, type RevisaoData } from "@/features/propostas/hooks";
import { ProposalSaveProvider } from "@/features/propostas/ProposalSaveProvider";
import { brl } from "@/lib/format";
import { podeVerEtapa } from "@/lib/nexus-nav";
import { useOrg } from "@/features/org/session";
import "@/features/propostas/ui/revision.css";

export const Route = createFileRoute(
  "/_authenticated/comercial/propostas/$propostaId/revisoes/$revisaoId",
)({
  head: () => ({
    meta: [
      { title: "Proposta — Sistema Nexus" },
      { name: "description", content: "Área de trabalho da revisão da proposta." },
    ],
  }),
  component: Workspace,
});

const statusLabel: Record<string, string> = {
  rascunho: "Rascunho",
  em_revisao: "Em revisão",
  enviada: "Enviada",
  aceita: "Aceita",
  recusada: "Recusada",
  substituida: "Substituída",
};
const stages = [
  { path: "itens-comerciais", label: "Itens", Icon: Boxes },
  { path: "dimensionamento", label: "Dimensionamento", Icon: Ruler },
  { path: "orcamento", label: "Orçamento", Icon: Calculator },
  { path: "compras", label: "Compras", Icon: ShoppingCart },
  { path: "producao", label: "Produção", Icon: Factory },
  { path: "resumo-executivo", label: "Resumo", Icon: FileText },
  { path: "parametros", label: "Parâmetros", Icon: SlidersHorizontal },
  { path: "historico", label: "Histórico", Icon: History },
] as const;

function Workspace() {
  const { propostaId, revisaoId } = Route.useParams();
  const rev = useRevisao(revisaoId);
  const roles = useOrg().data?.roles ?? [];
  if (rev.isPending) return <LoadingState />;
  if (rev.isError) return <ErrorState error={rev.error} onRetry={() => rev.refetch()} />;
  const r = rev.data;
  return (
    <ProposalSaveProvider
      key={revisaoId}
      revisaoId={revisaoId}
      editavel={r.editavel}
      needsCalculation={r.desatualizada || !r.resumo}
    >
      <div className="nx-proposal-workspace nx-revision-flow">
        <header className="nx-proposal-header">
          <ProposalContext revision={r} />
          <StepRuler>
            {stages.filter((s) => podeVerEtapa(roles, s.path)).map(({ path, label, Icon }, index) => (
              <Link
                key={path}
                to={`/comercial/propostas/$propostaId/revisoes/$revisaoId/${path}`}
                params={{ propostaId, revisaoId }}
                className={`nx-step${index > 5 ? " nx-step-secondary" : ""}`}
                activeProps={{ className: "nx-step-active" }}
              >
                <Icon size={19} strokeWidth={1.8} aria-hidden="true" />
                <span>{label}</span>
                {index > 5 && <span className="sr-only"> · Área auxiliar</span>}
              </Link>
            ))}
          </StepRuler>
        </header>
        <div className="nx-stage-content">
          <Outlet />
        </div>
      </div>
    </ProposalSaveProvider>
  );
}

function ProposalContext({ revision: r }: { revision: RevisaoData }) {
  const save = useSave();
  const p = r.proposta;
  const pending =
    r.desatualizada ||
    save.calculation !== "current" ||
    ["local", "salvando", "consolidando", "erro", "conflito"].includes(save.status);
  const count = r.resumo?.pendencias.length;
  return (
    <div className="nx-proposal-context">
      <div className="nx-proposal-identity">
        <div className="nx-proposal-meta">
          <Link to="/comercial/propostas" aria-label="Voltar à lista de propostas">
            Propostas
          </Link>
          <span>
            {p.numero} · Rev. {String(r.numero).padStart(2, "0")}
          </span>
          <StatusBadge value={statusLabel[r.status] ?? r.status} />
          {!r.editavel && <span>Somente leitura</span>}
        </div>
        <h1 title={p.titulo ?? undefined}>{p.titulo || `Proposta ${p.numero}`}</h1>
        <div className="nx-proposal-detail-line">
          <p className="nx-proposal-subtitle" title={p.clientes?.razao_social}>
            {p.clientes?.razao_social ?? "Cliente não informado"}
            {p.unidades?.nome ? ` · ${p.unidades.nome}` : ""}
          </p>
          <Dialog.Root>
            <Dialog.Trigger asChild>
              <button
                type="button"
                className="nx-proposal-details"
                aria-label="Detalhes da proposta"
              >
                <Info size={15} aria-hidden="true" />
                <span className="nx-details-full">Detalhes da proposta</span>
                <span className="nx-details-short" aria-hidden="true">
                  Detalhes
                </span>
              </button>
            </Dialog.Trigger>
            <Dialog.Portal>
              <Dialog.Overlay className="nx-prompt-overlay" />
              <Dialog.Content className="nexus-operational nx-prompt-dialog nx-proposal-details-dialog">
                <Dialog.Title>Detalhes da proposta</Dialog.Title>
                <Dialog.Description>
                  {p.numero} · Revisão {String(r.numero).padStart(2, "0")} ·{" "}
                  {statusLabel[r.status] ?? r.status}
                </Dialog.Description>
                <dl>
                  <div>
                    <dt>Título / escopo</dt>
                    <dd>{p.titulo || "Não informado"}</dd>
                  </div>
                  <div>
                    <dt>Cliente</dt>
                    <dd>{p.clientes?.razao_social ?? "Não informado"}</dd>
                  </div>
                  <div>
                    <dt>Unidade</dt>
                    <dd>{p.unidades?.nome ?? "Não informada"}</dd>
                  </div>
                </dl>
                <Dialog.Close asChild>
                  <ActionButton variant="ghost">Fechar detalhes</ActionButton>
                </Dialog.Close>
              </Dialog.Content>
            </Dialog.Portal>
          </Dialog.Root>
        </div>
        <ProposalSaveBar editavel={r.editavel} revisaoId={r.id} />
      </div>
      <div className="nx-context-total" data-attention={pending || (count ?? 0) > 0}>
        <span className="nx-total-label">
          Total da proposta <span>BRL</span>
        </span>
        <p className="nx-total-value">{r.resumo ? brl(r.resumo.totais.final) : "—"}</p>
        <span className="nx-total-calculation" role="status">
          {save.calculation === "calculating"
            ? "Recalculando…"
            : pending
              ? "Atualização pendente"
              : r.resumo
                ? "Cálculo atualizado"
                : "Aguardando dimensionamento"}
          {count != null && count > 0
            ? ` · ${count} ${count === 1 ? "pendência" : "pendências"}`
            : ""}
        </span>
      </div>
    </div>
  );
}

function ProposalSaveBar({ editavel, revisaoId }: { editavel: boolean; revisaoId: string }) {
  const save = useSave();
  const pending = ["local", "erro", "conflito", "salvando", "consolidando"].includes(save.status);
  const blocker = useBlocker({
    withResolver: true,
    shouldBlockFn: async ({ next }) => {
      if (!editavel || !pending || next.pathname.includes(`/revisoes/${revisaoId}/`)) return false;
      return !(await save.ensureConsistent());
    },
    enableBeforeUnload: () => editavel && pending,
  });
  return (
    <div className="nx-save-bar">
      {editavel && <SaveFeedback status={save.status} msg={save.msg} />}
      {editavel && ["erro", "conflito"].includes(save.status) && (
        <ActionButton variant="ghost" loading={save.busy} onClick={() => save.retry()}>
          Tentar novamente
        </ActionButton>
      )}
      <Dialog.Root
        open={blocker.status === "blocked"}
        onOpenChange={(open) => {
          if (!open) blocker.reset?.();
        }}
      >
        <Dialog.Portal>
          <Dialog.Overlay className="nx-prompt-overlay" />
          <Dialog.Content className="nexus-operational nx-prompt-dialog">
            <Dialog.Title>Há alterações pendentes</Dialog.Title>
            <Dialog.Description>
              O salvamento ainda não foi confirmado. Seu trabalho local está preservado nesta
              revisão. Conclua os campos ou resolva a falha antes de sair.
            </Dialog.Description>
            <div className="nx-object-actions">
              <ActionButton onClick={() => blocker.reset?.()}>Continuar editando</ActionButton>
              <ActionButton variant="ghost" onClick={() => blocker.proceed?.()}>
                Sair sem concluir
              </ActionButton>
            </div>
          </Dialog.Content>
        </Dialog.Portal>
      </Dialog.Root>
    </div>
  );
}
