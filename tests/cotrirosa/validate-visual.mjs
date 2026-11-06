import { chromium } from "@playwright/test";
import assert from "node:assert/strict";
import { mkdir, writeFile } from "node:fs/promises";
import { PerspectiveCamera, Vector3 } from "three";
import { ids } from "./fixture.mjs";
const root = process.env.COTRIROSA_VISUAL_ORIGIN || "http://127.0.0.1:4197";
if (!/^http:\/\/127\.0\.0\.1:419[67]$/.test(root)) throw Error("Loopback laboratory only");
const out = "docs/cotrirosa/visual-local",
  url = `${root}/nr-33/mapa-3d?cliente=${ids.client}&unidade=${ids.unit}`;
await mkdir(out, { recursive: true });
const b = await chromium.launch({
  headless: true,
  args: [
    process.platform === "win32" ? "--use-angle=d3d11" : "--use-angle=swiftshader",
    "--enable-unsafe-swiftshader",
    "--enable-gpu",
    "--ignore-gpu-blocklist",
  ],
});
const report = {
  checks: [],
  errors: [],
  captures: [],
  limits: `${process.platform} Chromium; touch emulation, not a physical phone; ${root}`,
};
const check = (value, label) => {
  assert.ok(value, label);
  report.checks.push(label);
  console.log("PASS " + label);
};
const ready = async (p) => {
  await p.locator('canvas[data-ready="true"]').waitFor({ timeout: 45000 });
  await p.waitForFunction(() => Number(document.querySelector("canvas")?.dataset.frameTime) > 0);
};
const snap = (p) =>
  p.locator("canvas").evaluate((c) => ({
    camera: JSON.parse(c.dataset.camera),
    profile: c.dataset.profile,
    lighting: JSON.parse(c.dataset.lighting),
    environment: c.dataset.environmentGenerations,
    metrics: JSON.parse(c.dataset.metrics),
    buffer: [c.width, c.height],
  }));
