import * as Dialog from "@radix-ui/react-dialog";
import { createFileRoute, Link, Outlet, useBlocker } from "@tanstack/react-router";

import { ErrorState, LoadingState, StatusBadge } from "@/components/nexus/Page";
import { StepRuler, SaveFeedback } from "@/components/nexus/Workspace";
import { useSave, useRevisao } from "@/features/propostas/hooks";
import { ProposalSaveProvider } from "@/features/propostas/ProposalSaveProvider";
import { ActionButton } from "@/components/nexus/Page";
import { brl } from "@/lib/format";

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

const tab =
  "whitespace-nowrap rounded-md px-3 py-1.5 text-sm text-muted-foreground hover:bg-accent hover:text-foreground";
const tabActive = { className: "bg-accent text-foreground font-medium" };

function Workspace() {
  const { propostaId, revisaoId } = Route.useParams();
  const rev = useRevisao(revisaoId);
  if (rev.isPending) return <LoadingState />;
  if (rev.isError) return <ErrorState error={rev.error} onRetry={() => rev.refetch()} />;
  const r = rev.data;
  const p = r.proposta;
  const params = { propostaId, revisaoId };
  const pend = r.resumo?.pendencias.length ?? null;

  return (
    <ProposalSaveProvider key={revisaoId} revisaoId={revisaoId}>
      <div className="nx-proposal-workspace">
        <header className="nx-proposal-header">
          <div className="nx-proposal-context">
            <div className="nx-proposal-identity">
              <nav aria-label="Caminho da proposta" className="nx-breadcrumb">
                <Link to="/comercial">Comercial</Link> /{" "}
                <Link to="/comercial/propostas">Propostas</Link> / {p.numero} · Rev.{" "}
                {String(r.numero).padStart(2, "0")}
              </nav>
              <h1>{p.clientes?.razao_social ?? "—"}</h1>
              <p className="nx-proposal-subtitle">
                {p.unidades?.nome ?? "Sem unidade"}
                {p.titulo ? ` · ${p.titulo}` : ""}
              </p>
            </div>
            <div className="nx-context-total">
              <div className="nx-context-state">
                <StatusBadge value={statusLabel[r.status] ?? r.status} />
                <span>{pend == null ? "—" : pend} pendências</span>
              </div>
              <p className="font-semibold tabular-nums text-foreground">
                {r.resumo && !r.desatualizada ? brl(r.resumo.totais.final) : "—"}
                <span className="sr-only"> Total final</span>
              </p>
            </div>
            {r.desatualizada && r.editavel && (
              <span className="text-xs text-warning">Cálculo desatualizado</span>
            )}
            {p.revisao_corrente_id !== r.id && (
              <span className="text-xs text-warning">Revisão anterior (somente leitura)</span>
            )}
            <ProposalSaveBar editavel={r.editavel} />
          </div>
          <StepRuler>
            <Link
              to="/comercial/propostas/$propostaId/revisoes/$revisaoId/itens-comerciais"
              params={params}
              className="nx-step"
              activeProps={tabActive}
            >
              <span className="nx-step-number">01</span> Itens comerciais
            </Link>
            <Link
              to="/comercial/propostas/$propostaId/revisoes/$revisaoId/dimensionamento"
              params={params}
              className="nx-step"
              activeProps={tabActive}
            >
              <span className="nx-step-number">02</span> Dimensionamento
            </Link>
            <Link
              to="/comercial/propostas/$propostaId/revisoes/$revisaoId/orcamento"
              params={params}
              className="nx-step"
              activeProps={tabActive}
            >
              <span className="nx-step-number">03</span> Orçamento
            </Link>
            <Link
              to="/comercial/propostas/$propostaId/revisoes/$revisaoId/compras"
              params={params}
              className="nx-step"
              activeProps={tabActive}
            >
              <span className="nx-step-number">04</span>{" "}
              <span aria-label="Planejamento de compras">Compras</span>
            </Link>
            <Link
              to="/comercial/propostas/$propostaId/revisoes/$revisaoId/producao"
              params={params}
              className="nx-step"
              activeProps={tabActive}
            >
              <span className="nx-step-number">05</span>{" "}
              <span aria-label="Planejamento de produção">Produção</span>
            </Link>
            <Link
              to="/comercial/propostas/$propostaId/revisoes/$revisaoId/resumo-executivo"
              params={params}
              className="nx-step"
              activeProps={tabActive}
            >
              <span className="nx-step-number">06</span>{" "}
              <span aria-label="Resumo executivo">Resumo</span>
            </Link>
            <span className="nx-step-divider" aria-hidden="true" />
            <Link
              to="/comercial/propostas/$propostaId/revisoes/$revisaoId/parametros"
              params={params}
              className="nx-step nx-step-secondary"
              activeProps={tabActive}
            >
              Parâmetros
            </Link>
            <Link
              to="/comercial/propostas/$propostaId/revisoes/$revisaoId/historico"
              params={params}
              className="nx-step nx-step-secondary"
              activeProps={tabActive}
            >
              Histórico
            </Link>
          </StepRuler>
        </header>
        <Outlet />
      </div>
    </ProposalSaveProvider>
  );
}

function ProposalSaveBar({ editavel }: { editavel: boolean }) {
  const save = useSave();
  const blocker = useBlocker({
    withResolver: true,
    shouldBlockFn: () =>
      ["local", "erro", "conflito", "salvando", "consolidando"].includes(save.status),
    enableBeforeUnload: () =>
      ["local", "erro", "conflito", "salvando", "consolidando"].includes(save.status),
  });
  return (
    <div className="nx-save-bar">
      {editavel && (
        <ActionButton loading={save.busy} onClick={() => save.save()}>
          Salvar proposta
        </ActionButton>
      )}
      <SaveFeedback status={save.status} msg={save.msg} />
      <Dialog.Root
        open={blocker.status === "blocked"}
        onOpenChange={(open) => {
          if (!open) blocker.reset?.();
        }}
      >
        <Dialog.Portal>
          <Dialog.Overlay className="nx-prompt-overlay" />
          <Dialog.Content className="nexus-operational nx-prompt-dialog">
            <Dialog.Title>Há trabalho em andamento</Dialog.Title>
            <Dialog.Description>
              Campos locais ou gravações pendentes podem não estar sincronizados. Permaneça para
              revisar e salvar antes de sair.
            </Dialog.Description>
            <div className="nx-object-actions">
              <ActionButton onClick={() => blocker.reset?.()}>Permanecer</ActionButton>
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
