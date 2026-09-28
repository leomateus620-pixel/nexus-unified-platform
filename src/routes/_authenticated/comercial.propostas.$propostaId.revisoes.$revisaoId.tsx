import { createFileRoute, Link, Outlet, useBlocker } from "@tanstack/react-router";
import { useCallback, useMemo, useState } from "react";

import { ErrorState, LoadingState, StatusBadge } from "@/components/nexus/Page";
import { StepRuler, SaveFeedback } from "@/components/nexus/Workspace";
import { SaveCtx, useRevisao, type SaveStatus } from "@/features/propostas/hooks";
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
  const [status, setStatus] = useState<SaveStatus>("idle");
  const [msg, setMsg] = useState<string | null>(null);
  const set = useCallback((s: SaveStatus, m?: string) => {
    setStatus(s);
    setMsg(m ?? null);
  }, []);
  const ctx = useMemo(() => ({ status, set, msg }), [status, set, msg]);

  useBlocker({
    shouldBlockFn: () =>
      status === "salvando" && !window.confirm("Há alterações sendo salvas. Sair mesmo assim?"),
    enableBeforeUnload: () => status === "salvando",
  });

  if (rev.isPending) return <LoadingState />;
  if (rev.isError) return <ErrorState error={rev.error} onRetry={() => rev.refetch()} />;
  const r = rev.data;
  const p = r.proposta;
  const params = { propostaId, revisaoId };
  const pend = r.resumo?.pendencias.length ?? null;

  return (
    <SaveCtx.Provider value={ctx}>
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
            <StatusBadge value={statusLabel[r.status] ?? r.status} />
            <div className="nx-context-total">
              <p className="text-muted-foreground">Total final</p>
              <p className="font-semibold tabular-nums text-foreground">
                {r.resumo && !r.desatualizada ? brl(r.resumo.totais.final) : "—"}
              </p>
            </div>
            <div className="nx-context-pending">
              <p className="text-muted-foreground">Pendências</p>
              <p className={pend ? "font-semibold text-warning" : "text-foreground"}>
                {pend == null ? "—" : pend}
              </p>
            </div>
            {r.desatualizada && r.editavel && (
              <span className="text-xs text-warning">Cálculo desatualizado</span>
            )}
            {p.revisao_corrente_id !== r.id && (
              <span className="text-xs text-warning">Revisão anterior (somente leitura)</span>
            )}
            <SaveFeedback status={status} msg={msg} />
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
    </SaveCtx.Provider>
  );
}

function SaveIndicator({ status, msg }: { status: SaveStatus; msg: string | null }) {
  const map: Record<SaveStatus, [string, string]> = {
    idle: ["", ""],
    salvando: ["Salvando…", "text-muted-foreground"],
    salvo: ["Salvo", "text-primary"],
    erro: ["Erro ao salvar", "text-destructive"],
    conflito: ["Conflito: outro usuário alterou. Recarregue.", "text-destructive"],
  };
  const [label, cls] = map[status];
  if (!label) return null;
  return (
    <span role="status" className={`ml-auto text-xs ${cls}`} title={msg ?? ""}>
      {label}
      {msg && status !== "salvo" ? ` — ${msg}` : ""}
    </span>
  );
}
