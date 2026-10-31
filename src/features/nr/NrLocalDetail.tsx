import { lazy, Suspense } from "react";
import { Link } from "@tanstack/react-router";
import { useQuery } from "@tanstack/react-query";
import { useServerFn } from "@tanstack/react-start";
import { ArrowRight, ClipboardList } from "lucide-react";
import { ErrorState, LoadingState } from "@/components/nexus/Page";
import type { Norma, NrContexto, NrRecord, NrRecurso } from "./domain";
import type { NrSearch } from "./NrWorkspace";
import { nrConsultar } from "./nr.functions";
import { NrFacts, NrValue, nrLabel, nrObject } from "./technical-display";
import { NrTechnicalTimeline } from "./NrRecordHistory";
import { NrPhotoGallery } from "./NrPhotoGallery";
import { NrLocalProposedChanges } from "./NrLocalProposedChanges";
import { nrLocalProposalAffects } from "./local-technical";
const NrFilesPanel = lazy(() =>
  import("./NrFilesPanel").then((m) => ({ default: m.NrFilesPanel })),
);
const NrCalculations = lazy(() =>
  import("./NrCalculations").then((m) => ({ default: m.NrCalculations })),
);
const areas = [
  ["identificacao", "Identificação"],
  ["geometria", "Geometria"],
  ["avaliacao", "Itens de avaliação"],
  ["memorial", "Memorial de Cálculo"],
  ["resgate", "Resgate"],
  ["fotos", "Fotos"],
  ["documentos", "Documentos"],
  ["historico", "Histórico"],
] as const;
function TechnicalSection({ title, value }: { title: string; value: unknown }) {
  return (
    <section className="nr-technical-section">
      <h3>{title}</h3>
      <NrFacts value={value} />
    </section>
  );
}

