import { chromium } from "playwright";
import { mkdir, readFile, writeFile } from "node:fs/promises";
import path from "node:path";
import { performance } from "node:perf_hooks";
import { gzipSync } from "node:zlib";

// A câmera só responde aos comandos normais da interface. A instrumentação observa os renders
// da aplicação; um callback de animação ocioso não conta como quadro 3D.
const base = new URL(process.env.NEXUS_TEST_BASE_URL || "http://127.0.0.1:4395");
if (!["127.0.0.1", "localhost"].includes(base.hostname))
  throw Error("Usar o build de produção local.");
const profile = process.env.CRUZ_PERFIL || "auto";
if (!["auto", "economico", "detalhado"].includes(profile))
  throw Error("Perfil gráfico desconhecido.");
const runs = Number(process.env.CRUZ_REPETICOES || 3);
const offset = Number(process.env.CRUZ_EXECUCAO_INICIAL || 1);
if (![runs, offset].every((n) => Number.isInteger(n) && n >= 1 && n <= 30))
  throw Error("A série deve conter de 1 a 30 execuções.");
const out = path.resolve(process.env.CRUZ_SAIDA || "docs/cruz-alta/desempenho");
const video = process.env.CRUZ_VIDEO === "1";
const viewport = { width: 1440, height: 900 };
const network = { down: 50, up: 15, rtt: 20, cpu: 1 };
const devicePixelRatio = 2;
await mkdir(out, { recursive: true });
const round = (n) => Math.round(n * 100) / 100;
const quantile = (values, p) =>
  values.length ? round([...values].sort((a, b) => a - b)[Math.ceil(values.length * p) - 1]) : null;
const pause = (ms) => new Promise((resolve) => setTimeout(resolve, Math.max(ms, 0)));

