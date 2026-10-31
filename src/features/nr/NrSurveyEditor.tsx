import { useEffect, useId, useState } from "react";
import { ArrowLeft, ArrowRight } from "lucide-react";
import { ActionButton } from "@/components/nexus/Page";
import type { NrRecord } from "./domain";
import { NrSurveyField, NrSurveyValue, type NrSurveyEvidenceContext } from "./NrSurveyFields";
import {
  projectSurvey,
  surveyApplicability,
  surveyBlockProgress,
  surveyHasValue,
  surveyObject,
  type SurveyBlockDefinition,
} from "./survey-projection";
import "./survey.css";

export function NrSurveyEditor({
  blocks,
  answers,
  local = {},
  onChange,
  readOnly = false,
  evidence,
}: {
  blocks: SurveyBlockDefinition[];
  answers: Record<string, unknown>;
  local?: Record<string, unknown>;
  onChange?: (id: string, value: unknown) => void;
  readOnly?: boolean;
  evidence?: NrSurveyEvidenceContext | undefined;
}) {
  const id = useId();
  const applicable = blocks.filter(
    (block) => surveyApplicability(block.aplica_se, answers, local) !== false,
  );
  const [selected, setSelected] = useState(applicable[0]?.id ?? "");
  const active = applicable.some((block) => block.id === selected)
    ? selected
    : (applicable[0]?.id ?? "");
  const index = applicable.findIndex((block) => block.id === active);
  useEffect(() => {
    if (selected !== active) setSelected(active);
  }, [active, selected]);
  const hiddenCount = blocks.length - applicable.length;
  if (!blocks.some((block) => block.campos.length))
    return (
      <p className="nr-source">
        O roteiro histórico não expõe definições de campos. As respostas permanecem preservadas; a
        associação de uma apresentação compatível exige correspondência comprovada.
      </p>
    );
  const move = (next: string) => {
    setSelected(next);
    requestAnimationFrame(() => {
      const heading = document.getElementById(`${id}-title-${next}`);
      heading?.focus({ preventScroll: true });
      const editor = heading?.closest<HTMLElement>(".nr-editor-scroll");
      const survey = heading?.closest<HTMLElement>(".nr-survey");
      if (editor && survey)
        editor.scrollTo({
          top: Math.max(
            0,
            editor.scrollTop +
              survey.getBoundingClientRect().top -
              editor.getBoundingClientRect().top,
          ),
          behavior: "instant",
        });
    });
  };
  return (
    <div className="nr-survey">
      <div className="nr-survey-mobile">
        <label htmlFor={`${id}-select`}>Bloco do levantamento</label>
        <select
          id={`${id}-select`}
          value={active}
          onChange={(event) => {
            event.stopPropagation();
            move(event.target.value);
          }}
        >
          {applicable.map((block) => (
            <option value={block.id} key={block.id}>
              {block.codigo} · {block.titulo}
            </option>
          ))}
        </select>
      </div>
      <nav className="nr-survey-navigation" aria-label="Blocos do levantamento">
        {applicable.map((block) => {
          const progress = surveyBlockProgress(block, answers, local);
          return (
            <button
              key={block.id}
              type="button"
              aria-current={block.id === active ? "step" : undefined}
              aria-controls={`${id}-panel-${block.id}`}
              onClick={() => move(block.id)}
            >
              <strong>{block.codigo}</strong>
              <span>
                {block.titulo}
                <small>
                  {progress.applicability === null
                    ? "Aplicabilidade por confirmar"
                    : `${progress.answered}/${progress.total} respostas registradas`}
                </small>
              </span>
            </button>
          );
        })}
        {hiddenCount > 0 && (
          <p className="nr-muted">
            {hiddenCount} {hiddenCount === 1 ? "bloco fora" : "blocos fora"} da aplicabilidade
            informada para este local.
          </p>
        )}
      </nav>
      <div className="nr-survey-main">
        {applicable.map((block) => {
          const progress = surveyBlockProgress(block, answers, local);
          return (
            <section
              key={block.id}
              id={`${id}-panel-${block.id}`}
              hidden={block.id !== active}
              aria-labelledby={`${id}-title-${block.id}`}
            >
              <div className="nr-panel-header">
                <h3 id={`${id}-title-${block.id}`} tabIndex={-1}>
                  {block.codigo} · {block.titulo}
                </h3>
                <span className="nr-muted">
                  {progress.answered} de {progress.total} respostas registradas
                </span>
              </div>
              {block.instrucao && (
                <details className="nr-survey-instruction">
                  <summary>Orientação do roteiro de origem</summary>
                  <p>{block.instrucao}</p>
                </details>
              )}
              {progress.applicability === null && (
                <p className="nr-source">
                  A aplicabilidade deste bloco depende de informação ainda não confirmada. Suas
                  respostas foram preservadas.
                </p>
              )}
              {progress.requiredMissing.length > 0 && (
                <p className="nr-muted">
                  {progress.requiredMissing.length}{" "}
                  {progress.requiredMissing.length === 1
                    ? "resposta necessária ainda não registrada"
                    : "respostas necessárias ainda não registradas"}
                  . O salvamento parcial permanece disponível.
                </p>
              )}
              <div className="nr-field-grid">
                {block.campos
                  .filter(
                    (field) => surveyApplicability(field.mostrar_se, answers, local) !== false,
                  )
                  .map((field) => {
                    const unknown = surveyApplicability(field.mostrar_se, answers, local) === null;
                    return (
                      <div
                        key={field.id}
                        className={
                          ["texto_longo", "lista", "foto", "multipla", "checklist"].includes(
                            field.tipo,
                          )
                            ? "nr-wide"
                            : undefined
                        }
                      >
                        {unknown && <p className="nr-muted">Condição de exibição por confirmar.</p>}
                        {readOnly &&
                        !["lista", "foto", "checklist", "calculado"].includes(field.tipo) ? (
                          <div className="nr-survey-read-field">
                            <h4>{field.nome}</h4>
                            <NrSurveyValue
                              value={
                                field.tipo === "selecao" && typeof answers[field.id] === "string"
                                  ? (field.rotulos_opcoes?.[String(answers[field.id])] ??
                                    answers[field.id])
                                  : answers[field.id]
                              }
                            />
                          </div>
                        ) : (
                          <NrSurveyField
                            field={field}
                            value={answers[field.id]}
                            disabled={readOnly}
                            evidence={evidence}
                            onChange={(value) => onChange?.(field.id, value)}
                          />
                        )}
                      </div>
                    );
                  })}
              </div>
              {block.campos.some(
                (field) =>
                  surveyApplicability(field.mostrar_se, answers, local) === false &&
                  Object.hasOwn(answers, field.id),
              ) && (
                <details className="nr-survey-preserved">
                  <summary>Respostas preservadas fora da condição atual</summary>
                  <p className="nr-muted">
                    A condição de apresentação mudou ou diverge do dado histórico. Os valores abaixo
                    não foram apagados nem entram no progresso atual.
                  </p>
                  <NrSurveyValue
                    value={Object.fromEntries(
                      block.campos
                        .filter(
                          (field) =>
                            surveyApplicability(field.mostrar_se, answers, local) === false &&
                            Object.hasOwn(answers, field.id),
                        )
                        .map((field) => [field.nome, answers[field.id]]),
                    )}
                  />
                </details>
              )}
              <div className="nr-survey-step-actions">
                <ActionButton
                  variant="ghost"
                  disabled={index <= 0}
                  onClick={() => {
                    const previous = applicable[index - 1];
                    if (previous) move(previous.id);
                  }}
                >
                  <ArrowLeft size={16} />
                  Bloco anterior
                </ActionButton>
                <span className="nr-muted">
                  {index + 1} de {applicable.length} blocos
                </span>
                <ActionButton
                  variant="ghost"
                  disabled={index >= applicable.length - 1}
                  onClick={() => {
                    const next = applicable[index + 1];
                    if (next) move(next.id);
                  }}
                >
                  Próximo bloco
                  <ArrowRight size={16} />
                </ActionButton>
              </div>
            </section>
          );
        })}
        {blocks
          .filter(
            (block) =>
              surveyApplicability(block.aplica_se, answers, local) === false &&
              block.campos.some((field) => surveyHasValue(answers[field.id])),
          )
          .map((block) => (
            <details className="nr-survey-preserved" key={`outside-${block.id}`}>
              <summary>
                {block.codigo} · respostas preservadas fora da aplicabilidade informada
              </summary>
              <p className="nr-muted">
                {block.titulo}. O roteiro não exige este bloco para a família/classificação atual.
                As respostas históricas permanecem acessíveis.
              </p>
              <NrSurveyValue
                value={Object.fromEntries(
                  block.campos
                    .filter((field) => Object.hasOwn(answers, field.id))
                    .map((field) => [field.nome, answers[field.id]]),
                )}
              />
            </details>
          ))}
      </div>
    </div>
  );
}

