import { useEffect, useId, useRef, useState } from "react";
import { Link, useBlocker } from "@tanstack/react-router";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { useServerFn } from "@tanstack/react-start";
import { ArrowLeft, ArrowRight, Check, ClipboardCheck, FileDown } from "lucide-react";
import { ActionButton, ErrorState, LoadingState } from "@/components/nexus/Page";
import { useCommandKey } from "@/features/operacao/components";
import { csvCell, downloadCsv } from "@/features/pet/csv";
import type { NrContexto, NrJson, NrRecord } from "./domain";
import { nrConsultar } from "./nr.functions";
import {
  nrColetaConcluir,
  nrColetaDocumento,
  nrColetaRevisar,
  nrColetaRevisoes,
  nrColetaSalvar,
} from "./coleta.functions";
import { nrColetaPdfGerar } from "./documents.functions";
import { NrDocumentModelSelector, type NrDocumentModelSelection } from "./NrDocumentModelSelector";
import { NrSurveyField, NrSurveyValue } from "./NrSurveyFields";
import { NrFilesPanel, type NrSelectableFile } from "./NrFilesPanel";
import {
  projectSurvey,
  surveyApplicability,
  surveyBlockProgress,
  surveyObject,
  type SurveyFieldDefinition,
} from "./survey-projection";
import type { FieldScope } from "./NrFieldStart";
import "./field-collection.css";

const json = (value: Record<string, unknown>) => value as Record<string, NrJson>;
const label = (value: unknown) => (typeof value === "string" ? value : "");

