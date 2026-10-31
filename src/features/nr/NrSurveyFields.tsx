import { useId, useRef } from "react";
import { Plus, Trash2 } from "lucide-react";
import { ActionButton } from "@/components/nexus/Page";
import {
  surveyApplicability,
  surveyHasValue,
  surveyObject,
  type SurveyFieldDefinition,
} from "./survey-projection";
import { NrPhotoGallery } from "./NrPhotoGallery";
import { NrPhotoMetadataEditor } from "./NrPhotoMetadataEditor";
import { nrLabel } from "./technical-display";

export type NrSurveyEvidenceContext = {
  org: string;
  context: string;
  localId?: string | null | undefined;
  onAttach?: (
    field: SurveyFieldDefinition,
    value: unknown,
    onChange: (value: unknown) => void,
  ) => void;
};

const scalar = (value: unknown) =>
  typeof value === "string" || typeof value === "number" || typeof value === "boolean"
    ? String(value)
    : "";
const labels: Record<string, string> = {
  arquivo: "Referência do arquivo na origem",
  arquivo_id: "Arquivo vinculado",
  miniatura: "Miniatura na origem",
  legenda: "Legenda",
  data: "Data registrada",
  autor: "Autor histórico",
  origem: "Origem",
  existencia: "Existência",
  aplicabilidade: "Aplicabilidade",
  condicao: "Condição",
  acao: "Ação",
  validacao: "Validação histórica",
  justificativa: "Justificativa",
  evidencias: "Evidências",
  modelo: "Modelo",
  atualizado_em: "Atualizado em",
  atualizado_por: "Autor histórico",
  nao_verificada: "Não verificada",
  nao_verificado: "Não verificado",
  presente: "Presente",
  ausente: "Ausente",
  pendente: "Pendente",
  aplicavel: "Aplicável",
  nao_aplicavel: "Não aplicável",
  nao_avaliada: "Não avaliada",
  conforme: "Conforme",
  nao_conforme: "Não conforme",
  sem_decisao: "Sem decisão",
  verificar: "Verificar",
  manter: "Manter",
  adequar: "Adequar",
  instalar: "Instalar",
  substituir: "Substituir",
  proposta: "Proposta",
  validada: "Validada",
};
const surveyLabel = (value: string) => labels[value] ?? nrLabel(value);

/** Unknown properties stay visible and are never removed by editing a known field. */
export function NrSurveyValue({ value }: { value: unknown }) {
  if (value == null || value === "") return <span className="nr-muted">Não informado</span>;
  if (Array.isArray(value))
    return value.length ? (
      <ul className="nr-survey-values">
        {value.map((entry, index) => (
          <li key={index}>
            <NrSurveyValue value={entry} />
          </li>
        ))}
      </ul>
    ) : (
      <span className="nr-muted">Nenhum registro</span>
    );
  if (typeof value === "object")
    return (
      <dl className="nr-survey-values">
        {Object.entries(surveyObject(value)).map(([key, entry]) => (
          <div key={key}>
            <dt>{surveyLabel(key)}</dt>
            <dd>
              <NrSurveyValue value={entry} />
            </dd>
          </div>
        ))}
      </dl>
    );
  return (
    <span style={{ whiteSpace: "pre-wrap", overflowWrap: "anywhere" }}>
      {typeof value === "boolean" ? (value ? "Sim" : "Não") : String(value)}
    </span>
  );
}

