import { useCallback, useEffect, useRef, useState } from "react";
import { createClientOnlyFn } from "@tanstack/react-start";
import * as Dialog from "@radix-ui/react-dialog";
import {
  ChevronLeft,
  ChevronRight,
  LoaderCircle,
  RotateCw,
  X,
  ZoomIn,
  ZoomOut,
} from "lucide-react";
import {
  ACCESS_INTERVAL_MS,
  PDFJS_VERSION,
  LeituraPeAccessError,
  LeituraPeError,
  failureKind,
  failureText,
  isCancelled,
  pageInput,
  readOriginalBytes,
  validateOriginal,
  verifyOriginalBytes,
  type OriginalPe,
  type ReaderFailureKind,
} from "./domain";
import { ReaderLifetime } from "./lifetime";
import type { ReaderDocument } from "./renderer.client";
const loadRenderer = createClientOnlyFn(() => import("./renderer.client"));

export type LeitorOriginalPeProps = {
  organizationId: string;
  versaoId: string;
  arquivo: OriginalPe;
  onClose: () => void;
  /** Adapter validates the registered file and Storage origin; no browser-editable URL input. */
  fetchAuthorized: (signal: AbortSignal) => Promise<{ url: string; expiresAt?: string }>;
  /** Must validate the exact ID/hash/version/organization and current parent ACL, without a list horizon. */
  checkAccess: (signal: AbortSignal) => Promise<void>;
  sessionSignal?: AbortSignal;
  assetBaseUrl?: string;
};
const buttonClass =
  "inline-flex min-h-11 min-w-11 items-center justify-center gap-1.5 rounded-md border border-border px-3 text-sm text-foreground hover:bg-accent focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring disabled:cursor-not-allowed disabled:opacity-40";
