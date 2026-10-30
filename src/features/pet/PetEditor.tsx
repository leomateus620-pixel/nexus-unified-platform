import { cloneElement, isValidElement, useId, useState, type ReactNode } from "react";
import { Plus, Trash2, UserRound, ShieldCheck } from "lucide-react";
import { ActionButton } from "@/components/nexus/Page";
import {
  optionName,
  petSnapshotOption,
  PET_FUNCOES,
  PET_ETAPAS,
  petDate,
  type PetDetalhe,
  type PetExecute,
  type PetOpcoes,
} from "./ui-types";
import { PetStatus } from "./ExecucaoWorkspace";
import { petDangerEvidenceItem } from "./evidence-context";
import { PetPicker } from "./PetPicker";
import {
  PET_CONTROLES,
  pendingTarget,
  petAnswerError,
  petConferenceActions,
  petModelRequirements,
  updatePetAnswer,
  type PetDraft,
} from "./preparation-domain";
import "./pet-preparation.css";
// eslint-disable-next-line react-refresh/only-export-components -- Existing public imports forward pure helpers.
export { PET_CONTROLES, draftPayload, petDraft, pendingTarget } from "./preparation-domain";
export type { PetDraft } from "./preparation-domain";
export type PetPreparationFieldErrors = { atividade?: string; termino_previsto?: string };

