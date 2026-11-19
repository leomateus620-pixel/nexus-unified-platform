// Real browser and reader, synthetic technical drawings. The fixture runs exclusively on loopback.
import { crc32, deflateSync } from "node:zlib";
import { createHash } from "node:crypto";
import { performance } from "node:perf_hooks";
import {
  PDFDocument,
  concatTransformationMatrix,
  drawObject,
  popGraphicsState,
  pushGraphicsState,
} from "pdf-lib";

export function drawingPng(width, height, compressed = true) {
  const chunk = (tag, bytes) => {
    const name = Buffer.from(tag);
    const header = Buffer.alloc(8);
    header.writeUInt32BE(bytes.length);
    name.copy(header, 4);
    const footer = Buffer.alloc(4);
    footer.writeUInt32BE(crc32(bytes, crc32(name)));
    return Buffer.concat([header, bytes, footer]);
  };
  const header = Buffer.alloc(13);
  header.writeUInt32BE(width);
  header.writeUInt32BE(height, 4);
  header[8] = 8;
  header[9] = 2;
  const stride = 1 + width * 3;
  const pixels = Buffer.alloc(stride * height);
  for (let y = 0; y < height; y++) {
    for (let x = 0; x < width; x++) {
      const ink = x % 48 < 2 || y % 64 < 2;
      const grain = ((x * 63 + y * 49) ^ (x * y)) & 63;
      pixels.writeUIntBE((ink ? 0x245246 : 0x95a386) + grain * 0x010101, y * stride + 1 + x * 3, 3);
    }
  }
  return Buffer.concat([
    Buffer.from([137, 80, 78, 71, 13, 10, 26, 10]),
    chunk("IHDR", header),
    chunk("IDAT", deflateSync(pixels, { level: compressed ? 6 : 0 })),
    chunk("IEND", Buffer.alloc(0)),
  ]);
}

export async function drawingPdf() {
  const doc = await PDFDocument.create();
  for (let i = 0; i < 24; i++) {
    const page = doc.addPage([620, 780]);
    const pixels = Buffer.alloc(590 * 590 * 3, 225);
    for (let row = 0; row < 590; row += 32) {
      pixels.fill(32 + i, row * 590 * 3, (row + 2) * 590 * 3);
    }
    const raster = doc.context.register(
      doc.context.stream(pixels, {
        Type: "XObject",
        Subtype: "Image",
        Width: 590,
        Height: 590,
        ColorSpace: "DeviceRGB",
        BitsPerComponent: 8,
      }),
    );
    const name = page.node.newXObject("Planta", raster);
    page.pushOperators(
      pushGraphicsState(),
      concatTransformationMatrix(570, 0, 0, 570, 25, 70),
      drawObject(name),
      popGraphicsState(),
    );
    page.drawText("Prancha de ensaio " + (i + 1), { x: 25, y: 700, size: 19 });
  }
  return Buffer.from(await doc.save({ useObjectStreams: false }));
}

export async function pdfRepresentations(bytes) {
  const source = await PDFDocument.load(bytes);
  const chunks = [];
  for (let offset = 0; offset < bytes.length; offset += 262144)
    chunks.push(sha256(bytes.subarray(offset, offset + 262144)));
  const pages = [];
  for (const page of [1, 2]) {
    const target = await PDFDocument.create({ updateMetadata: false });
    const [copy] = await target.copyPages(source, [page - 1]);
    target.addPage(copy);
    const data = Buffer.from(await target.save({ useObjectStreams: true }));
    pages.push({
      page,
      pageCount: source.getPageCount(),
      size: data.length,
      sha256: sha256(data),
      data,
    });
  }
  return { chunks, pages };
}

export const sha256 = (bytes) => createHash("sha256").update(bytes).digest("hex");

