import { chromium } from "playwright";
import assert from "node:assert/strict";
import { mkdir, writeFile } from "node:fs/promises";
const base = process.env.LC02_URL ?? "http://127.0.0.1:5183";
const out = "docs/escada-lc02/evidence/people";
await mkdir(out, { recursive: true });
const software = process.env.LC02_SOFTWARE === "1";
const browser = await chromium.launch({
  headless: true,
  ...(process.env.LC02_BROWSER === "chromium" ? {} : { channel: "chrome" }),
  args: software ? ["--use-angle=swiftshader", "--enable-unsafe-swiftshader"] : [],
});
const context = await browser.newContext({
  viewport: { width: 1440, height: 1000 },
  hasTouch: true,
});
const page = await context.newPage();
page.setDefaultTimeout(20000);
const errors = [];
page.on("pageerror", (e) => errors.push(e.message));
const report = { software, checks: [], samples: [], errors };
const watchdog = setTimeout(() => {
  console.error("UI test exceeded 10 minutes");
  process.exit(1);
}, 600000);
const stats = () => page.locator("canvas").evaluate((c) => ({ ...c.dataset }));
const people = async () => JSON.parse((await stats()).people);
const button = (name) => page.getByRole("button", { name, exact: true });
const start = async (count) => {
  await button(`Iniciar teste com ${count} ${count === 1 ? "pessoa" : "pessoas"}`).click();
  await page.waitForFunction(
    () => document.querySelector("canvas").dataset.simulation === "running",
  );
};
const shot = (name) => page.screenshot({ path: `${out}/${name}.png` });
const sample = async (count, orbit = false) =>
  page.evaluate(
    async ({ count, orbit }) => {
      const canvas = document.querySelector("canvas");
      const samples = [];
      let last = performance.now(),
        maxError = 0;
      await new Promise((resolve) => {
        const frame = (now) => {
          samples.push(now - last);
          last = now;
          maxError = Math.max(maxError, Number(canvas.dataset.footError));
          if (orbit)
            canvas.dispatchEvent(
              new WheelEvent("wheel", {
                deltaY: samples.length % 2 ? 0.8 : -0.8,
                bubbles: true,
                cancelable: true,
              }),
            );
          if (samples.length < 151) requestAnimationFrame(frame);
          else resolve();
        };
        requestAnimationFrame(frame);
      });
      const times = samples.slice(1).sort((a, b) => a - b),
        gl = canvas.getContext("webgl2"),
        ext = gl.getExtension("WEBGL_debug_renderer_info");
      return {
        count,
        p50: times[Math.floor(times.length * 0.5)],
        p95: times[Math.floor(times.length * 0.95)],
        max: times.at(-1),
        frames: times.length,
        maxFootError: maxError,
        gpu: ext ? gl.getParameter(ext.UNMASKED_RENDERER_WEBGL) : "unavailable",
        stats: { ...canvas.dataset },
      };
    },
    { count, orbit },
  );
