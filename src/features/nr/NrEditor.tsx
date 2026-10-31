import { useEffect, useRef, useState, type FormEvent } from "react";
import * as Dialog from "@radix-ui/react-dialog";
import { useQuery } from "@tanstack/react-query";
import { useServerFn } from "@tanstack/react-start";
import { useBlocker } from "@tanstack/react-router";
import { ArrowDown, ArrowUp, Plus, Trash2, X } from "lucide-react";
import { ActionButton, ErrorState } from "@/components/nexus/Page";
import { petOpcoes } from "@/features/pet/pet.functions";
import { buscarOpcoesLevantamento } from "@/features/levantamentos/levantamentos.functions";
import { useCommandKey } from "@/features/operacao/components";
import { nrConsultar, nrExecutar } from "./nr.functions";
import { nrDocumentoDeModelo } from "./document-models.functions";
import { NrDocumentModelSelector, type NrDocumentModelSelection } from "./NrDocumentModelSelector";
import type { Norma, NrContexto, NrJson, NrRecord, NrRecurso } from "./domain";
import { NrContentEditor } from "./NrContentEditor";
import { parseNative, type NativeContent } from "./native-content";
import { resourceLabels } from "./ui-labels";
import { NrSurveyEditor } from "./NrSurveyEditor";
import { NrLocalTechnicalEditor } from "./NrLocalTechnicalEditor";
import { NrSurveyValue } from "./NrSurveyFields";
import { NrFilesPanel, type NrSelectableFile } from "./NrFilesPanel";
import { nrLabel } from "./technical-display";
import {
  normalizeSurveyBlocks,
  projectSurvey,
  surveyObject,
  type SurveyFieldDefinition as TemplateField,
  type SurveyBlockDefinition as TemplateBlock,
} from "./survey-projection";

const object = (v: unknown): Record<string, unknown> =>
  v !== null && typeof v === "object" && !Array.isArray(v) ? (v as Record<string, unknown>) : {};