export function NrFieldSurvey({
  scope,
  user,
  record,
  context,
  onExit,
  onAdmin,
  onNewRevision,
  onReinspection,
  frozenNumber,
}: {
  scope: FieldScope;
  user: string;
  record: NrRecord;
  context: NrContexto;
  onExit: () => void;
  onAdmin: () => void;
  onNewRevision: () => void;
  onReinspection: () => void;
  frozenNumber?: number | undefined;
}) {
  const [row, setRow] = useState(record);
  const projection = projectSurvey({
    snapshot: row.modelo_snapshot,
    presentation: row.modelo_apresentacao,
    historicalData: row.dados,
    answers: row.respostas,
  });
  const [answers, setAnswers] = useState(() => surveyObject(row.respostas));
  const [metadata, setMetadata] = useState(() => surveyObject(row.dados?.["medidas_coleta"]));
  const [verified, setVerified] = useState(row.dados?.["identificacao_verificada"] === true);
  const [changed, setChanged] = useState(new Set<string>());
  const [dirty, setDirty] = useState(false);
  const dirtyRef = useRef(false);
  dirtyRef.current = dirty;
  const local = surveyObject(row.local_contexto);
  const allBlocks = projection.blocks;
  const blocks =
    scope.norma === "NR35" && row.normas.includes("NR33")
      ? allBlocks.filter((b) => ["B01", "B04", "B14", "B15", "B16"].includes(b.codigo))
      : allBlocks;
  const progress = blocks.map((block) => ({
    block,
    ...surveyBlockProgress(block, answers, local),
  }));
  const applicable = progress.filter((p) => p.applicability !== false);
  const [stage, setStage] = useState(
    () =>
      label(row.dados?.[`coleta_bloco_${scope.norma}`]) ||
      (applicable.find((p) => p.requiredMissing.length || p.answered < p.total) ?? applicable[0])
        ?.block.id ||
      "",
  );
  const [review, setReview] = useState(row.estado === "em_revisao" && !frozenNumber);
  const active =
    applicable.find((p) => p.block.id === stage) ??
    applicable.find((p) => p.requiredMissing.length || p.answered < p.total) ??
    applicable[0];
  const index = applicable.indexOf(active!);
  const edit =
    !frozenNumber && context.permissoes.editar && row.estado === "rascunho" && !row.arquivado_em;
  const execute = useServerFn(nrColetaSalvar);
  const consult = useServerFn(nrConsultar);
  const finish = useServerFn(nrColetaConcluir);
  const revise = useServerFn(nrColetaRevisar);
  const derive = useServerFn(nrColetaDocumento);
  const revisions = useServerFn(nrColetaRevisoes);
  const render = useServerFn(nrColetaPdfGerar);
  const keyFor = useCommandKey();
  const cache = useQueryClient();
  const lock = useRef(false);
  const heading = useRef<HTMLHeadingElement>(null);
  const touched = useRef(false);
  const sectionId = useId();
  const [busy, setBusy] = useState(false);
  const [status, setStatus] = useState("");
  const [error, setError] = useState<Error | null>(null);
  const [reason, setReason] = useState("");
  const [deriving, setDeriving] = useState("");
  const [selection, setSelection] = useState<NrDocumentModelSelection | null>(null);
  const [derived, setDerived] = useState("");
  const [confirmed, setConfirmed] = useState<{ campo: string; codigo: string }[]>([]);
  const [report, setReport] = useState<{
    id: string;
    state: "pending" | "ready" | "failed";
    url?: string;
    filename?: string;
    message?: string;
  } | null>(null);
  const reportUrl = useRef("");
  const [attach, setAttach] = useState<{
    field: SurveyFieldDefinition;
    value: unknown;
    apply: (value: unknown) => void;
  } | null>(null);
  const request = { ...scope, id: row.id };
  const revisionsQuery = useQuery({
    queryKey: ["nr", scope.org, user, "coleta-revisoes", scope, row.id],
    enabled: !!row.local_id,
    queryFn: ({ signal }) => revisions({ data: request, signal }),
    retry: false,
  });
  useBlocker({
    shouldBlockFn: () =>
      dirtyRef.current && !window.confirm("Sair da coleta com alterações sem salvar?"),
    enableBeforeUnload: () => dirtyRef.current,
  });
  useEffect(
    () => () => {
      if (reportUrl.current) URL.revokeObjectURL(reportUrl.current);
    },
    [],
  );
  useEffect(() => {
    if (touched.current) heading.current?.focus();
  }, [active?.block.id, review]);

  async function run(action: () => Promise<void>) {
    if (lock.current) return;
    lock.current = true;
    setBusy(true);
    setError(null);
    setStatus("");
    try {
      await action();
    } catch (e) {
      setError(
        e instanceof Error
          ? e
          : new Error("Operação não confirmada. Seu preenchimento foi preservado."),
      );
    } finally {
      lock.current = false;
      setBusy(false);
    }
  }
  function change(id: string, value: unknown) {
    setAnswers((current) => ({ ...current, [id]: value }));
    setChanged((current) => new Set([...current, id]));
    setMetadata((current) =>
      Object.hasOwn(current, id)
        ? Object.fromEntries(Object.entries(current).filter(([key]) => key !== id))
        : current,
    );
    setDirty(true);
    setStatus("");
  }
  async function save(next: string) {
    if (!edit) return row;
    const input = {
      ...request,
      version: row.version,
      bloco: next,
      identificacao_verificada: verified,
      medidas: json(metadata),
      respostas: json(Object.fromEntries([...changed].map((id) => [id, answers[id]]))),
    };
    const response = await execute({ data: { ...input, chave: keyFor(input) } });
    setRow(response.registro as NrRecord);
    setChanged(new Set());
    setDirty(false);
    dirtyRef.current = false;
    setStatus("Salvo no servidor");
    void cache.invalidateQueries({ queryKey: ["nr", scope.org] });
    return response.registro;
  }
  async function refresh() {
    const response = await consult({
      data: {
        organization_id: scope.org,
        norma: scope.norma,
        recurso: "levantamentos",
        operacao: "detalhe",
        id: row.id,
        cliente_id: scope.cliente,
        unidade_id: scope.unidade,
      },
    });
    if ("registro" in response) setRow(response.registro as NrRecord);
    await revisionsQuery.refetch();
    void cache.invalidateQueries({ queryKey: ["nr", scope.org] });
    return "registro" in response ? (response.registro as NrRecord) : undefined;
  }
  function move(next: string) {
    touched.current = true;
    setReview(false);
    setAttach(null);
    setStage(next);
  }
  async function pdf(id: string) {
    setReport({ id, state: "pending" });
    try {
      const doc = await consult({
        data: {
          organization_id: scope.org,
          norma: scope.norma,
          recurso: "documentos",
          operacao: "detalhe",
          id,
          cliente_id: scope.cliente,
          unidade_id: scope.unidade,
        },
      });
      if (!("registro" in doc)) throw Error("Relatório indisponível.");
      const response = await render({
        data: {
          organization_id: scope.org,
          norma: scope.norma,
          documento_id: id,
          expected_version: doc.registro.version,
        },
      });
      const bytes = Uint8Array.from(atob(response.base64), (character) => character.charCodeAt(0));
      if (reportUrl.current) URL.revokeObjectURL(reportUrl.current);
      reportUrl.current = URL.createObjectURL(new Blob([bytes], { type: response.mime }));
      setReport({ id, state: "ready", url: reportUrl.current, filename: response.nome });
    } catch (e) {
      setReport({
        id,
        state: "failed",
        message: e instanceof Error ? e.message : "Não foi possível gerar o PDF.",
      });
    } finally {
      void revisionsQuery.refetch();
    }
  }
  function useEvidence(file: NrSelectableFile) {
    if (!attach || !file.mime.startsWith("image/")) return;
    const photos = Array.isArray(attach.value) ? attach.value : attach.value ? [attach.value] : [];
    attach.apply([...photos, { arquivo_id: file.id, legenda: file.nome, origem: "acervo_nexus" }]);
    setAttach(null);
  }

  const unit = context.unidades.find((item) => item.id === scope.unidade);
  const client = context.clientes.find((item) => item.id === scope.cliente);
  const complete = applicable.filter((p) => p.total > 0 && p.answered === p.total).length;
  const missing = allBlocks.flatMap((block) =>
    surveyBlockProgress(block, answers, local).requiredMissing.map((field) => ({ block, field })),
  );
  const latest = revisionsQuery.data?.revisoes[0];
  const base = scope.norma === "NR33" ? "/nr-33" : "/nr-35";
  const links = { cliente: scope.cliente, unidade: scope.unidade, local: row.local_id ?? "" };
  const canConclude =
    edit &&
    !projection.usesAdapter &&
    !!row.modelo_snapshot &&
    !missing.length &&
    applicable.length > 0;

  return (
    <div className="nx-nr-workspace nr-field-workspace">
      <header className="nr-field-header">
        <div className="nr-field-context">
          <ActionButton variant="ghost" onClick={onExit}>
            <ArrowLeft size={17} /> Levantamentos
          </ActionButton>
          <span>
            {client?.nome} · {unit?.nome} · {scope.norma === "NR33" ? "NR-33" : "NR-35"}
          </span>
          {row.normas.length === 2 && !frozenNumber && (
            <Link
              to={String(`${scope.norma === "NR33" ? "/nr-35" : "/nr-33"}/levantamentos/${row.id}`)}
              search={{ ...links, local: "", coleta: "campo" }}
            >
              {scope.norma === "NR33" ? "Ver NR-35" : "Ver NR-33"}
            </Link>
          )}
        </div>
        <div className="nr-field-identity">
          <div>
            <p className="nr-eyebrow">
              {row.local_tag ?? "Levantamento"}
              {frozenNumber ? ` · Revisão ${frozenNumber} fixada` : ""}
            </p>
            <h1>{row.local_titulo ?? row.titulo}</h1>
            <p className="nr-muted">
              {label(local["familia"])}
              {row.dados?.["tecnico_nome"] ? ` · ${label(row.dados?.["tecnico_nome"])}` : ""}
            </p>
          </div>
          <div className="nr-field-count">
            <b>
              {complete} de {applicable.length}
            </b>
            <span>blocos preenchidos</span>
          </div>
        </div>
        {applicable.length > 0 && (
          <progress aria-label="Blocos preenchidos" value={complete} max={applicable.length} />
        )}
        <nav className="nr-field-steps" aria-label="Etapas do levantamento">
          {progress.map((p) => (
            <button
              key={p.block.id}
              type="button"
              disabled={busy || p.applicability === false}
              data-state={
                p.applicability === false
                  ? "fora"
                  : p.total > 0 && p.answered === p.total
                    ? "preenchida"
                    : "pendente"
              }
              aria-current={!review && p === active ? "step" : undefined}
              title={p.block.titulo}
              aria-label={`${p.block.codigo} ${p.block.titulo} · ${p.applicability === false ? "fora do escopo" : p.total > 0 && p.answered === p.total ? "preenchida" : "pendente"}`}
              onClick={() => move(p.block.id)}
            >
              {p.block.codigo.replace(/^[AB]/, "")}
            </button>
          ))}
          <button
            type="button"
            aria-current={review ? "step" : undefined}
            disabled={busy}
            onClick={() => {
              touched.current = true;
              setReview(true);
            }}
          >
            Revisão
          </button>
        </nav>
      </header>
      <div className="nr-field-body">
        {error && (
          <>
            <ErrorState error={error} />
            {error.message.includes("Outra pessoa") && (
              <ActionButton
                variant="ghost"
                disabled={busy}
                onClick={() => {
                  if (
                    !window.confirm("Carregar a versão salva e descartar as alterações desta tela?")
                  )
                    return;
                  void run(async () => {
                    const saved = await refresh();
                    if (!saved) return;
                    setAnswers(surveyObject(saved.respostas));
                    setMetadata(surveyObject(saved.dados["medidas_coleta"]));
                    setVerified(saved.dados["identificacao_verificada"] === true);
                    setDirty(false);
                    dirtyRef.current = false;
                    setChanged(new Set());
                  });
                }}
              >
                Carregar a versão salva
              </ActionButton>
            )}
          </>
        )}
        {latest?.estado === "devolvida" && (
          <p className="nr-notice">Coleta devolvida · {latest.motivo}</p>
        )}
        {!review && active && (
          <section aria-labelledby={sectionId}>
            <div className="nr-field-block-header">
              <p className="nr-eyebrow">{active.block.codigo}</p>
              <h2 id={sectionId} ref={heading} tabIndex={-1}>
                {active.block.titulo}
              </h2>
              {active.block.instrucao && <p className="nr-muted">{active.block.instrucao}</p>}
              {active.applicability === null && (
                <p className="nr-source">Aplicabilidade por confirmar.</p>
              )}
              {!!active.requiredMissing.length && (
                <p className="nr-muted">
                  {active.requiredMissing.length} campos necessários para a revisão.
                </p>
              )}
              {row.local_id && ["B07", "B08", "B09"].includes(active.block.codigo) && (
                <Link
                  to={String(`${base}/locais/${row.local_id}`)}
                  search={{ ...links, ficha: "memorial" }}
                >
                  Abrir cálculos e critérios do local
                </Link>
              )}
            </div>
            {active.block.codigo === "B01" && (
              <label className="nr-field-check">
                <input
                  type="checkbox"
                  checked={verified}
                  disabled={!edit || busy}
                  onChange={(e) => {
                    setVerified(e.target.checked);
                    setDirty(true);
                  }}
                />{" "}
                Conferi a identificação no local
              </label>
            )}
            <fieldset className="nr-field-form" disabled={busy || !!attach}>
              {active.block.campos
                .filter((f) => surveyApplicability(f.mostrar_se, answers, local) !== false)
                .map((field) => {
                  const measure = surveyObject(metadata[field.id]);
                  const updateMeasure = (key: string, value: string) => {
                    setMetadata((old) => ({
                      ...old,
                      [field.id]: { ...surveyObject(old[field.id]), [key]: value },
                    }));
                    setDirty(true);
                  };
                  return (
                    <div key={field.id} id={`nr-campo-${encodeURIComponent(field.id)}`}>
                      <NrSurveyField
                        field={field}
                        value={answers[field.id]}
                        disabled={!edit || busy}
                        onChange={(value) => change(field.id, value)}
                        evidence={{
                          org: scope.org,
                          localId: row.local_id,
                          context: row.titulo,
                          fieldMode: true,
                          ...(edit
                            ? {
                                onAttach: (item, value, apply) =>
                                  setAttach({ field: item, value, apply }),
                              }
                            : {}),
                        }}
                      />
                      {field.tipo === "numero" &&
                        field.unidade &&
                        (edit || Object.keys(measure).length > 0) && (
                          <details className="nr-field-source">
                            <summary>
                              Fonte da medida
                              {measure["natureza"] ? ` · ${label(measure["natureza"])}` : ""}
                            </summary>
                            <label>
                              Verificação
                              <select
                                disabled={!edit}
                                value={label(measure["natureza"])}
                                onChange={(e) => updateMeasure("natureza", e.target.value)}
                              >
                                <option value="">Não verificada</option>
                                <option>Medida em campo</option>
                                <option>Valor documental</option>
                                <option>Estimativa</option>
                              </select>
                            </label>
                            <label>
                              Fonte, revisão ou instrumento
                              <input
                                value={label(measure["referencia"])}
                                maxLength={500}
                                onChange={(e) => updateMeasure("referencia", e.target.value)}
                              />
                            </label>
                          </details>
                        )}
                    </div>
                  );
                })}
            </fieldset>
          </section>
        )}
        {!review && !active && (
          <p role="status">
            Este levantamento não tem campos estruturados compatíveis. Consulte as respostas no
            editor de origem.
          </p>
        )}
        {attach && (
          <section className="nr-panel" aria-label="Anexar evidência">
            <div className="nr-panel-header">
              <h3>{attach.field.nome}</h3>
              <ActionButton variant="ghost" onClick={() => setAttach(null)}>
                Cancelar seleção
              </ActionButton>
            </div>
            <NrFilesPanel
              org={scope.org}
              norma={scope.norma}
              clienteId={scope.cliente}
              unidadeId={scope.unidade}
              localId={row.local_id ?? undefined}
              canUpload={context.permissoes.anexar && !!row.local_id}
              onFileConfirmed={useEvidence}
              onFileSelected={useEvidence}
            />
          </section>
        )}
        {review && (
          <section className="nr-field-review">
            <h2 ref={heading} tabIndex={-1}>
              Revisar e concluir
            </h2>
            <p>
              {complete} de {applicable.length} blocos preenchidos ·{" "}
              {verified ? "Identificação conferida" : "Identificação por confirmar"}
            </p>
            {projection.usesAdapter && (
              <p className="nr-source">
                O roteiro histórico está em modo de apresentação. Para concluir, abra uma nova
                revisão com correspondência comprovada dos campos.
              </p>
            )}
            {!!missing.length && (
              <div>
                <h3>Campos necessários</h3>
                <ul>
                  {missing.map(({ block, field }) => (
                    <li key={field.id}>
                      {blocks.includes(block) ? (
                        <button
                          type="button"
                          onClick={() => {
                            move(block.id);
                            requestAnimationFrame(() =>
                              document
                                .getElementById(`nr-campo-${encodeURIComponent(field.id)}`)
                                ?.querySelector<HTMLElement>("input, select, textarea, button")
                                ?.focus(),
                            );
                          }}
                        >
                          {block.codigo} · {field.nome}
                        </button>
                      ) : (
                        <span>
                          {block.codigo} · {field.nome} · consulte no outro escopo
                        </span>
                      )}
                    </li>
                  ))}
                </ul>
              </div>
            )}
            {allBlocks
              .filter((b) => ["B14", "B15", "B16", "A04"].includes(b.codigo))
              .map((b) => (
                <details key={b.id}>
                  <summary>
                    {b.codigo} · {b.titulo}
                  </summary>
                  {b.campos
                    .filter((f) => answers[f.id] != null)
                    .map((f) => (
                      <div key={f.id}>
                        <h4>{f.nome}</h4>
                        <NrSurveyValue value={answers[f.id]} />
                      </div>
                    ))}
                </details>
              ))}
            {revisionsQuery.isError && (
              <ErrorState error={revisionsQuery.error} onRetry={() => revisionsQuery.refetch()} />
            )}
            {!!revisionsQuery.data?.revisoes.length && (
              <div>
                <h3>Revisões da coleta</h3>
                {!frozenNumber && latest?.estado === "aprovada" && context.permissoes.cadastrar && (
                  <ActionButton variant="ghost" onClick={onReinspection}>
                    Iniciar reinspeção deste ativo
                  </ActionButton>
                )}
                {revisionsQuery.data.revisoes.map((r) => (
                  <div className="nr-field-report" key={r.id}>
                    <div>
                      <b>Revisão {r.numero}</b>
                      <p>
                        {r.estado === "aprovada"
                          ? "Aprovada"
                          : r.estado === "devolvida"
                            ? "Devolvida"
                            : "Em revisão técnica"}
                        {r.motivo ? ` · ${r.motivo}` : ""}
                      </p>
                    </div>
                    <Link
                      to={String(`${base}/levantamentos/${row.id}`)}
                      search={{ ...links, local: "", coleta: "campo", coletaRevisao: r.id }}
                    >
                      Conferir dados fixados
                    </Link>
                    <Link to={String(`${base}/documentos/${r.documento_id}`)} search={links}>
                      Abrir no acervo
                    </Link>
                    {r.documento_tecnico_id && (
                      <Link
                        to={String(`${base}/documentos/${r.documento_tecnico_id}`)}
                        search={links}
                      >
                        Relatório técnico aprovado
                      </Link>
                    )}
                    {r.estado === "aprovada" && context.permissoes.cadastrar && (
                      <ActionButton
                        variant="ghost"
                        onClick={() => {
                          setDeriving(deriving === r.id ? "" : r.id);
                          setSelection(null);
                          setDerived("");
                        }}
                      >
                        Preparar documento do catálogo
                      </ActionButton>
                    )}
                    {deriving === r.id && (
                      <div className="nr-field-derived">
                        <p>
                          Escolha um modelo publicado do escopo contratado. O rascunho referencia a
                          revisão aprovada desta coleta.
                        </p>
                        <NrDocumentModelSelector
                          org={scope.org}
                          norma={scope.norma}
                          clienteId={scope.cliente}
                          unidadeId={scope.unidade}
                          onSelection={setSelection}
                        />
                        <ActionButton
                          disabled={busy || !selection}
                          onClick={() =>
                            void run(async () => {
                              if (!selection) return;
                              const result = await derive({
                                data: {
                                  ...request,
                                  revisao: r.id,
                                  modelo: selection.modelo_id,
                                  modeloVersion: selection.modelo_expected_version,
                                  modeloVersao: selection.modelo_versao_id ?? null,
                                },
                              });
                              setDerived(result.id);
                              setStatus("Rascunho vinculado à revisão aprovada");
                              void cache.invalidateQueries({ queryKey: ["nr", scope.org] });
                            })
                          }
                        >
                          Gerar rascunho
                        </ActionButton>
                        {derived && (
                          <Link
                            to={String(`${base}/documentos/${derived}`)}
                            search={{ ...links, local: "" }}
                          >
                            Abrir documento preparado
                          </Link>
                        )}
                      </div>
                    )}
                    {r.itens_confirmados.length > 0 && (
                      <ActionButton
                        variant="ghost"
                        onClick={() => {
                          const rows = [
                            [
                              "Revisão",
                              "Local",
                              "Código",
                              "Campo",
                              "Ação",
                              "Quantidade",
                              "Unidade",
                              "Evidências",
                            ],
                            ...r.itens_confirmados.map((item) => [
                              r.numero,
                              row.local_tag ?? row.id,
                              item.codigo,
                              item.campo,
                              item.acao,
                              typeof item.quantidade === "number" ? item.quantidade : "",
                              item.unidade,
                              JSON.stringify(item.evidencias),
                            ]),
                          ];
                          downloadCsv(
                            "\uFEFF" + rows.map((line) => line.map(csvCell).join(";")).join("\r\n"),
                            `adequacoes-coleta-${r.numero}.csv`,
                          );
                        }}
                      >
                        Baixar base para orçamento
                      </ActionButton>
                    )}
                    <ActionButton
                      variant="ghost"
                      disabled={busy || report?.state === "pending"}
                      onClick={() => void pdf(r.documento_id)}
                    >
                      <FileDown size={17} />{" "}
                      {r.pdf_estado === "vinculado"
                        ? "Abrir PDF"
                        : r.pdf_estado === "falhou"
                          ? "Gerar PDF novamente"
                          : "Gerar PDF"}
                    </ActionButton>
                    {report?.id === r.documento_id && (
                      <div role={report.state === "failed" ? "alert" : "status"}>
                        {report.state === "pending" ? (
                          "Gerando PDF…"
                        ) : report.state === "failed" ? (
                          report.message
                        ) : (
                          <a href={report.url} download={report.filename}>
                            Baixar PDF pronto
                          </a>
                        )}
                      </div>
                    )}
                  </div>
                ))}
              </div>
            )}
            {!frozenNumber &&
              latest?.estado === "em_revisao" &&
              revisionsQuery.data?.pode_revisar && (
                <div className="nr-field-form">
                  {latest.adequacoes.some((item) => item.estado === "candidato") && (
                    <fieldset className="nr-field-form">
                      <legend>Adequações confirmadas para orçamento</legend>
                      {latest.adequacoes
                        .filter((item) => item.estado === "candidato")
                        .map((item) => {
                          const match = (entry: { campo: string; codigo: string }) =>
                            entry.campo === item.campo && entry.codigo === item.codigo;
                          return (
                            <label className="nr-field-check" key={`${item.campo}:${item.codigo}`}>
                              <input
                                readOnly={!edit}
                                type="checkbox"
                                checked={confirmed.some(match)}
                                disabled={busy}
                                onChange={(e) => {
                                  const checked = e.target.checked;
                                  setConfirmed((current) =>
                                    checked
                                      ? [...current, { campo: item.campo, codigo: item.codigo }]
                                      : current.filter((entry) => !match(entry)),
                                  );
                                }}
                              />{" "}
                              {item.codigo} · {item.acao} · {String(item.quantidade)} {item.unidade}
                            </label>
                          );
                        })}
                    </fieldset>
                  )}
                  <label>
                    Motivo da devolução ou nota da aprovação
                    <textarea
                      value={reason}
                      maxLength={4000}
                      onChange={(e) => setReason(e.target.value)}
                    />
                  </label>
                  <div className="nr-field-actions">
                    {(["devolver", "aprovar"] as const).map((decisao) => (
                      <ActionButton
                        key={decisao}
                        variant={decisao === "devolver" ? "ghost" : "primary"}
                        disabled={busy || (decisao === "devolver" && reason.trim().length < 3)}
                        onClick={() =>
                          void run(async () => {
                            const payload = {
                              ...request,
                              revisao: latest.id,
                              version: row.version,
                              decisao,
                              motivo: reason,
                              itens: decisao === "aprovar" ? confirmed : [],
                            };
                            await revise({ data: { ...payload, chave: keyFor(payload) } });
                            await refresh();
                            setReason("");
                            setStatus(
                              decisao === "aprovar"
                                ? "Revisão aprovada no acervo"
                                : "Coleta devolvida para ajustes",
                            );
                          })
                        }
                      >
                        {decisao === "aprovar"
                          ? "Aprovar relatório técnico"
                          : "Devolver para ajustes"}
                      </ActionButton>
                    ))}
                  </div>
                </div>
              )}
          </section>
        )}
        <details className="nr-field-admin">
          <summary>Roteiro, origem e administração</summary>
          <p>
            Versão{" "}
            {label(
              String(
                surveyObject(row.modelo_apresentacao ?? row.modelo_snapshot)["numero"] ??
                  "histórica",
              ),
            )}
          </p>
          {projection.unmapped.length > 0 && (
            <details>
              <summary>
                Respostas preservadas sem correspondência ({projection.unmapped.length})
              </summary>
              <NrSurveyValue
                value={Object.fromEntries(projection.unmapped.map((id) => [id, answers[id]]))}
              />
            </details>
          )}
          <div className="nr-field-actions">
            <ActionButton variant="ghost" onClick={onAdmin}>
              Abrir ficha administrativa
            </ActionButton>
            {context.permissoes.cadastrar && row.local_id && (
              <ActionButton variant="ghost" onClick={onNewRevision}>
                Nova revisão
              </ActionButton>
            )}
            {row.local_id && (
              <Link to={String(`${base}/locais/${row.local_id}`)} search={links}>
                Ficha do local
              </Link>
            )}
          </div>
        </details>
      </div>
      <footer className="nr-field-footer">
        <span role="status">
          {busy ? "Confirmando no servidor…" : status || (dirty ? "Alterações não salvas" : "")}
        </span>
        <div className="nr-field-actions">
          {index > 0 && !review && (
            <ActionButton
              variant="ghost"
              disabled={busy}
              onClick={() => move(applicable[index - 1]!.block.id)}
            >
              Voltar
            </ActionButton>
          )}
          {review && active && (
            <ActionButton variant="ghost" disabled={busy} onClick={() => move(active.block.id)}>
              Voltar à coleta
            </ActionButton>
          )}
          {edit && active && (
            <ActionButton
              variant="ghost"
              disabled={busy}
              onClick={() =>
                void run(async () => {
                  await save(active.block.id);
                  onExit();
                })
              }
            >
              Salvar e sair
            </ActionButton>
          )}
          {!review && active && (
            <ActionButton
              disabled={busy}
              onClick={() =>
                void run(async () => {
                  const next = applicable[index + 1];
                  if (edit) await save(next?.block.id ?? active.block.id);
                  if (next) move(next.block.id);
                  else {
                    touched.current = true;
                    setReview(true);
                  }
                })
              }
            >
              {index === applicable.length - 1
                ? "Revisar e concluir"
                : edit
                  ? "Salvar e seguir"
                  : "Próximo bloco"}{" "}
              <ArrowRight size={16} />
            </ActionButton>
          )}
          {review && edit && (
            <ActionButton
              disabled={busy || !canConclude}
              onClick={() =>
                void run(async () => {
                  const saved = dirty ? await save(active?.block.id ?? "") : row;
                  const payload = { ...request, version: saved.version };
                  const result = await finish({ data: { ...payload, chave: keyFor(payload) } });
                  setStatus("Coleta concluída e fixada");
                  await refresh();
                  if (result.documento_id) void pdf(result.documento_id);
                })
              }
            >
              <ClipboardCheck size={17} /> Confirmar conclusão
            </ActionButton>
          )}
          {status && !busy && <Check size={16} aria-hidden />}
        </div>
      </footer>
    </div>
  );
}
