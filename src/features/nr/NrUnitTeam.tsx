import { useRef, useState } from "react";
import { Link } from "@tanstack/react-router";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { useServerFn } from "@tanstack/react-start";
import { LoadingState, ErrorState } from "@/components/nexus/Page";
import { useCommandKey } from "@/features/operacao/components";
import { QualificationPicker } from "@/features/pessoas-competencias/qualificacoes/Forms";
import type { ContractScope } from "./NrContratacao";
import { nrUnidadeEquipe, nrUnidadePessoaSalvar } from "./equipe.functions";
const alerts: Record<string, string> = {
  vencida: "Vencida",
  vence_em_30_dias: "Vence em até 30 dias",
  validade_nao_informada: "Validade não informada",
  no_prazo: "No prazo declarado",
  revogada: "Revogada",
};
export function NrUnitTeam({ scope, user }: { scope: ContractScope; user: string }) {
  const load = useServerFn(nrUnidadeEquipe),
    save = useServerFn(nrUnidadePessoaSalvar),
    cache = useQueryClient(),
    key = useCommandKey(),
    lock = useRef(false);
  const [page, setPage] = useState(0),
    [term, setTerm] = useState(""),
    [person, setPerson] = useState(""),
    [name, setName] = useState(""),
    [job, setJob] = useState(""),
    [busy, setBusy] = useState(false),
    [error, setError] = useState<Error | null>(null);
  const q = useQuery({
    queryKey: [
      "nr",
      scope.organization_id,
      user,
      scope.norma,
      "equipe",
      scope.cliente_id,
      scope.unidade_id,
      page,
      term,
    ],
    queryFn: ({ signal }) => load({ data: { ...scope, pagina: page, busca: term }, signal }),
    retry: false,
    refetchInterval: 60000,
  });
  async function link(id: string, funcao: string, version: number, active: boolean) {
    if (lock.current) return;
    lock.current = true;
    setBusy(true);
    setError(null);
    const payload = { ...scope, pessoa_id: id, funcao, expected_version: version, ativa: active };
    try {
      await save({ data: { ...payload, chave: key(payload) } });
      setPerson("");
      setName("");
      setJob("");
      await cache.invalidateQueries({ queryKey: ["nr", scope.organization_id] });
    } catch (e) {
      setError(e instanceof Error ? e : new Error("Vínculo não confirmado."));
    } finally {
      lock.current = false;
      setBusy(false);
    }
  }
  if (q.isPending) return <LoadingState label="Consultando equipe da unidade…" />;
  if (q.isError) return <ErrorState error={q.error} onRetry={() => q.refetch()} />;
  return (
    <section className="nr-panel">
      <h2>Equipe e certificados da unidade</h2>
      <p>
        Funcionários e prestadores vinculados à unidade, com certificados do cadastro único de
        pessoas.
      </p>
      <p role="status" className="nr-feedback">
        {q.data.vencidas} certificado(s) vencido(s) · {q.data.vence_em_30_dias} vencendo em até 30
        dias. Referência: {q.data.data_referencia.split("-").reverse().join("/")}.
      </p>
      <label>
        Buscar pessoa ou função
        <input
          type="search"
          className="w-full rounded border p-2"
          maxLength={120}
          value={term}
          onChange={(e) => {
            setTerm(e.target.value);
            setPage(0);
          }}
        />
      </label>
      {q.data.pode_gerir && (
        <details className="my-4">
          <summary>Vincular pessoa cadastrada</summary>
          <p className="nr-source">
            O vínculo registra a atuação nesta unidade. Não concede login, papel de vigia ou
            autorização de entrada.
          </p>
          <QualificationPicker
            org={scope.organization_id}
            tipo="pessoas"
            label="Pessoa"
            value={person}
            initialLabel={name}
            onChange={(id, label) => {
              setPerson(id);
              setName(label);
            }}
            onDenied={(e) => setError(e instanceof Error ? e : new Error("Acesso indisponível"))}
          />
          <label>
            Função na unidade
            <input
              className="w-full rounded border p-2"
              value={job}
              maxLength={160}
              onChange={(e) => setJob(e.target.value)}
            />
          </label>
          <button
            className="nr-inline-action"
            disabled={busy || !person || job.trim().length < 2}
            onClick={() => void link(person, job, 0, true)}
          >
            Confirmar vínculo
          </button>
        </details>
      )}
      {error && <ErrorState error={error} />}{" "}
      {!q.data.total && <p>Nenhuma pessoa vinculada neste recorte autorizado.</p>}
      {q.data.registros.map((p) => (
        <article className="nr-panel my-3" key={p.id}>
          <h3>{p.nome}</h3>
          <p>
            {p.funcao} · {p.vinculada && p.ativa ? "Vínculo ativo" : "Vínculo inativo"}
          </p>
          <Link
            className="nr-inline-action"
            to="/equipe"
            search={{ area: "qualificacoes", pessoaFiltro: p.id }}
          >
            Certificados e comprovantes
          </Link>
          {p.certificados.map((c) => (
            <div key={c.id} className="border-t py-3">
              <strong>{c.competencia}</strong>
              <p>
                {c.estado} · {alerts[c.alerta] ?? c.alerta}
              </p>
              <p className="nr-source">
                {c.carga_horaria == null ? "Carga horária não informada" : `${c.carga_horaria} h`} ·{" "}
                {c.tipo_treinamento ?? "Tipo não informado"} ·{" "}
                {c.modalidade ?? "Modalidade não informada"} · Validade:{" "}
                {c.validade ?? "Não informada"}
              </p>
              <Link
                to="/equipe"
                search={{ area: "qualificacoes", pessoaFiltro: p.id, qualificacao: c.id }}
              >
                Abrir certificado e conferência
              </Link>
            </div>
          ))}
          {p.certificados_total > p.certificados.length && (
            <p>
              Exibindo {p.certificados.length} de {p.certificados_total}. Abra os certificados para
              consultar as demais páginas.
            </p>
          )}
          {q.data.pode_gerir && (
            <button
              disabled={busy}
              className="nr-inline-action"
              onClick={() => void link(p.id, p.funcao, p.version, !p.vinculada)}
            >
              {p.vinculada ? "Desativar vínculo" : "Reativar vínculo"}
            </button>
          )}
        </article>
      ))}
      <nav aria-label="Páginas da equipe" className="flex gap-4">
        <button disabled={page === 0} onClick={() => setPage((p) => p - 1)}>
          Anterior
        </button>
        <span>Página {page + 1}</span>
        <button disabled={(page + 1) * 10 >= q.data.total} onClick={() => setPage((p) => p + 1)}>
          Próxima
        </button>
      </nav>
      <p className="nr-source mt-4">
        Certificado, carga horária, validade, conferência e autorização operacional são verificados
        separadamente. O acesso externo do cliente depende de uma identidade autorizada no Nexus.
      </p>
    </section>
  );
}