const text = (v: unknown) => (typeof v === "string" ? v : "");
const blockNames = [
  "Identificação",
  "Enquadramento",
  "Acessos",
  "Fotos",
  "Sinalização",
  "Atividades e riscos",
  "Geometria",
  "Ventilação",
  "Aeração fixa",
  "Requisitos e EPI",
  "Resgate e movimentação",
  "Emergência",
  "Energias e bloqueio",
  "Adequações",
  "Histórico",
  "Ancoragens, linhas de vida e laudos",
];
export function NrPicker({
  org,
  norma,
  recurso,
  value,
  onChange,
  clienteId,
  unidadeId,
  exclude,
  label,
  required,
  tipo,
}: {
  org: string;
  norma: Norma;
  recurso: NrRecurso;
  value: string;
  onChange: (id: string) => void;
  clienteId?: string | undefined;
  unidadeId?: string | undefined;
  exclude?: string | undefined;
  label: string;
  required?: boolean;
  tipo?: string | undefined;
}) {
  const consult = useServerFn(nrConsultar);
  const [search, setSearch] = useState("");
  const [term, setTerm] = useState("");
  useEffect(() => {
    const timer = setTimeout(() => setTerm(search), 250);
    return () => clearTimeout(timer);
  }, [search]);
  const query = useQuery({
    queryKey: ["nr", org, norma, "opcoes", recurso, clienteId, unidadeId, tipo, term],
    enabled: !!org,
    queryFn: ({ signal }) =>
      consult({
        data: {
          organization_id: org,
          norma,
          recurso,
          operacao: "listar",
          cliente_id: clienteId || undefined,
          unidade_id: unidadeId || undefined,
          busca: term,
          tipo,
          pagina: 0,
          limite: 25,
        },
        signal,
      }),
    retry: false,
  });
  const rows = (query.data as { rows?: NrRecord[] } | undefined)?.rows ?? [];
  const selected = useQuery({
    queryKey: ["nr", org, norma, "opcao-selecionada", recurso, value],
    enabled: !!org && !!value && !rows.some((option) => option.id === value),
    queryFn: ({ signal }) =>
      consult({
        data: { organization_id: org, norma, recurso, operacao: "detalhe", id: value },
        signal,
      }),
    retry: false,
  });
  const selectedRow =
    selected.data &&
    (("registro" in selected.data ? selected.data["registro"] : selected.data) as
      NrRecord | undefined);

  return (
    <div className="nr-picker">
      <label>
        Buscar {label.toLowerCase()}
        <input
          type="search"
          value={search}
          maxLength={120}
          onChange={(e) => {
            e.stopPropagation();
            setSearch(e.target.value);
          }}
          placeholder={`TAG ou nome de ${label.toLowerCase()}`}
        />
      </label>
      <label>
        {label}
        {required ? " *" : ""}
        <select value={value} required={required} onChange={(e) => onChange(e.target.value)}>
          <option value="">{required ? "Selecione" : "Sem vínculo"}</option>
          {value && !rows.some((r) => r.id === value) && (
            <option value={value}>
              {selectedRow
                ? `${selectedRow.tag ? `${selectedRow.tag} · ` : ""}${selectedRow.titulo}`
                : selected.isFetching
                  ? "Carregando vínculo atual…"
                  : "Vínculo atual indisponível neste recorte"}
            </option>
          )}
          {rows
            .filter((r) => r.id !== exclude)
            .map((r) => (
              <option key={r.id} value={r.id}>
                {r.tag ? `${r.tag} · ` : ""}
                {r.titulo}
              </option>
            ))}
        </select>
      </label>
      {query.isError && (
        <p role="alert" className="nr-feedback">
          {query.error.message}
        </p>
      )}
      {query.isFetching && (
        <p role="status" className="nr-muted">
          Consultando opções…
        </p>
      )}
    </div>
  );
}
function TemplateEditor({
  blocks,
  onChange,
}: {
  blocks: TemplateBlock[];
  onChange: (blocks: TemplateBlock[]) => void;
}) {
  const patch = (id: string, value: Partial<TemplateBlock>) =>
    onChange(blocks.map((b) => (b.id === id ? { ...b, ...value } : b)));
  const patchCondition = (block: TemplateBlock, key: "familias" | "tipos_local", input: string) => {
    const condition = { ...block.aplica_se };
    const values = input
      .split("\n")
      .map((value) => value.trim())
      .filter(Boolean);
    if (values.length) condition[key] = values;
    else delete condition[key];
    patch(block.id, { aplica_se: condition });
  };
  return (
    <div className="nr-block-library">
      <p className="nr-muted">
        A versão do modelo permanece registrada no levantamento. Configure campos e condições com
        base nas referências aprovadas.
      </p>
      {blocks.map((block, index) => (
        <details key={block.id} open={blocks.length < 3}>
          <summary>
            {block.codigo} — {block.titulo || "Bloco sem título"}{" "}
            <span className="nr-muted">{block.campos.length} campos</span>
          </summary>
          <div className="nr-field-grid">
            <label>
              Código
              <input
                value={block.codigo}
                maxLength={30}
                required
                onChange={(e) => patch(block.id, { codigo: e.target.value })}
              />
            </label>
            <label>
              Título
              <input
                value={block.titulo}
                maxLength={200}
                required
                onChange={(e) => patch(block.id, { titulo: e.target.value })}
              />
            </label>
            <label className="nr-wide">
              Aplicabilidade e condições
              <textarea
                value={
                  Array.isArray(block.aplicabilidade)
                    ? block.aplicabilidade.join("\n")
                    : (block.aplicabilidade ?? "")
                }
                rows={2}
                maxLength={2000}
                onChange={(e) => patch(block.id, { aplicabilidade: e.target.value })}
              />
            </label>
            <label>
              Famílias às quais o bloco se aplica, uma por linha
              <textarea
                rows={3}
                value={(block.aplica_se?.familias ?? []).join("\n")}
                onChange={(e) => patchCondition(block, "familias", e.target.value)}
              />
              <small className="nr-muted">
                Use os valores cadastrados no local. Vazio conserva o bloco sem esta restrição.
              </small>
            </label>
            <label>
              Tipos de local aos quais o bloco se aplica, um por linha
              <textarea
                rows={3}
                value={(block.aplica_se?.tipos_local ?? []).join("\n")}
                onChange={(e) => patchCondition(block, "tipos_local", e.target.value)}
              />
              <small className="nr-muted">
                A aplicabilidade é conferida pelo servidor antes do envio à revisão.
              </small>
            </label>
          </div>
          {block.campos.map((field, fi) => (
            <div className="nr-panel" key={field.id}>
              <div className="nr-field-grid">
                <label>
                  Nome do campo *
                  <input
                    value={field.nome}
                    maxLength={200}
                    required
                    onChange={(e) =>
                      patch(block.id, {
                        campos: block.campos.map((f) =>
                          f.id === field.id ? { ...f, nome: e.target.value } : f,
                        ),
                      })
                    }
                  />
                </label>
                <label>
                  Tipo
                  <select
                    value={field.tipo}
                    onChange={(e) =>
                      patch(block.id, {
                        campos: block.campos.map((f) =>
                          f.id === field.id
                            ? {
                                ...f,
                                tipo: e.target.value as TemplateField["tipo"],
                                tipo_origem: e.target.value,
                              }
                            : f,
                        ),
                      })
                    }
                  >
                    <option value="texto">Texto</option>
                    {field.tipo === "nao_suportado" && (
                      <option value="nao_suportado">Tipo histórico sem editor compatível</option>
                    )}
                    <option value="texto_longo">Texto longo</option>
                    <option value="lista">Lista estruturada</option>
                    <option value="foto">Foto / referência</option>
                    <option value="numero">Número</option>
                    <option value="data">Data</option>
                    <option value="selecao">Seleção</option>
                    <option value="multipla">Múltipla escolha</option>
                    <option value="checklist">Matriz de avaliações</option>
                    <option value="calculado">Valor calculado preservado</option>
                  </select>
                </label>
                <label>
                  Unidade de medida
                  <input
                    value={field.unidade ?? ""}
                    maxLength={40}
                    placeholder="m, m³, m³/h…"
                    onChange={(event) =>
                      patch(block.id, {
                        campos: block.campos.map((current) =>
                          current.id === field.id
                            ? { ...current, unidade: event.target.value }
                            : current,
                        ),
                      })
                    }
                  />
                </label>
                <label>
                  Ajuda para preenchimento
                  <input
                    value={field.ajuda ?? ""}
                    maxLength={2000}
                    onChange={(event) =>
                      patch(block.id, {
                        campos: block.campos.map((current) =>
                          current.id === field.id
                            ? { ...current, ajuda: event.target.value }
                            : current,
                        ),
                      })
                    }
                  />
                </label>
                <label>
                  Exibir conforme resposta de
                  <select
                    value={field.mostrar_se?.campo ?? ""}
                    onChange={(event) =>
                      patch(block.id, {
                        campos: block.campos.map((current) => {
                          if (current.id !== field.id) return current;
                          if (event.target.value)
                            return {
                              ...current,
                              mostrar_se: {
                                campo: event.target.value,
                                valor: field.mostrar_se?.valor ?? [],
                              },
                            };
                          const { mostrar_se: _condition, ...unconditional } = current;
                          return unconditional;
                        }),
                      })
                    }
                  >
                    <option value="">Sempre exibir</option>
                    {block.campos
                      .filter((candidate) => candidate.id !== field.id)
                      .map((candidate) => (
                        <option key={candidate.id} value={candidate.id}>
                          {candidate.nome}
                        </option>
                      ))}
                  </select>
                </label>
                {field.mostrar_se?.campo && (
                  <label>
                    Respostas que exibem este campo, uma por linha
                    <textarea
                      rows={2}
                      value={(field.mostrar_se.valor ?? []).map(String).join("\n")}
                      onChange={(event) =>
                        patch(block.id, {
                          campos: block.campos.map((current) =>
                            current.id === field.id
                              ? {
                                  ...current,
                                  mostrar_se: {
                                    ...current.mostrar_se,
                                    valor: event.target.value.split("\n").filter(Boolean),
                                  },
                                }
                              : current,
                          ),
                        })
                      }
                    />
                  </label>
                )}
                {(field.tipo === "selecao" || field.tipo === "multipla") && (
                  <label className="nr-wide">
                    Opções, uma por linha
                    <textarea
                      value={(field.opcoes ?? []).join("\n")}
                      rows={3}
                      onChange={(e) =>
                        patch(block.id, {
                          campos: block.campos.map((f) =>
                            f.id === field.id
                              ? { ...f, opcoes: e.target.value.split("\n").filter(Boolean) }
                              : f,
                          ),
                        })
                      }
                    />
                  </label>
                )}
              </div>
              {field.tipo === "lista" && (
                <TemplateSubfields
                  fields={field.subcampos ?? []}
                  onChange={(subcampos) =>
                    patch(block.id, {
                      campos: block.campos.map((current) =>
                        current.id === field.id ? { ...current, subcampos } : current,
                      ),
                    })
                  }
                />
              )}
              <div className="nr-actions mt-3">
                <label className="nr-checks">
                  <input
                    type="checkbox"
                    checked={field.obrigatorio}
                    onChange={(e) =>
                      patch(block.id, {
                        campos: block.campos.map((f) =>
                          f.id === field.id ? { ...f, obrigatorio: e.target.checked } : f,
                        ),
                      })
                    }
                  />{" "}
                  Obrigatório na revisão
                </label>
                <ActionButton
                  variant="ghost"
                  disabled={fi === 0}
                  onClick={() => {
                    const f = [...block.campos];
                    const current = f[fi],
                      previous = f[fi - 1];
                    if (!current || !previous) return;
                    f[fi - 1] = current;
                    f[fi] = previous;
                    patch(block.id, { campos: f });
                  }}
                >
                  <ArrowUp size={15} />
                  Campo
                </ActionButton>
                <ActionButton
                  variant="ghost"
                  onClick={() =>
                    patch(block.id, { campos: block.campos.filter((f) => f.id !== field.id) })
                  }
                >
                  <Trash2 size={15} />
                  Remover campo
                </ActionButton>
              </div>
            </div>
          ))}
          <div className="nr-actions mt-3">
            <ActionButton
              variant="ghost"
              onClick={() =>
                patch(block.id, {
                  campos: [
                    ...block.campos,
                    { id: crypto.randomUUID(), nome: "", tipo: "texto", obrigatorio: false },
                  ],
                })
              }
            >
              <Plus size={15} />
              Adicionar campo
            </ActionButton>
            <ActionButton
              variant="ghost"
              disabled={index === 0}
              onClick={() => {
                const b = [...blocks];
                const current = b[index],
                  previous = b[index - 1];
                if (!current || !previous) return;
                b[index - 1] = current;
                b[index] = previous;
                onChange(b);
              }}
            >
              <ArrowUp size={15} />
              Bloco
            </ActionButton>
            <ActionButton
              variant="ghost"
              disabled={index === blocks.length - 1}
              onClick={() => {
                const b = [...blocks];
                const current = b[index],
                  next = b[index + 1];
                if (!current || !next) return;
                b[index + 1] = current;
                b[index] = next;
                onChange(b);
              }}
            >
              <ArrowDown size={15} />
              Bloco
            </ActionButton>
            <ActionButton
              variant="danger"
              onClick={() => onChange(blocks.filter((b) => b.id !== block.id))}
            >
              Remover bloco
            </ActionButton>
          </div>
        </details>
      ))}
      <div className="nr-actions">
        <ActionButton
          variant="ghost"
          onClick={() =>
            onChange([
              ...blocks,
              {
                id: crypto.randomUUID(),
                codigo: `B${String(blocks.length + 1).padStart(2, "0")}`,
                titulo: "",
                campos: [],
              },
            ])
          }
        >
          <Plus size={15} />
          Novo bloco
        </ActionButton>
        {!blocks.length && (
          <ActionButton
            variant="ghost"
            onClick={() =>
              onChange(
                blockNames.map((titulo, index) => ({
                  id: crypto.randomUUID(),
                  codigo: `B${String(index + 1).padStart(2, "0")}`,
                  titulo,
                  campos: [],
                })),
              )
            }
          >
            Usar estrutura dos 16 blocos
          </ActionButton>
        )}
      </div>
    </div>
  );
}