const shot = async (p, name) => {
  await p.screenshot({ path: `${out}/${name}.png` });
  report.captures.push(name);
};
const open = async (p) => {
  await p.getByRole("button", { name: "Qualidade gráfica", exact: true }).click();
};
const close = async (p) => {
  await p.keyboard.press("Escape");
  await p.locator(".unit-map-quality").waitFor({ state: "detached" });
};
const choose = async (p, name) => {
  await open(p);
  await p.getByRole("radio", { name, exact: true }).check();
  await close(p);
};
try {
  const context = await b.newContext({
    viewport: { width: 1440, height: 1000 },
    reducedMotion: "reduce",
    recordVideo: { dir: out, size: { width: 1440, height: 1000 } },
  });
  await context.addInitScript(
    ({ key }) => {
      localStorage.setItem("nexus:nr-map:quality:v1", "balanced");
      sessionStorage.setItem(
        key,
        JSON.stringify({
          mode: "normal",
          zoom: 1,
          position: [-22, 13, 62],
          target: [3, 16, -1],
          fov: 38,
        }),
      );
    },
    { key: `nr-map:${ids.org}:${ids.user}:NR33:${ids.client}:${ids.unit}` },
  );
  const p = await context.newPage();
  p.on("pageerror", (e) => report.errors.push(e.message));
  await p.goto(url);
  await ready(p);
  await p.evaluate(() => {
    window.__originalCanvas = document.querySelector("canvas");
  });
  await shot(p, "final-inspection-day");
  const before = await snap(p);
  await open(p);
  await p.getByRole("radio", { name: "Alta", exact: true }).focus();
  await p.keyboard.press("Space");
  await close(p);
  await p.waitForFunction(
    () => document.activeElement?.getAttribute("aria-label") === "Qualidade gráfica",
  );
  check(
    await p
      .getByRole("button", { name: "Qualidade gráfica", exact: true })
      .evaluate((e) => e === document.activeElement),
    "quality menu restores keyboard focus with Escape",
  );
  await p.waitForFunction(() => document.querySelector("canvas").dataset.profile === "high");
  check(
    JSON.stringify((await snap(p)).camera) === JSON.stringify(before.camera),
    "manual quality preserves camera position target mode and zoom",
  );
  check(
    await p.evaluate(() => window.__originalCanvas === document.querySelector("canvas")),
    "quality reuses the original canvas and WebGL context",
  );
  const project = async (point) => {
    const box = await p.locator("canvas").boundingBox();
    const c = new PerspectiveCamera(38, box.width / box.height, 0.12, 1400);
    c.position.set(-22, 13, 62);
    c.lookAt(3, 16, -1);
    c.updateMatrixWorld();
    const v = new Vector3(...point).project(c);
    return [box.x + ((v.x + 1) * box.width) / 2, box.y + ((1 - v.y) * box.height) / 2];
  };
  const stair = await project([Math.cos(1.55) * 5.53, 16.36, Math.sin(1.55) * 5.53]);
  await p.mouse.click(...stair);
  await p.getByRole("button", { name: "Fechar ficha", exact: true }).waitFor();
  check(new URL(p.url()).searchParams.get("objeto") === "sa05", "front stair picks EC28 SA05");
  await p.getByRole("button", { name: "Fechar ficha", exact: true }).click();
  const tube = await project([3.775, 29.52, -2.675]);
  await p.mouse.click(...tube);
  await p.getByRole("button", { name: "Fechar ficha", exact: true }).waitFor();
  check(
    new URL(p.url()).searchParams.get("objeto") === "sa05",
    "inclined tube and tower pick the same EC28 identity",
  );
  const selected = p.url();
  for (const name of ["Baixa", "Equilibrada", "Alta"]) {
    await choose(p, name);
    await p.waitForTimeout(100);
    check(
      new URL(p.url()).searchParams.get("objeto") ===
        new URL(selected).searchParams.get("objeto") &&
        new URL(p.url()).searchParams.get("local") ===
          new URL(selected).searchParams.get("local") &&
        (await p.getByRole("button", { name: "Fechar ficha", exact: true }).isVisible()),
      `${name} preserves equipment and compact panel`,
    );
    await p.getByRole("button", { name: "Acervo", exact: true }).click();
    await p.getByRole("button", { name: "Histórico", exact: true }).click();
    await p.getByRole("button", { name: "Visão geral", exact: true }).click();
  }
  await p.getByRole("button", { name: "Fechar ficha", exact: true }).click();
  for (const name of ["Baixa", "Equilibrada", "Alta"]) {
    await choose(p, name);
    const a = await snap(p);
    await shot(p, `light-${name}-day`);
    await open(p);
    await p.getByRole("radio", { name: "Fim de tarde", exact: true }).check();
    await close(p);
    await p.waitForFunction(
      () => document.querySelector("canvas").dataset.environmentState === "late",
    );
    const c = await snap(p);
    check(
      JSON.stringify(a.camera) === JSON.stringify(c.camera),
      `${name} time of day keeps camera fixed`,
    );
    check(
      JSON.stringify(a.lighting.sun) !== JSON.stringify(c.lighting.sun) &&
        a.lighting.color !== c.lighting.color &&
        a.lighting.exposure === c.lighting.exposure,
      `${name} changes sun direction color and environment at fixed exposure`,
    );
    await shot(p, `light-${name}-late`);
    const box = await p.locator("canvas").boundingBox(),
      cx = box.x + box.width * 0.45,
      cy = box.y + box.height * 0.5;
    await p.mouse.move(cx, cy);
    await p.mouse.down();
    await p.mouse.move(cx + 140, cy - 15, { steps: 32 });
    await p.mouse.up();
    await p.waitForTimeout(900);
    const d = await snap(p);
    check(
      JSON.stringify(c.lighting) === JSON.stringify(d.lighting) && c.environment === d.environment,
      `${name} orbit keeps world sun and cached PMREM fixed`,
    );
    await shot(p, `light-${name}-late-orbit`);
    await open(p);
    await p.getByRole("radio", { name: "Dia", exact: true }).check();
    await close(p);
  }
  check(
    (await snap(p)).environment === "2",
    "only two PMREMs generated across profiles, hours and orbits",
  );
  for (const mode of ["Superior", "Angular", "Normal"]) {
    await p.getByRole("button", { name: mode, exact: true }).click();
    await p.waitForTimeout(150);
    const a = await snap(p);
    await choose(p, "Equilibrada");
    await choose(p, "Baixa");
    check(
      JSON.stringify(a.camera) === JSON.stringify((await snap(p)).camera),
      `${mode} camera survives profile switches`,
    );
  }
  for (let i = 0; i < 2; i++) for (const name of ["Alta", "Baixa"]) await choose(p, name);
  await p.waitForTimeout(400);
  const resources = (await snap(p)).metrics;
  for (let i = 0; i < 2; i++) for (const name of ["Alta", "Baixa"]) await choose(p, name);
  await p.waitForTimeout(400);
  const resourcesAfter = (await snap(p)).metrics;
  check(
    resourcesAfter.geometries <= resources.geometries + 1 &&
      resourcesAfter.textures <= resources.textures + 1,
    "repeated quality cycles do not grow geometries or textures",
  );
  report.resources = { before: resources, after: resourcesAfter };
  await p.locator("canvas").evaluate((c) => {
    window.__lose = c.getContext("webgl2").getExtension("WEBGL_lose_context");
    window.__lose.loseContext();
  });
  await p.waitForTimeout(350);
  await p.evaluate(() => window.__lose.restoreContext());
  await ready(p);
  check(
    await p.evaluate(() => window.__originalCanvas === document.querySelector("canvas")),
    "context restoration warms and recovers the same canvas",
  );
  await p
    .locator("canvas")
    .evaluate((c) => c.getContext("webgl2").getExtension("WEBGL_lose_context").loseContext());
  await p.getByRole("heading", { name: "Mapa em lista", exact: true }).waitFor({ timeout: 10000 });
  check(
    await p.getByRole("button", { name: /EC 28/ }).isVisible(),
    "unrestored context falls back to existing equipment list",
  );
  await context.close();
  const mobile = await b.newContext({
    viewport: { width: 390, height: 844 },
    isMobile: true,
    hasTouch: true,
    deviceScaleFactor: 1,
    reducedMotion: "reduce",
  });
  const m = await mobile.newPage();
  m.on("pageerror", (e) => report.errors.push(e.message));
  await m.goto(url);
  await ready(m);
  await open(m);
  await m.getByRole("radio", { name: "Baixa", exact: true }).check();
  await close(m);
  const mb = await m.locator("canvas").boundingBox();
  const cdp = await mobile.newCDPSession(m);
  await cdp.send("Input.dispatchTouchEvent", {
    type: "touchStart",
    touchPoints: [{ x: 180, y: mb.y + 260, id: 1 }],
  });
  for (let i = 0; i < 25; i++)
    await cdp.send("Input.dispatchTouchEvent", {
      type: "touchMove",
      touchPoints: [{ x: 180 + i * 3, y: mb.y + 260 - i, id: 1 }],
    });
  await cdp.send("Input.dispatchTouchEvent", { type: "touchEnd", touchPoints: [] });
  await m.waitForTimeout(500);
  await shot(m, "final-mobile-touch");
  check(
    await m.evaluate(() => document.documentElement.scrollWidth <= innerWidth),
    "390px has no horizontal overflow",
  );
  check(mb.height > 550, "map remains dominant at 390px");
  await open(m);
  await m.getByRole("radio", { name: "Fim de tarde", exact: true }).check();
  await shot(m, "final-mobile-quality");
  await close(m);
  await m.reload();
  await ready(m);
  check((await snap(m)).profile === "low", "validated manual preference survives reload");
  await open(m);
  await m.getByRole("radio", { name: "Automática (recomendada)", exact: true }).check();
  check(
    await m.getByRole("status").filter({ hasText: "Perfil ativo:" }).isVisible(),
    "automatic mode exposes the active profile",
  );
  await close(m);
  await mobile.close();
  check(report.errors.length === 0, "no JavaScript exceptions");
} finally {
  await writeFile(`${out}/visual-ui-results.json`, JSON.stringify(report, null, 2));
  await b.close();
}
