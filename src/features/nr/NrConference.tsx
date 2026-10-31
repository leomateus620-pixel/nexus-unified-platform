import { useState } from "react";
import { Link } from "@tanstack/react-router";
import { useServerFn } from "@tanstack/react-start";
import { useQuery } from "@tanstack/react-query";
import { ActionButton, ErrorState, LoadingState } from "@/components/nexus/Page";
import { nrConsultar } from "./nr.functions";
import type { Norma, NrRecord } from "./domain";
import type { NrSearch } from "./NrWorkspace";

/** A search candidate is never an association or an engineering approval. */
export function NrConference({
  org,
  norma,
  search,
}: {
  org: string;
  norma: Norma;
  search: NrSearch;
}) {
  const consult = useServerFn(nrConsultar);
  const [tag, setTag] = useState("");
  const [name, setName] = useState("");
  const [term, setTerm] = useState("");
  const [page, setPage] = useState(0);
  const [submitted, setSubmitted] = useState<{ tag: string; name: string } | null>(null);
  const query = useQuery({
    queryKey: ["nr", org, norma, "conferencia", search.cliente, search.unidade, term, page],
    enabled: !!submitted && !!search.unidade,
    queryFn: ({ signal }) =>
      consult({
        data: {
          organization_id: org,
          norma,
          recurso: "locais",
          unidade_id: search.unidade || undefined,
          busca: term,
          pagina: page,
          limite: 25,
        },
        signal,
      }),
    retry: false,
  });
  const data =
    query.data && "rows" in query.data
      ? (query.data as { rows: NrRecord[]; total: number; pagina: number; limite: number })
      : undefined;
  const normalize = (v: string) =>
    v.normalize("NFKC").trim().replace(/\s+/g, " ").toLocaleUpperCase("pt-BR");
  return (
    <section className="nr-panel">
      <div className="nr-panel-header">
        <h2>Conferência de correspondência</h2>
      </div>
      <p className="nr-muted mb-4">
        Compare uma referência externa com os locais da unidade em uso. Candidatos encontrados pela
        busca precisam de conferência humana.
      </p>
      {!search.unidade ? (
        <p className="nr-source">Selecione a unidade do registro externo antes de conferir.</p>
      ) : (
        <form
          className="nr-filters"
          onSubmit={(e) => {
            e.preventDefault();
            setSubmitted({ tag, name });
            setTerm(tag.trim() || name.trim());
            setPage(0);
          }}
        >
          <label>
            TAG externa
            <input value={tag} onChange={(e) => setTag(e.target.value)} maxLength={80} />
          </label>
          <label>
            Nome externo
            <input value={name} onChange={(e) => setName(e.target.value)} maxLength={120} />
          </label>
          <ActionButton type="submit" disabled={!tag.trim() && !name.trim()}>
            Conferir cadastro
          </ActionButton>
        </form>
      )}
      {submitted &&
        (query.isPending ? (
          <LoadingState />
        ) : query.isError ? (
          <ErrorState error={query.error} onRetry={() => query.refetch()} />
        ) : (
          <>
            <div className="nr-table-wrap" tabIndex={0}>
              <table className="nr-technical-table">
                <caption>
                  Referência externa: {submitted.tag} · {submitted.name || "Nome não informado"}
                </caption>
                <thead>
                  <tr>
                    <th>TAG cadastrada</th>
                    <th>Nome cadastrado</th>
                    <th>Evidência de correspondência</th>
                    <th>Conferir</th>
                  </tr>
                </thead>
                <tbody>
                  {data?.rows.map((row) => (
                    <tr key={row.id}>
                      <th scope="row">{row.tag}</th>
                      <td>{row.titulo}</td>
                      <td>
                        {submitted.tag && normalize(row.tag ?? "") === normalize(submitted.tag)
                          ? "TAG igual nesta unidade"
                          : row.aliases?.some((a) => normalize(a) === normalize(submitted.tag))
                            ? "Alias igual nesta unidade"
                            : "Candidato da busca; vínculo não comprovado"}
                        {submitted.name && normalize(row.titulo) !== normalize(submitted.name)
                          ? " · Nome divergente"
                          : ""}
                      </td>
                      <td>
                        <Link
                          to={String(`${norma === "NR33" ? "/nr-33" : "/nr-35"}/locais/${row.id}`)}
                          search={{ ...search, ficha: "identificacao" }}
                          className="nr-inline-action"
                        >
                          Abrir ficha
                        </Link>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
            {!data?.total && (
              <p className="nr-source">
                Nenhum candidato encontrado. Isso não comprova ausência no acervo: confira TAG,
                alias e unidade.
              </p>
            )}
            {!!data && data.total > data.limite && (
              <div className="nr-pagination">
                <span>{data.total} candidatos</span>
                <ActionButton
                  variant="ghost"
                  disabled={page === 0}
                  onClick={() => setPage(page - 1)}
                >
                  Anterior
                </ActionButton>
                <ActionButton
                  variant="ghost"
                  disabled={(page + 1) * data.limite >= data.total}
                  onClick={() => setPage(page + 1)}
                >
                  Próxima
                </ActionButton>
              </div>
            )}
            <p className="nr-source">
              Esta conferência não importa dados, não altera vínculos e não aprova conclusões
              técnicas. As decisões de importação ficam na administração do acervo.
            </p>
          </>
        ))}
    </section>
  );
}
