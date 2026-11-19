import { useEffect, useRef, useState } from "react";
import { useServerFn } from "@tanstack/react-start";
import { Camera, ChevronLeft, ChevronRight, ImageOff, Maximize2, RefreshCw, X } from "lucide-react";
import { cruzAlta } from "./context";
import { technicalTitle } from "./inspection-display";
import type { CaInspectionLine } from "./inspection-domain";
import { objects } from "./manifest";
import { caRdoPhoto, caRdoThumbnails } from "./rdo-photos.functions";
import { rdoPageSize, type RdoPhoto, type RdoRepresentation } from "./rdo-photos";
import type { CruzObject } from "./scene-types";
import type { useRdoPhotos } from "./use-rdo-photos";

const categories = [
  { id: "montagem", label: "Registro de montagem" },
  { id: "lancada", label: "Lançadas no RDO" },
] as const;
const emptyPhotos: RdoPhoto[] = [];
const linesByCode = new Map<string, CruzObject>(
  objects.flatMap((item) =>
    item.kind === "lvhf" && item.code ? [[item.code, item] as const] : [],
  ),
);
function photoKey(photo: RdoPhoto) {
  return `${photo.folderId}/${photo.id}`;
}
function versionKey(photo: RdoPhoto) {
  return `${photoKey(photo)}/${photo.version}`;
}
function photoRef({ id, folderId, version, path }: RdoPhoto) {
  return { id, folderId, version, path };
}

function useBlobUrl(blob: Blob | undefined) {
  const [url, setUrl] = useState<{ blob: Blob; src: string }>();
  useEffect(() => {
    if (!blob) return;
    const src = URL.createObjectURL(blob);
    setUrl({ blob, src });
    return () => URL.revokeObjectURL(src);
  }, [blob]);
  return blob && url?.blob === blob ? url.src : undefined;
}

function useThumbnails(chave: string, photos: RdoPhoto[], active: boolean, attempt: number) {
  const request = useServerFn(caRdoThumbnails);
  const cache = useRef(new Map<string, Blob>());
  const [state, setState] = useState<{ loaded: Map<string, Blob>; failed: Set<string> }>(() => ({
    loaded: new Map(),
    failed: new Set(),
  }));
  useEffect(() => {
    if (!active) return;
    const controller = new AbortController();
    const present = new Map(photos.map((photo) => [photoKey(photo), versionKey(photo)]));
    for (const key of cache.current.keys()) {
      const version = present.get(key.slice(0, key.lastIndexOf("/")));
      if (version && version !== key) cache.current.delete(key);
    }
    const pending = photos.filter((photo) => !cache.current.has(versionKey(photo)));
    const failed = new Set<string>();
    const update = () => setState({ loaded: new Map(cache.current), failed: new Set(failed) });
    async function load(group: RdoPhoto[]) {
      if (!group.length || controller.signal.aborted) return;
      try {
        const response = await request({
          data: { organization_id: cruzAlta.org, chave, photos: group.map(photoRef) },
          signal: controller.signal,
        });
        if (!response.ok) throw new Error("Miniaturas indisponíveis.");
        const parts = await response.formData();
        if (controller.signal.aborted) return;
        group.forEach((photo, index) => {
          const blob = parts.get(String(index));
          const key = versionKey(photo);
          if (blob instanceof Blob && blob.size && blob.type.startsWith("image/"))
            cache.current.set(key, blob);
          else failed.add(key);
        });
        while (cache.current.size > 2 * rdoPageSize) {
          const oldest = cache.current.keys().next().value;
          if (!oldest) break;
          cache.current.delete(oldest);
        }
      } catch {
        if (controller.signal.aborted) return;
        group.forEach((photo) => failed.add(versionKey(photo)));
      }
      update();
    }
    void (async () => {
      // Deixa a primeira foto disponível sem esperar as demais miniaturas da página.
      await load(pending.slice(0, 1));
      await load(pending.slice(1));
    })();
    return () => controller.abort();
  }, [active, attempt, chave, photos, request]);
  return state;
}

function Thumbnail({ thumbnail, failed }: { thumbnail: Blob | undefined; failed: boolean }) {
  const src = useBlobUrl(thumbnail);
  const [loaded, setLoaded] = useState<string>();
  const [decodeFailed, setDecodeFailed] = useState<string>();
  const unavailable = failed || (!!src && decodeFailed === src);
  return (
    <div className="ca-rdo-image" aria-busy={!unavailable && !(src && loaded === src)}>
      {src && !unavailable && (
        <img
          src={src}
          alt=""
          aria-hidden="true"
          className="ca-rdo-rendered"
          data-loaded={loaded === src}
          data-representation="thumbnail"
          decoding="async"
          onLoad={() => setLoaded(src)}
          onError={() => setDecodeFailed(src)}
        />
      )}
      {unavailable || !src || loaded !== src ? (
        <div className="ca-rdo-image-state" aria-hidden="true">
          {unavailable ? (
            <>
              <ImageOff size={22} />
              <span>Sem miniatura</span>
            </>
          ) : (
            <Camera size={22} />
          )}
        </div>
      ) : null}
    </div>
  );
}