function TemplateSubfields({
  fields,
  onChange,
}: {
  fields: TemplateField[];
  onChange: (fields: TemplateField[]) => void;
}) {
  const patch = (id: string, values: Partial<TemplateField>) =>
    onChange(fields.map((field) => (field.id === id ? { ...field, ...values } : field)));
  return (
    <fieldset className="nr-survey-field mt-3">
      <legend>Campos de cada registro da lista</legend>
      {fields.map((field, index) => (
        <div className="nr-survey-row" key={field.id}>
          <div className="nr-field-grid">
            <label>
              Nome do subcampo
              <input
                required
                maxLength={200}
                value={field.nome}
                onChange={(event) => patch(field.id, { nome: event.target.value })}
              />
            </label>
            <label>
              Tipo
              <select
                value={field.tipo}
                onChange={(event) =>
                  patch(field.id, {
                    tipo: event.target.value as TemplateField["tipo"],
                    tipo_origem: event.target.value,
                  })
                }
              >
                <option value="texto">Texto</option>
                <option value="texto_longo">Texto longo</option>
                <option value="numero">Número</option>
                <option value="selecao">Seleção</option>
                <option value="data">Data</option>
                <option value="foto">Foto</option>
              </select>
            </label>
            {field.tipo === "selecao" && (
              <label className="nr-wide">
                Opções, uma por linha
                <textarea
                  rows={2}
                  value={(field.opcoes ?? []).join("\n")}
                  onChange={(event) =>
                    patch(field.id, { opcoes: event.target.value.split("\n").filter(Boolean) })
                  }
                />
              </label>
            )}
          </div>
          <div className="nr-actions mt-2">
            <ActionButton
              variant="ghost"
              disabled={index === 0}
              onClick={() => {
                const reordered = [...fields];
                const before = reordered[index - 1];
                if (!before) return;
                reordered[index - 1] = field;
                reordered[index] = before;
                onChange(reordered);
              }}
            >
              <ArrowUp size={15} />
              Subcampo
            </ActionButton>
            <ActionButton
              variant="ghost"
              onClick={() => onChange(fields.filter((current) => current.id !== field.id))}
            >
              <Trash2 size={15} />
              Remover subcampo
            </ActionButton>
          </div>
        </div>
      ))}
      <ActionButton
        variant="ghost"
        onClick={() =>
          onChange([
            ...fields,
            { id: crypto.randomUUID(), nome: "", tipo: "texto", obrigatorio: false },
          ])
        }
      >
        <Plus size={15} />
        Adicionar subcampo
      </ActionButton>
    </fieldset>
  );
}
const human = nrLabel;

