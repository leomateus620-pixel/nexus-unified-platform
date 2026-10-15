import { chromium } from "@playwright/test";
import assert from "node:assert/strict";
import { mkdir, readFile, writeFile } from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import { evidenceReplacer } from "./evidence-privacy.mjs";

const base = (process.env.SILO_URL ?? "http://127.0.0.1:5185").replace(/\/$/, "");
const output = process.env.SILO_OUTPUT ?? "docs/silo-engolfamento/evidence/upgrade";
const touchOnly = process.env.SILO_TOUCH_ONLY === "1" || process.argv.includes("--touch");
const framesPerSample = Number(process.env.SILO_SAMPLE_FRAMES ?? 180);
const filter = process.env.SILO_CHECKS ? new RegExp(process.env.SILO_CHECKS) : null;
await mkdir(output, { recursive: true });
const report = {
  schema: "nexus-silo-upgrade-validation/2.0.0",
  testedAt: new Date().toISOString(),
  base,
  command: `node scripts/silo-engolfamento/validate-upgrade.mjs${touchOnly ? " --touch" : ""}`,
  host: {
    platform: os.platform(),
    release: os.release(),
    cpu: os.cpus()[0]?.model,
    ramBytes: os.totalmem(),
  },
  browser: null,
  scopeFilter: process.env.SILO_CHECKS ?? null,
  checks: [],
  failures: [],
  screenshots: [],
  loading: [],
  samples: [],
  consoleErrors: [],
  renderErrors: [],
  gpuDeletionTraces: [],
  limitations: [
    "Desktop local Chrome headless. Mobile dimensions and touch are Chromium emulation, not Android/iOS hardware.",
    "RAF interval is active frame time; synchronous renderer.render is CPU submission, not GPU completion. GPU timer query not measured.",
    "Development-server Resource Timing is not compressed production bytes or mobile-network readiness.",
    "Shadow passes are estimates; renderer.info totals include shadow work. Resource byte estimates are not actual driver VRAM.",
    "Parametric mechanical passage and appearance require separate visual review; screenshots and numeric tests do not certify CAD, loads or rescue procedures.",
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
report.browser = browser.version();
const contexts = [];
let activePage;
let currentCheck = "setup";
const save = async () => {
  report.criteria = [
    ...report.checks.map((check) => ({
      criterion: check.name,
      condition: touchOnly
        ? "Chrome com toque emulado"
        : "Chrome local, viewport indicado na evidência",
      status: check.result,
      measured: check.result === "aprovado" ? "Verificação executada sem divergência" : check.error,
      evidence: touchOnly ? "touch-commands.json" : "ui.json",
      pending: check.result === "aprovado" ? "—" : "Corrigir e repetir a verificação",
    })),
    ...report.samples.flatMap((sample) => [
      {
        criterion: `Tempo de quadro · ${sample.label}`,
        condition: `${sample.frameMs.samples} quadros ativos; ${sample.viewport.width}×${sample.viewport.height}; ${sample.activity}`,
        status: sample.targets.measuredWithinFrameTarget ? "aprovado" : "não atingido",
        measured: `p50 ${sample.frameMs.p50?.toFixed(2)} / p95 ${sample.frameMs.p95?.toFixed(2)} / p99 ${sample.frameMs.p99?.toFixed(2)} ms; CPU render p95 ${sample.cpuRenderMs.p95?.toFixed(2)} ms`,
        evidence: "ui.json → samples",
        pending: sample.targets.measuredWithinFrameTarget
          ? "GPU não medida; dispositivo físico não verificado"
          : "Investigar custo e repetir sob a mesma condição",
      },
      {
        criterion: `Orçamento gráfico · ${sample.label}`,
        condition: `Principal, sombras separadas; perfil ${sample.targets.quality}`,
        status:
          sample.targets.measuredWithinDrawCallBudget && sample.targets.measuredWithinTriangleBudget
            ? "aprovado"
            : "não atingido",
        measured: `${sample.maxPrincipalCalls} chamadas / ${sample.maxPrincipalTriangles} triângulos; metas ${sample.targets.drawCallBudget}/${sample.targets.triangleBudget}`,
        evidence: "ui.json → samples",
        pending: "Contadores de sombras são estimativas; memória GPU real não medida",
      },
    ]),
    {
      criterion: "Android/iOS físico e rede móvel",
      condition: "Hardware indisponível nesta execução",
      status: "não verificado",
      measured: "Somente Chrome desktop e emulação",
      evidence: "ui.json → limitations",
      pending: "Executar no telefone de referência com rede e duração documentadas",
    },
    {
      criterion: "Passagem mecânica exata e dimensionamento LVHF",
      condition: "Sem CAD/desenho executivo autorizado",
      status: "não verificado",
      measured: "Cinemática paramétrica identificada",
      evidence: "upgrade-references.md",
      pending:
        "Obter desenhos/recursos autorizados do fabricante e conferir compatibilidade/cargas",
    },
  ];
  await writeFile(
    path.join(output, touchOnly ? "touch-commands.json" : "ui.json"),
    `${JSON.stringify(report, evidenceReplacer, 2)}\n`,
  );
  const escape = (value) =>
    String(value ?? "—")
      .replaceAll("|", "/")
      .replaceAll("\n", " ");
  const rows = report.criteria
    .map(
      (row) =>
        `| ${escape(row.criterion)} | ${escape(row.condition)} | ${row.status} | ${escape(row.measured)} | ${escape(row.evidence)} | ${escape(row.pending)} |`,
    )
    .join("\n");
  await writeFile(
    path.join(output, touchOnly ? "touch-validation-table.md" : "validation-table.md"),
    `# Critérios executados${report.scopeFilter ? " · execução filtrada" : ""}\n\n| Critério | Condição testada | Estado | Resultado medido | Evidência | Pendência |\n| --- | --- | --- | --- | --- | --- |\n${rows}\n`,
  );
};
async function check(name, run) {
  if (filter && !filter.test(name)) return;
  const start = performance.now();
  currentCheck = name;
  try {
    const evidence = await run();
    report.checks.push({
      name,
      result: "aprovado",
      durationMs: performance.now() - start,
      evidence,
    });
    console.log(`PASS ${name}`);
  } catch (error) {
    const filename = `failure-${touchOnly ? "touch-" : ""}${report.failures.length + 1}.png`;
    await activePage
      ?.screenshot({ path: path.join(output, filename), timeout: 5000 })
      .catch(() => {});
    const failure = {
      name,
      result: "não atingido",
      error: String(error.stack ?? error),
      durationMs: performance.now() - start,
      screenshot: filename,
      state: await state(activePage).catch(() => null),
    };
    report.checks.push(failure);
    report.failures.push(failure);
    console.error(`FAIL ${name}: ${error.message}`);
    // A failing synthetic visibility assertion must not poison later recovery tests.
    await activePage
      ?.evaluate(() => {
        if (Object.prototype.hasOwnProperty.call(document, "hidden")) {
          delete document.hidden;
          document.dispatchEvent(new Event("visibilitychange"));
        }
      })
      .catch(() => {});
  }
  await save();
}
async function contextFor(width, height, touch = false) {
  const context = await browser.newContext({
    viewport: { width, height },
    deviceScaleFactor: 1,
    hasTouch: touch,
    isMobile: touch,
  });
  if (process.env.SILO_TRACE_GL_DELETE === "1")
    await context.addInitScript(() => {
      for (const Context of [WebGLRenderingContext, WebGL2RenderingContext]) {
        for (const kind of [
          "Buffer",
          "VertexArray",
          "Texture",
          "Framebuffer",
          "Renderbuffer",
          "Program",
          "Shader",
        ]) {
          const name = `delete${kind}`,
            is = `is${kind}`,
            original = Context.prototype[name];
          if (!original || !Context.prototype[is]) continue;
          Context.prototype[name] = function (object) {
            if (object && !this.isContextLost() && !this[is](object))
              console.warn("NEXUS_GPU_DELETE_TRACE", name, new Error().stack);
            return original.call(this, object);
          };
        }
      }
    });
  contexts.push(context);
  const page = await context.newPage();
  page.setDefaultTimeout(18000);
  page.on("pageerror", (error) =>
    report.consoleErrors.push({ viewport: `${width}x${height}`, message: error.message }),
  );
  page.on("console", (message) => {
    const text = message.text();
    if (text.startsWith("NEXUS_GPU_DELETE_TRACE"))
      report.gpuDeletionTraces.push({ check: currentCheck, message: text });
    if (
      /GL_INVALID_OPERATION|GL_INVALID_VALUE|GL_INVALID_ENUM|THREE.WebGLProgram: Shader Error|WebGL:\s*INVALID/.test(
        text,
      ) &&
      !report.renderErrors.some((entry) => entry.message === text)
    )
      report.renderErrors.push({
        viewport: `${width}x${height}`,
        check: currentCheck,
        type: message.type(),
        message: text,
      });
  });
  activePage = page;
  return { context, page };
}
async function ready(page) {
  await page.waitForSelector("canvas[data-ready=true]", { timeout: 90000 });
  await page.waitForFunction(
    () =>
      window.__siloMetrics?.readyMs > 0 &&
      !window.__siloMetrics?.disposed &&
      !document.querySelector(".silo-load"),
    null,
    { timeout: 90000 },
  );
}
async function state(page) {
  return page.evaluate(() => ({
    canvas: { ...document.querySelector("canvas")?.dataset },
    mode: document.querySelector(".silo-viewer")?.dataset.mode,
    panel: document.querySelector(".silo-viewer")?.dataset.panel,
    selected: document.querySelector(".silo-component-detail")?.dataset.component ?? null,
    canvases: document.querySelectorAll("canvas").length,
    horizontalOverflow: document.documentElement.scrollWidth > innerWidth,
    time: Number(document.querySelector('input[aria-label="Instante da simulação"]')?.value ?? 0),
    dialogs: document.querySelectorAll("dialog[open]").length,
    exitVisible: !!document.querySelector(".silo-exit-camera"),
    metrics: window.__siloMetrics
      ? {
          readyMs: window.__siloMetrics.readyMs,
          explorationMs: window.__siloMetrics.explorationMs,
          statusReason: window.__siloMetrics.statusReason,
          dorsalError: window.__siloMetrics.dorsalError,
          contextLosses: window.__siloMetrics.contextLosses,
          disposed: window.__siloMetrics.disposed,
          isolatedId: window.__siloMetrics.isolatedId,
          workerVisible: window.__siloMetrics.workerVisible,
          grainsVisible: window.__siloMetrics.grainsVisible,
          ropeVisible: window.__siloMetrics.ropeVisible,
          controllerCamera: window.__siloMetrics.controllerCamera,
          errors: window.__siloMetrics.errors,
          calls: window.__siloMetrics.calls,
          triangles: window.__siloMetrics.triangles,
        }
      : null,
  }));
}
async function shot(page, name) {
  const filename = `${name}.png`;
  await page.screenshot({ path: path.join(output, filename) });
  report.screenshots.push({ filename, state: await state(page) });
}
async function activate(page, name, touch = false) {
  const button = page.getByRole("button", { name, exact: true });
  if (touch) await button.tap();
  else await button.click();
}
async function mode(page, name, touch = false) {
  await activate(page, name, touch);
}
async function closeInspector(page, touch = false) {
  if (await page.getByRole("button", { name: "Fechar inspetor", exact: true }).count())
    await activate(page, "Fechar inspetor", touch);
}
async function seek(page, time) {
  await page
    .getByRole("slider", { name: "Instante da simulação", exact: true })
    .evaluate((input, value) => {
      Object.getOwnPropertyDescriptor(HTMLInputElement.prototype, "value").set.call(
        input,
        String(value),
      );
      input.dispatchEvent(new Event("input", { bubbles: true }));
      input.dispatchEvent(new Event("change", { bubbles: true }));
    }, time);
  await page.waitForFunction(
    (value) =>
      Math.abs(
        Number(
          document.querySelector("canvas")?.dataset.time ??
            document.querySelector('input[aria-label="Instante da simulação"]')?.value,
        ) - value,
      ) < 0.001,
    time,
  );
}
async function camera(page, id) {
  const select = () => page.locator('select[aria-label="Perspectiva de câmera"]:visible');
  const opened = !(await select().count());
  if (opened) await activate(page, "Câmeras e corte");
  await select().selectOption(id);
  if (opened) await closeInspector(page);
  if (!(await page.locator("canvas").count())) return;
  await page.waitForFunction(
    (value) => document.querySelector("canvas")?.dataset.camera === value,
    id,
  );
}
async function inspectionView(page, preset) {
  const select = () => page.locator('select[aria-label="Vista de inspeção"]:visible');
  const opened = !(await select().count());
  if (opened) await activate(page, "Câmeras e corte");
  await select().selectOption(preset);
  if (opened) await closeInspector(page);
}
async function viewCommand(page, name) {
  const opened = !(await page.getByRole("button", { name, exact: true }).isVisible());
  if (opened) await activate(page, "Câmeras e corte");
  await activate(page, name);
  if (opened) await closeInspector(page);
}
async function setSectionCut(page, enabled) {
  const button = page.getByRole("button", { name: "Corte", exact: true });
  const opened = !(await button.isVisible());
  if (opened) await activate(page, "Câmeras e corte");
  if ((await button.getAttribute("aria-pressed")) !== String(enabled)) await button.click();
  if (opened) await closeInspector(page);
}
async function pause(page) {
  if ((await state(page)).canvas.status === "running") await activate(page, "Pausar");
  await page.waitForFunction(() => document.querySelector("canvas")?.dataset.status !== "running");
}
async function play(page) {
  const button = page.locator(".silo-primary");
  await button.click();
}
async function preserveOwner(page) {
  await page.evaluate(() => {
    window.__upgradeOwner = {
      metrics: window.__siloMetrics,
      canvas: document.querySelector("canvas"),
    };
  });
}
async function assertOwner(page) {
  assert.equal(
    await page.evaluate(
      () =>
        window.__upgradeOwner.metrics === window.__siloMetrics &&
        window.__upgradeOwner.canvas === document.querySelector("canvas") &&
        !window.__siloMetrics.disposed,
    ),
    true,
    "renderer/metrics owner replaced",
  );
}
async function loading(page, label) {
  const result = await page.evaluate(() => ({
    readyMs: window.__siloMetrics.readyMs,
    explorationMs: window.__siloMetrics.explorationMs,
    renderer: window.__siloMetrics.renderer,
    resourceTiming: performance.getEntriesByType("resource").map((entry) => ({
      name: entry.name,
      durationMs: entry.duration,
      transferBytes: entry.transferSize,
      encodedBytes: entry.encodedBodySize,
      decodedBytes: entry.decodedBodySize,
    })),
    dpr: devicePixelRatio,
    userAgent: navigator.userAgent,
  }));
  report.loading.push({ label, ...result });
  return result;
}
function summarize(values) {
  const sorted = values.filter(Number.isFinite).sort((a, b) => a - b);
  const p = (ratio) => sorted[Math.floor((sorted.length - 1) * ratio)] ?? null;
  return {
    samples: sorted.length,
    p50: p(0.5),
    p95: p(0.95),
    p99: p(0.99),
    max: sorted.at(-1) ?? null,
  };
}
async function sample(page, label, activity, navigate = false) {
  await page.evaluate(() => {
    window.__siloMetrics.frames.length = 0;
  });
  const started = performance.now();
  if (navigate) {
    const box = await page.locator("canvas").boundingBox();
    await page.mouse.move(box.x + box.width * 0.5, box.y + box.height * 0.5);
    await page.mouse.down();
    for (let i = 0; i < framesPerSample; i++) {
      await page.mouse.move(
        box.x + box.width * (0.5 + 0.2 * Math.sin(i / 23)),
        box.y + box.height * (0.5 + 0.05 * Math.cos(i / 31)),
      );
      await page.waitForTimeout(17);
    }
    await page.mouse.up();
  } else {
    await play(page);
    await page.waitForFunction(
      (count) =>
        window.__siloMetrics.frames.length >= count ||
        document.querySelector("canvas")?.dataset.status !== "running",
      framesPerSample,
      { timeout: 60000, polling: 100 },
    );
    await pause(page);
  }
  const data = await page.evaluate(() => ({
    frames: window.__siloMetrics.frames.map((frame) => ({ ...frame })),
    renderer: window.__siloMetrics.renderer,
    geometryBytes: window.__siloMetrics.geometryBytes,
    textureBytes: window.__siloMetrics.textureBytes,
    drawingBuffer: {
      width: document.querySelector("canvas").width,
      height: document.querySelector("canvas").height,
    },
    errors: [...window.__siloMetrics.errors],
  }));
  const frames = data.frames.filter((frame) => frame.activity === activity);
  const result = {
    label,
    activity,
    viewport: page.viewportSize(),
    sampleDurationMs: performance.now() - started,
    frameMs: summarize(frames.map((frame) => frame.ms)),
    cpuRenderMs: summarize(frames.map((frame) => frame.cpuMs)),
    cpuUpdateMs: summarize(frames.map((frame) => frame.updateCpuMs)),
    cpuWholeTickMs: summarize(frames.map((frame) => frame.tickCpuMs)),
    maxCallsIncludingShadows: Math.max(0, ...frames.map((frame) => frame.calls)),
    maxTrianglesIncludingShadows: Math.max(0, ...frames.map((frame) => frame.triangles)),
    maxShadowCallsEstimated: Math.max(0, ...frames.map((frame) => frame.shadowCalls)),
    maxShadowTrianglesEstimated: Math.max(0, ...frames.map((frame) => frame.shadowTriangles)),
    maxPrincipalCalls: Math.max(0, ...frames.map((frame) => frame.calls - frame.shadowCalls)),
    maxPrincipalTriangles: Math.max(
      0,
      ...frames.map((frame) => frame.triangles - frame.shadowTriangles),
    ),
    ...data,
  };
  const mobile = page.viewportSize().width < 900;
  result.targets = {
    activeP95Ms: mobile ? 33.3 : 20,
    measuredWithinFrameTarget:
      result.frameMs.p95 !== null && result.frameMs.p95 <= (mobile ? 33.3 : 20),
    mainCalls100: result.maxPrincipalCalls <= 100,
    mainTriangles250k: result.maxPrincipalTriangles <= 250000,
    quality: frames[0]?.quality ?? "unknown",
    drawCallBudget: frames[0]?.quality === "economic" ? 100 : 150,
    triangleBudget: frames[0]?.quality === "economic" ? 250000 : 400000,
    measuredWithinDrawCallBudget:
      result.maxPrincipalCalls <= (frames[0]?.quality === "economic" ? 100 : 150),
    measuredWithinTriangleBudget:
      result.maxPrincipalTriangles <= (frames[0]?.quality === "economic" ? 250000 : 400000),
  };
  report.samples.push(result);
  assert.ok(
    frames.length >= Math.min(60, framesPerSample / 2),
    `active sample incomplete (${frames.length})`,
  );
  return {
    label,
    frames: frames.length,
    frameMs: result.frameMs,
    cpuRenderMs: result.cpuRenderMs,
    targets: result.targets,
  };
}
async function composition(page) {
  return page.evaluate(() => {
    const stage = document.querySelector(".silo-stage").getBoundingClientRect(),
      header = document.querySelector(".silo-header").getBoundingClientRect();
    const rects = [
      ...document.querySelectorAll(
        ".silo-mode-bar,.silo-tools,.silo-stage-caption,.silo-view-bar,.silo-context-readout,.silo-exit-camera",
      ),
    ]
      .map((node) => node.getBoundingClientRect())
      .filter((r) => r.width > 0 && r.height > 0)
      .map((r) => ({
        x1: Math.max(stage.left, r.left),
        x2: Math.min(stage.right, r.right),
        y1: Math.max(stage.top, r.top),
        y2: Math.min(stage.bottom, r.bottom),
      }));
    const xs = [...new Set(rects.flatMap((r) => [r.x1, r.x2]))].sort((a, b) => a - b);
    let occupied = 0;
    for (let i = 0; i < xs.length - 1; i++) {
      const active = rects
        .filter((r) => r.x1 <= xs[i] && r.x2 >= xs[i + 1])
        .map((r) => [r.y1, r.y2])
        .sort((a, b) => a[0] - b[0]);
      let end = -Infinity,
        total = 0;
      for (const [a, b] of active) {
        if (b > end) total += b - Math.max(a, end);
        end = Math.max(end, b);
      }
      occupied += (xs[i + 1] - xs[i]) * total;
    }
    const usefulArea = innerWidth * (innerHeight - header.height);
    const essential = [
      ...document.querySelectorAll(
        ".silo-mode-bar button,.silo-tools button,.silo-view-bar select,.silo-view-bar button,.silo-transport button,.silo-transport select,.silo-exit-camera",
      ),
    ]
      .map((node) => {
        const r = node.getBoundingClientRect();
        return {
          text: node.getAttribute("aria-label") ?? node.textContent,
          width: r.width,
          height: r.height,
          onScreen:
            r.left >= -1 && r.right <= innerWidth + 1 && r.top >= -1 && r.bottom <= innerHeight + 1,
        };
      })
      .filter((control) => control.width > 0 && control.height > 0);
    return {
      usefulArea,
      canvasArea: stage.width * stage.height,
      occupiedOverlayArea: occupied,
      visibleSceneFraction: (stage.width * stage.height - occupied) / usefulArea,
      essential,
      overflow: document.documentElement.scrollWidth > innerWidth,
    };
  });
}
/** A projected point can be on screen but still behind the intact rear wall.
 * Validate both the real camera matrices and the retained shell half, in
 * addition to the screenshots reviewed by a person. No app state is changed. */
async function incidentInterest(page) {
  return page.evaluate(async () => {
    const T = await import("/node_modules/three/build/three.module.js");
    const { SiloSimulation } = await import("/src/silo-engolfamento/simulation.ts");
    const { SILO_CONFIG } = await import("/src/silo-engolfamento/SiloConfig.ts");
    const simulation = new SiloSimulation();
    simulation.seek(Number(document.querySelector("canvas").dataset.time));
    const frame = simulation.getFrame(),
      metrics = window.__siloMetrics,
      camera = new T.PerspectiveCamera(),
      canvas = document.querySelector("canvas").getBoundingClientRect();
    camera.position.fromArray(metrics.cameraPosition);
    camera.quaternion.fromArray(metrics.cameraQuaternion);
    camera.projectionMatrix.fromArray(metrics.projection);
    camera.updateMatrixWorld(true);
    const overlays = [
      ...document.querySelectorAll(
        ".silo-mode-bar,.silo-tools,.silo-stage-caption,.silo-view-bar,.silo-context-readout,.silo-exit-camera,.silo-inspector",
      ),
    ]
      .map((node) => node.getBoundingClientRect())
      .filter((r) => r.width && r.height);
    const shellOccludes = (point) => {
      const from = camera.position,
        delta = point.clone().sub(from),
        r = SILO_CONFIG.radius.value,
        a = delta.x ** 2 + delta.z ** 2,
        b = 2 * (from.x * delta.x + from.z * delta.z),
        c = from.x ** 2 + from.z ** 2 - r ** 2,
        discriminant = b * b - 4 * a * c;
      if (a < 1e-12 || discriminant < 0) return false;
      for (const t of [
        (-b - Math.sqrt(discriminant)) / (2 * a),
        (-b + Math.sqrt(discriminant)) / (2 * a),
      ]) {
        if (t <= 0.001 || t >= 0.999) continue;
        const hit = from.clone().addScaledVector(delta, t);
        if (hit.y >= 0.18 && hit.y <= SILO_CONFIG.bodyTop.value && hit.z <= 0.701) return true;
      }
      return false;
    };
    const interests = [
      ["A.eye", frame.workers.A.eye],
      ["B.eye", frame.workers.B.eye],
      ["A.dorsal", frame.workers.A.harness],
      ["trolley.eye", frame.connection.anchor],
    ].map(([name, value]) => {
      const point = new T.Vector3(value.x, value.y, value.z),
        projected = point.clone().project(camera),
        x = canvas.left + (projected.x * 0.5 + 0.5) * canvas.width,
        y = canvas.top + (-projected.y * 0.5 + 0.5) * canvas.height;
      return {
        name,
        world: point.toArray(),
        screen: [x, y],
        withinViewport:
          projected.z > -1 &&
          projected.z < 1 &&
          x >= canvas.left + 8 &&
          x <= canvas.right - 8 &&
          y >= canvas.top + 8 &&
          y <= canvas.bottom - 8,
        coveredByUi: overlays.some(
          (r) => x >= r.left && x <= r.right && y >= r.top && y <= r.bottom,
        ),
        behindRetainedShell: shellOccludes(point),
      };
    });
    return { time: frame.time, cameraPosition: metrics.cameraPosition, interests };
  });
}
function assertIncidentInterest(interest) {
  for (const point of interest.interests) {
    assert.ok(
      point.withinViewport,
      `${point.name} outside incident viewport: ${JSON.stringify(interest)}`,
    );
    assert.equal(point.coveredByUi, false, `${point.name} obscured by controls`);
    assert.equal(point.behindRetainedShell, false, `${point.name} hidden by the intact rear shell`);
  }
}
async function touchDrag(page, context, returnToOrigin = false) {
  const box = await page.locator("canvas").boundingBox();
  const x = box.x + box.width * 0.4,
    y = box.y + box.height * 0.42;
  const cdp = await context.newCDPSession(page);
  await cdp.send("Input.dispatchTouchEvent", {
    type: "touchStart",
    touchPoints: [{ x, y, id: 1 }],
  });
  for (let i = 1; i <= 8; i++)
    await cdp.send("Input.dispatchTouchEvent", {
      type: "touchMove",
      touchPoints: [{ x: x + i * 6, y: y + i, id: 1 }],
    });
  if (returnToOrigin)
    await cdp.send("Input.dispatchTouchEvent", {
      type: "touchMove",
      touchPoints: [{ x, y, id: 1 }],
    });
  await cdp.send("Input.dispatchTouchEvent", { type: "touchEnd", touchPoints: [] });
  await cdp.detach();
}

try {
  const desktop = await contextFor(touchOnly ? 390 : 1440, touchOnly ? 844 : 900, touchOnly);
  const page = desktop.page;
  await page.goto(`${base}/mapas-3d/silo-engolfamento`, { waitUntil: "domcontentloaded" });
  await ready(page);
  await check("Public dedicated route, cold/warm readiness and one renderer", async () => {
    assert.equal(await page.locator("canvas").count(), 1);
    const cold = await loading(page, "first-navigation-new-context-development-server");
    assert.ok(cold.explorationMs > 0 && cold.readyMs >= cold.explorationMs);
    await page.reload({ waitUntil: "domcontentloaded" });
    await ready(page);
    const warm = await loading(page, "reload-same-context-browser-cache-enabled");
    await preserveOwner(page);
    return {
      cold: { explorationMs: cold.explorationMs, simulationReadyMs: cold.readyMs },
      warm: { explorationMs: warm.explorationMs, simulationReadyMs: warm.readyMs },
    };
  });
  await preserveOwner(page);
  await check(
    "Component index, focus, isolation, restore and mutually exclusive panels preserve owner",
    async () => {
      await activate(page, "Componentes e estrutura", touchOnly);
      await page.getByRole("button", { name: /Passante curva 30G · 04/ }).click();
      assert.equal((await state(page)).selected, "lvhf.passant.04");
      await activate(page, "Localizar", touchOnly);
      await page.waitForTimeout(1200);
      await activate(page, "Isolar", touchOnly);
      assert.equal(
        await page
          .getByRole("button", { name: "Isolar", exact: true })
          .getAttribute("aria-pressed"),
        "true",
      );
      await shot(page, touchOnly ? "390-passant-inspector" : "1440-passant-inspector");
      await activate(page, "Restaurar conjunto", touchOnly);
      await activate(page, "Exibição e qualidade", touchOnly);
      assert.equal(await page.getByLabel("Buscar componente", { exact: true }).count(), 0);
      assert.equal(await page.getByLabel("Qualidade gráfica", { exact: true }).count(), 1);
      await closeInspector(page, touchOnly);
      await assertOwner(page);
      return await state(page);
    },
  );
  await check("Canvas drag does not select; controls remain operable after gestures", async () => {
    await activate(page, "Enquadrar silo", touchOnly);
    if (touchOnly) await touchDrag(page, desktop.context);
    else {
      const box = await page.locator("canvas").boundingBox();
      await page.mouse.move(box.x + box.width / 2, box.y + box.height / 2);
      await page.mouse.down();
      await page.mouse.move(box.x + box.width / 2 + 120, box.y + box.height / 2 + 25, {
        steps: 12,
      });
      await page.mouse.up();
    }
    assert.equal((await state(page)).panel, "none");
    // Once a gesture has moved, returning to its start is still a drag.
    if (touchOnly) await touchDrag(page, desktop.context, true);
    else {
      const box = await page.locator("canvas").boundingBox();
      const x = box.x + box.width / 2,
        y = box.y + box.height / 2;
      await page.mouse.move(x, y);
      await page.mouse.down();
      await page.mouse.move(x + 100, y, { steps: 8 });
      await page.mouse.move(x, y, { steps: 8 });
      await page.mouse.up();
    }
    assert.equal((await state(page)).panel, "none", "returning drag ended as a component click");
    await activate(page, "Componentes e estrutura", touchOnly);
    assert.equal((await state(page)).panel, "components");
    await closeInspector(page, touchOnly);
    await assertOwner(page);
    return await state(page);
  });
  if (touchOnly)
    await check(
      "Touch timeline stays separate from orbit and immediate keyboard controls",
      async () => {
        await mode(page, "Simulação", true);
        await seek(page, 4);
        await camera(page, "frontal");
        await page.waitForTimeout(1600);
        const before = await page.evaluate(() => ({
          camera: [...window.__siloMetrics.cameraPosition],
          time: Number(document.querySelector('input[aria-label="Instante da simulação"]').value),
        }));
        const box = await page
          .getByRole("slider", { name: "Instante da simulação", exact: true })
          .boundingBox();
        const cdp = await desktop.context.newCDPSession(page);
        await cdp.send("Input.dispatchTouchEvent", {
          type: "touchStart",
          touchPoints: [{ x: box.x + box.width * 0.3, y: box.y + box.height * 0.5, id: 1 }],
        });
        await cdp.send("Input.dispatchTouchEvent", {
          type: "touchMove",
          touchPoints: [{ x: box.x + box.width * 0.65, y: box.y + box.height * 0.5, id: 1 }],
        });
        await cdp.send("Input.dispatchTouchEvent", { type: "touchEnd", touchPoints: [] });
        await cdp.detach();
        await page.waitForTimeout(350);
        const after = await page.evaluate(() => ({
          camera: [...window.__siloMetrics.cameraPosition],
          time: Number(document.querySelector('input[aria-label="Instante da simulação"]').value),
        }));
        assert.notEqual(after.time, before.time, "touch scrub must change the instant");
        assert.ok(
          Math.hypot(...after.camera.map((value, index) => value - before.camera[index])) < 0.03,
          "touch scrub moved orbit",
        );
        await touchDrag(page, desktop.context);
        assert.equal((await state(page)).time, after.time, "canvas gesture scrubbed the timeline");
        const options = page.getByRole("button", { name: "Exibição e qualidade", exact: true });
        await options.focus();
        await page.keyboard.press("Enter");
        await page.getByLabel("Qualidade gráfica", { exact: true }).waitFor({ state: "visible" });
        await page.keyboard.press("Escape");
        assert.equal((await state(page)).panel, "none");
        await mode(page, "Explorar", true);
        await assertOwner(page);
        return { before, after, keyboardAfterTouch: true };
      },
    );
  await check("LVHF one circuit and reverse seek do not recreate scene", async () => {
    await mode(page, "Sistema LVHF", touchOnly);
    await seek(page, 79.8);
    await shot(page, touchOnly ? "390-lvhf-ring" : "1440-lvhf-ring");
    await seek(page, 0.2);
    assert.ok((await state(page)).time < 0.21);
    await assertOwner(page);
    return await state(page);
  });
  await check(
    "Scene selection resolves the same support ID through the technical cut",
    async () => {
      await closeInspector(page, touchOnly);
      await mode(page, "Sistema LVHF", touchOnly);
      await activate(page, "Componentes e estrutura", touchOnly);
      await page.getByRole("button", { name: /Passante curva 30G · 04/ }).click();
      await activate(page, "Localizar", touchOnly);
      await page.waitForTimeout(1600);
      const beforePanelClose = await page
        .locator(".silo-selection-marker")
        .evaluate((marker) => Number.parseFloat(marker.style.top) + 45);
      await closeInspector(page, touchOnly);
      await page.waitForTimeout(1200);
      const point = await page.locator(".silo-selection-marker").evaluate((marker) => ({
        x: Number.parseFloat(marker.style.left),
        y: Number.parseFloat(marker.style.top) + 45,
        hidden: marker.hidden,
      }));
      assert.equal(point.hidden, false, "focused support marker is outside the free viewport");
      const projectedTarget = await page.evaluate(async () => {
        const T = await import("/node_modules/three/build/three.module.js"),
          metrics = window.__siloMetrics;
        const camera = new T.PerspectiveCamera();
        camera.position.fromArray(metrics.cameraPosition);
        camera.quaternion.fromArray(metrics.cameraQuaternion);
        camera.projectionMatrix.fromArray(metrics.projection);
        camera.updateMatrixWorld(true);
        const p = new T.Vector3().fromArray(metrics.cameraTarget).project(camera),
          canvas = document.querySelector("canvas").getBoundingClientRect();
        return { x: (p.x * 0.5 + 0.5) * canvas.width, y: (-p.y * 0.5 + 0.5) * canvas.height };
      });
      assert.ok(
        Math.hypot(point.x - projectedTarget.x, point.y - projectedTarget.y) < 3,
        `marker retained a stale panel projection ${JSON.stringify({ point, projectedTarget })}`,
      );
      if (touchOnly)
        assert.ok(
          Math.abs(point.y - beforePanelClose) > 40,
          "bottom-sheet close must immediately move the idle label to its new projection",
        );
      await shot(page, `${touchOnly ? "390" : "1440"}-before-scene-pick-passant04`);
      report.scenePick = {
        point,
        camera: await page.evaluate(() => ({
          position: window.__siloMetrics.cameraPosition,
          target: window.__siloMetrics.cameraTarget,
          projection: window.__siloMetrics.projection,
        })),
      };
      if (touchOnly) await page.locator("canvas").tap({ position: { x: point.x, y: point.y } });
      else await page.locator("canvas").click({ position: { x: point.x, y: point.y } });
      await page.getByRole("complementary", { name: "Inspetor técnico" }).waitFor();
      assert.equal((await state(page)).selected, "lvhf.passant.04");
      await shot(page, `${touchOnly ? "390" : "1440"}-scene-selected-passant04`);
      await closeInspector(page, touchOnly);
      await assertOwner(page);
      return { ...(await state(page)), point };
    },
  );
  await check(
    "Inspection presets reveal roof, manhole, anchor, trolley and dorsal at physical scale",
    async () => {
      await mode(page, "Explorar", touchOnly);
      for (const preset of [
        "general",
        "internal",
        "ring",
        "trolley",
        "anchor",
        "dorsal",
        "manhole",
      ]) {
        await inspectionView(page, preset);
        await page.waitForTimeout(1500);
        await shot(page, `${touchOnly ? "390" : "1440"}-inspection-${preset}`);
      }
      await assertOwner(page);
      return await state(page);
    },
  );
  await check(
    "Trolley following enters from the general view and clears the closed shell around all supports",
    async () => {
      await closeInspector(page, touchOnly);
      await mode(page, "Sistema LVHF", touchOnly);
      await seek(page, 0);
      await inspectionView(page, "general");
      await page.waitForTimeout(1600);
      await activate(page, "Exibição e qualidade", touchOnly);
      await page
        .getByRole("button", { name: "Acompanhar trole", exact: true })
        .evaluate((button) => {
          button.addEventListener(
            "pointerdown",
            () => {
              window.__followOpening = [];
              const record = (atMs) => {
                const m = window.__siloMetrics,
                  p = m.cameraPosition,
                  t = m.cameraTarget;
                window.__followOpening.push({
                  atMs,
                  distance: Math.hypot(...p.map((value, i) => value - t[i])),
                  position: [...p],
                });
                if (window.__followOpening.length < 12) requestAnimationFrame(record);
              };
              record(performance.now());
            },
            { once: true },
          );
        });
      await activate(page, "Acompanhar trole", touchOnly);
      await closeInspector(page, touchOnly);
      await page.waitForFunction(() => window.__followOpening?.length >= 12);
      const opening = await page.evaluate(() => window.__followOpening);
      report.followOpening = opening;
      for (let i = 1; i < opening.length; i++) {
        if (opening[i - 1].distance > 20)
          assert.ok(
            opening[i].distance >= opening[i - 1].distance * 0.6,
            `orbit maximum caused an abrupt opening jump ${JSON.stringify(opening)}`,
          );
      }
      const samples = [];
      for (const instant of [
        ...Array.from({ length: 11 }, (_, i) => Math.round((i * 80 * 10) / 11) / 10),
        79.9,
        0.1,
      ]) {
        await seek(page, instant);
        await page.waitForTimeout(1400);
        const pose = await page.evaluate(() => ({
          position: [...window.__siloMetrics.cameraPosition],
          target: [...window.__siloMetrics.cameraTarget],
          mode: window.__siloMetrics.controllerCamera,
        }));
        const distance = Math.hypot(...pose.position.map((value, i) => value - pose.target[i]));
        assert.ok(
          Math.abs(distance - 1.15) < 0.02,
          `inherited orbit limits enlarged trolley distance to ${distance}m`,
        );
        assert.ok(
          Math.hypot(pose.position[0], pose.position[2]) < 11,
          "trolley following crossed the opaque shell",
        );
        assert.ok(pose.position[1] < 24.88, "closeup must stay below the closed roof");
        assert.equal(pose.mode, "frontal");
        samples.push({ instant, ...pose, distance });
        if ([0, 5, 10].includes(samples.length - 1))
          await shot(page, `${touchOnly ? "390" : "1440"}-follow-support-${samples.length - 1}`);
      }
      const before = samples.at(-2).position,
        after = samples.at(-1).position;
      assert.ok(
        Math.hypot(...before.map((value, i) => value - after[i])) < 0.18,
        "following jumps at the angular seam",
      );
      await activate(page, "Exibição e qualidade", touchOnly);
      await activate(page, "Parar acompanhamento", touchOnly);
      await closeInspector(page, touchOnly);
      await assertOwner(page);
      return { opening, samples, uiSeekResolutionSeconds: 0.1 };
    },
  );
  await check(
    "Structure index restores a closed roof, opens the real manhole and exposes the isolated floor",
    async () => {
      await closeInspector(page, touchOnly);
      await mode(page, "Sistema LVHF", touchOnly);
      const results = [];
      for (const [id, name] of [
        ["structure.roof", "Chapéu segmentado"],
        ["structure.manhole", "Boca de visita e tampa"],
        ["structure.floor", "Piso interno plano"],
        ["structure.extraction", "Canal e saída de inspeção"],
      ]) {
        await activate(page, "Componentes e estrutura", touchOnly);
        await activate(page, "Estrutura do silo", touchOnly);
        await page.getByRole("button", { name: new RegExp(`^${name}`) }).click();
        assert.equal((await state(page)).selected, id);
        await activate(page, "Localizar", touchOnly);
        const subfloor = id === "structure.floor" || id === "structure.extraction";
        if (subfloor) await activate(page, "Isolar", touchOnly);
        if (!subfloor) await closeInspector(page, touchOnly);
        await page.waitForTimeout(1600);
        if (subfloor) {
          const visible = (await state(page)).metrics;
          assert.equal(visible.isolatedId, id);
          assert.deepEqual(
            visible.workerVisible,
            { A: false, B: false },
            "hidden grain inspection must not leave a technician floating above the floor",
          );
          assert.equal(visible.ropeVisible, false);
        }
        await shot(page, `${touchOnly ? "390" : "1440"}-index-${id.replace("structure.", "")}`);
        results.push(await state(page));
        if (subfloor) {
          await activate(page, "Restaurar conjunto", touchOnly);
          await closeInspector(page, touchOnly);
        }
      }
      await assertOwner(page);
      return results;
    },
  );
  await check("Selecting another component restores the previous isolation", async () => {
    await closeInspector(page, touchOnly);
    await mode(page, "Explorar", touchOnly);
    await activate(page, "Componentes e estrutura", touchOnly);
    await activate(page, "Estrutura do silo", touchOnly);
    await page.getByRole("button", { name: /^Chapéu segmentado/ }).click();
    await activate(page, "Isolar", touchOnly);
    assert.equal(
      await page.getByRole("button", { name: "Isolar", exact: true }).getAttribute("aria-pressed"),
      "true",
    );
    await page.getByRole("button", { name: /^Fundação e plinto/ }).click();
    assert.equal((await state(page)).selected, "structure.foundation");
    assert.equal(
      await page.getByRole("button", { name: "Isolar", exact: true }).getAttribute("aria-pressed"),
      "false",
    );
    await page.waitForTimeout(1600);
    await shot(page, `${touchOnly ? "390" : "1440"}-selection-restores-isolation-foundation`);
    await closeInspector(page, touchOnly);
    await assertOwner(page);
    return await state(page);
  });
  await check(
    "Following the trolley exits first-person without advancing or resetting time",
    async () => {
      await closeInspector(page, touchOnly);
      await mode(page, "Simulação", touchOnly);
      await seek(page, 4);
      await camera(page, "connected");
      await activate(page, "Exibição e qualidade", touchOnly);
      const before = (await state(page)).time;
      await activate(page, "Acompanhar trole", touchOnly);
      await closeInspector(page, touchOnly);
      await page.waitForTimeout(350);
      assert.equal((await state(page)).canvas.camera, "frontal");
      assert.equal((await state(page)).metrics.controllerCamera, "frontal");
      assert.equal((await state(page)).time, before);
      assert.equal(
        await page.getByRole("button", { name: "Sair da primeira pessoa", exact: true }).count(),
        0,
      );
      await activate(page, "Voltar à vista anterior", touchOnly);
      await page.waitForTimeout(250);
      assert.equal(
        (await state(page)).canvas.camera,
        "connected",
        "previous first-person mode must be remembered before following",
      );
      assert.equal((await state(page)).time, before);
      await activate(page, "Exibição e qualidade", touchOnly);
      await activate(page, "Parar acompanhamento", touchOnly);
      await closeInspector(page, touchOnly);
      await camera(page, "connected");
      await play(page);
      await page.waitForTimeout(250);
      const playingBefore = (await state(page)).time;
      await activate(page, "Exibição e qualidade", touchOnly);
      await activate(page, "Acompanhar trole", touchOnly);
      await closeInspector(page, touchOnly);
      await page.waitForTimeout(350);
      await pause(page);
      const after = await state(page);
      assert.equal(after.canvas.camera, "frontal");
      assert.equal(after.metrics.controllerCamera, "frontal");
      assert.ok(
        after.time >= playingBefore && after.time < playingBefore + 3,
        "following unexpectedly reset or jumped playback",
      );
      await activate(page, "Voltar à vista anterior", touchOnly);
      await page.waitForTimeout(250);
      assert.equal((await state(page)).canvas.camera, "connected");
      assert.equal((await state(page)).time, after.time);
      await activate(page, "Exibição e qualidade", touchOnly);
      await activate(page, "Parar acompanhamento", touchOnly);
      await closeInspector(page, touchOnly);
      await assertOwner(page);
      return { pausedTime: before, playingBefore, playingAfter: after.time };
    },
  );
  await check(
    "Hidden-grain inspection is restored per mode without floating rigs or rope",
    async () => {
      await closeInspector(page, touchOnly);
      await mode(page, "Simulação", touchOnly);
      await seek(page, 8);
      await mode(page, "Explorar", touchOnly);
      await activate(page, "Componentes e estrutura", touchOnly);
      await activate(page, "Estrutura do silo", touchOnly);
      await page.getByRole("button", { name: /^Piso interno plano/ }).click();
      await closeInspector(page, touchOnly);
      await page.waitForTimeout(250);
      const floor = await state(page);
      assert.equal(floor.metrics.grainsVisible, false);
      assert.deepEqual(floor.metrics.workerVisible, { A: false, B: false });
      assert.equal(floor.metrics.ropeVisible, false);
      const transitions = [];
      for (const next of ["Simulação", "Sistema LVHF"]) {
        await mode(page, next, touchOnly);
        await page.waitForTimeout(250);
        const visible = await state(page);
        assert.equal(visible.metrics.grainsVisible, true);
        assert.deepEqual(visible.metrics.workerVisible, { A: true, B: true });
        assert.equal(visible.metrics.ropeVisible, true);
        if (next === "Simulação")
          assert.equal(visible.time, 8, "inspection must preserve the saved incident time");
        transitions.push(visible);
        await mode(page, "Explorar", touchOnly);
        await page.waitForTimeout(250);
        assert.equal(
          (await state(page)).metrics.grainsVisible,
          false,
          "exploration must restore its own hidden-grain bookmark",
        );
      }
      await mode(page, "Simulação", touchOnly);
      await camera(page, "connected");
      await mode(page, "Sistema LVHF", touchOnly);
      await page.waitForTimeout(250);
      assert.equal(
        (await state(page)).canvas.camera,
        "frontal",
        "entering LVHF from first-person must synchronize the camera authority",
      );
      assert.equal((await state(page)).metrics.controllerCamera, "frontal");
      await mode(page, "Explorar", touchOnly);
      await activate(page, "Componentes e estrutura", touchOnly);
      await activate(page, "Componentes do sistema", touchOnly);
      await page.getByRole("button", { name: /^Corda de conexão/ }).click();
      await page.waitForTimeout(250);
      assert.equal(
        (await state(page)).metrics.grainsVisible,
        true,
        "system selection must reveal its connected technician again",
      );
      assert.equal((await state(page)).metrics.ropeVisible, true);
      await activate(page, "Estrutura do silo", touchOnly);
      await page.getByRole("button", { name: /^Piso interno plano/ }).click();
      await activate(page, "Restaurar conjunto", touchOnly);
      await closeInspector(page, touchOnly);
      await page.waitForTimeout(250);
      assert.equal((await state(page)).metrics.grainsVisible, true);
      await assertOwner(page);
      return { floor, transitions };
    },
  );
  await check("Incident seek, all four cameras, quality and clipping keep time", async () => {
    await mode(page, "Simulação", touchOnly);
    await seek(page, 12);
    const before = (await state(page)).time;
    for (const id of ["frontal", "top", "connected", "victim"]) {
      await camera(page, id);
      await page.waitForTimeout(id === "frontal" || id === "top" ? 1400 : 250);
      await shot(page, `${touchOnly ? "390" : "1440"}-incident-${id}`);
      assert.equal((await state(page)).time, before);
    }
    await activate(page, "Exibição e qualidade", touchOnly);
    await page.getByLabel("Qualidade gráfica", { exact: true }).selectOption("economic");
    await closeInspector(page, touchOnly);
    await viewCommand(page, "Corte");
    assert.equal((await state(page)).time, before);
    await assertOwner(page);
    return await state(page);
  });
  await check(
    "Walking, support loss, restraint, engulfment and reverse seek stay inspectable",
    async () => {
      await mode(page, "Simulação", touchOnly);
      await camera(page, "frontal");
      const interests = [];
      for (const instant of [4, 8, 12, 25, 4]) {
        await seek(page, instant);
        await page.waitForTimeout(instant === 4 ? 1400 : 250);
        await shot(page, `${touchOnly ? "390" : "1440"}-incident-time-${instant}`);
        assert.ok(
          (await state(page)).metrics.dorsalError < 0.005,
          "dorsal endpoint exceeds 5 mm measured tolerance",
        );
        if (instant === 4 || instant === 12) {
          const interest = await incidentInterest(page);
          assertIncidentInterest(interest);
          interests.push(interest);
        }
      }
      return { ...(await state(page)), interests };
    },
  );
  await check(
    "First-person picking respects the opaque shell while section is requested",
    async () => {
      await mode(page, "Simulação", touchOnly);
      await seek(page, 4);
      await setSectionCut(page, true);
      await camera(page, "connected");
      await page.waitForTimeout(300);
      const box = await page.locator("canvas").boundingBox();
      const x = box.x + 15,
        y = box.y + box.height * 0.5;
      // A faces B along the ring. Turn toward +Z, the half removed only in the
      // technical section; first-person correctly renders that shell opaque.
      await page.mouse.move(x, y);
      await page.mouse.down();
      await page.mouse.move(x + Math.min(380, box.width - 30), y, { steps: 16 });
      await page.mouse.up();
      await page.waitForTimeout(250);
      await page.mouse.click(box.x + box.width * 0.5, y);
      await page.waitForTimeout(200);
      assert.equal(
        (await state(page)).selected,
        "structure.shell",
        "a visible opaque wall must block selection through the cut half in first-person",
      );
      await shot(page, `${touchOnly ? "390" : "1440"}-first-person-shell-picking`);
      await closeInspector(page, touchOnly);
      await camera(page, "frontal");
      await assertOwner(page);
      return await state(page);
    },
  );
  await check("First-person exit survives full engulfment, panel and reverse seek", async () => {
    await camera(page, "victim");
    await seek(page, 25);
    await page.waitForTimeout(250);
    assert.equal((await state(page)).canvas.occluded, "true");
    await activate(page, "Componentes e estrutura", touchOnly);
    await closeInspector(page, touchOnly);
    await shot(page, `${touchOnly ? "390" : "1440"}-victim-occluded`);
    await activate(page, "Sair da primeira pessoa", touchOnly);
    // CDP touch dispatch can finish before the invalidated on-demand frame.
    // Observe that frame's camera contract rather than the previous dataset.
    await page.waitForFunction(
      () => document.querySelector("canvas")?.dataset.camera === "frontal",
    );
    assert.equal((await state(page)).canvas.camera, "frontal");
    await seek(page, 4);
    await assertOwner(page);
    return await state(page);
  });
  await check(
    "Returning to exploration restores its camera bookmark without autoplay",
    async () => {
      await mode(page, "Explorar", touchOnly);
      await activate(page, "Enquadrar silo", touchOnly);
      await page.waitForTimeout(1600);
      if (touchOnly) await touchDrag(page, desktop.context);
      else {
        const box = await page.locator("canvas").boundingBox();
        await page.mouse.move(box.x + box.width * 0.45, box.y + box.height * 0.5);
        await page.mouse.down();
        await page.mouse.move(box.x + box.width * 0.65, box.y + box.height * 0.5, { steps: 12 });
        await page.mouse.up();
      }
      await page.waitForTimeout(1600);
      const before = await page.evaluate(() => ({
        position: [...window.__siloMetrics.cameraPosition],
        target: [...window.__siloMetrics.cameraTarget],
      }));
      await mode(page, "Simulação", touchOnly);
      await seek(page, 10);
      await mode(page, "Explorar", touchOnly);
      await page.waitForTimeout(1800);
      const after = await page.evaluate(() => ({
        position: [...window.__siloMetrics.cameraPosition],
        target: [...window.__siloMetrics.cameraTarget],
      }));
      const distance = (a, b) => Math.hypot(...a.map((value, index) => value - b[index]));
      assert.ok(
        distance(before.position, after.position) < 0.03 &&
          distance(before.target, after.target) < 0.03,
        `bookmark drift ${JSON.stringify({ before, after })}`,
      );
      await mode(page, "Simulação", touchOnly);
      assert.notEqual((await state(page)).canvas.status, "running");
      await mode(page, "Explorar", touchOnly);
      await assertOwner(page);
      return { before, after, toleranceMetres: 0.03 };
    },
  );
  await check("Scene occupancy, panels and targets at required viewport sizes", async () => {
    const sizes = touchOnly
      ? [
          [390, 844],
          [844, 390],
        ]
      : [
          [390, 844],
          [844, 390],
          [1366, 768],
          [1440, 900],
        ];
    const results = [];
    await mode(page, "Explorar", touchOnly);
    for (const [width, height] of sizes) {
      await page.setViewportSize({ width, height });
      await page.waitForTimeout(700);
      await activate(page, "Enquadrar silo", touchOnly);
      await page.waitForTimeout(900);
      const closed = await composition(page);
      await shot(page, `${width}x${height}-external`);
      assert.equal(closed.overflow, false, `${width} horizontal overflow`);
      assert.ok(
        closed.visibleSceneFraction >= (width > 900 ? 0.8 : 0.75),
        `${width} scene fraction ${closed.visibleSceneFraction}`,
      );
      assert.ok(
        closed.essential.every(
          (control) => control.onScreen && control.width >= 43 && control.height >= 43,
        ),
        `${width} essential control clipped/undersized: ${JSON.stringify(closed.essential.filter((control) => !control.onScreen || control.width < 43 || control.height < 43))}`,
      );
      await activate(page, "Componentes e estrutura", touchOnly);
      await page.waitForTimeout(300);
      const panel = await page
        .getByRole("complementary", { name: "Inspetor técnico" })
        .boundingBox();
      if (width <= height)
        assert.ok(
          panel.height <= height * 0.43,
          `mobile sheet initially occupies ${panel.height / height}`,
        );
      await shot(page, `${width}x${height}-panel`);
      if (width <= height) {
        await activate(page, "Expandir detalhes", touchOnly);
        const expanded = await page
          .getByRole("complementary", { name: "Inspetor técnico" })
          .boundingBox();
        assert.ok(
          expanded.height > panel.height && expanded.height <= height * 0.9,
          "explicit expanded mobile sheet must increase readable height while retaining close control",
        );
        await shot(page, `${width}x${height}-panel-expanded`);
        await activate(page, "Recolher detalhes", touchOnly);
      }
      await closeInspector(page, touchOnly);
      await mode(page, "Simulação", touchOnly);
      await seek(page, 4);
      await camera(page, "frontal");
      await page.waitForTimeout(1600);
      const preincidentRoi = await incidentInterest(page);
      assertIncidentInterest(preincidentRoi);
      await shot(page, `${width}x${height}-preincident-frontal`);
      await seek(page, 12);
      await camera(page, "frontal");
      await page.waitForTimeout(1600);
      const incident = await composition(page);
      const incidentRoi = await incidentInterest(page);
      assertIncidentInterest(incidentRoi);
      await shot(page, `${width}x${height}-incident-layout`);
      await camera(page, "victim");
      const firstPerson = await composition(page);
      await shot(page, `${width}x${height}-first-person-layout`);
      const required = width > 900 ? 0.8 : 0.75;
      for (const [label, layout] of [
        ["incident", incident],
        ["first-person", firstPerson],
      ]) {
        assert.ok(
          layout.visibleSceneFraction >= required,
          `${width} ${label} net scene fraction ${layout.visibleSceneFraction}`,
        );
        assert.ok(
          layout.essential.every(
            (control) => control.onScreen && control.width >= 43 && control.height >= 43,
          ),
          `${width} ${label} essential control clipped/undersized`,
        );
      }
      await activate(page, "Sair da primeira pessoa", touchOnly);
      await mode(page, "Explorar", touchOnly);
      results.push({
        width,
        height,
        explore: closed,
        preincidentRoi,
        incident,
        incidentRoi,
        firstPerson,
        panel,
      });
    }
    await assertOwner(page);
    return results;
  });
  if (!touchOnly) {
    await check(
      "One continuous LVHF replay completes a full eighty-second circuit without seeks",
      async () => {
        await closeInspector(page);
        await mode(page, "Sistema LVHF");
        await seek(page, 0);
        await inspectionView(page, "general");
        await activate(page, "Exibição e qualidade");
        await page.getByLabel("Qualidade gráfica", { exact: true }).selectOption("economic");
        await activate(page, "Acompanhar trole");
        await closeInspector(page);
        await page.waitForTimeout(1600);
        await page.getByLabel("Velocidade de reprodução", { exact: true }).selectOption("1");
        const origin = await page.evaluate(() => [...window.__siloMetrics.cameraPosition]);
        await page.bringToFront();
        await page.evaluate(() => {
          window.__upgradeReplayVisibility = [];
          window.__upgradeReplayVisibilityListener = () => {
            window.__upgradeReplayVisibility.push({
              atMs: performance.now(),
              hidden: document.hidden,
            });
          };
          document.addEventListener("visibilitychange", window.__upgradeReplayVisibilityListener);
        });
        await play(page);
        const started = performance.now(),
          checkpoints = [],
          thresholds = [16, 32, 48, 64, 80];
        try {
          for (let i = 0; i < 27; i++) {
            await page.waitForTimeout(4000);
            const point = await page.evaluate(() => ({
              time: Number(document.querySelector("canvas").dataset.time),
              status: document.querySelector("canvas").dataset.status,
              position: [...window.__siloMetrics.cameraPosition],
              target: [...window.__siloMetrics.cameraTarget],
              dorsalError: window.__siloMetrics.dorsalError,
              statusReason: window.__siloMetrics.statusReason,
              hidden: document.hidden,
              visibilityEvents: [...window.__upgradeReplayVisibility],
              frameTail: window.__siloMetrics.frames.slice(-6).map((frame) => ({
                ms: frame.ms,
                tickCpuMs: frame.tickCpuMs,
                updateCpuMs: frame.updateCpuMs,
              })),
            }));
            assert.notEqual(
              point.status,
              "paused",
              `Continuous replay paused: ${JSON.stringify(point)}`,
            );
            assert.ok(
              point.time >= (checkpoints.at(-1)?.time ?? 0),
              "playback rewound without a seek",
            );
            assert.ok(
              Math.hypot(point.position[0], point.position[2]) < 11,
              "continuous following crossed the closed shell",
            );
            assert.ok(point.dorsalError < 0.005);
            checkpoints.push(point);
            if (point.time >= thresholds[0]) {
              const threshold = thresholds.shift();
              console.log(`ACTIVE CIRCUIT ${point.time.toFixed(1)}s / 80s; ${point.status}`);
              await shot(page, `1440-active-circuit-${threshold}`);
            }
            if (point.status === "completed") break;
          }
        } finally {
          await page.evaluate(() => {
            document.removeEventListener(
              "visibilitychange",
              window.__upgradeReplayVisibilityListener,
            );
          });
        }
        const last = checkpoints.at(-1);
        assert.equal(last.time, 80);
        assert.equal(last.status, "completed");
        await page.waitForTimeout(1600);
        const end = await page.evaluate(() => [...window.__siloMetrics.cameraPosition]);
        const closureError = Math.hypot(...origin.map((value, i) => value - end[i]));
        assert.ok(
          closureError < 0.005,
          `following did not close the real replay: ${closureError}m`,
        );
        await assertOwner(page);
        return {
          wallDurationMs: performance.now() - started,
          commandsDuringPlayback: [
            "Read state and capture screenshots; no seek/camera/quality commands",
          ],
          checkpoints,
          closureError,
        };
      },
    );
    await page.setViewportSize({ width: 1440, height: 900 });
    await check("Active desktop navigation performance", async () => {
      await mode(page, "Explorar");
      await activate(page, "Enquadrar silo");
      await page.waitForTimeout(1000);
      return sample(page, "desktop-external-navigation-economic", "navigation", true);
    });
    await check("Active desktop incident performance", async () => {
      await mode(page, "Simulação");
      await seek(page, 7);
      await camera(page, "frontal");
      await page.waitForTimeout(1500);
      await page.getByLabel("Velocidade de reprodução", { exact: true }).selectOption(".5");
      return sample(page, "desktop-incident-economic", "playback");
    });
    await check("Active trolley closeup performance", async () => {
      await mode(page, "Sistema LVHF");
      await inspectionView(page, "trolley");
      await page.waitForTimeout(1200);
      return sample(page, "desktop-trolley-closeup-economic", "navigation", true);
    });
    await check("Additional balanced and high profile incident performance", async () => {
      const results = [];
      await mode(page, "Simulação");
      await camera(page, "frontal");
      for (const quality of ["balanced", "high"]) {
        await seek(page, 7);
        const before = (await state(page)).time;
        await activate(page, "Exibição e qualidade");
        await page.getByLabel("Qualidade gráfica", { exact: true }).selectOption(quality);
        await closeInspector(page);
        assert.equal((await state(page)).time, before, "quality command changed domain time");
        await page.getByLabel("Velocidade de reprodução", { exact: true }).selectOption(".5");
        results.push(await sample(page, `desktop-incident-${quality}`, "playback"));
      }
      await activate(page, "Exibição e qualidade");
      await page.getByLabel("Qualidade gráfica", { exact: true }).selectOption("economic");
      await closeInspector(page);
      return results;
    });
    await check(
      "Active mobile viewport navigation, playback and closeup measurements",
      async () => {
        const phone = await contextFor(390, 844, true),
          p = phone.page;
        await p.goto(`${base}/mapas-3d/silo-engolfamento`);
        await ready(p);
        await loading(p, "390x844-touch-emulation-cold-context");
        await activate(p, "Exibição e qualidade", true);
        await p.getByLabel("Qualidade gráfica", { exact: true }).selectOption("economic");
        await closeInspector(p, true);
        const samples = [];
        await activate(p, "Enquadrar silo", true);
        await p.waitForTimeout(1500);
        samples.push(
          await sample(p, "390x844-touch-emulation-navigation-economic", "navigation", true),
        );
        await mode(p, "Simulação", true);
        await seek(p, 7);
        await camera(p, "frontal");
        await p.waitForTimeout(1500);
        await p.getByLabel("Velocidade de reprodução", { exact: true }).selectOption(".5");
        samples.push(await sample(p, "390x844-touch-emulation-incident-economic", "playback"));
        await mode(p, "Sistema LVHF", true);
        await inspectionView(p, "trolley");
        await p.waitForTimeout(1500);
        samples.push(
          await sample(p, "390x844-touch-emulation-closeup-economic", "navigation", true),
        );
        await p.close();
        activePage = page;
        return { hardware: "Chromium touch emulation only", samples };
      },
    );
    await check("Idle renderer stops submitting active frames", async () => {
      await mode(page, "Explorar");
      await page.waitForTimeout(2000);
      const before = await page.evaluate(() => window.__siloMetrics.renderCount);
      await page.waitForTimeout(1100);
      const after = await page.evaluate(() => window.__siloMetrics.renderCount);
      assert.equal(after, before);
      return { renderCountBefore: before, renderCountAfter: after, idleMs: 1100 };
    });
    await check(
      "Prevention mode visibly blocks entry and returns to the same independent scene",
      async () => {
        await mode(page, "Simulação");
        await seek(page, 4);
        await activate(page, "Indicadores dos técnicos");
        await activate(page, "Ver prevenção");
        await seek(page, 20);
        assert.match(await page.locator(".silo-stage-caption").textContent(), /ENTRADA IMPEDIDA/);
        assert.notEqual((await state(page)).canvas.status, "running");
        await shot(page, "1440-prevention");
        await mode(page, "Explorar");
        await assertOwner(page);
        return await state(page);
      },
    );
    await check(
      "Technical reading pauses and hidden-tab handler requires explicit resume",
      async () => {
        await mode(page, "Simulação");
        await seek(page, 8);
        await play(page);
        await page.waitForTimeout(400);
        await activate(page, "Fontes e critérios");
        await page.waitForFunction(() =>
          document.querySelector(".silo-primary")?.textContent?.includes("Continuar"),
        );
        await page.waitForTimeout(200);
        const reading = await state(page);
        assert.equal(reading.canvas.status, "paused");
        await page.waitForTimeout(300);
        assert.equal((await state(page)).time, reading.time);
        await page.keyboard.press("Escape");
        assert.equal((await state(page)).dialogs, 0);
        await play(page);
        await page.waitForTimeout(300);
        await page.evaluate(() => {
          Object.defineProperty(document, "hidden", { configurable: true, get: () => true });
          document.dispatchEvent(new Event("visibilitychange"));
        });
        const hidden = await state(page);
        assert.match(
          await page.locator(".silo-primary").textContent(),
          /Continuar/,
          "hidden handler must pause the domain; rendering is suspended so its dataset may be stale",
        );
        await page.waitForTimeout(350);
        await page.evaluate(() => {
          delete document.hidden;
          document.dispatchEvent(new Event("visibilitychange"));
        });
        assert.equal((await state(page)).time, hidden.time);
        await play(page);
        await page.waitForTimeout(350);
        await pause(page);
        assert.ok((await state(page)).time > hidden.time);
        return {
          reading,
          hidden,
          method: "Synthetic visibilitychange; no physical background-tab claim",
        };
      },
    );
    await check("Context loss pauses, restore preserves owner and time", async () => {
      await mode(page, "Simulação");
      await seek(page, 9);
      for (const id of ["connected", "victim", "frontal"]) {
        await camera(page, id);
        await page.waitForTimeout(250);
      }
      const supported = await page.evaluate(() => {
        const canvas = document.querySelector("canvas"),
          gl = canvas.getContext("webgl2") ?? canvas.getContext("webgl");
        window.__upgradeLoss = gl.getExtension("WEBGL_lose_context");
        if (!window.__upgradeLoss) return false;
        window.__upgradeLoss.loseContext();
        return true;
      });
      assert.ok(supported, "WEBGL_lose_context unavailable; recovery not verified");
      await page.getByText("Visualização pausada", { exact: true }).waitFor();
      const lost = await state(page);
      await page.waitForTimeout(300);
      await page.evaluate(() => window.__upgradeLoss.restoreContext());
      await ready(page);
      await assertOwner(page);
      assert.equal((await state(page)).time, lost.time);
      return { lost, restored: await state(page) };
    });
    await check("Library stays lazy and repeated reentry disposes the prior owner", async () => {
      for (let cycle = 0; cycle < 2; cycle++) {
        await preserveOwner(page);
        await page.getByRole("link", { name: "Voltar à biblioteca", exact: true }).click();
        await page.waitForURL("**/mapas-3d/unidades");
        assert.equal(
          await page.evaluate(
            () =>
              window.__upgradeOwner.metrics.disposed && !window.__upgradeOwner.canvas.isConnected,
          ),
          true,
        );
        await page.waitForSelector("canvas", { state: "detached" });
        assert.equal(await page.locator("canvas").count(), 0);
        await page
          .getByRole("link")
          .filter({ hasText: /Silo.*LVHF|Silo.*engolfamento/i })
          .first()
          .click();
        await ready(page);
        assert.equal(
          await page.evaluate(
            () =>
              window.__upgradeOwner.metrics !== window.__siloMetrics &&
              !window.__siloMetrics.disposed,
          ),
          true,
        );
      }
      await preserveOwner(page);
      return await state(page);
    });
    await check(
      "GLB 404 exposes a recoverable error and retry aborts the failed owner",
      async () => {
        const failure = await contextFor(1366, 768);
        const p = failure.page;
        await p.route("**/models/silo-engolfamento/worker-b.glb", (route) =>
          route.fulfill({ status: 404, body: "missing test asset" }),
        );
        await p.goto(`${base}/mapas-3d/silo-engolfamento`);
        await p.getByText("Visualização indisponível", { exact: true }).waitFor({ timeout: 60000 });
        await preserveOwner(p);
        await p.unroute("**/models/silo-engolfamento/worker-b.glb");
        await activate(p, "Tentar novamente em qualidade leve");
        await ready(p);
        assert.equal(
          await p.evaluate(
            () =>
              window.__upgradeOwner.metrics.disposed &&
              window.__upgradeOwner.metrics !== window.__siloMetrics,
          ),
          true,
        );
        await shot(p, "1366-glb-recovered");
        await p.close();
        activePage = page;
        return { retried: true };
      },
    );
    await check("Hung GLB request times out clearly and retry cancels its owner", async () => {
      const failure = await contextFor(1366, 768),
        p = failure.page,
        held = [];
      await p.route("**/models/silo-engolfamento/worker-a.glb", (route) => {
        held.push(route);
      });
      const start = performance.now();
      await p.goto(`${base}/mapas-3d/silo-engolfamento`, { waitUntil: "domcontentloaded" });
      await p.getByText("Visualização indisponível", { exact: true }).waitFor({ timeout: 35000 });
      const errorAfterMs = performance.now() - start;
      await preserveOwner(p);
      await p.unroute("**/models/silo-engolfamento/worker-a.glb");
      for (const route of held) await route.abort().catch(() => {});
      await activate(p, "Tentar novamente em qualidade leve");
      await ready(p);
      assert.equal(
        await p.evaluate(
          () =>
            window.__upgradeOwner.metrics.disposed &&
            window.__upgradeOwner.metrics !== window.__siloMetrics,
        ),
        true,
      );
      await p.close();
      activePage = page;
      return { errorAfterMs, heldRequests: held.length, retryReady: true, infiniteSpinner: false };
    });
    await check("Invalid GLB decoding fails clearly and recovers through retry", async () => {
      const failure = await contextFor(1366, 768),
        p = failure.page;
      await p.route("**/models/silo-engolfamento/worker-a.glb", (route) =>
        route.fulfill({
          status: 200,
          contentType: "model/gltf-binary",
          body: "invalid glTF test payload",
        }),
      );
      await p.goto(`${base}/mapas-3d/silo-engolfamento`);
      await p.getByText("Visualização indisponível", { exact: true }).waitFor({ timeout: 60000 });
      await preserveOwner(p);
      await p.unroute("**/models/silo-engolfamento/worker-a.glb");
      await activate(p, "Tentar novamente em qualidade leve");
      await ready(p);
      assert.equal(
        await p.evaluate(
          () =>
            window.__upgradeOwner.metrics.disposed &&
            window.__upgradeOwner.metrics !== window.__siloMetrics,
        ),
        true,
      );
      await p.close();
      activePage = page;
      return { decodingErrorHandled: true, retryReady: true };
    });
    await check(
      "Corrupt embedded worker image is identified and retry restores the textured rig",
      async () => {
        const bytes = Buffer.from(await readFile("public/models/silo-engolfamento/worker-a.glb"));
        const jsonLength = bytes.readUInt32LE(12),
          document = JSON.parse(bytes.subarray(20, 20 + jsonLength).toString("utf8")),
          image = document.images.find((entry) => Number.isInteger(entry.bufferView)),
          view = document.bufferViews[image.bufferView],
          binHeader = 20 + jsonLength;
        assert.equal(bytes.readUInt32LE(binHeader + 4), 0x004e4942);
        const offset = binHeader + 8 + (view.byteOffset ?? 0);
        bytes.fill(0, offset, offset + Math.min(32, view.byteLength));
        const failure = await contextFor(1366, 768),
          p = failure.page;
        await p.route("**/models/silo-engolfamento/worker-a.glb", (route) =>
          route.fulfill({ status: 200, contentType: "model/gltf-binary", body: bytes }),
        );
        await p.goto(`${base}/mapas-3d/silo-engolfamento`);
        await p.waitForFunction(
          () =>
            !!document.querySelector("canvas[data-ready=true]") ||
            document.body.textContent.includes("Visualização indisponível"),
          null,
          { timeout: 60000 },
        );
        const recoverableError = await p
          .getByText("Visualização indisponível", { exact: true })
          .isVisible();
        const identifiedFallback = /textura.*(?:indispon|falh|erro)|(?:falh|erro).*textura/i.test(
          await p.locator(".silo-viewer").textContent(),
        );
        assert.ok(
          recoverableError || identifiedFallback,
          "embedded image decoding failed but the interface silently called the untextured worker ready",
        );
        await shot(p, "1366-corrupt-texture-identified");
        await preserveOwner(p);
        await p.unroute("**/models/silo-engolfamento/worker-a.glb");
        if (recoverableError) await activate(p, "Tentar novamente em qualidade leve");
        else await p.reload();
        await ready(p);
        assert.equal(
          await p.evaluate(
            () =>
              window.__upgradeOwner.metrics !== window.__siloMetrics &&
              window.__upgradeOwner.metrics.disposed,
          ),
          true,
        );
        await shot(p, "1366-corrupt-texture-recovered");
        await p.close();
        activePage = page;
        return {
          glbContainerValid: true,
          damagedImageBytes: Math.min(32, view.byteLength),
          recoverableError,
          identifiedFallback,
          retryReady: true,
        };
      },
    );
    await check(
      "No-WebGL gets a usable lightweight sequence and persistent first-person exit",
      async () => {
        const fallback = await contextFor(390, 844, true),
          p = fallback.page;
        await p.addInitScript(() => {
          const original = HTMLCanvasElement.prototype.getContext;
          HTMLCanvasElement.prototype.getContext = function (type, ...args) {
            return /^webgl/.test(type) ? null : original.call(this, type, ...args);
          };
        });
        await p.goto(`${base}/mapas-3d/silo-engolfamento`);
        await p.getByText("Visualização indisponível", { exact: true }).waitFor();
        await activate(p, "Sequência educativa leve", true);
        await mode(p, "Simulação", true);
        await seek(p, 25);
        await camera(p, "victim");
        assert.equal(await p.locator(".silo-fallback").isVisible(), true);
        assert.equal(
          await p.getByRole("button", { name: "Sair da primeira pessoa", exact: true }).isVisible(),
          true,
        );
        await shot(p, "390-no-webgl-sequence");
        await p.close();
        activePage = page;
        return { fallback: true, infiniteSpinner: false };
      },
    );
  }
  await check("No unexpected JavaScript errors in the exercised sessions", async () => {
    assert.deepEqual(report.consoleErrors, []);
    assert.deepEqual(
      report.renderErrors,
      [],
      "WebGL draw or shader errors invalidate a visually empty scene",
    );
    return { errors: report.consoleErrors };
  });
} catch (error) {
  report.failures.push({
    name: "validation setup or unrecoverable test dependency",
    result: "não atingido",
    error: String(error.stack ?? error),
  });
  console.error(error);
} finally {
  await save();
  for (const context of contexts) await context.close().catch(() => {});
  await browser.close();
}
console.log(
  JSON.stringify(
    {
      checks: report.checks.length,
      failures: report.failures.length,
      samples: report.samples.length,
      output,
    },
    null,
    2,
  ),
);
if (report.failures.length) process.exitCode = 1;
