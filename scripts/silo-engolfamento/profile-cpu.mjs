/** Read-only browser CPU diagnostic. Run alone, with no other GPU browser task.
 * SILO_PROFILE_MS=8000 node scripts/silo-engolfamento/profile-cpu.mjs */
import { chromium } from "@playwright/test";
import { writeFile, mkdir, readFile } from "node:fs/promises";
import { createHash } from "node:crypto";
import os from "node:os";
import path from "node:path";

const base = process.env.SILO_URL ?? "http://127.0.0.1:5185";
const directory = process.env.SILO_OUTPUT ?? "docs/silo-engolfamento/evidence/upgrade";
const durationMs = Number(process.env.SILO_PROFILE_MS ?? 8000);
const quality = process.env.SILO_PROFILE_QUALITY ?? "economic";
const incidentStartSeconds = Number(process.env.SILO_PROFILE_START ?? 8);
const playbackRate = String(process.env.SILO_PROFILE_RATE ?? "1");
const tag = process.env.SILO_PROFILE_TAG ?? "baseline";
const sourceHashes = {};
for (const name of [
  "Workers.ts",
  "GrainRenderer.ts",
  "simulation.ts",
  "SiloScene.ts",
  "SiloViewer.tsx",
  "performance.ts",
  "CameraController.ts",
  "SiloModel.ts",
  "ProtectionSystem.ts",
  "SiloConfig.ts",
])
  sourceHashes[name] = createHash("sha256")
    .update(await readFile(`src/silo-engolfamento/${name}`))
    .digest("hex");
