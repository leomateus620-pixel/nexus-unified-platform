import { useEffect, useRef, useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { useServerFn } from "@tanstack/react-start";
import {
  ChevronLeft,
  ChevronRight,
  Download,
  FileText,
  ImageOff,
  Maximize2,
  ZoomIn,
  ZoomOut,
} from "lucide-react";
import { ActionButton, EmptyState, ErrorState } from "@/components/nexus/Page";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { NrCard } from "@/features/nr/NrCards";
import { Badge, Fatos, legenda } from "./apresentacao";
import { inspecoesArquivoUrl } from "./inspecoes.functions";
import type { InspecoesArquivo, InspecoesEscopo } from "./ui-contract";

type MediaScope = { escopo: InspecoesEscopo; queryKey: readonly string[] };
type Variante = "original" | "miniatura_384" | "previa_768";

function useArquivo(
  scope: MediaScope,
  file: InspecoesArquivo,
  variante: Variante,
  enabled: boolean,
  initial?: string | null,
) {
  const load = useServerFn(inspecoesArquivoUrl);
  return useQuery({
    queryKey: [...scope.queryKey, "arquivo", file.id, variante],
    enabled,
    initialData: initial || undefined,
    staleTime: 40_000,
    gcTime: 45_000,
    retry: false,
    queryFn: async ({ signal }) => {
      const result = await load({
        data: { organizationId: scope.escopo.organizationId, id: file.id, variante },
        signal,
      });
      return typeof result === "string" ? result : result.url;
    },
  });
}

function isVerified(file: InspecoesArquivo) {
  return ["original_verificado", "falha_processamento"].includes(file.estado);
}

export function InspecoesArquivos({
  files,
  context,
  title,
  isDocument,
  ...scope
}: MediaScope & {
  files: InspecoesArquivo[];
  context: string;
  title: string;
  isDocument: boolean;
}) {
  const photos = files.filter((file) => file.papel === "foto" || file.papel === "fotografia");
  const documents = files.filter((file) => !photos.includes(file));
  return (
    <div className="insp-stack">
      {(isDocument || documents.length > 0) && (
        <section className="insp-stack" aria-label="Documentos e anexos">
          <h3 className="insp-subheading">Originais e anexos</h3>
          {documents.length ? (
            <div className="insp-grid">
              {documents.map((file) => (
                <ArquivoCard key={file.id} file={file} {...scope} />
              ))}
            </div>
          ) : (
            <EmptyState
              title="Original pendente"
              hint="O conteúdo extraído pode ser consultado na ficha quando a origem o disponibilizou."
            />
          )}
        </section>
      )}
      <section className="insp-stack" aria-label="Fotografias">
        <h3 className="insp-subheading">Fotografias</h3>
        {photos.length ? (
          <Fotos photos={photos} context={context} title={title} {...scope} />
        ) : (
          <EmptyState title="Nenhuma fotografia vinculada a este registro" />
        )}
      </section>
    </div>
  );
}

function ArquivoCard({ file, ...scope }: MediaScope & { file: InspecoesArquivo }) {
  const [preview, setPreview] = useState(false);
  const pdf = file.mime === "application/pdf";
  return (
    <NrCard className="insp-record">
      <div className="insp-asset-title">
        <FileText size={18} aria-hidden="true" />
        <h4>{file.nome}</h4>
      </div>
      <div className="insp-badges">
        <Badge value={file.estado} />
      </div>
      <Fatos
        items={[
          ["Papel", legenda(file.papel)],
          [
            "Tamanho",
            file.bytes != null ? `${new Intl.NumberFormat("pt-BR").format(file.bytes)} bytes` : "",
          ],
          ["SHA-256", file.sha256 ? <code className="insp-hash">{file.sha256}</code> : ""],
        ]}
      />
      {isVerified(file) && (
        <div className="insp-actions">
          {pdf && (
            <ActionButton variant="ghost" onClick={() => setPreview(true)}>
              <Maximize2 size={16} aria-hidden="true" />
              Visualizar PDF
            </ActionButton>
          )}
          <ArquivoOriginal {...scope} file={file} />
        </div>
      )}
      {preview && <PdfDialog {...scope} file={file} fechar={() => setPreview(false)} />}
    </NrCard>
  );
}

function ArquivoOriginal({ file, ...scope }: MediaScope & { file: InspecoesArquivo }) {
  const [requested, setRequested] = useState(false);
  const query = useArquivo(scope, file, "original", requested, file.originalUrl);
  if (query.data)
    return (
      <a href={query.data} className="insp-text-link" target="_blank" rel="noreferrer noopener">
        <Download size={16} aria-hidden="true" /> Abrir original
      </a>
    );
  return (
    <>
      <ActionButton
        variant="ghost"
        loading={query.isFetching}
        onClick={() => {
          if (requested) void query.refetch();
          else setRequested(true);
        }}
      >
        <Download size={16} aria-hidden="true" />
        Preparar original
      </ActionButton>
      {query.isError && (
        <p role="alert" className="insp-media-failure">
          Não foi possível autorizar o original.
        </p>
      )}
    </>
  );
}

function PdfDialog({
  file,
  fechar,
  ...scope
}: MediaScope & { file: InspecoesArquivo; fechar: () => void }) {
  const query = useArquivo(scope, file, "original", true, file.originalUrl);
  const [page, setPage] = useState(1);
  const [zoom, setZoom] = useState(100);
  return (
    <Dialog
      open
      onOpenChange={(open) => {
        if (!open) fechar();
      }}
    >
      <DialogContent className="nx-nr-workspace insp-dialog insp-media-dialog">
        <DialogHeader className="insp-dialog-header">
          <DialogTitle>{file.nome}</DialogTitle>
          <DialogDescription>Visualização do PDF original</DialogDescription>
        </DialogHeader>
        <div className="insp-dialog-scroll insp-stack">
          <div className="insp-actions">
            <label className="insp-field">
              Página
              <input
                type="number"
                min={1}
                max={9999}
                value={page}
                onChange={(e) => setPage(Math.max(1, Number(e.target.value) || 1))}
              />
            </label>
            <label className="insp-field">
              Zoom
              <select value={zoom} onChange={(e) => setZoom(Number(e.target.value))}>
                {[75, 100, 125, 150, 200].map((value) => (
                  <option key={value} value={value}>
                    {value}%
                  </option>
                ))}
              </select>
            </label>
            {query.data && (
              <a
                className="insp-text-link"
                href={query.data}
                target="_blank"
                rel="noopener noreferrer"
              >
                Abrir em outra aba
              </a>
            )}
          </div>
          {query.isError ? (
            <ErrorState error={query.error} onRetry={() => void query.refetch()} />
          ) : query.data ? (
            <iframe
              className="insp-pdf"
              title={file.nome}
              src={`${query.data}#page=${page}&zoom=${zoom}`}
            />
          ) : (
            <p role="status">Preparando visualização…</p>
          )}
        </div>
      </DialogContent>
    </Dialog>
  );
}

function Thumb({
  file,
  context,
  ...scope
}: MediaScope & { file: InspecoesArquivo; context: string }) {
  const ref = useRef<HTMLDivElement>(null);
  const [visible, setVisible] = useState(false);
  const [failed, setFailed] = useState(false);
  useEffect(() => {
    const target = ref.current;
    if (!target || visible) return;
    const observer = new IntersectionObserver(
      ([entry]) => {
        if (entry?.isIntersecting) setVisible(true);
      },
      { rootMargin: "220px" },
    );
    observer.observe(target);
    return () => observer.disconnect();
  }, [visible]);
  const query = useArquivo(
    scope,
    file,
    "miniatura_384",
    visible && !file.miniaturaUrl && isVerified(file),
    file.miniaturaUrl,
  );
  const src = query.data;
  return (
    <div className="insp-photo-image" ref={ref}>
      {src && !failed ? (
        <img
          src={src}
          alt={file.legenda || `Foto em ${context}`}
          loading="lazy"
          decoding="async"
          onError={() => setFailed(true)}
        />
      ) : (
        <span role="status">
          <ImageOff size={19} aria-hidden="true" />
          {query.isFetching
            ? "Carregando miniatura…"
            : query.isError || failed
              ? "Miniatura indisponível"
              : "Aguardando miniatura"}
        </span>
      )}
    </div>
  );
}

function Fotos({
  photos,
  context,
  title,
  ...scope
}: MediaScope & {
  photos: InspecoesArquivo[];
  context: string;
  title: string;
}) {
  const [selected, setSelected] = useState<number | null>(null);
  const [zoom, setZoom] = useState(1);
  const open = useRef<HTMLButtonElement | null>(null);
  const current = selected === null ? null : photos[selected];
  function next(index: number) {
    setSelected(index);
    setZoom(1);
  }
  return (
    <>
      <div className="insp-photo-grid">
        {photos.map((file, index) => (
          <figure className="insp-photo" key={file.id}>
            <button
              type="button"
              onClick={(event) => {
                open.current = event.currentTarget;
                next(index);
              }}
              aria-label={`Ampliar foto ${index + 1} de ${photos.length}`}
            >
              <Thumb file={file} context={context} {...scope} />
            </button>
            <figcaption>
              <p className="insp-kicker">
                Foto {index + 1} de {photos.length}
              </p>
              <p>{file.legenda || "Sem legenda registrada"}</p>
              <small>
                {context} · {title}
              </small>
              <Badge value={file.estado} />
            </figcaption>
          </figure>
        ))}
      </div>
      <Dialog
        open={!!current}
        onOpenChange={(value) => {
          if (!value) setSelected(null);
        }}
      >
        {current && selected != null && (
          <DialogContent
            className="nx-nr-workspace insp-dialog insp-media-dialog"
            onCloseAutoFocus={(event) => {
              event.preventDefault();
              open.current?.focus({ preventScroll: true });
            }}
            onKeyDown={(event) => {
              if (event.key === "ArrowLeft" && selected > 0) next(selected - 1);
              if (event.key === "ArrowRight" && selected + 1 < photos.length) next(selected + 1);
            }}
          >
            <DialogHeader className="insp-dialog-header">
              <DialogTitle>
                Foto {selected + 1} de {photos.length}
              </DialogTitle>
              <DialogDescription>
                {current.legenda || "Sem legenda registrada"} · {context}
              </DialogDescription>
            </DialogHeader>
            <div className="insp-dialog-scroll insp-stack">
              <div className="insp-actions" aria-label="Controles de fotografia">
                <ActionButton
                  variant="ghost"
                  disabled={selected === 0}
                  onClick={() => next(selected - 1)}
                >
                  <ChevronLeft size={16} aria-hidden="true" />
                  Anterior
                </ActionButton>
                <ActionButton
                  variant="ghost"
                  disabled={selected + 1 === photos.length}
                  onClick={() => next(selected + 1)}
                >
                  Próxima
                  <ChevronRight size={16} aria-hidden="true" />
                </ActionButton>
                <ActionButton
                  variant="ghost"
                  disabled={zoom <= 1}
                  onClick={() => setZoom(zoom - 0.25)}
                  aria-label="Reduzir zoom"
                >
                  <ZoomOut size={16} aria-hidden="true" />
                </ActionButton>
                <span aria-live="polite">{Math.round(zoom * 100)}%</span>
                <ActionButton
                  variant="ghost"
                  disabled={zoom >= 3}
                  onClick={() => setZoom(zoom + 0.25)}
                  aria-label="Aumentar zoom"
                >
                  <ZoomIn size={16} aria-hidden="true" />
                </ActionButton>
                {isVerified(current) && (
                  <ArquivoOriginal key={current.id} file={current} {...scope} />
                )}
              </div>
              <FotoAmpliada key={current.id} file={current} zoom={zoom} {...scope} />
            </div>
          </DialogContent>
        )}
      </Dialog>
    </>
  );
}

function FotoAmpliada({
  file,
  zoom,
  ...scope
}: MediaScope & { file: InspecoesArquivo; zoom: number }) {
  const query = useArquivo(scope, file, "previa_768", isVerified(file), file.previaUrl);
  const original = useArquivo(
    scope,
    file,
    "original",
    query.isError && isVerified(file),
    file.originalUrl,
  );
  const src = query.data ?? original.data;
  return (
    <div className="insp-photo-full">
      {src ? (
        <img
          src={src}
          alt={file.legenda || "Fotografia do acervo"}
          style={{ width: `${100 * zoom}%` }}
        />
      ) : query.isError && original.isError ? (
        <ErrorState error={original.error} onRetry={() => void original.refetch()} />
      ) : (
        <p role="status">{isVerified(file) ? "Carregando fotografia…" : "Original pendente"}</p>
      )}
    </div>
  );
}
