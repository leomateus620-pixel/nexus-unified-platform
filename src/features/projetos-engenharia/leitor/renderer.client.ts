import type {
  PDFDocumentLoadingTask,
  PDFDocumentProxy,
  PDFPageProxy,
  RenderTask,
} from "pdfjs-dist";
import {
  PDFJS_VERSION,
  LeituraPeError,
  abortError,
  canvasBudget,
  imageDimensions,
  type OriginalMime,
} from "./domain";

export type RenderSettings = {
  availableWidth: number;
  availableHeight: number;
  zoom: number;
  rotation: number;
  dpr: number;
  mobile: boolean;
  fit: "width" | "page";
};
export type ReaderDocument = {
  pageCount: number;
  render(
    page: number,
    canvas: HTMLCanvasElement,
    settings: RenderSettings,
    signal: AbortSignal,
  ): Promise<{ limited: boolean }>;
  text(page: number, signal: AbortSignal): Promise<string>;
  close(): Promise<void>;
};
function assertOpen(closed: boolean, signal: AbortSignal) {
  signal.throwIfAborted();
  if (closed) throw abortError();
}
function configureCanvas(canvas: HTMLCanvasElement, budget: ReturnType<typeof canvasBudget>) {
  canvas.width = budget.backingWidth;
  canvas.height = budget.backingHeight;
  canvas.style.width = `${budget.cssWidth}px`;
  canvas.style.height = `${budget.cssHeight}px`;
}

/** Only this client-only module imports PDF.js. No native Node/canvas or scripting package. */
async function openPdf(
  bytes: Uint8Array,
  signal: AbortSignal,
  assetBaseUrl: string,
): Promise<ReaderDocument> {
  const [api, { default: workerUrl }] = await Promise.all([
    import("pdfjs-dist/legacy/build/pdf.min.mjs"),
    import("pdfjs-dist/legacy/build/pdf.worker.min.mjs?url"),
  ]);
  signal.throwIfAborted();
  if (api.version !== PDFJS_VERSION) throw new LeituraPeError("worker");
  const base = new URL(assetBaseUrl, window.location.origin);
  if (
    base.origin !== window.location.origin ||
    base.search ||
    base.hash ||
    !base.pathname.endsWith(`/${PDFJS_VERSION}/`)
  )
    throw new LeituraPeError("worker");
  const worker = new Worker(workerUrl, { type: "module", name: "Nexus original PE" });
  const pdfWorker = api.PDFWorker.create({ port: worker });
  let loading: PDFDocumentLoadingTask | undefined;
  let closed = false;
  let password = false;
  let workerFailed = false;
  let document: PDFDocumentProxy;
  let currentPage: PDFPageProxy | undefined;
  let currentTask: RenderTask | undefined;
  let serial = 0;
  let renderBarrier: Promise<unknown> = Promise.resolve();
  let closing: Promise<void> | undefined;
  function failWorker(event: ErrorEvent) {
    event.preventDefault();
    workerFailed = true;
    void loading?.destroy().catch(() => undefined);
    worker.terminate();
  }
  worker.addEventListener("error", failWorker);
  async function close() {
    if (closing) return closing;
    closed = true;
    serial++;
    currentTask?.cancel();
    closing = (async () => {
      let timer: ReturnType<typeof setTimeout> | undefined;
      await Promise.race([
        renderBarrier.catch(() => undefined),
        new Promise<void>((resolve) => {
          timer = setTimeout(resolve, 500);
        }),
      ]);
      if (timer) clearTimeout(timer);
      currentPage?.cleanup();
      currentPage = undefined;
      worker.removeEventListener("error", failWorker);
      signal.removeEventListener("abort", abort);
      // Explicit worker ownership prevents PDF.js falling back to an unbounded fake worker.
      // Ask the transport to stop before terminating its port, but do not retain a stuck worker.
      let shutdownTimer: ReturnType<typeof setTimeout> | undefined;
      await Promise.race([
        loading?.destroy().catch(() => undefined) ?? Promise.resolve(),
        new Promise<void>((resolve) => {
          shutdownTimer = setTimeout(resolve, 500);
        }),
      ]);
      if (shutdownTimer) clearTimeout(shutdownTimer);
      pdfWorker.destroy();
      worker.terminate();
    })();
    return closing;
  }
  const abort = () => {
    void close();
  };
  signal.addEventListener("abort", abort, { once: true });
  try {
    loading = api.getDocument({
      data: bytes,
      worker: pdfWorker,
      cMapUrl: new URL("cmaps/", base).href,
      standardFontDataUrl: new URL("standard_fonts/", base).href,
      wasmUrl: new URL("wasm/", base).href,
      iccUrl: new URL("iccs/", base).href,
      cMapPacked: true,
      useWasm: true,
      enableXfa: false,
      enableHWA: false,
      fontExtraProperties: false,
      stopAtErrors: true,
      canvasMaxAreaInBytes: 32 * 1024 * 1024,
      verbosity: 0,
    });
    loading.onPassword = () => {
      password = true;
      void loading?.destroy().catch(() => undefined);
    };
    let timer: ReturnType<typeof setTimeout> | undefined;
    try {
      document = await Promise.race([
        loading.promise,
        new Promise<never>((_, reject) => {
          timer = setTimeout(() => reject(new LeituraPeError("resource")), 30_000);
        }),
      ]);
    } finally {
      if (timer) clearTimeout(timer);
    }
    assertOpen(closed, signal);
  } catch (error) {
    await close();
    if (password) throw new LeituraPeError("password");
    if (workerFailed) throw new LeituraPeError("worker");
    throw error;
  }
  return {
    pageCount: document.numPages,
    render(pageNumber, canvas, settings, renderSignal) {
      const ticket = ++serial;
      currentTask?.cancel();
      const previous = renderBarrier;
      const job = (async () => {
        await previous.catch(() => undefined);
        assertOpen(closed || ticket !== serial, renderSignal);
        if (currentPage?.pageNumber !== pageNumber) {
          currentPage?.cleanup();
          currentPage = undefined;
        }
        const page = await document.getPage(pageNumber);
        assertOpen(closed || ticket !== serial, renderSignal);
        currentPage = page;
        const baseViewport = page.getViewport({ scale: 1, rotation: settings.rotation });
        const budget = canvasBudget({
          ...settings,
          width: baseViewport.width,
          height: baseViewport.height,
        });
        configureCanvas(canvas, budget);
        const viewport = page.getViewport({ scale: budget.scale, rotation: settings.rotation });
        const task = page.render({
          canvas,
          viewport,
          transform: [budget.ratio, 0, 0, budget.ratio, 0, 0],
          background: "rgb(255,255,255)",
          annotationMode: api.AnnotationMode.ENABLE,
        });
        currentTask = task;
        const cancel = () => task.cancel();
        renderSignal.addEventListener("abort", cancel, { once: true });
        try {
          await task.promise;
        } finally {
          renderSignal.removeEventListener("abort", cancel);
          if (currentTask === task) currentTask = undefined;
        }
        assertOpen(closed || ticket !== serial, renderSignal);
        return { limited: budget.limited };
      })();
      renderBarrier = job;
      return job;
    },
    async text(pageNumber, textSignal) {
      assertOpen(closed, textSignal);
      const page = await document.getPage(pageNumber);
      assertOpen(closed, textSignal);
      const reader = page.streamTextContent().getReader();
      const cancel = () => {
        void reader.cancel().catch(() => undefined);
      };
      textSignal.addEventListener("abort", cancel, { once: true });
      let text = "";
      let items = 0;
      try {
        while (true) {
          const result = await reader.read();
          assertOpen(closed, textSignal);
          if (result.done) break;
          for (const item of result.value.items) {
            if (!("str" in item)) continue;
            items++;
            if (items > 20_000 || text.length + item.str.length > 200_000)
              throw new LeituraPeError("resource");
            text += item.str + (item.hasEOL ? "\n" : " ");
          }
        }
        return text.trim();
      } finally {
        cancel();
        textSignal.removeEventListener("abort", cancel);
        reader.releaseLock();
      }
    },
    close,
  };
}

