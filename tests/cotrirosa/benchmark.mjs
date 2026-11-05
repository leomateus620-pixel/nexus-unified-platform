// Browser-driven measurements against the bundled, isolated SQL laboratory.
import { chromium } from "@playwright/test";
import { writeFile } from "node:fs/promises";
import { ids } from "./fixture.mjs";
const origin = "http://127.0.0.1:4197";
const url = `${origin}/nr-33/mapa-3d?cliente=${ids.client}&unidade=${ids.unit}`;
const browser = await chromium.launch({
  headless: true,
  args: ["--use-angle=d3d11", "--enable-gpu", "--ignore-gpu-blocklist"],
});
const results = {
  browser: browser.version(),
  date: new Date().toISOString(),
  network: "20 Mb/s download, 10 Mb/s upload, 40 ms RTT; CDP emulation; loopback backend",
  build: "Vite production laboratory; real scene and PostgreSQL, synthetic auth/data",
  profiles: [],
};
try {
  for (const mobile of [false, true]) {
    const viewport = mobile ? { width: 390, height: 844 } : { width: 1440, height: 1000 };
    const context = await browser.newContext({
      viewport,
      deviceScaleFactor: 1,
      isMobile: mobile,
      hasTouch: mobile,
      reducedMotion: "reduce",
    });
    const page = await context.newPage(),
      cdp = await context.newCDPSession(page);
    await cdp.send("Network.enable");
    await cdp.send("Network.setCacheDisabled", { cacheDisabled: true });
    await cdp.send("Network.emulateNetworkConditions", {
      offline: false,
      latency: 40,
      downloadThroughput: (20 * 1000000) / 8,
      uploadThroughput: (10 * 1000000) / 8,
      connectionType: "wifi",
    });
    let wireBytes = 0;
    cdp.on("Network.loadingFinished", (e) => (wireBytes += e.encodedDataLength));
    const start = Date.now();
    await page.goto(url);
    await page.waitForFunction(
      () => Number(document.querySelector("canvas")?.dataset.frameTime) > 0,
      {},
      { timeout: 45000 },
    );
    const tti = Date.now() - start,
      bytesAtInteraction = wireBytes;
    const device = await page.evaluate(() => {
      const c = document.querySelector("canvas"),
        g = c.getContext("webgl2"),
        d = g.getExtension("WEBGL_debug_renderer_info");
      return {
        renderer: d ? g.getParameter(d.UNMASKED_RENDERER_WEBGL) : g.getParameter(g.RENDERER),
        vendor: d ? g.getParameter(d.UNMASKED_VENDOR_WEBGL) : g.getParameter(g.VENDOR),
        dpr: devicePixelRatio,
        buffer: [c.width, c.height],
        userAgent: navigator.userAgent,
      };
    });
    await page.waitForTimeout(1800);
    const oldFrame = await page.locator("canvas").getAttribute("data-frame-time");
    await page.waitForTimeout(1100);
    const paused = oldFrame === (await page.locator("canvas").getAttribute("data-frame-time"));
    await page.evaluate(() => {
      window.__orbitFrames = [];
      window.__orbitStats = [];
      window.__sampling = true;
      let last = 0;
      function sample() {
        if (!window.__sampling) return;
        const c = document.querySelector("canvas"),
          now = Number(c?.dataset.frameTime);
        if (now && now !== last) {
          window.__orbitFrames.push(now);
          window.__orbitStats.push(JSON.parse(c.dataset.metrics));
          last = now;
        }
        requestAnimationFrame(sample);
      }
      requestAnimationFrame(sample);
    });
    const box = await page.locator("canvas").boundingBox(),
      cx = box.x + box.width * 0.5,
      cy = box.y + box.height * 0.52;
    if (mobile)
      await cdp.send("Input.dispatchTouchEvent", {
        type: "touchStart",
        touchPoints: [{ x: cx, y: cy, id: 1 }],
      });
    else {
      await page.mouse.move(cx, cy);
      await page.mouse.down();
    }
    const orbitStart = Date.now();
    let i = 0;
    while (Date.now() - orbitStart < 30000) {
      const x = cx + Math.sin(i * 0.025) * Math.min(210, box.width * 0.35),
        y = cy + Math.sin(i * 0.012) * 30;
      if (mobile)
        await cdp.send("Input.dispatchTouchEvent", {
          type: "touchMove",
          touchPoints: [{ x, y, id: 1 }],
        });
      else await page.mouse.move(x, y);
      i++;
      await page.waitForTimeout(12);
    }
    if (mobile) await cdp.send("Input.dispatchTouchEvent", { type: "touchEnd", touchPoints: [] });
    else await page.mouse.up();
    const samples = await page.evaluate(() => {
      window.__sampling = false;
      return {
        frames: window.__orbitFrames,
        stats: window.__orbitStats,
        camera: JSON.parse(document.querySelector("canvas").dataset.camera),
      };
    });
    const frames = samples.frames.slice(1),
      delta = frames.slice(1).map((n, i) => n - frames[i]),
      sorted = [...delta].sort((a, b) => a - b);
    const windows = Array.from(
      { length: 29 },
      (_, i) =>
        frames.filter((v) => v >= frames[0] + i * 1000 && v < frames[0] + (i + 1) * 1000).length,
    ).sort((a, b) => a - b);
    results.profiles.push({
      profile: mobile
        ? "economy; portrait touch emulation on the same PC GPU"
        : "balanced; desktop PC GPU",
      viewport,
      device,
      coldInteractionMs: tti,
      bytesAtInteraction,
      totalBytes: wireBytes,
      pausedWhenIdle: paused,
      orbitSeconds: (Date.now() - orbitStart) / 1000,
      frames: frames.length,
      medianFrameMs: sorted[Math.floor(sorted.length / 2)],
      p95FrameMs: sorted[Math.floor(sorted.length * 0.95)],
      maxFrameMs: Math.max(...delta),
      medianFps: windows[14],
      worstOneSecondFps: windows[0],
      maxDrawCalls: Math.max(...samples.stats.map((s) => s.calls)),
      maxTriangles: Math.max(...samples.stats.map((s) => s.triangles)),
      lastResources: samples.stats.at(-1),
      selectedAfterOrbit: new URL(page.url()).searchParams.get("local") || null,
    });
    console.log(JSON.stringify(results.profiles.at(-1)));
    await context.close();
  }
} finally {
  await writeFile("docs/cotrirosa/performance.json", JSON.stringify(results, null, 2));
  await browser.close();
}
