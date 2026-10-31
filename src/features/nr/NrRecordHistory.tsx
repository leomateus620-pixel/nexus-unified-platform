import { useRef, useState, type ReactNode } from "react";
import * as DialogPrimitive from "@radix-ui/react-dialog";
import { useInfiniteQuery, useQuery } from "@tanstack/react-query";
import { useServerFn } from "@tanstack/react-start";
import { Clock3, FileClock, ExternalLink } from "lucide-react";
import { ActionButton, ErrorState, LoadingState } from "@/components/nexus/Page";
import { Dialog, DialogDescription, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import type { Norma, NrJson, NrRecurso } from "./domain";
import {
  nrHistoricoListar,
  nrRevisoesListar,
  nrHistoricoDetalhe,
  nrRevisaoDetalhe,
} from "./history.functions";
import { nrArquivoBaixar } from "./files.functions";
import { parseNative } from "./native-content";
import { NrContentEditor } from "./NrContentEditor";
import { sourceDate, technicalEvents } from "./technical-evidence";
const object = (value: unknown): Record<string, NrJson> =>
  value && typeof value === "object" && !Array.isArray(value)
    ? (value as Record<string, NrJson>)
    : {};
const text = (value: unknown) => (typeof value === "string" ? value : "");
const human = (value: unknown) =>
  typeof value === "string" && value ? value.replaceAll("_", " ") : "Não informado";
const when = sourceDate;
function ReadOnlyDialogContent({ children }: { children: ReactNode }) {
  const returnFocus = useRef<HTMLElement | null>(null);
  return (
    <DialogPrimitive.Portal>
      <DialogPrimitive.Overlay className="nr-overlay" />
      <DialogPrimitive.Content
        className="nr-dialog"
        onOpenAutoFocus={() => {
          returnFocus.current =
            document.activeElement instanceof HTMLElement ? document.activeElement : null;
        }}
        onCloseAutoFocus={(event) => {
          event.preventDefault();
          if (returnFocus.current?.isConnected) returnFocus.current.focus();
        }}
      >
        {children}
      </DialogPrimitive.Content>
    </DialogPrimitive.Portal>
  );
}
function safeUrl(value: unknown) {
  try {
    const url = new URL(text(value));
    return url.protocol === "https:" && !url.username && !url.password && !url.search && !url.hash
      ? url.href
      : null;
  } catch {
    return null;
  }
}

/** Children are mounted only after expansion; large snapshots never create a whole DOM tree at once. */
export function NrReadOnlyValue({
  value,
  title = "Dados preservados",
}: {
  value: NrJson | undefined;
  title?: string;
}) {
  const [open, setOpen] = useState(false),
    [limit, setLimit] = useState(25);
  if (value === null || value === undefined) return <p>{title}: Não informado</p>;
  if (typeof value !== "object") {
    const rendered = typeof value === "boolean" ? (value ? "Sim" : "Não") : String(value);
    return rendered.length > 1000 ? (
      <details className="nr-source" onToggle={(event) => setOpen(event.currentTarget.open)}>
        <summary>
          {title} · {rendered.length} caracteres
        </summary>
        {open && <p className="nr-prewrap">{rendered}</p>}
      </details>
    ) : (
      <div className="py-1">
        <strong>{title}</strong>
        <p className="nr-prewrap">{rendered}</p>
      </div>
    );
  }
  const entries = Array.isArray(value)
    ? value.map((item, index) => [String(index + 1), item] as const)
    : Object.entries(value);
  return (
    <details className="nr-source my-2" onToggle={(event) => setOpen(event.currentTarget.open)}>
      <summary className="cursor-pointer font-medium">
        {title} · {entries.length} itens
      </summary>
      {open && (
        <div className="pl-3">
          {entries.slice(0, limit).map(([key, item]) => (
            <NrReadOnlyValue key={key} title={human(key)} value={item} />
          ))}
          {limit < entries.length && (
            <ActionButton variant="ghost" onClick={() => setLimit(limit + 25)}>
              Mostrar mais 25 itens
            </ActionButton>
          )}
        </div>
      )}
    </details>
  );
}
function SourceDownload({ org, id }: { org: string; id: string }) {
  const download = useServerFn(nrArquivoBaixar);
  const [busy, setBusy] = useState(false),
    [error, setError] = useState("");
  async function run() {
    setBusy(true);
    setError("");
    try {
      const file = await download({ data: { organization_id: org, id } });
      const link = document.createElement("a");
      link.href = file.url;
      link.download = file.arquivo.nome;
      link.target = "_blank";
      link.rel = "noopener noreferrer";
      document.body.append(link);
      link.click();
      link.remove();
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : "Fonte indisponível.");
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
        <p className="nr-feedback" role="alert">
          {error}
        </p>
      )}
    </div>
  );
}
function PublishedEvidence({ revision, org }: { revision: Record<string, NrJson>; org: string }) {
  const technical = object(object(revision["dados"])["publicacao_tecnica"]),
    evidence = object(technical["evidencia"]),
    professional = object(technical["profissional_snapshot"]);
  const sources = Array.isArray(revision["fontes_publicacao"]) ? revision["fontes_publicacao"] : [];
  if (!Object.keys(technical).length && !sources.length) return null;
  return (
    <section className="nr-source my-4">
      <h3 className="font-semibold">Declaração técnica interna preservada</h3>
      <p className="nr-muted">Não é certificação externa ou aplicação automática de critérios.</p>
      {professional["nome"] && (
        <p>
          Responsável histórico: {text(professional["nome"])} ·{" "}
          {text(professional["registro_profissional_declarado"])}
        </p>
      )}
      <NrReadOnlyValue title="Motivo, escopo, exceções e confrontação" value={evidence} />
      {sources.map((value, index) => {
        const source = object(value),
          url = safeUrl(source["url"]);
        return (
          <details className="nr-source my-2" key={text(source["id"]) || index}>
            <summary className="font-medium cursor-pointer">
              {text(source["titulo"]) || `Fonte ${index + 1}`} · {text(source["versao"])}
            </summary>
            <NrReadOnlyValue title="Evidências desta fonte" value={source} />
            {url && (
              <a
                href={url}
                target="_blank"
                rel="noopener noreferrer"
                className="underline inline-flex gap-2 items-center"
              >
                Consultar fonte oficial ou referência <ExternalLink size={14} />
              </a>
            )}
            {typeof source["arquivo_id"] === "string" && (
              <SourceDownload org={org} id={source["arquivo_id"]} />
            )}
          </details>
        );
      })}
    </section>
  );
}
export function NrAuditEventDialog({
  org,
  norma,
  eventId,
  onClose,
}: {
  org: string;
  norma: Norma;
  eventId: string | null;
  onClose: () => void;
}) {
  const fetch = useServerFn(nrHistoricoDetalhe);
  const query = useQuery({
    queryKey: ["nr", org, norma, "evento-completo", eventId],
    enabled: !!eventId,
    queryFn: ({ signal }) =>
      fetch({ data: { organization_id: org, norma, evento_id: eventId! }, signal }),
    retry: false,
  });
  return (
    <Dialog
      open={!!eventId}
      onOpenChange={(open) => {
        if (!open) onClose();
      }}
    >
      <ReadOnlyDialogContent>
        <DialogHeader>
          <DialogTitle>Evento de auditoria</DialogTitle>
          <DialogDescription>
            Consulta somente de leitura. Estado anterior e posterior são carregados apenas para este
            evento autorizado.
          </DialogDescription>
        </DialogHeader>
        {query.isPending ? (
          <LoadingState label="Carregando evento autorizado…" />
        ) : query.isError ? (
          <ErrorState error={query.error} onRetry={() => query.refetch()} />
        ) : (
          query.data && (
            <>
              <p className="font-semibold">
                {human(query.data["comando"])} · {when(query.data["created_at"])}
              </p>
              {query.data["autor_historico"] && (
                <p>Autoria histórica: {text(query.data["autor_historico"])}</p>
              )}
              <NrReadOnlyValue title="Motivo" value={query.data["motivo"]} />
              <NrReadOnlyValue title="Antes da alteração" value={query.data["antes"]} />
              <NrReadOnlyValue title="Depois da alteração" value={query.data["depois"]} />
            </>
          )
        )}
        <ActionButton variant="ghost" onClick={onClose}>
          Fechar evento
        </ActionButton>
      </ReadOnlyDialogContent>
    </Dialog>
  );
}
export function NrPastRevisionDialog({
  org,
  norma,
  recurso,
  registroId,
  revisionId,
  onClose,
}: {
  org: string;
  norma: Norma;
  recurso: "documentos" | "modelos";
  registroId: string;
  revisionId: string | null;
  onClose: () => void;
}) {
  const fetch = useServerFn(nrRevisaoDetalhe);
  const query = useQuery({
    queryKey: ["nr", org, norma, recurso, registroId, "revisao-completa", revisionId],
    enabled: !!revisionId,
    queryFn: ({ signal }) =>
      fetch({
        data: {
          organization_id: org,
          norma,
          recurso,
          registro_id: registroId,
          revisao_id: revisionId!,
        },
        signal,
      }),
    retry: false,
  });
  const data = query.data ? object(query.data["revisao"] ?? query.data) : {},
    content = parseNative(data["conteudo"]);
  return (
    <Dialog
      open={!!revisionId}
      onOpenChange={(open) => {
        if (!open) onClose();
      }}
    >
      <ReadOnlyDialogContent>
        <DialogHeader>
          <DialogTitle>
            Revisão {String(data["numero"] ?? "preservada")} · somente leitura
          </DialogTitle>
          <DialogDescription>
            Este conteúdo pertence à versão selecionada. Alterações devem usar uma nova revisão pelo
            fluxo do registro.
          </DialogDescription>
        </DialogHeader>
        {query.isPending ? (
          <LoadingState label="Carregando somente a versão selecionada…" />
        ) : query.isError ? (
          <ErrorState error={query.error} onRetry={() => query.refetch()} />
        ) : (
          query.data && (
            <>
              <p>
                {human(data["estado"])} · {human(data["vigencia"])} · {when(data["created_at"])}
              </p>
              {content ? (
                <NrContentEditor org={org} value={content} readOnly />
              ) : (
                <p className="nr-source">
                  Esta versão não contém conteúdo nativo compatível com o leitor.
                </p>
              )}
              <PublishedEvidence revision={data} org={org} />
              <NrReadOnlyValue title="Snapshot da versão" value={data["snapshot"]} />
              <NrReadOnlyValue title="Metadados preservados da versão" value={data["dados"]} />
            </>
          )
        )}
        <ActionButton variant="ghost" onClick={onClose}>
          Fechar revisão
        </ActionButton>
      </ReadOnlyDialogContent>
    </Dialog>
  );
}
export function NrRecordHistory({
  org,
  norma,
  recurso,
  registroId,
  dados,
  showTechnical = true,
}: {
  org: string;
  norma: Norma;
  recurso: NrRecurso;
  registroId: string;
  dados?: Record<string, NrJson> | undefined;
  showTechnical?: boolean;
}) {
  const historyFn = useServerFn(nrHistoricoListar),
    revisionsFn = useServerFn(nrRevisoesListar);
  const [historyOpen, setHistoryOpen] = useState(false),
    [revisionsOpen, setRevisionsOpen] = useState(false),
    [eventId, setEventId] = useState<string | null>(null),
    [revisionId, setRevisionId] = useState<string | null>(null);
  const hasRevisions = recurso === "documentos" || recurso === "modelos",
    revisionResource = recurso === "modelos" ? "modelos" : "documentos";
  const history = useInfiniteQuery({
    queryKey: ["nr", org, norma, recurso, registroId, "historico-paginado"],
    enabled: historyOpen,
    initialPageParam: 0,
    queryFn: ({ pageParam, signal }) =>
      historyFn({
        data: {
          organization_id: org,
          norma,
          recurso,
          registro_id: registroId,
          pagina: pageParam,
          limite: 25,
        },
        signal,
      }),
    getNextPageParam: (last) =>
      (last.pagina + 1) * last.limite < last.total ? last.pagina + 1 : undefined,
    retry: false,
  });
  const revisions = useInfiniteQuery({
    queryKey: ["nr", org, norma, recurso, registroId, "revisoes-paginadas"],
    enabled: revisionsOpen && hasRevisions,
    initialPageParam: 0,
    queryFn: ({ pageParam, signal }) =>
      revisionsFn({
        data: {
          organization_id: org,
          norma,
          recurso: revisionResource,
          registro_id: registroId,
          pagina: pageParam,
          limite: 25,
        },
        signal,
      }),
    getNextPageParam: (last) =>
      (last.pagina + 1) * last.limite < last.total ? last.pagina + 1 : undefined,
    retry: false,
  });
  const events = [
      ...new Map(
        (history.data?.pages.flatMap((page) => page.rows) ?? []).map((row) => [
          String(row["id"]),
          row,
        ]),
      ).values(),
    ],
    versions = [
      ...new Map(
        (revisions.data?.pages.flatMap((page) => page.rows) ?? []).map((row) => [
          String(row["id"]),
          row,
        ]),
      ).values(),
    ];
  return (
    <section aria-label="Histórico e revisões do registro" className="my-5">
      {showTechnical && recurso === "locais" && dados && (
        <NrTechnicalTimeline value={dados["historico"]} />
      )}
      <h3 className="font-semibold mb-3">Revisões e auditoria da Nexus</h3>
      {hasRevisions && (
        <details
          className="nr-panel"
          onToggle={(event) => setRevisionsOpen(event.currentTarget.open)}
        >
          <summary className="cursor-pointer font-medium">
            <FileClock size={16} className="inline mr-2" aria-hidden="true" /> Versões preservadas
          </summary>
          {revisionsOpen &&
            (revisions.isPending ? (
              <LoadingState label="Carregando metadados das versões…" />
            ) : revisions.isError && !revisions.data ? (
              <ErrorState error={revisions.error} onRetry={() => revisions.refetch()} />
            ) : (
              <>
                <ul className="nr-record-list">
                  {versions.map((version) => (
                    <li className="py-3" key={String(version["id"])}>
                      <div>
                        <strong>
                          {recurso === "modelos" ? "Versão" : "Revisão"} {String(version["numero"])}
                        </strong>
                        <p className="nr-muted">
                          {human(version["estado"])} · {human(version["vigencia"])} ·{" "}
                          {when(version["created_at"])}
                        </p>
                        {version["publicacao_tecnica_interna"] === true && (
                          <p className="nr-muted">Revisão técnica interna registrada</p>
                        )}
                      </div>
                      <ActionButton
                        variant="ghost"
                        onClick={() => setRevisionId(text(version["id"]))}
                      >
                        Abrir versão em leitura
                      </ActionButton>
                    </li>
                  ))}
                </ul>
                {!versions.length && (
                  <p className="nr-muted">Nenhuma versão preservada disponível.</p>
                )}
                {revisions.isFetchNextPageError && (
                  <p className="nr-feedback" role="alert">
                    Não foi possível carregar a próxima página. As versões já consultadas foram
                    preservadas.
                  </p>
                )}
                {revisions.hasNextPage && (
                  <ActionButton
                    variant="ghost"
                    loading={revisions.isFetchingNextPage}
                    onClick={() => void revisions.fetchNextPage()}
                  >
                    Carregar mais versões
                  </ActionButton>
                )}
              </>
            ))}
        </details>
      )}
      <details className="nr-panel" onToggle={(event) => setHistoryOpen(event.currentTarget.open)}>
        <summary className="cursor-pointer font-medium">
          <Clock3 size={16} className="inline mr-2" aria-hidden="true" /> Operações da Nexus
        </summary>
        {historyOpen &&
          (history.isPending ? (
            <LoadingState label="Carregando metadados dos eventos…" />
          ) : history.isError && !history.data ? (
            <ErrorState error={history.error} onRetry={() => history.refetch()} />
          ) : (
            <>
              <p className="nr-muted mt-3">
                Importação, edição e outras operações registradas na Nexus. A data de importação é
                independente da data dos acontecimentos técnicos da origem.
              </p>
              <ul className="nr-record-list">
                {events.map((event) => (
                  <li className="py-3" key={String(event["id"])}>
                    <div>
                      <strong>{human(event["comando"])}</strong>
                      <p className="nr-muted">{when(event["created_at"])}</p>
                      {typeof event["motivo"] === "string" && <p>{event["motivo"]}</p>}
                      {event["motivo_resumido"] === true && (
                        <p className="nr-muted">
                          Motivo resumido. O texto integral está no evento.
                        </p>
                      )}
                      {event["escopo"] === "nao_classificado" && (
                        <span className="nr-badge">Origem · escopo não classificado</span>
                      )}
                    </div>
                    <ActionButton variant="ghost" onClick={() => setEventId(String(event["id"]))}>
                      Abrir evento
                    </ActionButton>
                  </li>
                ))}
              </ul>
              {!events.length && (
                <p className="nr-muted">Nenhum evento disponível para este registro.</p>
              )}
              {history.isFetchNextPageError && (
                <p className="nr-feedback" role="alert">
                  Não foi possível carregar a próxima página. Os eventos já consultados foram
                  preservados.
                </p>
              )}
              {history.hasNextPage && (
                <ActionButton
                  variant="ghost"
                  loading={history.isFetchingNextPage}
                  onClick={() => void history.fetchNextPage()}
                >
                  Carregar mais eventos
                </ActionButton>
              )}
            </>
          ))}
      </details>
      <NrAuditEventDialog
        org={org}
        norma={norma}
        eventId={eventId}
        onClose={() => setEventId(null)}
      />
      {hasRevisions && (
        <NrPastRevisionDialog
          org={org}
          norma={norma}
          recurso={revisionResource}
          registroId={registroId}
          revisionId={revisionId}
          onClose={() => setRevisionId(null)}
        />
      )}
    </section>
  );
}

