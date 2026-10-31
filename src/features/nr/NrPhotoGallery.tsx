import { useEffect, useRef, useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { useServerFn } from "@tanstack/react-start";
import { ChevronLeft, ChevronRight, Download, X, ZoomIn, ZoomOut } from "lucide-react";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { ActionButton } from "@/components/nexus/Page";
import { nrArquivoBaixar, nrFotoOcorrenciasLer } from "./files.functions";
import { findPhotoOccurrenceLink, photoOccurrences, sourceDate } from "./technical-evidence";
import { NrMediaImage } from "./NrMediaImage";
import { NrStructuredValue } from "./NrStructuredValue";

export function NrPhotoGallery({
  org,
  value,
  context,
  localId,
  title = "Fotos de campo",
  description,
}: {
  org: string;
  value: unknown;
  context: string;
  localId?: string | null;
  title?: string;
  description?: string;
}) {
  const occurrenceLoad = useServerFn(nrFotoOcorrenciasLer);
  const occurrenceQuery = useQuery({
    queryKey: ["nr", org, "foto-ocorrencias", localId],
    enabled: !!localId,
    queryFn: () => occurrenceLoad({ data: { organization_id: org, local_id: localId! } }),
    staleTime: 30_000,
    retry: false,
  });
  const photos = photoOccurrences(value).map((photo, index) => {
    const link = findPhotoOccurrenceLink(occurrenceQuery.data || [], photo.sourcePath, index);
    return link
      ? {
          ...photo,
          key: `${link.id}:${photo.key}`,
          fileId: link.arquivo_id || photo.fileId,
          thumbnailFileId: link.miniatura_arquivo_id || photo.thumbnailFileId,
        }
      : photo;
  });
  const [selected, setSelected] = useState<number | null>(null);
  const [zoom, setZoom] = useState(1);
  const [originalAvailable, setOriginalAvailable] = useState<boolean | null>(null);
  const opener = useRef<HTMLButtonElement | null>(null);
  useEffect(() => {
    setSelected(null);
    setZoom(1);
    setOriginalAvailable(null);
  }, [org, localId, context]);
  const current = selected === null ? null : photos[selected];
  function move(step: number) {
    setSelected((index) =>
      index === null ? null : Math.max(0, Math.min(photos.length - 1, index + step)),
    );
    setZoom(1);
    setOriginalAvailable(null);
  }
  return (
    <section aria-label={`${title} · ${context}`}>
      <div className="nr-panel-header mb-3">
        <h3 className="font-semibold">{title}</h3>
        <span className="nr-badge">
          {photos.length} {photos.length === 1 ? "vínculo" : "vínculos"}
        </span>
      </div>
      <p className="nr-muted mb-4">
        {description ?? (
          <>
            {context}. Legendas e associações de cada ocorrência são preservadas, inclusive quando
            um arquivo é compartilhado. Imagens extraídas de documentos aparecem separadamente no
            acervo.
          </>
        )}
      </p>
      {photos.length ? (
        <div className="nr-photo-grid">
          {photos.map((photo, index) => (
            <figure key={photo.key} className="nr-photo-card">
              <button
                type="button"
                className="nr-photo-open"
                onClick={(event) => {
                  opener.current = event.currentTarget;
                  setSelected(index);
                  setZoom(1);
                  setOriginalAvailable(null);
                }}
                aria-label={`Abrir foto ${index + 1}: ${photo.caption || "Sem legenda na origem"}`}
              >
                <NrMediaImage
                  key={`${org}:${photo.key}:${photo.fileId}`}
                  org={org}
                  fileId={photo.fileId || photo.thumbnailFileId}
                  variant={!photo.fileId && photo.thumbnailFileId ? "original" : undefined}
                  fallbackFileId={photo.fileId ? photo.thumbnailFileId : null}
                  alt={photo.caption || "Foto de campo sem legenda"}
                />
              </button>
              <figcaption className="nr-photo-caption">
                <PhotoCaption caption={photo.caption} index={index} />
                <span className="nr-photo-context">{context}</span>
                <span className="block text-sm nr-muted mt-1">
                  {photo.category} · {sourceDate(photo.date)}
                </span>
                {photo.author && (
                  <span className="block text-sm nr-muted">{photo.author} · autoria histórica</span>
                )}
                <span className="nr-photo-availability">
                  {photo.fileId
                    ? "Arquivo vinculado ao acervo"
                    : photo.thumbnailFileId
                      ? "Prévia da origem disponível · original pendente"
                      : "Original e miniatura ainda não recuperados"}
                </span>
              </figcaption>
            </figure>
          ))}
        </div>
      ) : (
        <p className="nr-source">
          Nenhuma referência de foto de campo preservada para este contexto.
        </p>
      )}
      <Dialog
        open={!!current}
        onOpenChange={(open) => {
          if (!open) setSelected(null);
        }}
      >
        <DialogContent
          className="nr-photo-dialog w-[calc(100%_-_1rem)] sm:max-w-6xl max-h-[95dvh] overflow-y-auto"
          onCloseAutoFocus={(event) => {
            if (opener.current?.isConnected) {
              event.preventDefault();
              opener.current.focus();
            }
          }}
          onKeyDown={(event) => {
            if (
              event.target instanceof HTMLElement &&
              event.target.closest("input, textarea, select, [contenteditable=true]")
            )
              return;
            if (event.key === "ArrowLeft") {
              event.preventDefault();
              move(-1);
            }
            if (event.key === "ArrowRight") {
              event.preventDefault();
              move(1);
            }
          }}
        >
          <DialogHeader>
            <DialogTitle>{current?.caption || "Foto de campo"}</DialogTitle>
            <DialogDescription>
              {context} · {selected === null ? 0 : selected + 1} de {photos.length}
            </DialogDescription>
          </DialogHeader>
          {current && (
            <>
              <div className="nr-actions">
                <ActionButton variant="ghost" disabled={selected === 0} onClick={() => move(-1)}>
                  <ChevronLeft size={16} />
                  Anterior
                </ActionButton>
                <ActionButton
                  variant="ghost"
                  disabled={selected === photos.length - 1}
                  onClick={() => move(1)}
                >
                  Próxima
                  <ChevronRight size={16} />
                </ActionButton>
                <ActionButton
                  variant="ghost"
                  disabled={!(current.fileId || current.thumbnailFileId) || zoom <= 1}
                  onClick={() => setZoom(Math.max(1, zoom - 0.5))}
                  aria-label="Diminuir imagem"
                >
                  <ZoomOut size={16} />
                </ActionButton>
                <span aria-live="polite">{Math.round(zoom * 100)}%</span>
                <ActionButton
                  variant="ghost"
                  disabled={!(current.fileId || current.thumbnailFileId) || zoom >= 3}
                  onClick={() => setZoom(Math.min(3, zoom + 0.5))}
                  aria-label="Ampliar imagem"
                >
                  <ZoomIn size={16} />
                </ActionButton>
                <ActionButton variant="ghost" onClick={() => setSelected(null)}>
                  <X size={16} />
                  Fechar
                </ActionButton>
              </div>
              <div className="nr-photo-expanded">
                <div className="nr-photo-viewport">
                  <NrMediaImage
                    key={`${org}:${current.key}:${current.fileId}`}
                    org={org}
                    fileId={current.fileId || current.thumbnailFileId}
                    alt={current.caption || "Foto de campo sem legenda"}
                    full
                    zoom={zoom}
                    onOriginalAvailabilityChange={setOriginalAvailable}
                  />
                </div>
                <div className="nr-photo-expanded-caption">
                  <p>{current.caption || "Legenda não informada na origem"}</p>
                  <p className="nr-muted">
                    {current.category} · {sourceDate(current.date)}
                  </p>
                  {current.author && (
                    <p className="nr-muted">{current.author} · autoria histórica</p>
                  )}
                  {originalAvailable === false && (
                    <p className="nr-photo-availability">
                      Prévia da origem. O original permanece pendente de recuperação.
                    </p>
                  )}
                  {current.fileId && originalAvailable === true && (
                    <OriginalDownload org={org} fileId={current.fileId} />
                  )}
                  {current.fileId && originalAvailable === null && (
                    <p className="nr-muted">
                      A disponibilidade do original ainda não foi confirmada neste acesso.
                    </p>
                  )}
                </div>
              </div>
              {(current.sourcePath ||
                current.thumbnailPath ||
                Object.keys(current.extra).length > 0) && (
                <details className="text-sm">
                  <summary className="cursor-pointer">Referências preservadas da origem</summary>
                  <p className="break-all mt-2">
                    Original: {current.sourcePath || "Não informado"}
                  </p>
                  <p className="break-all">Miniatura: {current.thumbnailPath || "Não informada"}</p>
                  <p className="nr-muted mt-2">
                    Uma referência de caminho não confirma a disponibilidade dos bytes. O vínculo ao
                    acervo exige correspondência comprovada.
                  </p>
                  {Object.keys(current.extra).length > 0 && (
                    <NrStructuredValue title="Informações complementares" value={current.extra} />
                  )}
                </details>
              )}
            </>
          )}
        </DialogContent>
      </Dialog>
    </section>
  );
}
function PhotoCaption({ caption, index }: { caption: string; index: number }) {
  if (caption.length <= 240)
    return (
      <strong className="nr-photo-legend">
        {caption || `Foto ${index + 1} · legenda não informada`}
      </strong>
    );
  return (
    <details className="nr-photo-long-caption">
      <summary>
        <strong className="nr-photo-legend">{caption.slice(0, 240)}…</strong>
        <span>Ver legenda completa</span>
      </summary>
      <p>{caption}</p>
    </details>
  );
}
function OriginalDownload({ org, fileId }: { org: string; fileId: string }) {
  const load = useServerFn(nrArquivoBaixar);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const guard = useRef(false);
  const generation = useRef({ id: 0 });
  useEffect(() => {
    const current = generation.current;
    current.id++;
    return () => {
      current.id++;
    };
  }, [org, fileId]);
  async function download() {
    if (guard.current) return;
    guard.current = true;
    setBusy(true);
    setError("");
    const requestedGeneration = generation.current.id;
    try {
      // Request a fresh authorization/signature at the moment of download, never a stale URL.
      const response = await load({
        data: { organization_id: org, id: fileId, visualizar: false },
      });
      if (requestedGeneration !== generation.current.id) return;
      if (response.arquivo.origem_metadata?.["tipo"] === "miniatura_origem")
        throw new Error("Este arquivo é uma prévia da origem; o original continua pendente.");
      const link = document.createElement("a");
      link.href = response.url;
      link.download = response.arquivo.nome;
      link.target = "_blank";
      link.rel = "noopener noreferrer";
      link.referrerPolicy = "no-referrer";
      document.body.append(link);
      link.click();
      link.remove();
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : "Download indisponível neste acesso.");
    } finally {
      guard.current = false;
      setBusy(false);
    }
  }
  return (
    <div>
      <ActionButton
        className="nr-photo-download"
        variant="ghost"
        loading={busy}
        onClick={() => void download()}
      >
        <Download size={16} aria-hidden /> Baixar original
      </ActionButton>
      {error && (
        <p className="nr-feedback" role="alert">
          {error}
        </p>
      )}
    </div>
  );
}
