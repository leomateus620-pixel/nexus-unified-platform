import { useEffect, useRef, useState } from "react";
import { createClientOnlyFn, useServerFn } from "@tanstack/react-start";
import { ChevronLeft, ChevronRight, ExternalLink, RotateCw, ZoomIn, ZoomOut } from "lucide-react";
import { ActionButton } from "@/components/nexus/Page";
import { nrArquivoBaixar } from "./files.functions";
import { confirmedNrOriginalBytes } from "./original-bytes";
import type { ReaderDocument } from "@/features/projetos-engenharia/leitor/renderer.client";
import type { CruzPdfRepresentations } from "@/features/cruz-alta/pdf-representations";
import {
  failureKind,
  failureText,
  isCancelled,
  LeituraPeAccessError,
  PDFJS_VERSION,
} from "@/features/projetos-engenharia/leitor/domain";
const loadRenderer = createClientOnlyFn(
  () => import("@/features/projetos-engenharia/leitor/renderer.client"),
);
const assets = `/pdfjs/${PDFJS_VERSION}/`;

type Authorization = { url: string; expiresAt?: string | undefined };

function fetchVerifiedPdf(url: string, tamanho: number, sha256: string, signal: AbortSignal) {
  return fetch(url, {
    signal,
    credentials: "omit",
    cache: "no-store",
    referrerPolicy: "no-referrer",
  }).then((response) => confirmedNrOriginalBytes(response, { tamanho, sha256 }, signal));
}