export function LeitorOriginalPe(props: LeitorOriginalPeProps) {
  const key = [
    props.organizationId,
    props.versaoId,
    props.arquivo.id,
    props.arquivo.sha256,
    props.arquivo.tamanho,
    props.arquivo.mime,
  ].join(":");
  return <ReaderSession key={key} {...props} />;
}
function ReaderSession(props: LeitorOriginalPeProps) {
  const callbacks = useRef(props);
  callbacks.current = props;
  const opener = useRef(
    typeof document !== "undefined" && document.activeElement instanceof HTMLElement
      ? document.activeElement
      : null,
  );
  const canvas = useRef<HTMLCanvasElement>(null);
  const stage = useRef<HTMLDivElement>(null);
  const [stageNode, setStageNode] = useState<HTMLDivElement | null>(null);
  const bindStage = useCallback((node: HTMLDivElement | null) => {
    stage.current = node;
    setStageNode(node);
  }, []);
  const lifetime = useRef<ReaderLifetime | null>(null);
  const documentRef = useRef<ReaderDocument | null>(null);
  const textRequest = useRef<AbortController | null>(null);
  const failRef = useRef<(error: unknown) => void>(() => undefined);
  const [attempt, setAttempt] = useState(0);
  const [phase, setPhase] = useState("Confirmando acesso…");
  const [accessConfirmed, setAccessConfirmed] = useState(false);
  const [loaded, setLoaded] = useState(false);
  const [failure, setFailure] = useState<ReaderFailureKind | null>(null);
  const [renderFailure, setRenderFailure] = useState<ReaderFailureKind | null>(null);
  const [rendering, setRendering] = useState(false);
  const [limited, setLimited] = useState(false);
  const [count, setCount] = useState(1);
  const [page, setPage] = useState(1);
  const [pageDraft, setPageDraft] = useState("1");
  const [pageError, setPageError] = useState("");
  const [zoom, setZoom] = useState(1);
  const [rotation, setRotation] = useState(0);
  const [fit, setFit] = useState<"width" | "page">("width");
  const [area, setArea] = useState({ width: 300, height: 400, dpr: 1, mobile: true });
  const [text, setText] = useState<string | null>(null);
  const [textBusy, setTextBusy] = useState(false);
  const [textError, setTextError] = useState("");
  function eraseCanvas() {
    if (canvas.current) {
      canvas.current.style.visibility = "hidden";
      canvas.current.width = 0;
      canvas.current.height = 0;
      canvas.current.style.width = "0px";
      canvas.current.style.height = "0px";
    }
  }
  function close() {
    eraseCanvas();
    textRequest.current?.abort();
    void lifetime.current?.close();
    callbacks.current.onClose();
  }
  useEffect(() => {
    const scope = new ReaderLifetime();
    lifetime.current = scope;
    documentRef.current = null;
    setLoaded(false);
    setAccessConfirmed(false);
    setFailure(null);
    setRenderFailure(null);
    setText(null);
    setTextError("");
    setTextBusy(false);
    setPhase("Confirmando acesso…");
    const signal = scope.controller.signal;
    function fail(error: unknown) {
      if (!scope.active) return;
      eraseCanvas();
      textRequest.current?.abort();
      documentRef.current = null;
      setText(null);
      setTextError("");
      setTextBusy(false);
      setLoaded(false);
      setRendering(false);
      setAccessConfirmed(false);
      setFailure(failureKind(error));
      void scope.close();
    }
    failRef.current = fail;
    let checking = false;
    async function revalidate() {
      if (!scope.active || checking) return;
      checking = true;
      try {
        await callbacks.current.checkAccess(signal);
        scope.assertActive();
      } catch (error) {
        fail(error);
      } finally {
        checking = false;
      }
    }
    const focus = () => {
      void revalidate();
    };
    const visible = () => {
      if (document.visibilityState === "visible") void revalidate();
    };
    const expiredSession = () => fail(new LeituraPeAccessError());
    window.addEventListener("focus", focus);
    document.addEventListener("visibilitychange", visible);
    const timer = setInterval(focus, ACCESS_INTERVAL_MS);
    const sessionSignal = callbacks.current.sessionSignal;
    sessionSignal?.addEventListener("abort", expiredSession, { once: true });
    if (sessionSignal?.aborted) expiredSession();
    scope.register(() => {
      clearInterval(timer);
      window.removeEventListener("focus", focus);
      document.removeEventListener("visibilitychange", visible);
      sessionSignal?.removeEventListener("abort", expiredSession);
      eraseCanvas();
      textRequest.current?.abort();
    });
    void (async () => {
      let bytes: Uint8Array | undefined;
      try {
        scope.assertActive();
        validateOriginal(callbacks.current.arquivo);
        await callbacks.current.checkAccess(signal);
        scope.assertActive();
        setAccessConfirmed(true);
        setPhase("Carregando original…");
        let response: Response | undefined;
        for (let retry = 0; retry < 2; retry++) {
          const authorized = await callbacks.current.fetchAuthorized(signal);
          scope.assertActive();
          const url = new URL(authorized.url, window.location.origin);
          if (!["http:", "https:"].includes(url.protocol)) throw new LeituraPeError("network");
          response = await fetch(url.href, {
            signal,
            cache: "no-store",
            referrerPolicy: "no-referrer",
          });
          if (![401, 403].includes(response.status)) break;
          await response.body?.cancel();
          // Distinguish expired link from current denial without logging the bearer URL.
          await callbacks.current.checkAccess(signal);
          if (retry === 1) throw new LeituraPeError("network");
        }
        if (!response) throw new LeituraPeError("network");
        bytes = await readOriginalBytes(response, callbacks.current.arquivo.tamanho, signal);
        scope.assertActive();
        setPhase("Conferindo original…");
        await verifyOriginalBytes(bytes, callbacks.current.arquivo);
        scope.assertActive();
        await callbacks.current.checkAccess(signal);
        scope.assertActive();
        setPhase("Abrindo documento…");
        const { openOriginalDocument } = await loadRenderer();
        scope.assertActive();
        const doc = await scope.acquire(
          openOriginalDocument(
            bytes,
            callbacks.current.arquivo.mime,
            signal,
            callbacks.current.assetBaseUrl ?? `/pdfjs/${PDFJS_VERSION}/`,
          ),
          (resource) => resource.close(),
        );
        scope.assertActive();
        documentRef.current = doc;
        setCount(doc.pageCount);
        setPage(1);
        setPageDraft("1");
        setZoom(1);
        setRotation(0);
        setLoaded(true);
      } catch (error) {
        fail(error);
      } finally {
        if (bytes?.byteLength) bytes.fill(0);
      }
    })();
    return () => {
      eraseCanvas();
      textRequest.current?.abort();
      documentRef.current = null;
      void scope.close();
    };
  }, [attempt]);
  useEffect(() => {
    // Radix mounts the portal after the first effect; observe the actual mounted workspace.
    const node = stageNode;
    if (!node) return;
    const update = () => {
      const next = {
        width: Math.max(80, node.clientWidth - 32),
        height: Math.max(80, node.clientHeight - 32),
        dpr: window.devicePixelRatio || 1,
        mobile: window.matchMedia("(max-width: 767px)").matches,
      };
      setArea((old) => (JSON.stringify(old) === JSON.stringify(next) ? old : next));
    };
    const observer = new ResizeObserver(update);
    observer.observe(node);
    window.addEventListener("resize", update);
    update();
    return () => {
      observer.disconnect();
      window.removeEventListener("resize", update);
    };
  }, [stageNode]);
  useEffect(() => {
    const doc = documentRef.current;
    const node = canvas.current;
    if (!loaded || !doc || !node) return;
    const controller = new AbortController();
    setRendering(true);
    setRenderFailure(null);
    node.style.visibility = "hidden";
    void doc
      .render(
        page,
        node,
        {
          availableWidth: area.width,
          availableHeight: area.height,
          dpr: area.dpr,
          mobile: area.mobile,
          zoom,
          rotation,
          fit,
        },
        controller.signal,
      )
      .then((result) => {
        if (controller.signal.aborted || !lifetime.current?.active) return;
        node.style.visibility = "visible";
        setLimited(result.limited);
        setRendering(false);
      })
      .catch((error: unknown) => {
        if (controller.signal.aborted || !lifetime.current?.active || isCancelled(error)) return;
        node.style.visibility = "hidden";
        node.width = node.height = 0;
        node.style.width = node.style.height = "0px";
        setRendering(false);
        setRenderFailure(failureKind(error));
      });
    return () => controller.abort();
  }, [loaded, page, zoom, rotation, fit, area]);
  useEffect(() => {
    textRequest.current?.abort();
    setText(null);
    setTextError("");
    setTextBusy(false);
    setPageDraft(String(page));
    setPageError("");
  }, [page]);
  async function readText() {
    if (text !== null) {
      setText(null);
      return;
    }
    const doc = documentRef.current;
    const scope = lifetime.current;
    if (!doc || !scope?.active) return;
    textRequest.current?.abort();
    const request = new AbortController();
    textRequest.current = request;
    const abort = () => request.abort();
    scope.controller.signal.addEventListener("abort", abort, { once: true });
    setTextBusy(true);
    setTextError("");
    try {
      try {
        await callbacks.current.checkAccess(request.signal);
      } catch (error) {
        if (!request.signal.aborted && scope.active) failRef.current(error);
        return;
      }
      const content = await doc.text(page, request.signal);
      if (!request.signal.aborted && scope.active) setText(content);
    } catch (error) {
      if (isCancelled(error) || request.signal.aborted || !scope.active) return;
      if (error instanceof LeituraPeAccessError) failRef.current(error);
      else
        setTextError(
          "Não foi possível obter o texto desta página. A imagem da página continua sendo a referência.",
        );
    } finally {
      scope.controller.signal.removeEventListener("abort", abort);
      if (!request.signal.aborted && scope.active) setTextBusy(false);
    }
  }
  return (
    <Dialog.Root
      open
      onOpenChange={(open) => {
        if (!open) close();
      }}
    >
      <Dialog.Portal>
        <Dialog.Overlay className="fixed inset-0 z-50 bg-black/70" />
        <Dialog.Content
          className="fixed inset-0 z-50 flex min-h-0 min-w-0 flex-col overflow-hidden bg-background text-foreground sm:inset-4 sm:rounded-xl sm:border sm:border-border"
          onCloseAutoFocus={(event) => {
            event.preventDefault();
            if (opener.current?.isConnected) opener.current.focus();
          }}
        >
          <header className="flex shrink-0 items-start gap-3 border-b border-border px-3 py-2 sm:px-4">
            <div className="min-w-0 flex-1">
              <p className="text-xs text-muted-foreground">Original privado · leitura</p>
              <Dialog.Title
                className="truncate text-base font-semibold"
                title={accessConfirmed ? props.arquivo.nome : undefined}
              >
                {accessConfirmed ? props.arquivo.nome : "Ler original"}
              </Dialog.Title>
              <Dialog.Description className="sr-only">
                Leitor do original preservado. Navegue pelas páginas, ajuste o zoom e use o texto
                extraível quando disponível. O arquivo não é editado.
              </Dialog.Description>
            </div>
            <Dialog.Close asChild>
              <button type="button" className={buttonClass} aria-label="Fechar leitor">
                <X aria-hidden="true" size={18} />
                <span className="hidden sm:inline">Fechar</span>
              </button>
            </Dialog.Close>
          </header>
          <div
            className="flex shrink-0 flex-wrap items-center gap-2 border-b border-border px-3 py-2"
            aria-label="Controles do original"
          >
            <div className="flex items-center gap-1">
              <button
                className={buttonClass}
                type="button"
                disabled={!loaded || page <= 1}
                onClick={() => setPage((p) => p - 1)}
                aria-label="Página anterior"
              >
                <ChevronLeft size={18} aria-hidden="true" />
              </button>
              <form
                className="flex items-center gap-1 text-sm"
                onSubmit={(event) => {
                  event.preventDefault();
                  const n = pageInput(pageDraft, count);
                  if (n === null) setPageError(`Informe uma página de 1 a ${count}.`);
                  else {
                    setPage(n);
                    setPageError("");
                  }
                }}
              >
                <label htmlFor="pe-reader-page" className="sr-only">
                  Ir à página
                </label>
                <input
                  id="pe-reader-page"
                  aria-invalid={!!pageError}
                  aria-describedby={pageError ? "pe-reader-page-error" : undefined}
                  className="h-11 w-14 rounded-md border border-border bg-background px-2 text-center text-sm tabular-nums focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
                  inputMode="numeric"
                  pattern="[0-9]*"
                  value={pageDraft}
                  disabled={!loaded}
                  onChange={(event) => setPageDraft(event.target.value)}
                />
                <span aria-label={`de ${count} páginas`}>/ {loaded ? count : "—"}</span>
                <button className="sr-only focus:not-sr-only" type="submit" disabled={!loaded}>
                  Ir
                </button>
              </form>
              <button
                className={buttonClass}
                type="button"
                disabled={!loaded || page >= count}
                onClick={() => setPage((p) => p + 1)}
                aria-label="Próxima página"
              >
                <ChevronRight size={18} aria-hidden="true" />
              </button>
            </div>
            <div className="flex items-center gap-1">
              <button
                className={buttonClass}
                type="button"
                disabled={!loaded || zoom <= 0.25}
                aria-label="Diminuir zoom"
                onClick={() => setZoom((z) => Math.max(0.25, z - 0.25))}
              >
                <ZoomOut size={18} aria-hidden="true" />
              </button>
              <span
                className="min-w-12 text-center text-xs tabular-nums"
                aria-label="Zoom relativo ao ajuste"
              >
                {Math.round(zoom * 100)}%
              </span>
              <button
                className={buttonClass}
                type="button"
                disabled={!loaded || zoom >= 4}
                aria-label="Aumentar zoom"
                onClick={() => setZoom((z) => Math.min(4, z + 0.25))}
              >
                <ZoomIn size={18} aria-hidden="true" />
              </button>
            </div>
            <label className="sr-only" htmlFor="pe-reader-fit">
              Ajuste da página
            </label>
            <select
              id="pe-reader-fit"
              className="h-11 min-w-0 rounded-md border border-border bg-background px-2 text-sm focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
              value={fit}
              disabled={!loaded}
              onChange={(event) => {
                setFit(event.target.value === "page" ? "page" : "width");
                setZoom(1);
              }}
            >
              <option value="width">Ajustar largura</option>
              <option value="page">Página inteira</option>
            </select>
            <button
              className={buttonClass}
              type="button"
              disabled={!loaded}
              onClick={() => setRotation((r) => (r + 90) % 360)}
              aria-label="Girar página 90 graus"
            >
              <RotateCw size={18} aria-hidden="true" />
              <span className="hidden md:inline">Girar</span>
            </button>
            {props.arquivo.mime === "application/pdf" && (
              <button
                className={buttonClass}
                type="button"
                disabled={!loaded || textBusy}
                onClick={() => {
                  void readText();
                }}
              >
                {textBusy ? "Obtendo texto…" : text === null ? "Texto da página" : "Ocultar texto"}
              </button>
            )}
          </div>
          {pageError && (
            <p
              id="pe-reader-page-error"
              role="alert"
              className="px-3 py-1 text-sm text-destructive"
            >
              {pageError}
            </p>
          )}
          {(text !== null || textError) && (
            <section
              className="max-h-[30dvh] shrink-0 overflow-auto border-b border-border p-3"
              aria-label="Texto extraível da página"
            >
              <p className="mb-2 text-xs text-muted-foreground">
                Texto extraível; imagens e disposição visual permanecem na página.
              </p>
              {textError ? (
                <p role="status" className="text-sm">
                  {textError}
                </p>
              ) : (
                <pre className="whitespace-pre-wrap break-words font-sans text-sm">
                  {text || "Não há texto extraível nesta página. Esta prévia não executa OCR."}
                </pre>
              )}
            </section>
          )}
          <div
            ref={bindStage}
            className="relative min-h-0 flex-1 overflow-auto bg-muted/40 p-4 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-inset focus-visible:ring-ring"
            tabIndex={0}
            aria-label="Área da página; setas esquerda e direita navegam"
            onKeyDown={(event) => {
              if (event.target !== event.currentTarget || !loaded) return;
              if (event.key === "ArrowRight" && page < count) {
                event.preventDefault();
                setPage(page + 1);
              } else if (event.key === "ArrowLeft" && page > 1) {
                event.preventDefault();
                setPage(page - 1);
              }
            }}
          >
            <canvas
              ref={canvas}
              className="mx-auto block max-w-none bg-white shadow-sm"
              role="img"
              aria-label={`Página ${page} de ${count} do original`}
              aria-hidden={!!failure || !!renderFailure}
              style={{ visibility: "hidden" }}
            />
            {!loaded && !failure && (
              <div
                className="absolute inset-0 flex items-center justify-center gap-2 px-4 text-center text-sm"
                role="status"
              >
                <LoaderCircle
                  className="animate-spin motion-reduce:animate-none"
                  aria-hidden="true"
                  size={20}
                />
                {phase}
              </div>
            )}
            {loaded && rendering && (
              <div
                className="absolute inset-0 flex items-center justify-center gap-2 text-sm"
                role="status"
              >
                <LoaderCircle
                  className="animate-spin motion-reduce:animate-none"
                  aria-hidden="true"
                  size={20}
                />
                Renderizando página {page}…
              </div>
            )}
            {(failure || renderFailure) && (
              <div
                className="mx-auto flex max-w-lg flex-col items-start gap-3 rounded-lg border border-border bg-card p-4"
                role="alert"
              >
                <p className="text-sm">{failureText[failure ?? renderFailure ?? "network"]}</p>
                <button
                  type="button"
                  className={buttonClass}
                  onClick={() => setAttempt((n) => n + 1)}
                >
                  Tentar novamente
                </button>
              </div>
            )}
          </div>
          <footer
            className="flex shrink-0 flex-wrap items-center justify-between gap-x-3 gap-y-1 border-t border-border px-3 py-2 text-xs text-muted-foreground"
            aria-live="polite"
          >
            <span>
              {loaded
                ? `Página ${page} de ${count}${limited ? " · resolução limitada ao dispositivo" : ""}`
                : "Prévia do original preservado"}
            </span>
            {accessConfirmed && (
              <span className="font-mono" title={props.arquivo.sha256}>
                SHA-256 {props.arquivo.sha256.slice(0, 12)}…
              </span>
            )}
          </footer>
        </Dialog.Content>
      </Dialog.Portal>
    </Dialog.Root>
  );
}
