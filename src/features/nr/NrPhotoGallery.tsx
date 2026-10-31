import { useEffect, useRef, useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { useServerFn } from "@tanstack/react-start";
import { ChevronLeft, ChevronRight, Download, ImageOff, X, ZoomIn, ZoomOut } from "lucide-react";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { ActionButton } from "@/components/nexus/Page";
import { nrArquivoBaixar } from "./files.functions";
import { photoOccurrences, sourceDate, type PhotoOccurrence } from "./technical-evidence";
import { NrStructuredValue } from "./NrStructuredValue";

export function NrPhotoGallery({
  org,
  value,
  context,
  title = "Fotos de campo",
  description,
}: {
  org: string;
  value: unknown;
  context: string;
  title?: string;
  description?: string;
}) {
  const photos = photoOccurrences(value);
  const [selected, setSelected] = useState<number | null>(null);
  const [zoom, setZoom] = useState(1);
  const current = selected === null ? null : photos[selected];
  function move(step: number) {
    setSelected((index) =>
      index === null ? null : Math.max(0, Math.min(photos.length - 1, index + step)),
    );
    setZoom(1);
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
        <div className="grid grid-cols-1 min-[600px]:grid-cols-2 xl:grid-cols-3 gap-4">
          {photos.map((photo, index) => (
            <figure
              key={photo.key}
              className="border border-border rounded-lg overflow-hidden min-w-0"
            >
              <button
                type="button"
                className="block w-full text-left focus-visible:outline-2 focus-visible:outline-emerald-700"
                onClick={() => {
                  setSelected(index);
                  setZoom(1);
                }}
                aria-label={`Abrir foto ${index + 1}: ${photo.caption || "Sem legenda na origem"}`}
              >
                <GalleryImage org={org} photo={photo} />
              </button>
              <figcaption className="p-3">
                <strong className="block">
                  {photo.caption || `Foto ${index + 1} · legenda não informada`}
                </strong>
                <span className="block text-sm nr-muted mt-1">
                  {photo.category} · {sourceDate(photo.date)}
                </span>
                {photo.author && (
                  <span className="block text-sm nr-muted">{photo.author} · autoria histórica</span>
                )}
                {!photo.fileId && (
                  <span className="block text-sm mt-2">Arquivo ainda não recuperado</span>
                )}
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
          className="w-[calc(100%_-_1rem)] sm:max-w-5xl max-h-[95dvh] overflow-y-auto"
          onKeyDown={(event) => {
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
                  disabled={!current.fileId || zoom <= 1}
                  onClick={() => setZoom(Math.max(1, zoom - 0.5))}
                  aria-label="Diminuir imagem"
                >
                  <ZoomOut size={16} />
                </ActionButton>
                <span aria-live="polite">{Math.round(zoom * 100)}%</span>
                <ActionButton
                  variant="ghost"
                  disabled={!current.fileId || zoom >= 3}
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
              <div className="overflow-auto max-h-[65dvh] bg-neutral-50 border border-border rounded-md">
                <GalleryImage key={current.key} org={org} photo={current} full zoom={zoom} />
              </div>
              <p className="text-sm nr-muted">
                {current.category} · {sourceDate(current.date)}
                {current.author && ` · ${current.author} (autoria histórica)`}
              </p>
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
function GalleryImage({
  org,
  photo,
  full = false,
  zoom = 1,
}: {
  org: string;
  photo: PhotoOccurrence;
  full?: boolean;
  zoom?: number;
}) {
  const load = useServerFn(nrArquivoBaixar);
  const container = useRef<HTMLDivElement>(null);
  const [visible, setVisible] = useState(full);
  const [failed, setFailed] = useState(false);
  useEffect(() => {
    if (full || !container.current || !photo.fileId) return;
    const observer = new IntersectionObserver(
      ([entry]) => {
        if (entry?.isIntersecting) {
          setVisible(true);
          observer.disconnect();
        }
      },
      { rootMargin: "150px" },
    );
    observer.observe(container.current);
    return () => observer.disconnect();
  }, [full, photo.fileId]);
  const query = useQuery({
    queryKey: ["nr", org, "foto-autorizada", photo.fileId],
    enabled: visible && !!photo.fileId,
    queryFn: async () => {
      const result = await load({
        data: { organization_id: org, id: photo.fileId!, visualizar: true },
      });
      if (!result.arquivo.mime.startsWith("image/"))
        throw new Error("O vínculo confirmado não é uma imagem.");
      return result;
    },
    staleTime: 30_000,
    gcTime: 30_000,
    retry: false,
  });
  return (
    <div
      ref={container}
      className={
        full
          ? "min-h-48"
          : "aspect-[4/3] bg-neutral-50 flex items-center justify-center overflow-hidden"
      }
    >
      {query.data && !failed ? (
        <div className="w-full">
          <img
            src={query.data.url}
            alt={photo.caption || "Foto de campo sem legenda na origem"}
            loading={full ? "eager" : "lazy"}
            referrerPolicy="no-referrer"
            onError={() => setFailed(true)}
            className={
              full ? "block object-contain mx-auto" : "w-full h-full aspect-[4/3] object-cover"
            }
            style={full ? { width: `${zoom * 100}%`, maxWidth: "none" } : undefined}
          />
          {full && (
            <a
              className="inline-flex items-center gap-2 underline p-3"
              href={query.data.url}
              target="_blank"
              rel="noopener noreferrer"
              download={query.data.arquivo.nome}
            >
              <Download size={16} />
              Abrir ou baixar original autorizado
            </a>
          )}
        </div>
      ) : (
        <div className="p-5 text-center text-sm nr-muted">
          <ImageOff size={28} className="mx-auto mb-2" aria-hidden />
          <p>
            {!photo.fileId
              ? "Referência preservada · arquivo não recuperado"
              : query.isError || failed
                ? "Imagem indisponível para este acesso. O vínculo foi preservado."
                : "Carregando imagem…"}
          </p>
        </div>
      )}
    </div>
  );
}