export function NrEditor({
  org,
  norma,
  recurso,
  row,
  contexto,
  clienteId,
  unidadeId,
  onClose,
  onSaved,
  returnFocus,
  duplicating = false,
}: {
  org: string;
  norma: Norma;
  recurso: NrRecurso;
  row: NrRecord | null;
  contexto: NrContexto;
  clienteId: string;
  unidadeId: string;
  onClose: () => void;
  onSaved: (row: NrRecord) => void;
  returnFocus?: HTMLElement | null | undefined;
  duplicating?: boolean;
}) {
  const previousFocus = useRef<HTMLElement | null>(
    typeof document !== "undefined" && document.activeElement instanceof HTMLElement
      ? document.activeElement
      : null,
  );
  const [values, setValues] = useState<Record<string, string>>(() =>
    Object.fromEntries(
      [
        "titulo",
        "descricao",
        "tag",
        "tipo",
        "familia",
        "parent_id",
        "local_id",
        "pasta_id",
        "modelo_id",
        "documento_id",
        "responsavel_id",
        "pet_espaco_id",
        "criticidade",
        "prazo",
        "tratativa",
        "estado_origem",
        "recebimento",
        "origem_url",
      ].map((key) => [key, text(row ? Reflect.get(row, key) : undefined)]),
    ),
  );
  const [clientId, setClientId] = useState(row ? (row.cliente_id ?? "") : clienteId);
  const [unitId, setUnitId] = useState(row ? (row.unidade_id ?? "") : unidadeId);
  const [normas, setNormas] = useState<Norma[]>(row?.normas ?? [norma]);
  const [data, setData] = useState<Record<string, unknown>>(row?.dados ?? {});
  const [aliases, setAliases] = useState(
    (row && Array.isArray(Reflect.get(row, "aliases"))
      ? (Reflect.get(row, "aliases") as string[])
      : []
    ).join("\n"),
  );
  const originalNative = parseNative(row?.conteudo);
  const unsupportedContent =
    !!row?.conteudo && !originalNative && JSON.stringify(row.conteudo) !== "{}";
  const [content, setContent] = useState<NativeContent>(
    originalNative ?? { schema_version: 1, blocos: [] },
  );
  const [fromModel, setFromModel] = useState(false);
  const [documentModel, setDocumentModel] = useState<NrDocumentModelSelection | null>(null);
  const [acceptModelDraft, setAcceptModelDraft] = useState(false);
  const [blocks, setBlocks] = useState<TemplateBlock[]>(normalizeSurveyBlocks(row?.dados));
  const [answers, setAnswers] = useState<Record<string, unknown>>(object(row?.respostas));
  const [attachmentTarget, setAttachmentTarget] = useState<{
    token: string;
    capturedState: string;
    field: TemplateField;
    value: unknown;
    apply: (value: unknown) => void;
  } | null>(null);
  const attachmentTargetRef = useRef(attachmentTarget);
  attachmentTargetRef.current = attachmentTarget;
  const evidenceStateRef = useRef("");
  evidenceStateRef.current = JSON.stringify({
    answers,
    clientId,
    unitId,
    localId: values["local_id"],
    modelId: values["modelo_id"],
  });
  useEffect(
    () => () => {
      attachmentTargetRef.current = null;
    },
    [],
  );
  const contentElement = useRef<HTMLDivElement>(null);
  const [dirty, setDirty] = useState(false);
  const [discard, setDiscard] = useState(false);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<Error | null>(null);
  const guard = useRef(false);
  const commandKey = useCommandKey();
  const execute = useServerFn(nrExecutar);
  const createFromModel = useServerFn(nrDocumentoDeModelo);
  const consult = useServerFn(nrConsultar);
  const blocker = useBlocker({
    withResolver: true,
    shouldBlockFn: () => dirty || busy,
    enableBeforeUnload: () => dirty || busy,
  });
  const set = (key: string, value: string) => {
    setValues((v) => ({ ...v, [key]: value }));
    setDirty(true);
  };
  const model = useQuery({
    queryKey: ["nr", org, norma, "modelo-formulario", values["modelo_id"]],
    enabled: recurso === "levantamentos" && !!values["modelo_id"],
    queryFn: ({ signal }) =>
      consult({
        data: {
          organization_id: org,
          norma,
          recurso: "modelos",
          operacao: "detalhe",
          id: values["modelo_id"],
        },
        signal,
      }),
    retry: false,
  });
  const modelRow =
    model.data &&
    (("registro" in model.data ? model.data["registro"] : model.data) as NrRecord | undefined);
  const snapshot = object(Reflect.get(row ?? {}, "modelo_snapshot"));
  const fixedModel = !!row && values["modelo_id"] === (row.modelo_id ?? "");
  const projection = projectSurvey({
    snapshot,
    presentation: Reflect.get(row ?? {}, "modelo_apresentacao"),
    historicalData: row?.dados,
    answers,
  });
  const surveyBlocks = fixedModel ? projection.blocks : normalizeSurveyBlocks(modelRow?.dados);
  const selectedLocal = useQuery({
    queryKey: ["nr", org, norma, "local-formulario", values["local_id"]],
    enabled:
      recurso === "levantamentos" &&
      !!values["local_id"] &&
      (!row || values["local_id"] !== row.local_id),
    queryFn: ({ signal }) =>
      consult({
        data: {
          organization_id: org,
          norma,
          recurso: "locais",
          operacao: "detalhe",
          id: values["local_id"],
        },
        signal,
      }),
    retry: false,
  });
  const selectedLocalRow =
    selectedLocal.data &&
    (("registro" in selectedLocal.data ? selectedLocal.data["registro"] : selectedLocal.data) as
      NrRecord | undefined);
  const surveyLocal =
    row && values["local_id"] === row.local_id
      ? surveyObject(Reflect.get(row, "local_contexto"))
      : { tipo: selectedLocalRow?.tipo, familia: selectedLocalRow?.familia };
  const isModelSurvey = recurso === "modelos" && values["tipo"] === "levantamento";
  function close() {
    if (!busy) {
      if (dirty) setDiscard(true);
      else onClose();
    }
  }
  async function submit(event: FormEvent) {
    event.preventDefault();
    if (guard.current) return;
    guard.current = true;
    setBusy(true);
    setError(null);
    try {
      if (recurso === "documentos" && !row && fromModel) {
        if (!documentModel || !acceptModelDraft)
          throw new Error(
            "Selecione um modelo e sua versão e confirme a criação de um rascunho sem aprovação herdada.",
          );
        if (normas.some((selected) => !documentModel.normas.includes(selected)))
          throw new Error("As normas do documento precisam estar no escopo do modelo selecionado.");
        const input = {
          organization_id: org,
          norma,
          dados: {
            cliente_id: clientId,
            unidade_id: unitId,
            local_id: values["local_id"] || null,
            pasta_id: values["pasta_id"] || null,
            titulo: values["titulo"] || "",
            descricao: values["descricao"] || "",
            tipo: values["tipo"] || "documento",
            normas,
            modelo_id: documentModel.modelo_id,
            modelo_expected_version: documentModel.modelo_expected_version,
            ...(documentModel.modelo_versao_id
              ? { modelo_versao_id: documentModel.modelo_versao_id }
              : {}),
            usar_rascunho: acceptModelDraft,
          },
        };
        const response = await createFromModel({ data: { ...input, chave: commandKey(input) } });
        setDirty(false);
        onSaved(response.registro as NrRecord);
        return;
      }
      const payload: Record<string, unknown> = {
        titulo: values["titulo"],
        descricao: values["descricao"],
        cliente_id: clientId || null,
        unidade_id: unitId || null,
        normas,
        dados: { ...data, ...(isModelSurvey ? { blocos: blocks } : {}) },
      };
      const fields: Record<NrRecurso, string[]> = {
        locais: ["tag", "tipo", "familia", "pet_espaco_id"],
        pastas: ["parent_id"],
        documentos: ["tipo", "pasta_id", "local_id", "estado_origem", "recebimento", "origem_url"],
        modelos: ["tipo"],
        levantamentos: ["local_id", "modelo_id"],
        sistemas: ["local_id", "tipo"],
        pendencias: [
          "local_id",
          "documento_id",
          "criticidade",
          "prazo",
          "tratativa",
          "responsavel_id",
        ],
      };
      for (const key of fields[recurso])
        payload[key] =
          values[key] ||
          (key.endsWith("_id") || key === "prazo" || key === "origem_url"
            ? null
            : key === "criticidade"
              ? "media"
              : key === "recebimento"
                ? "nativo"
                : key === "tipo"
                  ? recurso === "locais"
                    ? norma === "NR33"
                      ? "espaco_confinado"
                      : "altura"
                    : recurso === "modelos"
                      ? "documento"
                      : "outro"
                  : "");
      if (recurso === "locais") payload["aliases"] = aliases.split("\n").filter((x) => x.length);
      if ((recurso === "documentos" || recurso === "modelos") && !unsupportedContent)
        payload["conteudo"] = content;
      if (recurso === "levantamentos") payload["respostas"] = answers;
      const base = {
        organization_id: org,
        norma,
        recurso,
        comando: "salvar" as const,
        id: duplicating ? undefined : row?.id,
        expected_version: duplicating ? undefined : row?.version,
        dados: payload as Record<string, NrJson>,
      };
      const response = await execute({ data: { ...base, chave: commandKey(base) } });
      setDirty(false);
      onSaved(
        (response && typeof response === "object" && "registro" in response
          ? response.registro
          : response) as NrRecord,
      );
    } catch (e) {
      setError(e instanceof Error ? e : new Error("Não foi possível salvar."));
    } finally {
      guard.current = false;
      setBusy(false);
    }
  }
  function attachEvidence(file: NrSelectableFile, targetToken: string) {
    const target = attachmentTargetRef.current;
    if (!target || target.token !== targetToken) return;
    if (target.capturedState !== evidenceStateRef.current) {
      setError(
        new Error(
          "O preenchimento ou o contexto mudou durante a seleção. Nenhuma resposta foi substituída. O arquivo confirmado permanece no acervo; escolha a evidência novamente.",
        ),
      );
      setAttachmentTarget(null);
      return;
    }
    if (!file.mime.startsWith("image/")) {
      setError(new Error("Selecione um arquivo de imagem para esta evidência."));
      return;
    }
    const previous = Array.isArray(target.value)
      ? target.value
      : target.value == null || target.value === ""
        ? []
        : [target.value];
    target.apply([
      ...previous,
      {
        arquivo_id: file.id,
        nome: file.nome,
        legenda: target.field.legenda || target.field.nome,
        categoria:
          file.papel === "derivado" ? "Imagem extraída de documento" : "Evidência anexada na Nexus",
        origem: "Anexado na Nexus",
      },
    ]);
    setDirty(true);
    setAttachmentTarget(null);
  }
  const picker = (name: string, resource: NrRecurso, label: string, required = false) => (
    <NrPicker
      org={org}
      norma={norma}
      recurso={resource}
      value={values[name] || ""}
      clienteId={clientId}
      unidadeId={unitId}
      exclude={row?.id}
      onChange={(v) => set(name, v)}
      label={label}
      required={required}
      tipo={resource === "modelos" && recurso === "levantamentos" ? "levantamento" : undefined}
    />
  );
  return (
    <Dialog.Root
      open
      onOpenChange={(open) => {
        if (!open) close();
      }}
    >
      <Dialog.Portal>
        <Dialog.Overlay className="nr-overlay" />
        <Dialog.Content
          ref={contentElement}
          onCloseAutoFocus={(event) => {
            const target = returnFocus?.isConnected ? returnFocus : previousFocus.current;
            if (target?.isConnected) {
              event.preventDefault();
              target.focus({ preventScroll: true });
            }
          }}
          onOpenAutoFocus={(event) => {
            const field = Array.from(
              contentElement.current?.querySelectorAll<HTMLElement>(
                "input:not([type=checkbox]):not(:disabled),select:not(:disabled),textarea:not(:disabled)",
              ) ?? [],
            ).find((element) => element.getClientRects().length > 0);
            if (field) {
              event.preventDefault();
              field.focus({ preventScroll: true });
            }
          }}
          className={
            recurso === "levantamentos" || recurso === "locais"
              ? "nr-dialog nr-dialog-technical"
              : "nr-dialog"
          }
          aria-describedby="nr-editor-description"
          onEscapeKeyDown={(e) => {
            if (busy || dirty) {
              e.preventDefault();
              close();
            }
          }}
          onInteractOutside={(e) => {
            if (busy || dirty) e.preventDefault();
          }}
        >
          <div className="nr-editor-header">
            <Dialog.Title className="nr-dialog-title">
              {duplicating ? "Duplicar" : row ? "Editar" : "Criar"}{" "}
              {resourceLabels[recurso].toLowerCase()}
            </Dialog.Title>
            {recurso === "levantamentos" && (
              <p className="nr-muted nr-editor-context">
                {contexto.clientes.find((item) => item.id === clientId)?.nome} ·{" "}
                {contexto.unidades.find((item) => item.id === unitId)?.nome}
                {text(Reflect.get(row ?? {}, "local_titulo"))
                  ? ` · ${text(Reflect.get(row ?? {}, "local_tag"))} ${text(Reflect.get(row ?? {}, "local_titulo"))}`
                  : ""}
              </p>
            )}
            {recurso === "locais" && (
              <p className="nr-muted nr-editor-context">
                {values["tag"]} · {values["titulo"]} ·{" "}
                {contexto.unidades.find((item) => item.id === unitId)?.nome}
              </p>
            )}
            <Dialog.Description id="nr-editor-description" className="nr-muted mt-2">
              {row
                ? `Versão ${row.version} carregada. Uma alteração concorrente exige comparação.`
                : "O registro será salvo na organização ativa, com autoria e histórico."}
            </Dialog.Description>
            <button
              className="nr-dialog-close"
              type="button"
              onClick={close}
              aria-label="Fechar formulário"
            >
              <X size={19} />
            </button>
          </div>
          {(discard || blocker.status === "blocked") && (
            <div className="nr-feedback" role="alert">
              <p>Há alterações ainda não salvas. Descartar perde o preenchimento desta tela.</p>
              <div className="nr-actions mt-3">
                <ActionButton
                  variant="ghost"
                  onClick={() => {
                    setDiscard(false);
                    blocker.reset?.();
                  }}
                >
                  Continuar editando
                </ActionButton>
                <ActionButton
                  variant="danger"
                  onClick={() => {
                    setDirty(false);
                    if (blocker.status === "blocked") blocker.proceed?.();
                    else onClose();
                  }}
                >
                  Descartar alterações
                </ActionButton>
              </div>
            </div>
          )}
          <form
            className="nr-form"
            onSubmit={submit}
            data-dirty={dirty}
            aria-busy={busy}
            onChange={() => setDirty(true)}
          >
            <fieldset disabled={busy} className="nr-editor-scroll">
              {recurso === "documentos" && !row && (
                <div className="nr-panel">
                  <label>
                    Conteúdo inicial
                    <select
                      value={fromModel ? "modelo" : "vazio"}
                      onChange={(e) => {
                        setFromModel(e.target.value === "modelo");
                        setDocumentModel(null);
                        setAcceptModelDraft(false);
                      }}
                    >
                      <option value="vazio">Documento em branco</option>
                      <option value="modelo">Criar a partir de um modelo</option>
                    </select>
                  </label>
                  {fromModel && (
                    <p className="nr-muted">
                      Escolha cliente e unidade abaixo. O modelo e a versão serão preservados no
                      documento criado.
                    </p>
                  )}
                </div>
              )}
              <details
                className={
                  recurso === "levantamentos" ? "nr-editor-meta nr-survey-meta" : "nr-editor-meta"
                }
                open={recurso !== "levantamentos" || !row}
              >
                <summary>Contexto, identificação e roteiro</summary>
                <div className="nr-field-grid">
                  <label className="nr-wide">
                    {recurso === "locais" ? "Nome do local" : "Título"} *
                    <input
                      value={values["titulo"]}
                      required
                      minLength={2}
                      maxLength={240}
                      onChange={(e) => set("titulo", e.target.value)}
                    />
                  </label>
                  <label>
                    Cliente{!["modelos"].includes(recurso) && " *"}
                    <select
                      value={clientId}
                      required={recurso !== "modelos"}
                      disabled={!!row}
                      onChange={(e) => {
                        setClientId(e.target.value);
                        setUnitId("");
                      }}
                    >
                      <option value="">
                        {recurso === "modelos" ? "Biblioteca da organização" : "Selecione"}
                      </option>
                      {contexto.clientes.map((c) => (
                        <option value={c.id} key={c.id}>
                          {c.nome}
                        </option>
                      ))}
                    </select>
                  </label>
                  <label>
                    Unidade{recurso !== "modelos" ? " *" : ""}
                    <select
                      required={recurso !== "modelos"}
                      value={unitId}
                      disabled={!clientId || !!row}
                      onChange={(e) => setUnitId(e.target.value)}
                    >
                      <option value="">Sem unidade definida</option>
                      {contexto.unidades
                        .filter((u) => u.cliente_id === clientId)
                        .map((u) => (
                          <option value={u.id} key={u.id}>
                            {u.nome}
                          </option>
                        ))}
                    </select>
                  </label>
                  <div className="nr-wide">
                    <p className="nr-muted mb-2">Normas vinculadas</p>
                    <div className="nr-checks">
                      {(["NR33", "NR35"] as const).map((n) => (
                        <label key={n}>
                          <input
                            type="checkbox"
                            disabled={n === norma}
                            checked={normas.includes(n)}
                            onChange={(e) =>
                              setNormas(
                                e.target.checked ? [...normas, n] : normas.filter((v) => v !== n),
                              )
                            }
                          />
                          {n === "NR33" ? "NR-33" : "NR-35"}
                        </label>
                      ))}
                    </div>
                    {!normas.length && <p role="alert">Selecione pelo menos uma norma.</p>}
                  </div>
                  <label className="nr-wide">
                    Descrição e observações
                    <textarea
                      rows={3}
                      value={values["descricao"]}
                      maxLength={20000}
                      onChange={(e) => set("descricao", e.target.value)}
                    />
                  </label>
                </div>
                {recurso === "levantamentos" && (
                  <div className="nr-field-grid">
                    {picker("local_id", "locais", "Local", true)}
                    {picker("modelo_id", "modelos", "Roteiro de levantamento")}
                  </div>
                )}
              </details>
              {recurso === "locais" && (
                <div className="nr-field-grid">
                  <label>
                    TAG
                    <input
                      value={values["tag"]}
                      maxLength={120}
                      onChange={(e) => set("tag", e.target.value)}
                    />
                    <small className="nr-muted">Zeros, espaços e sufixos são preservados.</small>
                  </label>
                  <label>
                    Classificação
                    <select
                      value={values["tipo"] || (norma === "NR33" ? "espaco_confinado" : "altura")}
                      onChange={(e) => set("tipo", e.target.value)}
                    >
                      <option value="espaco_confinado">Espaço confinado</option>
                      <option value="EC">Espaço confinado · classificação EC da origem</option>
                      <option value="ALTURA">
                        Trabalho em altura · classificação ALTURA da origem
                      </option>
                      <option value="altura">Trabalho em altura</option>
                      <option value="misto">Aplicação às duas normas</option>
                      <option value="a_classificar">A classificar</option>
                    </select>
                  </label>
                  <label>
                    Família técnica
                    <input
                      value={values["familia"]}
                      maxLength={80}
                      onChange={(e) => set("familia", e.target.value)}
                    />
                  </label>
                  <label>
                    Aliases, um por linha
                    <textarea
                      rows={3}
                      value={aliases}
                      onChange={(e) => setAliases(e.target.value)}
                    />
                    <small className="nr-muted">
                      Aliases preservam referências históricas; não confirmam equivalência
                      documental.
                    </small>
                  </label>
                  {normas.includes("NR33") &&
                    !["altura", "ALTURA"].includes(values["tipo"] ?? "") && (
                      <div className="nr-wide">
                        <PetSpacePicker
                          org={org}
                          unidadeId={unitId}
                          value={values["pet_espaco_id"] ?? ""}
                          onChange={(value) => set("pet_espaco_id", value)}
                        />
                      </div>
                    )}
                  <label className="nr-wide">
                    Localização, setor e processo
                    <textarea
                      rows={3}
                      value={text(data["localizacao"])}
                      onChange={(e) => setData((v) => ({ ...v, localizacao: e.target.value }))}
                    />
                  </label>
                </div>
              )}
              {recurso === "locais" && (
                <NrLocalTechnicalEditor
                  value={data}
                  onChange={(next) => {
                    setData(next);
                    setDirty(true);
                  }}
                />
              )}
              {recurso === "pastas" && picker("parent_id", "pastas", "Pasta superior")}
              {recurso === "sistemas" && (
                <>
                  <div className="nr-field-grid">
                    <label>
                      Família avaliada ou tipo de sistema
                      <input
                        value={values["tipo"]}
                        maxLength={120}
                        required
                        onChange={(e) => set("tipo", e.target.value)}
                        placeholder="Ancoragem, linha de vida, resgate…"
                      />
                    </label>
                    {[
                      "fabricante",
                      "modelo",
                      "identificacao",
                      "localizacao",
                      "condicao",
                      "restricoes",
                      "inspecao_em",
                      "responsavel_declarado",
                      "fonte_criterio",
                    ].map((key) => (
                      <label key={key}>
                        {human(key)}
                        <input
                          type={key === "inspecao_em" ? "date" : "text"}
                          value={text(data[key])}
                          maxLength={2000}
                          onChange={(e) => setData((v) => ({ ...v, [key]: e.target.value }))}
                        />
                      </label>
                    ))}
                  </div>
                  {picker("local_id", "locais", "Local", true)}
                  <p className="nr-source">
                    Capacidade, certificação e validade exigem evidência e referência técnica.
                    Campos desconhecidos permanecem vazios.
                  </p>
                </>
              )}
              {recurso === "pendencias" && (
                <>
                  <div className="nr-field-grid">
                    <label>
                      Criticidade
                      <select
                        value={values["criticidade"] || "a_classificar"}
                        onChange={(e) => set("criticidade", e.target.value)}
                      >
                        <option value="a_classificar">A classificar</option>
                        <option value="baixa">Baixa</option>
                        <option value="media">Média</option>
                        <option value="alta">Alta</option>
                        <option value="critica">Crítica</option>
                      </select>
                    </label>
                    <label>
                      Prazo
                      <input
                        type="date"
                        value={values["prazo"]}
                        onChange={(e) => set("prazo", e.target.value)}
                      />
                    </label>
                    <label className="nr-wide">
                      Tratativa e evidência
                      <textarea
                        rows={4}
                        value={values["tratativa"]}
                        maxLength={20000}
                        onChange={(e) => set("tratativa", e.target.value)}
                      />
                    </label>
                  </div>
                  <div className="nr-field-grid">
                    {picker("local_id", "locais", "Local")}
                    {picker("documento_id", "documentos", "Documento")}
                  </div>
                  <NrPeoplePicker
                    org={org}
                    value={values["responsavel_id"] ?? ""}
                    onChange={(value) => set("responsavel_id", value)}
                  />
                </>
              )}
              {(recurso === "documentos" || recurso === "modelos") && (
                <>
                  <div className="nr-field-grid">
                    <label>
                      Tipo
                      {recurso === "modelos" ? (
                        <select
                          value={values["tipo"] || "documento"}
                          onChange={(e) => set("tipo", e.target.value)}
                        >
                          <option value="documento">Modelo de documento</option>
                          <option value="levantamento">Roteiro de levantamento</option>
                          <option value="regra">Regra</option>
                          <option value="criterio">Critério</option>
                          <option value="familia">Família técnica</option>
                          <option value="configuracao">Configuração</option>
                        </select>
                      ) : (
                        <input
                          value={values["tipo"]}
                          maxLength={120}
                          onChange={(e) => set("tipo", e.target.value)}
                          placeholder="Cadastro, procedimento, memorial…"
                        />
                      )}
                    </label>
                    {recurso === "documentos" && (
                      <>
                        {!fromModel && (
                          <label>
                            Situação histórica na origem
                            <input
                              value={values["estado_origem"]}
                              maxLength={100}
                              onChange={(e) => set("estado_origem", e.target.value)}
                              placeholder="Conforme registro efetivamente recebido"
                            />
                          </label>
                        )}
                        {!fromModel && (
                          <label>
                            Recebimento
                            <select
                              value={values["recebimento"] || "nativo"}
                              onChange={(e) => set("recebimento", e.target.value)}
                            >
                              <option value="nativo">Conteúdo nativo</option>
                              <option value="referencia">Referência externa</option>
                              <option value="indisponivel">Original indisponível</option>
                              <option value="pendente">Original pendente</option>
                              <option value="recebido">Recebido</option>
                            </select>
                          </label>
                        )}
                        {!fromModel && (
                          <label>
                            Referência permanente da origem
                            <input
                              type="url"
                              value={values["origem_url"]}
                              maxLength={2000}
                              onChange={(e) => set("origem_url", e.target.value)}
                            />
                            <small className="nr-muted">
                              Uma referência não comprova download ou integridade dos bytes.
                            </small>
                          </label>
                        )}
                        {picker("local_id", "locais", "Local")}
                        {picker("pasta_id", "pastas", "Pasta")}
                      </>
                    )}
                  </div>
                  {recurso === "documentos" && !row && fromModel ? (
                    <>
                      <NrDocumentModelSelector
                        org={org}
                        norma={norma}
                        clienteId={clientId}
                        unidadeId={unitId}
                        onSelection={setDocumentModel}
                      />
                      <label className="nr-checks mt-3">
                        <input
                          type="checkbox"
                          required
                          checked={acceptModelDraft}
                          onChange={(e) => setAcceptModelDraft(e.target.checked)}
                        />
                        Compreendo que será criado um rascunho para conferência. A aprovação ou
                        emissão do modelo não aprova este documento.
                      </label>
                    </>
                  ) : isModelSurvey ? (
                    <TemplateEditor
                      blocks={blocks}
                      onChange={(v) => {
                        setBlocks(v);
                        setDirty(true);
                      }}
                    />
                  ) : unsupportedContent ? (
                    <p className="nr-source">
                      Este conteúdo possui estrutura de origem ainda não suportada pelo editor. O
                      original será preservado; apenas os metadados serão alterados.
                    </p>
                  ) : (
                    <>
                      <h3>Conteúdo editável</h3>
                      <NrContentEditor
                        value={content}
                        org={org}
                        modelTemplate={recurso === "modelos"}
                        fieldContext={
                          recurso === "documentos"
                            ? {
                                norma,
                                clienteId: clientId,
                                unidadeId: unitId,
                                localId: values["local_id"] || "",
                              }
                            : undefined
                        }
                        onChange={(v) => {
                          setContent(v);
                          setDirty(true);
                        }}
                      />
                    </>
                  )}
                  {recurso === "modelos" && (
                    <div className="nr-field-grid">
                      <label>
                        Fonte técnica e versão
                        <textarea
                          value={text(data["fonte"])}
                          rows={3}
                          onChange={(e) => setData((v) => ({ ...v, fonte: e.target.value }))}
                        />
                      </label>
                      <label>
                        Abrangência, exceções e motivo da revisão
                        <textarea
                          value={text(data["abrangencia"])}
                          rows={3}
                          onChange={(e) => setData((v) => ({ ...v, abrangencia: e.target.value }))}
                        />
                      </label>
                    </div>
                  )}
                </>
              )}
              {recurso === "levantamentos" && (
                <>
                  {model.isError && (
                    <ErrorState error={model.error} onRetry={() => model.refetch()} />
                  )}
                  <div className="nr-survey-states">
                    <span>
                      Estado histórico:{" "}
                      <strong>
                        {nrLabel(text(data["estado_historico"]) || text(data["situacao"])) ||
                          "Não informado"}
                      </strong>
                    </span>
                    <span>
                      Revisão Nexus: <strong>{row ? nrLabel(row.estado) : "Novo rascunho"}</strong>
                    </span>
                  </div>
                  {fixedModel && (
                    <p className="nr-source">
                      {projection.usesAdapter
                        ? "As respostas preservadas estão organizadas pelo roteiro de apresentação compatível. O modelo e o snapshot históricos não serão substituídos ao salvar."
                        : `Roteiro fixado na versão ${String(snapshot["numero"] ?? "histórica")}. Alterações da biblioteca não modificam esta versão.`}
                    </p>
                  )}
                  <NrSurveyEditor
                    blocks={surveyBlocks}
                    answers={answers}
                    local={surveyLocal}
                    evidence={{
                      org,
                      localId: values["local_id"],
                      context: values["titulo"] || "Levantamento",
                      onAttach: (field, value, apply) =>
                        setAttachmentTarget({
                          token: crypto.randomUUID(),
                          capturedState: evidenceStateRef.current,
                          field,
                          value,
                          apply,
                        }),
                    }}
                    onChange={(id, value) => {
                      setAnswers((current) => ({ ...current, [id]: value }));
                      setDirty(true);
                    }}
                  />
                  {attachmentTarget && (
                    <section
                      className="nr-panel"
                      aria-label={`Anexar evidência: ${attachmentTarget.field.nome}`}
                    >
                      <div className="nr-panel-header">
                        <h3>Anexar evidência · {attachmentTarget.field.nome}</h3>
                        <ActionButton variant="ghost" onClick={() => setAttachmentTarget(null)}>
                          Cancelar seleção
                        </ActionButton>
                      </div>
                      <p className="nr-muted">
                        Escolha uma imagem comprovada do mesmo local ou envie o original. A
                        associação será gravada com o salvamento parcial.
                      </p>
                      <NrFilesPanel
                        org={org}
                        norma={norma}
                        clienteId={clientId}
                        unidadeId={unitId}
                        localId={values["local_id"] || undefined}
                        canUpload={contexto.permissoes.anexar && !!values["local_id"]}
                        onFileSelected={(file) => attachEvidence(file, attachmentTarget.token)}
                        onFileConfirmed={(file) => attachEvidence(file, attachmentTarget.token)}
                      />
                    </section>
                  )}
                  {projection.unmapped.length > 0 && (
                    <details className="nr-survey-preserved">
                      <summary>Outras respostas preservadas ({projection.unmapped.length})</summary>
                      <NrSurveyValue
                        value={Object.fromEntries(
                          projection.unmapped.map((key) => [key, answers[key]]),
                        )}
                      />
                    </details>
                  )}
                  {Array.isArray(data["blocos"]) && (
                    <details className="nr-survey-preserved">
                      <summary>Estados dos blocos históricos na origem</summary>
                      <NrSurveyValue value={data["blocos"]} />
                      <p className="nr-muted">
                        A numeração e a organização dos blocos históricos podem diferir do roteiro
                        de apresentação. Estes estados não geram aprovação na Nexus.
                      </p>
                    </details>
                  )}
                </>
              )}
            </fieldset>
            {error && (
              <div className="nr-feedback" role="alert">
                <strong>Não foi salvo.</strong>
                <p>{error.message}</p>
                <p>
                  Seu preenchimento permanece nesta tela. Em conflito de versão, abra o registro em
                  outra aba para comparar antes de descartar.
                </p>
              </div>
            )}
            <div className="nr-form-footer">
              <span className="nr-muted" role="status">
                {busy
                  ? "Aguardando confirmação do servidor…"
                  : dirty
                    ? "Alterações ainda não salvas"
                    : "Preenchimento carregado"}
              </span>
              <div className="nr-actions">
                <ActionButton variant="ghost" disabled={busy} onClick={close}>
                  Cancelar
                </ActionButton>
                <ActionButton
                  type="submit"
                  loading={busy}
                  disabled={!normas.length || (fromModel && (!documentModel || !acceptModelDraft))}
                >
                  Salvar {recurso === "levantamentos" ? "parcialmente" : "registro"}
                </ActionButton>
              </div>
            </div>
          </form>
        </Dialog.Content>
      </Dialog.Portal>
    </Dialog.Root>
  );
}