// Generate both renditions from the benchmark original before the throttled sessions start.
export async function drawingWebps(browser, originalUrl) {
  const page = await browser.newPage();
  try {
    await page.goto(originalUrl);
    const variants = await page.evaluate(async () => {
      const source = document.images[0];
      await source.decode();
      return [384, 1280].map((width) => {
        const canvas = document.createElement("canvas");
        canvas.width = width;
        canvas.height = Math.round((source.naturalHeight * width) / source.naturalWidth);
        canvas.getContext("2d").drawImage(source, 0, 0, canvas.width, canvas.height);
        return canvas.toDataURL("image/webp", 0.88).split(",")[1];
      });
    });
    return variants.map((encoded) => Buffer.from(encoded, "base64"));
  } finally {
    await page.close();
  }
}

export function serveBytes(req, res, bytes, mime) {
  let start = 0;
  let end = bytes.length - 1;
  if (req.headers.range) {
    const match = /^bytes=(\d+)-(\d+)$/.exec(req.headers.range);
    if (!match || Number(match[2]) < Number(match[1]) || Number(match[2]) >= bytes.length) {
      res.writeHead(416).end();
      return;
    }
    start = Number(match[1]);
    end = Number(match[2]);
  }
  res.writeHead(req.headers.range ? 206 : 200, {
    "content-type": mime,
    "content-length": end - start + 1,
    ...(req.headers.range ? { "content-range": `bytes ${start}-${end}/${bytes.length}` } : {}),
    "accept-ranges": "bytes",
    "cache-control": "no-store",
    "access-control-allow-origin": "*",
    "access-control-expose-headers": "content-length, content-range, accept-ranges",
  });
  res.end(bytes.subarray(start, end + 1));
}

const elapsed = (start) => Math.round(performance.now() - start);
async function decoded(locator) {
  await locator.waitFor({ state: "attached", timeout: 60000 });
  await locator.evaluate(async (img) => {
    await img.decode();
    await new Promise(requestAnimationFrame);
  });
}

async function observeMapSelection(choice) {
  await choice.evaluate((button) => {
    button.addEventListener(
      "click",
      () => {
        const click = performance.now();
        const measurements = {};
        window.cruzAltaMapBenchmark = measurements;
        const observer = new MutationObserver(() => {
          if (measurements.shellMs === undefined && document.querySelector(".ca-drawer h2"))
            measurements.shellMs = Math.round(performance.now() - click);
          if (measurements.cardMs === undefined && document.querySelector(".ca-rdo-card"))
            measurements.cardMs = Math.round(performance.now() - click);
          if (!document.querySelector('.ca-rdo-card img[data-loaded="true"]')) return;
          observer.disconnect();
          requestAnimationFrame(() =>
            requestAnimationFrame(() => {
              measurements.thumbnailMs = Math.round(performance.now() - click);
            }),
          );
        });
        observer.observe(document.body, {
          childList: true,
          subtree: true,
          attributes: true,
          attributeFilter: ["data-loaded"],
        });
      },
      { capture: true, once: true },
    );
  });
}

// Keep only timing, byte counts and the type of request. Signed URLs and user data never enter the report.
function observeTransfers(cdp) {
  const requests = new Map();
  const completed = [];
  cdp.on("Network.requestWillBeSent", ({ requestId, timestamp, request }) => {
    const path = new URL(request.url).pathname;
    let kind;
    if (path.includes("/nexus-cruz-alta-pdf-previas/")) kind = "pagina-derivada";
    else if (path.includes("/object/sign/")) kind = "original-assinado";
    else if (path.includes("pdf.worker") || path.includes("pdf__min")) kind = "motor-pdf";
    else if (path.includes("/_serverFn/")) {
      try {
        const name = JSON.parse(Buffer.from(path.split("/").at(-1), "base64url")).export;
        kind = name?.split("_createServerFn")[0];
      } catch {
        /* Some builds use opaque server-function IDs. */
      }
      kind ??= "consulta";
    }
    if (kind) requests.set(requestId, { kind, start: timestamp });
  });
  cdp.on("Network.responseReceived", ({ requestId, timestamp }) => {
    const event = requests.get(requestId);
    if (event) event.first = timestamp;
  });
  cdp.on("Network.loadingFinished", ({ requestId, timestamp, encodedDataLength }) => {
    const event = requests.get(requestId);
    if (event?.first)
      completed.push({
        kind: event.kind,
        ttfbMs: Math.round(1000 * (event.first - event.start)),
        transferMs: Math.max(0, Math.round(1000 * (timestamp - event.first))),
        bytes: Math.round(encodedDataLength),
      });
    requests.delete(requestId);
  });
  cdp.on("Network.loadingFailed", ({ requestId }) => requests.delete(requestId));
  return completed;
}

