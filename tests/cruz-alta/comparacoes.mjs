import assert from "node:assert/strict";
import { mkdir, readFile, writeFile } from "node:fs/promises";
import { chromium } from "playwright";
const base = process.env.NEXUS_TEST_BASE_URL ?? "http://127.0.0.1:4382";
const tag = process.argv[2] ?? "depois";
if (
  !["antes", "depois"].includes(tag) ||
  !["127.0.0.1", "localhost"].includes(new URL(base).hostname)
)
  throw Error("Selecione o servidor local e a etapa.");
const out = "docs/cruz-alta/refinamento/" + tag;
await mkdir(out, { recursive: true });
const b = await chromium.launch({ args: ["--enable-unsafe-swiftshader"] }),
  p = await b.newPage({ viewport: { width: 1280, height: 798 }, reducedMotion: "reduce" });
p.setDefaultTimeout(60000);
const captures = {};
const map = base + "/mapas-3d/tres-tentos-cruz-alta";
const canvas = p.locator(".ca-stage canvas");
async function capture(id) {
  if (tag === "depois") await p.locator("canvas[data-horizon=ready]").waitFor();
  await p.waitForTimeout(500);
  // Both before/after screenshots use the full clear viewport without overlaid names.
  await p.locator(".ca-stage").screenshot({
    path: out + "/" + id + ".png",
    style: ".ca-stage>:not(canvas){visibility:hidden!important}",
  });
  captures[id] = await canvas.evaluate((e) => ({
    ...e.dataset,
    width: e.clientWidth,
    height: e.clientHeight,
  }));
}
async function route(object) {
  await p.goto(map + (object ? "?objeto=" + encodeURIComponent(object) : ""));
  await p.locator("canvas[data-camera]").waitFor();
  if (object) {
    await p.getByRole("button", { name: "Fechar ficha" }).click();
    await p.waitForURL((url) => !url.searchParams.has("objeto"));
  }
}
async function preset(label) {
  await p.getByRole("button", { name: "Camadas", exact: true }).click();
  const d = p.locator(".ca-comparison");
  if (!(await d.evaluate((el) => el.open))) await d.locator("summary").click();
  await p.getByRole("button", { name: label }).click();
}
async function yard() {
  await p.goto(map + "?objeto=cobertura-11");
  await p.locator("canvas[data-camera]").waitFor();
  await p.waitForTimeout(500);
  await p.getByRole("button", { name: "Planta", exact: true }).click();
  await p.locator("canvas[data-mode=planta]").waitFor();
  await p.getByRole("button", { name: "Pátio", exact: true }).click();
  await p.locator("canvas[data-mode=patio]").waitFor();
  await p.getByRole("button", { name: "Fechar ficha" }).click();
  await p.waitForURL((url) => !url.searchParams.has("objeto"));
  await capture("patio");
}
async function materials() {
  for (const [name, id] of [
    ["cavaco", "cobertura-08"],
    ["caldeira-35", "cobertura-35"],
    ["casca", "estrutura-casca"],
    ["reservatorios", "reservatorio-central-2"],
  ]) {
    await route(id);
    if (name === "caldeira-35" || name === "cavaco") {
      const b = await canvas.boundingBox();
      const x = b.x + b.width * 0.57,
        y = b.y + b.height * 0.49;
      await p.mouse.move(x, y);
      await p.mouse.down();
      await p.mouse.move(x - (name === "caldeira-35" ? 270 : 154), y - 40, { steps: 4 });
      await p.mouse.up();
    }
    if (name === "reservatorios") {
      for (let i = 0; i < 3; i++)
        await p.getByRole("button", { name: "Afastar", exact: true }).click();
    }
    await capture(name);
  }
}
try {
  if (process.argv.includes("--patio")) {
    await yard();
    const index = JSON.parse(await readFile(out + "/cameras.json", "utf8"));
    index.patio = captures.patio;
    await writeFile(out + "/cameras.json", JSON.stringify(index, null, 2) + "\n");
    console.log(tag, captures.patio);
  } else if (process.argv.includes("--materiais")) {
    await materials();
    await writeFile(out + "/cameras-materiais.json", JSON.stringify(captures, null, 2) + "\n");
    console.log(tag, Object.keys(captures));
  } else {
    await route();
    await capture("ampla");
    await p.getByRole("button", { name: "Planta", exact: true }).click();
    await capture("planta");
    await yard();
    await preset(/Vista DJI 0044/);
    await capture("armazem-01-dji");
    await preset(/Encontro de coberturas/);
    await capture("encontro-11-56");
    await route("cobertura-28.1");
    await capture("preparacao");
    await route("estrutura-galeria-silos-sul");
    await capture("galeria");
    assert.equal(Object.keys(captures).length, 7);
    if (tag === "depois") {
      for (const [name, id] of [
        ["preparacao", "cobertura-28.1"],
        ["galeria", "estrutura-galeria-silos-sul"],
        ["armazem-01-dji", ""],
      ]) {
        await route(id);
        if (!id) await preset(/Vista DJI 0044/);
        await p.getByRole("button", { name: "Camadas", exact: true }).click();
        await p.getByRole("checkbox", { name: "Estudo de volumes" }).check();
        await p.getByRole("button", { name: "Fechar camadas" }).click();
        await capture(name + "-fosco");
      }
    }
    await writeFile(out + "/cameras.json", JSON.stringify(captures, null, 2) + "\n");
    console.log(tag, Object.keys(captures));
  }
} finally {
  await b.close();
}
