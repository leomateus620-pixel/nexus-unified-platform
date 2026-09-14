import { chromium } from "@playwright/test";
import fs from "node:fs/promises";
import os from "node:os";
const url = process.env.MAP_URL ?? "http://127.0.0.1:4173/mapas-3d";
const browser = await chromium.launch({ channel: "chrome", headless: true });
const results = [];
for (const profile of ["balanced", "economy"]) {
  const mobile = profile === "economy";
  const context = await browser.newContext({
    viewport: mobile ? { width: 390, height: 844 } : { width: 1448, height: 1000 },
    deviceScaleFactor: 1,
    isMobile: mobile,
    hasTouch: mobile,
  });
  const page = await context.newPage();
  const errors = [];
  page.on("pageerror", (e) => errors.push(e.message));
  const cdp = await context.newCDPSession(page);
  await cdp.send("Network.enable");
  await cdp.send("Network.setCacheDisabled", { cacheDisabled: true });
  await page.goto(url);
  await page.waitForFunction(
    () => window.__industrialMetrics?.status === "ready",
    {},
    { timeout: 60000 },
  );
  const loading = await page.evaluate(() => ({
    readyMs: window.__industrialMetrics.readyAt,
    modelLoadMs: window.__industrialMetrics.readyAt - window.__industrialMetrics.startedAt,
    assets: window.__industrialMetrics.assets,
    resources: performance.getEntriesByType("resource").map((r) => r.toJSON()),
    navigation: performance.getEntriesByType("navigation").map((r) => r.toJSON()),
  }));
  if (await page.locator(".industrial-sidebar.is-open").count())
    await page.getByRole("button", { name: "Recolher painel" }).click();
  await page.getByRole("button", { name: "Passeio", exact: true }).click();
  await page.waitForTimeout(800);
  // A continuously moving observation camera for >=120 seconds per profile.
  // Walk inputs include obstacles and side steps; no automated process simulation.
  await page.evaluate(() => {
    window.__industrialMetrics.samples.length = 0;
    window.__industrialMetrics.renderedFrames = 0;
  });
  const start = Date.now();
  let step = 0;
  const route = [];
  while (Date.now() - start < 120000) {
    const key = ["w", "d", "s", "a", "w", "a", "s", "d"][step % 8];
    await page.keyboard.down(key);
    for (let i = 0; i < 6; i++) {
      const area = await page.locator("canvas").boundingBox();
      const cx = area.x + area.width * 0.55,
        cy = area.y + area.height * 0.38;
      await page.mouse.move(cx, cy);
      await page.mouse.down();
      await page.mouse.move(cx + (step % 2 ? 45 : -45), cy + (i % 2 ? 3 : -3), { steps: 6 });
      await page.mouse.up();
      await page.waitForTimeout(700);
    }
    await page.keyboard.up(key);
    route.push({
      key,
      elapsedMs: Date.now() - start,
      camera: await page.evaluate(() => window.__industrialMetrics.camera),
    });
    step++;
  }
  const elapsedMs = Date.now() - start;
  const metrics = await page.evaluate(() => ({
    ...window.__industrialMetrics,
    userAgent: navigator.userAgent,
    jsHeap: performance.memory
      ? {
          usedJSHeapSize: performance.memory.usedJSHeapSize,
          totalJSHeapSize: performance.memory.totalJSHeapSize,
        }
      : null,
  }));
  const times = metrics.samples.map((s) => s.ms).sort((a, b) => a - b),
    percentile = (p) => times[Math.min(times.length - 1, Math.floor(times.length * p))] ?? 0;
  const summary = {
    durationMs: elapsedMs,
    sampledFrames: times.length,
    meanMs: times.reduce((a, b) => a + b, 0) / times.length,
    p50Ms: percentile(0.5),
    p95Ms: percentile(0.95),
    p99Ms: percentile(0.99),
    maxMs: Math.max(...times),
    medianFps: 1000 / percentile(0.5),
    framesOver50Ms: times.filter((t) => t > 50).length,
    maxCalls: Math.max(...metrics.samples.map((s) => s.calls)),
    maxTriangles: Math.max(...metrics.samples.map((s) => s.triangles)),
    maxMainCalls: Math.max(...metrics.samples.map((s) => s.mainCalls ?? 0)),
    maxShadowCalls: Math.max(...metrics.samples.map((s) => s.shadowCalls ?? 0)),
    maxMainTriangles: Math.max(...metrics.samples.map((s) => s.mainTriangles ?? 0)),
    maxShadowTriangles: Math.max(...metrics.samples.map((s) => s.shadowTriangles ?? 0)),
  };
  await page.getByRole("button", { name: "Sair do passeio", exact: true }).click();
  await page.waitForTimeout(2300);
  const idleBefore = await page.evaluate(() => window.__industrialMetrics.renderedFrames);
  await page.waitForTimeout(2500);
  const idleFrames =
    (await page.evaluate(() => window.__industrialMetrics.renderedFrames)) - idleBefore;
  await page.screenshot({ path: `docs/industrial/evidence/profile-${profile}.png` });
  const result = {
    profile,
    emulatedMobile: mobile,
    browserVersion: browser.version(),
    host: {
      platform: os.platform(),
      release: os.release(),
      cpu: os.cpus()[0]?.model,
      ramBytes: os.totalmem(),
    },
    loading,
    summary,
    idleFrames,
    errors,
    route,
    metrics,
  };
  results.push(result);
  await fs.writeFile(
    `docs/industrial/evidence/performance-${profile}.json`,
    JSON.stringify(result, null, 2),
  );
  console.log(JSON.stringify({ profile, summary, idleFrames, errors }));
  await context.close();
}
await fs.writeFile(
  "docs/industrial/evidence/performance-summary.json",
  JSON.stringify(
    results.map(
      ({
        profile,
        summary,
        idleFrames,
        errors,
        loading,
        metrics,
        browserVersion,
        host,
        emulatedMobile,
      }) => ({
        profile,
        summary,
        idleFrames,
        errors,
        loading,
        renderer: metrics.renderer,
        contextLosses: metrics.contextLosses,
        estimatedGeometryBytes: metrics.estimatedGeometryBytes,
        estimatedTextureBytes: metrics.estimatedTextureBytes,
        jsHeap: metrics.jsHeap,
        browserVersion,
        host,
        emulatedMobile,
      }),
    ),
    null,
    2,
  ),
);
await browser.close();
