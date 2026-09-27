import { createFileRoute, Link, Outlet, useBlocker } from "@tanstack/react-router";
import { useCallback, useMemo, useState } from "react";

import { ErrorState, LoadingState, StatusBadge } from "@/components/nexus/Page";
import { SaveCtx, useRevisao, type SaveStatus } from "@/features/propostas/hooks";
import { brl } from "@/lib/format";

export const Route = createFileRoute("/_authenticated/comercial/propostas/$propostaId/revisoes/$revisaoId")({
  head: () => ({ meta: [{ title: "Proposta — Sistema Nexus" }, { name: "description", content: "Área de trabalho da revisão da proposta." }] }),
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

const tab = "whitespace-nowrap rounded-md px-3 py-1.5 text-sm text-muted-foreground hover:bg-accent hover:text-foreground";
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
    shouldBlockFn: () => status === "salvando" && !window.confirm("Há alterações sendo salvas. Sair mesmo assim?"),
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
      <div className="space-y-4">
        <nav aria-label="breadcrumb" className="text-xs text-muted-foreground">
          <Link to="/comercial" className="hover:text-foreground">Comercial</Link> /{" "}
          <Link to="/comercial/propostas" className="hover:text-foreground">Propostas</Link> / <span className="text-foreground">{p.numero}</span>
        </nav>
        <header className="sticky top-16 z-20 -mx-4 border-b border-border bg-background/95 px-4 pb-3 backdrop-blur md:-mx-6 md:px-6 lg:-mx-8 lg:px-8">
          <div className="flex flex-wrap items-center gap-x-6 gap-y-2">
            <div>
              <p className="text-[11px] uppercase tracking-[0.2em] text-primary">Proposta {p.numero} · Rev. {String(r.numero).padStart(2, "0")}</p>
              <h1 className="text-xl font-bold text-foreground">{p.clientes?.razao_social ?? "—"}</h1>
              <p className="text-xs text-muted-foreground">{p.unidades?.nome ?? "Sem unidade"}{p.titulo ? ` · ${p.titulo}` : ""}</p>
            </div>
            <StatusBadge value={statusLabel[r.status] ?? r.status} />
            {r.revisao_corrente_id_check}
            <div className="text-xs">
              <p className="text-muted-foreground">Total final</p>
              <p className="font-semibold tabular-nums text-foreground">{r.resumo && !r.desatualizada ? brl(r.resumo.totais.final) : "—"}</p>
            </div>
            <div className="text-xs">
              <p className="text-muted-foreground">Pendências</p>
              <p className={pend ? "font-semibold text-warning" : "text-foreground"}>{pend == null ? "—" : pend}</p>
            </div>
            {r.desatualizada && r.editavel && <span className="text-xs text-warning">Cálculo desatualizado</span>}
            {p.revisao_corrente_id !== r.id && <span className="text-xs text-warning">Revisão anterior (somente leitura)</span>}
            <SaveIndicator status={status} msg={msg} />
          </div>
          <div className="mt-3 flex gap-1 overflow-x-auto">
            <Link to="/comercial/propostas/$propostaId/revisoes/$revisaoId/itens-comerciais" params={params} className={tab} activeProps={tabActive}>1. Itens comerciais</Link>
            <Link to="/comercial/propostas/$propostaId/revisoes/$revisaoId/dimensionamento" params={params} className={tab} activeProps={tabActive}>2. Dimensionamento</Link>
            <Link to="/comercial/propostas/$propostaId/revisoes/$revisaoId/orcamento" params={params} className={tab} activeProps={tabActive}>3. Orçamento</Link>
            <Link to="/comercial/propostas/$propostaId/revisoes/$revisaoId/compras" params={params} className={tab} activeProps={tabActive}>4. Planejamento de compras</Link>
            <Link to="/comercial/propostas/$propostaId/revisoes/$revisaoId/producao" params={params} className={tab} activeProps={tabActive}>5. Planejamento de produção</Link>
            <Link to="/comercial/propostas/$propostaId/revisoes/$revisaoId/resumo-executivo" params={params} className={tab} activeProps={tabActive}>6. Resumo executivo</Link>
            <span className="mx-2 border-l border-border" />
            <Link to="/comercial/propostas/$propostaId/revisoes/$revisaoId/parametros" params={params} className={tab} activeProps={tabActive}>Parâmetros</Link>
            <Link to="/comercial/propostas/$propostaId/revisoes/$revisaoId/historico" params={params} className={tab} activeProps={tabActive}>Histórico</Link>
          </div>
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