export async function runMediaBenchmark({
  browser,
  map,
  fakeApi,
  session,
  trace,
  pdfSize,
  photoSize,
}) {
  const count = Number(process.env.CA_MEDIA_SAMPLES ?? 10);
  if (!Number.isInteger(count) || count < 1 || count > 100) throw Error("Amostragem inválida");
  const surface = process.env.CA_MEDIA_SURFACE ?? "acervo";
  if (surface !== "map" && surface !== "acervo") throw Error("Superfície de ensaio inválida");
  const rounds = [];
  for (let i = 0; i < count; i++) {
    const mobile = i % 2 === 1;
    const ctx = await browser.newContext({
      viewport: mobile ? { width: 390, height: 844 } : { width: 1440, height: 900 },
      reducedMotion: "reduce",
      ...(surface === "map" && mobile ? { isMobile: true, hasTouch: true } : {}),
    });
    let page;
    try {
      await ctx.addInitScript(
        (s) => localStorage.setItem("sb-127-auth-token", JSON.stringify(s)),
        session,
      );
      page = await ctx.newPage();
      page.setDefaultTimeout(60000);
      let mapChoice;
      if (surface === "map") {
        await page.goto(map);
        await page.locator(".ca-stage canvas[data-camera]").waitFor();
      } else {
        await page.goto(map + "?vista=acervo&objeto=cobertura-05");
        await page
          .getByText("Nenhum documento vinculado", { exact: true })
          .waitFor({ state: "attached" });
      }
      const cdp = await ctx.newCDPSession(page);
      await cdp.send("Network.enable");
      const transfers = observeTransfers(cdp);
      await cdp.send("Network.emulateNetworkConditions", {
        offline: false,
        latency: 80,
        downloadThroughput: 2_500_000,
        uploadThroughput: 2_500_000,
      });
      if (surface === "map") {
        await page.getByRole("searchbox", { name: "Buscar setor, estrutura ou LVHF" }).fill("11");
        await page
          .getByRole("group", { name: "Filtrar resultados" })
          .getByRole("button", { name: "Componentes" })
          .click();
        mapChoice = page
          .locator(".ca-browser button[data-ca-select]")
          .filter({ hasText: /^11\s*·/ });
        await mapChoice.waitFor();
        await observeMapSelection(mapChoice);
      }
      const driveBefore = trace.driveCalls ?? 0;
      const replicaOffset = trace.rdoRepresentations?.length ?? 0;
      const selectAt = performance.now();
      if (mapChoice) {
        if (mobile) await mapChoice.tap();
        else await mapChoice.click();
      } else {
        await page.getByLabel("Estrutura ou componente").selectOption("cobertura-11");
      }
      const gallery = page.getByRole("region", { name: "Fotos de montagem" });
      const card = gallery.getByRole("button", { name: /Abrir foto RDO de teste 11-1/ });
      await decoded(card.locator("img"));
      const automationThumbnailMs = elapsed(selectAt);
      const mapSelection = mapChoice
        ? await (
            await page.waitForFunction(() => {
              const measurements = window.cruzAltaMapBenchmark;
              return Number.isFinite(measurements?.thumbnailMs) && measurements;
            })
          ).jsonValue()
        : undefined;
      const thumbnailMs = mapSelection?.thumbnailMs ?? automationThumbnailMs;
      const driveToThumbnail = (trace.driveCalls ?? 0) - driveBefore;
      const viewAt = performance.now();
      await card.click();
      const viewer = gallery.getByRole("group", { name: "Visualizador de fotos" });
      await decoded(viewer.locator("img.ca-rdo-rendered"));
      const photoViewMs = elapsed(viewAt);
      const original = viewer.getByRole("button", { name: /original/i });
      let originalMs = photoViewMs;
      if (await original.count()) {
        const start = performance.now();
        await original.click();
        await decoded(
          viewer.locator(
            'img[data-representation="original"], [data-representation="original"] img.ca-rdo-rendered',
          ),
        );
        originalMs = elapsed(start);
      }
      await viewer.getByRole("button", { name: "Fechar foto" }).click();
      const pdfAt = performance.now();
      await page.getByRole("button", { name: /Revisão 03/ }).click();
      await page.waitForFunction(
        () => {
          const canvas = document.querySelector('canvas[aria-label^="Página 1 do PDF"]');
          if (
            !canvas ||
            canvas.width < 200 ||
            canvas.height < 200 ||
            [...document.querySelectorAll(".ca-drawer [role=status]")].some((e) =>
              e.textContent.includes("Carregando original autorizado"),
            )
          )
            return false;
          const data = canvas.getContext("2d").getImageData(0, 0, canvas.width, canvas.height).data;
          for (let p = 0; p < data.length; p += 128)
            if (data[p + 3] > 240 && data[p] < 128) return true;
          return false;
        },
        undefined,
        { timeout: 90000, polling: 75 },
      );
      const pdfPageMs = elapsed(pdfAt);
      const pdfSource = (
        await page
          .locator('.ca-drawer canvas[aria-label^="Página 1 do PDF"]')
          .getAttribute("aria-label")
      ).includes("derivado")
        ? "página derivada"
        : "original";
      const represented = new Set(
        trace.rdoRepresentations?.slice(replicaOffset).map(({ variant }) => variant),
      );
      const directMs = await page.evaluate(async (url) => {
        const start = performance.now();
        const blob = await (await fetch(url, { cache: "no-store" })).blob();
        const image = await createImageBitmap(blob);
        image.close();
        return Math.round(performance.now() - start);
      }, fakeApi + "/benchmark/original.png");
      rounds.push({
        mobile,
        thumbnailMs,
        driveToThumbnail,
        photoViewMs,
        originalMs,
        directMs,
        overheadMs: originalMs - directMs,
        pdfPageMs,
        pdfSource,
        ...(surface === "map"
          ? {
              automationThumbnailMs,
              mapSelection,
              photoSources: Object.fromEntries(
                ["thumbnail", "preview", "original"].map((variant) => [
                  variant,
                  represented.has(variant) ? "réplica privada" : "Drive",
                ]),
              ),
            }
          : {}),
        transfers,
      });
      console.log(JSON.stringify({ ...rounds.at(-1), transfers: undefined }));
    } catch (error) {
      console.error(
        "Estado da ficha no ensaio local",
        await page
          ?.locator(".ca-drawer")
          .innerText({ timeout: 2000 })
          .catch(() => "indisponível"),
      );
      throw error;
    } finally {
      await ctx.close();
    }
  }
  const stats = {};
  for (const key of [
    "thumbnailMs",
    "photoViewMs",
    "originalMs",
    "directMs",
    "overheadMs",
    "pdfPageMs",
    "driveToThumbnail",
    ...(surface === "map" ? ["automationThumbnailMs"] : []),
  ]) {
    const values = rounds.map((r) => r[key]).sort((a, b) => a - b);
    stats[key] = {
      median: values[Math.ceil(count / 2) - 1],
      p95: values[Math.ceil(0.95 * count) - 1],
    };
  }
  trace.performance = {
    profile: {
      surface,
      ...(surface === "map"
        ? { thumbnailClock: "evento de clique até a primeira pintura da miniatura" }
        : {}),
      mbps: 20,
      latencyMs: 80,
      sourceRttMs: 80,
      pdfBytes: pdfSize,
      imageBytes: photoSize,
    },
    stats,
    rounds,
  };
  console.log(JSON.stringify(trace.performance));
  if (process.env.CA_MEDIA_ENFORCE_BUDGETS === "1") {
    const limits = { thumbnailMs: 1500, photoViewMs: 2500, pdfPageMs: 2500, overheadMs: 1000 };
    for (const [metric, limit] of Object.entries(limits))
      if (stats[metric].p95 > limit)
        throw new Error(`p95 de ${metric}: ${stats[metric].p95} ms (meta ${limit} ms)`);
  }
}
