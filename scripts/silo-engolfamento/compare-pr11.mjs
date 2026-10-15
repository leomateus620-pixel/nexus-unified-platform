import { chromium } from "@playwright/test";
import { mkdir, writeFile } from "node:fs/promises";
import { execFileSync } from "node:child_process";
import assert from "node:assert/strict";
import os from "node:os";

// Run the exact PR11 checkout and the upgrade sequentially, on the same browser
// and host. Their physical scenarios differ: this compares presentation/workload,
// not equivalent accident outcomes or manufacturer mechanics.
const base = process.env.SILO_URL ?? "http://127.0.0.1:5186";
const output = process.env.SILO_OUTPUT ?? "docs/silo-engolfamento/evidence/baseline-pr11";
const source = process.env.SILO_SOURCE ?? process.cwd();
const upgrade = process.env.SILO_UPGRADE === "1";
await mkdir(output, { recursive: true });
const browser = await chromium.launch({ channel: "chrome", headless: true });
const report = {
  testedAt: new Date().toISOString(),
  sourceCommit: execFileSync("git", ["rev-parse", "HEAD"], {
    cwd: source,
    encoding: "utf8",
  }).trim(),
  sourceDirty: execFileSync("git", ["status", "--short"], { cwd: source, encoding: "utf8" }).trim(),
  browser: browser.version(),
  host: {
    cpu: os.cpus()[0]?.model,
    ramBytes: os.totalmem(),
    platform: os.platform(),
    release: os.release(),
  },
  base,
  upgrade,
  screenshots: [],
  samples: [],
  errors: [],
  condition:
    "Local development server, Chrome headless, DPR1, economic quality. Eight-second active playback after 2.5s warmup, seek8, speed0.5. Sources/scenarios intentionally differ; not a calibrated accident comparison. Mobile dimensions are emulation.",
};
const summary = (values) => {
  const sorted = values.toSorted((a, b) => a - b);
  const q = (p) => sorted[Math.min(sorted.length - 1, Math.floor(sorted.length * p))] ?? null;
  return { samples: sorted.length, p50: q(0.5), p95: q(0.95), p99: q(0.99), max: q(1) };
};
try {
  for (const [width, height] of [
    [1440, 900],
    [1366, 768],
    [390, 844],
    [844, 390],
  ]) {
    const context = await browser.newContext({
      viewport: { width, height },
      deviceScaleFactor: 1,
      hasTouch: width < 900,
      isMobile: width < 900,
    });
    const page = await context.newPage();
    page.on("pageerror", (error) => report.errors.push(error.message));
    await page.goto(`${base}/mapas-3d/silo-engolfamento`, { waitUntil: "commit", timeout: 90000 });
    await page.waitForSelector("canvas[data-ready=true]", { timeout: 90000 });
    await page.waitForFunction(
      () => window.__siloMetrics?.readyMs > 0 && !document.querySelector(".silo-load"),
    );
    if (upgrade) {
      await page.getByRole("button", { name: "Simulação", exact: true }).click();
      await page.getByRole("button", { name: "Exibição e qualidade", exact: true }).click();
    }
    const oldDrawer =
      !upgrade && !(await page.getByLabel("Qualidade gráfica", { exact: true }).isVisible());
    if (oldDrawer)
      await page.getByRole("button", { name: "Opções da experiência", exact: true }).click();
    await page.getByLabel("Qualidade gráfica", { exact: true }).selectOption("economic");
    if (oldDrawer)
      await page.getByRole("button", { name: "Opções da experiência", exact: true }).click();
    if (upgrade) await page.getByRole("button", { name: "Fechar inspetor", exact: true }).click();
    await page
      .getByRole("slider", { name: "Instante da simulação", exact: true })
      .evaluate((input) => {
        Object.getOwnPropertyDescriptor(HTMLInputElement.prototype, "value").set.call(input, "8");
        input.dispatchEvent(new Event("input", { bubbles: true }));
        input.dispatchEvent(new Event("change", { bubbles: true }));
      });
    await page.waitForFunction(
      () => Math.abs(Number(document.querySelector("canvas").dataset.time) - 8) < 0.001,
    );
    await page.waitForTimeout(1100);
    await page.evaluate(() => window.scrollTo(0, 0));
    const filename = `${width}x${height}-incident.png`;
    await page.screenshot({ path: `${output}/${filename}` });
    report.screenshots.push({
      filename,
      viewport: { width, height },
      overflow: await page.evaluate(() => document.documentElement.scrollWidth > innerWidth),
    });
    if (width === 1440) {
      await page.getByLabel("Velocidade de reprodução", { exact: true }).selectOption(".5");
      await page.getByRole("button", { name: "Continuar", exact: true }).click();
      await page.waitForTimeout(2500);
      await page.evaluate(() => {
        window.__siloMetrics.frames.length = 0;
      });
      await page.waitForTimeout(8000);
      const data = await page.evaluate(() => ({
        frames: window.__siloMetrics.frames.map((f) => ({ ...f })),
        renderer: window.__siloMetrics.renderer,
        errors: window.__siloMetrics.errors,
        status: document.querySelector("canvas").dataset.status,
      }));
      assert.equal(data.status, "running");
      assert.ok(data.frames.length > 200);
      report.samples.push({
        viewport: { width, height },
        quality: "economic",
        durationMs: 8000,
        frameMs: summary(data.frames.map((f) => f.ms)),
        cpuRenderMs: summary(data.frames.map((f) => f.cpuMs)),
        maxTotalCalls: Math.max(...data.frames.map((f) => f.calls)),
        maxPrincipalTriangles: Math.max(
          ...data.frames.map((f) => f.triangles - (f.shadowTriangles ?? 0)),
        ),
        ...data,
      });
    }
    await context.close();
  }
} finally {
  await browser.close();
  await writeFile(`${output}/comparison.json`, `${JSON.stringify(report, null, 2)}\n`);
}
console.log(
  JSON.stringify({
    samples: report.samples.map(({ frames, ...sample }) => sample),
    screenshots: report.screenshots,
    errors: report.errors,
  }),
);
