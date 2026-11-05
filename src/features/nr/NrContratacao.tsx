import { useRef, useState } from "react";
import { Link } from "@tanstack/react-router";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { useServerFn } from "@tanstack/react-start";
import { useOrg } from "@/features/org/session";
import { ErrorState, LoadingState } from "@/components/nexus/Page";
import { useCommandKey } from "@/features/operacao/components";
import { nrContratacaoObter, nrContratacaoSalvar } from "./contratacao.functions";
import type { NrContratacao as Contract } from "./contratacao.schemas";
import type { Norma } from "./domain";
export type ContractScope = {
  organization_id: string;
  cliente_id: string;
  unidade_id: string;
  norma: Norma;
};
export function useNrContratacao(scope: ContractScope, enabled = true) {
  const session = useOrg(),
    load = useServerFn(nrContratacaoObter);
  return useQuery({
    queryKey: [
      "nr",
      scope.organization_id,
      session.data?.userId,
      scope.norma,
      "contratacao",
      scope.cliente_id,
      scope.unidade_id,
    ],
    enabled: enabled && !!session.data && !!scope.cliente_id && !!scope.unidade_id,
    queryFn: ({ signal }) => load({ data: scope, signal }),
    retry: false,
  });
}
export function NrContratacao({
  scope,
  compact = false,
}: {
  scope: ContractScope;
  compact?: boolean;
}) {
  const q = useNrContratacao(scope);
  if (q.isPending) return <LoadingState label="Conferindo contratação…" />;
  if (q.isError) return <ErrorState error={q.error} onRetry={() => q.refetch()} />;
  if (compact)
    return (
      <p className="nr-source">
        {q.data.confirmada
          ? `${q.data.documentos.length} documentos contratados · revisão ${q.data.version}`
          : "Contratação documental pendente de confirmação pelo RT."}{" "}
        <Link
          to={String(`${scope.norma === "NR33" ? "/nr-33" : "/nr-35"}/contratacao`)}
          search={{ cliente: scope.cliente_id, unidade: scope.unidade_id }}
        >
          Consultar contratação
        </Link>
      </p>
    );
  return (
    <ContractEditor key={`${scope.unidade_id}:${q.data.version}`} scope={scope} value={q.data} />
  );
}
function ContractEditor({ scope, value }: { scope: ContractScope; value: Contract }) {
  const [selected, setSelected] = useState(value.documentos),
    [source, setSource] = useState(value.fonte ?? ""),
    [busy, setBusy] = useState(false),
    [error, setError] = useState<Error | null>(null),
    [saved, setSaved] = useState(false);
  const lock = useRef(false),
    save = useServerFn(nrContratacaoSalvar),
    cache = useQueryClient(),
    key = useCommandKey();
  async function submit() {
    if (lock.current) return;
    lock.current = true;
    setBusy(true);
    setError(null);
    setSaved(false);
    const payload = {
      ...scope,
      expected_version: value.version,
      documentos: [...selected].sort(),
      fonte: source,
    };
    try {
      await save({ data: { ...payload, chave: key(payload) } });
      setSaved(true);
      await cache.invalidateQueries({ queryKey: ["nr", scope.organization_id] });
    } catch (e) {
      setError(e instanceof Error ? e : new Error("Não foi possível confirmar a seleção."));
    } finally {
      lock.current = false;
      setBusy(false);
    }
  }
  return (
    <section className="nr-panel nr-contract" aria-labelledby="nr-contract-title">
      <h2 id="nr-contract-title">Documentos contratados da unidade</h2>
      <p>
        Uma seleção para NR-33 e NR-35, confirmada pelo responsável técnico. O levantamento e o
        cálculo de ventilação dos espaços confinados permanecem obrigatórios.
      </p>
      <p className="nr-source">
        {value.confirmada
          ? `Revisão ${value.version} · ${value.documentos.length} de 13 documentos · ${value.responsavel?.nome ?? "RT registrado"}`
          : "Seleção ainda não confirmada. A existência de arquivos anteriores não comprova a contratação atual."}
      </p>
      {value.bloqueio && (
        <p role="status" className="nr-feedback">
          {value.bloqueio}
        </p>
      )}
      <fieldset disabled={!value.pode_alterar || busy} className="nr-contract-grid">
        <legend>Catálogo documental</legend>
        {value.catalogo.map((d) => (
          <label className="nr-contract-item" key={d.codigo}>
            <input
              type="checkbox"
              checked={selected.includes(d.codigo)}
              disabled={d.obrigatorio}
              onChange={(e) =>
                setSelected((v) =>
                  e.target.checked ? [...v, d.codigo] : v.filter((x) => x !== d.codigo),
                )
              }
            />
            <span>
              <strong>{d.titulo}</strong>
              <small>
                {d.escopo === "local" ? "Por local" : "Geral da unidade"} · {d.normas.join(" / ")}
                {d.obrigatorio ? " · Obrigatório" : ""}
              </small>
            </span>
          </label>
        ))}
      </fieldset>
      <label className="nr-contract-source">
        Referência da contratação e motivo da alteração
        <textarea
          value={source}
          rows={3}
          maxLength={4000}
          disabled={!value.pode_alterar || busy}
          onChange={(e) => setSource(e.target.value)}
          placeholder="Contrato, proposta ou documento conferido pelo responsável técnico"
        />
      </label>
      <p className="nr-source">
        A seleção habilita a preparação documental. Modelos, revisão, assinatura e liberação
        operacional mantêm suas verificações próprias. O acervo e as respostas históricas são
        preservados.
      </p>
      {value.pode_alterar && (
        <button
          className="nr-inline-action"
          disabled={busy || source.trim().length < 10}
          onClick={() => void submit()}
        >
          {busy ? "Confirmando…" : "Confirmar documentos contratados"}
        </button>
      )}
      {error && <ErrorState error={error} />}
      {saved && <p role="status">Contratação confirmada no servidor.</p>}
      <details>
        <summary>Histórico da contratação</summary>
        {value.historico.length ? (
          value.historico.map((h) => (
            <p key={h.version}>
              <strong>Revisão {h.version}</strong> ·{" "}
              {new Date(h.created_at).toLocaleString("pt-BR")} · {h.documentos.length} documentos
              <br />
              {h.fonte}
            </p>
          ))
        ) : (
          <p>Nenhuma confirmação registrada.</p>
        )}
      </details>
    </section>
  );
}
