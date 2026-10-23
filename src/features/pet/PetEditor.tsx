import { useId, useState, type ReactNode } from "react";
import { Plus, Trash2, UserRound, Save } from "lucide-react";
import { ActionButton } from "@/components/nexus/Page";
import type { Json } from "./schemas";
import {
  optionName,
  petSnapshotOption,
  PET_FUNCOES,
  petDate,
  petDateInput,
  petInstant,
  type PetDetalhe,
  type PetExecute,
  type PetOpcoes,
  type PetResposta,
} from "./ui-types";
import { PetStatus } from "./ExecucaoWorkspace";
import { petDangerEvidenceItem } from "./evidence-context";

export const PET_CONTROLES: { grupo: string; itens: [string, string][] }[] = [
  {
    grupo: "EPC · proteção coletiva",
    itens: [
      ["isolamento", "Isolamento com barreira física / guarda-corpo"],
      ["sinalizacao", "Sinalização de segurança: placas, fitas e cones"],
      ["lanterna", "Lanterna intrinsecamente segura"],
      ["incendio", "Proteção contra incêndio e extintores"],
      ["resgate", "Sistema de resgate e corda de segurança"],
      ["iluminacao", "Iluminação geral e escada móvel"],
      ["comunicacao", "Comunicação adequada ao ambiente / área classificada"],
      ["movimentacao_vertical", "Movimentação vertical e suportes externos"],
    ],
  },
  {
    grupo: "EPI · proteção individual",
    itens: [
      ["epi_basico", "Capacete, calçado, luvas e óculos de proteção"],
      ["quedas", "Cinturão, talabarte e trava-quedas"],
      ["respirador", "Máscara e respirador selecionados para o risco"],
      ["auditiva", "Proteção auditiva e creme de proteção"],
      ["roupa", "Roupa de proteção aplicável"],
      ["ar_trabalho", "Proteção respiratória / ar mandado para a equipe de trabalho"],
      ["ar_resgate", "Proteção respiratória / ar mandado para o resgate"],
      ["eletronicos", "Equipamentos elétricos e eletrônicos adequados à classificação do local"],
    ],
  },
];
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
type Perigo = { grupo: string; perigo: string; medida: string; evidencia: string };
type Equipe = { pessoa_id: string; funcao: string; classificacao: string; empresa: string };
export type PetDraft = {
  atividade: string;
  termino_previsto: string;
  participantes: Equipe[];
  respostas: PetResposta[];
  perigos: Perigo[];
  procedimentos: Record<string, string>;
  monitoramento_continuo: { confirmado: boolean; equipamento: string; registro: string };
  contatos_emergencia: string;
  outras_informacoes: string;
  modelo_id: string;
};
export function petDraft(detail: PetDetalhe): PetDraft {
  const c = detail.pet.conteudo || {};
  return {
    atividade: detail.pet.atividade,
    termino_previsto: petDateInput(detail.pet.termino_previsto, detail.pet.timezone),
    participantes: detail.participantes
      .filter((p) => !p.fim_vigencia && !(p as unknown as { fim?: string }).fim)
      .map((p) => ({
        pessoa_id: p.pessoa_id,
        funcao: p.funcao,
        classificacao: p.classificacao,
        empresa: p.empresa || "",
      })),
    respostas: detail.respostas.map((r) => ({ ...r })),
    perigos: (c["perigos"] as Perigo[]) || [],
    procedimentos: (c["procedimentos"] as Record<string, string>) || {},
    monitoramento_continuo: (c["monitoramento_continuo"] as PetDraft["monitoramento_continuo"]) || {
      confirmado: false,
      equipamento: "",
      registro: "",
    },
    contatos_emergencia: String(c["contatos_emergencia"] || ""),
    outras_informacoes: String(c["outras_informacoes"] || ""),
    modelo_id: String(detail.pet.modelo_versao_id || c["modelo_id"] || ""),
  };
}
export function draftPayload(draft: PetDraft, timezone = "America/Sao_Paulo") {
  return {
    atividade: draft.atividade,
    termino_previsto: petInstant(draft.termino_previsto, timezone),
    participantes: draft.participantes,
    respostas: draft.respostas.map((r) => ({
      item: r.item,
      resposta: r.resposta,
      justificativa: r.justificativa || "",
    })),
    conteudo: {
      perigos: draft.perigos,
      procedimentos: draft.procedimentos,
      monitoramento_continuo: draft.monitoramento_continuo,
      contatos_emergencia: draft.contatos_emergencia,
      outras_informacoes: draft.outras_informacoes,
      modelo_id: draft.modelo_id,
    },
  } as Record<string, Json>;
}
export function PetField({
  label,
  hint,
  error,
  children,
  wide = false,
}: {
  label: string;
  hint?: string | undefined;
  error?: string | undefined;
  children: ReactNode;
  wide?: boolean;
}) {
  return (
    <label className={`nx-pet-field${wide ? " nx-pet-wide" : ""}`}>
      <span>{label}</span>
      {children}
      {hint && <small>{hint}</small>}
      {error && (
        <span role="alert" className="nx-pet-field-error">
          {error}
        </span>
      )}
    </label>
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
}: {
  stage: number;
  draft: PetDraft;
  onChange: (draft: PetDraft) => void;
  detail: PetDetalhe;
  options: PetOpcoes;
  readOnly: boolean;
  evidences?: ((item: string) => ReactNode) | undefined;
}) {
  const [personSearch, setPersonSearch] = useState("");
  const [selectedPerson, setSelectedPerson] = useState("");
  const [funcao, setFuncao] = useState("trabalhador");
  const [classificacao, setClassificacao] = useState("interno");
  const [empresa, setEmpresa] = useState("");
  const [other, setOther] = useState("");
  const id = useId();
  const selectedModel = options.modelos.find((m) => m.id === draft.modelo_id);
  const modelProcedure = selectedModel?.["procedimento"] as Record<string, unknown> | undefined;
  const requirements = (
    Array.isArray(modelProcedure?.["itens"]) ? modelProcedure["itens"] : []
  ) as Record<string, unknown>[];
  const controlGroups = [
    ...PET_CONTROLES,
    {
      grupo: "Itens específicos do procedimento",
      itens: requirements
        .filter((r) => !PET_CONTROLES.some((g) => g.itens.some(([id]) => id === r["id"])))
        .map((r) => [String(r["id"]), String(r["rotulo"] || r["id"])] as [string, string]),
    },
  ].filter((g) => g.itens.length);

  const set = <K extends keyof PetDraft>(key: K, value: PetDraft[K]) =>
    onChange({ ...draft, [key]: value });
  const p = (key: string, value: string) =>
    set("procedimentos", { ...draft.procedimentos, [key]: value });
  const addDanger = (grupo: string, perigo: string) => {
    if (!draft.perigos.some((p) => p.grupo === grupo && p.perigo === perigo))
      set("perigos", [...draft.perigos, { grupo, perigo, medida: "", evidencia: "" }]);
  };
  if (stage === 0)
    return (
      <div className="nx-pet-panel">
        <h2>O que será realizado?</h2>
        <p className="nx-pet-subtitle mb-6">
          Confira o contexto herdado da OS. Resultados de campo e horários reais pertencem à
          ocorrência atual.
        </p>
        <div className="nx-pet-grid">
          <PetField label="Cliente" hint="Origem: cadastro vinculado à OS.">
            <input
              readOnly
              value={optionName(
                petSnapshotOption(detail, "cliente") ||
                  options.clientes.find((o) => o.id === detail.os?.cliente_id),
              )}
            />
          </PetField>
          <PetField label="Unidade" hint="Origem: unidade da OS.">
            <input
              readOnly
              value={optionName(
                petSnapshotOption(detail, "unidade") ||
                  options.unidades.find((o) => o.id === detail.pet.unidade_id),
              )}
            />
          </PetField>
          <PetField label="Espaço confinado">
            <input
              readOnly
              value={optionName(petSnapshotOption(detail, "espaco") || detail.espaco)}
            />
          </PetField>
          <PetField label="Localização">
            <input
              readOnly
              value={String(
                (petSnapshotOption(detail, "espaco") || detail.espaco)?.localizacao ||
                  "Não informada",
              )}
            />
          </PetField>
          <PetField wide label="Objetivo e descrição do trabalho">
            <textarea
              disabled={readOnly}
              required
              value={draft.atividade}
              onChange={(e) => set("atividade", e.target.value)}
              aria-invalid={!draft.atividade.trim()}
            />
          </PetField>
          <PetField
            label="Término previsto da jornada"
            hint={`Fuso da PET: ${detail.pet.timezone}. Ajuste para a jornada efetiva.`}
          >
            <input
              type="datetime-local"
              disabled={readOnly}
              required
              value={draft.termino_previsto}
              onChange={(e) => set("termino_previsto", e.target.value)}
            />
          </PetField>
          <PetField
            label="Modelo e critérios aprovados"
            hint="A liberação exige modelo aprovado pelo responsável de segurança."
          >
            <select
              disabled={readOnly}
              value={draft.modelo_id}
              onChange={(e) => set("modelo_id", e.target.value)}
            >
              <option value="">Conferir modelo da organização</option>
              {options.modelos.map((o) => (
                <option key={o.id} value={o.id}>
                  {optionName(o)} · {o.estado || (o["status"] as string) || "A conferir"}
                </option>
              ))}
            </select>
          </PetField>
        </div>
        <div className="nx-pet-notice mt-6">
          A PET é específica para este espaço, atividade e jornada. O rascunho não autoriza entrada.
          Não há emissão ou liberação offline nesta entrega.
        </div>
        {evidences && (
          <details className="nx-pet-accordion mt-5">
            <summary>Identificação do espaço · fotos e referências</summary>
            <div>{evidences("identificacao_espaco")}</div>
          </details>
        )}
      </div>
    );
  if (stage === 1)
    return (
      <div className="nx-pet-panel">
        <h2>Quem participa desta permissão?</h2>
        <p className="nx-pet-subtitle mb-5">
          Pessoa, conta Nexus e função nesta PET são vínculos distintos. Cada signatário precisa de
          identificação própria.
        </p>
        {!readOnly && (
          <div className="nx-pet-grid mb-5">
            <PetField label="Buscar pessoa cadastrada">
              <input
                type="search"
                value={personSearch}
                onChange={(e) => setPersonSearch(e.target.value)}
                placeholder="Nome da pessoa"
              />
            </PetField>
            <PetField label="Pessoa">
              <select value={selectedPerson} onChange={(e) => setSelectedPerson(e.target.value)}>
                <option value="">Selecione a pessoa</option>
                {options.pessoas
                  .filter((p) => optionName(p).toLowerCase().includes(personSearch.toLowerCase()))
                  .map((o) => (
                    <option key={o.id} value={o.id}>
                      {optionName(o)}
                    </option>
                  ))}
              </select>
            </PetField>
            <PetField label="Função nesta PET">
              <select value={funcao} onChange={(e) => setFuncao(e.target.value)}>
                {Object.entries(PET_FUNCOES).map(([v, l]) => (
                  <option key={v} value={v}>
                    {l}
                  </option>
                ))}
              </select>
            </PetField>
            <PetField label="Classificação">
              <select value={classificacao} onChange={(e) => setClassificacao(e.target.value)}>
                <option value="interno">Colaborador interno</option>
                <option value="terceirizado">Colaborador terceirizado</option>
              </select>
            </PetField>
            {classificacao === "terceirizado" && (
              <PetField label="Empresa de vínculo">
                <input value={empresa} onChange={(e) => setEmpresa(e.target.value)} />
              </PetField>
            )}
            <div className="flex items-end">
              <ActionButton
                variant="ghost"
                disabled={!selectedPerson || (classificacao === "terceirizado" && !empresa.trim())}
                onClick={() => {
                  if (
                    draft.participantes.some(
                      (p) => p.pessoa_id === selectedPerson && p.funcao === funcao,
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
                <Plus size={15} aria-hidden className="mr-2 inline" /> Adicionar à equipe
              </ActionButton>
            </div>
          </div>
        )}
        <div className="nx-pet-list">
          {draft.participantes.length ? (
            draft.participantes.map((p, index) => (
              <div className="nx-pet-card" key={`${p.pessoa_id}:${p.funcao}`}>
                <div className="nx-pet-card-top">
                  <div>
                    <p className="nx-pet-card-title">
                      <UserRound size={14} aria-hidden className="mr-2 inline" />
                      {optionName(options.pessoas.find((o) => o.id === p.pessoa_id))}
                    </p>
                    <p className="nx-pet-subtitle">
                      {PET_FUNCOES[p.funcao] || p.funcao} ·{" "}
                      {p.classificacao === "interno" ? "Interno" : `Terceirizado · ${p.empresa}`}
                    </p>
                  </div>
                  {!readOnly && (
                    <ActionButton
                      variant="ghost"
                      aria-label={`Remover ${optionName(options.pessoas.find((o) => o.id === p.pessoa_id))} da equipe do rascunho`}
                      onClick={() =>
                        set(
                          "participantes",
                          draft.participantes.filter((_, i) => i !== index),
                        )
                      }
                    >
                      <Trash2 size={15} aria-hidden />
                    </ActionButton>
                  )}
                </div>
              </div>
            ))
          ) : (
            <p className="nx-pet-notice">
              Inclua supervisor, vigia, trabalhadores autorizados e equipe de resgate.
            </p>
          )}
        </div>
        {detail.participantes.some((p) => p.fim) && (
          <details className="nx-pet-accordion my-5">
            <summary>Histórico de funções e vigências anteriores</summary>
            <div className="nx-pet-table-scroll">
              <table className="nx-pet-table">
                <thead>
                  <tr>
                    <th>Pessoa</th>
                    <th>Função</th>
                    <th>Início</th>
                    <th>Término</th>
                  </tr>
                </thead>
                <tbody>
                  {detail.participantes
                    .filter((p) => p.fim)
                    .map((p) => (
                      <tr key={p.id}>
                        <td>{p.nome_snapshot || p.nome}</td>
                        <td>{PET_FUNCOES[p.funcao]}</td>
                        <td>{petDate(p.inicio, detail.pet.timezone)}</td>
                        <td>{petDate(p.fim, detail.pet.timezone)}</td>
                      </tr>
                    ))}
                </tbody>
              </table>
            </div>
          </details>
        )}
        <PetField
          label="Contatos operacionais, emergência e resgate"
          hint="Informe os canais reais previstos no procedimento. O aplicativo não aciona o resgate automaticamente."
        >
          <textarea
            disabled={readOnly}
            className="mt-4"
            value={draft.contatos_emergencia}
            onChange={(e) => set("contatos_emergencia", e.target.value)}
          />
        </PetField>
      </div>
    );
  if (stage === 2)
    return (
      <div className="space-y-5">
        <section className="nx-pet-panel">
          <h2>Perigos e medidas preventivas</h2>
          <p className="nx-pet-subtitle mb-5">
            Selecione os perigos observados e descreva os controles deste trabalho.
          </p>
          {Object.entries(PERIGOS).map(([grupo, itens]) => (
            <details className="nx-pet-accordion" key={grupo}>
              <summary>
                {grupo} · {draft.perigos.filter((p) => p.grupo === grupo).length} selecionado(s)
              </summary>
              <div>
                <div className="nx-pet-answer">
                  {itens.map((item) => (
                    <label key={item}>
                      <input
                        type="checkbox"
                        disabled={readOnly}
                        checked={draft.perigos.some((p) => p.grupo === grupo && p.perigo === item)}
                        onChange={(e) =>
                          e.target.checked
                            ? addDanger(grupo, item)
                            : set(
                                "perigos",
                                draft.perigos.filter(
                                  (p) => !(p.grupo === grupo && p.perigo === item),
                                ),
                              )
                        }
                      />
                      {item}
                    </label>
                  ))}
                </div>
                <div className="nx-pet-actions mt-4">
                  <input
                    className="min-h-11 rounded border border-input bg-background p-2 text-sm"
                    aria-label={`Complemento de ${grupo}`}
                    disabled={readOnly}
                    value={other}
                    placeholder="Outro perigo identificado"
                    onChange={(e) => setOther(e.target.value)}
                  />
                  <ActionButton
                    variant="ghost"
                    disabled={readOnly || !other.trim()}
                    onClick={() => {
                      addDanger(grupo, other.trim());
                      setOther("");
                    }}
                  >
                    Adicionar perigo
                  </ActionButton>
                </div>
              </div>
            </details>
          ))}
          {draft.perigos.map((perigo, index) => (
            <div className="nx-pet-check" key={`${perigo.grupo}:${perigo.perigo}`}>
              <div>
                <p className="nx-pet-hint">{perigo.grupo}</p>
                <h3>{perigo.perigo}</h3>
              </div>
              <PetField label="Medida preventiva">
                <textarea
                  disabled={readOnly}
                  value={perigo.medida}
                  onChange={(e) =>
                    set(
                      "perigos",
                      draft.perigos.map((p, i) =>
                        i === index ? { ...p, medida: e.target.value } : p,
                      ),
                    )
                  }
                />
              </PetField>
              <PetField label="Referência ou observação da evidência">
                <input
                  disabled={readOnly}
                  value={perigo.evidencia}
                  onChange={(e) =>
                    set(
                      "perigos",
                      draft.perigos.map((p, i) =>
                        i === index ? { ...p, evidencia: e.target.value } : p,
                      ),
                    )
                  }
                />
              </PetField>
              {evidences && (
                <details className="nx-pet-accordion">
                  <summary>Fotos e evidências deste perigo</summary>
                  <div>{evidences(petDangerEvidenceItem(perigo.grupo, perigo.perigo))}</div>
                </details>
              )}
            </div>
          ))}
        </section>
        <section className="nx-pet-panel">
          <h2>Proteções coletivas e individuais</h2>
          <p className="nx-pet-subtitle mb-4">
            Responda cada item. “Ainda não verificado” mantém uma pendência. A aplicabilidade
            depende do procedimento aprovado.
          </p>
          {controlGroups.map((group) => (
            <details className="nx-pet-accordion" key={group.grupo} open>
              <summary>{group.grupo}</summary>
              <div className="nx-pet-checklist">
                {group.itens.map(([item, label]) => {
                  const answer = draft.respostas.find((r) => r.item === item);
                  const rule = requirements.find((r) => r["id"] === item);
                  const naInvalid =
                    answer?.resposta === "nao_aplicavel" &&
                    rule &&
                    (rule["permite_na"] !== true ||
                      (rule["justificativa_na"] !== false &&
                        (answer.justificativa || "").trim().length < 5));
                  return (
                    <div className="nx-pet-check" key={item}>
                      <h3>
                        {label}
                        {rule?.["obrigatorio"] === true ? " · obrigatório" : ""}
                      </h3>
                      <div className="nx-pet-answer" role="radiogroup" aria-label={label}>
                        {(
                          [
                            ["sim", "Sim"],
                            ["nao", "Não"],
                            ["nao_aplicavel", "Não se aplica"],
                            ["nao_verificado", "Ainda não verificado"],
                          ] as const
                        ).map(([value, text]) => (
                          <label key={value}>
                            <input
                              type="radio"
                              name={`${id}-${item}`}
                              disabled={
                                readOnly ||
                                (value === "nao_aplicavel" && !!rule && rule["permite_na"] !== true)
                              }
                              checked={(answer?.resposta || "nao_verificado") === value}
                              onChange={() =>
                                set("respostas", [
                                  ...draft.respostas.filter((r) => r.item !== item),
                                  {
                                    item,
                                    resposta: value,
                                    justificativa: answer?.justificativa || "",
                                  },
                                ])
                              }
                            />
                            {text}
                          </label>
                        ))}
                      </div>
                      <PetField
                        label="Justificativa / verificação"
                        error={
                          naInvalid
                            ? "Confira a previsão de não aplicabilidade e justifique com pelo menos 5 caracteres."
                            : undefined
                        }
                        hint={
                          answer?.resposta === "nao_aplicavel"
                            ? "Justifique a não aplicabilidade; o procedimento decide se ela é permitida."
                            : undefined
                        }
                      >
                        <input
                          disabled={readOnly}
                          value={answer?.justificativa || ""}
                          onChange={(e) =>
                            set("respostas", [
                              ...draft.respostas.filter((r) => r.item !== item),
                              {
                                item,
                                resposta: answer?.resposta || "nao_verificado",
                                justificativa: e.target.value,
                              },
                            ])
                          }
                        />
                      </PetField>
                      {evidences && (
                        <details className="nx-pet-accordion">
                          <summary>Anexar evidência de {label.toLowerCase()}</summary>
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
      <div className="nx-pet-panel">
        <h2>Procedimentos e monitoramento</h2>
        <p className="nx-pet-subtitle mb-6">
          Registre as condições verificadas nesta ocorrência. Leituras avulsas não comprovam
          monitoramento atmosférico contínuo.
        </p>
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
              [
                "dispositivo_verificacao",
                "Verificação do dispositivo, grau de proteção e classificação do local",
              ],
            ] as const
          ).map(([key, label]) => (
            <PetField key={key} label={label}>
              <textarea
                disabled={readOnly}
                value={draft.procedimentos[key] || ""}
                onChange={(e) => p(key, e.target.value)}
              />
            </PetField>
          ))}
          <PetField
            label="Dispositivo adequado ao ambiente de uso"
            hint="Inclui grau de proteção e, quando aplicável, certificação para a área classificada."
          >
            <select
              disabled={readOnly}
              value={draft.procedimentos["dispositivo_adequado"] || "nao_verificado"}
              onChange={(e) => p("dispositivo_adequado", e.target.value)}
            >
              <option value="nao_verificado">Ainda não verificado</option>
              <option value="sim">Sim · adequação conferida</option>
              <option value="nao">Não · uso impedido</option>
            </select>
          </PetField>
          <PetField
            label="Duração da ventilação (min)"
            hint="Tempo verificado na ocorrência atual."
          >
            <input
              disabled={readOnly}
              inputMode="decimal"
              value={draft.procedimentos["ventilacao_minutos"] || ""}
              onChange={(e) => p("ventilacao_minutos", e.target.value)}
            />
          </PetField>
        </div>
        <div className="nx-pet-notice mt-5">
          <h3>Monitoramento atmosférico contínuo</h3>
          <p className="nx-pet-subtitle">
            Confirme o equipamento adequado com leitura direta e alarmes, o procedimento e os
            registros que sustentam a continuidade.
          </p>
          <label className="flex min-h-12 items-center gap-3 text-sm">
            <input
              type="checkbox"
              disabled={readOnly}
              checked={draft.monitoramento_continuo.confirmado}
              onChange={(e) =>
                set("monitoramento_continuo", {
                  ...draft.monitoramento_continuo,
                  confirmado: e.target.checked,
                })
              }
            />{" "}
            Verificação de campo registrada conforme procedimento
          </label>
          <div className="nx-pet-grid mt-3">
            <PetField label="Equipamento e identificação">
              <input
                disabled={readOnly}
                value={draft.monitoramento_continuo.equipamento}
                onChange={(e) =>
                  set("monitoramento_continuo", {
                    ...draft.monitoramento_continuo,
                    equipamento: e.target.value,
                  })
                }
              />
            </PetField>
            <PetField label="Procedimento e referência do registro contínuo">
              <textarea
                disabled={readOnly}
                value={draft.monitoramento_continuo.registro}
                onChange={(e) =>
                  set("monitoramento_continuo", {
                    ...draft.monitoramento_continuo,
                    registro: e.target.value,
                  })
                }
              />
            </PetField>
          </div>
        </div>
        {evidences && (
          <details className="nx-pet-accordion mt-5">
            <summary>Instrumentos, bloqueios e procedimentos · evidências</summary>
            <div>{evidences("atmosfera_procedimentos")}</div>
          </details>
        )}
      </div>
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
  onPending: (stage: number) => void;
}) {
  return (
    <div className="space-y-5">
      <section className="nx-pet-panel">
        <div className="nx-pet-section-top">
          <div>
            <h2>Conferência antes da liberação</h2>
            <p className="nx-pet-subtitle">
              A conferência é reavaliada pelo servidor. Conteúdo coberto por assinatura é preservado
              em versão própria.
            </p>
          </div>
          <PetStatus value={detail.pet.estado_documental} />
        </div>
        {detail.pendencias?.length ? (
          <div className="nx-pet-notice" data-tone="attention">
            <h3>Pendências para revisar</h3>
            <ul className="mt-3 space-y-1">
              {detail.pendencias.map((p, i) => {
                const text =
                  typeof p === "string"
                    ? p
                    : p.mensagem || p.descricao || p.codigo || "Revisão necessária";
                const campo = typeof p === "string" ? p : p.campo || "";
                const code = typeof p === "string" ? "" : p.codigo || "";
                const stage =
                  /equipe|participantes|supervisor|vigia|trabalhador|contatos_emergencia/.test(
                    campo,
                  )
                    ? 1
                    : /assinatura|integracao/.test(campo + code)
                      ? 4
                      : /atmosfera|leitura|avalia|monitoramento|procedimento/.test(campo)
                        ? 3
                        : /resposta|controle|perigo|evidencia|na_invalido/.test(campo + code) ||
                            PET_CONTROLES.some((g) => g.itens.some(([id]) => id === campo))
                          ? 2
                          : 0;
                return (
                  <li key={i}>
                    <button
                      type="button"
                      className="min-h-11 text-left text-sm underline underline-offset-4"
                      onClick={() => onPending(stage)}
                    >
                      {text}
                    </button>
                  </li>
                );
              })}
            </ul>
          </div>
        ) : (
          <p className="nx-pet-notice">
            Não há pendências retornadas nesta consulta. Execute a conferência técnica para
            revalidar o conteúdo atual.
          </p>
        )}
        <div className="nx-pet-actions mt-5">
          <ActionButton
            loading={busy}
            disabled={!detail.permissoes["conferir"]}
            onClick={() =>
              onCommand({
                comando: "conferir",
                dados: { pet_id: detail.pet.id, expected_version: detail.pet.version },
              })
            }
          >
            <Save size={15} aria-hidden className="mr-2 inline" /> Conferir versão no servidor
          </ActionButton>
        </div>
      </section>
      <section className="nx-pet-panel">
        <h2>Assinaturas e responsabilidade</h2>
        <p className="nx-pet-subtitle mb-4">
          Assinatura na tela e aceite autenticado são métodos distintos da assinatura certificada. O
          login do supervisor não substitui a identidade de outro signatário.
        </p>
        {!options.integracao_assinatura.configurada && (
          <div className="nx-pet-notice" data-tone="attention">
            <strong>Integração não configurada</strong>
            <p className="mt-1">
              O provedor de assinatura ICP-Brasil não está disponível neste ambiente. Emissão e
              liberação permanecem bloqueadas. Nenhum aceite é apresentado como certificado
              validado.
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
                  {petDate(s.assinada_em || s.criada_em || s.created_at)}
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
        <ActionButton
          className="mt-5"
          loading={busy}
          disabled={!options.integracao_assinatura.configurada || !detail.permissoes["emitir"]}
          onClick={() =>
            onCommand({
              comando: "emitir",
              dados: { pet_id: detail.pet.id, expected_version: detail.pet.version },
            })
          }
        >
          Emitir PET com assinaturas validadas
        </ActionButton>
        <p className="nx-pet-hint mt-3">
          Novas emissões dependem do modelo aprovado, da conferência técnica e das assinaturas
          exigidas. Rascunhos não autorizam entrada.
        </p>
      </section>
    </div>
  );
}