function usePhotoBytes(
  chave: string,
  photo: RdoPhoto,
  representation: RdoRepresentation,
  enabled: boolean,
  attempt: number,
  onChanged: () => void,
) {
  const request = useServerFn(caRdoPhoto);
  const changed = useRef(onChanged);
  changed.current = onChanged;
  const [result, setResult] = useState<{ attempt: number; blob?: Blob }>();
  const { id, folderId, version, path } = photo;
  useEffect(() => {
    if (!enabled) return;
    const controller = new AbortController();
    void (async () => {
      try {
        const response = await request({
          data: {
            organization_id: cruzAlta.org,
            chave,
            id,
            folderId,
            version,
            path,
            representation,
          },
          signal: controller.signal,
        });
        if (response.status === 409 && !controller.signal.aborted) changed.current();
        if (!response.ok) throw new Error("Imagem indisponível.");
        const blob = await response.blob();
        if (!controller.signal.aborted) setResult({ attempt, blob });
      } catch {
        if (!controller.signal.aborted) setResult({ attempt });
      }
    })();
    return () => controller.abort();
  }, [attempt, chave, enabled, folderId, id, path, representation, request, version]);
  return result?.attempt === attempt ? result : undefined;
}

function FullPhoto({
  chave,
  photo,
  thumbnail,
  onChanged,
}: {
  chave: string;
  photo: RdoPhoto;
  thumbnail: Blob | undefined;
  onChanged: () => void;
}) {
  const [wantOriginal, setWantOriginal] = useState(false);
  const [attempt, setAttempt] = useState({ preview: 0, original: 0 });
  const [loaded, setLoaded] = useState<string>();
  const [decodeFailed, setDecodeFailed] = useState<string>();
  const preview = usePhotoBytes(chave, photo, "preview", !wantOriginal, attempt.preview, onChanged);
  const original = usePhotoBytes(
    chave,
    photo,
    "original",
    wantOriginal,
    attempt.original,
    onChanged,
  );
  const previewSrc = useBlobUrl(preview?.blob);
  const originalSrc = useBlobUrl(original?.blob);
  const thumbSrc = useBlobUrl(thumbnail);
  const mode = wantOriginal ? "original" : "preview";
  const result = wantOriginal ? original : preview;
  const src = wantOriginal ? originalSrc : previewSrc;
  const ready = !!src && loaded === src;
  const keepPreview = !ready && (wantOriginal ? (previewSrc ?? thumbSrc) : thumbSrc);
  const unavailable = (!!result && !result.blob) || (!!src && decodeFailed === src);
  return (
    <>
      {!wantOriginal && (
        <button
          className="ca-action ca-rdo-original"
          type="button"
          onClick={() => setWantOriginal(true)}
        >
          Ver original
        </button>
      )}
      <div className="ca-rdo-image" aria-busy={!ready && !unavailable}>
        {keepPreview && (
          <img src={keepPreview} alt="" aria-hidden="true" className="ca-rdo-placeholder" />
        )}
        {src && !unavailable && (
          <img
            key={src}
            src={src}
            alt={photo.name}
            aria-hidden={!ready || undefined}
            className="ca-rdo-rendered"
            data-loaded={ready}
            data-representation={mode}
            decoding="async"
            onLoad={() => setLoaded(src)}
            onError={() => setDecodeFailed(src)}
          />
        )}
        {unavailable ? (
          <div className="ca-rdo-image-state">
            <ImageOff size={22} aria-hidden="true" />
            <span role="status">
              {wantOriginal ? "Não foi possível abrir o original." : "Prévia indisponível."}
            </span>
            <button
              className="ca-action"
              type="button"
              onClick={() => {
                setDecodeFailed(undefined);
                setAttempt((previous) => ({ ...previous, [mode]: previous[mode] + 1 }));
              }}
            >
              Tentar abrir novamente
            </button>
          </div>
        ) : !ready ? (
          <div className="ca-rdo-image-state">
            {!keepPreview && <Camera size={22} aria-hidden="true" />}
            <span role="status">
              {wantOriginal ? "Carregando original…" : "Carregando prévia…"}
            </span>
          </div>
        ) : null}
      </div>
    </>
  );
}

type Selection = { index: number; key?: string };

