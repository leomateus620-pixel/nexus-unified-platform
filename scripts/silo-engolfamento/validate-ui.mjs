import { chromium } from "@playwright/test";
import assert from "node:assert/strict";
import { mkdir, writeFile } from "node:fs/promises";
import os from "node:os";
import path from "node:path";

const base = process.env.SILO_URL ?? "http://127.0.0.1:5185";
const output = process.env.SILO_OUTPUT ?? "docs/silo-engolfamento/evidence";
const sampleFrames = Number(process.env.SILO_SAMPLE_FRAMES ?? 150);
const selectedChecks = process.env.SILO_CHECKS ? new RegExp(process.env.SILO_CHECKS) : null;
const route = `${base.replace(/\/$/, "")}/mapas-3d/silo-engolfamento`;
const cameras = {
  frontal: "Frontal do acidente",
  top: "Vista superior",
  connected: "Técnico A — primeira pessoa",
  victim: "Vítima B — primeira pessoa",
};
await mkdir(output, { recursive: true });
const report = {
  version: 1,
  testedAt: new Date().toISOString(),
  route,
  command: "node scripts/silo-engolfamento/validate-ui.mjs",
  browser: {},
  host: {
    platform: os.platform(),
    release: os.release(),
    cpu: os.cpus()[0]?.model,
    ramBytes: os.totalmem(),
  },
  environment:
    "Local Chrome headless; 390×844 and touch are Chromium emulation, not a physical telephone.",
  checks: [],
  screenshots: [],
  loading: [],
  samples: [],
  failures: [],
  limitations: [
    "Frame time is the module's RAF interval during active reproduction. It is not GPU query time.",
    "cpuMs is synchronous renderer.render duration. GPU completion is asynchronous.",
    "Shadow counters are scene estimates; total draw calls and triangles come from renderer.info and include shadow passes.",
    "Resource Timing counts this development-server run and browser cache state; it is not a compressed production bundle measurement.",
    "Short fixed-view samples do not establish universal desktop/mobile FPS or thermal stability.",
  ],
};
const browser = await chromium.launch({
  channel: process.env.SILO_BROWSER === "chromium" ? undefined : "chrome",
  headless: true,
  args:
    process.env.SILO_SOFTWARE === "1"
      ? ["--use-angle=swiftshader", "--enable-unsafe-swiftshader"]
      : [],
});
report.browser = { version: browser.version(), channel: process.env.SILO_BROWSER ?? "chrome" };
let noWebglBrowser;
let fallbackPage;
const watchdog = setTimeout(() => {
  console.error(
    "Silo validation exceeded 15 minutes; current result must be treated as incomplete.",
  );
  process.exit(1);
}, 900000);

async function check(name, fn, targetPage = page) {
  if (selectedChecks && !selectedChecks.test(name) && !name.startsWith("Direct public route"))
    return;
  const start = Date.now();
  try {
    const evidence = await fn();
    report.checks.push({ name, result: "passed", durationMs: Date.now() - start, evidence });
    console.log(`PASS ${name}`);
  } catch (error) {
    const failedPage = typeof targetPage === "function" ? targetPage() : targetPage;
    const failure = {
      name,
      result: "failed",
      durationMs: Date.now() - start,
      error: String(error.stack ?? error),
    };
    report.checks.push(failure);
    report.failures.push(failure);
    failure.pageUrl = failedPage.url();
    failure.state = await snapshot(failedPage).catch(() => null);
    failure.pageBody = await Promise.race([
      failedPage
        .locator("body")
        .innerText()
        .catch((error) => String(error)),
      new Promise((resolve) =>
        setTimeout(() => resolve("DOM inspection exceeded 5 seconds"), 5000),
      ),
    ]);
    await failedPage
      .screenshot({
        path: path.join(output, `failure-${report.failures.length}.png`),
        timeout: 5000,
      })
      .catch(() => {});
    console.error(`FAIL ${name}: ${error.message}`);
  }
  await writeFile(path.join(output, "ui.json"), JSON.stringify(report, null, 2));
}

async function ready(page) {
  await page.waitForSelector("canvas[data-ready=true]", { timeout: 90000 });
  await page.waitForFunction(
    () => {
      const metrics = window.__siloMetrics;
      const start = document.querySelector(".silo-primary");
      return (
        metrics &&
        !metrics.disposed &&
        metrics.readyMs > 0 &&
        start &&
        !start.disabled &&
        !document.querySelector(".silo-load")
      );
    },
    null,
    { timeout: 90000 },
  );
}

async function snapshot(page) {
  return page.evaluate(() => {
    const canvas = document.querySelector("canvas");
    return {
      canvas: canvas ? { ...canvas.dataset } : null,
      hud: document.querySelector(".silo-hud")?.textContent,
      quantities: document.querySelector(".silo-data-pair")?.textContent,
      legend: document.querySelector(".silo-legend")?.textContent,
      timeline: document.querySelector('input[aria-label="Instante da simulação"]')?.value,
      scenario: document.querySelector(".silo-field select")?.value,
      play: document.querySelector(".silo-primary")?.textContent,
      horizontalOverflow: document.documentElement.scrollWidth > innerWidth,
      visibility: document.visibilityState,
      selectedCameraLabel: document
        .querySelector('.silo-camera-bar button[aria-pressed="true"]')
        ?.getAttribute("aria-label"),
      exitVisible: !!document.querySelector(".silo-exit-camera"),
    };
  });
}

async function seek(page, time) {
  await page.getByRole("slider", { name: "Instante da simulação" }).evaluate((input, value) => {
    Object.getOwnPropertyDescriptor(HTMLInputElement.prototype, "value").set.call(
      input,
      String(value),
    );
    input.dispatchEvent(new Event("input", { bubbles: true }));
    input.dispatchEvent(new Event("change", { bubbles: true }));
  }, time);
  await page.waitForFunction(
    (value) => {
      const input = document.querySelector('input[aria-label="Instante da simulação"]');
      const canvas = document.querySelector("canvas");
      return (
        Math.abs(Number(input?.value) - value) < 0.001 &&
        (!canvas || Math.abs(Number(canvas.dataset.time) - value) < 0.001)
      );
    },
    time,
    { timeout: 20000 },
  );
}

