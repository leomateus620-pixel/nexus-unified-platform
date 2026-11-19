import assert from "node:assert/strict";
import { mkdir, writeFile } from "node:fs/promises";
import { join } from "node:path";
import { chromium } from "playwright";

const output = process.argv[2];
assert(output);
const base = new URL(process.env.NEXUS_TEST_BASE_URL ?? "http://127.0.0.1:4420");
assert(["127.0.0.1", "localhost"].includes(base.hostname));
await mkdir(output, { recursive: true });
const browser = await chromium.launch({
  executablePath:
    process.env.CRUZ_CHROME ||
    (process.platform === "darwin"
      ? "/Applications/Google Chrome.app/Contents/MacOS/Google Chrome"
      : undefined),
  args: process.platform === "darwin" ? ["--use-angle=metal"] : [],
});
const context = await browser.newContext({
  viewport: { width: 1440, height: 900 },
  deviceScaleFactor: 1,
  recordVideo: { dir: output, size: { width: 1280, height: 800 } },
});
const page = await context.newPage(),
  errors = [],
  poses = {};
page.on("pageerror", (error) => errors.push(error.message));
const scene = page.locator(".ca-stage canvas");
const button = (name) => page.getByRole("button", { name, exact: typeof name === "string" });
const pause = (ms) => new Promise((resolve) => setTimeout(resolve, ms));
async function pose(id) {
  poses[id] = await scene.evaluate((canvas) => ({
    eye: canvas.dataset.camera,
    target: canvas.dataset.target,
    mode: canvas.dataset.mode,
    floor: canvas.dataset.floor,
    timeMs: Math.round(performance.now()),
  }));
}
async function drag(dx, dy, duration) {
  const rect = await scene.boundingBox();
  const x = Math.round(rect.x + rect.width * 0.51),
    y = Math.round(rect.y + rect.height * 0.51);
  await page.mouse.move(x, y);
  await page.mouse.down();
  const started = Date.now();
  let t;
  do {
    t = Math.min(1, (Date.now() - started) / duration);
    const ease = t * t * (3 - 2 * t);
    await page.mouse.move(x + dx * ease, y + dy * ease);
    if (t < 1) await pause(33);
  } while (t < 1);
  await page.mouse.up();
}
async function preset(name) {
  await button("Camadas").click();
  const detail = page.locator(".ca-comparison");
  if (!(await detail.evaluate((node) => node.open))) await detail.locator("summary").click();
  await button(name).click();
}
const video = page.video();
try {
  await page.goto(new URL("/mapas-3d/tres-tentos-cruz-alta", base).href);
  await page.locator("canvas[data-camera][data-horizon=ready]").waitFor();
  await pose("entrada");
  await drag(101, -38, 3300);
  await button("Planta").click();
  await page.locator("canvas[data-mode=planta]").waitFor();
  await pause(1500);
  await page.screenshot({ path: join(output, "planta.png") });
  await preset(/Pátio ferroviário/);
  await page.locator("canvas[data-mode=patio]").waitFor();
  await pause(300);
  await pose("inicio-ferrovia");
  await scene.focus();
  await page.keyboard.down("Shift");
  await page.keyboard.down("w");
  await pause(4200);
  await page.keyboard.up("w");
  await page.keyboard.up("Shift");
  await pose("fim-ferrovia");
  await drag(117, 34, 1700);
  await page.screenshot({ path: join(output, "patio-ferroviario.png") });
  await preset(/Encontro de coberturas/);
  await page.locator("canvas[data-mode=angular]").waitFor();
  await pose("encontro-11-56");
  await drag(88, 36, 2400);
  const search = page.getByRole("searchbox", { name: "Buscar setor, estrutura ou LVHF" });
  await search.fill("Galeria da bateria sul");
  await search.press("Enter");
  await page.waitForURL((url) => url.searchParams.get("objeto") === "estrutura-galeria-silos-sul");
  await pause(800);
  await pose("galeria-ficha");
  await button("Fechar ficha").click();
  await button("Afastar").click();
  await drag(128, -16, 4200);
  await pose("galeria-orbita");
  await page.screenshot({ path: join(output, "orbita-silos.png") });
  await button("Ver toda a unidade").click();
  await pause(1700);
  await pose("volta");
  assert.notEqual(poses["inicio-ferrovia"].eye, poses["fim-ferrovia"].eye);
  assert.notEqual(poses["galeria-ficha"].eye, poses["galeria-orbita"].eye);
  assert.deepEqual(errors, []);
} finally {
  await context.close();
  await video.saveAs(join(output, "percurso.webm"));
  await video.delete();
  await browser.close();
}
await writeFile(join(output, "percurso.json"), JSON.stringify(poses, null, 2) + "\n");