export function NrSurveyField({
  field,
  value,
  onChange,
  disabled = false,
  evidence,
}: {
  field: SurveyFieldDefinition;
  value: unknown;
  onChange: (value: unknown) => void;
  disabled?: boolean;
  evidence?: NrSurveyEvidenceContext | undefined;
}) {
  const id = useId();
  const label = `${field.nome}${field.obrigatorio ? " · necessário para revisão" : ""}`;
  const help = field.ajuda;
  const helpId = help ? `${id}-help` : undefined;
  if (field.tipo === "nao_suportado")
    return (
      <div className="nr-wide nr-survey-field">
        <p>{field.nome}</p>
        <p className="nr-source">
          Tipo de campo histórico ainda sem editor compatível. A resposta permanece preservada.
        </p>
        <NrSurveyValue value={value} />
      </div>
    );
  if (field.tipo === "lista")
    return (
      <SurveyList
        field={field}
        value={value}
        onChange={onChange}
        disabled={disabled}
        evidence={evidence}
      />
    );
  if (field.tipo === "foto")
    return (
      <SurveyPhotos
        field={field}
        value={value}
        onChange={onChange}
        disabled={disabled}
        evidence={evidence}
      />
    );
  if (field.tipo === "checklist")
    return <SurveyAssessment field={field} value={value} onChange={onChange} disabled={disabled} />;
  if (field.tipo === "multipla") {
    if (value != null && !Array.isArray(value))
      return (
        <fieldset className="nr-wide nr-survey-field">
          <legend>{label}</legend>
          <p className="nr-source">
            Resposta histórica com estrutura diferente; conteúdo preservado para conciliação.
          </p>
          <NrSurveyValue value={value} />
        </fieldset>
      );
    const selected: unknown[] = Array.isArray(value) ? value : [];
    const choices = [
      ...new Set([
        ...(field.opcoes ?? []),
        ...selected.filter((entry): entry is string => typeof entry === "string"),
      ]),
    ];
    return (
      <fieldset className="nr-wide nr-survey-field" aria-describedby={helpId}>
        <legend>{label}</legend>
        <div className="nr-survey-choices">
          {choices.map((choice) => (
            <label key={choice}>
              <input
                type="checkbox"
                disabled={disabled}
                checked={selected.includes(choice)}
                onChange={(event) =>
                  onChange(
                    event.target.checked
                      ? [...selected, choice]
                      : selected.filter((entry) => entry !== choice),
                  )
                }
              />
              <span>
                {field.rotulos_opcoes?.[choice] ?? choice}
                {!(field.opcoes ?? []).includes(choice) ? " · resposta histórica" : ""}
              </span>
            </label>
          ))}
        </div>
        {selected.some((entry) => typeof entry !== "string") && (
          <NrSurveyValue value={selected.filter((entry) => typeof entry !== "string")} />
        )}
        {help && (
          <p id={helpId} className="nr-muted">
            {help}
          </p>
        )}
      </fieldset>
    );
  }
  if (field.tipo === "calculado")
    return (
      <div className="nr-survey-field">
        <p className="nr-muted">{field.nome}</p>
        <output className="nr-survey-result">
          <NrSurveyValue value={value} />
        </output>
        <p className="nr-muted">
          Valor preservado da origem. O memorial e sua revisão permanecem separados do
          preenchimento.
        </p>
      </div>
    );
  if (value !== null && typeof value === "object")
    return (
      <div className="nr-wide nr-survey-field">
        <p>{label}</p>
        <p className="nr-muted">Estrutura histórica preservada.</p>
        <NrSurveyValue value={value} />
      </div>
    );
  const current = scalar(value);
  const numeric = field.tipo === "numero";
  const supportedNumber = !numeric || current === "" || Number.isFinite(Number(current));
  const labelId = `${id}-label`;
  const descriptions =
    [
      helpId,
      field.unidade ? `${id}-unit` : undefined,
      !supportedNumber ? `${id}-historic` : undefined,
    ]
      .filter(Boolean)
      .join(" ") || undefined;
  return (
    <label
      className={`nr-survey-control${field.tipo === "texto_longo" ? " nr-wide" : ""}`}
      htmlFor={id}
      data-filled={surveyHasValue(value) || undefined}
      data-readonly={disabled || undefined}
    >
      <span id={labelId}>{label}</span>
      {field.tipo === "texto_longo" ? (
        <textarea
          id={id}
          disabled={disabled}
          rows={3}
          value={current}
          aria-describedby={descriptions}
          aria-labelledby={labelId}
          placeholder={field.placeholder}
          onChange={(event) => onChange(event.target.value)}
        />
      ) : field.tipo === "selecao" ? (
        <select
          id={id}
          disabled={disabled}
          value={current}
          aria-describedby={descriptions}
          aria-labelledby={labelId}
          onChange={(event) => onChange(event.target.value)}
        >
          <option value="">Não informado</option>
          {current && !(field.opcoes ?? []).includes(current) && (
            <option value={current}>{current} · resposta histórica</option>
          )}
          {(field.opcoes ?? []).map((option) => (
            <option key={option} value={option}>
              {field.rotulos_opcoes?.[option] ?? surveyLabel(option)}
            </option>
          ))}
        </select>
      ) : (
        <>
          <input
            id={id}
            disabled={disabled}
            type={
              numeric
                ? "number"
                : field.tipo === "data" && (!current || /^\d{4}-\d{2}-\d{2}$/.test(current))
                  ? "date"
                  : "text"
            }
            step={numeric ? "any" : undefined}
            inputMode={numeric ? "decimal" : undefined}
            value={numeric && !supportedNumber ? "" : current}
            placeholder={field.placeholder}
            aria-describedby={descriptions}
            aria-labelledby={labelId}
            onChange={(event) =>
              onChange(
                numeric && event.target.value !== ""
                  ? Number(event.target.value)
                  : event.target.value,
              )
            }
          />
          {!supportedNumber && (
            <small id={`${id}-historic`} className="nr-muted">
              Valor histórico preservado: {current}. Uma nova medição substitui somente esta
              resposta.
            </small>
          )}
        </>
      )}
      {field.unidade && (
        <small id={`${id}-unit`} className="nr-muted">
          Unidade: {field.unidade}
        </small>
      )}
      {help && (
        <small id={helpId} className="nr-muted">
          {help}
        </small>
      )}
    </label>
  );
}

