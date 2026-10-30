import { lazy, Suspense, useRef, useState } from "react";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { useServerFn } from "@tanstack/react-start";
import { Archive, Download, FileUp, FolderInput, Pencil, RotateCcw, X } from "lucide-react";
import { ActionButton, EmptyState, ErrorState, LoadingState } from "@/components/nexus/Page";
import { supabase } from "@/integrations/supabase/client";
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

type FileRow = {
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
};
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
  pastaId,
  localId,
  canUpload,
  canConvert = false,
  documentoVersion,
  canEdit = false,
  canMove = false,
  canArchive = false,
  canRestore = false,
}: {
  org: string;
  norma: Norma;
  clienteId: string;
  unidadeId: string;
  documentoId?: string | undefined;
  pastaId?: string | undefined;
  localId?: string | undefined;
  canUpload: boolean;
  canConvert?: boolean;
  documentoVersion?: number | undefined;
  canEdit?: boolean;
  canMove?: boolean;
  canArchive?: boolean;
  canRestore?: boolean;
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
      pastaId,
      localId,
      trash,
      page,
    ],
    queryFn: ({ signal }) =>
      listFn({
        data: {
          organization_id: org,
          norma,
          cliente_id: clienteId,
          unidade_id: unidadeId,
          documento_id: documentoId,
          pasta_id: pastaId,
          local_id: localId,
          pagina: page,
          limite: 20,
          lixeira: trash,
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
    try {
      if (!clienteId || !unidadeId)
        throw new Error("Selecione cliente e unidade antes de enviar arquivos.");
      if (file.size > limits.data.max_bytes || file.size === 0)
        throw new Error(`O arquivo precisa conter bytes e ter até ${size(limits.data.max_bytes)}.`);
      setPhase("Preparação: calculando a integridade dos bytes…");
      const checksum = await hash(file);
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
      await confirm({ data: { organization_id: org, id: prepared.arquivo.id } });
      uploadKeys.current.delete(payloadKey);
      setPending(null);
      setNotice("Arquivo confirmado: bytes, tamanho e SHA-256 verificados no servidor.");
      await qc.invalidateQueries({ queryKey: ["nr", org] });
    } catch (e) {
      setError(e instanceof Error ? e : new Error("Não foi possível confirmar o arquivo."));
      await list.refetch();
    } finally {
      setBusy(false);
      setPhase("");
      guard.current = false;
      if (picker.current) picker.current.value = "";
    }
  }
  async function open(file: FileRow, previewOnly: boolean) {
    setError(null);
    try {
      const result = await download({
        data: { organization_id: org, id: file.id, visualizar: previewOnly },
      });
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
        </div>
      </div>
      <div className="nr-actions mb-4">
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
          <ul className="nr-record-list">
            {(rows ?? []).map((file) => {
              const confirmed = file.estado === "vinculado" && file.bytes_verificados === true;
              return (
                <li key={file.id} className="py-4">
                  <div className="nr-panel-header">
                    <div>
                      <strong>{file.nome_exibicao || file.nome}</strong>
                      <p className="nr-muted">
                        {size(file.tamanho)} · {file.mime} · {file.papel ?? "arquivo"} ·{" "}
                        {file.estado}
                      </p>
                    </div>
                    <div className="nr-actions">
                      {file.estado === "arquivado" ? (
                        canRestore && (
                          <ActionButton
                            variant="ghost"
                            onClick={() => setManagement({ row: file, comando: "restaurar" })}
                          >
                            <RotateCcw size={15} />
                            Restaurar
                          </ActionButton>
                        )
                      ) : (
                        <>
                          {canEdit && (
                            <ActionButton
                              variant="ghost"
                              onClick={() => setManagement({ row: file, comando: "renomear" })}
                            >
                              <Pencil size={15} />
                              Nome de exibição
                            </ActionButton>
                          )}
                          {canMove && (
                            <ActionButton
                              variant="ghost"
                              onClick={() => setManagement({ row: file, comando: "mover" })}
                            >
                              <FolderInput size={15} />
                              Mover
                            </ActionButton>
                          )}
                          {canArchive && (
                            <ActionButton
                              variant="ghost"
                              onClick={() => setManagement({ row: file, comando: "arquivar" })}
                            >
                              <Archive size={15} />
                              Arquivar
                            </ActionButton>
                          )}
                        </>
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
                          <ActionButton variant="ghost" onClick={() => void open(file, false)}>
                            <Download size={15} />
                            Baixar
                          </ActionButton>
                          {(file.mime === "application/pdf" || file.mime.startsWith("image/")) && (
                            <ActionButton variant="ghost" onClick={() => void open(file, true)}>
                              Pré-visualizar
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
              hint="Um link de origem não é contado como arquivo migrado. A confirmação exige os bytes e a verificação de integridade."
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
            <iframe
              title={`Prévia PDF: ${preview.arquivo.nome}`}
              sandbox=""
              referrerPolicy="no-referrer"
              loading="lazy"
              src={preview.url}
              className="w-full min-h-[65vh] border border-border"
            />
          )}
        </section>
      )}
    </section>
  );
}
