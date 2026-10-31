import { lazy, Suspense, useEffect, useRef, useState } from "react";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { useServerFn } from "@tanstack/react-start";
import {
  Archive,
  Download,
  FileUp,
  FolderInput,
  MoreHorizontal,
  Pencil,
  RotateCcw,
  X,
  Image,
  FileText,
  Grid2X2,
  List,
} from "lucide-react";
import { ActionButton, EmptyState, ErrorState, LoadingState } from "@/components/nexus/Page";
import { supabase } from "@/integrations/supabase/client";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { sourceDate } from "./technical-evidence";
import { nrFileContextSummaries } from "./file-context";
import { NrFileManageDialog, type ManagedNrFile, type NrFileOperation } from "./NrFileManageDialog";
import type { Norma } from "./domain";
import {
  nrArquivoLimites,
  nrArquivosListar,
  nrArquivoPreparar,
  nrArquivoConfirmar,
  nrArquivoRetomar,
  nrArquivoBaixar,
  nrArquivoCancelar,
} from "./files.functions";

const NrDocxConvertButton = lazy(() =>
  import("./NrDocumentActions").then((module) => ({ default: module.NrDocxConvertButton })),
);
const NrOriginalPreview = lazy(() =>
  import("./NrOriginalPreview").then((module) => ({ default: module.NrOriginalPreview })),
);
const NrFileVersions = lazy(() =>
  import("./NrFileVersions").then((module) => ({ default: module.NrFileVersions })),
);

