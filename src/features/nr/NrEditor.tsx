import { useEffect, useMemo, useRef, useState, type FormEvent } from "react";
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
import type { Norma, NrContexto, NrJson, NrRecord, NrRecurso } from "./domain";
import { NrContentEditor } from "./NrContentEditor";
import { parseNative, type NativeContent } from "./native-content";
import { resourceLabels } from "./ui-labels";

type TemplateField = {
  id: string;
  nome: string;
  tipo: "texto" | "texto_longo" | "numero" | "data" | "selecao" | "foto" | "lista";
  mostrar_se?: { campo: string; valor: unknown[] };
  destino?: string;
  tipo_origem?: string;
  obrigatorio: boolean;
  opcoes?: string[];
};
type TemplateBlock = {
  id: string;
  codigo: string;
  titulo: string;
  aplicabilidade?: string | string[];
  campos: TemplateField[];
};
const object = (v: unknown): Record<string, unknown> =>
  v !== null && typeof v === "object" && !Array.isArray(v) ? (v as Record<string, unknown>) : {};
const scalar = (v: unknown) =>
  typeof v === "number" || typeof v === "boolean" ? String(v) : text(v);
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
}) {
  const consult = useServerFn(nrConsultar);
  const [search, setSearch] = useState("");
  const [term, setTerm] = useState("");
  useEffect(() => {
    const timer = setTimeout(() => setTerm(search), 250);
    return () => clearTimeout(timer);
  }, [search]);
  const query = useQuery({
    queryKey: ["nr", org, norma, "opcoes", recurso, clienteId, unidadeId, term],
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
          pagina: 0,
          limite: 25,
        },
        signal,
      }),
    retry: false,
  });
  const rows = (query.data as { rows?: NrRecord[] } | undefined)?.rows ?? [];
  return (
    <div className="nr-picker">
      <label>
        Buscar {label.toLowerCase()}
        <input
          type="search"
          value={search}
          maxLength={120}
          onChange={(e) => setSearch(e.target.value)}
          placeholder="Busca no servidor"
        />
      </label>
      <label>
        {label}
        {required ? " *" : ""}
        <select value={value} required={required} onChange={(e) => onChange(e.target.value)}>
          <option value="">{required ? "Selecione" : "Sem vínculo"}</option>
          {value && !rows.some((r) => r.id === value) && (
            <option value={value}>Vínculo atual: {value}</option>
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
                            ? { ...f, tipo: e.target.value as TemplateField["tipo"] }
                            : f,
                        ),
                      })
                    }
                  >
                    <option value="texto">Texto</option>
                    <option value="texto_longo">Texto longo</option>
                    <option value="lista">Lista estruturada</option>
                    <option value="foto">Foto / referência</option>
                    <option value="numero">Número</option>
                    <option value="data">Data</option>
                    <option value="selecao">Seleção</option>
                  </select>
                </label>
                {field.tipo === "selecao" && (
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
const axes = {
  existencia: ["nao_verificado", "presente", "ausente"],
  aplicabilidade: ["nao_verificado", "aplicavel", "nao_aplicavel"],
  condicao: ["nao_verificado", "conforme", "nao_conforme"],
  acao: ["nao_definida", "manter", "adequar", "instalar", "remover"],
  validacao: ["nao_validado", "em_revisao", "validado", "rejeitado"],
} as const;
const axisLabels = {
  existencia: "Existência",
  aplicabilidade: "Aplicabilidade",
  condicao: "Condição",
  acao: "Ação",
  validacao: "Validação",
};
const human = (v: string) => v["replaceAll"]("_", " ");

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
  duplicating?: boolean;
}) {
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
  const [blocks, setBlocks] = useState<TemplateBlock[]>(
    Array.isArray(row?.dados["blocos"]) ? (row.dados["blocos"] as TemplateBlock[]) : [],
  );
  const [answers, setAnswers] = useState<Record<string, unknown>>(object(row?.respostas));
  const [answerErrors, setAnswerErrors] = useState<Record<string, boolean>>({});
  const contentElement = useRef<HTMLDivElement>(null);
  const [dirty, setDirty] = useState(false);
  const [discard, setDiscard] = useState(false);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<Error | null>(null);
  const guard = useRef(false);
  const commandKey = useCommandKey();
  const execute = useServerFn(nrExecutar);
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
  const modelData = fixedModel ? object(snapshot["dados"]) : modelRow?.dados;
  const surveyBlocks = useMemo(
    () => (Array.isArray(modelData?.["blocos"]) ? (modelData["blocos"] as TemplateBlock[]) : []),
    [modelData],
  );
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
    if (Object.values(answerErrors).some(Boolean)) {
      setError(
        new Error(
          "Corrija os campos estruturados indicados antes de salvar. O preenchimento foi preservado.",
        ),
      );
      return;
    }
    guard.current = true;
    setBusy(true);
    setError(null);
    try {
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
          onOpenAutoFocus={(event) => {
            const field = contentElement.current?.querySelector<HTMLElement>(
              "input:not([type=checkbox]):not(:disabled),select:not(:disabled),textarea:not(:disabled)",
            );
            if (field) {
              event.preventDefault();
              field.focus();
            }
          }}
          className="nr-dialog"
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
          <Dialog.Title className="nr-dialog-title">
            {duplicating ? "Duplicar" : row ? "Editar" : "Criar"}{" "}
            {resourceLabels[recurso].toLowerCase()}
          </Dialog.Title>
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
            <fieldset disabled={busy}>
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
                        <label>
                          Situação histórica na origem
                          <input
                            value={values["estado_origem"]}
                            maxLength={100}
                            onChange={(e) => set("estado_origem", e.target.value)}
                            placeholder="Conforme registro efetivamente recebido"
                          />
                        </label>
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
                        {picker("local_id", "locais", "Local")}
                        {picker("pasta_id", "pastas", "Pasta")}
                      </>
                    )}
                  </div>
                  {isModelSurvey ? (
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
                  <div className="nr-field-grid">
                    {picker("local_id", "locais", "Local", true)}
                    {picker("modelo_id", "modelos", "Modelo de levantamento")}
                  </div>
                  {model.isError && (
                    <ErrorState error={model.error} onRetry={() => model.refetch()} />
                  )}
                  {!surveyBlocks.length && (
                    <p className="nr-source">
                      Selecione um roteiro com blocos e campos configurados. O salvamento parcial
                      permanece disponível.
                    </p>
                  )}
                  {fixedModel && (
                    <p className="nr-source">
                      Modelo fixado na versão{" "}
                      {String(snapshot["numero"] ?? "histórica sem campos estruturados")}. A
                      publicação de modelos novos não altera este levantamento.
                    </p>
                  )}
                  <div className="nr-block-library">
                    {surveyBlocks.map((block) => (
                      <details key={block.id}>
                        <summary>
                          {block.codigo} — {block.titulo}
                        </summary>
                        {block.aplicabilidade && (
                          <p className="nr-source">
                            {Array.isArray(block.aplicabilidade)
                              ? block.aplicabilidade.join(" · ")
                              : block.aplicabilidade}
                          </p>
                        )}
                        <div className="nr-field-grid">
                          {block.campos
                            .filter((field) => {
                              const condition = field.mostrar_se;
                              return (
                                !condition ||
                                !Array.isArray(condition.valor) ||
                                condition.valor.some(
                                  (value) =>
                                    String(value) === String(answers[condition.campo] ?? ""),
                                )
                              );
                            })
                            .map((field) => (
                              <SurveyField
                                key={field.id}
                                field={field}
                                value={answers[field.id]}
                                onChange={(value) =>
                                  setAnswers((current) => ({ ...current, [field.id]: value }))
                                }
                                onInvalid={(invalid) =>
                                  setAnswerErrors((current) => ({
                                    ...current,
                                    [field.id]: invalid,
                                  }))
                                }
                              />
                            ))}
                        </div>
                      </details>
                    ))}
                  </div>
                  <fieldset>
                    <legend>Cinco dimensões independentes de avaliação</legend>
                    <div className="nr-field-grid">
                      {Object.entries(axes).map(([key, choices]) => (
                        <label key={key}>
                          {axisLabels[key as keyof typeof axes]}
                          <select
                            value={text(object(data["avaliacao"])[key]) || choices[0]}
                            onChange={(e) =>
                              setData((v) => ({
                                ...v,
                                avaliacao: { ...object(v["avaliacao"]), [key]: e.target.value },
                              }))
                            }
                          >
                            {choices.map((v) => (
                              <option value={v} key={v}>
                                {human(v)}
                              </option>
                            ))}
                          </select>
                        </label>
                      ))}
                    </div>
                    <p className="nr-muted">
                      Uma dimensão não altera as outras. A falta de evidência não comprova ausência
                      física.
                    </p>
                  </fieldset>
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
                <ActionButton type="submit" loading={busy} disabled={!normas.length}>
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

function SurveyField({
  field,
  value,
  onChange,
  onInvalid,
}: {
  field: TemplateField;
  value: unknown;
  onChange: (value: unknown) => void;
  onInvalid: (invalid: boolean) => void;
}) {
  const structured = field.tipo === "lista" || (typeof value === "object" && value !== null);
  const [raw, setRaw] = useState(() =>
    structured ? JSON.stringify(value ?? [], null, 2) : scalar(value),
  );
  const [invalid, setInvalid] = useState(false);
  const help =
    field.tipo === "foto"
      ? "Metadados ou referência do acervo; um caminho de origem não comprova os bytes da foto."
      : structured
        ? "Estrutura JSON preservada. O servidor valida o conteúdo ao salvar."
        : field.destino
          ? `Campo de origem: ${field.destino}`
          : "";
  return (
    <label className={field.tipo === "texto_longo" || structured ? "nr-wide" : ""}>
      {field.nome || field.id}
      {field.obrigatorio ? " · necessário para revisão" : ""}
      {structured ? (
        <textarea
          value={raw}
          rows={5}
          aria-invalid={invalid}
          onChange={(event) => {
            const next = event.target.value;
            setRaw(next);
            try {
              const parsed: unknown = JSON.parse(next);
              if (!parsed || typeof parsed !== "object") throw new Error();
              setInvalid(false);
              onInvalid(false);
              onChange(parsed);
            } catch {
              setInvalid(true);
              onInvalid(true);
            }
          }}
        />
      ) : field.tipo === "texto_longo" ? (
        <textarea
          rows={4}
          value={scalar(value)}
          onChange={(event) => onChange(event.target.value)}
        />
      ) : field.tipo === "selecao" ? (
        <select value={scalar(value)} onChange={(event) => onChange(event.target.value)}>
          <option value="">Não informado</option>
          {scalar(value) && !(field.opcoes ?? []).includes(scalar(value)) && (
            <option value={scalar(value)}>{scalar(value)} · valor histórico</option>
          )}
          {(field.opcoes ?? []).map((option) => (
            <option key={option} value={option}>
              {option}
            </option>
          ))}
        </select>
      ) : (
        <input
          type={field.tipo === "numero" ? "number" : field.tipo === "data" ? "date" : "text"}
          step={field.tipo === "numero" ? "any" : undefined}
          value={scalar(value)}
          onChange={(event) => onChange(event.target.value)}
        />
      )}
      {help && <small className="nr-muted">{help}</small>}
      {invalid && (
        <small role="alert">
          JSON inválido. Corrija a estrutura para salvar; o texto digitado continua preservado.
        </small>
      )}
    </label>
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