function observeRenderer() {
  const stats = {
    frames: [],
    rafs: [],
    textures: [],
    timers: [],
    moves: [],
    sceneCpu: [],
    longFrames: [],
    stage: "abertura",
    firstDraw: null,
    visibility: [],
    firstInput: null,
  };
  window.cruzBenchmark = stats;
  let totalDraws = 0;
  const nativeRaf = window.requestAnimationFrame.bind(window);
  window.requestAnimationFrame = (callback) =>
    nativeRaf((ts) => {
      const before = totalDraws,
        start = performance.now();
      try {
        return callback(ts);
      } finally {
        if (totalDraws > before)
          stats.sceneCpu.push({ t: start, stage: stats.stage, ms: performance.now() - start });
      }
    });
  const observeRefresh = (ts) => {
    stats.rafs.push({ t: ts, stage: stats.stage });
    if (stats.stage !== "fim") requestAnimationFrame(observeRefresh);
  };
  requestAnimationFrame(observeRefresh);
  if (PerformanceObserver.supportedEntryTypes.includes("long-animation-frame"))
    new PerformanceObserver((list) => {
      for (const e of list.getEntries())
        stats.longFrames.push({ start: e.startTime, ms: e.duration });
    }).observe({ type: "long-animation-frame", buffered: true });
  let ext = null,
    gl = null,
    open = null,
    target = null,
    draw = 0,
    shadow = 0,
    frame = 0,
    sample = false;
  const queued = [];
  const shadowSamples = new Map();
  const proto = WebGL2RenderingContext.prototype;
  const scene = (g) => g.canvas?.closest?.(".ca-stage");
  function endTimer() {
    if (open) {
      gl.endQuery(ext.TIME_ELAPSED_EXT);
      queued.push(open);
      open = null;
    }
  }
  function readTimers() {
    if (gl.getParameter(ext.GPU_DISJOINT_EXT)) {
      for (const entry of queued.splice(0)) gl.deleteQuery(entry.q);
      return;
    }
    while (queued.length && gl.getQueryParameter(queued[0].q, gl.QUERY_RESULT_AVAILABLE)) {
      const entry = queued.shift();
      stats.timers.push({
        stage: entry.stage,
        pass: entry.pass,
        ms: gl.getQueryParameter(entry.q, gl.QUERY_RESULT) / 1e6,
      });
      gl.deleteQuery(entry.q);
    }
  }
  function startTimer(g, pass) {
    if (!ext || open) return;
    const earlyShadow = pass === "sombra" && (shadowSamples.get(stats.stage) ?? 0) < 3;
    if (!sample && !earlyShadow) return;
    if (pass === "sombra")
      shadowSamples.set(stats.stage, (shadowSamples.get(stats.stage) ?? 0) + 1);
    const q = g.createQuery();
    g.beginQuery(ext.TIME_ELAPSED_EXT, q);
    open = { q, pass, stage: stats.stage };
  }
  for (const name of [
    "drawElements",
    "drawArrays",
    "drawElementsInstanced",
    "drawArraysInstanced",
  ]) {
    const original = proto[name];
    proto[name] = function (...args) {
      if (this === gl || (!gl && scene(this))) {
        if (!gl) {
          gl = this;
          ext = gl.getExtension("EXT_disjoint_timer_query_webgl2");
        }
        startTimer(gl, target ? "sombra" : "tela");
        totalDraws++;
        if (target) shadow++;
        else draw++;
      }
      return original.apply(this, args);
    };
  }
  const bind = proto.bindFramebuffer;
  proto.bindFramebuffer = function (kind, fb) {
    if ((this === gl || (!gl && scene(this))) && kind !== this.READ_FRAMEBUFFER && fb !== target) {
      endTimer();
      target = fb;
    }
    return bind.call(this, kind, fb);
  };
  for (const name of ["texImage2D", "texSubImage2D"]) {
    const original = proto[name];
    proto[name] = function (...args) {
      if (stats.textures.length >= 8 || !scene(this)) return original.apply(this, args);
      const input = args.at(-1);
      const w = input?.width ?? (name === "texImage2D" ? args[3] : args[4]);
      const h = input?.height ?? (name === "texImage2D" ? args[4] : args[5]);
      if (typeof w !== "number" || typeof h !== "number" || w < 8 || h < 8 || input == null)
        return original.apply(this, args);
      const start = performance.now(),
        result = original.apply(this, args);
      stats.textures.push({
        start,
        cpuMs: performance.now() - start,
        width: w,
        height: h,
        kind: name,
      });
      return result;
    };
  }
  document.addEventListener("visibilitychange", () =>
    stats.visibility.push({ t: performance.now(), state: document.visibilityState }),
  );
  for (const name of ["wheel", "touchstart", "pointerdown"])
    addEventListener(
      name,
      () => {
        stats.firstInput ??= performance.now();
      },
      { capture: true, passive: true },
    );
  addEventListener(
    "pointermove",
    (event) => {
      if (event.buttons & 1) stats.moves.push({ t: performance.now(), stage: stats.stage });
    },
    { capture: true, passive: true },
  );
  const observer = new MutationObserver((records) => {
    const canvas = records[0].target;
    if (!canvas.matches(".ca-stage canvas")) return;
    endTimer();
    if (ext && queued.length && frame % 5 === 0) readTimers();
    const t = performance.now(),
      d = canvas.dataset;
    stats.firstDraw ??= t;
    stats.frames.push({
      t,
      stage: stats.stage,
      mode: d.mode,
      eye: d.camera,
      calls: draw,
      shadow,
      triangles: +d.triangles,
      cpu: d.cpuMs ? +d.cpuMs : null,
      quality: d.quality,
      near: d.lodNear,
      far: d.lodDistant,
    });
    draw = shadow = 0;
    frame++;
    sample = frame % 40 === 0;
  });
  observer.observe(document, { subtree: true, attributes: true, attributeFilter: ["data-camera"] });
}
const reportPath = path.join(out, profile + ".json");
const reports = offset === 1 ? [] : JSON.parse(await readFile(reportPath, "utf8"));
if (
  reports.length !== offset - 1 ||
  reports.some((r, i) => r.profile !== profile || r.run !== i + 1)
)
  throw Error("Série de desempenho incompleta para retomada.");
const launch = () =>
  chromium.launch({
    executablePath:
      process.env.CRUZ_CHROME || "/Applications/Google Chrome.app/Contents/MacOS/Google Chrome",
    headless: process.env.CRUZ_HEADFUL !== "1",
    args: process.platform === "darwin" ? ["--use-angle=metal"] : [],
  });