export type NrSelectableFile = {
  id: string;
  nome: string;
  nome_exibicao?: string | null;
  version: number;
  pasta_id?: string | null;
  mime: string;
  tamanho: number;
  sha256: string;
  estado: string;
  papel?: string;
  bytes_verificados?: boolean;
  origem_metadata?: Record<string, unknown> | undefined;
  contextos?: Record<string, unknown>[] | undefined;
  documento_id?: string | null | undefined;
  documento_titulo?: string | null | undefined;
  revisao_id?: string | null | undefined;
  revisao_numero?: number | null | undefined;
  local_id?: string | null | undefined;
};
type FileRow = NrSelectableFile;
const size = (bytes: number) => {
  const format = new Intl.NumberFormat("pt-BR", { maximumFractionDigits: 1 });
  return bytes < 1024
    ? `${format.format(bytes)} bytes`
    : bytes < 1024 * 1024
      ? `${format.format(bytes / 1024)} KiB`
      : `${format.format(bytes / 1024 / 1024)} MiB`;
};
const knownMime: Record<string, string> = {
  pdf: "application/pdf",
  png: "image/png",
  jpg: "image/jpeg",
  jpeg: "image/jpeg",
  webp: "image/webp",
  docx: "application/vnd.openxmlformats-officedocument.wordprocessingml.document",
  xlsx: "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
};
async function hash(file: File) {
  return [...new Uint8Array(await crypto.subtle.digest("SHA-256", await file.arrayBuffer()))]
    .map((b) => b.toString(16).padStart(2, "0"))
    .join("");
}
export function NrFilesPanel({
  org,
  norma,
  clienteId,
  unidadeId,
  documentoId,
  revisaoId,
  pastaId,
  localId,
  canUpload,
  canConvert = false,
  documentoVersion,
  canEdit = false,
  canMove = false,
  canArchive = false,
  canRestore = false,
  onFileSelected,
  onFileConfirmed,
}: {
  org: string;
  norma: Norma;
  clienteId: string;
  unidadeId: string;
  documentoId?: string | undefined;
  revisaoId?: string | undefined;
  pastaId?: string | undefined;
  localId?: string | undefined;
  canUpload: boolean;
  canConvert?: boolean;
  documentoVersion?: number | undefined;
  canEdit?: boolean;
  canMove?: boolean;
  canArchive?: boolean;
  canRestore?: boolean;
  onFileSelected?: ((file: NrSelectableFile) => void) | undefined;
  onFileConfirmed?: ((file: NrSelectableFile) => void) | undefined;
}) {
  const limitsFn = useServerFn(nrArquivoLimites),
    listFn = useServerFn(nrArquivosListar),
    prepare = useServerFn(nrArquivoPreparar),
    confirm = useServerFn(nrArquivoConfirmar),
    resume = useServerFn(nrArquivoRetomar),
    download = useServerFn(nrArquivoBaixar),
    cancel = useServerFn(nrArquivoCancelar);
  const qc = useQueryClient();
  const picker = useRef<HTMLInputElement>(null);
  const [page, setPage] = useState(0);
  const [trash, setTrash] = useState(false);
  const [view, setView] = useState<"list" | "grid">("list");
  const [allRevisions, setAllRevisions] = useState(false);
  const [search, setSearch] = useState("");
  const [appliedSearch, setAppliedSearch] = useState("");
  const [management, setManagement] = useState<{
    row: ManagedNrFile;
    comando: NrFileOperation;
  } | null>(null);
  const [pending, setPending] = useState<FileRow | null>(null);
  const [phase, setPhase] = useState("");
  const [error, setError] = useState<Error | null>(null);
  const [notice, setNotice] = useState("");
  const [busy, setBusy] = useState(false);
  const guard = useRef(false);
  const uploadKeys = useRef(new Map<string, { chave: string; id?: string }>());
  const [preview, setPreview] = useState<{ url: string; arquivo: FileRow } | null>(null);
  const [paper, setPaper] = useState<"original" | "derivado" | "foto" | "anexo" | "representacao">(
    "original",
  );
  const scopeKey = JSON.stringify([
    org,
    norma,
    clienteId,
    unidadeId,
    documentoId,
    revisaoId,
    pastaId,
    localId,
  ]);
  const currentScope = useRef(scopeKey);
  currentScope.current = scopeKey;
  const selectedRevision = documentoId && !allRevisions ? revisaoId : undefined;
  useEffect(() => {
    setPage(0);
    setPreview(null);
    setSearch("");
    setAppliedSearch("");
    setPending(null);
    setManagement(null);
    setError(null);
    setNotice("");
    setAllRevisions(false);
  }, [scopeKey]);
  const limits = useQuery({
    queryKey: ["nr", org, "arquivo-limites"],
    queryFn: ({ signal }) => limitsFn({ data: { organization_id: org }, signal }),
    retry: false,
  });
  const list = useQuery({
    queryKey: [
      "nr",
      org,
      norma,
      "arquivos",
      clienteId,
      unidadeId,
      documentoId,
      selectedRevision,
      pastaId,
      localId,
      trash,
      page,
      appliedSearch,
    ],
    queryFn: ({ signal }) =>
      listFn({
        data: {
          organization_id: org,
          norma,
          cliente_id: clienteId || undefined,
          unidade_id: unidadeId || undefined,
          documento_id: documentoId,
          revisao_id: selectedRevision,
          pasta_id: pastaId,
          local_id: localId,
          pagina: page,
          limite: 20,
          lixeira: trash,
          busca: appliedSearch,
        },
        signal,
      }),
    retry: false,
  });
  async function upload(file: File) {
    if (guard.current || !limits.data) return;
    guard.current = true;
    setBusy(true);
    setError(null);
    setNotice("");
    const requestedScope = scopeKey;
    try {
      if (!clienteId || !unidadeId)
        throw new Error("Selecione cliente e unidade antes de enviar arquivos.");
      if (file.size > limits.data.max_bytes || file.size === 0)
        throw new Error(`O arquivo precisa conter bytes e ter até ${size(limits.data.max_bytes)}.`);
      setPhase("Preparação: calculando a integridade dos bytes…");
      const checksum = await hash(file);
      if (currentScope.current !== requestedScope)
        throw new Error("O contexto mudou. Selecione o arquivo novamente no vínculo correto.");
      if (pending && (pending.sha256 !== checksum || pending.tamanho !== file.size))
        throw new Error(
          "Selecione o mesmo arquivo original para retomar este envio. Os bytes escolhidos têm outro tamanho ou hash.",
        );
      const extension = file.name.split(".").pop()?.toLowerCase() ?? "";
      const mime = knownMime[extension] ?? file.type;
      const payloadKey = JSON.stringify([
        org,
        norma,
        clienteId,
        unidadeId,
        documentoId,
        revisaoId,
        pastaId,
        localId,
        file.name,
        mime,
        file.size,
        checksum,
        paper,
      ]);
      const knownKey = uploadKeys.current.get(payloadKey) ?? { chave: crypto.randomUUID() };
      uploadKeys.current.set(payloadKey, knownKey);
      const prepared = pending
        ? await resume({ data: { organization_id: org, id: pending.id } })
        : await prepare({
            data: {
              organization_id: org,
              norma,
              cliente_id: clienteId,
              unidade_id: unidadeId,
              documento_id: documentoId,
              revisao_id: revisaoId,
              pasta_id: pastaId,
              local_id: localId,
              nome: file.name,
              mime,
              tamanho: file.size,
              sha256: checksum,
              chave: knownKey.chave,
              papel: paper,
            },
          });
      if (currentScope.current !== requestedScope)
        throw new Error(
          "O contexto mudou durante a preparação. O envio anterior permanece recuperável no seu contexto.",
        );
      knownKey.id = prepared.arquivo.id;
      setPending(prepared.arquivo);
      if (prepared.token) {
        setPhase("Transferência: enviando ao acervo privado…");
        const response = await supabase.storage
          .from(prepared.bucket)
          .uploadToSignedUrl(prepared.caminho, prepared.token, file, {
            contentType: mime,
            upsert: false,
          });
        if (
          response.error &&
          !["409", "Duplicate"].includes(
            String((response.error as { statusCode?: string }).statusCode),
          )
        )
          throw response.error;
      }
      setPhase("Verificação: conferindo MIME, tamanho, hash e vínculo no servidor…");
      const confirmed = await confirm({ data: { organization_id: org, id: prepared.arquivo.id } });
      uploadKeys.current.delete(payloadKey);
      await qc.invalidateQueries({ queryKey: ["nr", org] });
      if (currentScope.current !== requestedScope) return;
      setPending(null);
      setNotice("Arquivo confirmado: bytes, tamanho e SHA-256 verificados no servidor.");
      onFileConfirmed?.(confirmed);
    } catch (e) {
      if (currentScope.current === requestedScope) {
        setError(e instanceof Error ? e : new Error("Não foi possível confirmar o arquivo."));
        await list.refetch();
      }
    } finally {
      setBusy(false);
      setPhase("");
      guard.current = false;
      if (picker.current) picker.current.value = "";
    }
  }
  async function open(file: FileRow, previewOnly: boolean) {
    setError(null);
    const requestedScope = scopeKey;
    try {
      const result = await download({
        data: { organization_id: org, id: file.id, visualizar: previewOnly },
      });
      if (currentScope.current !== requestedScope) return;
      if (previewOnly) setPreview({ url: result.url, arquivo: file });
      else {
        const link = document.createElement("a");
        link.href = result.url;
        link.download = file.nome;
        link.rel = "noopener noreferrer";
        link.target = "_blank";
        document.body.append(link);
        link.click();
        link.remove();
      }
    } catch (e) {
      if (currentScope.current === requestedScope)
        setError(e instanceof Error ? e : new Error("Download indisponível."));
    }
  }
  async function cancelPending(file: FileRow) {
    setError(null);
    try {
      await cancel({
        data: {
          organization_id: org,
          id: file.id,
          motivo: "Cancelamento do envio pendente pela interface",
          chave: crypto.randomUUID(),
        },
      });
      for (const [key, entry] of uploadKeys.current)
        if (entry.id === file.id) uploadKeys.current.delete(key);
      if (pending?.id === file.id) setPending(null);
      await list.refetch();
    } catch (e) {
      setError(e instanceof Error ? e : new Error("Cancelamento indisponível."));
    }
  }
  const rows = list.data?.rows as FileRow[] | undefined;
  return (
    <section className="nr-panel mt-5">
      <div className="nr-panel-header">
        <div>
          <h2>Arquivos e representações</h2>
          <p className="nr-muted">
            Originais privados e derivados são identificados separadamente.
          </p>
          {documentoId && revisaoId && (
            <p className="nr-muted mt-1">
              {allRevisions
                ? "Todas as revisões: cada arquivo mantém a revisão de seu vínculo."
                : "Arquivos vinculados à revisão em consulta. As versões anteriores ficam disponíveis pelo seletor abaixo."}
            </p>
          )}
        </div>
      </div>
      <div className="nr-actions mb-4">
        {documentoId && revisaoId && (
          <label>
            Revisões do documento
            <select
              value={allRevisions ? "all" : "current"}
              onChange={(event) => {
                setAllRevisions(event.target.value === "all");
                setPage(0);
                setPreview(null);
              }}
            >
              <option value="current">Revisão em consulta</option>
              <option value="all">Todas as revisões · histórico</option>
            </select>
          </label>
        )}
        <ActionButton
          variant="ghost"
          onClick={() => {
            setTrash(!trash);
            setPage(0);
          }}
        >
          {trash ? <RotateCcw size={15} /> : <Archive size={15} />}
          {trash ? "Arquivos ativos" : "Lixeira de arquivos"}
        </ActionButton>
        <ActionButton
          variant="ghost"
          aria-pressed={view === "list"}
          onClick={() => setView("list")}
        >
          <List size={16} />
          Lista
        </ActionButton>
        <ActionButton
          variant="ghost"
          aria-pressed={view === "grid"}
          onClick={() => setView("grid")}
        >
          <Grid2X2 size={16} />
          Grade
        </ActionButton>
      </div>
      <div className="nr-actions mb-4">
        <label className="flex-1">
          Buscar neste acervo
          <input
            type="search"
            value={search}
            maxLength={200}
            onChange={(event) => setSearch(event.target.value)}
            onKeyDown={(event) => {
              if (event.key === "Enter") {
                event.preventDefault();
                setPage(0);
                setAppliedSearch(search.trim());
              }
            }}
            placeholder="Nome do arquivo"
          />
        </label>
        <ActionButton
          variant="ghost"
          onClick={() => {
            setPage(0);
            setAppliedSearch(search.trim());
          }}
        >
          Buscar
        </ActionButton>
      </div>
      {limits.isError && <ErrorState error={limits.error} onRetry={() => limits.refetch()} />}
      {canUpload && !trash && (
        <div className="nr-actions mb-4">
          <label>
            Papel do arquivo
            <select
              value={paper}
              disabled={busy}
              onChange={(e) => setPaper(e.target.value as typeof paper)}
            >
              <option value="original">Original</option>
              <option value="representacao">Representação Word/PDF</option>
              <option value="foto">Foto / evidência</option>
              <option value="anexo">Anexo</option>
              <option value="derivado">Derivado</option>
            </select>
          </label>
          <ActionButton
            disabled={busy || !limits.data || !clienteId || !unidadeId}
            onClick={() => {
              setPending(null);
              picker.current?.click();
            }}
          >
            <FileUp size={16} />
            Enviar arquivo
          </ActionButton>
          <input
            ref={picker}
            hidden
            type="file"
            accept={limits.data?.extensoes.map((e) => (e.startsWith(".") ? e : `.${e}`)).join(",")}
            onChange={(e) => {
              const file = e.target.files?.[0];
              if (file) void upload(file);
            }}
          />
          {limits.data && (
            <span className="nr-muted">
              Até {size(limits.data.max_bytes)} · {limits.data.extensoes.join(", ")}
            </span>
          )}
        </div>
      )}
      {phase && (
        <p className="nr-notice" role="status">
          {phase}
        </p>
      )}
      {notice && (
        <p className="nr-notice" role="status">
          {notice}
        </p>
      )}
      {error && (
        <p className="nr-feedback" role="alert">
          {error.message}
        </p>
      )}
      {list.isPending ? (
        <LoadingState />
      ) : list.isError ? (
        <ErrorState error={list.error} onRetry={() => list.refetch()} />
      ) : (
        <>
          <ul
            className={
              view === "grid"
                ? "grid grid-cols-1 sm:grid-cols-2 xl:grid-cols-3 gap-4"
                : "nr-record-list"
            }
          >
            {(rows ?? []).map((file) => {
              const confirmed = file.estado === "vinculado" && file.bytes_verificados === true;
              const associations = nrFileContextSummaries(file, {
                documentoId,
                revisaoId: selectedRevision,
                localId,
                pastaId,
              });
              return (
                <li
                  key={file.id}
                  className={
                    view === "grid" ? "p-3 border border-border rounded-lg min-w-0" : "py-3"
                  }
                >
                  {view === "grid" && (
                    <NrFileThumbnail org={org} file={file} onOpen={() => void open(file, true)} />
                  )}
                  <div className="nr-panel-header">
                    <div>
                      <strong className="break-words">{file.nome_exibicao || file.nome}</strong>
                      <p className="nr-muted">
                        {size(file.tamanho)} ·{" "}
                        {file.mime === "application/pdf"
                          ? "PDF"
                          : file.mime.includes("wordprocessingml")
                            ? "Word"
                            : file.mime.startsWith("image/")
                              ? "Imagem"
                              : "Arquivo"}{" "}
                        ·{" "}
                        {file.papel === "representacao"
                          ? "Representação Word/PDF"
                          : file.papel === "foto"
                            ? "Foto / evidência"
                            : (file.papel ?? "Arquivo")}
                      </p>
                      <p className="text-sm">
                        {confirmed
                          ? file.papel === "derivado"
                            ? "Derivado armazenado e verificado"
                            : file.papel === "original"
                              ? "Original armazenado e verificado"
                              : "Arquivo armazenado e verificado"
                          : file.estado === "arquivado"
                            ? "Arquivado"
                            : file.estado === "falhou"
                              ? "Falha no envio · transferência pendente"
                              : "Transferência ainda não confirmada"}
                      </p>
                      {associations.map((association, index) => (
                        <div key={`${association.revisionId}:${index}`} className="mt-2 text-sm">
                          {association.revisionId && (
                            <p className="nr-badge">
                              {association.documentTitle && `${association.documentTitle} · `}
                              {association.revisionNumber === null
                                ? "Revisão preservada · número não informado"
                                : `Revisão ${association.revisionNumber}`}
                              {revisaoId && association.revisionId !== revisaoId
                                ? " · outra revisão do documento"
                                : ""}
                            </p>
                          )}
                          {association.caption && <p className="mt-1">{association.caption}</p>}
                          {(association.date || association.author) && (
                            <p className="nr-muted">
                              {sourceDate(association.date)}
                              {association.author && ` · ${association.author} (autoria histórica)`}
                            </p>
                          )}
                          {association.category && (
                            <p className="nr-muted">{association.category}</p>
                          )}
                        </div>
                      ))}
                    </div>
                    <div className="nr-actions">
                      {(file.estado === "arquivado"
                        ? canRestore
                        : canEdit || canMove || canArchive) && (
                        <DropdownMenu>
                          <DropdownMenuTrigger asChild>
                            <ActionButton
                              variant="ghost"
                              aria-label={`Organizar ${file.nome_exibicao || file.nome}`}
                            >
                              <MoreHorizontal size={18} />
                              Organizar
                            </ActionButton>
                          </DropdownMenuTrigger>
                          <DropdownMenuContent align="end">
                            {file.estado === "arquivado" ? (
                              canRestore && (
                                <DropdownMenuItem
                                  onSelect={() =>
                                    setManagement({ row: file, comando: "restaurar" })
                                  }
                                >
                                  <RotateCcw size={15} />
                                  Restaurar
                                </DropdownMenuItem>
                              )
                            ) : (
                              <>
                                {canEdit && (
                                  <DropdownMenuItem
                                    onSelect={() =>
                                      setManagement({ row: file, comando: "renomear" })
                                    }
                                  >
                                    <Pencil size={15} />
                                    Renomear
                                  </DropdownMenuItem>
                                )}
                                {canMove && (
                                  <DropdownMenuItem
                                    onSelect={() => setManagement({ row: file, comando: "mover" })}
                                  >
                                    <FolderInput size={15} />
                                    Mover
                                  </DropdownMenuItem>
                                )}
                                {canArchive && (
                                  <DropdownMenuItem
                                    onSelect={() =>
                                      setManagement({ row: file, comando: "arquivar" })
                                    }
                                  >
                                    <Archive size={15} />
                                    Arquivar
                                  </DropdownMenuItem>
                                )}
                              </>
                            )}
                          </DropdownMenuContent>
                        </DropdownMenu>
                      )}
                      {confirmed &&
                        canConvert &&
                        documentoId &&
                        documentoVersion &&
                        file.mime ===
                          "application/vnd.openxmlformats-officedocument.wordprocessingml.document" && (
                          <Suspense
                            fallback={<span className="nr-muted">Carregando conversor…</span>}
                          >
                            <NrDocxConvertButton
                              org={org}
                              norma={norma}
                              documentoId={documentoId}
                              arquivoId={file.id}
                              expectedVersion={documentoVersion}
                            />
                          </Suspense>
                        )}
                      {confirmed ? (
                        <>
                          {onFileSelected && (
                            <ActionButton variant="ghost" onClick={() => onFileSelected(file)}>
                              Usar este arquivo
                            </ActionButton>
                          )}
                          <ActionButton variant="ghost" onClick={() => void open(file, false)}>
                            <Download size={15} />
                            Baixar
                          </ActionButton>
                          {(file.mime === "application/pdf" || file.mime.startsWith("image/")) && (
                            <ActionButton variant="ghost" onClick={() => void open(file, true)}>
                              Abrir original
                            </ActionButton>
                          )}
                        </>
                      ) : file.estado !== "arquivado" && canUpload ? (
                        <>
                          <ActionButton
                            variant="ghost"
                            disabled={busy}
                            onClick={() => {
                              setPending(file);
                              picker.current?.click();
                            }}
                          >
                            <RotateCcw size={15} />
                            Retomar com o original
                          </ActionButton>
                          <ActionButton
                            variant="ghost"
                            disabled={busy}
                            onClick={() => void cancelPending(file)}
                          >
                            Cancelar envio
                          </ActionButton>
                        </>
                      ) : null}
                    </div>
                  </div>
                  <details>
                    <summary className="nr-muted cursor-pointer">
                      Integridade e identidade do arquivo
                    </summary>
                    <p className="nr-muted break-all mt-2">
                      Nome original: {file.nome}
                      <br />
                      ID: {file.id}
                      <br />
                      SHA-256: {file.sha256}
                    </p>
                  </details>
                  <NrFileVersionsDisclosure org={org} norma={norma} file={file} />
                </li>
              );
            })}
          </ul>
          {!rows?.length && (
            <EmptyState
              title={
                trash
                  ? "Nenhum arquivo na lixeira deste vínculo"
                  : "Nenhum arquivo confirmado neste vínculo"
              }
              hint="As referências da origem e os arquivos ainda não obtidos permanecem preservados em seus contextos."
            />
          )}
          <div className="nr-pagination">
            <span>
              {list.data?.total ?? 0} {list.data?.total === 1 ? "arquivo" : "arquivos"}
            </span>
            <div className="nr-actions">
              <ActionButton variant="ghost" disabled={!page} onClick={() => setPage(page - 1)}>
                Anterior
              </ActionButton>
              <ActionButton
                variant="ghost"
                disabled={(page + 1) * 20 >= (list.data?.total ?? 0)}
                onClick={() => setPage(page + 1)}
              >
                Próxima
              </ActionButton>
            </div>
          </div>
        </>
      )}
      {management && (
        <NrFileManageDialog
          org={org}
          norma={norma}
          clienteId={clienteId}
          unidadeId={unidadeId}
          arquivo={management.row}
          comando={management.comando}
          onClose={() => setManagement(null)}
          onSaved={() => {
            setManagement(null);
            setNotice("Organização do arquivo confirmada no servidor.");
            void qc.invalidateQueries({ queryKey: ["nr", org] });
          }}
        />
      )}
      {preview && (
        <section className="nr-panel mt-4">
          <div className="nr-panel-header">
            <h3>{preview.arquivo.nome}</h3>
            <ActionButton variant="ghost" onClick={() => setPreview(null)}>
              <X size={15} />
              Fechar prévia
            </ActionButton>
          </div>
          {preview.arquivo.mime.startsWith("image/") ? (
            <img
              src={preview.url}
              alt={preview.arquivo.nome}
              referrerPolicy="no-referrer"
              className="max-h-[70vh] max-w-full object-contain"
            />
          ) : (
            <Suspense fallback={<LoadingState label="Preparando leitor do original…" />}>
              <NrOriginalPreview
                key={preview.arquivo.id}
                org={org}
                file={preview.arquivo}
                url={preview.url}
              />
            </Suspense>
          )}
          {preview.arquivo.mime.startsWith("image/") && (
            <a
              className="inline-flex min-h-11 items-center gap-2 underline mt-2"
              href={preview.url}
              target="_blank"
              rel="noopener noreferrer"
              referrerPolicy="no-referrer"
            >
              Abrir ou baixar imagem original
            </a>
          )}
        </section>
      )}
    </section>
  );
}

