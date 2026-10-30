import { useEffect, useRef, useState, type FormEvent } from "react";
import { useBlocker } from "@tanstack/react-router";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { useServerFn } from "@tanstack/react-start";
import { BookCheck, ExternalLink, Plus, Trash2 } from "lucide-react";
import { ActionButton, ErrorState, LoadingState } from "@/components/nexus/Page";
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from "@/components/ui/alert-dialog";
import { useCommandKey } from "@/features/operacao/components";
import type { Norma, NrJson, NrRecord } from "./domain";
import { nrArquivosListar, nrArquivoBaixar } from "./files.functions";
import {
  nrModeloPublicacaoContexto,
  nrModeloPublicarTecnico,
} from "./technical-publication.functions";
import {
  nrOfficialSourcePages,
  nrTechnicalPublicationInput,
} from "./technical-publication.schemas";

type SourceDraft = {
  id: string;
  natureza: "oficial" | "licenciada";
  normas: Norma[];
  titulo: string;
  versao: string;
  data_fonte: string;
  consultado_em: string;
  confronto: string;
  url: string;
  arquivo_id: string;
  licenca_referencia: string;
  licenca_confirmada: boolean;
};
const dictionary = (value: unknown): Record<string, unknown> =>
  value && typeof value === "object" && !Array.isArray(value)
    ? (value as Record<string, unknown>)
    : {};
