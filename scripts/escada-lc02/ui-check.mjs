import { chromium } from "playwright";
import assert from "node:assert/strict";
import { mkdir, writeFile, readFile } from "node:fs/promises";
import validator from "gltf-validator";

const base = process.env.LC02_URL ?? "http://127.0.0.1:5183";
const output = "docs/escada-lc02/evidence";
await mkdir(output, { recursive: true });
const browser = await chromium.launch({
  headless: true,
  ...(process.env.LC02_BROWSER === "chromium" ? {} : { channel: "chrome" }),
  args:
    process.env.LC02_SOFTWARE === "1"
      ? ["--use-angle=swiftshader", "--enable-unsafe-swiftshader"]
      : [],
});
const page = await browser.newPage({ viewport: { width: 1440, height: 1000 } });
page.setDefaultTimeout(20000);
console.log("Browser started");
const watchdog = setTimeout(() => {
  console.error("UI validation exceeded 6 minutes");
  process.exit(1);
}, 360000);
const errors = [],
  failed = [],
  report = {};
page.on("pageerror", (e) => errors.push(e.message));
page.on("console", (m) => {
  if (m.type() === "error") errors.push(m.text());
});
page.on("requestfailed", (r) => {
  if (r.url().startsWith(base)) failed.push({ url: r.url(), error: r.failure() });
});
const settle = () => page.waitForTimeout(1400);
const shot = (name) => page.screenshot({ path: `${output}/${name}.png` });
const stats = () => page.locator("canvas").evaluate((c) => ({ ...c.dataset }));
try {
  await page.goto(`${base}/escada-lc02`);
  await page.waitForSelector("canvas[data-ready=true]", { timeout: 90000 });
  await settle();
  assert.equal(await page.locator("canvas").count(), 1);
  report.desktop = await stats();
  console.log("Initial scene ready", report.desktop);
  await shot("isometrica");
  await page.locator("canvas").evaluate((c) => {
    window.__lcCanvas = c;
  });
  const views = page.getByRole("navigation", { name: "Vistas do modelo" });
  report.views = [];
  for (const [name, file] of [
    ["Lado oposto", "lado-oposto"],
    ["Frontal", "frontal"],
    ["Lateral", "lateral"],
    ["Superior", "superior"],
    ["Isométrica", "isometrica-retorno"],
  ]) {
    await views.getByRole("button", { name: new RegExp(name + "$") }).click();
    await settle();
    report.views.push({ name, stats: await stats() });
    await shot(file);
    console.log("View passed", name);
  }
  await page.getByRole("button", { name: "Restaurar apresentação" }).click();
  await settle();
  const before = (await stats()).camera;
  console.log("Checking orbit");
  await page.mouse.move(590, 560);
  await page.mouse.down();
  await page.mouse.move(700, 590, { steps: 16 });
  await page.mouse.up();
  await settle();
  assert.notEqual((await stats()).camera, before);
  const orbit = (await stats()).camera;
  console.log("Checking pan");
  await page.mouse.move(590, 560);
  await page.mouse.down({ button: "right" });
  await page.mouse.move(635, 580, { steps: 10 });
  await page.mouse.up({ button: "right" });
  await settle();
  assert.notEqual((await stats()).camera, orbit);
  const pan = (await stats()).camera;
  console.log("Checking zoom button");
  await page.getByRole("button", { name: "Aproximar", exact: true }).click();
  await settle();
  assert.notEqual((await stats()).camera, pan);
  const zoom = (await stats()).camera;
  console.log("Checking zoom wheel");
  // Dispatch to OrbitControls directly: native headless compositor wheel acknowledgement
  // can stall on this Windows host even after orbit/pan complete.
  await page
    .locator("canvas")
    .dispatchEvent("wheel", { deltaY: 180, deltaMode: 0, bubbles: true, cancelable: true });
  await settle();
  assert.notEqual((await stats()).camera, zoom);
  report.navigation = { orbit: true, pan: true, zoomButton: true, zoomWheel: true };
  console.log("Navigation passed");
  await page.getByRole("button", { name: "Restaurar apresentação" }).click();
  await settle();
  await page.getByLabel("Cotas de referência").check();
  await page.getByRole("checkbox", { name: "Percurso", exact: true }).check();
  await page.getByLabel("Legendas", { exact: true }).selectOption("all");
  await settle();
  await shot("identificacao");
  report.labels = await page.locator(".lc-label").evaluateAll((els) => {
    const a = els
      .filter((e) => getComputedStyle(e).visibility === "visible")
      .map((e) => ({ text: e.textContent, r: e.getBoundingClientRect().toJSON() }));
    let overlap = 0;
    for (let i = 0; i < a.length; i++)
      for (let j = i + 1; j < a.length; j++) {
        const x = a[i].r,
          y = a[j].r;
        if (x.left < y.right && x.right > y.left && x.top < y.bottom && x.bottom > y.top) overlap++;
      }
    return { visible: a.map((e) => e.text), overlap };
  });
  assert.equal(report.labels.overlap, 0);
  assert.ok(
    report.labels.visible.length >= 6,
    "Visible model labels must remain after toggling dimensions",
  );
  assert.equal(await page.locator("canvas[data-ready=true]").count(), 1);
  console.log("Labels passed");
  await page.getByRole("tab", { name: "Camadas", exact: true }).click();
  for (const name of [
    "Estrutura existente",
    "Escada e degraus",
    "Patamares",
    "Guarda-corpos e corrimãos",
    "Apoios e diagonais",
    "Pontos de referência",
  ]) {
    await page.getByRole("checkbox", { name, exact: true }).uncheck();
    await page.waitForTimeout(160);
    await page.getByRole("checkbox", { name, exact: true }).check();
    await page.waitForTimeout(160);
  }
  report.layers = 6;
  console.log("Layers passed");
  await page.getByRole("tab", { name: "Percurso", exact: true }).click();
  await page.getByRole("button", { name: /04 Patamar intermediário/ }).click();
  await settle();
  assert.match(await page.locator(".lc-detail").innerText(), /Mudança de direção/);
  await shot("patamar");
  await page.getByRole("button", { name: "Restaurar apresentação" }).click();
  await settle();
  await page.getByRole("tab", { name: "Fonte & limites", exact: true }).click();
  assert.match(await page.getByRole("tabpanel").innerText(), /ilustrativos/);
  for (const [file, magic] of [
    ["referencia.pdf", "%PDF"],
    ["escada-lc02.glb", "glTF"],
  ]) {
    const r = await page.request.get(`${base}/models/escada-lc02/${file}`);
    assert.equal(r.status(), 200);
    assert.equal((await r.body()).subarray(0, 4).toString(), magic);
  }
  report.downloads = true;
  console.log("Downloads passed");
  // Compare the same active GPU resources: hidden optional geometry is uploaded
  // again only when visible after a context restoration.
  await page.getByRole("checkbox", { name: "Cotas de referência", exact: true }).check();
  await page.getByRole("checkbox", { name: "Percurso", exact: true }).check();
  await settle();
  const stable = await stats();
  report.contextRecovery = [];
  assert.ok(
    await page.locator("canvas").evaluate((c) => {
      window.__lcLoss = c.getContext("webgl2")?.getExtension("WEBGL_lose_context");
      return !!window.__lcLoss;
    }),
  );
  for (let cycle = 0; cycle < 2; cycle++) {
    await page.evaluate(() => window.__lcLoss.loseContext());
    await page.getByText("Renderização interrompida", { exact: true }).waitFor();
    await page.waitForTimeout(400);
    await page.evaluate(() => window.__lcLoss.restoreContext());
    await page.waitForSelector("canvas[data-ready=true]");
    await settle();
    assert.ok(await page.locator("canvas").evaluate((c) => c === window.__lcCanvas));
    const s = await stats();
    assert.equal(s.geometries, stable.geometries);
    assert.equal(s.textures, stable.textures);
    report.contextRecovery.push(s);
    console.log("Recovery passed", cycle);
  }
  await page.getByRole("tab", { name: "Percurso", exact: true }).click();
  await shot("recuperado");
  await page.evaluate(() => {
    window.__lcFrames = [];
    window.__lcMeasuring = true;
    let previous = performance.now();
    function tick(now) {
      if (!window.__lcMeasuring) return;
      window.__lcFrames.push(now - previous);
      previous = now;
      requestAnimationFrame(tick);
    }
    requestAnimationFrame(tick);
  });
  await page.mouse.move(560, 520);
  await page.mouse.down();
  for (let i = 0; i < 100; i++) {
    await page.mouse.move(560 + 100 * Math.sin(i / 25), 520 + 25 * Math.cos(i / 25));
    await page.waitForTimeout(16);
  }
  await page.mouse.up();
  report.frameIntervals = await page.evaluate(() => {
    window.__lcMeasuring = false;
    const a = window.__lcFrames.slice(2).sort((a, b) => a - b);
    return {
      samples: a.length,
      p50: a[Math.floor(a.length * 0.5)],
      p95: a[Math.floor(a.length * 0.95)],
      max: Math.max(...a),
      scope:
        "Local headless Chrome with SwiftShader software renderer, short orbit sample; not native GPU or physical mobile proof",
    };
  });
  await page.getByRole("link", { name: "Voltar à engenharia" }).click();
  await page.getByRole("heading", { name: "Análises e dimensionamentos" }).waitFor();
  assert.equal(await page.locator("canvas").count(), 0);
  await page.getByRole("link", { name: "Escada LC-02", exact: true }).click();
  await page.waitForSelector("canvas[data-ready=true]");
  report.routeAndUnmount = true;
  console.log("Unmount passed");
  const mobile = await browser.newPage({
    viewport: { width: 390, height: 844 },
    isMobile: true,
    hasTouch: true,
    deviceScaleFactor: 1,
  });
  mobile.on("pageerror", (e) => errors.push(e.message));
  await mobile.goto(`${base}/escada-lc02`);
  await mobile.waitForSelector("canvas[data-ready=true]", { timeout: 60000 });
  await mobile.waitForTimeout(1600);
  assert.equal(
    await mobile.evaluate(() => document.documentElement.scrollWidth > innerWidth),
    false,
  );
  await mobile.screenshot({ path: `${output}/mobile.png` });
  await mobile.getByRole("button", { name: "Explorar modelo" }).tap();
  await mobile.getByRole("tab", { name: "Camadas", exact: true }).tap();
  await mobile.getByRole("checkbox", { name: "Estrutura existente", exact: true }).uncheck();
  await mobile.screenshot({ path: `${output}/mobile-painel.png` });
  await mobile.getByRole("checkbox", { name: "Estrutura existente", exact: true }).check();
  await mobile.getByRole("button", { name: "Fechar explorador" }).tap();
  const oldCamera = await mobile.locator("canvas").getAttribute("data-camera");
  const client = await mobile.context().newCDPSession(mobile);
  await client.send("Input.dispatchTouchEvent", {
    type: "touchStart",
    touchPoints: [{ x: 160, y: 360 }],
  });
  for (let i = 1; i <= 10; i++)
    await client.send("Input.dispatchTouchEvent", {
      type: "touchMove",
      touchPoints: [{ x: 160 + i * 5, y: 360 + i * 2 }],
    });
  await client.send("Input.dispatchTouchEvent", { type: "touchEnd", touchPoints: [] });
  await mobile.waitForTimeout(1200);
  assert.notEqual(await mobile.locator("canvas").getAttribute("data-camera"), oldCamera);
  report.mobile = {
    viewport: "390x844 emulated",
    overflow: false,
    touchOrbit: true,
    controls: true,
    stats: await mobile.locator("canvas").evaluate((c) => ({ ...c.dataset })),
  };
  const glb = await validator.validateBytes(
    new Uint8Array(await readFile("public/models/escada-lc02/escada-lc02.glb")),
  );
  report.glb = { issues: glb.issues, info: glb.info };
  assert.equal(glb.issues.numErrors, 0);
  assert.equal(glb.issues.numWarnings, 0);
  report.errors = errors;
  report.failedRequests = failed;
  assert.equal(errors.length, 0);
  assert.equal(failed.length, 0);
  await writeFile(`${output}/validation.json`, JSON.stringify(report, null, 2));
  console.log(JSON.stringify(report, null, 2));
} catch (error) {
  console.error("VALIDATION FAILURE", error);
  await writeFile(
    `${output}/validation-failure.json`,
    JSON.stringify({ message: String(error), report }, null, 2),
  );
  process.exitCode = 1;
} finally {
  await Promise.race([browser.close(), new Promise((resolve) => setTimeout(resolve, 5000))]);
  clearTimeout(watchdog);
  process.exit(process.exitCode ?? 0);
}
