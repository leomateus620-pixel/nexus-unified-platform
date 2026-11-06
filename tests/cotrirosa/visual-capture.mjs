// Compiled real Nexus scene + isolated SQL fixture; no production interception.
import { chromium } from "@playwright/test";
import { mkdir, writeFile } from "node:fs/promises";
import { execFileSync } from "node:child_process";
import { ids } from "./fixture.mjs";
const phase = process.argv[2] || "after";
const root = "http://127.0.0.1:4197";
const url = `${root}/nr-33/mapa-3d?cliente=${ids.client}&unidade=${ids.unit}&camera=normal`;
const out = "docs/cotrirosa/visual-local";
await mkdir(out, { recursive: true });
const browser = await chromium.launch({
  headless: true,
  args: ["--use-angle=d3d11", "--enable-gpu", "--ignore-gpu-blocklist"],
});
const report = {
  phase,
  commit: execFileSync("git", ["rev-parse", "HEAD"], { encoding: "utf8" }).trim(),
  browser: browser.version(),
  network: "20 Mb/s down, 10 Mb/s up, 40 ms RTT, cold cache, loopback SQL",
  physicalPhone: false,
  runs: [],
};
try {
  const runs = ["stairs", "facade", "lighting"].includes(phase)
    ? []
    : phase === "terrain"
      ? [["auto", false]]
      : [
          ["auto", false],
          ["balanced", false],
          ["auto", true],
        ];
  for (const [choice, mobile] of runs) {
    const viewport = mobile ? { width: 390, height: 844 } : { width: 1440, height: 1000 };
    const context = await browser.newContext({
      viewport,
      deviceScaleFactor: 1,
      isMobile: mobile,
      hasTouch: mobile,
      reducedMotion: "reduce",
      recordVideo: { dir: out, size: viewport },
    });
    await context.addInitScript((choice) => {
      localStorage.setItem("nexus:nr-map:quality:v1", choice);
      window.__frames = [];
      window.__sample = true;
      let last = 0;
      function sample() {
        if (!window.__sample) return;
        const c = document.querySelector("canvas[data-ready=true]");
        const t = Number(c?.dataset.frameTime);
        if (t > 0 && t !== last) {
          window.__frames.push({
            t,
            camera: c.dataset.camera,
            buffer: [c.width, c.height],
            profile: c.dataset.profile,
            metrics: c.dataset.metrics,
          });
          last = t;
        }
        requestAnimationFrame(sample);
      }
      requestAnimationFrame(sample);
    }, choice);
    const page = await context.newPage();
    const errors = [];
    page.on("pageerror", (e) => errors.push(e.message));
    const cdp = await context.newCDPSession(page);
    await cdp.send("Network.enable");
    await cdp.send("Network.setCacheDisabled", { cacheDisabled: true });
    await cdp.send("Network.emulateNetworkConditions", {
      offline: false,
      latency: 40,
      downloadThroughput: 2500000,
      uploadThroughput: 1250000,
      connectionType: "wifi",
    });
    let bytes = 0;
    cdp.on("Network.loadingFinished", (e) => {
      bytes += e.encodedDataLength;
    });
    const start = Date.now();
    await page.goto(url);
    await page.waitForFunction(
      () => Number(document.querySelector("canvas[data-ready=true]")?.dataset.frameTime) > 0,
      null,
      { timeout: 45000 },
    );
    const interactionMs = Date.now() - start;
    const bytesAtInteraction = bytes;
    const box = await page.locator("canvas").boundingBox();
    const cx = box.x + box.width * 0.5,
      cy = box.y + box.height * 0.56;
    await page.mouse.move(cx, cy);
    await page.mouse.wheel(0, -230);
    // Start first orbit immediately; no stabilization delay.
    const began = Date.now();
    await page.mouse.down();
    let i = 0;
    while (Date.now() - began < 30000) {
      await page.mouse.move(
        cx + Math.sin(i * 0.025) * Math.min(210, box.width * 0.35),
        cy + Math.sin(i * 0.012) * 30,
      );
      i++;
      await page.waitForTimeout(12);
    }
    await page.mouse.up();
    const device = await page.evaluate(() => {
      const c = document.querySelector("canvas"),
        g = c.getContext("webgl2"),
        d = g.getExtension("WEBGL_debug_renderer_info");
      return {
        renderer: d ? g.getParameter(d.UNMASKED_RENDERER_WEBGL) : g.getParameter(g.RENDERER),
        dpr: devicePixelRatio,
        buffer: [c.width, c.height],
        profile: c.dataset.profile,
        limits: c.dataset.limits,
      };
    });
    const frames = await page.evaluate(() => {
      window.__sample = false;
      return window.__frames;
    });
    const times = frames.map((f) => f.t).slice(1);
    const deltas = times
      .slice(1)
      .map((t, i) => t - times[i])
      .sort((a, b) => a - b);
    const windows = Array.from(
      { length: 29 },
      (_, i) =>
        times.filter((t) => t >= times[0] + i * 1000 && t < times[0] + (i + 1) * 1000).length,
    ).sort((a, b) => a - b);
    await page.waitForTimeout(2000);
    const idle = await page.locator("canvas").getAttribute("data-frame-time");
    await page.waitForTimeout(1100);
    const pausedWhenIdle = idle === (await page.locator("canvas").getAttribute("data-frame-time"));
    await page.screenshot({
      path: `${out}/${phase}-${choice}-${mobile ? "mobile" : "desktop"}-orbit.png`,
    });
    const video = page.video();
    await context.close();
    await video.saveAs(`${out}/${phase}-${choice}-${mobile ? "mobile" : "desktop"}.webm`);
    const run = {
      choice,
      mobileEmulation: mobile,
      viewport,
      interactionMs,
      bytesAtInteraction,
      device,
      medianFps: windows[14],
      worstSecondFps: windows[0],
      p95FrameMs: deltas[Math.floor(deltas.length * 0.95)],
      maxFrameMs: deltas.at(-1),
      pausedWhenIdle,
      maxCalls: Math.max(...frames.map((f) => JSON.parse(f.metrics).calls)),
      maxTriangles: Math.max(...frames.map((f) => JSON.parse(f.metrics).triangles)),
      errors,
      video: `${phase}-${choice}-${mobile ? "mobile" : "desktop"}.webm`,
    };
    report.runs.push(run);
    await writeFile(
      `${out}/${phase}-${choice}-${mobile ? "mobile" : "desktop"}-frames.json`,
      JSON.stringify(frames),
    );
    console.log(JSON.stringify(run));
  }
  const poses = {
    normal: { position: [-95, 125, 285], target: [58, 6, 12], fov: 43 },
    angular: { position: [-140, 155, 245], target: [48, 5, 22], fov: 43 },
    inspection: { position: [-22, 13, 62], target: [3, 16, -1], fov: 38 },
    facade: { position: [-13, 7, 39], target: [22, 14, -4], fov: 48 },
    upper: { position: [0, 92, 0.001], target: [2, 0, -4], fov: 38 },
    reverse: { position: [19, 19, -33], target: [1, 16, 0], fov: 44 },
  };
  for (const [name, pose] of Object.entries(poses)) {
    const context = await browser.newContext({
      viewport: { width: 1440, height: 1000 },
      reducedMotion: "reduce",
    });
    await context.addInitScript(
      ({ key, pose }) =>
        sessionStorage.setItem(key, JSON.stringify({ mode: "normal", zoom: 1, ...pose })),
      { key: `nr-map:${ids.org}:${ids.user}:NR33:${ids.client}:${ids.unit}`, pose },
    );
    const page = await context.newPage();
    await page.goto(url);
    await page.locator("canvas[data-ready=true]").waitFor();
    await page.waitForTimeout(700);
    await page.screenshot({ path: `${out}/${phase}-${name}.png` });
    await context.close();
  }
} finally {
  await writeFile(`${out}/${phase}-performance.json`, JSON.stringify(report, null, 2));
  await browser.close();
}
