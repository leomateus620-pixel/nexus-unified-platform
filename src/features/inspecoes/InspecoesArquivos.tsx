import { useEffect, useRef, useState, type ReactNode } from "react";
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
import {
  LeituraPeAccessError,
  MAX_ORIGINAL_BYTES,
  MAX_PDF_RANGE_BYTES,
  type OriginalPe,
} from "@/features/projetos-engenharia/leitor/domain";
import { LeitorOriginalPe } from "@/features/projetos-engenharia/leitor/LeitorOriginalPe";
import { Badge, Fatos, legenda } from "./apresentacao";
import { inspecoesArquivoUrl } from "./inspecoes.functions";
import type { InspecoesArquivo, InspecoesEscopo } from "./ui-contract";

type MediaScope = { escopo: InspecoesEscopo; queryKey: readonly string[] };
type Variante = "original" | "miniatura_384" | "previa_768";
type AcoesArquivo = (file: InspecoesArquivo) => ReactNode;

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
    refetchOnWindowFocus: false,
    queryFn: async ({ signal }) => {
      const result = await load({
        data: { ...scope.escopo, id: file.id, variante },
        signal,
      });
      if (!result.url) throw new Error("Arquivo privado ou variante indisponível.");
      return result.url;
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
  acoesArquivo,
  ...scope
}: MediaScope & {
  files: InspecoesArquivo[];
  context: string;
  title: string;
  isDocument: boolean;
  acoesArquivo?: AcoesArquivo | undefined;
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
                <ArquivoCard key={file.id} file={file} acoesArquivo={acoesArquivo} {...scope} />
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
          <Fotos
            photos={photos}
            context={context}
            title={title}
            acoesArquivo={acoesArquivo}
            {...scope}
          />
        ) : (
          <EmptyState title="Nenhuma fotografia vinculada a este registro" />
        )}
      </section>
    </div>
  );
}

function ArquivoCard({
  file,
  acoesArquivo,
  ...scope
}: MediaScope & { file: InspecoesArquivo; acoesArquivo?: AcoesArquivo | undefined }) {
  const [preview, setPreview] = useState(false);
  const pdf: OriginalPe | null =
    file.mime === "application/pdf" && file.bytes && file.sha256
      ? {
          id: file.id,
          nome: file.nome,
          mime: "application/pdf" as const,
          tamanho: file.bytes,
          sha256: file.sha256,
        }
      : null;
  const tooLarge = !!pdf && pdf.tamanho > MAX_PDF_RANGE_BYTES;
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
          {pdf && !tooLarge && (
            <ActionButton
              variant="ghost"
              onClick={(event) => {
                event.currentTarget.focus({ preventScroll: true });
                setPreview(true);
              }}
            >
              <Maximize2 size={16} aria-hidden="true" />
              Visualizar PDF
            </ActionButton>
          )}
          <ArquivoOriginal escopo={scope.escopo} file={file} />
        </div>
      )}
      {tooLarge && isVerified(file) && (
        <p className="nr-muted">
          O PDF excede o limite de 150 MiB da prévia. Baixe o original para ler.
        </p>
      )}
      {acoesArquivo?.(file)}
      {preview && pdf && !tooLarge && (
        <PdfDialog escopo={scope.escopo} file={file} pdf={pdf} fechar={() => setPreview(false)} />
      )}
    </NrCard>
  );
}

function ArquivoOriginal({ file, escopo }: { file: InspecoesArquivo; escopo: InspecoesEscopo }) {
  const authorize = useServerFn(inspecoesArquivoUrl);
  const request = useRef<AbortController | null>(null);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState(false);
  useEffect(() => () => request.current?.abort(), []);
  async function baixar() {
    if (request.current) return;
    const controller = new AbortController();
    request.current = controller;
    setBusy(true);
    setError(false);
    try {
      const result = await authorize({
        data: { ...escopo, id: file.id, variante: "original", acao: "baixar" },
        signal: controller.signal,
      });
      if (controller.signal.aborted) return;
      if (!result.url) throw new Error("Download indisponível.");
      const link = document.createElement("a");
      link.href = result.url;
      link.download = file.nome;
      link.rel = "noreferrer noopener";
      document.body.append(link);
      link.click();
      link.remove();
    } catch {
      if (!controller.signal.aborted) setError(true);
    } finally {
      request.current = null;
      if (!controller.signal.aborted) setBusy(false);
    }
  }
  return (
    <>
      <ActionButton variant="ghost" loading={busy} onClick={() => void baixar()}>
        <Download size={16} aria-hidden="true" />
        {error ? "Tentar baixar novamente" : "Baixar original"}
      </ActionButton>
      {error && (
        <p role="alert" className="insp-media-failure">
          Não foi possível baixar o original com o acesso atual.
        </p>
      )}
    </>
  );
}