export type NrPreviewFile = {
  id: string;
  nome: string;
  mime: string;
  tamanho: number;
  sha256: string;
};
/** Uses the existing bounded PDF.js renderer. No iframe/native PDF plug-in or public URL required. */
export function NrOriginalPreview({
  org,
  file,
  url,
  initialAuthorizedUntil,
  authorizePreview,
  representations,
  staticWorker = false,
  showOriginalLink = true,
  initialPage = 1,
}: {
  org: string;
  file: NrPreviewFile;
  url: string;
  initialAuthorizedUntil?: number;
  authorizePreview?: (signal: AbortSignal) => Promise<Authorization>;
  representations?: CruzPdfRepresentations | undefined;
  staticWorker?: boolean;
  showOriginalLink?: boolean;
  initialPage?: number;
}) {
  const authorize = useServerFn(nrArquivoBaixar);
  const host = useRef<HTMLDivElement>(null),
    canvas = useRef<HTMLCanvasElement>(null);
  const document = useRef<ReaderDocument | null>(null);
  const [pages, setPages] = useState(0),
    [page, setPage] = useState(1);
  const [zoom, setZoom] = useState(1),
    [rotation, setRotation] = useState(0);
  const [width, setWidth] = useState(700),
    [error, setError] = useState("");
  const [busy, setBusy] = useState(true),
    [pageText, setPageText] = useState("");
  const [textOpen, setTextOpen] = useState(false),
    [textError, setTextError] = useState("");
  const [attempt, setAttempt] = useState(0);
  const [originalRequested, setOriginalRequested] = useState(false);
  const [previewPage, setPreviewPage] = useState<number>();
  const [link, setLink] = useState("");
  const renew =
    authorizePreview ??
    ((signal: AbortSignal) =>
      authorize({ data: { organization_id: org, id: file.id, visualizar: true }, signal }));
  const authorization = useRef(renew);
  authorization.current = renew;
  const initialAuthorization = useRef({ url, validUntil: initialAuthorizedUntil, representations });
  initialAuthorization.current = { url, validUntil: initialAuthorizedUntil, representations };
  useEffect(() => {
    if (!host.current) return;
    const observer = new ResizeObserver(([entry]) => {
      if (entry) setWidth(Math.max(240, Math.floor(entry.contentRect.width) - 24));
    });
    observer.observe(host.current);
    return () => observer.disconnect();
  }, []);
  useEffect(() => {
    const controller = new AbortController();
    let pendingAuthorization: Promise<Authorization> | undefined;
    const renewAuthorization = () =>
      (pendingAuthorization ??= authorization.current(controller.signal).finally(() => {
        pendingAuthorization = undefined;
      }));
    let reader: ReaderDocument | undefined;
    let derivative: ReaderDocument | undefined;
    let original: ReaderDocument | undefined;
    setBusy(true);
    setLink("");
    setError("");
    setPages(0);
    setPage(initialPage);
    setPreviewPage(undefined);
    setPageText("");
    async function open() {
      try {
        const initial = initialAuthorization.current;
        const { signal } = controller;
        const rendererPromise = loadRenderer();
        void rendererPromise.then((renderer) => renderer.preparePdfEngine()).catch(() => undefined);
        const initialAvailable =
          attempt === 0 && !!initial.validUntil && initial.validUntil > Date.now();
        const permitted: Authorization = initialAvailable
          ? { url: initial.url, expiresAt: new Date(initial.validUntil!).toISOString() }
          : await renewAuthorization();
        signal.throwIfAborted();
        setLink(permitted.url);
        const manifest = initialAvailable ? initial.representations : undefined;
        const tryOriginal = async () => {
          const renderer = await rendererPromise;
          const openFull = async () => {
            const source =
              Date.parse(permitted.expiresAt ?? "") > Date.now() + 5_000 || !permitted.expiresAt
                ? permitted
                : await renewAuthorization();
            const bytes = await fetchVerifiedPdf(source.url, file.tamanho, file.sha256, signal);
            return renderer.openOriginalDocument(
              bytes,
              "application/pdf",
              signal,
              assets,
              staticWorker,
            );
          };
          if (manifest?.chunks.length && !originalRequested) {
            const range = new AbortController();
            const rangeSignal = AbortSignal.any([signal, range.signal]);
            let initialRange = true;
            try {
              const ranged = await renderer.openRangedPdf(
                {
                  size: file.tamanho,
                  chunkHashes: manifest.chunks,
                  authorize: (requestSignal) => {
                    requestSignal.throwIfAborted();
                    if (
                      initialRange &&
                      Date.parse(permitted.expiresAt ?? "") > Date.now() + 5_000
                    ) {
                      initialRange = false;
                      return Promise.resolve(permitted);
                    }
                    return renewAuthorization().catch(() => {
                      requestSignal.throwIfAborted();
                      throw new LeituraPeAccessError();
                    });
                  },
                  onFailure: (error) => range.abort(error),
                },
                rangeSignal,
                assets,
                staticWorker,
              );
              let full: Promise<ReaderDocument> | undefined;
              const read = async <T,>(run: (source: ReaderDocument) => Promise<T>) => {
                try {
                  rangeSignal.throwIfAborted();
                  return await run(ranged);
                } catch (error) {
                  signal.throwIfAborted();
                  if (!rangeSignal.aborted) throw error;
                  if (rangeSignal.reason instanceof LeituraPeAccessError) throw rangeSignal.reason;
                }
                return run(await (full ??= openFull()));
              };
              return {
                pageCount: ranged.pageCount,
                render: (...args: Parameters<ReaderDocument["render"]>) =>
                  read((source) => source.render(...args)),
                text: (...args: Parameters<ReaderDocument["text"]>) =>
                  read((source) => source.text(...args)),
                async close() {
                  await ranged.close();
                  if (full)
                    await full.then(
                      (source) => source.close(),
                      () => undefined,
                    );
                },
              };
            } catch (error) {
              signal.throwIfAborted();
              const reason: unknown = rangeSignal.aborted ? rangeSignal.reason : error;
              if (reason instanceof LeituraPeAccessError) throw reason;
            }
          }
          return openFull();
        };
        const target =
          !originalRequested && manifest?.page?.page === initialPage ? manifest.page : undefined;
        if (target) {
          try {
            const [bytes, renderer] = await Promise.all([
              fetchVerifiedPdf(target.url, target.size, target.sha256, signal),
              rendererPromise,
            ]);
            derivative = await renderer.openOriginalDocument(
              bytes,
              "application/pdf",
              signal,
              assets,
              staticWorker,
            );
            if (derivative.pageCount !== 1) throw new Error("Prévia de página inválida.");
            signal.throwIfAborted();
            const pageReader = derivative;
            let pending: Promise<ReaderDocument> | undefined;
            const getOriginal = () =>
              (pending ??= tryOriginal().then((loaded) => {
                original = loaded;
                if (loaded.pageCount !== target.pageCount)
                  throw new Error("A quantidade de páginas da prévia diverge do original.");
                return loaded;
              }));
            reader = {
              pageCount: target.pageCount,
              async render(number, canvas, settings, requestSignal) {
                if (number === target.page) {
                  try {
                    return await pageReader.render(1, canvas, settings, requestSignal);
                  } catch {
                    requestSignal.throwIfAborted();
                    setPreviewPage(undefined);
                  }
                }
                return (await getOriginal()).render(number, canvas, settings, requestSignal);
              },
              async text(number, requestSignal) {
                return (await getOriginal()).text(number, requestSignal);
              },
              async close() {
                await Promise.all([pageReader.close(), original?.close()]);
              },
            };
            setPreviewPage(target.page);
          } catch (error) {
            await derivative?.close();
            derivative = undefined;
            signal.throwIfAborted();
            if (error instanceof LeituraPeAccessError) throw error;
          }
        }
        if (!reader) reader = await tryOriginal();
        signal.throwIfAborted();
        if (!Number.isInteger(initialPage) || initialPage < 1 || initialPage > reader.pageCount) {
          await reader.close();
          reader = undefined;
          throw new Error("A página indicada não está disponível nesta revisão.");
        }
        document.current = reader;
        setPages(reader.pageCount);
      } catch (cause) {
        if (!controller.signal.aborted && !isCancelled(cause))
          setError(
            cause instanceof Error &&
              !["network", "invalid", "worker", "resource", "integrity", "password"].includes(
                cause.message,
              )
              ? cause.message
              : failureText[failureKind(cause)],
          );
      } finally {
        if (!controller.signal.aborted) setBusy(false);
      }
    }
    void open();
    // Continued viewing revalidates the authenticated relationship, independently of signed-URL TTL.
    const interval = setInterval(() => {
      void renewAuthorization()
        .then((result) => {
          if (!controller.signal.aborted) setLink(result.url);
        })
        .catch(() => {
          if (controller.signal.aborted) return;
          clearInterval(interval);
          setBusy(false);
          setError(
            "O acesso ao original mudou. Feche e consulte novamente com uma sessão autorizada.",
          );
          setPages(0);
          setLink("");
          document.current = null;
          if (canvas.current) {
            canvas.current.width = 1;
            canvas.current.height = 1;
          }
          void reader?.close();
          controller.abort();
        });
    }, 30_000);
    return () => {
      clearInterval(interval);
      controller.abort();
      document.current = null;
      void reader?.close();
    };
  }, [
    org,
    file.id,
    file.tamanho,
    file.sha256,
    initialPage,
    attempt,
    originalRequested,
    staticWorker,
  ]);
  useEffect(() => {
    const reader = document.current;
    if (!reader || !canvas.current || !pages) return;
    const controller = new AbortController();
    setBusy(true);
    setError("");
    canvas.current.width = 1;
    canvas.current.height = 1;
    setPageText("");
    setTextError("");
    void reader
      .render(
        page,
        canvas.current,
        {
          availableWidth: width,
          availableHeight: Math.max(400, window.innerHeight * 0.65),
          zoom,
          rotation,
          dpr: window.devicePixelRatio,
          mobile: window.matchMedia("(max-width: 767px)").matches,
          fit: "width",
        },
        controller.signal,
      )
      .catch((cause) => {
        if (!controller.signal.aborted && !isCancelled(cause))
          setError(failureText[failureKind(cause)]);
      })
      .finally(() => {
        if (!controller.signal.aborted) setBusy(false);
      });
    return () => controller.abort();
  }, [page, pages, width, zoom, rotation]);
  useEffect(() => {
    const reader = document.current;
    if (!reader || !textOpen || !pages) return;
    const controller = new AbortController();
    void reader
      .text(page, controller.signal)
      .then((text) => {
        if (!controller.signal.aborted) setPageText(text);
      })
      .catch(() => {
        if (!controller.signal.aborted)
          setTextError("Texto desta página indisponível. Consulte a imagem ou abra o original.");
      });
    return () => controller.abort();
  }, [page, pages, textOpen]);
  return (
    <div ref={host} className="min-w-0">
      <div className="nr-actions mb-3">
        <ActionButton
          variant="ghost"
          disabled={page <= 1 || !pages}
          onClick={() => setPage(page - 1)}
          aria-label="Página anterior"
        >
          <ChevronLeft size={16} />
        </ActionButton>
        <span aria-live="polite">
          Página {pages ? page : "—"} de {pages || "—"}
        </span>
        <ActionButton
          variant="ghost"
          disabled={!pages || page >= pages}
          onClick={() => setPage(page + 1)}
          aria-label="Próxima página"
        >
          <ChevronRight size={16} />
        </ActionButton>
        <ActionButton
          variant="ghost"
          disabled={!pages || zoom <= 0.5}
          onClick={() => setZoom(Math.max(0.5, zoom - 0.25))}
          aria-label="Diminuir PDF"
        >
          <ZoomOut size={16} />
        </ActionButton>
        <span>{Math.round(zoom * 100)}%</span>
        <ActionButton
          variant="ghost"
          disabled={!pages || zoom >= 2}
          onClick={() => setZoom(Math.min(2, zoom + 0.25))}
          aria-label="Ampliar PDF"
        >
          <ZoomIn size={16} />
        </ActionButton>
        <ActionButton
          variant="ghost"
          disabled={!pages}
          onClick={() => setRotation((rotation + 90) % 360)}
          aria-label="Girar página"
        >
          <RotateCw size={16} />
        </ActionButton>
        {link && showOriginalLink && (
          <a
            className="inline-flex min-h-11 items-center gap-2 underline text-sm"
            href={link}
            target="_blank"
            rel="noopener noreferrer"
            referrerPolicy="no-referrer"
          >
            <ExternalLink size={16} />
            Abrir ou baixar original
          </a>
        )}
      </div>
      {busy && (
        <p role="status" className="nr-muted mb-2">
          Carregando original autorizado…
        </p>
      )}
      {previewPage === page && pages > 0 && (
        <div className="nr-actions mb-2">
          <p className="nr-muted">Prévia derivada da página original.</p>
          <ActionButton variant="ghost" onClick={() => setOriginalRequested(true)}>
            Carregar PDF original
          </ActionButton>
        </div>
      )}
      {error && (
        <div role="alert" className="nr-feedback mb-3">
          <p>{error}</p>
          <ActionButton variant="ghost" onClick={() => setAttempt(attempt + 1)}>
            Tentar novamente
          </ActionButton>
        </div>
      )}
      <div
        className="overflow-auto max-h-[70dvh] border border-border bg-neutral-100 p-3"
        aria-label={`Página do original: ${file.nome}`}
      >
        <canvas
          ref={canvas}
          className="mx-auto max-w-none"
          role="img"
          aria-label={`Página ${page} do PDF ${previewPage === page ? "derivado" : "original"} ${file.nome}`}
        />
      </div>
      {pages > 0 && (
        <details className="mt-3" onToggle={(event) => setTextOpen(event.currentTarget.open)}>
          <summary className="cursor-pointer">Texto extraído da página para consulta</summary>
          <p className="nr-muted text-sm my-2">
            A ordem do texto extraído pode diferir da disposição visual do original.
          </p>
          <p className="nr-prewrap">
            {textError || pageText || "Nenhum texto extraível nesta página."}
          </p>
        </details>
      )}
    </div>
  );
}