async function chooseCamera(page, camera) {
  await page.getByRole("button", { name: cameras[camera], exact: true }).click();
  await page.waitForFunction(
    (mode) => document.querySelector("canvas")?.dataset.camera === mode,
    camera,
  );
}

async function pause(page) {
  if (await page.getByRole("button", { name: "Pausar", exact: true }).count()) {
    await page.getByRole("button", { name: "Pausar", exact: true }).click();
  }
  await page.waitForFunction(() => document.querySelector("canvas")?.dataset.status !== "running");
}

async function shot(page, name, options = {}) {
  const filename = `${name}.png`;
  await page.screenshot({ path: path.join(output, filename), ...options });
  report.screenshots.push({ filename, snapshot: await snapshot(page) });
}

async function fallbackHiddenResume(page) {
  await seek(page, 6);
  await page.getByLabel("Velocidade de reprodução", { exact: true }).selectOption(".5");
  await page.evaluate(() => {
    const request = window.requestAnimationFrame;
    const cancel = window.cancelAnimationFrame;
    const hiddenDescriptor = Object.getOwnPropertyDescriptor(document, "hidden");
    const held = new Map();
    const state = { hold: false, canceled: 0, held, request, cancel, hiddenDescriptor };
    window.__siloFallbackRafTest = state;
    // Actual hidden pages suspend RAF. Synthetic visibilitychange alone does not;
    // hold callbacks as well so a paused frame cannot silently erase stale time.
    window.requestAnimationFrame = (callback) => {
      const id = request.call(window, (now) => {
        if (state.hold) held.set(id, callback);
        else callback(now);
      });
      return id;
    };
    window.cancelAnimationFrame = (id) => {
      state.canceled++;
      held.delete(id);
      cancel.call(window, id);
    };
  });
  let hiddenTime;
  let cancellation;
  try {
    await page.getByRole("button", { name: "Continuar", exact: true }).click();
    await page.waitForFunction(
      () => Number(document.querySelector('input[aria-label="Instante da simulação"]').value) > 6.1,
      null,
      { polling: 100 },
    );
    await page.evaluate(() => {
      window.__siloFallbackRafTest.hold = true;
      Object.defineProperty(document, "hidden", { configurable: true, get: () => true });
      document.dispatchEvent(new Event("visibilitychange"));
    });
    await page
      .getByRole("button", { name: "Continuar", exact: true })
      .waitFor({ state: "visible" });
    hiddenTime = Number((await snapshot(page)).timeline);
    await page.waitForTimeout(650);
    assert.equal(Number((await snapshot(page)).timeline), hiddenTime);
    cancellation = await page.evaluate(() => ({
      canceled: window.__siloFallbackRafTest.canceled,
      callbacksStillHeld: window.__siloFallbackRafTest.held.size,
    }));
    await page.evaluate(() => {
      const state = window.__siloFallbackRafTest;
      if (state.hiddenDescriptor) Object.defineProperty(document, "hidden", state.hiddenDescriptor);
      else delete document.hidden;
      document.dispatchEvent(new Event("visibilitychange"));
    });
    // No stability wait through RAF: the page remains synthetically suspended
    // until this single, explicit transport activation has been dispatched.
    await page.getByRole("button", { name: "Continuar", exact: true }).click({ force: true });
    await page.evaluate(() => {
      const state = window.__siloFallbackRafTest;
      state.hold = false;
      for (const callback of state.held.values()) state.request.call(window, callback);
      state.held.clear();
    });
    await page.getByRole("button", { name: "Pausar", exact: true }).waitFor({ state: "visible" });
    await page.waitForFunction(
      (time) =>
        Number(document.querySelector('input[aria-label="Instante da simulação"]').value) >
        time + 0.03,
      hiddenTime,
      { polling: 100, timeout: 5000 },
    );
    const resumed = await snapshot(page);
    assert.ok(
      Number(resumed.timeline) < hiddenTime + 0.35,
      "Hidden duration became simulation debt",
    );
    assert.ok(!/sobrecarga/i.test(await page.locator(".silo-viewer").textContent()));
    await page.getByRole("button", { name: "Pausar", exact: true }).click();
    return {
      hiddenTime,
      resumedTime: Number(resumed.timeline),
      oneExplicitResume: true,
      ...cancellation,
      method:
        "Synthetic visibilitychange plus suspended RAF callbacks; no physical background-tab claim",
    };
  } finally {
    await page.evaluate(() => {
      const state = window.__siloFallbackRafTest;
      if (!state) return;
      state.hold = false;
      window.requestAnimationFrame = state.request;
      window.cancelAnimationFrame = state.cancel;
      for (const callback of state.held.values()) state.request.call(window, callback);
      if (state.hiddenDescriptor) Object.defineProperty(document, "hidden", state.hiddenDescriptor);
      else delete document.hidden;
      delete window.__siloFallbackRafTest;
    });
  }
}

async function loading(page, label) {
  const data = await page.evaluate(() => {
    const resources = performance.getEntriesByType("resource").map((entry) => ({
      name: entry.name,
      initiatorType: entry.initiatorType,
      durationMs: entry.duration,
      transferBytes: entry.transferSize,
      encodedBytes: entry.encodedBodySize,
      decodedBytes: entry.decodedBodySize,
    }));
    const metrics = window.__siloMetrics;
    const navigation = performance.getEntriesByType("navigation")[0];
    return {
      readyMs: metrics?.readyMs,
      assets: { ...metrics?.assets },
      renderer: metrics?.renderer,
      geometryBytesEstimate: metrics?.geometryBytes,
      textureBytesEstimate: metrics?.textureBytes,
      resourceCount: resources.length,
      resourceTransferBytes: resources.reduce((sum, item) => sum + (item.transferBytes ?? 0), 0),
      resourceDecodedBytes: resources.reduce((sum, item) => sum + (item.decodedBytes ?? 0), 0),
      modelResources: resources.filter((entry) =>
        entry.name.includes("/models/silo-engolfamento/"),
      ),
      navigation: navigation?.toJSON(),
      userAgent: navigator.userAgent,
      devicePixelRatio,
    };
  });
  report.loading.push({ label, ...data });
  return data;
}