const PERIGOS: Record<string, string[]> = {
  Químicos: ["Poeiras", "Fumos", "Gases tóxicos", "Vapores", "Névoas", "Derivados de petróleo"],
  Físicos: ["Ruído", "Calor", "Frio", "Umidade", "Radiação ionizante", "Radiação não ionizante"],
  Ergonômicos: [
    "Esforço intenso",
    "Manuseio de carga",
    "Repetitividade",
    "Monotonia",
    "Deficiência de luz",
    "Trabalho noturno",
  ],
  Biológicos: ["Vírus", "Bactérias", "Fungos", "Parasitas"],
  Acidentes: [
    "Queda",
    "Queimaduras",
    "Corte",
    "Choque elétrico",
    "Intempéries",
    "Animais peçonhentos",
  ],
  "Outros perigos": [],
};
export function PetField({
  id: suppliedId,
  item,
  label,
  hint,
  error,
  children,
  wide = false,
}: {
  id?: string;
  item?: string;
  label: string;
  hint?: string | undefined;
  error?: string | undefined;
  children: ReactNode;
  wide?: boolean;
}) {
  const generatedId = useId();
  const id = suppliedId || generatedId;
  const describedBy =
    [hint ? id + "-hint" : "", error ? id + "-error" : ""].filter(Boolean).join(" ") || undefined;
  const directControl =
    isValidElement<{
      id?: string;
      "aria-describedby"?: string | undefined;
      "aria-invalid"?: boolean;
    }>(children) &&
    typeof children.type === "string" &&
    ["input", "select", "textarea"].includes(children.type);
  const control = directControl
    ? cloneElement(children, {
        id,
        "aria-describedby":
          [children.props["aria-describedby"], describedBy].filter(Boolean).join(" ") || undefined,
        ...(error ? { "aria-invalid": true } : {}),
      })
    : children;
  return (
    <div className={`nx-pet-field${wide ? " nx-pet-wide" : ""}`} data-pet-field={item}>
      {directControl ? (
        <>
          <label htmlFor={id}>{label}</label>
          {control}
        </>
      ) : (
        <label className="pet-compound-field">
          <span>{label}</span>
          {control}
        </label>
      )}
      {hint && <small id={id + "-hint"}>{hint}</small>}
      {error && (
        <span role="alert" id={id + "-error"} className="nx-pet-field-error">
          {error}
        </span>
      )}
    </div>
  );
}
export function PetDraftStage({
  stage,
  draft,
  onChange,
  detail,
  options,
  readOnly,
  evidences,
  fieldErrors,
}: {
  stage: number;
  draft: PetDraft;
  onChange: (draft: PetDraft) => void;
  detail: PetDetalhe;
  options: PetOpcoes;
  readOnly: boolean;
  evidences?: ((item: string) => ReactNode) | undefined;
  fieldErrors?: PetPreparationFieldErrors;
}) {
  const id = useId();
  const [selectedPerson, setSelectedPerson] = useState("");
  const [funcao, setFuncao] = useState("trabalhador");
  const [classificacao, setClassificacao] = useState("interno");
  const [empresa, setEmpresa] = useState("");
  const [otherByGroup, setOtherByGroup] = useState<Record<string, string>>({});
  const [observations, setObservations] = useState<Record<string, boolean>>({});
  const selectedModel = options.modelos.find((model) => model.id === draft.modelo_id);
  const requirements = petModelRequirements(selectedModel);
  const controlGroups = [
    ...PET_CONTROLES,
    {
      grupo: "Itens do procedimento",
      itens: requirements
        .filter(
          (rule) => !PET_CONTROLES.some((group) => group.itens.some(([key]) => key === rule.id)),
        )
        .map((rule) => [rule.id, rule.rotulo || rule.id] as [string, string]),
    },
  ].filter((group) => group.itens.length);
  const set = <K extends keyof PetDraft>(key: K, value: PetDraft[K]) =>
    onChange({ ...draft, [key]: value });
  const procedure = (key: string, value: string) =>
    set("procedimentos", { ...draft.procedimentos, [key]: value });
  const name = (personId: string) => {
    const snapshot = detail.participantes.find((person) => person.pessoa_id === personId);
    return (
      snapshot?.nome_snapshot ||
      snapshot?.nome ||
      optionName(options.pessoas.find((person) => person.id === personId))
    );
  };
  const addDanger = (grupo: string, perigo: string) => {
    if (!draft.perigos.some((danger) => danger.grupo === grupo && danger.perigo === perigo))
      set("perigos", [...draft.perigos, { grupo, perigo, medida: "", evidencia: "" }]);
  };
  const knownSpace = petSnapshotOption(detail, "espaco") || detail.espaco;

  if (stage === 0)
    return (
      <section className="nx-pet-panel pet-preparation">
        <header className="pet-section-heading">
          <div>
            <p className="nx-pet-kicker">Preparação</p>
            <h2>Contexto do trabalho</h2>
          </div>
          <span className="pet-source-tag">Vinculado à OS</span>
        </header>
        <dl className="pet-inherited-context">
          <div>
            <dt>Cliente</dt>
            <dd>
              {optionName(
                petSnapshotOption(detail, "cliente") ||
                  options.clientes.find((client) => client.id === detail.os?.cliente_id),
              )}
            </dd>
          </div>
          <div>
            <dt>Unidade</dt>
            <dd>
              {optionName(
                petSnapshotOption(detail, "unidade") ||
                  options.unidades.find((unit) => unit.id === detail.pet.unidade_id),
              )}
            </dd>
          </div>
          <div>
            <dt>Espaço confinado</dt>
            <dd>{optionName(knownSpace)}</dd>
          </div>
          <div>
            <dt>Localização</dt>
            <dd>{String(knownSpace?.localizacao || "Não informada")}</dd>
          </div>
        </dl>
        <div className="nx-pet-grid">
          <PetField
            wide
            item="atividade"
            label="Atividade a realizar"
            error={fieldErrors?.atividade}
          >
            <textarea
              disabled={readOnly}
              required
              value={draft.atividade}
              onChange={(event) => set("atividade", event.target.value)}
            />
          </PetField>
          <PetField
            item="termino_previsto"
            label="Validade prevista"
            hint={`Horário no fuso ${detail.pet.timezone}.`}
            error={fieldErrors?.termino_previsto}
          >
            <input
              type="datetime-local"
              disabled={readOnly}
              required
              value={draft.termino_previsto}
              onChange={(event) => set("termino_previsto", event.target.value)}
            />
          </PetField>
          <PetField
            item="modelo_versao_id"
            label="Modelo e critérios aprovados"
            hint="A versão selecionada define as verificações desta PET."
          >
            <select
              disabled={readOnly}
              value={draft.modelo_id}
              onChange={(event) => set("modelo_id", event.target.value)}
            >
              <option value="">Selecionar versão aprovada</option>
              {draft.modelo_id && !selectedModel && (
                <option value={draft.modelo_id}>Versão vinculada · {draft.modelo_id}</option>
              )}
              {options.modelos.map((model) => (
                <option
                  key={model.id}
                  value={model.id}
                  disabled={(model.estado || model["status"]) !== "aprovado"}
                >
                  {optionName(model)}
                  {typeof model["versao"] === "number" || typeof model["versao"] === "string"
                    ? ` · versão ${model["versao"]}`
                    : ""}{" "}
                  · {model.estado || String(model["status"] || "A conferir")}
                </option>
              ))}
            </select>
          </PetField>
        </div>
        <p className="pet-preparation-note">
          <ShieldCheck size={17} aria-hidden />
          <span>
            O rascunho prepara esta atividade, espaço e jornada. A entrada depende da emissão e
            liberação válidas.
          </span>
        </p>
        {evidences && (
          <details className="nx-pet-accordion pet-evidence">
            <summary>Fotos e referências do espaço</summary>
            <div>{evidences("identificacao_espaco")}</div>
          </details>
        )}
      </section>
    );

  if (stage === 1)
    return (
      <section className="nx-pet-panel pet-preparation">
        <header className="pet-section-heading">
          <div>
            <p className="nx-pet-kicker">Pessoas e responsabilidades</p>
            <h2>Equipe desta PET</h2>
          </div>
        </header>
        <p className="nx-pet-subtitle">
          Relacione cada pessoa pela função que exercerá nesta permissão.
        </p>
        {!readOnly && (
          <div className="pet-team-composer" data-pet-field="participantes">
            <PetPicker
              id={id + "-person"}
              label="Pessoa cadastrada"
              placeholder="Buscar pessoa cadastrada"
              value={selectedPerson}
              options={options.pessoas.map((person) => ({
                id: person.id,
                label: optionName(person),
                description: [person["funcao"], person["vinculo"], person["telefone_profissional"]]
                  .filter((value): value is string => typeof value === "string" && !!value.trim())
                  .join(" · "),
              }))}
              onChange={setSelectedPerson}
            />
            <PetField label="Função nesta PET">
              <select value={funcao} onChange={(event) => setFuncao(event.target.value)}>
                {Object.entries(PET_FUNCOES).map(([value, label]) => (
                  <option key={value} value={value}>
                    {label}
                  </option>
                ))}
              </select>
            </PetField>
            <PetField label="Vínculo">
              <select
                value={classificacao}
                onChange={(event) => setClassificacao(event.target.value)}
              >
                <option value="interno">Colaborador interno</option>
                <option value="terceirizado">Colaborador terceirizado</option>
              </select>
            </PetField>
            {classificacao === "terceirizado" && (
              <PetField label="Empresa de vínculo">
                <input value={empresa} onChange={(event) => setEmpresa(event.target.value)} />
              </PetField>
            )}
            <ActionButton
              variant="ghost"
              className="pet-team-add"
              disabled={
                !selectedPerson ||
                (classificacao === "terceirizado" && !empresa.trim()) ||
                draft.participantes.some(
                  (person) => person.pessoa_id === selectedPerson && person.funcao === funcao,
                )
              }
              onClick={() => {
                if (
                  !selectedPerson ||
                  draft.participantes.some(
                    (person) => person.pessoa_id === selectedPerson && person.funcao === funcao,
                  )
                )
                  return;
                set("participantes", [
                  ...draft.participantes,
                  {
                    pessoa_id: selectedPerson,
                    funcao,
                    classificacao,
                    empresa: classificacao === "terceirizado" ? empresa : "",
                  },
                ]);
                setSelectedPerson("");
              }}
            >
              <Plus size={16} aria-hidden /> Adicionar à equipe
            </ActionButton>
          </div>
        )}
        <div className="pet-team-groups" data-pet-field={readOnly ? "participantes" : undefined}>
          {[
            ...new Set([
              ...Object.keys(PET_FUNCOES),
              ...draft.participantes.map((person) => person.funcao),
            ]),
          ].map((role) => {
            const people = draft.participantes.filter((person) => person.funcao === role);
            return (
              <section className="pet-team-group" key={role}>
                <h3>
                  {PET_FUNCOES[role] || role}
                  <span>{people.length}</span>
                </h3>
                {people.length ? (
                  <ul>
                    {people.map((person) => (
                      <li key={person.pessoa_id + ":" + person.funcao}>
                        <UserRound size={18} aria-hidden />
                        <div>
                          <strong>{name(person.pessoa_id)}</strong>
                          <p>
                            {person.classificacao === "interno"
                              ? "Interno"
                              : `Terceirizado · ${person.empresa || "Empresa não informada"}`}
                          </p>
                        </div>
                        {!readOnly && (
                          <ActionButton
                            variant="ghost"
                            aria-label={`Remover ${name(person.pessoa_id)} da função ${PET_FUNCOES[role] || role}`}
                            onClick={() =>
                              set(
                                "participantes",
                                draft.participantes.filter((current) => current !== person),
                              )
                            }
                          >
                            <Trash2 size={16} aria-hidden />
                          </ActionButton>
                        )}
                      </li>
                    ))}
                  </ul>
                ) : (
                  <p className="pet-team-empty">Nenhuma pessoa relacionada.</p>
                )}
              </section>
            );
          })}
        </div>
        <PetField
          item="contatos_emergencia"
          label="Contatos operacionais, emergência e resgate"
          hint="Informe os canais previstos no procedimento. O aplicativo não aciona o resgate."
        >
          <textarea
            disabled={readOnly}
            value={draft.contatos_emergencia}
            onChange={(event) => set("contatos_emergencia", event.target.value)}
          />
        </PetField>
        {detail.participantes.some((person) => person.fim || person.fim_vigencia) && (
          <details className="nx-pet-accordion pet-evidence">
            <summary>Funções e vigências anteriores</summary>
            <div className="nx-pet-table-scroll">
              <table className="nx-pet-table">
                <thead>
                  <tr>
                    <th scope="col">Pessoa</th>
                    <th scope="col">Função</th>
                    <th scope="col">Início</th>
                    <th scope="col">Término</th>
                  </tr>
                </thead>
                <tbody>
                  {detail.participantes
                    .filter((person) => person.fim || person.fim_vigencia)
                    .map((person) => (
                      <tr key={person.id}>
                        <td>{person.nome_snapshot || person.nome}</td>
                        <td>{PET_FUNCOES[person.funcao] || person.funcao}</td>
                        <td>
                          {petDate(person.inicio || person.inicio_vigencia, detail.pet.timezone)}
                        </td>
                        <td>{petDate(person.fim || person.fim_vigencia, detail.pet.timezone)}</td>
                      </tr>
                    ))}
                </tbody>
              </table>
            </div>
          </details>
        )}
      </section>
    );

  if (stage === 2)
    return (
      <div className="pet-preparation pet-safety-sections">
        <section className="nx-pet-panel" data-pet-field="perigos" tabIndex={-1}>
          <header className="pet-section-heading">
            <div>
              <p className="nx-pet-kicker">Identificação de riscos</p>
              <h2>Perigos e medidas preventivas</h2>
            </div>
            <span className="pet-source-tag">{draft.perigos.length} identificado(s)</span>
          </header>
          <p className="nx-pet-subtitle">
            Selecione o que foi observado e registre a medida ao lado de cada perigo.
          </p>
          {[
            ...new Set([...Object.keys(PERIGOS), ...draft.perigos.map((danger) => danger.grupo)]),
          ].map((group) => {
            const selected = draft.perigos.filter((danger) => danger.grupo === group);
            const other = otherByGroup[group] || "";
            return (
              <details
                className="nx-pet-accordion pet-danger-group"
                key={group}
                open={selected.length > 0}
              >
                <summary>
                  <span>{group}</span>
                  <span className="pet-group-count">{selected.length} selecionado(s)</span>
                </summary>
                <div>
                  {!!PERIGOS[group]?.length && (
                    <div className="pet-danger-options">
                      {PERIGOS[group]!.map((danger) => (
                        <label key={danger}>
                          <input
                            type="checkbox"
                            disabled={readOnly}
                            checked={selected.some((current) => current.perigo === danger)}
                            onChange={(event) =>
                              event.target.checked
                                ? addDanger(group, danger)
                                : set(
                                    "perigos",
                                    draft.perigos.filter(
                                      (current) =>
                                        !(current.grupo === group && current.perigo === danger),
                                    ),
                                  )
                            }
                          />
                          <span>{danger}</span>
                        </label>
                      ))}
                    </div>
                  )}
                  {selected.map((danger) => (
                    <article className="pet-danger-detail" key={danger.perigo}>
                      <header>
                        <h3>{danger.perigo}</h3>
                        {!readOnly && (
                          <ActionButton
                            variant="ghost"
                            aria-label={`Remover perigo ${danger.perigo} de ${group}`}
                            onClick={() =>
                              set(
                                "perigos",
                                draft.perigos.filter((current) => current !== danger),
                              )
                            }
                          >
                            <Trash2 size={16} aria-hidden />
                          </ActionButton>
                        )}
                      </header>
                      <div className="nx-pet-grid">
                        <PetField label={`Medida preventiva · ${danger.perigo}`}>
                          <textarea
                            disabled={readOnly}
                            value={danger.medida}
                            onChange={(event) =>
                              set(
                                "perigos",
                                draft.perigos.map((current) =>
                                  current === danger
                                    ? { ...current, medida: event.target.value }
                                    : current,
                                ),
                              )
                            }
                          />
                        </PetField>
                        <PetField label={`Referência da evidência · ${danger.perigo}`}>
                          <textarea
                            disabled={readOnly}
                            value={danger.evidencia}
                            onChange={(event) =>
                              set(
                                "perigos",
                                draft.perigos.map((current) =>
                                  current === danger
                                    ? { ...current, evidencia: event.target.value }
                                    : current,
                                ),
                              )
                            }
                          />
                        </PetField>
                      </div>
                      {evidences && (
                        <details className="nx-pet-accordion pet-evidence">
                          <summary>Fotos e arquivos de {danger.perigo}</summary>
                          <div>{evidences(petDangerEvidenceItem(danger.grupo, danger.perigo))}</div>
                        </details>
                      )}
                    </article>
                  ))}
                  {!readOnly && (
                    <div className="pet-add-danger">
                      <PetField label={`Outro perigo · ${group}`}>
                        <input
                          value={other}
                          placeholder="Descrever perigo identificado"
                          onChange={(event) =>
                            setOtherByGroup((previous) => ({
                              ...previous,
                              [group]: event.target.value,
                            }))
                          }
                        />
                      </PetField>
                      <ActionButton
                        variant="ghost"
                        disabled={!other.trim()}
                        onClick={() => {
                          addDanger(group, other.trim());
                          setOtherByGroup((previous) => ({ ...previous, [group]: "" }));
                        }}
                      >
                        <Plus size={16} aria-hidden /> Adicionar
                      </ActionButton>
                    </div>
                  )}
                </div>
              </details>
            );
          })}
        </section>
        <section className="nx-pet-panel" data-pet-field="respostas" tabIndex={-1}>
          <header className="pet-section-heading">
            <div>
              <p className="nx-pet-kicker">Verificação de campo</p>
              <h2>Proteções e controles</h2>
            </div>
          </header>
          <p className="nx-pet-subtitle">
            Responda cada item conforme a verificação realizada. O procedimento aprovado define a
            aplicabilidade.
          </p>
          {controlGroups.map((group, groupIndex) => (
            <details
              className="nx-pet-accordion pet-control-group"
              key={group.grupo}
              open={groupIndex === 0}
            >
              <summary>
                <span>{group.grupo}</span>
                <span className="pet-group-count">
                  {
                    group.itens.filter(([item]) =>
                      draft.respostas.some(
                        (answer) => answer.item === item && answer.resposta !== "nao_verificado",
                      ),
                    ).length
                  }
                  /{group.itens.length} respondidos
                </span>
              </summary>
              <div className="pet-control-list">
                {group.itens.map(([item, label]) => {
                  const answer = draft.respostas.find((current) => current.item === item);
                  const rule = requirements.find((current) => current.id === item);
                  const answerError = petAnswerError(answer, rule);
                  const showJustification =
                    observations[item] ||
                    !!answer?.justificativa ||
                    ["nao", "nao_aplicavel"].includes(answer?.resposta || "");
                  const fieldId = id + "-control-" + encodeURIComponent(item);
                  return (
                    <div className="pet-control-row" key={item} data-pet-field={item} tabIndex={-1}>
                      <fieldset aria-describedby={answerError ? fieldId + "-error" : undefined}>
                        <legend>
                          {label}
                          {rule?.obrigatorio && (
                            <span className="pet-required-tag">Obrigatório</span>
                          )}
                        </legend>
                        <div className="pet-control-answers">
                          {(
                            [
                              ["sim", "Sim"],
                              ["nao", "Não"],
                              ["nao_aplicavel", "Não se aplica"],
                              ["nao_verificado", "Não verificado"],
                            ] as const
                          ).map(([value, text]) => (
                            <label
                              key={value}
                              data-selected={(answer?.resposta || "nao_verificado") === value}
                            >
                              <input
                                type="radio"
                                name={fieldId}
                                disabled={
                                  readOnly ||
                                  (value === "nao_aplicavel" && !!rule && rule.permite_na !== true)
                                }
                                checked={(answer?.resposta || "nao_verificado") === value}
                                onChange={() =>
                                  set(
                                    "respostas",
                                    updatePetAnswer(draft.respostas, item, { resposta: value }),
                                  )
                                }
                              />
                              <span>{text}</span>
                            </label>
                          ))}
                        </div>
                      </fieldset>
                      {showJustification ? (
                        <PetField
                          id={fieldId}
                          label={`Justificativa / verificação · ${label}`}
                          hint={
                            answer?.resposta === "nao_aplicavel"
                              ? "A justificativa segue as condições do procedimento."
                              : undefined
                          }
                          error={answerError}
                        >
                          <input
                            disabled={readOnly}
                            value={answer?.justificativa || ""}
                            onChange={(event) =>
                              set(
                                "respostas",
                                updatePetAnswer(draft.respostas, item, {
                                  justificativa: event.target.value,
                                }),
                              )
                            }
                          />
                        </PetField>
                      ) : (
                        !readOnly && (
                          <button
                            type="button"
                            className="pet-text-button"
                            onClick={() =>
                              setObservations((previous) => ({ ...previous, [item]: true }))
                            }
                          >
                            Adicionar observação
                          </button>
                        )
                      )}
                      {evidences && (
                        <details className="nx-pet-accordion pet-evidence">
                          <summary>
                            Evidências de {label.toLocaleLowerCase("pt-BR")}
                            {rule?.evidencia_obrigatoria ? " · obrigatórias" : ""}
                          </summary>
                          <div>{evidences(item)}</div>
                        </details>
                      )}
                    </div>
                  );
                })}
              </div>
            </details>
          ))}
        </section>
      </div>
    );

  if (stage === 3)
    return (
      <section
        className="nx-pet-panel pet-preparation"
        data-pet-field="procedimentos"
        tabIndex={-1}
      >
        <header className="pet-section-heading">
          <div>
            <p className="nx-pet-kicker">Condições da ocorrência</p>
            <h2>Procedimentos e monitoramento</h2>
          </div>
        </header>
        <div className="nx-pet-grid">
          {(
            [
              ["bloqueio", "Bloqueio, travamento e etiquetagem"],
              ["purga", "Purga / lavagem"],
              ["ventilacao_tipo", "Tipo de ventilação / exaustão"],
              ["ventilacao_equipamento", "Equipamento de ventilação"],
              ["comunicacao", "Procedimento de comunicação"],
              ["resgate", "Procedimento de emergência e resgate"],
              ["treinamentos", "Treinamentos e qualificações conferidos"],
              ["dispositivo_verificacao", "Verificação do dispositivo e classificação do local"],
            ] as const
          ).map(([key, label]) => (
            <PetField key={key} item={"procedimentos." + key} label={label}>
              <textarea
                disabled={readOnly}
                value={draft.procedimentos[key] || ""}
                onChange={(event) => procedure(key, event.target.value)}
              />
            </PetField>
          ))}
          <PetField
            item="procedimentos.dispositivo_adequado"
            label="Dispositivo adequado ao ambiente de uso"
            hint="Confira proteção e certificação aplicáveis ao local."
          >
            <select
              disabled={readOnly}
              value={draft.procedimentos["dispositivo_adequado"] || "nao_verificado"}
              onChange={(event) => procedure("dispositivo_adequado", event.target.value)}
            >
              <option value="nao_verificado">Ainda não verificado</option>
              <option value="sim">Sim · adequação conferida</option>
              <option value="nao">Não · uso impedido</option>
            </select>
          </PetField>
          <PetField
            item="procedimentos.ventilacao_minutos"
            label="Duração da ventilação (min)"
            hint="Tempo verificado nesta ocorrência."
          >
            <input
              disabled={readOnly}
              inputMode="decimal"
              value={draft.procedimentos["ventilacao_minutos"] || ""}
              onChange={(event) => procedure("ventilacao_minutos", event.target.value)}
            />
          </PetField>
        </div>
        <section className="pet-monitoring" data-pet-field="monitoramento_continuo" tabIndex={-1}>
          <h3>Monitoramento atmosférico contínuo</h3>
          <p className="nx-pet-subtitle">
            Registre o equipamento, os alarmes e a referência que sustentam o monitoramento.
            Leituras pontuais não o substituem.
          </p>
          <label className="pet-confirmation" data-pet-field="monitoramento_continuo.confirmado">
            <input
              type="checkbox"
              disabled={readOnly}
              checked={draft.monitoramento_continuo.confirmado}
              onChange={(event) =>
                set("monitoramento_continuo", {
                  ...draft.monitoramento_continuo,
                  confirmado: event.target.checked,
                })
              }
            />
            <span>Verificação de campo registrada conforme procedimento</span>
          </label>
          <div className="nx-pet-grid">
            <PetField item="monitoramento_continuo.equipamento" label="Equipamento e identificação">
              <input
                disabled={readOnly}
                value={draft.monitoramento_continuo.equipamento}
                onChange={(event) =>
                  set("monitoramento_continuo", {
                    ...draft.monitoramento_continuo,
                    equipamento: event.target.value,
                  })
                }
              />
            </PetField>
            <PetField
              item="monitoramento_continuo.registro"
              label="Procedimento e referência do registro contínuo"
            >
              <textarea
                disabled={readOnly}
                value={draft.monitoramento_continuo.registro}
                onChange={(event) =>
                  set("monitoramento_continuo", {
                    ...draft.monitoramento_continuo,
                    registro: event.target.value,
                  })
                }
              />
            </PetField>
          </div>
        </section>
        <details className="nx-pet-accordion pet-evidence" open={!!draft.outras_informacoes}>
          <summary>Informações complementares</summary>
          <div>
            <PetField label="Outras informações desta PET">
              <textarea
                disabled={readOnly}
                value={draft.outras_informacoes}
                onChange={(event) => set("outras_informacoes", event.target.value)}
              />
            </PetField>
          </div>
        </details>
        {evidences && (
          <details className="nx-pet-accordion pet-evidence">
            <summary>Evidências de instrumentos, bloqueios e procedimentos</summary>
            <div>{evidences("atmosfera_procedimentos")}</div>
          </details>
        )}
      </section>
    );
  return null;
}
export function PetConferencia({
  detail,
  options,
  onCommand,
  busy,
  onPending,
}: {
  detail: PetDetalhe;
  options: PetOpcoes;
  onCommand: PetExecute;
  busy: boolean;
  onPending: (stage: number, item?: string) => void;
}) {
  const model = options.modelos.find((option) => option.id === detail.pet.modelo_versao_id);
  const actions = petConferenceActions(
    detail.pet.estado_documental,
    detail.permissoes,
    options.integracao_assinatura.configurada,
  );
  return (
    <div className="pet-preparation pet-conference">
      <section className="nx-pet-panel">
        <div className="nx-pet-section-top">
          <div>
            <p className="nx-pet-kicker">Verificação técnica</p>
            <h2>Conferência e assinaturas</h2>
            <p className="nx-pet-subtitle">
              Revise as pendências e solicite a conferência da versão atual no servidor.
            </p>
          </div>
          <PetStatus value={detail.pet.estado_documental} />
        </div>
        {detail.pendencias?.length ? (
          <div className="nx-pet-notice" data-tone="attention">
            <h3>Pendências para revisar</h3>
            <ul className="pet-pending-list">
              {detail.pendencias.map((p, i) => {
                const text =
                  typeof p === "string"
                    ? p
                    : p.mensagem || p.descricao || p.codigo || "Revisão necessária";
                const target = pendingTarget(p, model);
                return (
                  <li key={i}>
                    <button
                      type="button"
                      className="pet-pending-link"
                      onClick={() => onPending(target.stage, target.item)}
                    >
                      <span>{text}</span>
                      <small>
                        {target.item
                          ? `Revisar ${PET_ETAPAS[target.stage]?.toLocaleLowerCase("pt-BR") || "etapa"}`
                          : "Verificar nesta conferência"}
                      </small>
                    </button>
                  </li>
                );
              })}
            </ul>
          </div>
        ) : (
          <p className="nx-pet-notice">
            Nenhuma pendência retornada nesta consulta. A conferência no servidor revalida o
            conteúdo atual.
          </p>
        )}
        {actions.conferir.visible && (
          <div className="nx-pet-actions mt-5">
            <ActionButton
              loading={busy}
              disabled={!actions.conferir.enabled}
              onClick={() =>
                onCommand({
                  comando: "conferir",
                  dados: { pet_id: detail.pet.id, expected_version: detail.pet.version },
                })
              }
            >
              <ShieldCheck size={16} aria-hidden className="mr-2 inline" /> Conferir versão no
              servidor
            </ActionButton>
          </div>
        )}
      </section>
      <section className="nx-pet-panel" data-pet-field="assinaturas" tabIndex={-1}>
        <h2>Assinaturas e emissão</h2>
        <p className="nx-pet-subtitle mb-4">
          Cada signatário precisa de identificação própria e assinatura certificada vinculada a esta
          versão.
        </p>
        {!options.integracao_assinatura.configurada && (
          <div className="nx-pet-notice" data-tone="attention">
            <strong>Integração não configurada</strong>
            <p className="mt-1">
              O provedor ICP-Brasil está indisponível. Emissão e liberação permanecem bloqueadas.
            </p>
          </div>
        )}
        <div className="nx-pet-list mt-4">
          {detail.assinaturas.length ? (
            detail.assinaturas.map((s) => (
              <div className="nx-pet-card" key={s.id}>
                <div className="nx-pet-card-top">
                  <div>
                    <h3>
                      {s.nome || optionName(options.pessoas.find((p) => p.id === s.pessoa_id))}
                    </h3>
                    <p className="nx-pet-subtitle">
                      {s.finalidade} · {s.metodo}
                    </p>
                  </div>
                  <PetStatus value={s.estado} />
                </div>
                <p className="nx-pet-hint">
                  {s.provedor || "Provedor não informado"} ·{" "}
                  {petDate(s.assinada_em || s.criada_em || s.created_at, detail.pet.timezone)}
                </p>
                {(s.conteudo_sha256 || s.conteudo_hash) && (
                  <p className="nx-pet-hint break-all mt-2">
                    SHA-256 do conteúdo: {s.conteudo_sha256 || s.conteudo_hash}
                  </p>
                )}
              </div>
            ))
          ) : (
            <p className="nx-pet-hint">Nenhuma assinatura registrada para esta versão.</p>
          )}
        </div>
        {actions.emitir.visible && (
          <ActionButton
            className="mt-5"
            loading={busy}
            disabled={!actions.emitir.enabled}
            onClick={() =>
              onCommand({
                comando: "emitir",
                dados: { pet_id: detail.pet.id, expected_version: detail.pet.version },
              })
            }
          >
            Emitir PET com assinaturas validadas
          </ActionButton>
        )}
        <p className="nx-pet-hint mt-3">
          A emissão depende do modelo aprovado, da conferência técnica e das assinaturas exigidas.
          Rascunhos não autorizam entrada.
        </p>
      </section>
    </div>
  );
}
