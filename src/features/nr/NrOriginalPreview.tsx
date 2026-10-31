import { useEffect, useRef, useState } from "react";
import { createClientOnlyFn, useServerFn } from "@tanstack/react-start";
import { ChevronLeft, ChevronRight, ExternalLink, RotateCw, ZoomIn, ZoomOut } from "lucide-react";
import { ActionButton } from "@/components/nexus/Page";
import { nrArquivoBaixar } from "./files.functions";
import { confirmedNrOriginalBytes } from "./original-bytes";
import type { ReaderDocument } from "@/features/projetos-engenharia/leitor/renderer.client";
import {
  failureKind,
  failureText,
  isCancelled,
} from "@/features/projetos-engenharia/leitor/domain";
const loadRenderer = createClientOnlyFn(
  () => import("@/features/projetos-engenharia/leitor/renderer.client"),
);

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
}: {
  org: string;
  file: NrPreviewFile;
  url: string;
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
  const [link, setLink] = useState("");
  const authorization = useRef(authorize);
  authorization.current = authorize;
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
    let reader: ReaderDocument | undefined;
    setBusy(true);
    setLink("");
    setError("");
    setPages(0);
    setPage(1);
    setPageText("");
    async function open() {
      try {
        // A new attempt renews access. Download links remain an explicit fallback for every state.
        const permitted = await authorization.current({
          data: { organization_id: org, id: file.id, visualizar: true },
        });
        controller.signal.throwIfAborted();
        setLink(permitted.url);
        const response = await fetch(permitted.url, {
          signal: controller.signal,
          credentials: "omit",
          cache: "no-store",
          referrerPolicy: "no-referrer",
        });
        const bytes = await confirmedNrOriginalBytes(
          response,
          { tamanho: file.tamanho, sha256: file.sha256 },
          controller.signal,
        );
        const { openOriginalDocument } = await loadRenderer();
        controller.signal.throwIfAborted();
        reader = await openOriginalDocument(
          bytes,
          "application/pdf",
          controller.signal,
          "/pdfjs/6.4.299/",
        );
        controller.signal.throwIfAborted();
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
      void authorization
        .current({ data: { organization_id: org, id: file.id, visualizar: true } })
        .then((result) => {
          if (!controller.signal.aborted) setLink(result.url);
        })
        .catch(() => {
          if (controller.signal.aborted) return;
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
  }, [org, file.id, file.tamanho, file.sha256, attempt]);
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
        {link && (
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
          aria-label={`Página ${page} do PDF original ${file.nome}`}
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