function SurveyList({
  field,
  value,
  onChange,
  disabled,
  evidence,
}: {
  field: SurveyFieldDefinition;
  value: unknown;
  onChange: (value: unknown) => void;
  disabled: boolean;
  evidence?: NrSurveyEvidenceContext | undefined;
}) {
  const container = useRef<HTMLFieldSetElement>(null);
  if (value != null && !Array.isArray(value))
    return (
      <fieldset className="nr-wide nr-survey-field">
        <legend>{field.nome}</legend>
        <p className="nr-source">
          Estrutura histórica preservada; a conversão para lista precisa de conciliação.
        </p>
        <NrSurveyValue value={value} />
      </fieldset>
    );
  const rows: unknown[] = Array.isArray(value) ? value : [];
  const fields = field.subcampos ?? [];
  if (disabled && fields.length)
    return (
      <section className="nr-wide nr-survey-field">
        <h4>{field.nome}</h4>
        {rows.length ? (
          <ol className="nr-survey-records">
            {rows.map((entry, index) => {
              const row = surveyObject(entry);
              const extra = Object.fromEntries(
                Object.entries(row).filter(
                  ([key]) => !fields.some((definition) => definition.id === key),
                ),
              );
              return (
                <li key={index}>
                  <article
                    className="nr-survey-row"
                    aria-label={`${field.nome}, registro ${index + 1}`}
                  >
                    <h5>Registro {index + 1}</h5>
                    {entry !== null && typeof entry === "object" && !Array.isArray(entry) ? (
                      <dl className="nr-survey-record-facts">
                        {fields.map((definition) => (
                          <div key={definition.id}>
                            <dt>{definition.nome}</dt>
                            <dd>
                              <NrSurveyValue
                                value={
                                  definition.tipo === "selecao" &&
                                  typeof row[definition.id] === "string"
                                    ? (definition.rotulos_opcoes?.[String(row[definition.id])] ??
                                      row[definition.id])
                                    : row[definition.id]
                                }
                              />
                              {definition.unidade && (
                                <small className="nr-muted">{definition.unidade}</small>
                              )}
                              {surveyApplicability(definition.mostrar_se, row) === false &&
                                surveyHasValue(row[definition.id]) && (
                                  <small className="nr-muted">
                                    Valor histórico fora da condição atual
                                  </small>
                                )}
                            </dd>
                          </div>
                        ))}
                      </dl>
                    ) : (
                      <NrSurveyValue value={entry} />
                    )}
                    {Object.keys(extra).length > 0 && (
                      <details>
                        <summary>Outras informações preservadas</summary>
                        <NrSurveyValue value={extra} />
                      </details>
                    )}
                  </article>
                </li>
              );
            })}
          </ol>
        ) : (
          <p className="nr-muted">{field.vazio || "Nenhum registro."}</p>
        )}
      </section>
    );
  const patch = (index: number, key: string, next: unknown) =>
    onChange(
      rows.map((entry, i) => (i === index ? { ...surveyObject(entry), [key]: next } : entry)),
    );
  return (
    <fieldset className="nr-wide nr-survey-field" ref={container}>
      <legend>
        {field.nome}
        {field.obrigatorio ? " · necessário para revisão" : ""}
      </legend>
      {field.ajuda && <p className="nr-muted">{field.ajuda}</p>}
      {!rows.length && <p className="nr-muted">{field.vazio || "Nenhum registro."}</p>}
      {rows.map((entry, index) => {
        const row = surveyObject(entry);
        const extra = Object.fromEntries(
          Object.entries(row).filter(
            ([key]) => !fields.some((definition) => definition.id === key),
          ),
        );
        return (
          <section
            className="nr-survey-row"
            key={index}
            aria-label={`${field.nome}, registro ${index + 1}`}
          >
            <div className="nr-panel-header">
              <strong>Registro {index + 1}</strong>
              {!disabled && (
                <ActionButton
                  variant="ghost"
                  data-survey-remove
                  onClick={() => {
                    onChange(rows.filter((_, i) => i !== index));
                    requestAnimationFrame(() => {
                      const remaining =
                        container.current?.querySelectorAll<HTMLElement>("[data-survey-remove]");
                      const next =
                        remaining?.[Math.min(index, remaining.length - 1)] ??
                        container.current?.querySelector<HTMLElement>("[data-survey-add]");
                      next?.focus();
                    });
                  }}
                >
                  <Trash2 size={15} />
                  Remover registro {index + 1}
                </ActionButton>
              )}
            </div>
            {fields.length &&
            typeof entry === "object" &&
            entry !== null &&
            !Array.isArray(entry) ? (
              <>
                <div className="nr-field-grid">
                  {fields
                    .filter(
                      (definition) => surveyApplicability(definition.mostrar_se, row) !== false,
                    )
                    .map((definition) => (
                      <NrSurveyField
                        key={definition.id}
                        field={definition}
                        value={row[definition.id]}
                        disabled={disabled}
                        evidence={evidence}
                        onChange={(next) => patch(index, definition.id, next)}
                      />
                    ))}
                </div>
                {Object.keys(extra).length > 0 && (
                  <details>
                    <summary>Outras informações preservadas</summary>
                    <NrSurveyValue value={extra} />
                  </details>
                )}
              </>
            ) : typeof entry === "string" ? (
              <label>
                Descrição
                <input
                  value={entry}
                  disabled={disabled}
                  onChange={(event) =>
                    onChange(rows.map((current, i) => (i === index ? event.target.value : current)))
                  }
                />
              </label>
            ) : (
              <NrSurveyValue value={entry} />
            )}
          </section>
        );
      })}
      {!disabled && (
        <ActionButton
          data-survey-add
          variant="ghost"
          onClick={() => onChange([...rows, fields.length ? {} : ""])}
        >
          <Plus size={15} />
          {field.rotulo_adicionar || "Adicionar registro"}
        </ActionButton>
      )}
    </fieldset>
  );
}

