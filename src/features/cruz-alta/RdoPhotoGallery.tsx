import { useEffect, useMemo, useRef, useState } from "react";
import { useServerFn } from "@tanstack/react-start";
import { Camera, ChevronLeft, ChevronRight, ImageOff, Maximize2, RefreshCw, X } from "lucide-react";
import { cruzAlta } from "./context";
import { technicalTitle } from "./inspection-display";
import type { CaInspectionLine } from "./inspection-domain";
import { objects } from "./manifest";
import { caRdoPhoto } from "./rdo-photos.functions";
import type { RdoPhoto } from "./rdo-photos";
import type { CruzObject } from "./scene-types";
import type { useRdoPhotos } from "./use-rdo-photos";

const pageSize = 6;
const thumbnailCacheSize = 2 * pageSize;
const titleOrder = new Intl.Collator("pt-BR", { numeric: true });
const categories = [
  { id: "montagem", label: "Registro de montagem" },
  { id: "lancada", label: "Lançadas no RDO" },
] as const;
const linesByCode = new Map<string, CruzObject>(
  objects.flatMap((item) =>
    item.kind === "lvhf" && item.code ? [[item.code, item] as const] : [],
  ),
);
function photoKey(photo: RdoPhoto) {
  return `${photo.folderId}/${photo.id}`;
}

function photoVersion(photo: RdoPhoto) {
  return `${photoKey(photo)}/${photo.version}`;
}

function useBlobUrl(blob: Blob | undefined) {
  const [url, setUrl] = useState<{ blob: Blob; src: string }>();
  useEffect(() => {
    if (!blob) {
      setUrl(undefined);
      return;
    }
    const src = URL.createObjectURL(blob);
    setUrl({ blob, src });
    return () => URL.revokeObjectURL(src);
  }, [blob]);
  return blob && url?.blob === blob ? url.src : undefined;
}

function PhotoImage({
  chave,
  photo,
  preview,
  eager = false,
  thumbnails,
}: {
  chave: string;
  photo: RdoPhoto;
  preview: boolean;
  eager?: boolean;
  thumbnails: Map<string, Blob>;
}) {
  const getPhoto = useServerFn(caRdoPhoto);
  const frame = useRef<HTMLDivElement>(null);
  const key = photoVersion(photo);
  const thumbnail = thumbnails.get(key);
  const [nearViewport, setNearViewport] = useState(false);
  const viewable = !preview || eager || nearViewport || !!thumbnail;
  const [image, setImage] = useState<Blob>();
  const src = useBlobUrl(image ?? (preview ? thumbnail : undefined));
  const placeholder = useBlobUrl(preview ? undefined : thumbnail);
  const [loaded, setLoaded] = useState(false);
  const [failed, setFailed] = useState(false);
  const [attempt, setAttempt] = useState(0);

  useEffect(() => {
    if (viewable || !frame.current) return;
    const observer = new IntersectionObserver(
      ([entry]) => {
        if (entry?.isIntersecting) setNearViewport(true);
      },
      { rootMargin: "96px 0px" },
    );
    observer.observe(frame.current);
    return () => observer.disconnect();
  }, [viewable]);

  const { id, folderId, version, path } = photo;
  useEffect(() => {
    if (!viewable || (preview && thumbnails.has(key))) return;
    const controller = new AbortController();
    async function load() {
      try {
        const response = await getPhoto({
          data: {
            organization_id: cruzAlta.org,
            chave,
            id,
            folderId,
            version,
            path,
            preview,
          },
          signal: controller.signal,
        });
        if (!response.ok) throw new Error("Imagem indisponível.");
        const blob = await response.blob();
        if (controller.signal.aborted) return;
        if (preview) {
          thumbnails.set(key, blob);
          if (thumbnails.size > thumbnailCacheSize) {
            const oldest = thumbnails.keys().next().value;
            if (oldest !== undefined) thumbnails.delete(oldest);
          }
        }
        setImage(blob);
      } catch {
        if (!controller.signal.aborted) setFailed(true);
      }
    }
    void load();
    return () => controller.abort();
  }, [attempt, chave, folderId, getPhoto, id, key, path, preview, thumbnails, version, viewable]);

  const pending = viewable && !loaded && !failed;

  return (
    <div className="ca-rdo-image" ref={frame} aria-busy={pending}>
      {placeholder && !loaded && (
        <img src={placeholder} alt="" aria-hidden="true" className="ca-rdo-placeholder" />
      )}
      {src && !failed && (
        <img
          key={src}
          src={src}
          alt={preview ? "" : photo.name}
          aria-hidden={!loaded || undefined}
          className="ca-rdo-rendered"
          data-loaded={loaded}
          decoding="async"
          onLoad={() => setLoaded(true)}
          onError={() => {
            if (preview) thumbnails.delete(key);
            setFailed(true);
          }}
        />
      )}
      {failed ? (
        <div className="ca-rdo-image-state">
          <ImageOff size={22} aria-hidden="true" />
          <span role={preview ? undefined : "status"}>
            {preview ? "Sem miniatura" : "Não foi possível abrir o original."}
          </span>
          {!preview && (
            <button
              className="ca-action"
              type="button"
              onClick={() => {
                setFailed(false);
                setLoaded(false);
                setImage(undefined);
                setAttempt((count) => count + 1);
              }}
            >
              Tentar abrir novamente
            </button>
          )}
        </div>
      ) : !loaded ? (
        <div className="ca-rdo-image-state">
          {!placeholder && <Camera size={22} aria-hidden="true" />}
          {!preview && <span role="status">Carregando original…</span>}
        </div>
      ) : null}
    </div>
  );
}