const text = (value: unknown) => (typeof value === "string" ? value : "");
const label = (value: string) => value.replaceAll("_", " ");
function draft(norma: Norma, natureza: SourceDraft["natureza"] = "oficial"): SourceDraft {
  return {
    id: crypto.randomUUID(),
    natureza,
    normas: [norma],
    titulo: "",
    versao: "",
    data_fonte: "",
    consultado_em: "",
    confronto: "",
    url: natureza === "oficial" ? nrOfficialSourcePages[norma] : "",
    arquivo_id: "",
    licenca_referencia: "",
    licenca_confirmada: false,
  };
}
function Field({
  id,
  title,
  value,
  onChange,
  error,
  area = false,
  type = "text",
  min,
  max = 4000,
}: {
  id: string;
  title: string;
  value: string;
  onChange: (value: string) => void;
  error?: string | undefined;
  area?: boolean;
  type?: "text" | "date" | "url";
  min?: number;
  max?: number;
}) {
  const props = {
    id,
    value,
    onChange: (event: React.ChangeEvent<HTMLInputElement | HTMLTextAreaElement>) =>
      onChange(event.target.value),
    required: true,
    minLength: min,
    maxLength: max,
    "aria-invalid": !!error,
    "aria-describedby": error ? `${id}-error` : undefined,
  };
  return (
    <label htmlFor={id}>
      {title}
      {area ? (
        <textarea {...props} rows={3} />
      ) : (
        <input
          {...props}
          type={type}
          max={type === "date" ? new Date().toISOString().slice(0, 10) : undefined}
        />
      )}
      {error && (
        <span id={`${id}-error`} className="nr-feedback" role="alert">
          {error}
        </span>
      )}
    </label>
  );
}
function FileDownload({ org, id }: { org: string; id: string }) {
  const download = useServerFn(nrArquivoBaixar);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  async function run() {
    setBusy(true);
    setError("");
    try {
      const result = await download({ data: { organization_id: org, id } });
      const anchor = document.createElement("a");
      anchor.href = result.url;
      anchor.download = result.arquivo.nome;
      anchor.rel = "noopener noreferrer";
      anchor.target = "_blank";
      document.body.append(anchor);
      anchor.click();
      anchor.remove();
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : "Arquivo indisponível.");
    } finally {
      setBusy(false);
    }
  }
  return (
    <div>
      <ActionButton variant="ghost" loading={busy} onClick={() => void run()}>
        Baixar fonte privada
      </ActionButton>
      {error && (
        <p role="alert" className="nr-feedback">
          {error}
        </p>
      )}
    </div>
  );
}
function PrivateFileChoice({
  org,
  norma,
  value,
  onChange,
  error,
}: {
  org: string;
  norma: Norma;
  value: string;
  onChange: (value: string) => void;
  error?: string | undefined;
}) {
  const list = useServerFn(nrArquivosListar);
  const [search, setSearch] = useState("");
  const [term, setTerm] = useState("");
  const [page, setPage] = useState(0);
  const [expanded, setExpanded] = useState(false);
  useEffect(() => {
    const timer = setTimeout(() => {
      setTerm(search);
      setPage(0);
    }, 250);
    return () => clearTimeout(timer);
  }, [search]);
  const query = useQuery({
    queryKey: ["nr", org, norma, "fontes-tecnicas-arquivos", term, page],
    enabled: expanded,
    queryFn: ({ signal }) =>
      list({
        data: {
          organization_id: org,
          norma,
          busca: term,
          pagina: page,
          limite: 10,
          lixeira: false,
        },
        signal,
      }),
    retry: false,
  });
  const files =
    query.data?.rows.filter((file) => file.estado === "vinculado" && file.bytes_verificados) ?? [];
  return (
    <div className="nr-source">
      <p className="font-medium">Arquivo privado da fonte</p>
      {value ? (
        <>
          <p className="nr-muted">Arquivo confirmado selecionado: {value}</p>
          <ActionButton variant="ghost" onClick={() => onChange("")}>
            Remover vínculo desta declaração
          </ActionButton>
        </>
      ) : (
        <p className="nr-muted">
          Selecione um arquivo realmente disponível no acervo. Nenhum arquivo, cliente ou unidade é
          criado por esta declaração.
        </p>
      )}
      <ActionButton variant="ghost" onClick={() => setExpanded(!expanded)}>
        {expanded ? "Fechar seleção de arquivo" : "Selecionar arquivo confirmado"}
      </ActionButton>
      {expanded && (
        <div className="mt-3">
          <label>
            Buscar no acervo
            <input
              value={search}
              onChange={(event) => setSearch(event.target.value)}
              maxLength={200}
            />
          </label>
          {query.isPending ? (
            <LoadingState label="Consultando arquivos autorizados…" />
          ) : query.isError ? (
            <ErrorState error={query.error} onRetry={() => query.refetch()} />
          ) : (
            <>
              <ul>
                {files.map((file) => (
                  <li key={file.id} className="py-2">
                    <ActionButton
                      variant="ghost"
                      onClick={() => {
                        onChange(file.id);
                        setExpanded(false);
                      }}
                    >
                      {file.nome_exibicao || file.nome}
                    </ActionButton>
                  </li>
                ))}
              </ul>
              {!files.length && <p>Nenhum arquivo confirmado nesta página de resultados.</p>}
              <div className="nr-actions">
                <ActionButton
                  variant="ghost"
                  disabled={page === 0}
                  onClick={() => setPage(page - 1)}
                >
                  Página anterior
                </ActionButton>
                <span>Página {page + 1}</span>
                <ActionButton
                  variant="ghost"
                  disabled={(page + 1) * 10 >= (query.data?.total ?? 0)}
                  onClick={() => setPage(page + 1)}
                >
                  Próxima página
                </ActionButton>
              </div>
            </>
          )}
        </div>
      )}
      {error && (
        <p role="alert" className="nr-feedback">
          {error}
        </p>
      )}
    </div>
  );
}
function HistoryRecord({
  value,
  org,
  index,
  source = false,
}: {
  value: NrJson;
  org: string;
  index: number;
  source?: boolean;
}) {
  const row = dictionary(value),
    evidence = dictionary(row["evidencia"]),
    content = Object.keys(evidence).length ? evidence : row,
    technical = dictionary(dictionary(row["dados"])["publicacao_tecnica"]),
    professional = dictionary(technical["profissional_snapshot"]);
  const title = source
    ? text(row["titulo"]) || `Fonte ${index + 1}`
    : `Versão ${String(row["numero"] ?? index + 1)} · ${row["publicacao_tecnica_interna"] === true ? "revisão técnica interna" : "versão de conteúdo"}`;
  const url = text(row["url"]),
    file = text(row["arquivo_id"]);
  return (
    <details className="nr-source mt-3">
      <summary className="cursor-pointer font-medium">{title}</summary>
      {typeof professional["nome"] === "string" && (
        <p className="mt-2">
          Responsável histórico: {professional["nome"]} ·{" "}
          {text(professional["registro_profissional_declarado"])}
        </p>
      )}
      <dl className="nr-facts mt-3">
        {Object.entries(content)
          .filter(
            ([key, item]) =>
              typeof item === "string" &&
              ![
                "id",
                "organization_id",
                "modelo_id",
                "modelo_versao_id",
                "arquivo_id",
                "url",
                "responsavel_id",
                "publicado_por",
              ].includes(key),
          )
          .map(([key, item]) => (
            <div key={key}>
              <dt>{label(key)}</dt>
              <dd className="nr-prewrap">{String(item)}</dd>
            </div>
          ))}
      </dl>
      {url.startsWith("https://") && (
        <a
          href={url}
          target="_blank"
          rel="noopener noreferrer"
          className="underline inline-flex items-center gap-2 my-2"
        >
          Consultar fonte <ExternalLink size={14} />
        </a>
      )}
      {file && <FileDownload org={org} id={file} />}
    </details>
  );
}
export function NrTechnicalPublication({
  org,
  norma,
  row,
}: {
  org: string;
  norma: Norma;
  row: NrRecord;
}) {
  const contextFn = useServerFn(nrModeloPublicacaoContexto),
    publish = useServerFn(nrModeloPublicarTecnico),
    keyFor = useCommandKey(),
    cache = useQueryClient();
  const [open, setOpen] = useState(false),
    [dirty, setDirty] = useState(false),
    [discard, setDiscard] = useState(false),
    [busy, setBusy] = useState(false),
    [error, setError] = useState(""),
    [notice, setNotice] = useState("");
  const [reason, setReason] = useState(""),
    [scope, setScope] = useState(""),
    [exceptions, setExceptions] = useState(""),
    [date, setDate] = useState(""),
    [declaration, setDeclaration] = useState(false),
    [sources, setSources] = useState<SourceDraft[]>(() => row.normas.map((norm) => draft(norm))),
    [errors, setErrors] = useState<Record<string, string>>({});
  const first = useRef<HTMLTextAreaElement>(null),
    discardReturnFocus = useRef<HTMLElement | null>(null),
    guard = useRef(false);
  const query = useQuery({
    queryKey: ["nr", org, norma, "publicacao-tecnica", row.id, row.version],
    queryFn: ({ signal }) =>
      contextFn({ data: { organization_id: org, norma, modelo_id: row.id }, signal }),
    retry: false,
  });
  const blocker = useBlocker({
    withResolver: true,
    shouldBlockFn: () => open && (dirty || busy),
    enableBeforeUnload: () => open && (dirty || busy),
  });
  useEffect(() => {
    if (open) first.current?.focus();
  }, [open]);
  useEffect(() => {
    if (!open && !dirty && !busy && blocker.status === "blocked") blocker.proceed();
  }, [open, dirty, busy, blocker]);
  function changeSource(id: string, patch: Partial<SourceDraft>) {
    setSources((current) =>
      current.map((source) => (source.id === id ? { ...source, ...patch } : source)),
    );
    setDirty(true);
  }
  async function submit(event: FormEvent) {
    event.preventDefault();
    if (guard.current) return;
    const payload = {
      organization_id: org,
      norma,
      modelo_id: row.id,
      expected_version: row.version,
      evidencia: {
        motivo: reason,
        escopo: scope,
        excecoes: exceptions,
        confrontado_em: date,
        declaracao_revisao: declaration,
        fontes: sources.map((source) => ({
          natureza: source.natureza,
          normas: source.normas,
          titulo: source.titulo,
          versao: source.versao,
          data_fonte: source.data_fonte,
          consultado_em: source.consultado_em,
          confronto: source.confronto,
          ...(source.url.trim() ? { url: source.url.trim() } : {}),
          ...(source.arquivo_id ? { arquivo_id: source.arquivo_id } : {}),
          ...(source.natureza === "licenciada"
            ? {
                licenca_referencia: source.licenca_referencia,
                licenca_confirmada: source.licenca_confirmada,
              }
            : {}),
        })),
      },
    };
    const candidate = { ...payload, chave: keyFor(payload) },
      parsed = nrTechnicalPublicationInput.safeParse(candidate);
    const issues = parsed.success
      ? {}
      : Object.fromEntries(
          parsed.error.issues.map((issue) => [issue.path.join("."), issue.message]),
        );
    const uncovered = row.normas.filter(
      (norm) =>
        !payload.evidencia.fontes.some(
          (source) => source.natureza === "oficial" && source.normas.includes(norm),
        ),
    );
    if (!parsed.success || uncovered.length) {
      setErrors({
        ...issues,
        ...(uncovered.length
          ? {
              "evidencia.fontes": `Inclua uma fonte oficial própria para ${uncovered.join(" e ")}.`,
            }
          : {}),
      });
      setError("Confira os campos indicados. A declaração ainda não foi publicada.");
      return;
    }
    guard.current = true;
    setBusy(true);
    setError("");
    setErrors({});
    try {
      await publish({ data: parsed.data });
      setOpen(false);
      setDirty(false);
      setNotice(
        "Versão técnica interna publicada e registrada no servidor. Nenhum critério foi aplicado automaticamente.",
      );
      await cache.invalidateQueries({ queryKey: ["nr", org] });
    } catch (cause) {
      setError(
        cause instanceof Error
          ? cause.message
          : "A publicação não foi concluída. Seu preenchimento foi preservado.",
      );
    } finally {
      guard.current = false;
      setBusy(false);
    }
  }
  if (query.isPending) return <LoadingState label="Conferindo responsável e versões técnicas…" />;
  if (query.isError) return <ErrorState error={query.error} onRetry={() => query.refetch()} />;
  const context = query.data;
  return (
    <section className="nr-panel my-5" aria-label="Publicação técnica interna">
      <h3 className="font-semibold flex items-center gap-2">
        <BookCheck size={18} aria-hidden="true" /> Revisão técnica da biblioteca
      </h3>
      <p className="nr-muted mt-2">
        Esta publicação registra uma revisão interna do texto, das fontes, do escopo e das exceções.
        Não constitui certificação externa, emissão, assinatura ou liberação de PET. Nenhum critério
        é aplicado automaticamente.
      </p>
      {notice && (
        <p role="status" className="nr-notice mt-3">
          {notice}
        </p>
      )}
      {context.profissional && (
        <p className="nr-source mt-3">
          Responsável vinculado: {context.profissional.nome} · Registro{" "}
          {context.profissional.registro_profissional}
        </p>
      )}
      {context.bloqueio && <p className="nr-source mt-3">{context.bloqueio}</p>}
      {!open && context.pode_publicar && (
        <ActionButton
          id={`nr-technical-prepare-${row.id}`}
          className="mt-3"
          onClick={() => setOpen(true)}
        >
          Preparar publicação técnica interna
        </ActionButton>
      )}
      {open && (
        <form className="nr-form mt-4" onSubmit={(event) => void submit(event)}>
          <fieldset disabled={busy}>
            <legend>Escopo da revisão</legend>
            <label htmlFor={`tecnica-${row.id}-motivo`}>
              Motivo
              <textarea
                ref={first}
                id={`tecnica-${row.id}-motivo`}
                value={reason}
                onChange={(event) => {
                  setReason(event.target.value);
                  setDirty(true);
                }}
                rows={3}
                required
                minLength={10}
                maxLength={4000}
                aria-invalid={!!errors["evidencia.motivo"]}
              />
              {errors["evidencia.motivo"] && (
                <span role="alert" className="nr-feedback">
                  {errors["evidencia.motivo"]}
                </span>
              )}
            </label>
            <Field
              id={`tecnica-${row.id}-escopo`}
              title="Escopo e condições de aplicação"
              value={scope}
              area
              min={10}
              max={10000}
              error={errors["evidencia.escopo"]}
              onChange={(value) => {
                setScope(value);
                setDirty(true);
              }}
            />
            <Field
              id={`tecnica-${row.id}-excecoes`}
              title="Exceções, restrições e limites"
              value={exceptions}
              area
              min={3}
              max={10000}
              error={errors["evidencia.excecoes"]}
              onChange={(value) => {
                setExceptions(value);
                setDirty(true);
              }}
            />
            <Field
              id={`tecnica-${row.id}-data`}
              title="Data da confrontação técnica"
              value={date}
              type="date"
              error={errors["evidencia.confrontado_em"]}
              onChange={(value) => {
                setDate(value);
                setDirty(true);
              }}
            />
          </fieldset>
          <fieldset disabled={busy}>
            <legend>Fontes efetivamente consultadas</legend>
            <p className="nr-muted">
              Inclua uma fonte oficial própria para cada norma do modelo. Uma referência licenciada
              só deve ser adicionada quando realmente consultada e disponível com direito de uso.
            </p>
            {errors["evidencia.fontes"] && (
              <p role="alert" className="nr-feedback">
                {errors["evidencia.fontes"]}
              </p>
            )}
            {sources.map((source, index) => {
              const prefix = `evidencia.fontes.${index}`,
                id = `fonte-${source.id}`;
              return (
                <fieldset key={source.id} className="mt-4">
                  <legend>
                    Fonte {index + 1} · {source.natureza === "oficial" ? "Oficial" : "Licenciada"}
                  </legend>
                  <div className="nr-actions">
                    <label>
                      Norma
                      <select
                        value={source.normas[0]}
                        onChange={(event) =>
                          changeSource(source.id, {
                            normas: [event.target.value as Norma],
                            ...(source.natureza === "oficial"
                              ? { url: nrOfficialSourcePages[event.target.value as Norma] }
                              : {}),
                          })
                        }
                      >
                        {row.normas.map((norm) => (
                          <option key={norm} value={norm}>
                            {norm === "NR33" ? "NR-33" : "NR-35"}
                          </option>
                        ))}
                      </select>
                    </label>
                    <ActionButton
                      variant="ghost"
                      onClick={() => {
                        setSources((current) => current.filter((item) => item.id !== source.id));
                        setDirty(true);
                      }}
                    >
                      <Trash2 size={15} /> Remover esta fonte
                    </ActionButton>
                  </div>
                  <Field
                    id={`${id}-titulo`}
                    title="Título da fonte"
                    value={source.titulo}
                    min={5}
                    max={500}
                    error={errors[`${prefix}.titulo`]}
                    onChange={(value) => changeSource(source.id, { titulo: value })}
                  />
                  <Field
                    id={`${id}-versao`}
                    title="Versão ou redação efetivamente consultada"
                    value={source.versao}
                    min={3}
                    max={500}
                    error={errors[`${prefix}.versao`]}
                    onChange={(value) => changeSource(source.id, { versao: value })}
                  />
                  <div className="nr-field-grid">
                    <Field
                      id={`${id}-data`}
                      title="Data da fonte"
                      type="date"
                      value={source.data_fonte}
                      error={errors[`${prefix}.data_fonte`]}
                      onChange={(value) => changeSource(source.id, { data_fonte: value })}
                    />
                    <Field
                      id={`${id}-consulta`}
                      title="Data da consulta"
                      type="date"
                      value={source.consultado_em}
                      error={errors[`${prefix}.consultado_em`]}
                      onChange={(value) => changeSource(source.id, { consultado_em: value })}
                    />
                  </div>
                  {source.natureza === "oficial" && (
                    <>
                      <Field
                        id={`${id}-url`}
                        title="Página ou PDF oficial do MTE"
                        type="url"
                        value={source.url}
                        max={2000}
                        error={errors[`${prefix}.url`]}
                        onChange={(value) => changeSource(source.id, { url: value })}
                      />
                      <a
                        href={nrOfficialSourcePages[source.normas[0]!]}
                        target="_blank"
                        rel="noopener noreferrer"
                        className="underline inline-flex items-center gap-2"
                      >
                        Consultar publicação oficial <ExternalLink size={14} />
                      </a>
                    </>
                  )}
                  <Field
                    id={`${id}-confronto`}
                    title="Confronto desta fonte com o texto e suas exceções"
                    area
                    min={20}
                    max={10000}
                    value={source.confronto}
                    error={errors[`${prefix}.confronto`]}
                    onChange={(value) => changeSource(source.id, { confronto: value })}
                  />
                  {source.natureza === "licenciada" && (
                    <>
                      <PrivateFileChoice
                        org={org}
                        norma={norma}
                        value={source.arquivo_id}
                        error={errors[`${prefix}.arquivo_id`]}
                        onChange={(value) => changeSource(source.id, { arquivo_id: value })}
                      />
                      <Field
                        id={`${id}-licenca`}
                        title="Identificação da licença e do direito de uso"
                        area
                        min={20}
                        value={source.licenca_referencia}
                        error={errors[`${prefix}.licenca_referencia`]}
                        onChange={(value) => changeSource(source.id, { licenca_referencia: value })}
                      />
                      <label className="flex gap-3 items-start">
                        <input
                          type="checkbox"
                          checked={source.licenca_confirmada}
                          onChange={(event) =>
                            changeSource(source.id, { licenca_confirmada: event.target.checked })
                          }
                        />
                        Confirmo que a referência foi efetivamente consultada e está disponível com
                        direito de uso.
                      </label>
                      {errors[`${prefix}.licenca_confirmada`] && (
                        <p role="alert" className="nr-feedback">
                          {errors[`${prefix}.licenca_confirmada`]}
                        </p>
                      )}
                    </>
                  )}
                </fieldset>
              );
            })}
            <div className="nr-actions mt-3">
              <ActionButton
                variant="ghost"
                disabled={sources.length >= 20}
                onClick={() => {
                  setSources((current) => [...current, draft(norma)]);
                  setDirty(true);
                }}
              >
                <Plus size={15} /> Adicionar fonte oficial
              </ActionButton>
              <ActionButton
                variant="ghost"
                disabled={sources.length >= 20}
                onClick={() => {
                  setSources((current) => [...current, draft(norma, "licenciada")]);
                  setDirty(true);
                }}
              >
                <Plus size={15} /> Adicionar referência licenciada
              </ActionButton>
            </div>
          </fieldset>
          <label className="flex gap-3 items-start">
            <input
              type="checkbox"
              checked={declaration}
              disabled={busy}
              onChange={(event) => {
                setDeclaration(event.target.checked);
                setDirty(true);
              }}
            />
            Confirmo que confrontei esta versão com as fontes declaradas e revisei seu escopo,
            condições e exceções sob minha responsabilidade profissional vinculada.
          </label>
          {errors["evidencia.declaracao_revisao"] && (
            <p role="alert" className="nr-feedback">
              {errors["evidencia.declaracao_revisao"]}
            </p>
          )}
          {error && (
            <p role="alert" className="nr-feedback">
              {error}
            </p>
          )}
          <div className="nr-actions">
            <ActionButton type="submit" loading={busy} disabled={!context.pode_publicar}>
              Publicar versão técnica interna
            </ActionButton>
            <ActionButton
              variant="ghost"
              disabled={busy}
              onClick={() => (dirty ? setDiscard(true) : setOpen(false))}
            >
              Cancelar publicação
            </ActionButton>
          </div>
        </form>
      )}
      <details className="mt-4">
        <summary className="cursor-pointer font-medium">
          Resumo recente ({context.versoes.length} versões · {context.fontes.length} fontes)
        </summary>
        <p className="nr-muted mt-2">
          Exibe até 25 versões e até 20 fontes da última publicação. O conteúdo e as evidências
          integrais de cada versão são abertos pelo painel Histórico e revisões do registro.
        </p>
        {!context.versoes.some(
          (value) => dictionary(value)["publicacao_tecnica_interna"] === true,
        ) && <p className="nr-muted mt-3">Nenhuma versão técnica publicada por este fluxo.</p>}
        {context.versoes.map((value, index) => (
          <HistoryRecord key={index} value={value} index={index} org={org} />
        ))}
        {context.fontes.map((value, index) => (
          <HistoryRecord key={index} value={value} index={index} org={org} source />
        ))}
      </details>
      <AlertDialog open={discard || blocker.status === "blocked"}>
        <AlertDialogContent
          className="nr-confirmation"
          onOpenAutoFocus={() => {
            discardReturnFocus.current =
              document.activeElement instanceof HTMLElement ? document.activeElement : null;
          }}
          onCloseAutoFocus={(event) => {
            event.preventDefault();
            if (discardReturnFocus.current?.isConnected) discardReturnFocus.current.focus();
            else document.getElementById(`nr-technical-prepare-${row.id}`)?.focus();
          }}
        >
          <AlertDialogHeader>
            <AlertDialogTitle>
              {busy ? "Aguarde a confirmação do servidor" : "Descartar a declaração não publicada?"}
            </AlertDialogTitle>
            <AlertDialogDescription>
              {busy
                ? "A publicação ainda está sendo processada. O resultado será informado após a confirmação."
                : "O preenchimento desta declaração ainda não foi publicado. Permanecer na página conserva os campos."}
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel
              disabled={busy}
              onClick={() => {
                setDiscard(false);
                if (blocker.status === "blocked") blocker.reset();
              }}
            >
              Continuar revisão
            </AlertDialogCancel>
            <AlertDialogAction
              disabled={busy}
              onClick={() => {
                setDirty(false);
                setOpen(false);
                setDiscard(false);
                if (blocker.status === "blocked") blocker.proceed();
              }}
            >
              Descartar preenchimento
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </section>
  );
}