let preferences;
if (profile !== "auto") {
  const setup = await launch();
  try {
    const page = await setup.newPage({ viewport, deviceScaleFactor: devicePixelRatio });
    await page.goto(new URL("/mapas-3d/tres-tentos-cruz-alta", base).href);
    await page.locator(".ca-stage canvas[data-camera]").waitFor();
    await page.getByRole("button", { name: "Camadas", exact: true }).click();
    await page.getByLabel("Qualidade gráfica").selectOption(profile);
    preferences = await page.context().storageState();
  } finally {
    await setup.close();
  }
}
for (let run = offset; run < offset + runs; run++) {
  const browser = await launch();
  let context;
  try {
    context = await browser.newContext({
      viewport,
      deviceScaleFactor: devicePixelRatio,
      storageState: preferences,
      serviceWorkers: "block",
      reducedMotion: "no-preference",
      ...(video ? { recordVideo: { dir: out, size: { width: 1280, height: 800 } } } : {}),
    });
    await context.addInitScript(observeRenderer);
    const page = await context.newPage(),
      cdp = await context.newCDPSession(page),
      errors = [];
    page.on("pageerror", (e) => errors.push(e.message));
    page.setDefaultTimeout(15000);
    await cdp.send("Network.enable");
    await cdp.send("Network.setCacheDisabled", { cacheDisabled: true });
    await cdp.send("Network.emulateNetworkConditions", {
      offline: false,
      latency: network.rtt,
      downloadThroughput: (network.down * 1e6) / 8,
      uploadThroughput: (network.up * 1e6) / 8,
    });
    await cdp.send("Emulation.setCPUThrottlingRate", { rate: network.cpu });
    const startRecord = performance.now();
    await page.goto(new URL("/mapas-3d/tres-tentos-cruz-alta", base).href, {
      waitUntil: "domcontentloaded",
    });
    const canvas = page.locator(".ca-stage canvas[data-camera]");
    await canvas.waitFor();
    const hardware = await canvas.evaluate((el) => {
      const gl = el.getContext("webgl2"),
        x = gl.getExtension("WEBGL_debug_renderer_info");
      return {
        renderer: x ? gl.getParameter(x.UNMASKED_RENDERER_WEBGL) : null,
        css: [el.clientWidth, el.clientHeight],
        buffer: [gl.drawingBufferWidth, gl.drawingBufferHeight],
        dpr: devicePixelRatio,
        samples: gl.getParameter(gl.SAMPLES),
        antialias: gl.getContextAttributes()?.antialias,
        timerGpu: !!gl.getExtension("EXT_disjoint_timer_query_webgl2"),
        visibility: document.visibilityState,
        ua: navigator.userAgent,
      };
    });
    if (!hardware.renderer || /swiftshader|llvmpipe/i.test(hardware.renderer))
      throw Error("GPU por software: " + hardware.renderer);
    const initialQuality = await canvas.getAttribute("data-quality");
    const firstEye = await canvas.getAttribute("data-camera");
    const button = (name) => page.getByRole("button", { name, exact: true });
    async function tap(loc) {
      await loc.click();
    }
    async function pointerCenters() {
      const r = await canvas.boundingBox();
      return { x: r.x + r.width * 0.49, y: r.y + r.height * 0.51, w: r.width, h: r.height };
    }
    let point = await pointerCenters();
    await page.mouse.move(point.x, point.y);
    await page.mouse.wheel(0, -65);
    await page.waitForFunction(
      (eye) => document.querySelector(".ca-stage canvas")?.dataset.camera !== eye,
      firstEye,
    );
    const firstResponded = await page.evaluate(() => window.cruzBenchmark.frames.at(-1).t);
    if (profile !== "auto" && initialQuality !== profile) {
      await tap(button("Camadas"));
      await page.getByLabel("Qualidade gráfica").selectOption(profile);
      await tap(button("Fechar camadas"));
      await page.waitForFunction(
        (q) => document.querySelector(".ca-stage canvas")?.dataset.quality === q,
        profile,
      );
    }
    const start = performance.now(),
      timeline = [];
    async function stage(label) {
      timeline.push({ name: label, s: round((performance.now() - start) / 1000) });
      await page.evaluate((x) => {
        window.cruzBenchmark.stage = x;
      }, label);
    }
    const until = (s) => pause(start + s * 1000 - performance.now());
    async function dragUntil(seconds, { dx = 0.18, dy = 0.045, cumulative = false } = {}) {
      point = await pointerCenters();
      const initial = performance.now(),
        duration = Math.max(15, start + seconds * 1000 - initial);
      await page.mouse.move(point.x, point.y);
      await page.mouse.down();
      const inFlight = new Set();
      let next = 0;
      do {
        const elapsed = performance.now() - initial;
        const wave = cumulative ? Math.min(1, elapsed / duration) : Math.sin(elapsed / 2900);
        const x = point.x + point.w * dx * wave,
          y = point.y + point.h * dy * (cumulative ? wave : Math.sin(elapsed / 3700));
        const message = cdp.send("Input.dispatchMouseEvent", {
          type: "mouseMoved",
          x,
          y,
          buttons: 1,
          button: "left",
          pointerType: "mouse",
        });
        inFlight.add(message);
        message.then(() => inFlight.delete(message));
        if (inFlight.size >= 4) await Promise.race(inFlight);
        next += 1000 / 90;
        await pause(Math.min(12, initial + next - performance.now()));
      } while (performance.now() < start + seconds * 1000);
      await Promise.all(inFlight);
      await page.mouse.up();
    }
    const search = page.getByRole("searchbox", { name: "Buscar setor, estrutura ou LVHF" });
    async function choose(query) {
      await search.fill(query);
      await search.press("Enter");
      await button("Fechar ficha").waitFor();
    }
    const close = () => tap(button("Fechar ficha"));
    await stage("implantacao");
    await dragUntil(4.3, { dx: 0.13 });
    await stage("planta");
    await tap(button("Planta"));
    await tap(button("Aproximar"));
    await until(6.6);
    await tap(button("Aproximar"));
    await until(8.4);
    await stage("cobertura");
    await choose("28.1");
    await until(10.2);
    await close();
    await dragUntil(14.2, { dy: 0.24, dx: 0.12, cumulative: true });
    await stage("aproximacao-galeria");
    await choose("Galeria da bateria sul");
    await until(16);
    await close();
    await until(17);
    await stage("silos-galerias");
    await dragUntil(32, { dx: 0.36, dy: 0.085 });
    await stage("patio");
    await choose("Silo da bateria sul · corpo 1");
    await until(33.4);
    await tap(button("Pátio"));
    await close();
    await dragUntil(36.2, { dx: 0.075, dy: 0.1, cumulative: true });
    await stage("piso-lateral");
    await canvas.focus();
    await page.keyboard.down("d");
    await until(43.3);
    await page.keyboard.up("d");
    await stage("piso-estrutura");
    await choose("Reservatório da faixa norte · corpo 1");
    await until(44.2);
    await tap(button("Pátio"));
    await close();
    await dragUntil(47.1, { dx: 0.17, dy: 0.045, cumulative: true });
    await canvas.focus();
    await page.keyboard.down("a");
    await until(49);
    await page.keyboard.up("a");
    await stage("encontro");
    await tap(button("Camadas"));
    const attribution = page.locator(".ca-horizon-source");
    const horizon = (await attribution.count()) ? await attribution.textContent() : null;
    const details = page.locator(".ca-comparison");
    if (!(await details.evaluate((el) => el.open))) await tap(details.locator("summary"));
    await tap(page.getByRole("button", { name: /Encontro de coberturas/ }));
    await dragUntil(52, { dx: 0.1, dy: 0.03 });
    await stage("recuo-lod");
    point = await pointerCenters();
    await page.mouse.move(point.x, point.y);
    // O mecanismo de entrada do Chrome emite uma única rolagem contínua, independente do RTT do CDP.
    await cdp.send("Input.synthesizeScrollGesture", {
      x: point.x,
      y: point.y,
      yDistance: -1600,
      speed: 270,
      gestureSourceType: "mouse",
      preventFling: true,
    });
    await tap(button("Ver toda a unidade"));
    await until(60);
    await stage("fim");
    const metrics = await page.evaluate(() => ({
      raw: window.cruzBenchmark,
      final: { ...document.querySelector(".ca-stage canvas").dataset },
      requests: performance.getEntriesByType("resource").map((e) => ({
        path: new URL(e.name).pathname,
        status: e.responseStatus,
        bytes: e.transferSize,
        end: e.responseEnd,
        start: e.fetchStart,
      })),
      timing: performance.getEntriesByType("navigation")[0]?.toJSON(),
    }));
    const raw = metrics.raw;
    const stages = timeline.map(({ name, s }) => {
      const frames = raw.frames.filter((f) => f.stage === name);
      const dt = frames.slice(1).map((f, i) => f.t - frames[i].t);
      const raf = raw.rafs.filter((f) => f.stage === name);
      const cycles = raf.slice(1).map((f, i) => f.t - raf[i].t);
      const passTimers = (pass) =>
        raw.timers.filter((t) => t.stage === name && t.pass === pass).map((t) => t.ms);
      const gpuShadow = passTimers("sombra"),
        gpuScreen = passTimers("tela");
      return {
        name,
        s,
        rafFrames: raf.length,
        rafMedianFps: cycles.length ? round(1000 / quantile(cycles, 0.5)) : null,
        rafP95Ms: quantile(cycles, 0.95),
        pointerMoves: raw.moves.filter((move) => move.stage === name).length,
        rendered: frames.length,
        first: frames[0]?.eye,
        last: frames.at(-1)?.eye,
        medianFps: dt.length ? round(1000 / quantile(dt, 0.5)) : null,
        meanFps: dt.length ? round((1000 * dt.length) / dt.reduce((a, b) => a + b, 0)) : null,
        medianMs: quantile(dt, 0.5),
        p95Ms: quantile(dt, 0.95),
        p95CpuMs: quantile(
          frames.map((f) => f.cpu).filter((x) => x != null),
          0.95,
        ),
        sceneCpuP95Ms: quantile(
          raw.sceneCpu.filter((e) => e.stage === name).map((e) => e.ms),
          0.95,
        ),
        maxCalls: Math.max(0, ...frames.map((f) => f.calls + f.shadow)),
        maxShadowDraws: Math.max(0, ...frames.map((f) => f.shadow)),
        maxTriangles: Math.max(0, ...frames.map((f) => f.triangles)),
        gpuShadowMedianMs: quantile(gpuShadow, 0.5),
        gpuShadowP95Ms: quantile(gpuShadow, 0.95),
        gpuScreenMedianMs: quantile(gpuScreen, 0.5),
        gpuScreenP95Ms: quantile(gpuScreen, 0.95),
        gpuSamples: gpuShadow.length + gpuScreen.length,
        lodNear: [...new Set(frames.map((f) => f.near).filter(Boolean))],
        lodFar: [...new Set(frames.map((f) => f.far).filter(Boolean))],
      };
    });
    const firstTexture = metrics.requests
      .filter((r) => r.path.startsWith("/textures/"))
      .sort((a, b) => a.end - b.end)[0];
    const summary = {
      run,
      profile,
      initialQuality,
      longFrameCount: raw.longFrames.length,
      longestLongFrameMs: Math.max(0, ...raw.longFrames.map((e) => e.ms)),
      chrome: browser.version(),
      video,
      network,
      viewport,
      hardware,
      firstVisibleRenderMs: round(raw.firstDraw),
      firstInteractionMs: round(firstResponded),
      firstInputMs: raw.firstInput,
      firstTextureRequest: firstTexture,
      firstTextureUpload: raw.textures[0] || null,
      horizon,
      regionalTransfers: metrics.requests.filter((r) =>
        r.path.startsWith("/models/cruz-alta/regional/"),
      ),
      bytesAtFirstRender: metrics.requests
        .filter((r) => r.end <= raw.firstDraw)
        .reduce((a, b) => a + b.bytes, metrics.timing.transferSize),
      duration_s: timeline.at(-1).s,
      visibility: raw.visibility,
      final: metrics.final,
      stages,
      errors,
    };
    if (video) {
      const file = page.video();
      await context.close();
      context = null;
      await file.saveAs(path.join(out, profile + "-percurso.webm"));
      await file.delete();
      summary.recordingStartOffset = round((start - startRecord) / 1000);
    }
    await writeFile(
      path.join(out, profile + "-" + run + "-quadros.json.gz"),
      gzipSync(
        JSON.stringify({
          frames: raw.frames,
          rafs: raw.rafs,
          moves: raw.moves,
          sceneCpu: raw.sceneCpu,
          timers: raw.timers,
          longFrames: raw.longFrames,
        }),
      ),
    );
    reports.push(summary);
    await writeFile(reportPath, JSON.stringify(reports, null, 2) + "\n");
    const moving = (name) => {
      const segment = stages.find((s) => s.name === name);
      return segment && segment.rendered > 1 && segment.first !== segment.last;
    };
    if (!["silos-galerias", "piso-lateral", "recuo-lod"].every(moving))
      throw Error("A câmera não concluiu um dos trechos de movimento.");
    if (
      process.env.CRUZ_EXIGIR_HORIZONTE === "1" &&
      (!horizon || /indisponível|carregando/i.test(horizon) || summary.regionalTransfers.length < 5)
    ) {
      throw Error("A paisagem regional não ficou disponível neste percurso.");
    }
    if (
      process.env.CRUZ_EXIGIR_CBERS === "1" &&
      (!horizon?.includes("CBERS") ||
        !summary.regionalTransfers.some(
          (r) => r.path.endsWith("/vizinhos.webp") && r.status === 200 && r.bytes > 0,
        ))
    ) {
      throw Error("Arquivo da paisagem próxima indisponível.");
    }
    console.log(
      JSON.stringify({
        profile,
        run,
        ready: summary.firstVisibleRenderMs,
        interactive: firstResponded,
        dense: stages.find((x) => x.name === "silos-galerias"),
        walk: stages.find((x) => x.name === "piso-lateral"),
        errors,
      }),
    );
  } finally {
    if (context) await context.close();
    await browser.close();
  }
}