function NrPeoplePicker({
  org,
  value,
  onChange,
}: {
  org: string;
  value: string;
  onChange: (value: string) => void;
}) {
  const load = useServerFn(buscarOpcoesLevantamento);
  const [search, setSearch] = useState("");
  const [term, setTerm] = useState("");
  const [page, setPage] = useState(0);
  useEffect(() => {
    const timer = setTimeout(() => {
      setTerm(search);
      setPage(0);
    }, 250);
    return () => clearTimeout(timer);
  }, [search]);
  const query = useQuery({
    queryKey: ["nr", org, "responsaveis", term, page],
    queryFn: ({ signal }) =>
      load({ data: { organization_id: org, tipo: "pessoas", busca: term, pagina: page }, signal }),
    retry: false,
  });
  return (
    <div>
      <div className="nr-field-grid">
        <label>
          Buscar responsável Nexus
          <input
            type="search"
            value={search}
            maxLength={120}
            onChange={(event) => setSearch(event.target.value)}
          />
        </label>
        <label>
          Responsável
          <select value={value} onChange={(event) => onChange(event.target.value)}>
            <option value="">Não atribuído</option>
            {value && !query.data?.some((row) => row.id === value) && (
              <option value={value}>Responsável atual · {value}</option>
            )}
            {query.data?.map((person) => (
              <option key={person.id} value={person.id}>
                {person.nome}
              </option>
            ))}
          </select>
        </label>
      </div>
      {query.isError && (
        <p className="nr-feedback" role="alert">
          {query.error.message}
        </p>
      )}
      <div className="nr-actions mt-3">
        <ActionButton
          variant="ghost"
          disabled={page === 0 || query.isFetching}
          onClick={() => setPage(page - 1)}
        >
          Pessoas anteriores
        </ActionButton>
        <ActionButton
          variant="ghost"
          disabled={(query.data?.length ?? 0) < 25 || query.isFetching}
          onClick={() => setPage(page + 1)}
        >
          Mais pessoas
        </ActionButton>
      </div>
      <p className="nr-muted mt-2">
        A atribuição atual usa Pessoas e Competências. A autoria histórica importada é preservada
        separadamente.
      </p>
    </div>
  );
}