export function NrSurveyReader({ row }: { row: NrRecord }) {
  const projection = projectSurvey({
    snapshot: row.modelo_snapshot,
    presentation: Reflect.get(row, "modelo_apresentacao"),
    historicalData: row.dados,
    answers: row.respostas,
  });
  const historicState = row.dados["estado_historico"] ?? row.dados["situacao"];
  return (
    <div>
      <p className="nr-source">
        {projection.usesAdapter
          ? "Respostas de origem organizadas pelo roteiro de apresentação compatível. O vínculo e o snapshot histórico permanecem preservados."
          : "Leitura da versão do roteiro fixada no levantamento."}
      </p>
      <div className="nr-survey-states">
        <span>
          Estado histórico:{" "}
          <strong>
            {typeof historicState === "string"
              ? historicState.replaceAll("_", " ")
              : "Não informado"}
          </strong>
        </span>
        <span>
          Revisão Nexus: <strong>{row.estado.replaceAll("_", " ")}</strong>
        </span>
      </div>
      <NrSurveyEditor
        blocks={projection.blocks}
        answers={surveyObject(row.respostas)}
        local={surveyObject(Reflect.get(row, "local_contexto"))}
        readOnly
        evidence={{ org: row.organization_id, context: row.titulo }}
      />
      {projection.unmapped.length > 0 && (
        <details className="nr-survey-preserved">
          <summary>Outras respostas preservadas ({projection.unmapped.length})</summary>
          <NrSurveyValue
            value={Object.fromEntries(
              projection.unmapped.map((key) => [key, surveyObject(row.respostas)[key]]),
            )}
          />
        </details>
      )}
    </div>
  );
}
