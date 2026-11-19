import assert from "node:assert/strict";
import { mkdir, readFile, writeFile } from "node:fs/promises";
import { join } from "node:path";
import { chromium } from "playwright";

// Poses reconstruídas das quatro capturas pela implantação e pelas referências em cena.
// Compare os arquivos de câmera para falhar caso um gesto deixe de produzir o mesmo enquadramento.
const [stage, output, reference] = process.argv.slice(2);
const base = new URL(process.env.NEXUS_TEST_BASE_URL ?? "http://127.0.0.1:4418");
assert(["antes", "depois"].includes(stage) && output);
assert(["127.0.0.1", "localhost"].includes(base.hostname));
const route = new URL("/mapas-3d/tres-tentos-cruz-alta", base).href;
await mkdir(output, { recursive: true });
const browser = await chromium.launch({
  executablePath:
    process.env.CRUZ_CHROME ||
    (process.platform === "darwin"
      ? "/Applications/Google Chrome.app/Contents/MacOS/Google Chrome"
      : undefined),
  args: process.platform === "darwin" ? ["--use-angle=metal"] : [],
});
const viewport = { width: 1440, height: 900 };
const page = await browser.newPage({ viewport, deviceScaleFactor: 1, reducedMotion: "reduce" });
const canvas = page.locator(".ca-stage canvas"),
  errors = [],
  poses = {};
page.on("pageerror", (error) => errors.push(error.message));
page.on("console", (msg) => {
  if (/THREE\.WebGLProgram|VALIDATE_STATUS false/i.test(msg.text())) errors.push(msg.text());
});
const button = (name) => page.getByRole("button", { name, exact: true });
const cameraState = () =>
  canvas.evaluate(({ dataset: d, clientWidth: width, clientHeight: height }) => ({
    camera: d.camera.split(",").map(Number),
    target: d.target.split(",").map(Number),
    fov: Number(d.fov),
    zoom: Number(d.zoom),
    width,
    height,
    dpr: Number(d.dpr),
    quality: d.quality,
    calls: Number(d.calls),
    triangles: Number(d.triangles),
  }));
async function load(id) {
  await page.goto(route + (id ? "?objeto=" + encodeURIComponent(id) : ""));
  await page.locator("canvas[data-camera][data-horizon=ready]").waitFor();
  if (id) {
    await button("Fechar ficha").click();
    await page.waitForURL((url) => !url.searchParams.has("objeto"));
    await page.waitForFunction(() => document.querySelector("canvas").clientWidth === innerWidth);
  }
}
async function rotate(dx, dy) {
  const rect = await canvas.boundingBox();
  const x = Math.round(rect.x + rect.width / 2),
    y = Math.round(rect.y + rect.height / 2);
  const before = await canvas.getAttribute("data-camera");
  await page.mouse.move(x, y);
  await page.mouse.down();
  await page.mouse.move(x + dx, y + dy, { steps: 8 });
  await page.mouse.up();
  await page.waitForFunction(
    (last) => document.querySelector("canvas").dataset.camera !== last,
    before,
  );
}
async function compareView(name) {
  await button("Camadas").click();
  const details = page.locator(".ca-comparison");
  if (!(await details.evaluate((el) => el.open))) await details.locator("summary").click();
  await page.getByRole("button", { name }).click();
}
async function approachFromSky(...deltas) {
  // Below the opening angle, the upper ray clears the ground and pivots on the orbit target.
  // Changing a beam or a roof sheet cannot alter the zoom anchor used for these comparisons.
  const rect = await canvas.boundingBox();
  await page.mouse.move(rect.x + rect.width * 0.5, rect.y + 8);
  for (const delta of deltas) {
    const before = await canvas.getAttribute("data-camera");
    await page.mouse.wheel(0, delta);
    await page.waitForFunction(
      (last) => document.querySelector("canvas").dataset.camera !== last,
      before,
    );
  }
}
async function capture(id) {
  await page.waitForTimeout(900);
  poses[id] = await cameraState();
  await page.locator(".ca-stage").screenshot({
    path: join(output, id + ".png"),
    style:
      ".ca-stage > :not(canvas) { visibility: hidden !important; } .ca-stage canvas { outline: none !important; }",
  });
}
try {
  await load();
  await button("Camadas").click();
  await page.getByLabel("Qualidade gráfica").selectOption("detalhado");
  await button("Fechar camadas").click();
  await compareView(/Vista DJI 0044/);
  await capture("01-patio-11-56");
  await load();
  await rotate(-297, -91);
  await approachFromSky(-365, -140);
  await rotate(1, 41);
  await capture("02-preparacao-caldeiras");
  await load();
  await rotate(62, -91);
  await approachFromSky(-365);
  await rotate(1, 63);
  await capture("03-unidade-implantacao");
  await load("estrutura-galeria-silos-sul");
  await rotate(-20, 15);
  await button("Afastar").click();
  await capture("04-silos-ferrovia");
  assert.deepEqual(errors, []);
  if (reference) {
    const { poses: baseline } = JSON.parse(await readFile(reference, "utf8"));
    for (const [id, frame] of Object.entries(poses)) {
      for (const key of ["fov", "zoom", "dpr", "quality", "width", "height"])
        assert.equal(frame[key], baseline[id][key], id + " " + key);
      for (const key of ["camera", "target"])
        assert(
          Math.max(...frame[key].map((n, i) => Math.abs(n - baseline[id][key][i]))) <= 0.005,
          id + " " + key + " divergiu " + JSON.stringify([baseline[id][key], frame[key]]),
        );
    }
  }
  await writeFile(
    join(output, "cameras.json"),
    JSON.stringify({ stage, viewport, poses }, null, 2) + "\n",
  );
  console.log(stage, Object.keys(poses));
} finally {
  await browser.close();
}