function SurveyPhotos({
  field,
  value,
  onChange,
  disabled,
  evidence,
}: {
  field: SurveyFieldDefinition;
  value: unknown;
  onChange: (value: unknown) => void;
  disabled: boolean;
  evidence?: NrSurveyEvidenceContext | undefined;
}) {
  const photos = Array.isArray(value) ? value : value == null || value === "" ? [] : [value];
  return (
    <fieldset className="nr-wide nr-survey-field">
      <legend>
        {field.nome}
        {field.obrigatorio ? " · necessário para revisão" : ""}
      </legend>
      <p className="nr-muted">
        Referências e legendas do levantamento. A disponibilidade do original é conferida na galeria
        do local.
      </p>
      {field.destino === "fotos" && photos.length > 1 && (
        <p className="nr-source">
          A origem vinculou o conjunto de fotos do local a este campo. A legenda de cada foto foi
          preservada; sua finalidade individual precisa ser conferida.
        </p>
      )}
      {evidence ? (
        <NrPhotoGallery
          org={evidence.org}
          localId={evidence.localId ?? null}
          value={photos}
          context={`${evidence.context} · ${field.nome}`}
        />
      ) : !photos.length ? (
        <p className="nr-muted">Nenhuma referência registrada neste campo.</p>
      ) : (
        photos.map((photo, index) => {
          const metadata = surveyObject(photo);
          return (
            <div className="nr-survey-photo-reference" key={index}>
              <strong>Foto {index + 1}</strong>
              {Object.keys(metadata).length ? (
                <>
                  <p style={{ whiteSpace: "pre-wrap" }}>
                    {scalar(metadata["legenda"]) || "Sem legenda na origem"}
                  </p>
                  <p className="nr-muted">
                    {scalar(metadata["data"]) || "Data não informada"} ·{" "}
                    {scalar(metadata["autor"]) || "Autor histórico não informado"}
                  </p>
                  <details>
                    <summary>Referência e metadados preservados</summary>
                    <NrSurveyValue value={metadata} />
                  </details>
                </>
              ) : (
                <NrSurveyValue value={photo} />
              )}
            </div>
          );
        })
      )}
      {evidence?.onAttach && (
        <ActionButton
          variant="ghost"
          disabled={disabled}
          onClick={() => evidence.onAttach?.(field, value, onChange)}
        >
          <Plus size={15} />
          Anexar evidência do acervo
        </ActionButton>
      )}
      {!disabled && (
        <NrPhotoMetadataEditor value={photos} onChange={onChange} disabled={disabled} />
      )}
    </fieldset>
  );
}