function NrFileVersionsDisclosure({
  org,
  norma,
  file,
}: {
  org: string;
  norma: Norma;
  file: FileRow;
}) {
  const [open, setOpen] = useState(false);
  return (
    <details className="mt-2" onToggle={(event) => setOpen(event.currentTarget.open)}>
      <summary className="nr-muted cursor-pointer">Versões históricas do arquivo na origem</summary>
      {open && (
        <Suspense
          fallback={
            <p className="nr-muted" role="status">
              Consultando versões preservadas…
            </p>
          }
        >
          <NrFileVersions org={org} norma={norma} fileId={file.id} />
        </Suspense>
      )}
    </details>
  );
}

function NrFileThumbnail({
  org,
  file,
  onOpen,
}: {
  org: string;
  file: FileRow;
  onOpen: () => void;
}) {
  const load = useServerFn(nrArquivoBaixar);
  const ref = useRef<HTMLButtonElement>(null);
  const [visible, setVisible] = useState(false);
  const image =
    file.mime.startsWith("image/") &&
    file.estado === "vinculado" &&
    file.bytes_verificados === true;
  useEffect(() => {
    if (!ref.current || !image) return;
    const observer = new IntersectionObserver(
      ([entry]) => {
        if (entry?.isIntersecting) {
          setVisible(true);
          observer.disconnect();
        }
      },
      { rootMargin: "100px" },
    );
    observer.observe(ref.current);
    return () => observer.disconnect();
  }, [image]);
  const query = useQuery({
    queryKey: ["nr", org, "miniatura-arquivo", file.id],
    enabled: visible && image,
    queryFn: () => load({ data: { organization_id: org, id: file.id, visualizar: true } }),
    staleTime: 30_000,
    gcTime: 30_000,
    retry: false,
  });
  return (
    <button
      ref={ref}
      type="button"
      onClick={onOpen}
      disabled={!image && file.mime !== "application/pdf"}
      aria-label={`Abrir ${file.nome_exibicao || file.nome}`}
      className="aspect-[4/3] mb-3 w-full flex items-center justify-center bg-neutral-50 border border-border rounded overflow-hidden"
    >
      {query.data ? (
        <img
          src={query.data.url}
          alt={file.nome_exibicao || file.nome}
          referrerPolicy="no-referrer"
          loading="lazy"
          className="w-full h-full object-cover"
        />
      ) : (
        <span className="nr-muted">
          {image ? <Image size={32} aria-hidden /> : <FileText size={32} aria-hidden />}
          {query.isError && <span className="block mt-1">Prévia indisponível</span>}
        </span>
      )}
    </button>
  );
}
