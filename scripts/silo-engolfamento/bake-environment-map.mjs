/** Offline bake of the original two-colour Nexus PMREM, with a GPU round trip.
 * Run alone, without another browser/GPU benchmark. No external images or HDR.
 * node scripts/silo-engolfamento/bake-environment-map.mjs */
import assert from "node:assert/strict";
import { createHash } from "node:crypto";
import { createServer } from "node:http";
import { mkdir, readFile, writeFile } from "node:fs/promises";
import { deflateSync } from "node:zlib";
import { chromium } from "@playwright/test";

const output = "public/models/silo-engolfamento/environment-pmrem-256.png";
const evidence = "docs/silo-engolfamento/evidence/upgrade/environment-map";
await mkdir(evidence, { recursive: true });
const crcTable = Uint32Array.from({ length: 256 }, (_, index) => {
  let c = index;
  for (let i = 0; i < 8; i++) c = c & 1 ? 0xedb88320 ^ (c >>> 1) : c >>> 1;
  return c >>> 0;
});
const chunk = (type, data) => {
  const name = Buffer.from(type),
    body = Buffer.concat([name, data]);
  let crc = 0xffffffff;
  for (const value of body) crc = crcTable[(crc ^ value) & 255] ^ (crc >>> 8);
  const length = Buffer.alloc(4),
    checksum = Buffer.alloc(4);
  length.writeUInt32BE(data.length);
  checksum.writeUInt32BE((crc ^ 0xffffffff) >>> 0);
  return Buffer.concat([length, body, checksum]);
};
const png = (pixels, width, height, flipRows = false) => {
  const header = Buffer.alloc(13);
  header.writeUInt32BE(width, 0);
  header.writeUInt32BE(height, 4);
  header[8] = 8;
  header[9] = 6; // RGBA8. Deliberately no sRGB/gAMA/ICC metadata: linear samples.
  const rows = Buffer.alloc((width * 4 + 1) * height);
  for (let y = 0; y < height; y++) {
    const sourceY = flipRows ? height - 1 - y : y;
    rows[y * (width * 4 + 1)] = 0;
    pixels.copy(rows, y * (width * 4 + 1) + 1, sourceY * width * 4, (sourceY + 1) * width * 4);
  }
  return Buffer.concat([
    Buffer.from([137, 80, 78, 71, 13, 10, 26, 10]),
    chunk("IHDR", header),
    chunk("IDAT", deflateSync(rows, { level: 9 })),
    chunk("IEND", Buffer.alloc(0)),
  ]);
};
const server = createServer(async (request, response) => {
  try {
    const url = new URL(request.url, "http://localhost");
    if (url.pathname === "/") {
      response.setHeader("Content-Type", "text/html; charset=utf-8");
      response.end("<!doctype html><title>Nexus original environment bake</title>");
    } else if (["/three.module.js", "/three.core.js"].includes(url.pathname)) {
      response.setHeader("Content-Type", "text/javascript; charset=utf-8");
      response.end(await readFile(`node_modules/three/build${url.pathname}`));
    } else if (url.pathname === "/environment.png") {
      response.setHeader("Content-Type", "image/png");
      response.end(await readFile(output));
    } else {
      response.statusCode = 404;
      response.end();
    }
  } catch (error) {
    response.statusCode = 500;
    response.end(String(error));
  }
});
await new Promise((resolve) => server.listen(0, "127.0.0.1", resolve));
const base = `http://127.0.0.1:${server.address().port}`;
const browser = await chromium.launch({ channel: "chrome", headless: true });
const page = await browser.newPage({ viewport: { width: 768, height: 512 }, deviceScaleFactor: 1 });
const errors = [];
page.on("pageerror", (error) => errors.push(error.message));
const hash = (bytes) => createHash("sha256").update(bytes).digest("hex");
try {
  await page.goto(base, { waitUntil: "load" });
  const baked = await page.evaluate(async () => {
    const T = await import("/three.module.js");
    const renderer = new T.WebGLRenderer({ antialias: false, preserveDrawingBuffer: true });
    renderer.outputColorSpace = T.SRGBColorSpace;
    renderer.toneMapping = T.ACESFilmicToneMapping;
    renderer.toneMappingExposure = 1.05;
    renderer.setSize(768, 512);
    const scene = new T.Scene();
    scene.background = new T.Color("#cad8dc");
    const floor = new T.Mesh(
      new T.PlaneGeometry(100, 100),
      new T.MeshBasicMaterial({ color: "#6c7668" }),
    );
    floor.rotation.x = -Math.PI / 2;
    floor.position.y = -1;
    scene.add(floor);
    const generator = new T.PMREMGenerator(renderer);
    const start = performance.now();
    const target = generator.fromScene(scene, 0.15, 0.1, 100, { size: 256 });
    const half = new Uint16Array(target.width * target.height * 4);
    await renderer.readRenderTargetPixelsAsync(target, 0, 0, target.width, target.height, half);
    const pixels = new Uint8Array(half.length);
    let maximumError = 0,
      squaredError = 0,
      minimum = Infinity,
      maximum = -Infinity,
      clippedSamples = 0;
    for (let i = 0; i < half.length; i++) {
      const value = T.DataUtils.fromHalfFloat(half[i]);
      if (!Number.isFinite(value)) throw new Error("PMREM contains non-finite samples");
      if (i % 4 !== 3) {
        minimum = Math.min(minimum, value);
        maximum = Math.max(maximum, value);
      }
      if (value < 0 || value > 1) clippedSamples++;
      pixels[i] = Math.round(Math.min(1, Math.max(0, value)) * 255);
      const error = Math.abs(pixels[i] / 255 - value);
      maximumError = Math.max(maximumError, error);
      squaredError += error * error;
    }
    const toBase64 = (array) => {
      let binary = "";
      for (let i = 0; i < array.length; i += 32768)
        binary += String.fromCharCode(...array.subarray(i, i + 32768));
      return btoa(binary);
    };
    const gl = renderer.getContext(),
      extension = gl.getExtension("WEBGL_debug_renderer_info");
    window.__bake = { T, renderer, target, generator, floor, pixels, toBase64 };
    return {
      width: target.width,
      height: target.height,
      generationAndReadbackMs: performance.now() - start,
      renderer: extension ? gl.getParameter(extension.UNMASKED_RENDERER_WEBGL) : "unavailable",
      revision: T.REVISION,
      quantization: {
        sourceType: "RGBA16F linear-sRGB",
        outputType: "RGBA8 linear-sRGB",
        minimumRGB: minimum,
        maximumRGB: maximum,
        clippedSamples,
        maximumAbsoluteError: maximumError,
        rootMeanSquaredError: Math.sqrt(squaredError / half.length),
        theoreticalMaximumError: 1 / 510,
        sourceSamples: half.length,
      },
      pixels: toBase64(pixels),
    };
  });
  assert.equal(baked.width, 768);
  assert.equal(baked.height, 1024);
  assert.equal(baked.revision, "186");
  assert.equal(baked.quantization.clippedSamples, 0, "environment must not need HDR clipping");
  assert.ok(baked.quantization.maximumAbsoluteError <= 1 / 510 + 1e-12);
  const pixels = Buffer.from(baked.pixels, "base64");
  const encoded = png(pixels, baked.width, baked.height);
  await writeFile(output, encoded);
  const comparison = await page.evaluate(async () => {
    const { T, renderer, target, toBase64 } = window.__bake;
    const image = await createImageBitmap(await (await fetch("/environment.png")).blob(), {
      colorSpaceConversion: "none",
      premultiplyAlpha: "none",
      imageOrientation: "none",
    });
    const texture = new T.Texture(image);
    texture.mapping = T.CubeUVReflectionMapping;
    texture.colorSpace = T.LinearSRGBColorSpace;
    texture.flipY = false;
    texture.generateMipmaps = false;
    texture.minFilter = texture.magFilter = T.LinearFilter;
    texture.needsUpdate = true;
    const probe = new T.Scene();
    probe.background = new T.Color("#bac6c3");
    probe.add(new T.HemisphereLight("#dce8ee", "#69765d", 1.3));
    const sun = new T.DirectionalLight("#fff5dc", 2.7);
    sun.position.set(-3, 5, 2);
    probe.add(sun);
    const materials = [
      new T.MeshStandardMaterial({ color: "#b7c0c0", metalness: 0.62, roughness: 0.74 }),
      new T.MeshStandardMaterial({ color: "#b5c2c6", metalness: 0.84, roughness: 0.32 }),
      new T.MeshStandardMaterial({ color: "#829c3d", metalness: 0.42, roughness: 0.49 }),
    ];
    const geometry = new T.SphereGeometry(0.8, 40, 32);
    materials.forEach((material, i) => {
      const mesh = new T.Mesh(geometry, material);
      mesh.position.set((i - 1) * 1.8, 0, 0);
      probe.add(mesh);
    });
    const camera = new T.PerspectiveCamera(35, 768 / 512, 0.1, 100);
    camera.position.set(0, 0.8, 9);
    camera.lookAt(0, 0, 0);
    const before = new Uint8Array(768 * 512 * 4),
      after = new Uint8Array(before.length),
      gl = renderer.getContext();
    probe.environment = target.texture;
    renderer.render(probe, camera);
    gl.readPixels(0, 0, 768, 512, gl.RGBA, gl.UNSIGNED_BYTE, before);
    probe.environment = texture;
    renderer.render(probe, camera);
    gl.readPixels(0, 0, 768, 512, gl.RGBA, gl.UNSIGNED_BYTE, after);
    let maximumChannelDifference = 0,
      absoluteSum = 0,
      changedRGBSamples = 0;
    for (let i = 0; i < before.length; i++) {
      if (i % 4 === 3) continue;
      const d = Math.abs(before[i] - after[i]);
      maximumChannelDifference = Math.max(maximumChannelDifference, d);
      absoluteSum += d;
      if (d) changedRGBSamples++;
    }
    const result = {
      width: 768,
      height: 512,
      maximumChannelDifference,
      meanAbsoluteRGBDifference: absoluteSum / ((before.length * 3) / 4),
      changedRGBSamples,
      totalRGBSamples: (before.length * 3) / 4,
      before: toBase64(before),
      after: toBase64(after),
      glError: gl.getError(),
    };
    texture.dispose();
    image.close();
    geometry.dispose();
    materials.forEach((material) => material.dispose());
    const bake = window.__bake;
    bake.target.dispose();
    bake.generator.dispose();
    bake.floor.geometry.dispose();
    bake.floor.material.dispose();
    renderer.dispose();
    renderer.forceContextLoss();
    return result;
  });
  assert.equal(comparison.glError, 0);
  assert.ok(comparison.maximumChannelDifference <= 3, "baked PNG changes probe reflections");
  assert.ok(comparison.meanAbsoluteRGBDifference < 0.25);
  await writeFile(
    `${evidence}/source-probes.png`,
    png(Buffer.from(comparison.before, "base64"), comparison.width, comparison.height, true),
  );
  await writeFile(
    `${evidence}/baked-probes.png`,
    png(Buffer.from(comparison.after, "base64"), comparison.width, comparison.height, true),
  );
  const { pixels: _, ...measurements } = baked;
  const { before: _before, after: _after, ...comparisonMetrics } = comparison;
  const manifest = {
    schema: "nexus-procedural-environment/1.0.0",
    generatedAt: new Date().toISOString(),
    origin: "Original Nexus procedural scene: two colours and one plane, no third-party imagery",
    license: "Nexus project-generated resource; no independent asset licence specified",
    asset: { path: output, bytes: encoded.length, sha256: hash(encoded) },
    generator: {
      path: "scripts/silo-engolfamento/bake-environment-map.mjs",
      sha256: hash(await readFile("scripts/silo-engolfamento/bake-environment-map.mjs")),
      threeVersion: "0.186.0",
      background: "#cad8dc",
      floor: { colour: "#6c7668", width: 100, height: 100, y: -1, rotateX: -Math.PI / 2 },
      pmrem: { size: 256, sigma: 0.15, near: 0.1, far: 100 },
    },
    upload: {
      mapping: "CubeUVReflectionMapping",
      colourSpace: "LinearSRGBColorSpace",
      flipY: false,
      minFilter: "LinearFilter",
      magFilter: "LinearFilter",
      generateMipmaps: false,
      pngColourMetadata: "None; row0 preserves GPU row0; no display gamma conversion",
    },
    ...measurements,
    browser: browser.version(),
    comparison: comparisonMetrics,
    errors,
  };
  assert.equal(errors.length, 0);
  await writeFile(`${evidence}/bake.json`, `${JSON.stringify(manifest, null, 2)}\n`);
  await writeFile(
    "public/models/silo-engolfamento/environment-pmrem-256.manifest.json",
    `${JSON.stringify(manifest, null, 2)}\n`,
  );
  console.log(
    JSON.stringify({
      asset: manifest.asset,
      quantization: baked.quantization,
      comparison: comparisonMetrics,
    }),
  );
} finally {
  await browser.close();
  await new Promise((resolve) => server.close(resolve));
}