export function RdoPhotoGallery({
  object,
  inspections,
  photos: query,
}: {
  object: CruzObject;
  inspections: ReadonlyMap<string, CaInspectionLine>;
  photos: ReturnType<typeof useRdoPhotos>;
}) {
  const [thumbnails] = useState(() => new Map<string, Blob>());
  const [page, setPage] = useState(0);
  const [active, setActive] = useState<string>();
  const closeButton = useRef<HTMLButtonElement>(null);
  const openedFrom = useRef<HTMLButtonElement | null>(null);
  const heading = useRef<HTMLHeadingElement>(null);
  const sessionDenied = query.error?.message.startsWith("Unauthorized:") ?? false;
  const listing = sessionDenied ? undefined : query.data;
  const photos = useMemo(
    () =>
      [...(listing?.photos ?? [])].sort(
        (a, b) =>
          titleOrder.compare(a.code, b.code) ||
          b.category.localeCompare(a.category) ||
          b.modifiedAt.localeCompare(a.modifiedAt) ||
          titleOrder.compare(a.name, b.name),
      ),
    [listing?.photos],
  );
  const currentIndex = photos.findIndex((photo) => photoKey(photo) === active);
  const current = photos[currentIndex];
  const viewing = !!current;
  const lastPage = Math.max(0, Math.ceil(photos.length / pageSize) - 1);
  const currentPage = Math.min(page, lastPage);
  const pageStart = currentPage * pageSize;

  useEffect(() => {
    const current = new Set(photos.map(photoVersion));
    for (const key of thumbnails.keys()) {
      if (!current.has(key)) thumbnails.delete(key);
    }
  }, [photos, thumbnails]);

  useEffect(() => {
    if (viewing) closeButton.current?.focus();
    else if (openedFrom.current) {
      const target = openedFrom.current.isConnected ? openedFrom.current : heading.current;
      target?.focus();
      openedFrom.current = null;
      setActive(undefined);
    }
  }, [viewing]);

  if (sessionDenied || (!query.isPending && !query.isError && !listing?.partial && !photos.length))
    return null;

  function lineTitle(code: string) {
    const item = linesByCode.get(code);
    return item ? technicalTitle(item, inspections.get(item.id)) : code;
  }

  function goToPhoto(index: number) {
    const next = photos[index];
    if (!next) return;
    setActive(photoKey(next));
    setPage(Math.floor(index / pageSize));
  }

  const groups = new Map<string, RdoPhoto[]>();
  for (const photo of photos.slice(pageStart, pageStart + pageSize)) {
    const matched = groups.get(photo.code);
    if (matched) matched.push(photo);
    else groups.set(photo.code, [photo]);
  }

  return (
    <section className="ca-detail-section ca-rdo-photos" aria-labelledby="ca-rdo-photos-heading">
      <div className="ca-rdo-head">
        <h3 id="ca-rdo-photos-heading" ref={heading} tabIndex={-1}>
          <Camera size={17} aria-hidden="true" /> Fotos de montagem
        </h3>
        {!query.isPending && !viewing && (
          <button
            className="ca-rdo-control"
            type="button"
            aria-label="Atualizar fotos"
            title="Atualizar fotos"
            disabled={query.isFetching}
            onClick={() => void query.refetch()}
          >
            <RefreshCw size={16} aria-hidden="true" />
          </button>
        )}
      </div>
      {query.isPending && (
        <div className="ca-rdo-list-loading" role="status">
          <span>Buscando fotos de montagem…</span>
          <div aria-hidden="true">
            <i />
            <i />
            <i />
          </div>
        </div>
      )}
      {query.isError ? (
        <p role="status">Não foi possível atualizar as fotos.</p>
      ) : listing?.partial ? (
        <p role="status">Parte das fotos está temporariamente indisponível.</p>
      ) : null}
      {current && (
        <div
          className="ca-rdo-viewer"
          role="group"
          aria-label="Visualizador de fotos"
          onKeyDown={(event) => {
            if (event.key === "Escape") setActive(undefined);
            else if (event.key === "ArrowLeft") goToPhoto(currentIndex - 1);
            else if (event.key === "ArrowRight") goToPhoto(currentIndex + 1);
            else return;
            event.preventDefault();
          }}
        >
          <div className="ca-rdo-viewer-bar">
            <button
              className="ca-rdo-control"
              type="button"
              aria-label="Foto anterior"
              title="Foto anterior"
              aria-disabled={currentIndex === 0}
              onClick={() => goToPhoto(currentIndex - 1)}
            >
              <ChevronLeft size={22} aria-hidden="true" />
            </button>
            <span role="status">
              {currentIndex + 1} de {photos.length}
            </span>
            <button
              className="ca-rdo-control"
              type="button"
              aria-label="Próxima foto"
              title="Próxima foto"
              aria-disabled={currentIndex + 1 >= photos.length}
              onClick={() => goToPhoto(currentIndex + 1)}
            >
              <ChevronRight size={22} aria-hidden="true" />
            </button>
            <button
              ref={closeButton}
              className="ca-rdo-control ca-rdo-close"
              type="button"
              aria-label="Fechar foto"
              title="Fechar foto"
              onClick={() => setActive(undefined)}
            >
              <X size={20} aria-hidden="true" />
            </button>
          </div>
          <PhotoImage
            key={photoVersion(current)}
            chave={object.id}
            photo={current}
            preview={false}
            thumbnails={thumbnails}
          />
          <div className="ca-rdo-caption">
            <strong>{current.name}</strong>
            <small>
              {lineTitle(current.code)} ·{" "}
              {categories.find(({ id }) => id === current.category)?.label}
            </small>
          </div>
        </div>
      )}
      <div hidden={viewing}>
        {[...groups.entries()].map(([code, group]) => (
          <div className="ca-rdo-tag" key={code}>
            {object.kind !== "lvhf" && <h4>{lineTitle(code)}</h4>}
            {categories.map(({ id, label }) => {
              const matches = group.filter(({ category }) => category === id);
              if (!matches.length) return null;
              return (
                <div className="ca-rdo-category" key={id}>
                  <strong>{label}</strong>
                  <ul>
                    {matches.map((photo) => (
                      <li key={photoVersion(photo)}>
                        <button
                          type="button"
                          className="ca-rdo-card"
                          aria-label={`Abrir foto ${photo.name}`}
                          title={photo.name}
                          onClick={(event) => {
                            openedFrom.current = event.currentTarget;
                            setActive(photoKey(photo));
                          }}
                        >
                          <PhotoImage
                            chave={object.id}
                            photo={photo}
                            preview
                            eager={currentPage === 0 && photo === photos[0]}
                            thumbnails={thumbnails}
                          />
                          <span className="ca-rdo-card-label">
                            <span>{photo.name}</span>
                            <Maximize2 size={15} aria-hidden="true" />
                          </span>
                        </button>
                      </li>
                    ))}
                  </ul>
                </div>
              );
            })}
          </div>
        ))}
        {lastPage > 0 && (
          <div className="ca-rdo-pagination" role="group" aria-label="Páginas de fotos">
            <button
              className="ca-rdo-control"
              type="button"
              aria-label="Página anterior de fotos"
              disabled={!currentPage}
              onClick={() => setPage(currentPage - 1)}
            >
              <ChevronLeft size={20} aria-hidden="true" />
            </button>
            <span role="status">
              Página {currentPage + 1} de {lastPage + 1}
            </span>
            <button
              className="ca-rdo-control"
              type="button"
              aria-label="Próxima página de fotos"
              disabled={currentPage === lastPage}
              onClick={() => setPage(currentPage + 1)}
            >
              <ChevronRight size={20} aria-hidden="true" />
            </button>
          </div>
        )}
      </div>
    </section>
  );
}