export function RdoPhotoGallery({
  object,
  inspections,
  photos: query,
}: {
  object: CruzObject;
  inspections: ReadonlyMap<string, CaInspectionLine>;
  photos: ReturnType<typeof useRdoPhotos>;
}) {
  const [active, setActive] = useState<Selection>();
  const [knownTotal, setKnownTotal] = useState(0);
  const [attempt, setAttempt] = useState(0);
  const closeButton = useRef<HTMLButtonElement>(null);
  const openedFrom = useRef<HTMLButtonElement | null>(null);
  const heading = useRef<HTMLHeadingElement>(null);
  const sessionDenied = query.error?.message.startsWith("Unauthorized:") ?? false;
  const listing = sessionDenied ? undefined : query.data;
  const photos = listing?.photos ?? emptyPhotos;
  const page = query.page;
  const total = listing?.total ?? knownTotal;
  const lastPage = Math.max(0, Math.ceil(total / rdoPageSize) - 1);
  const viewing = !!active && !sessionDenied;
  const currentIndex = active?.key
    ? photos.findIndex((photo) => photoKey(photo) === active.key)
    : (active?.index ?? -1) % rdoPageSize;
  const current = viewing ? photos[currentIndex] : undefined;
  const position = current ? page * rdoPageSize + currentIndex : (active?.index ?? -1);
  const thumbnails = useThumbnails(
    object.id,
    photos,
    query.active && !viewing && !sessionDenied,
    attempt,
  );
  const setPage = query.setPage;

  useEffect(() => {
    if (!listing) return;
    setKnownTotal(listing.total);
    if (page > lastPage) setPage(lastPage);
    if (!active) return;
    if (!current) setActive(undefined);
    else if (!active.key) setActive({ index: position, key: photoKey(current) });
  }, [active, current, lastPage, listing, page, position, setPage]);

  useEffect(() => {
    if (viewing) closeButton.current?.focus();
    else if (openedFrom.current) {
      const target = openedFrom.current.isConnected ? openedFrom.current : heading.current;
      target?.focus();
      openedFrom.current = null;
    }
  }, [viewing]);

  if (
    sessionDenied ||
    (!viewing && !query.isPending && !query.isError && !listing?.partial && !total)
  )
    return null;

  function lineTitle(code: string) {
    const item = linesByCode.get(code);
    return item ? technicalTitle(item, inspections.get(item.id)) : code;
  }
  function goToPhoto(index: number) {
    if (index < 0 || index >= total || !current) return;
    const nextPage = Math.floor(index / rdoPageSize);
    if (nextPage !== page) {
      setActive({ index });
      setPage(nextPage);
    } else {
      const next = photos[index % rdoPageSize];
      if (next) setActive({ index, key: photoKey(next) });
    }
  }
  const groups = new Map<string, RdoPhoto[]>();
  for (const photo of photos) {
    const group = groups.get(photo.code) ?? [];
    group.push(photo);
    groups.set(photo.code, group);
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
            onClick={() => {
              setAttempt((count) => count + 1);
              void query.refetch();
            }}
          >
            <RefreshCw size={16} aria-hidden="true" />
          </button>
        )}
      </div>
      {query.isPending && !viewing && (
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
      {viewing && (
        <div
          className="ca-rdo-viewer"
          role="group"
          aria-label="Visualizador de fotos"
          onKeyDown={(event) => {
            if (event.key === "Escape") setActive(undefined);
            else if (event.key === "ArrowLeft") goToPhoto(position - 1);
            else if (event.key === "ArrowRight") goToPhoto(position + 1);
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
              aria-disabled={!current || position <= 0}
              onClick={() => goToPhoto(position - 1)}
            >
              <ChevronLeft size={22} aria-hidden="true" />
            </button>
            <span role="status">
              {position + 1} de {total}
            </span>
            <button
              className="ca-rdo-control"
              type="button"
              aria-label="Próxima foto"
              title="Próxima foto"
              aria-disabled={!current || position + 1 >= total}
              onClick={() => goToPhoto(position + 1)}
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
          {current && query.active ? (
            <>
              <FullPhoto
                key={versionKey(current)}
                chave={object.id}
                photo={current}
                thumbnail={thumbnails.loaded.get(versionKey(current))}
                onChanged={() => void query.refetch()}
              />
              <div className="ca-rdo-caption">
                <strong>{current.name}</strong>
                <small>
                  {lineTitle(current.code)} ·{" "}
                  {categories.find(({ id }) => id === current.category)?.label}
                </small>
              </div>
            </>
          ) : query.isError ? (
            <button className="ca-action" type="button" onClick={() => void query.refetch()}>
              Tentar novamente
            </button>
          ) : query.active ? (
            <p role="status">Buscando próxima página de fotos…</p>
          ) : null}
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
                      <li key={versionKey(photo)}>
                        <button
                          className="ca-rdo-card"
                          type="button"
                          aria-label={`Abrir foto ${photo.name}`}
                          title={photo.name}
                          onClick={(event) => {
                            openedFrom.current = event.currentTarget;
                            setActive({
                              index: page * rdoPageSize + photos.indexOf(photo),
                              key: photoKey(photo),
                            });
                          }}
                        >
                          <Thumbnail
                            thumbnail={thumbnails.loaded.get(versionKey(photo))}
                            failed={thumbnails.failed.has(versionKey(photo))}
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
              disabled={!page}
              onClick={() => setPage(page - 1)}
            >
              <ChevronLeft size={20} aria-hidden="true" />
            </button>
            <span role="status">
              Página {page + 1} de {lastPage + 1}
            </span>
            <button
              className="ca-rdo-control"
              type="button"
              aria-label="Próxima página de fotos"
              disabled={page >= lastPage}
              onClick={() => setPage(page + 1)}
            >
              <ChevronRight size={20} aria-hidden="true" />
            </button>
          </div>
        )}
      </div>
    </section>
  );
}