function summarize(values) {
  const sorted = [...values].sort((a, b) => a - b);
  return {
    median: sorted[Math.floor(sorted.length * 0.5)] ?? null,
    p95: sorted[Math.floor(sorted.length * 0.95)] ?? null,
    max: sorted.at(-1) ?? null,
  };
}

async function sample(page, quality, camera, mobile) {
  await page.getByLabel("Comparação controlada").selectOption("comparison");
  await seek(page, 6);
  await page.getByLabel("Velocidade de reprodução", { exact: true }).selectOption(".5");
  const before = await snapshot(page);
  await page.getByLabel("Qualidade gráfica").selectOption(quality);
  await chooseCamera(page, camera);
  await page.waitForTimeout(900); // Camera settles while paused; never sampled as animation FPS.
  const configured = await snapshot(page);
  assert.equal(
    configured.canvas.time,
    before.canvas.time,
    "quality/camera changed the domain time",
  );
  assert.equal(configured.hud, before.hud, "quality/camera changed the HUD state");
  await page.evaluate(() => {
    window.__siloMetrics.frames.length = 0;
  });
  await page.getByRole("button", { name: "Continuar", exact: true }).click();
  await page.waitForFunction(
    () =>
      window.__siloMetrics?.frames.length >= 24 ||
      document.querySelector("canvas")?.dataset.status === "paused",
    null,
    { timeout: 30000 },
  );
  assert.equal((await snapshot(page)).canvas.status, "running", "warm-up paused due to overload");
  await page.evaluate(() => {
    window.__siloMetrics.frames.length = 0;
  });
  const started = Date.now();
  await page.waitForFunction(
    (count) =>
      window.__siloMetrics?.frames.length >= count ||
      document.querySelector("canvas")?.dataset.status !== "running",
    sampleFrames,
    { timeout: 90000 },
  );
  const captured = await page.evaluate(() => {
    const metrics = window.__siloMetrics;
    return {
      frames: metrics.frames.map((entry) => ({ ...entry })),
      renderer: metrics.renderer,
      geometryBytesEstimate: metrics.geometryBytes,
      textureBytesEstimate: metrics.textureBytes,
      geometries: metrics.geometries,
      textures: metrics.textures,
      errors: [...metrics.errors],
      status: document.querySelector("canvas").dataset.status,
      sceneTime: Number(document.querySelector("canvas").dataset.time),
      drawingBuffer: {
        width: document.querySelector("canvas").width,
        height: document.querySelector("canvas").height,
      },
      heap: performance.memory
        ? {
            usedBytes: performance.memory.usedJSHeapSize,
            totalBytes: performance.memory.totalJSHeapSize,
          }
        : null,
    };
  });
  const frames = captured.frames
    .filter((entry) => entry.quality === quality && entry.camera === camera)
    .slice(0, sampleFrames);
  const result = {
    profile: quality,
    camera,
    mobileEmulation: mobile,
    softwareRenderer: /swiftshader|llvmpipe|software/i.test(captured.renderer),
    playbackRate: 0.5,
    requestedFrames: sampleFrames,
    activeFrames: frames.length,
    elapsedWallMs: Date.now() - started,
    frameMs: summarize(frames.map((entry) => entry.ms)),
    cpuRenderMs: summarize(frames.map((entry) => entry.cpuMs)),
    maxTotalCallsIncludingShadows: Math.max(0, ...frames.map((entry) => entry.calls)),
    maxTotalTrianglesIncludingShadows: Math.max(0, ...frames.map((entry) => entry.triangles)),
    maxEstimatedShadowCalls: Math.max(0, ...frames.map((entry) => entry.shadowCalls)),
    maxEstimatedShadowTriangles: Math.max(0, ...frames.map((entry) => entry.shadowTriangles)),
    noShadowPassMaxCalls: Math.max(
      0,
      ...frames.filter((entry) => entry.shadowCalls === 0).map((entry) => entry.calls),
    ),
    noShadowPassMaxTriangles: Math.max(
      0,
      ...frames.filter((entry) => entry.shadowCalls === 0).map((entry) => entry.triangles),
    ),
    framesOver33ms: frames.filter((entry) => entry.ms > 33).length,
    framesOver50ms: frames.filter((entry) => entry.ms > 50).length,
    ...captured,
  };
  result.budget =
    quality === "economic"
      ? {
          p95Within33ms: result.frameMs.p95 !== null && result.frameMs.p95 <= 33,
          totalCallsWithin120: result.maxTotalCallsIncludingShadows <= 120,
          principalTrianglesWithin300k:
            result.noShadowPassMaxTriangles > 0 ? result.noShadowPassMaxTriangles <= 300000 : null,
        }
      : null;
  report.samples.push(result);
  await pause(page);
  assert.equal(frames.length, sampleFrames, `incomplete active sample: ${captured.status}`);
  assert.equal(captured.errors.length, 0);
  console.log(
    JSON.stringify({
      profile: quality,
      camera,
      mobile,
      frames: frames.length,
      frameMs: result.frameMs,
      calls: result.maxTotalCallsIncludingShadows,
      triangles: result.maxTotalTrianglesIncludingShadows,
      budget: result.budget,
    }),
  );
  return { profile: quality, camera, mobile, frameMs: result.frameMs, budget: result.budget };
}

