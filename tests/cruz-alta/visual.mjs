import { chromium } from "playwright";
import assert from "node:assert/strict";
import { mkdir, writeFile } from "node:fs/promises";
import path from "node:path";
import { geometry } from "../../src/features/cruz-alta/manifest.ts";
import * as THREE from "three";

// Run with node --import tsx. Reference imagery is inspected only in browser memory.
const origin = process.env.NEXUS_TEST_BASE_URL ?? "http://127.0.0.1:4382";
if (!["localhost", "127.0.0.1"].includes(new URL(origin).hostname))
  throw Error("Usar o servidor local de teste.");
const route = origin + "/mapas-3d/tres-tentos-cruz-alta";
const output = process.env.CRUZ_EVIDENCIAS ?? "docs/cruz-alta/evidencias";
await mkdir(output, { recursive: true });
const browser = await chromium.launch({ args: ["--enable-unsafe-swiftshader"] });
const results = [],
  cameras = {},
  errors = [];
const canvas = (p) => p.locator(".ca-stage canvas");
async function camera(p) {
  return canvas(p).evaluate((el) => ({
    ...el.dataset,
    width: el.clientWidth,
    height: el.clientHeight,
  }));
}
async function stable(p) {
  await p.waitForTimeout(600);
}
async function capture(p, name) {
  await stable(p);
  cameras[name] = await camera(p);
  await p.screenshot({ path: path.join(output, name + ".png") });
}
async function compareMenu(p) {
  await p.getByRole("button", { name: "Camadas", exact: true }).click();
  const details = p.locator(".ca-comparison");
  if (!(await details.evaluate((el) => el.open))) await details.locator("summary").click();
}
try {
  const page = await browser.newPage({
    viewport: { width: 1440, height: 900 },
    reducedMotion: "reduce",
  });
  page.on("pageerror", (e) => errors.push(e.message));
  await page.goto(route, { waitUntil: "domcontentloaded" });
  await page.locator("canvas[data-camera]").waitFor();
  await capture(page, "angular");
  const initial = await camera(page);
  const r = await canvas(page).boundingBox(),
    x = r.x + r.width * 0.55,
    y = r.y + r.height * 0.5;
  await page.mouse.move(x, y);
  await page.mouse.down();
  await page.mouse.move(x + 95, y + 28, { steps: 5 });
  await page.mouse.up();
  await stable(page);
  assert.notEqual((await camera(page)).camera, initial.camera);
  assert(!page.url().includes("objeto="));
  results.push("Primeiro arraste orbita sem selecionar.");
  await page.mouse.wheel(0, -160);
  await stable(page);
  assert.notEqual((await camera(page)).camera, initial.camera);
  await page.getByRole("button", { name: "Ver toda a unidade" }).click();
  await stable(page);
  assert.equal((await camera(page)).camera, initial.camera);
  await page.getByRole("button", { name: "Planta", exact: true }).click();
  await capture(page, "planta");
  assert.equal((await camera(page)).fov, "orthographic");
  const search = page.getByRole("searchbox", { name: "Buscar setor, estrutura ou LVHF" });
  await search.fill("preparacao");
  await search.press("Enter");
  await stable(page);
  assert.equal((await camera(page)).mode, "angular");
  assert(!page.url().includes("objeto="));
  await search.fill("28.1");
  await search.press("Enter");
  await page.waitForURL(/objeto=cobertura-28.1/);
  await capture(page, "preparacao");
  const focused = await camera(page);
  assert(await page.getByRole("button", { name: "Fechar ficha" }).isVisible());
  await page.keyboard.press("Escape");
  await stable(page);
  assert(!page.url().includes("objeto="));
  const closed = await camera(page);
  assert.equal(closed.camera, focused.camera);
  results.push(
    "Busca sem acento enquadra Preparação. O código 28.1 abre a cobertura. Escape conserva a posição.",
  );
  // Pick the same point on the mesh after the drawer closes and the viewport changes.
  const footprint = geometry.find((p) => p.id === "cobertura-28.1"),
    pt = footprint.footprint
      .reduce((v, [x, z]) => v.add(new THREE.Vector3(x, 0, z)), new THREE.Vector3())
      .multiplyScalar(1 / footprint.footprint.length);
  pt.y = footprint.eave + footprint.rise;
  const cam = new THREE.PerspectiveCamera(
    Number(closed.fov),
    closed.width / closed.height,
    0.1,
    10000,
  );
  cam.position.fromArray(closed.camera.split(",").map(Number));
  cam.lookAt(...closed.target.split(",").map(Number));
  cam.updateMatrixWorld();
  pt.project(cam);
  const next = await canvas(page).boundingBox();
  await page.mouse.click(
    next.x + (pt.x * 0.5 + 0.5) * next.width,
    next.y + (0.5 - pt.y * 0.5) * next.height,
  );
  await page.waitForURL(/objeto=cobertura-28.1/);
  await page.getByRole("button", { name: "Fechar ficha" }).click();
  results.push("Raycast sobre a cumeeira resolve cobertura-28.1.");
  await compareMenu(page);
  await page.getByRole("button", { name: /Vista DJI 0044/ }).click();
  await capture(page, "dji-0044");
  await compareMenu(page);
  await page.getByRole("button", { name: /Encontro de coberturas/ }).click();
  await capture(page, "encontro-11-56");
  if (process.env.CRUZ_LAYOUT_A1) {
    await compareMenu(page);
    await page.locator(".ca-comparison input[type=file]").setInputFiles(process.env.CRUZ_LAYOUT_A1);
    await page.getByRole("button", { name: "Remover comparação" }).waitFor({ timeout: 65000 });
    await page.getByRole("slider", { name: /Opacidade/ }).fill("0.65");
    assert.equal((await camera(page)).mode, "planta");
    await page.getByRole("button", { name: "Remover comparação" }).click();
    await page.getByRole("button", { name: "Fechar camadas" }).click();
    results.push(
      "Hash, recorte fotográfico e sobreposição do PDF A1 local na planta com opacidade ajustável.",
    );
  }
  if (process.env.CRUZ_DJI_44) {
    await compareMenu(page);
    await page.locator(".ca-comparison input[type=file]").setInputFiles(process.env.CRUZ_DJI_44);
    await page.getByRole("button", { name: "Remover comparação" }).waitFor();
    await page.getByRole("slider", { name: /Opacidade/ }).fill("0.45");
    await page.getByRole("button", { name: "Fechar camadas" }).click();
    await stable(page);
    assert(await page.locator(".ca-drone-overlay").isVisible());
    await page.mouse.move(x, y);
    await page.mouse.wheel(0, -100);
    await stable(page);
    assert(!(await page.locator(".ca-drone-overlay").isVisible()));
    results.push(
      "DJI 0044 autenticada por hash no navegador, opacidade variável e retirada automática ao mover a câmera.",
    );
  }
  await page.getByRole("button", { name: "Pátio", exact: true }).click();
  await stable(page);
  const yard = await camera(page);
  assert.equal(yard.camera.split(",")[1], "1.700");
  await canvas(page).focus();
  await page.keyboard.down("w");
  await page.waitForTimeout(520);
  await page.keyboard.up("w");
  await stable(page);
  assert.notEqual((await camera(page)).camera, yard.camera);
  results.push("Passeio ao nível do pátio com deslocamento pelo teclado.");
  const mobile = await browser.newPage({
    viewport: { width: 390, height: 844 },
    isMobile: true,
    hasTouch: true,
    reducedMotion: "reduce",
  });
  await mobile.goto(route, { waitUntil: "domcontentloaded" });
  await mobile.locator("canvas[data-camera]").waitFor();
  const cdp = await mobile.context().newCDPSession(mobile);
  for (const [type, points] of [
    [
      "touchStart",
      [
        { x: 140, y: 380 },
        { x: 240, y: 380 },
      ],
    ],
    [
      "touchMove",
      [
        { x: 105, y: 380 },
        { x: 275, y: 380 },
      ],
    ],
    ["touchEnd", []],
  ])
    await cdp.send("Input.dispatchTouchEvent", { type, touchPoints: points });
  await stable(mobile);
  assert(!mobile.url().includes("objeto="));
  await mobile.getByRole("searchbox").fill("armazem 01");
  await mobile.getByRole("searchbox").press("Enter");
  await mobile.waitForURL(/objeto=estrutura-armazem-01/);
  await capture(mobile, "celular");
  const close = await mobile.getByRole("button", { name: "Fechar ficha" }).boundingBox();
  assert(close.width >= 44 && close.height >= 44);
  assert(await mobile.evaluate(() => document.documentElement.scrollWidth <= innerWidth));
  results.push(
    "Pinça mantém a cena. Em 390 × 844 a ficha permanece selecionável, sem transbordamento e com X ≥44 px.",
  );
  const plain = await browser.newPage();
  await plain.addInitScript(() => {
    const original = HTMLCanvasElement.prototype.getContext;
    HTMLCanvasElement.prototype.getContext = function (type, ...args) {
      return String(type).startsWith("webgl") ? null : original.call(this, type, ...args);
    };
  });
  await plain.goto(route);
  await plain.getByText(/visualização 3D está indisponível/).waitFor();
  await plain.getByRole("searchbox").fill("28.1");
  await plain.getByRole("searchbox").press("Enter");
  await plain.waitForURL(/objeto=cobertura-28.1/);
  results.push("Sem WebGL, a lista abre a mesma cobertura 28.1.");
  await page.getByRole("button", { name: "Ver toda a unidade" }).click();
  await canvas(page).evaluate((el) =>
    el.getContext("webgl2").getExtension("WEBGL_lose_context").loseContext(),
  );
  await page.getByText(/placa gráfica foi interrompida/).waitFor();
  await page.getByRole("button", { name: "Reabrir 3D" }).click();
  await page.locator("canvas[data-camera]").waitFor();
  results.push("Perda de WebGL com planta de contingência e reconstrução do contexto.");
  assert.deepEqual(errors, []);
  await writeFile(
    path.join(output, "teste-visual.json"),
    JSON.stringify(
      {
        ambiente: "Chromium headless, WebGL via SwiftShader, aplicação local, sem login",
        chromium: browser.version(),
        results,
        cameras,
        errors,
      },
      null,
      2,
    ) + "\n",
  );
  console.log(JSON.stringify({ checks: results.length, snapshots: Object.keys(cameras), errors }));
} finally {
  await browser.close();
}