function PdfDialog({
  file,
  pdf,
  escopo,
  fechar,
}: {
  file: InspecoesArquivo;
  pdf: OriginalPe;
  escopo: InspecoesEscopo;
  fechar: () => void;
}) {
  const authorize = useServerFn(inspecoesArquivoUrl);
  async function access(signal: AbortSignal, acao: "visualizar" | "verificar") {
    const result = await authorize({
      data: {
        ...escopo,
        id: file.id,
        variante: "original",
        acao,
        esperado: { bytes: pdf.tamanho, sha256: pdf.sha256 },
      },
      signal,
    });
    if (!result.permitido) throw new LeituraPeAccessError();
    return result;
  }
  return (
    <LeitorOriginalPe
      organizationId={escopo.organizationId}
      versaoId={file.id}
      arquivo={pdf}
      readPdfByRange={pdf.tamanho > MAX_ORIGINAL_BYTES}
      onClose={fechar}
      checkAccess={async (signal) => {
        await access(signal, "verificar");
      }}
      fetchAuthorized={async (signal) => {
        const result = await access(signal, "visualizar");
        if (!result.url) throw new LeituraPeAccessError();
        return { url: result.url, expiresAt: result.expiresAt };
      }}
      downloadAction={<ArquivoOriginal escopo={escopo} file={file} />}
    />
  );
}

function Thumb({
  file,
  context,
  ...scope
}: MediaScope & { file: InspecoesArquivo; context: string }) {
  const ref = useRef<HTMLDivElement>(null);
  const [visible, setVisible] = useState(false);
  const [failedSrc, setFailedSrc] = useState<string>();
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
    visible && !file.miniaturaUrl && file.possuiMiniatura !== false && isVerified(file),
  );
  const src = file.miniaturaUrl && file.miniaturaUrl !== failedSrc ? file.miniaturaUrl : query.data;
  return (
    <div className="insp-photo-image" ref={ref}>
      {src && src !== failedSrc ? (
        <img
          src={src}
          alt={file.legenda || `Foto em ${context}`}
          loading="lazy"
          decoding="async"
          onError={() => {
            setFailedSrc(src);
            if (src === file.miniaturaUrl) void query.refetch();
          }}
        />
      ) : (
        <span role="status">
          <ImageOff size={19} aria-hidden="true" />
          {!isVerified(file)
            ? "Foto com original pendente"
            : query.isFetching
              ? "Carregando miniatura…"
              : query.isError || !!failedSrc || file.possuiMiniatura === false
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
  acoesArquivo,
  ...scope
}: MediaScope & {
  photos: InspecoesArquivo[];
  context: string;
  title: string;
  acoesArquivo?: AcoesArquivo | undefined;
}) {
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [zoom, setZoom] = useState(1);
  const open = useRef<HTMLButtonElement | null>(null);
  const selected = photos.findIndex(({ id }) => id === selectedId);
  const current = photos[selected];
  function next(index: number) {
    setSelectedId(photos[index]?.id ?? null);
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
              {acoesArquivo?.(file)}
            </figcaption>
          </figure>
        ))}
      </div>
      <Dialog
        open={!!current}
        onOpenChange={(value) => {
          if (!value) setSelectedId(null);
        }}
      >
        {current && (
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
                  <ArquivoOriginal key={current.id} file={current} escopo={scope.escopo} />
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
  const [failedSrc, setFailedSrc] = useState<string>();
  const [failedOriginal, setFailedOriginal] = useState<string>();
  const query = useArquivo(
    scope,
    file,
    "previa_768",
    isVerified(file) && file.possuiPrevia !== false,
    file.previaUrl,
  );
  const fallback =
    file.possuiPrevia === false || query.isError || (!!query.data && query.data === failedSrc);
  const original = useArquivo(
    scope,
    file,
    "original",
    fallback && isVerified(file),
    file.originalUrl,
  );
  const src = fallback ? original.data : query.data;
  const unavailable = fallback && (original.isError || (!!src && src === failedOriginal));
  return (
    <div className="insp-photo-full">
      {src && !unavailable ? (
        <div style={{ width: `${100 * zoom}%` }}>
          <img
            src={src}
            alt={file.legenda || "Fotografia do acervo"}
            style={{ maxHeight: `${62 * zoom}dvh` }}
            onError={() => (fallback ? setFailedOriginal(src) : setFailedSrc(src))}
          />
        </div>
      ) : unavailable ? (
        <ErrorState
          error={new Error("Não foi possível abrir a fotografia.")}
          onRetry={() => {
            setFailedOriginal(undefined);
            void original.refetch();
          }}
        />
      ) : (
        <p role="status">{isVerified(file) ? "Carregando fotografia…" : "Original pendente"}</p>
      )}
    </div>
  );
}