async function openImage(
  bytes: Uint8Array,
  mime: OriginalMime,
  signal: AbortSignal,
): Promise<ReaderDocument> {
  const dimensions = imageDimensions(bytes, mime);
  const sourcePixels = window.matchMedia("(max-width: 767px)").matches ? 8_000_000 : 24_000_000;
  if (
    dimensions.width < 1 ||
    dimensions.height < 1 ||
    dimensions.width * dimensions.height > sourcePixels
  )
    throw new LeituraPeError("resource");
  const bitmap = await createImageBitmap(new Blob([bytes as BlobPart], { type: mime }));
  let closed = false;
  if (signal.aborted) {
    bitmap.close();
    throw abortError();
  }
  return {
    pageCount: 1,
    async render(_page, canvas, settings, renderSignal) {
      assertOpen(closed, renderSignal);
      const turns = settings.rotation % 180 !== 0;
      const budget = canvasBudget({
        ...settings,
        width: turns ? bitmap.height : bitmap.width,
        height: turns ? bitmap.width : bitmap.height,
      });
      configureCanvas(canvas, budget);
      const context = canvas.getContext("2d");
      if (!context) throw new LeituraPeError("worker");
      context.fillStyle = "white";
      context.fillRect(0, 0, canvas.width, canvas.height);
      context.translate(canvas.width / 2, canvas.height / 2);
      context.rotate((settings.rotation * Math.PI) / 180);
      context.scale(budget.scale * budget.ratio, budget.scale * budget.ratio);
      context.drawImage(bitmap, -bitmap.width / 2, -bitmap.height / 2);
      return { limited: budget.limited };
    },
    async text() {
      return "";
    },
    async close() {
      if (!closed) {
        closed = true;
        bitmap.close();
      }
    },
  };
}
export async function openOriginalDocument(
  bytes: Uint8Array,
  mime: OriginalMime,
  signal: AbortSignal,
  assetBaseUrl: string,
) {
  return mime === "application/pdf"
    ? openPdf(bytes, signal, assetBaseUrl)
    : openImage(bytes, mime, signal);
}