try {
  await page.goto(`${base}/escada-lc02`);
  await page.waitForSelector("canvas[data-ready=true]", { timeout: 90000 });
  await page.waitForTimeout(1000);
  assert.equal(await page.locator("canvas").count(), 1);
  await page.locator("canvas").evaluate((c) => {
    window.__testCanvas = c;
    window.__testGl = c.getContext("webgl2");
  });
  report.samples.push(await sample(0, true));
  for (const count of [1, 5, 10]) {
    await start(count);
    await page.waitForFunction(
      (n) =>
        JSON.parse(document.querySelector("canvas").dataset.people).filter(
          (p) => p.state === "walking",
        ).length === n,
      count,
      { timeout: 90000 },
    );
    report.samples.push(await sample(count));
    assert.equal(
      Number((await stats()).peopleMeshes),
      count * 6,
      "Every worker renders skin, uniform, eyes, helmet and both boot material primitives",
    );
    await button("Pausar").click();
    await page.waitForTimeout(250);
    await shot(`scenario-${count}`);
    const initial = await people();
    await page.waitForTimeout(250);
    assert.deepEqual(await people(), initial);
    report.checks.push(`${count}: exact concurrent count and pause`);
  }
  // Last member can reverse without colliding with an unseen follower.
  const pick = await page.evaluate(async () => {
    const { routeAt } = await import("/src/escada/lc02-walkway.ts");
    const canvas = document.querySelector("canvas"),
      bounds = canvas.getBoundingClientRect();
    const person = JSON.parse(canvas.dataset.people)[3],
      point = routeAt(person.s).p;
    point[1] += 1.05;
    const camera = canvas.dataset.camera.split(",").map(Number),
      target = [4, 3.5, -1];
    const normalize = (v) => {
      const l = Math.hypot(...v);
      return v.map((n) => n / l);
    };
    const cross = (a, b) => [
      a[1] * b[2] - a[2] * b[1],
      a[2] * b[0] - a[0] * b[2],
      a[0] * b[1] - a[1] * b[0],
    ];
    const dot = (a, b) => a.reduce((s, n, i) => s + n * b[i], 0);
    const f = normalize(target.map((n, i) => n - camera[i])),
      r = normalize(cross(f, [0, 1, 0])),
      u = cross(r, f),
      d = point.map((n, i) => n - camera[i]);
    const depth = dot(d, f),
      height = Math.tan((43 * Math.PI) / 360) * depth;
    return {
      x:
        bounds.x +
        ((dot(d, r) / ((height * bounds.width) / bounds.height)) * 0.5 + 0.5) * bounds.width,
      y: bounds.y + ((-dot(d, u) / height) * 0.5 + 0.5) * bounds.height,
    };
  });
  await page.mouse.click(pick.x, pick.y);
  await page.waitForTimeout(150);
  assert.equal((await stats()).selectedPerson, "3");
  report.checks.push("click on a rendered worker selects it");
  await page.getByLabel("Pessoa em destaque", { exact: true }).selectOption("9");
  await button("Controlar").click();
  await button("Continuar").click();
  await page.waitForTimeout(600);
  const held = (await people())[9].s;
  await page.waitForTimeout(300);
  assert.equal((await people())[9].s, held);
  await page.keyboard.down("KeyW");
  await page.waitForTimeout(1000);
  await page.keyboard.up("KeyW");
  const forward = (await people())[9].s;
  assert.ok(forward > held + 0.1);
  await page.keyboard.down("KeyS");
  await page.waitForTimeout(500);
  await page.keyboard.up("KeyS");
  assert.ok((await people())[9].s < forward - 0.05);
  await page.waitForTimeout(300);
  const stopped = (await people())[9].s;
  await page.waitForTimeout(250);
  assert.equal((await people())[9].s, stopped);
  await shot("manual-third-person");
  report.checks.push("manual advance, reverse and key release");
  await button("Acompanhar").click();
  await page.getByLabel("Pessoa em destaque", { exact: true }).selectOption("0");
  await page.waitForTimeout(1000);
  await shot("follow-upper-flight");
  await page.waitForFunction(
    () => Number(document.querySelector("canvas").dataset.door) > 0.1,
    null,
    { timeout: 60000 },
  );
  await shot("door-opening");
  await page.waitForFunction(
    () => JSON.parse(document.querySelector("canvas").dataset.people)[0].state === "entered",
    null,
    { timeout: 20000 },
  );
  await page.waitForTimeout(300);
  assert.equal((await stats()).peopleCamera, "wide");
  await page.waitForFunction(
    () => document.querySelector("canvas").dataset.simulation === "completed",
    null,
    { timeout: 90000 },
  );
  assert.equal((await people()).filter((p) => p.state === "entered").length, 10);
  assert.equal((await stats()).door, "0.000");
  await shot("all-entered");
  report.checks.push("all ten enter and door closes; selected arrival returns wide");
  // Warm both high LODs before resource comparisons.
  await start(10);
  await page.waitForFunction(
    () => JSON.parse(document.querySelector("canvas").dataset.people)[9].state === "walking",
    null,
    { timeout: 90000 },
  );
  await button("Pausar").click();
  for (const id of ["0", "1"]) {
    await page.getByLabel("Pessoa em destaque", { exact: true }).selectOption(id);
    await button("Acompanhar").click();
    await page.waitForTimeout(1200);
  }
  await button("Visão geral").click();
  await page.waitForTimeout(1300);
  report.warm = await stats();
  for (let cycle = 0; cycle < 2; cycle++) {
    await button("Continuar").click();
    await page.waitForTimeout(150);
    await page.locator("canvas").evaluate((c) => {
      const ext = c.getContext("webgl2").getExtension("WEBGL_lose_context");
      if (!ext) throw Error("missing context-loss extension");
      ext.loseContext();
      setTimeout(() => ext.restoreContext(), 450);
    });
    await page.waitForSelector("canvas[data-ready=false]");
    await page.waitForSelector("canvas[data-ready=true]", { timeout: 45000 });
    assert.equal((await stats()).simulation, "paused");
    assert.equal(
      await page
        .locator("canvas")
        .evaluate((c) => c === window.__testCanvas && c.getContext("webgl2") === window.__testGl),
      true,
    );
    for (const id of ["0", "1"]) {
      await page.getByLabel("Pessoa em destaque", { exact: true }).selectOption(id);
      await button("Acompanhar").click();
      await page.waitForTimeout(1200);
    }
    await button("Visão geral").click();
    await page.waitForTimeout(1300);
  }
  await page.waitForTimeout(500);
  report.recovered = await stats();
  assert.equal(report.recovered.geometries, report.warm.geometries);
  assert.equal(report.recovered.textures, report.warm.textures);
  await shot("context-recovered");
  report.checks.push(
    "two WebGL recoveries, paused positions, same Canvas/context and resource counters",
  );
  for (const count of [1, 10, 5, 10, 1, 10]) await start(count);
  await page.waitForTimeout(500);
  assert.equal((await people()).length, 10);
  assert.equal(await page.locator("canvas").count(), 1);
  await button("Encerrar").click();
  assert.deepEqual(await people(), []);
  report.checks.push("rapid scenario replacement and stop");
  // Existing navigation remains available after a simulation.
  for (const name of ["Lado oposto", "Frontal", "Lateral", "Superior", "Isométrica"]) {
    await page
      .getByRole("navigation", { name: "Vistas do modelo" })
      .getByRole("button", { name: new RegExp(name + "$") })
      .click();
    await page.waitForTimeout(1050);
  }
  await button("Restaurar apresentação").click();
  await page.getByRole("checkbox", { name: "Percurso", exact: true }).check();
  await page.getByRole("checkbox", { name: "Cotas de referência", exact: true }).check();
  await page.getByLabel("Legendas", { exact: true }).selectOption("all");
  await page.waitForTimeout(350);
  assert.ok((await page.locator(".lc-label:visible").count()) > 5);
  report.checks.push("five original views, dimensions, route and labels");
  // Mobile interaction and visibility lifecycle.
  await page.setViewportSize({ width: 390, height: 844 });
  await start(1);
  await page.waitForFunction(
    () => JSON.parse(document.querySelector("canvas").dataset.people)[0].s > 1,
  );
  await button("Controlar").click();
  await page.waitForTimeout(1000);
  const mobileHeld = (await people())[0].s;
  const cdp = await context.newCDPSession(page);
  const box = await button("Avançar personagem").boundingBox();
  await cdp.send("Input.dispatchTouchEvent", {
    type: "touchStart",
    touchPoints: [{ x: box.x + box.width / 2, y: box.y + box.height / 2, id: 1 }],
  });
  await page.waitForTimeout(600);
  await cdp.send("Input.dispatchTouchEvent", { type: "touchEnd", touchPoints: [] });
  assert.ok((await people())[0].s > mobileHeld + 0.1);
  await page.waitForTimeout(150);
  const release = (await people())[0].s;
  await page.waitForTimeout(250);
  assert.equal((await people())[0].s, release);
  await shot("mobile-manual");
  assert.ok(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth));
  await page.evaluate(() => {
    Object.defineProperty(document, "hidden", { configurable: true, get: () => true });
    document.dispatchEvent(new Event("visibilitychange"));
  });
  assert.equal((await stats()).simulation, "paused");
  await page.evaluate(() => {
    delete document.hidden;
    document.dispatchEvent(new Event("visibilitychange"));
  });
  assert.equal((await stats()).simulation, "paused");
  report.checks.push(
    "390x844 touch advance/release, no horizontal overflow, hidden-tab pause requires resume",
  );
  await page.setViewportSize({ width: 1440, height: 1000 });
  await page.getByRole("link", { name: "Voltar à engenharia" }).click();
  await page.waitForURL(`${base}/engenharia`);
  await page.waitForFunction(() => !window.__testCanvas.isConnected);
  // The root switches between the dedicated layout and AppShell before the outlet
  // finishes its route transition. Poll the committed DOM from Node (not a paused RAF).
  for (let i = 0; i < 100 && (await page.locator("canvas").count()); i++)
    await page.waitForTimeout(100);
  assert.equal(await page.locator("canvas").count(), 0);
  await page.getByRole("link", { name: "Escada LC-02" }).click();
  await page.waitForSelector("canvas[data-ready=true]", { timeout: 60000 });
  await start(1);
  await page.waitForFunction(
    () => JSON.parse(document.querySelector("canvas").dataset.people)[0].s > 0.1,
  );
  report.checks.push("route unmount, navigation entry and asset reload");
  assert.deepEqual(errors, []);
} catch (error) {
  report.failure = String(error.stack ?? error);
  report.remainingCanvases = await page
    .locator("canvas")
    .evaluateAll((cs) =>
      cs.map((c) => ({
        html: c.outerHTML.slice(0, 800),
        parent: c.parentElement?.outerHTML.slice(0, 1000),
      })),
    )
    .catch(() => []);
  console.error(report.failure);
  await shot("failure").catch(() => {});
} finally {
  await writeFile(`${out}/ui.json`, JSON.stringify(report, null, 2));
  clearTimeout(watchdog);
  await Promise.race([browser.close(), new Promise((r) => setTimeout(r, 3000))]);
}
console.log(
  JSON.stringify(
    {
      checks: report.checks,
      samples: report.samples.map((s) => ({
        count: s.count,
        p50: s.p50,
        p95: s.p95,
        gpu: s.gpu,
        maxFootError: s.maxFootError,
      })),
      errors,
      failure: report.failure,
    },
    null,
    2,
  ),
);
process.exit(report.failure ? 1 : 0);