const assessmentChoices: Record<string, string[]> = {
  existencia: ["nao_verificada", "presente", "ausente"],
  aplicabilidade: ["pendente", "aplicavel", "nao_aplicavel"],
  condicao: ["nao_avaliada", "conforme", "nao_conforme"],
  acao: ["sem_decisao", "verificar", "manter", "adequar", "instalar", "substituir"],
};
function SurveyAssessment({
  field,
  value,
  onChange,
  disabled,
}: {
  field: SurveyFieldDefinition;
  value: unknown;
  onChange: (value: unknown) => void;
  disabled: boolean;
}) {
  const id = useId();
  if (value != null && (typeof value !== "object" || Array.isArray(value)))
    return (
      <div className="nr-wide">
        <p>{field.nome}</p>
        <NrSurveyValue value={value} />
      </div>
    );
  const rows = surveyObject(value);
  return (
    <fieldset className="nr-wide nr-survey-field">
      <legend>{field.nome}</legend>
      <p className="nr-muted">
        Cada grupo conserva cinco dimensões independentes. Uma avaliação não equivale a equipamento
        instalado. A validação registrada na origem não aprova uma edição na Nexus.
      </p>
      {Object.keys(rows).length ? (
        <div
          className="nr-table-scroll"
          tabIndex={0}
          role="region"
          aria-label="Matriz de avaliações por família"
        >
          <table className="nr-survey-assessments">
            <thead>
              <tr>
                <th scope="col">Grupo</th>
                {Object.keys(assessmentChoices).map((axis) => (
                  <th scope="col" key={axis}>
                    {surveyLabel(axis)}
                  </th>
                ))}
                <th scope="col">Validação histórica</th>
                <th scope="col">Justificativa e evidências</th>
              </tr>
            </thead>
            <tbody>
              {Object.entries(rows).map(([family, raw]) => {
                const row = surveyObject(raw);
                const justificationId = `${id}-just-${encodeURIComponent(family)}`;
                if (!Object.keys(row).length)
                  return (
                    <tr key={family}>
                      <th scope="row">{family}</th>
                      <td colSpan={6}>
                        <NrSurveyValue value={raw} />
                      </td>
                    </tr>
                  );
                const patch = (key: string, next: unknown) =>
                  onChange({
                    ...rows,
                    [family]: { ...row, [key]: next, validacao_nexus: "nao_revisado" },
                  });
                return (
                  <tr key={family}>
                    <th scope="row">{family}</th>
                    {Object.entries(assessmentChoices).map(([axis, choices]) => (
                      <td key={axis}>
                        {disabled ? (
                          <span>
                            {scalar(row[axis]) ? surveyLabel(scalar(row[axis])) : "Não informado"}
                          </span>
                        ) : (
                          <select
                            aria-label={`${family}: ${surveyLabel(axis)}`}
                            disabled={disabled}
                            value={scalar(row[axis])}
                            onChange={(event) => patch(axis, event.target.value)}
                          >
                            <option value="">Não informado</option>
                            {scalar(row[axis]) && !choices.includes(scalar(row[axis])) && (
                              <option value={scalar(row[axis])}>
                                {surveyLabel(scalar(row[axis]))} · histórico
                              </option>
                            )}
                            {choices.map((choice) => (
                              <option value={choice} key={choice}>
                                {surveyLabel(choice)}
                              </option>
                            ))}
                          </select>
                        )}
                      </td>
                    ))}
                    <td>
                      {scalar(row["validacao"])
                        ? surveyLabel(scalar(row["validacao"]))
                        : "Não informada"}
                    </td>
                    <td>
                      <label className="sr-only" htmlFor={justificationId}>
                        {family}: justificativa
                      </label>
                      {disabled ? (
                        <p style={{ whiteSpace: "pre-wrap" }}>
                          {scalar(row["justificativa"]) || "Não informada"}
                        </p>
                      ) : (
                        <textarea
                          id={justificationId}
                          rows={3}
                          disabled={disabled}
                          value={scalar(row["justificativa"])}
                          onChange={(event) => patch("justificativa", event.target.value)}
                        />
                      )}
                      <details>
                        <summary>Evidências e informações preservadas</summary>
                        <NrSurveyValue
                          value={Object.fromEntries(
                            Object.entries(row).filter(
                              ([key]) =>
                                ![
                                  ...Object.keys(assessmentChoices),
                                  "validacao",
                                  "justificativa",
                                ].includes(key),
                            ),
                          )}
                        />
                      </details>
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      ) : (
        <p className="nr-muted">Nenhuma avaliação registrada neste campo.</p>
      )}
    </fieldset>
  );
}