/** The source's narratives are technical history, independent from equipment-operation records. */
export function NrTechnicalTimeline({
  value,
  compact = false,
}: {
  value: unknown;
  compact?: boolean;
}) {
  const entries = technicalEvents(value);
  return (
    <section
      aria-label="Histórico técnico da origem"
      className={compact ? "nr-technical-timeline nr-technical-timeline-compact" : "mb-6"}
    >
      <div className="nr-panel-header">
        <h3 className="font-semibold">Histórico técnico</h3>
        <span className="nr-badge">
          {entries.length} {entries.length === 1 ? "acontecimento" : "acontecimentos"}
        </span>
      </div>
      <p className={compact ? "nr-muted nr-technical-timeline-intro" : "nr-muted my-3"}>
        {compact
          ? "Datas e autoria da origem; não equivalem a assinaturas na Nexus."
          : "Atualizações do cadastro preservadas da origem. Autores e datas históricos não constituem assinaturas na Nexus."}
      </p>
      {entries.length ? (
        <ol className={compact ? "nr-technical-events" : "border-l-2 border-border pl-5 space-y-5"}>
          {entries.map((entry) => (
            <li key={entry.key} className="relative">
              <div
                className={
                  compact
                    ? "nr-technical-event-dot"
                    : "absolute -left-[1.7rem] top-1.5 size-3 rounded-full border-2 border-white bg-emerald-700"
                }
                aria-hidden
              />
              {compact && (
                <>
                  <p className="nr-technical-event-action">{human(entry.action)}</p>
                  {entry.text && <p className="nr-prewrap">{entry.text}</p>}
                </>
              )}
              <p className={compact ? "nr-technical-event-meta" : "text-sm nr-muted"}>
                {entry.date ? (
                  <time dateTime={entry.date}>{sourceDate(entry.date)}</time>
                ) : (
                  "Data não informada"
                )}
                {entry.author && ` · ${entry.author}${compact ? "" : " (autoria histórica)"}`}
              </p>
              {!compact && (
                <>
                  <h4 className="font-semibold mt-1">{human(entry.action)}</h4>
                  {entry.text && <p className="nr-prewrap mt-1">{entry.text}</p>}
                </>
              )}
              {Object.keys(entry.extra).length > 0 && (
                <NrReadOnlyValue
                  title="Informações complementares preservadas"
                  value={entry.extra as NrJson}
                />
              )}
            </li>
          ))}
        </ol>
      ) : (
        <p className="nr-source">
          Nenhum acontecimento técnico preservado neste registro. A auditoria de operações da Nexus
          é consultada separadamente abaixo.
        </p>
      )}
    </section>
  );
}