await mkdir(directory, { recursive: true });
const browser = await chromium.launch({ channel: "chrome", headless: true });
const page = await browser.newPage({
  viewport: { width: 1440, height: 900 },
  deviceScaleFactor: 1,
});
const errors = [];
page.on("pageerror", (error) => errors.push(error.message));
try {
  await page.goto(`${base}/mapas-3d/silo-engolfamento`, { waitUntil: "domcontentloaded" });
  await page.waitForSelector("canvas[data-ready=true]", { timeout: 90000 });
  await page.getByRole("button", { name: "Exibição e qualidade", exact: true }).click();
  await page.getByLabel("Qualidade gráfica", { exact: true }).selectOption(quality);
  await page.getByRole("button", { name: "Fechar inspetor", exact: true }).click();
  await page.getByRole("button", { name: "Simulação", exact: true }).click();
  const seek = async (time) =>
    page.getByLabel("Instante da simulação", { exact: true }).evaluate((input, value) => {
      Object.getOwnPropertyDescriptor(HTMLInputElement.prototype, "value").set.call(
        input,
        String(value),
      );
      input.dispatchEvent(new Event("input", { bubbles: true }));
      input.dispatchEvent(new Event("change", { bubbles: true }));
    }, time);
  const rateSelector = page.getByLabel("Velocidade de reprodução", { exact: true });
  const rateValue = await rateSelector.evaluate(
    (select, rate) => [...select.options].find((option) => Number(option.value) === rate)?.value,
    Number(playbackRate),
  );
  if (!rateValue) throw new Error(`Playback option unavailable: ${playbackRate}`);
  await rateSelector.selectOption(rateValue);
  await seek(incidentStartSeconds);
  await page.locator(".silo-primary").click();
  await page.waitForTimeout(2500);
  await page.locator(".silo-primary").click();
  await seek(incidentStartSeconds);
  await page.waitForTimeout(300);
  const normalInstrumentation = await page.evaluate(async () => {
    const url = performance
      .getEntriesByType("resource")
      .map((entry) => entry.name)
      .find((name) => /\/node_modules\/\.vite\/deps\/three\.js(?:\?|$)/.test(name));
    if (!url) return { available: false, reason: "Three entry URL not observed" };
    const library = await import(url);
    const prototype = library.BufferGeometry.prototype;
    const original = prototype.computeVertexNormals;
    const counts = (window.__siloProfileNormalCalls = {});
    window.__siloProfileRestoreNormals = () => {
      prototype.computeVertexNormals = original;
    };
    prototype.computeVertexNormals = function (...args) {
      const count = this.getAttribute("position")?.count ?? 0;
      counts[count] = (counts[count] ?? 0) + 1;
      return original.apply(this, args);
    };
    return { available: true, module: url };
  });
  const client = await page.context().newCDPSession(page);
  await client.send("Profiler.enable");
  await client.send("Profiler.setSamplingInterval", { interval: 1000 });
  await client.send("Profiler.start");
  const start = await page.evaluate(() => {
    window.__siloMetrics.frames = [];
    const log = (window.__siloProfileLog = {
      started: performance.now(),
      raf: [],
      hud: [],
      longtasks: [],
    });
    const observer = (window.__siloProfileObserver = new MutationObserver(() =>
      log.hud.push(performance.now()),
    ));
    observer.observe(document.querySelector(".silo-timeline b"), {
      childList: true,
      characterData: true,
      subtree: true,
    });
    const longtask = (window.__siloProfileLongtasks = new PerformanceObserver((list) => {
      for (const entry of list.getEntries())
        log.longtasks.push({ at: entry.startTime, ms: entry.duration });
    }));
    longtask.observe({ type: "longtask" });
    let previous = 0;
    const sample = (at) => {
      if (previous) log.raf.push({ before: previous, at, ms: at - previous });
      previous = at;
      window.__siloProfileRAF = requestAnimationFrame(sample);
    };
    window.__siloProfileRAF = requestAnimationFrame(sample);
    document.querySelector(".silo-primary").click();
    return {
      time: Number(document.querySelector("canvas").dataset.time),
      at: performance.now(),
      camera: {
        position: [...window.__siloMetrics.cameraPosition],
        target: [...window.__siloMetrics.cameraTarget],
        quaternion: [...window.__siloMetrics.cameraQuaternion],
        lens: [...window.__siloMetrics.cameraLens],
      },
    };
  });
  await page.waitForTimeout(durationMs);
  const observed = await page.evaluate(() => {
    document.querySelector(".silo-primary").click();
    cancelAnimationFrame(window.__siloProfileRAF);
    window.__siloProfileObserver.disconnect();
    window.__siloProfileLongtasks.disconnect();
    window.__siloProfileRestoreNormals?.();
    return {
      ...window.__siloProfileLog,
      ended: performance.now(),
      frames: window.__siloMetrics.frames,
      renderer: window.__siloMetrics.renderer,
      status: document.querySelector("canvas").dataset.status,
      time: Number(document.querySelector("canvas").dataset.time),
      metrics: {
        calls: window.__siloMetrics.calls,
        triangles: window.__siloMetrics.triangles,
        readyMs: window.__siloMetrics.readyMs,
        camera: {
          position: [...window.__siloMetrics.cameraPosition],
          target: [...window.__siloMetrics.cameraTarget],
          quaternion: [...window.__siloMetrics.cameraQuaternion],
          lens: [...window.__siloMetrics.cameraLens],
        },
      },
      normalCallsByVertexCount: window.__siloProfileNormalCalls ?? null,
    };
  });
  const { profile } = await client.send("Profiler.stop");
  // Antivirus injection URLs contain machine/session identifiers unrelated to
  // this application. Retain origin and all profiling IDs/timings, remove only
  // the injected resource path/query before generating either evidence file.
  let systemUrlsRedacted = 0;
  for (const node of profile.nodes) {
    const value = node.callFrame.url;
    if (!/^https?:\/\//.test(value)) continue;
    const url = new URL(value);
    if (!/(?:^|\.)kaspersky-labs\.com$/i.test(url.hostname)) continue;
    node.callFrame.url = `${url.origin}/[system-injected]`;
    systemUrlsRedacted++;
  }
  const nodes = new Map(profile.nodes.map((node) => [node.id, node]));
  const parents = new Map();
  for (const node of profile.nodes)
    for (const child of node.children ?? []) parents.set(child, node.id);
  const self = new Map(),
    inclusive = new Map(),
    groups = new Map();
  const add = (map, key, ms) => map.set(key, (map.get(key) ?? 0) + ms);
  for (let index = 0; index < profile.samples.length; index++) {
    const leaf = profile.samples[index],
      ms = profile.timeDeltas[index] / 1000;
    add(self, leaf, ms);
    const ancestors = [];
    for (let node = leaf; node !== undefined; node = parents.get(node)) {
      ancestors.push(nodes.get(node));
      add(inclusive, node, ms);
    }
    const has = (expression) => ancestors.some((node) => expression.test(node.callFrame.url));
    const leafName = nodes.get(leaf).callFrame.functionName;
    const group =
      leafName === "(idle)"
        ? "idle"
        : leafName === "(garbage collector)"
          ? "garbage-collector"
          : has(/\/Workers\.ts(?:\?|$)/)
            ? "Workers-inclusive"
            : has(/\/GrainRenderer\.ts(?:\?|$)/)
              ? "GrainRenderer-inclusive"
              : has(/\/simulation\.ts(?:\?|$)/)
                ? "simulation-inclusive"
                : has(/react-dom|react_jsx|scheduler/)
                  ? "React-inclusive"
                  : has(/\/SiloScene\.ts(?:\?|$)/)
                    ? "SiloScene-other-inclusive"
                    : "other";
    add(groups, group, ms);
  }
  const totalProfileMs = [...self.values()].reduce((sum, value) => sum + value, 0);
  const functions = (source) =>
    [...source]
      .sort((a, b) => b[1] - a[1])
      .slice(0, 35)
      .map(([id, ms]) => ({
        function: nodes.get(id).callFrame.functionName || "(anonymous)",
        url: nodes.get(id).callFrame.url,
        line: nodes.get(id).callFrame.lineNumber + 1,
        ms,
        percentOfProfile: (ms / totalProfileMs) * 100,
        selfMs: self.get(id) ?? 0,
      }));
  const summary = (values) => {
    const sorted = values.filter(Number.isFinite).sort((a, b) => a - b);
    const percentile = (p) => sorted[Math.floor((sorted.length - 1) * p)] ?? null;
    return {
      samples: sorted.length,
      p50: percentile(0.5),
      p95: percentile(0.95),
      p99: percentile(0.99),
      max: sorted.at(-1) ?? null,
    };
  };
  const withHUD = [],
    withoutHUD = [],
    sceneWithHUD = [],
    sceneWithoutHUD = [];
  for (const frame of observed.raf)
    (observed.hud.some((at) => at > frame.before && at <= frame.at) ? withHUD : withoutHUD).push(
      frame.ms,
    );
  for (const frame of observed.frames)
    (observed.hud.some((at) => at > frame.atMs - frame.ms && at <= frame.atMs)
      ? sceneWithHUD
      : sceneWithoutHUD
    ).push(frame.ms);
  const report = {
    schema: "nexus-silo-cpu-profile/1.0",
    tag,
    systemUrlsRedacted,
    sourceHashes,
    testedAt: new Date().toISOString(),
    base,
    condition: {
      browser: browser.version(),
      viewport: "1440x900",
      dpr: 1,
      quality,
      durationMs,
      warmupMs: 2500,
      incidentStartSeconds,
      playbackRate: Number(playbackRate),
      start,
      endSeconds: observed.time,
      finalStatus: observed.status,
      renderer: observed.renderer,
      platform: os.platform(),
      cpu: os.cpus()[0]?.model,
    },
    metrics: observed.metrics,
    normalInstrumentation,
    normalCallsByVertexCount: observed.normalCallsByVertexCount,
    interval: summary(observed.frames.map((frame) => frame.ms)),
    rendererSubmissionCpu: summary(observed.frames.map((frame) => frame.cpuMs)),
    updateCpu: summary(observed.frames.map((frame) => frame.updateCpuMs)),
    tickCpu: summary(observed.frames.map((frame) => frame.tickCpuMs)),
    independentRAF: summary(observed.raf.map((frame) => frame.ms)),
    hud: {
      mutations: observed.hud.length,
      intervals: summary(observed.hud.slice(1).map((at, index) => at - observed.hud[index])),
      frameIntervalsWithHudMutation: summary(withHUD),
      frameIntervalsWithoutHudMutation: summary(withoutHUD),
      sceneIntervalsWithHudMutation: summary(sceneWithHUD),
      sceneIntervalsWithoutHudMutation: summary(sceneWithoutHUD),
    },
    cpuProfile: {
      durationMs: totalProfileMs,
      samples: profile.samples.length,
      groups: [...groups]
        .sort((a, b) => b[1] - a[1])
        .map(([group, ms]) => ({ group, ms, percentOfProfile: (ms / totalProfileMs) * 100 })),
      topSelf: functions(self),
      topInclusive: functions(inclusive),
    },
    longtasks: observed.longtasks,
    errors,
    limitations: [
      "Sampling profiler adds overhead; compare unprofiled frame metrics separately.",
      "Self/inclusive times are CPU sampling estimates, not GPU durations. Module groups attribute each sample once by its calling stack.",
      "HUD correlation is temporal association of DOM commits and RAF intervals, not proof of causation.",
      "One local desktop capture; no physical mobile evidence.",
    ],
  };
  await writeFile(
    path.join(directory, `cpu-${quality}-${tag}.cpuprofile`),
    JSON.stringify(profile),
  );
  await writeFile(
    path.join(directory, `cpu-${quality}-${tag}.json`),
    JSON.stringify(report, null, 2),
  );
  console.log(JSON.stringify(report, null, 2));
} finally {
  await browser.close();
}
