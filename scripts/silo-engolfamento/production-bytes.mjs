import { chromium } from "@playwright/test";
import { mkdir, writeFile } from "node:fs/promises";
import assert from "node:assert/strict";

const base = process.env.SILO_URL ?? "http://127.0.0.1:5190";
const output = process.env.SILO_OUTPUT ?? "docs/silo-engolfamento/evidence";
// Keep measurements, without publishing transient identifiers injected by the
// host's web protection software. This does not alter browser/network settings.
const evidenceUrl = (url) => {
  const parsed = new URL(url);
  return parsed.hostname.endsWith("kaspersky-labs.com")
    ? `${parsed.origin}/[system-injected]`
    : url;
};
await mkdir(output, { recursive: true });
const browser = await chromium.launch({ channel: "chrome", headless: true });
const report = {
  testedAt: new Date().toISOString(),
  browser: browser.version(),
  server: base,
  environment: "Build de produção, Wrangler local; não é implantação",
  library: null,
  runs: [],
  errors: [],
};
try {
  const libraryContext = await browser.newContext();
  const library = await libraryContext.newPage();
  const modelRequests = [];
  library.on("request", (request) => {
    if (/\.glb(?:\?|$)/.test(request.url())) modelRequests.push(request.url());
  });
  // Ambient host-injected polling is unrelated to route/model readiness.
  await library.goto(`${base}/mapas-3d/unidades`, {
    waitUntil: "commit",
    timeout: 90000,
  });
  await library.locator('a[href="/mapas-3d/silo-engolfamento"]').waitFor();
  await library.waitForTimeout(500);
  assert.equal(await library.locator("canvas").count(), 0);
  assert.equal(modelRequests.length, 0);
  report.library = { modelRequests, canvases: 0, card: true };
  await libraryContext.close();
  const context = await browser.newContext({ viewport: { width: 1440, height: 1000 } }),
    page = await context.newPage();
  page.on("pageerror", (error) => report.errors.push(error.message));
  const cdp = await context.newCDPSession(page);
  await cdp.send("Network.enable");
  let responses = new Map(),
    transfers = new Map();
  cdp.on("Network.responseReceived", ({ requestId, response }) =>
    responses.set(requestId, {
      url: evidenceUrl(response.url),
      status: response.status,
      fromDiskCache: response.fromDiskCache ?? false,
    }),
  );
  cdp.on("Network.loadingFinished", ({ requestId, encodedDataLength }) =>
    transfers.set(requestId, encodedDataLength),
  );
  for (const name of ["cold", "warm"]) {
    responses = new Map();
    transfers = new Map();
    const start = Date.now();
    if (name === "cold")
      await page.goto(`${base}/mapas-3d/silo-engolfamento`, {
        waitUntil: "commit",
        timeout: 90000,
      });
    else await page.reload({ waitUntil: "commit", timeout: 90000 });
    const navigationToCommitMs = Date.now() - start;
    await page.waitForSelector("canvas[data-ready=true]", { timeout: 90000 });
    await page.waitForFunction(
      () => window.__siloMetrics?.readyMs > 0 && !document.querySelector(".silo-load"),
    );
    const routeReadyMs = Date.now() - start;
    await page.waitForTimeout(500);
    const metrics = await page.evaluate(() => {
      const m = window.__siloMetrics;
      return {
        readyMs: m.readyMs,
        rendererStartedAtMs: m.startedAt,
        documentStateAtReady: document.readyState,
        assets: m.assets,
        geometryBytes: m.geometryBytes,
        textureBytes: m.textureBytes,
        renderer: m.renderer,
        errors: m.errors,
      };
    });
    const rawResources = await page.evaluate(() =>
      performance.getEntriesByType("resource").map((r) => ({
        url: r.name,
        startMs: r.startTime,
        durationMs: r.duration,
        responseEndMs: r.responseEnd,
        transferBytes: r.transferSize,
        encodedBytes: r.encodedBodySize,
        decodedBytes: r.decodedBodySize,
      })),
    );
    const resources = rawResources.map((resource) => ({
      ...resource,
      url: evidenceUrl(resource.url),
    }));
    const navigation = await page.evaluate(() => {
      const entry = performance.getEntriesByType("navigation")[0];
      return {
        responseStartMs: entry?.responseStart,
        responseEndMs: entry?.responseEnd,
        domInteractiveMs: entry?.domInteractive,
        domContentLoadedMs: entry?.domContentLoadedEventEnd,
      };
    });
    const network = [...responses].map(([id, value]) => ({
      ...value,
      encodedDataLength: transfers.get(id) ?? 0,
    }));
    report.runs.push({
      name,
      routeReadyMs,
      navigationToCommitMs,
      navigation,
      ...metrics,
      encodedNetworkBytes: network.reduce((n, r) => n + r.encodedDataLength, 0),
      resourceTimingBytes: resources.reduce((n, r) => n + r.transferBytes, 0),
      resources,
      network,
    });
    assert.equal(await page.locator("canvas").count(), 1);
    assert.equal(metrics.errors.length, 0);
  }
  const cold = report.runs[0];
  assert.ok(
    cold.encodedNetworkBytes < 12_000_000,
    `Cold load exceeds12MB: ${cold.encodedNetworkBytes}`,
  );
  await context.close();
} finally {
  await browser.close();
  await writeFile(`${output}/production-loading.json`, JSON.stringify(report, null, 2));
}
console.log(
  JSON.stringify({
    library: report.library,
    runs: report.runs.map((r) => ({
      name: r.name,
      routeReadyMs: r.routeReadyMs,
      rendererReadyMs: r.readyMs,
      navigationToCommitMs: r.navigationToCommitMs,
      rendererStartedAtMs: r.rendererStartedAtMs,
      encodedNetworkBytes: r.encodedNetworkBytes,
      modelsBytes: Object.values(r.assets).reduce((a, b) => a + b, 0),
    })),
    errors: report.errors,
  }),
);