export function NrLocalDetail({
  row,
  norma,
  contexto,
  search,
  onSearch,
  onSaved,
}: {
  row: NrRecord;
  norma: Norma;
  contexto: NrContexto;
  search: NrSearch;
  onSearch: (patch: Partial<NrSearch>) => void;
  onSaved: () => void;
}) {
  const base = norma === "NR33" ? "/nr-33" : "/nr-35";
  const area = search.ficha || "identificacao";
  const d = row.dados;
  const cadastro = nrObject(d["cadastro"]),
    geometria = nrObject(d["geometria"]);
  const unitName =
    contexto.unidades.find((u) => u.id === row.unidade_id)?.nome ?? "Unidade do local";
  const scope = {
    ...search,
    cliente: row.cliente_id ?? "",
    unidade: row.unidade_id ?? "",
    local: row.id,
    busca: "",
    pagina: 0,
    pasta: "",
  };
  return (
    <div className="nr-local-detail">
      {!!d["revisao_tecnica_nexus"] && (
        <p className="nr-notice" role="note">
          Há alterações técnicas propostas na Nexus. Os cálculos e as validações históricos
          continuam identificados como origem; confira as entradas antes de adotar uma nova revisão.
        </p>
      )}
      <NrLocalProposedChanges value={d} />
      <div className="nr-local-identity">
        <p className="nr-local-context">
          <span>{unitName}</span>
          <span>{row.familia || nrLabel(row.tipo ?? "Local")}</span>
        </p>
        <Link to={String(`${base}/levantamentos`)} search={scope} className="nr-inline-action">
          <ClipboardList size={16} /> Abrir levantamento
        </Link>
      </div>
      <label className="nr-detail-select">
        Área da ficha técnica
        <select value={area} onChange={(e) => onSearch({ ficha: e.target.value })}>
          {areas.map(([key, title]) => (
            <option key={key} value={key}>
              {title}
            </option>
          ))}
        </select>
      </label>
      <nav className="nr-detail-tabs" aria-label="Áreas da ficha técnica">
        {areas.map(([key, title]) => (
          <Link
            key={key}
            to={String(`${base}/locais/${row.id}`)}
            search={{ ...search, ficha: key }}
            activeOptions={{ exact: true, includeSearch: true }}
            aria-current={area === key ? "page" : false}
          >
            {title}
          </Link>
        ))}
      </nav>
      <section aria-label={areas.find(([key]) => key === area)?.[1]} className="nr-detail-area">
        {area === "identificacao" && (
          <>
            <NrFacts
              value={{
                tag: row.tag,
                nome: row.titulo,
                setor: d["setor"],
                familia: row.familia,
                enquadramento: d["enquadramento"],
                descricao: row.descricao,
                acesso: d["acesso"],
                processo: d["processo"],
                atividades: d["atividades"],
              }}
            />
            <TechnicalSection title="Aberturas e acessos" value={{ aberturas: d["aberturas"] }} />
            <TechnicalSection title="Cadastro técnico e sinalização" value={cadastro} />
            <TechnicalSection title="Levantamento histórico" value={d["levantamento"]} />
            <p className="nr-source">
              A conclusão e a validação registradas na origem são informações históricas. A revisão
              técnica na Nexus permanece independente.
            </p>
            <details>
              <summary>Informações complementares preservadas</summary>
              <NrFacts
                value={d}
                omit={[
                  "id",
                  "unidade_id",
                  "tag",
                  "nome",
                  "tipo",
                  "familia",
                  "setor",
                  "descricao",
                  "enquadramento",
                  "processo",
                  "acesso",
                  "atividades",
                  "cadastro",
                  "aberturas",
                  "geometria",
                  "itens",
                  "fotos",
                  "historico",
                  "resgate",
                  "ventilacao",
                  "ventilacao_fixa",
                  "calculo",
                  "calculo_fixo",
                  "levantamento",
                  "ancoragens",
                ]}
              />
            </details>
          </>
        )}
        {area === "geometria" && (
          <>
            <h3>Geometria e dimensões registradas</h3>
            {nrLocalProposalAffects(d, ["geometria"]) ? (
              <>
                <p className="nr-notice">
                  Há dimensões ou valores declarados propostos na Nexus, aguardando revisão. Os
                  metadados históricos abaixo não validam estes valores.
                </p>
                <NrFacts
                  value={geometria}
                  omit={["autor", "data", "validacao", "nota_validacao"]}
                />
                <details>
                  <summary>Autoria, data e validação históricas · não aprovam a proposta</summary>
                  <NrFacts
                    value={geometria}
                    keys={["autor", "data", "validacao", "nota_validacao"]}
                  />
                </details>
              </>
            ) : (
              <NrFacts value={geometria} />
            )}
            {typeof geometria["volume"] === "number" &&
              [
                geometria["volume_documento"],
                geometria["volume_placa"],
                geometria["volume_informado"],
              ].some((v) => typeof v === "number" && v !== geometria["volume"]) && (
                <p className="nr-notice" role="note">
                  Existem volumes diferentes no cálculo, nos documentos ou na placa. Os valores e a
                  justificativa da origem foram preservados; confira as medições e a revisão antes
                  de adotar uma alteração.
                </p>
              )}
          </>
        )}
        {area === "avaliacao" && (
          <>
            <h3>Avaliações por família</h3>
            <p className="nr-muted">
              Existência, aplicabilidade, condição, ação e validação histórica são independentes.
              Consulte o registro vinculado para revisar na Nexus.
            </p>
            <div
              className="nr-table-wrap"
              tabIndex={0}
              aria-label="Matriz de avaliações, role para consultar todas as colunas"
            >
              <table className="nr-technical-table">
                <caption>
                  Itens de avaliação do local · valores históricos e propostas identificadas
                </caption>
                <thead>
                  <tr>
                    <th>Família</th>
                    <th>Existência</th>
                    <th>Aplicabilidade</th>
                    <th>Condição</th>
                    <th>Ação</th>
                    <th>Validação histórica da origem</th>
                    <th>Evidência / solução</th>
                  </tr>
                </thead>
                <tbody>
                  {Object.entries(nrObject(d["itens"])).map(([family, value]) => {
                    const item = nrObject(value);
                    return (
                      <tr key={family}>
                        <th scope="row">
                          {family}
                          {nrLocalProposalAffects(d, ["itens", family]) && (
                            <small className="nr-badge">Proposta Nexus · aguarda revisão</small>
                          )}
                        </th>
                        {["existencia", "aplicabilidade", "condicao", "acao", "validacao"].map(
                          (key) => (
                            <td key={key}>
                              <NrValue value={item[key]} />
                            </td>
                          ),
                        )}
                        <td>
                          <details>
                            <summary>Justificativa e evidências</summary>
                            <NrFacts
                              value={item}
                              omit={[
                                "existencia",
                                "aplicabilidade",
                                "condicao",
                                "acao",
                                "validacao",
                              ]}
                            />
                          </details>
                        </td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>
            <NrRelatedRecords
              row={row}
              norma={norma}
              resource="sistemas"
              search={scope}
              title="Registros de avaliação na Nexus"
            />
          </>
        )}
        {area === "memorial" && (
          <>
            <p className="nr-source">
              Memorial histórico: entradas, hipóteses e resultados da origem. Os cálculos de revisão
              da Nexus são apresentados separadamente.
            </p>
            <TechnicalSection title="Entradas e critérios de ventilação" value={d["ventilacao"]} />
            <TechnicalSection title="Resultado preservado da origem" value={d["calculo"]} />
            <TechnicalSection title="Ventilação fixa" value={d["ventilacao_fixa"]} />
            <TechnicalSection
              title="Resultado de ventilação fixa da origem"
              value={d["calculo_fixo"]}
            />
            <Suspense fallback={<LoadingState />}>
              <NrCalculations
                norma={norma}
                registro={row}
                canEdit={contexto.permissoes.editar}
                onSaved={onSaved}
              />
            </Suspense>
          </>
        )}
        {area === "resgate" && (
          <>
            <TechnicalSection title="Plano e meios de resgate" value={d["resgate"]} />
            <TechnicalSection
              title="Emergência e isolamento de energias"
              value={Object.fromEntries(
                [
                  "emergencia",
                  "resgate_publico",
                  "tempo_resgate_publico",
                  "energias",
                  "pontos_bloqueio",
                  "plano_bloqueio",
                ].map((k) => [k, cadastro[k]]),
              )}
            />
            <TechnicalSection
              title="Ancoragens, linhas de vida e documentos"
              value={d["ancoragens"]}
            />
            <h3>Histórico operacional do equipamento</h3>
            <NrValue value={cadastro["historico_equipamento"]} />
            {row.pet_espaco_id && (
              <Link to="/execucao" className="nr-inline-action">
                Consultar operação e PET <ArrowRight size={16} />
              </Link>
            )}
            <Link to={String(`${base}/pendencias`)} search={scope} className="nr-inline-action">
              Pendências vinculadas <ArrowRight size={16} />
            </Link>
          </>
        )}
        {area === "historico" && (
          <>
            <NrTechnicalTimeline value={d["historico"]} compact />
            <details>
              <summary>Histórico operacional do equipamento</summary>
              <NrValue value={cadastro["historico_equipamento"]} />
            </details>
            <Link
              to={String(`${base}/historico`)}
              search={{ ...scope, local: "" }}
              className="nr-inline-action"
            >
              Auditoria de operações da Nexus <ArrowRight size={16} />
            </Link>
          </>
        )}
        {area === "fotos" && (
          <>
            <h3>Fotos de campo</h3>
            <NrPhotoGallery
              org={row.organization_id}
              value={d["fotos"]}
              context={`${row.tag ?? row.titulo} · ${unitName}`}
            />
            <h3 className="mt-6">Arquivos e imagens vinculados</h3>
            <LocalFiles row={row} norma={norma} contexto={contexto} />
          </>
        )}
        {area === "documentos" && (
          <>
            <Link
              to={String(`${norma === "NR33" ? "/nr-35" : "/nr-33"}/documentos`)}
              search={scope}
              className="nr-inline-action"
            >
              Consultar documentos vinculados na {norma === "NR33" ? "NR-35" : "NR-33"}
              <ArrowRight size={16} />
            </Link>
            <NrRelatedRecords
              row={row}
              norma={norma}
              resource="documentos"
              search={scope}
              title="Documentos vinculados ao local"
            />
            <Link
              to={String(`${base}/documentos`)}
              search={{ ...scope, local: "", vinculo: "unidade" }}
              className="nr-inline-action"
            >
              Documentação geral da unidade <ArrowRight size={16} />
            </Link>
            <LocalFiles row={row} norma={norma} contexto={contexto} />
          </>
        )}
      </section>
    </div>
  );
}
function LocalFiles({
  row,
  norma,
  contexto,
}: {
  row: NrRecord;
  norma: Norma;
  contexto: NrContexto;
}) {
  if (!row.cliente_id || !row.unidade_id)
    return <p>Selecione o contexto completo para consultar arquivos.</p>;
  return (
    <Suspense fallback={<LoadingState />}>
      <NrFilesPanel
        org={row.organization_id}
        norma={norma}
        clienteId={row.cliente_id}
        unidadeId={row.unidade_id}
        localId={row.id}
        documentoVersion={row.version}
        canConvert={contexto.permissoes.editar}
        canEdit={contexto.permissoes.editar}
        canMove={contexto.permissoes.mover}
        canArchive={contexto.permissoes.arquivar}
        canRestore={contexto.permissoes.restaurar}
        canUpload={contexto.permissoes.anexar && !row.arquivado_em}
      />
    </Suspense>
  );
}
function NrRelatedRecords({
  row,
  norma,
  resource,
  search,
  title,
}: {
  row: NrRecord;
  norma: Norma;
  resource: NrRecurso;
  search: NrSearch;
  title: string;
}) {
  const consult = useServerFn(nrConsultar);
  const query = useQuery({
    queryKey: ["nr", row.organization_id, norma, "relacionados", resource, row.unidade_id, row.id],
    queryFn: ({ signal }) =>
      consult({
        data: {
          organization_id: row.organization_id,
          norma,
          recurso: resource,
          unidade_id: row.unidade_id ?? undefined,
          local_id: row.id,
          copias_editaveis: resource === "documentos" ? false : undefined,
          limite: 25,
        },
        signal,
      }),
    retry: false,
  });
  const result =
    query.data && "rows" in query.data
      ? (query.data as { rows: NrRecord[]; total: number; pagina: number; limite: number })
      : undefined;
  const base = norma === "NR33" ? "/nr-33" : "/nr-35";
  return (
    <section className="nr-related">
      <h3>{title}</h3>
      {query.isPending ? (
        <LoadingState />
      ) : query.isError ? (
        <ErrorState error={query.error} onRetry={() => query.refetch()} />
      ) : (
        <>
          <p className="nr-muted">{result?.total ?? 0} registros neste recorte normativo.</p>
          <ul className="nr-record-list">
            {result?.rows.map((r) => (
              <li key={r.id}>
                <Link
                  className="nr-record-link"
                  to={String(`${base}/${resource}/${r.id}`)}
                  search={search}
                >
                  <span>
                    <strong>{r.titulo}</strong>
                    <small>
                      {nrLabel(r.estado)}
                      {r.revisao_numero ? ` · Revisão ${r.revisao_numero}` : ""}
                      {r.resumo_documental?.vigencia_apresentacao
                        ? ` · ${nrLabel(r.resumo_documental.vigencia_apresentacao)}`
                        : ""}
                    </small>
                    {r.resumo_documental?.correspondencia_pendente && (
                      <small>Cópia editável · correspondência documental pendente</small>
                    )}
                    {!!r.resumo_documental?.copias_editaveis.length && (
                      <small>
                        {r.resumo_documental.copias_editaveis.length} cópia(s) editável(is) na ficha
                      </small>
                    )}
                  </span>
                  <ArrowRight size={16} />
                </Link>
              </li>
            ))}
          </ul>
          {!result?.total && (
            <p className="nr-source">
              Nenhum registro vinculado neste recorte. A documentação geral da unidade permanece
              disponível separadamente.
            </p>
          )}
          <Link to={String(`${base}/${resource}`)} search={search} className="nr-inline-action">
            Abrir lista vinculada completa <ArrowRight size={16} />
          </Link>
        </>
      )}
    </section>
  );
}