const context = await browser.newContext({
  viewport: { width: 1440, height: 1000 },
  deviceScaleFactor: 1,
});
const page = await context.newPage();
page.setDefaultTimeout(20000);
const errors = [];
page.on("pageerror", (error) => errors.push(error.message));
try {
  await check("Direct public route; cold and warm readiness; exactly one canvas", async () => {
    const cdp = await context.newCDPSession(page);
    await cdp.send("Network.enable");
    await cdp.send("Network.setCacheDisabled", { cacheDisabled: true });
    await page.goto(route, { waitUntil: "domcontentloaded" });
    await ready(page);
    assert.equal(await page.locator("canvas").count(), 1);
    const cold = await loading(page, "desktop-cold-browser-cache-disabled");
    assert.ok(cold.readyMs > 0);
    await cdp.send("Network.setCacheDisabled", { cacheDisabled: false });
    await page.reload({ waitUntil: "domcontentloaded" });
    await ready(page);
    const warm = await loading(page, "desktop-warm-browser-cache-enabled");
    return { coldReadyMs: cold.readyMs, warmReadyMs: warm.readyMs, modelBytes: cold.assets };
  });
  await check("Start, pause, resume and reset retain one controller/canvas", async () => {
    await page.getByRole("button", { name: "Iniciar", exact: true }).click();
    await page.waitForFunction(() => Number(document.querySelector("canvas").dataset.time) > 0.2);
    await pause(page);
    const held = (await snapshot(page)).canvas.time;
    await page.waitForTimeout(300);
    assert.equal((await snapshot(page)).canvas.time, held);
    await page.getByRole("button", { name: "Continuar", exact: true }).click();
    await page.waitForFunction(
      (time) => Number(document.querySelector("canvas").dataset.time) > time + 0.1,
      Number(held),
    );
    await page.getByRole("button", { name: "Reiniciar simulação", exact: true }).click();
    await page.waitForFunction(
      () =>
        document.querySelector("canvas").dataset.status === "idle" &&
        Number(document.querySelector("canvas").dataset.time) === 0,
    );
    assert.equal(await page.locator("canvas").count(), 1);
    return snapshot(page);
  });
  await check(
    "Deterministic timeline restores volume, connection, HUD and incident stage",
    async () => {
      await seek(page, 6);
      const earlier = await snapshot(page);
      await seek(page, 18);
      const later = await snapshot(page);
      assert.notEqual(later.quantities, earlier.quantities);
      await seek(page, 6);
      const restored = await snapshot(page);
      assert.equal(restored.quantities, earlier.quantities);
      assert.equal(restored.hud, earlier.hud);
      assert.equal(restored.legend, earlier.legend);
      assert.equal(restored.canvas.time, earlier.canvas.time);
      return { earlier, later, restored };
    },
  );
  await check("Stable pause renders on demand instead of an idle frame loop", async () => {
    await seek(page, 6);
    await page.waitForTimeout(1800);
    await page.evaluate(() => {
      const gl = document.querySelector("canvas").getContext("webgl2");
      const methods = [
        "drawArrays",
        "drawElements",
        "drawArraysInstanced",
        "drawElementsInstanced",
      ];
      window.__siloIdleDraws = 0;
      window.__siloRestoreDraws = methods.map((name) => {
        const original = gl[name];
        gl[name] = function (...args) {
          window.__siloIdleDraws++;
          return original.apply(gl, args);
        };
        return () => {
          gl[name] = original;
        };
      });
    });
    let idleDraws;
    try {
      await page.waitForTimeout(350);
      idleDraws = await page.evaluate(() => window.__siloIdleDraws);
    } finally {
      await page.evaluate(() => {
        window.__siloRestoreDraws.forEach((restore) => restore());
        delete window.__siloRestoreDraws;
      });
    }
    assert.equal(idleDraws, 0);
    return {
      stablePauseDurationMs: 350,
      observedWebglDraws: idleDraws,
      method: "Temporary per-context draw-call counters restored before benchmarks",
    };
  });
  await check("Four cameras preserve a paused instant; keyboard look and Escape", async () => {
    await seek(page, 10);
    const reference = await snapshot(page);
    for (const mode of Object.keys(cameras)) {
      await chooseCamera(page, mode);
      await page.waitForTimeout(1100);
      const state = await snapshot(page);
      assert.equal(state.canvas.time, reference.canvas.time);
      assert.equal(state.hud, reference.hud);
      await shot(page, `desktop-${mode}`);
    }
    await page.locator("canvas").focus();
    await page.keyboard.press("ArrowLeft");
    assert.equal((await snapshot(page)).canvas.time, reference.canvas.time);
    await page.keyboard.press("Escape");
    await page.waitForFunction(() => document.querySelector("canvas").dataset.camera === "frontal");
    await page.getByRole("button", { name: cameras.connected, exact: true }).focus();
    await page.keyboard.press("Enter");
    await page.waitForFunction(
      () => document.querySelector("canvas").dataset.camera === "connected",
    );
    const focus = await page.evaluate(() => ({
      tag: document.activeElement.tagName,
      outline: getComputedStyle(document.activeElement).outlineStyle,
    }));
    assert.notEqual(focus.outline, "none");
    await page.getByRole("button", { name: "Sair da primeira pessoa", exact: true }).click();
    return { reference, focus };
  });
  await check(
    "Harness close-up, active accident and fully occluded internal view keep controls",
    async () => {
      await seek(page, 12);
      await page.getByRole("button", { name: "Cinturão", exact: true }).click();
      await page.waitForTimeout(1200);
      await shot(page, "desktop-harness-close");
      await page.getByRole("button", { name: "Fechar destaque técnico", exact: true }).click();
      await chooseCamera(page, "frontal");
      await page.waitForTimeout(1100);
      await shot(page, "desktop-accident");
      await seek(page, 20);
      await chooseCamera(page, "victim");
      await page.waitForFunction(
        () => document.querySelector("canvas").dataset.occluded === "true",
      );
      assert.ok(await page.locator(".silo-occlusion").isVisible());
      assert.ok(await page.locator(".silo-hud").isVisible());
      assert.ok(
        await page
          .getByRole("button", { name: "Sair da primeira pessoa", exact: true })
          .isVisible(),
      );
      await shot(page, "desktop-victim-occluded");
      await page.getByRole("button", { name: "Sair da primeira pessoa", exact: true }).click();
      assert.equal((await snapshot(page)).canvas.time, "20");
      return snapshot(page);
    },
  );
  await check(
    "Final analysis has documented scope and explicitly chosen hypothetical arithmetic",
    async () => {
      await seek(page, 30);
      const dialog = page.getByRole("dialog", {
        name: "Análise do incidente e prevenção",
        exact: true,
      });
      await dialog.waitFor({ state: "visible" });
      assert.ok(await dialog.getByText("Estados Unidos", { exact: false }).count());
      assert.deepEqual(await dialog.locator("tfoot td").allTextContents(), ["", "51", "73", "124"]);
      const hypothesis = dialog.locator("details.silo-hypothesis");
      assert.equal(await hypothesis.getAttribute("open"), null);
      await hypothesis.locator("summary").click();
      const input = hypothesis.getByLabel("Proporção hipotética escolhida por você (%)", {
        exact: true,
      });
      assert.equal(await input.inputValue(), "");
      await input.fill("50");
      assert.ok(
        await hypothesis
          .getByText("26 casos fatais potencialmente evitados na hipótese escolhida", {
            exact: true,
          })
          .isVisible(),
      );
      await input.fill("0");
      assert.ok(
        await hypothesis
          .getByText("0 casos fatais potencialmente evitados na hipótese escolhida", {
            exact: true,
          })
          .isVisible(),
      );
      await input.fill("");
      await hypothesis.locator("summary").click();
      await dialog.evaluate((element) => {
        element.scrollTop = 0;
      });
      await shot(page, "desktop-final-analysis");
      await dialog.getByRole("button", { name: "Fontes e critérios", exact: true }).click();
      assert.equal(await dialog.locator(".silo-sources a").count(), 10);
      assert.ok((await dialog.textContent()).includes("não são prazo para morte"));
      await page.keyboard.press("Escape");
      await dialog.waitFor({ state: "hidden" });
      return {
        documentedCases: 124,
        fatal: 51,
        nonFatal: 73,
        noDefaultHypothesis: true,
        primarySources: 10,
      };
    },
  );
  await check("Preventive replay blocks grain movement and entry", async () => {
    await page.getByRole("button", { name: /Análise, prevenção e dados/ }).click();
    await page.getByRole("button", { name: "Rever prevenção correta", exact: true }).click();
    await page.waitForFunction(
      () => document.querySelector(".silo-field select")?.value === "prevention",
    );
    await seek(page, 12);
    const preventive = await snapshot(page);
    assert.ok(preventive.quantities.includes("0.00 m³/s"));
    assert.ok(
      (await page.locator(".silo-stage-caption").textContent()).includes("ENTRADA IMPEDIDA"),
    );
    await shot(page, "desktop-prevention");
    return preventive;
  });
  await check(
    "Unmount releases previous metrics/resources; library card reenters independently",
    async () => {
      await page.evaluate(() => {
        window.__siloPreviousMetrics = window.__siloMetrics;
        window.__siloPreviousCanvas = document.querySelector("canvas");
      });
      await page
        .getByRole("link", { name: "Biblioteca 3D", exact: true })
        .click({ noWaitAfter: true });
      await page.waitForURL(`${base}/mapas-3d/unidades`, {
        waitUntil: "domcontentloaded",
        timeout: 60000,
      });
      await page.waitForFunction(
        () => window.__siloPreviousMetrics.disposed && !window.__siloPreviousCanvas.isConnected,
      );
      const transientCanvases = await page.locator("canvas").count();
      const settlingStarted = Date.now();
      // Root switches dedicated Outlet/AppShell before its route commit completes.
      // Assert the committed library DOM, as in the existing escada UI regression test.
      await page.locator("canvas").waitFor({ state: "detached", timeout: 60000 });
      const librarySettlingMs = Date.now() - settlingStarted;
      assert.equal(await page.locator("canvas").count(), 0);
      assert.ok(await page.locator('a[href="/mapas-3d/trevisan"]').count());
      assert.ok(await page.locator('a[href="/mapas-3d"]').count());
      await page.locator('a[href="/mapas-3d/silo-engolfamento"]').click({ noWaitAfter: true });
      await ready(page);
      assert.equal(await page.locator("canvas").count(), 1);
      assert.ok(
        await page.evaluate(
          () =>
            window.__siloMetrics !== window.__siloPreviousMetrics && !window.__siloMetrics.disposed,
        ),
      );
      return { snapshot: await snapshot(page), transientCanvases, librarySettlingMs };
    },
  );
  // Recovery/benchmarks use a fresh route even if the independent menu assertion failed.
  if (
    !selectedChecks ||
    selectedChecks.test("WebGL context loss") ||
    selectedChecks.test("Desktop active benchmark")
  ) {
    await page.goto(route, { waitUntil: "domcontentloaded" });
    await ready(page);
  }
  await check("WebGL context loss pauses time and restores the existing scene", async () => {
    await seek(page, 6);
    await page.getByLabel("Velocidade de reprodução", { exact: true }).selectOption(".5");
    await page.getByRole("button", { name: "Continuar", exact: true }).click();
    await page.waitForFunction(() => Number(document.querySelector("canvas").dataset.time) > 6.1);
    const available = await page.evaluate(() => {
      window.__siloTestContextLoss = document
        .querySelector("canvas")
        .getContext("webgl2")
        .getExtension("WEBGL_lose_context");
      if (!window.__siloTestContextLoss) return false;
      window.__siloTestContextLoss.loseContext();
      return true;
    });
    assert.ok(available, "WEBGL_lose_context unavailable; recovery check is incomplete");
    await page
      .getByRole("heading", { name: "Visualização pausada", exact: true })
      .waitFor({ state: "visible" });
    const time = (await snapshot(page)).canvas.time;
    await page.waitForTimeout(350);
    assert.equal((await snapshot(page)).canvas.time, time);
    await page.evaluate(() => window.__siloTestContextLoss.restoreContext());
    await ready(page);
    assert.ok(await page.getByRole("button", { name: "Continuar", exact: true }).isEnabled());
    assert.equal(await page.locator("canvas").count(), 1);
    const losses = await page.evaluate(() => window.__siloMetrics.contextLosses);
    assert.equal(losses, 1);
    return { contextLosses: losses, heldTime: time, restored: await snapshot(page) };
  });
  let delayedPage;
  await check(
    "Context loss during delayed GLB loading keeps resource readiness authoritative",
    async () => {
      const results = [];
      for (const finishWhileLost of [false, true]) {
        const delayedContext = await browser.newContext({ viewport: { width: 1280, height: 900 } });
        delayedPage = await delayedContext.newPage();
        let release;
        const responses = new Promise((resolve) => {
          release = resolve;
        });
        let heldRequests = 0;
        const heldAssets = new Set();
        await delayedPage.route("**/models/silo-engolfamento/worker-*.glb", async (request) => {
          heldRequests++;
          heldAssets.add(new URL(request.request().url()).pathname);
          await responses;
          await request.continue().catch(() => {});
        });
        try {
          await delayedPage.goto(route, { waitUntil: "domcontentloaded" });
          await delayedPage.locator("canvas").waitFor({ state: "visible", timeout: 90000 });
          for (let attempt = 0; attempt < 100 && heldAssets.size < 2; attempt++)
            await delayedPage.waitForTimeout(50);
          assert.equal(heldAssets.size, 2, "Both essential GLB URLs must remain delayed");
          await delayedPage.waitForFunction(
            () =>
              document.querySelectorAll("canvas").length === 1 &&
              window.__siloMetrics &&
              !window.__siloMetrics.disposed,
          );
          assert.ok(
            await delayedPage.getByRole("button", { name: "Iniciar", exact: true }).isDisabled(),
          );
          await delayedPage.evaluate(() => {
            window.__siloDelayedCurrentMetrics = window.__siloMetrics;
            window.__siloDelayedLossTest = document
              .querySelector("canvas")
              .getContext("webgl2")
              .getExtension("WEBGL_lose_context");
            window.__siloDelayedLossTest.loseContext();
          });
          await delayedPage
            .getByRole("heading", { name: "Visualização pausada", exact: true })
            .waitFor({ state: "visible" });
          if (finishWhileLost) {
            release();
            await delayedPage.waitForFunction(() => window.__siloMetrics.geometryBytes > 0, null, {
              timeout: 90000,
            });
            assert.ok(
              await delayedPage
                .getByRole("heading", { name: "Visualização pausada", exact: true })
                .isVisible(),
            );
            assert.ok(
              await delayedPage.getByRole("button", { name: "Iniciar", exact: true }).isDisabled(),
            );
            assert.equal((await snapshot(delayedPage)).canvas.ready, "false");
          }
          const beforeRestore = await snapshot(delayedPage);
          await delayedPage.evaluate(() => window.__siloDelayedLossTest.restoreContext());
          if (!finishWhileLost) {
            await delayedPage
              .getByRole("heading", { name: "Preparando a experiência", exact: true })
              .waitFor({ state: "visible" });
            assert.ok(
              await delayedPage.getByRole("button", { name: "Iniciar", exact: true }).isDisabled(),
            );
            assert.equal((await snapshot(delayedPage)).canvas.ready, "false");
            release();
          }
          await ready(delayedPage);
          assert.ok(
            await delayedPage.evaluate(
              () =>
                window.__siloMetrics === window.__siloDelayedCurrentMetrics &&
                !window.__siloMetrics.disposed,
            ),
          );
          assert.ok(
            await delayedPage.getByRole("button", { name: "Iniciar", exact: true }).isEnabled(),
          );
          assert.equal(await delayedPage.locator("canvas").count(), 1);
          results.push({
            finishWhileLost,
            heldRequests,
            heldAssets: [...heldAssets],
            beforeRestore,
            ready: await snapshot(delayedPage),
          });
        } finally {
          release();
          await delayedContext.close();
        }
      }
      return results;
    },
    () => delayedPage ?? page,
  );
  await check(
    "Complete 30-second normal reproduction reaches analysis; two resets/replays keep one canvas",
    async () => {
      await page.getByLabel("Comparação controlada").selectOption("comparison");
      await page.getByLabel("Qualidade gráfica").selectOption("economic");
      await page.getByLabel("Velocidade de reprodução", { exact: true }).selectOption("1");
      await chooseCamera(page, "frontal");
      await page.getByRole("button", { name: "Reiniciar simulação", exact: true }).click();
      await page.waitForFunction(() => document.querySelector("canvas").dataset.status === "idle");
      const startedAt = Date.now();
      await page.getByRole("button", { name: "Iniciar", exact: true }).click();
      await page.waitForFunction(
        () => document.querySelector("canvas").dataset.status === "running",
      );
      await page.waitForFunction(
        () => ["completed", "paused"].includes(document.querySelector("canvas").dataset.status),
        null,
        { timeout: 90000 },
      );
      const completed = await snapshot(page);
      assert.equal(
        completed.canvas.status,
        "completed",
        `continuous reproduction stopped: ${completed.play}`,
      );
      assert.equal(Number(completed.canvas.time), 30);
      const wallDurationMs = Date.now() - startedAt;
      assert.ok(wallDurationMs >= 29000 && wallDurationMs < 90000);
      await page
        .getByRole("dialog", { name: "Análise do incidente e prevenção", exact: true })
        .waitFor({ state: "visible" });
      await page.keyboard.press("Escape");
      for (let replay = 0; replay < 2; replay++) {
        await page.getByRole("button", { name: "Reiniciar simulação", exact: true }).click();
        await page.waitForFunction(
          () => Number(document.querySelector("canvas").dataset.time) === 0,
        );
        await page.getByRole("button", { name: "Iniciar", exact: true }).click();
        await page.waitForFunction(
          () => Number(document.querySelector("canvas").dataset.time) > 0.15,
        );
        await pause(page);
        assert.equal(await page.locator("canvas").count(), 1);
      }
      return { wallDurationMs, completed, replays: 2, seekUsedDuringCycle: false };
    },
  );
  for (const quality of ["economic", "balanced", "high"]) {
    for (const camera of ["frontal", "victim"]) {
      await check(`Desktop active benchmark: ${quality}/${camera}`, () =>
        sample(page, quality, camera, false),
      );
    }
  }

  const mobileContext = await browser.newContext({
    viewport: { width: 390, height: 844 },
    deviceScaleFactor: 1,
    isMobile: true,
    hasTouch: true,
  });
  const mobile = await mobileContext.newPage();
  mobile.setDefaultTimeout(20000);
  const mobileErrors = [];
  mobile.on("pageerror", (error) => mobileErrors.push(error.message));
  await check(
    "390×844 touch layout; four cameras, occlusion and persistent exit",
    async () => {
      await mobile.goto(route, { waitUntil: "domcontentloaded" });
      await mobile.bringToFront();
      await ready(mobile);
      await mobile.evaluate(() => {
        window.__siloTouchEvents = [];
        for (const type of [
          "pointerdown",
          "pointerup",
          "pointercancel",
          "touchstart",
          "touchend",
          "click",
        ])
          document.addEventListener(
            type,
            (event) => {
              const point = event.changedTouches?.[0];
              window.__siloTouchEvents.push({
                type,
                target: event.target?.tagName,
                classes: String(event.target?.className ?? ""),
                text: event.target?.textContent?.slice(0, 70),
                pointerId: event.pointerId,
                pointerType: event.pointerType,
                touches: event.touches?.length,
                x: event.clientX ?? point?.clientX,
                y: event.clientY ?? point?.clientY,
              });
              if (window.__siloTouchEvents.length > 100) window.__siloTouchEvents.shift();
            },
            true,
          );
      });
      await loading(mobile, "mobile-390x844-emulated");
      await seek(mobile, 10);
      for (const mode of Object.keys(cameras)) {
        await mobile.getByRole("button", { name: cameras[mode], exact: true }).tap();
        await mobile.waitForFunction(
          (id) => document.querySelector("canvas").dataset.camera === id,
          mode,
        );
      }
      const cdp = await mobileContext.newCDPSession(mobile);
      const area = await mobile.locator("canvas").boundingBox();
      const x = area.x + area.width * 0.5,
        y = area.y + area.height * 0.35;
      if (process.env.SILO_SKIP_TOUCH_DRAG !== "1") {
        await cdp.send("Input.dispatchTouchEvent", {
          type: "touchStart",
          touchPoints: [{ x, y, id: 1 }],
        });
        await cdp.send("Input.dispatchTouchEvent", {
          type: "touchMove",
          touchPoints: [{ x: x + 32, y: y + 12, id: 1 }],
        });
        await cdp.send("Input.dispatchTouchEvent", { type: "touchEnd", touchPoints: [] });
      }
      assert.equal((await snapshot(mobile)).canvas.time, "10");
      await seek(mobile, 20);
      await mobile.waitForFunction(
        () => document.querySelector("canvas").dataset.occluded === "true",
      );
      assert.ok(await mobile.locator(".silo-hud").isVisible());
      await shot(mobile, "mobile-victim-occluded");
      const exit = mobile.getByRole("button", { name: "Sair da primeira pessoa", exact: true });
      report.mobileExit = {
        before: await snapshot(mobile),
        hitTarget: await exit.evaluate((button) => {
          const rect = button.getBoundingClientRect();
          return {
            x: rect.x,
            y: rect.y,
            width: rect.width,
            height: rect.height,
            target: document
              .elementFromPoint(rect.x + rect.width / 2, rect.y + rect.height / 2)
              ?.outerHTML.slice(0, 800),
          };
        }),
      };
      await exit.tap();
      report.mobileExit.after = await snapshot(mobile);
      report.mobileExit.events = await mobile.evaluate(() => window.__siloTouchEvents);
      await mobile.waitForFunction(
        () => document.querySelector("canvas").dataset.camera === "frontal",
      );
      await seek(mobile, 10);
      await mobile.waitForTimeout(1000);
      await shot(mobile, "mobile-frontal");
      assert.equal((await snapshot(mobile)).horizontalOverflow, false);
      const targets = await mobile
        .locator(".silo-camera-bar button,.silo-transport-actions button,.silo-exit-camera")
        .evaluateAll((buttons) =>
          buttons.map((button) => ({
            label: button.getAttribute("aria-label") ?? button.textContent,
            height: button.getBoundingClientRect().height,
          })),
        );
      assert.ok(targets.every((button) => button.height >= 44));
      await mobile.getByRole("button", { name: "Opções da experiência", exact: true }).tap();
      assert.ok(await mobile.getByLabel("Qualidade gráfica").isVisible());
      return { touchTargets: targets, snapshot: await snapshot(mobile) };
    },
    mobile,
  );
  if (!selectedChecks || selectedChecks.test("Mobile emulation active benchmark")) {
    // Keep measurements independent of touch assertions; record a touch failure separately.
    await mobile.goto(route, { waitUntil: "domcontentloaded" });
    await mobile.bringToFront();
    await ready(mobile);
    await mobile.getByRole("button", { name: "Opções da experiência", exact: true }).click();
  }
  for (const quality of ["economic", "balanced", "high"]) {
    for (const camera of ["frontal", "victim"]) {
      await check(
        `Mobile emulation active benchmark: ${quality}/${camera}`,
        () => sample(mobile, quality, camera, true),
        mobile,
      );
    }
  }
  await check("Hidden-tab handler pauses and requires explicit continuation", async () => {
    await seek(mobile, 6);
    await mobile.getByRole("button", { name: "Continuar", exact: true }).click();
    await mobile.evaluate(() => {
      Object.defineProperty(document, "hidden", { configurable: true, get: () => true });
      document.dispatchEvent(new Event("visibilitychange"));
    });
    await mobile
      .getByRole("button", { name: "Continuar", exact: true })
      .waitFor({ state: "visible" });
    const timeline = (await snapshot(mobile)).timeline;
    await mobile.waitForTimeout(300);
    assert.equal((await snapshot(mobile)).timeline, timeline);
    await mobile.evaluate(() => {
      delete document.hidden;
      document.dispatchEvent(new Event("visibilitychange"));
    });
    assert.ok(await mobile.getByRole("button", { name: "Continuar", exact: true }).isVisible());
    return {
      time: timeline,
      method: "Synthetic visibilitychange handler check; not physical OS/background tab evidence",
    };
  });
  await check("No unexpected page errors in normal desktop/mobile sessions", async () => {
    assert.deepEqual(errors, []);
    assert.deepEqual(mobileErrors, []);
    return { desktopErrors: errors, mobileErrors };
  });
  await mobileContext.close();

  await check("GLB HTTP 404 disables start; retry aborts old scene and recovers", async () => {
    const failureContext = await browser.newContext({ viewport: { width: 1280, height: 900 } });
    const failedPage = await failureContext.newPage();
    try {
      await failedPage.route("**/models/silo-engolfamento/worker-*.glb", (request) =>
        request.fulfill({ status: 404, body: "Deliberate asset failure for validation" }),
      );
      await failedPage.goto(route, { waitUntil: "domcontentloaded" });
      await failedPage
        .getByRole("heading", { name: "Recurso indisponível", exact: true })
        .waitFor({ state: "visible", timeout: 90000 });
      assert.ok(
        await failedPage.getByRole("button", { name: "Iniciar", exact: true }).isDisabled(),
      );
      const message = await failedPage.locator(".silo-load").textContent();
      await failedPage.evaluate(() => {
        window.__siloFailedMetrics = window.__siloMetrics;
      });
      await failedPage.unroute("**/models/silo-engolfamento/worker-*.glb");
      await failedPage
        .getByRole("button", { name: "Recarregar em qualidade leve", exact: true })
        .click();
      await ready(failedPage);
      assert.equal(await failedPage.locator("canvas").count(), 1);
      assert.ok(
        await failedPage.evaluate(
          () =>
            window.__siloFailedMetrics.disposed &&
            window.__siloFailedMetrics !== window.__siloMetrics,
        ),
      );
      return { deliberateFailure: message, recovered: await snapshot(failedPage) };
    } finally {
      await failureContext.close();
    }
  });

  await check(
    "WebGL disabled: accessible educational sequence and same timeline stages",
    async () => {
      noWebglBrowser = await chromium.launch({
        channel: "chrome",
        headless: true,
        args: ["--disable-webgl"],
      });
      fallbackPage = await noWebglBrowser.newPage({
        viewport: { width: 390, height: 844 },
        isMobile: true,
        hasTouch: true,
      });
      await fallbackPage.goto(route, { waitUntil: "domcontentloaded" });
      await fallbackPage
        .getByRole("heading", { name: "Recurso indisponível", exact: true })
        .waitFor({ state: "visible", timeout: 90000 });
      assert.ok(
        await fallbackPage.getByRole("button", { name: "Iniciar", exact: true }).isDisabled(),
      );
      await fallbackPage
        .getByRole("button", { name: "Sequência educativa leve", exact: true })
        .click();
      assert.equal(await fallbackPage.locator("canvas").count(), 0);
      await fallbackPage.getByRole("button", { name: "Iniciar", exact: true }).click();
      const hiddenResume = await fallbackHiddenResume(fallbackPage);
      await seek(fallbackPage, 20);
      assert.ok(await fallbackPage.locator(".silo-fallback").isVisible());
      assert.ok(
        (await fallbackPage.locator(".silo-fallback").textContent()).includes(
          "Engolfamento completo",
        ),
      );
      assert.ok(await fallbackPage.locator(".silo-hud").isVisible());
      await fallbackPage.getByRole("button", { name: cameras.victim, exact: true }).tap();
      assert.ok(
        await fallbackPage
          .getByRole("button", { name: "Sair da primeira pessoa", exact: true })
          .isVisible(),
      );
      await shot(fallbackPage, "mobile-no-webgl-sequence");
      return { snapshot: await snapshot(fallbackPage), hiddenResume };
    },
    () => fallbackPage ?? page,
  );
} catch (error) {
  report.failures.push({ name: "validation orchestration", error: String(error.stack ?? error) });
  console.error(error);
} finally {
  report.completedAt = new Date().toISOString();
  await writeFile(path.join(output, "ui.json"), JSON.stringify(report, null, 2));
  const lines = [
    "# Evidência automatizada do silo",
    "",
    `Execução: ${report.testedAt}. Navegador: ${report.browser.version}.`,
    `Resultado: ${report.checks.filter((item) => item.result === "passed").length} verificações passaram; ${report.failures.length} falhas.`,
    "",
    report.environment,
    "",
    "Os valores abaixo incluem somente quadros de reprodução ativa. Pausa e transições prévias foram excluídas. Reprodução em 0,5× para limitar sobrecarga sem alterar a seed ou o domínio.",
    "",
    "| Perfil | Câmera | Ambiente | Quadros | Mediana ms | p95 ms | CPU p95 ms | Draw calls totais máx. | Triângulos sem sombra máx. |",
    "| --- | --- | --- | ---: | ---: | ---: | ---: | ---: | ---: |",
    ...report.samples.map(
      (sample) =>
        `| ${sample.profile} | ${sample.camera} | ${sample.mobileEmulation ? "390×844 touch emulado" : "Desktop 1440×1000"} | ${sample.activeFrames} | ${sample.frameMs.median?.toFixed(2) ?? "n/d"} | ${sample.frameMs.p95?.toFixed(2) ?? "n/d"} | ${sample.cpuRenderMs.p95?.toFixed(2) ?? "n/d"} | ${sample.maxTotalCallsIncludingShadows} | ${sample.noShadowPassMaxTriangles || "n/d"} |`,
    ),
    "",
    "## Resultados das verificações",
    "",
    ...report.checks.map(
      (item) =>
        `- ${item.result === "passed" ? "PASSOU" : "FALHOU"}: ${item.name}${item.error ? ` — ${item.error.split("\n")[0]}` : ""}`,
    ),
    "",
    "## Limites da evidência",
    "",
    ...report.limitations.map((limitation) => `- ${limitation}`),
    "",
    "O relatório completo, snapshots de estado e erros estão em [ui.json](./ui.json). Capturas são evidência visual local; não provam dispositivo físico ou conformidade física/médica/normativa.",
  ];
  await writeFile(path.join(output, "validation.md"), lines.join("\n"));
  clearTimeout(watchdog);
  await noWebglBrowser?.close();
  await browser.close();
}
console.log(
  JSON.stringify({
    checks: report.checks.length,
    passed: report.checks.filter((item) => item.result === "passed").length,
    failures: report.failures.map((item) => item.name),
    samples: report.samples.length,
    screenshots: report.screenshots.length,
  }),
);
process.exitCode = report.failures.length ? 1 : 0;