function PetSpacePicker({
  org,
  unidadeId,
  value,
  onChange,
}: {
  org: string;
  unidadeId: string;
  value: string;
  onChange: (value: string) => void;
}) {
  const load = useServerFn(petOpcoes);
  const query = useQuery({
    queryKey: ["nr", org, "pet-espacos", unidadeId],
    enabled: !!unidadeId,
    queryFn: ({ signal }) => load({ data: { organization_id: org }, signal }),
    retry: false,
  });
  const spaces = (query.data?.espacos ?? []).filter(
    (space) => String(space["unidade_id"]) === unidadeId,
  );
  return (
    <label>
      Espaço operacional PET correspondente
      <select
        value={value}
        disabled={!unidadeId}
        onChange={(event) => onChange(event.target.value)}
      >
        <option value="">Correspondência ainda não confirmada</option>
        {value && !spaces.some((space) => space["id"] === value) && (
          <option value={value}>Vínculo atual · {value}</option>
        )}
        {spaces.map((space) => (
          <option key={String(space["id"])} value={String(space["id"])}>
            {String(space["identificacao"] ?? space["id"])}
          </option>
        ))}
      </select>
      <small className="nr-muted">
        Selecione somente após confirmar unidade e identidade. A TAG isolada não comprova a
        correspondência. Nenhuma PET será emitida por este vínculo.
      </small>
      {query.isError && <small role="alert">{query.error.message}</small>}
    </label>
  );
}
