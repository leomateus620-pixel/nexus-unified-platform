import * as T from "three";
import { mergeGeometries } from "three/examples/jsm/utils/BufferGeometryUtils.js";
import { SVGLoader } from "three/examples/jsm/loaders/SVGLoader.js";
import unionArtwork from "./assets/union-facade.svg?raw";
import cotrirosaArtwork from "./assets/cotrirosa-facade.svg?raw";
import { GRAPHICS_PROFILES, type GraphicsProfile } from "./graphics";
import type { SceneManifest, SiloPlacement, Vec3, Vec2 } from "./types";
import { visualGroundHeight } from "./terrain";
import { conformTerrain } from "./terrain-mesh";
import { sa05Access, sa05Connections } from "./sa05-access";
import { junctionContours, outsideConvex } from "./junction";

/** Static geometry is batched by material per selectable physical instance. */
class Batch {
  parts = new Map<T.Material, T.BufferGeometry[]>();
  add(g: T.BufferGeometry, m: T.Material, p: Vec3 = [0, 0, 0], rotation?: T.Quaternion) {
    g.applyMatrix4(
      new T.Matrix4().compose(
        new T.Vector3(...p),
        rotation ?? new T.Quaternion(),
        new T.Vector3(1, 1, 1),
      ),
    );
    const repeat = m.userData["meters"] as number | undefined;
    if (repeat) {
      const pos = g.getAttribute("position"),
        normal = g.getAttribute("normal"),
        uv = g.getAttribute("uv");
      for (let i = 0; i < pos.count; i++) {
        const ny = Math.abs(normal.getY(i)),
          nx = Math.abs(normal.getX(i));
        uv.setXY(
          i,
          (ny > 0.5 ? pos.getX(i) : nx > 0.5 ? pos.getZ(i) : pos.getX(i)) / repeat,
          (ny > 0.5 ? pos.getZ(i) : pos.getY(i)) / repeat,
        );
      }
    }
    // Shape/road/primitive geometries must use the same indexing convention.
    // A mixed batch otherwise makes Three reject the entire material group.
    const normalized = g.index ? g.toNonIndexed() : g;
    if (normalized !== g) g.dispose();
    const geometries = this.parts.get(m) ?? [];
    geometries.push(normalized);
    this.parts.set(m, geometries);
  }
  box(size: Vec3, p: Vec3, m: T.Material) {
    this.add(new T.BoxGeometry(...size), m, p);
  }
  beam(a: Vec3, b: Vec3, width: number, m: T.Material, depth = width) {
    const from = new T.Vector3(...a),
      to = new T.Vector3(...b),
      direction = to.clone().sub(from);
    this.add(
      new T.BoxGeometry(width, direction.length(), depth),
      m,
      from.add(to).multiplyScalar(0.5).toArray() as Vec3,
      new T.Quaternion().setFromUnitVectors(new T.Vector3(0, 1, 0), direction.normalize()),
    );
  }
  cylinder(top: number, bottom: number, h: number, p: Vec3, m: T.Material, n = 40) {
    this.add(new T.CylinderGeometry(top, bottom, h, n), m, p);
  }
  tube(a: Vec3, b: Vec3, radius: number, m: T.Material, segments = 20) {
    const from = new T.Vector3(...a),
      to = new T.Vector3(...b),
      delta = to.clone().sub(from);
    this.add(
      new T.CylinderGeometry(radius, radius, delta.length(), segments),
      m,
      from.add(to).multiplyScalar(0.5).toArray() as Vec3,
      new T.Quaternion().setFromUnitVectors(new T.Vector3(0, 1, 0), delta.normalize()),
    );
  }
  finish(key?: string) {
    const group = new T.Group();
    group.userData["sceneKey"] = key;
    for (const [material, geometries] of this.parts) {
      const merged = mergeGeometries(geometries);
      if (merged) {
        const mesh = new T.Mesh(merged, material);
        mesh.castShadow = true;
        mesh.receiveShadow = true;
        group.add(mesh);
      }
      geometries.forEach((g) => g.dispose());
    }
    return group;
  }
}
function surface(color: string, metalness = 0, roughness = 0.85) {
  return new T.MeshStandardMaterial({ color, metalness, roughness });
}
function openMesh(kind: "fence" | "grating") {
  const canvas = document.createElement("canvas");
  canvas.width = canvas.height = 128;
  const ctx = canvas.getContext("2d")!;
  ctx.fillStyle = "#000";
  ctx.fillRect(0, 0, 128, 128);
  ctx.strokeStyle = "#fff";
  ctx.lineWidth = kind === "fence" ? 3 : 12;
  for (let x = -128; x <= 256; x += kind === "fence" ? 64 : 32) {
    ctx.beginPath();
    ctx.moveTo(x, 0);
    ctx.lineTo(x + (kind === "fence" ? 128 : 0), 128);
    ctx.stroke();
    if (kind === "fence") {
      ctx.beginPath();
      ctx.moveTo(x, 0);
      ctx.lineTo(x - 128, 128);
      ctx.stroke();
    } else {
      ctx.lineWidth = 5;
      ctx.beginPath();
      ctx.moveTo(0, x);
      ctx.lineTo(128, x);
      ctx.stroke();
      ctx.lineWidth = 12;
    }
  }
  const alpha = new T.CanvasTexture(canvas);
  alpha.wrapS = alpha.wrapT = T.RepeatWrapping;
  alpha.anisotropy = 4;
  const m = surface("#a4b0af", 0.6, 0.58);
  m.alphaMap = alpha;
  m.alphaTest = 0.35;
  m.alphaToCoverage = true;
  m.side = T.DoubleSide;
  m.userData["meters"] = kind === "fence" ? 0.22 : 0.2;
  return m;
}
function patterned(
  material: T.MeshStandardMaterial,
  kind: "blocks" | "roof" | "concrete" | "grass",
  meters: number,
) {
  const canvas = document.createElement("canvas");
  canvas.width = canvas.height = 256;
  const ctx = canvas.getContext("2d")!;
  ctx.fillStyle = "#c2c2c2";
  ctx.fillRect(0, 0, 256, 256);
  const image = ctx.getImageData(0, 0, 256, 256);
  let seed = 421;
  for (let i = 0; i < image.data.length; i += 4) {
    seed = (seed * 1664525 + 1013904223) >>> 0;
    const x = (i / 4) % 256,
      y = Math.floor(i / 1024);
    const macro =
      kind === "grass"
        ? 3 * Math.sin(x * 0.031) * Math.sin(y * 0.049) + 2 * Math.cos(x * 0.071 + y * 0.057)
        : 2 * Math.sin(x * 0.073 + y * 0.051);
    const v = 196 + macro + ((seed >>> 24) % 25);
    image.data[i] = v;
    image.data[i + 1] = v;
    image.data[i + 2] = v;
    image.data[i + 3] = 255;
  }
  ctx.putImageData(image, 0, 0);
  if (kind === "blocks") {
    ctx.strokeStyle = "#8f8f8f";
    ctx.lineWidth = 1.5;
    for (let y = 0; y < 256; y += 32) {
      ctx.beginPath();
      ctx.moveTo(0, y);
      ctx.lineTo(256, y);
      ctx.stroke();
      for (let x = ((y / 32) % 2) * 32; x < 256; x += 64) {
        ctx.beginPath();
        ctx.moveTo(x, y);
        ctx.lineTo(x, y + 32);
        ctx.stroke();
      }
    }
  }
  if (kind === "roof") {
    for (let x = 0; x < 256; x += 16) {
      ctx.fillStyle = "#aaa";
      ctx.fillRect(x, 0, 2, 256);
      ctx.fillStyle = "#ddd";
      ctx.fillRect(x + 3, 0, 2, 256);
    }
  }
  const map = new T.CanvasTexture(canvas);
  map.wrapS = map.wrapT = T.RepeatWrapping;
  map.colorSpace = T.SRGBColorSpace;
  map.anisotropy = 4;
  material.map = map;
  material.bumpMap = map;
  material.bumpScale = kind === "roof" ? 0.035 : kind === "blocks" ? 0.018 : 0.006;
  material.userData["meters"] = meters;
  return material;
}
function corrugation(height: number) {
  const pixels = new Uint8Array(4 * 128);
  for (let i = 0; i < 128; i++) {
    pixels[i * 4] = 128;
    pixels[i * 4 + 1] = Math.round(128 + Math.cos((i / 128) * Math.PI * 2) * 78);
    pixels[i * 4 + 2] = 239;
    pixels[i * 4 + 3] = 255;
  }
  const texture = new T.DataTexture(pixels, 1, 128, T.RGBAFormat);
  texture.wrapS = texture.wrapT = T.RepeatWrapping;
  texture.repeat.set(1, height / 0.095);
  texture.magFilter = T.LinearFilter;
  texture.minFilter = T.LinearMipmapLinearFilter;
  texture.generateMipmaps = true;
  texture.needsUpdate = true;
  return texture;
}
function cladding(color: string, pitch = 0.2) {
  const m = surface(color, 0.28, 0.48);
  const data = new Uint8Array(128 * 4);
  for (let x = 0; x < 128; x++) {
    const t = x / 128,
      slope = t < 0.15 ? 0 : t < 0.27 ? -0.72 : t < 0.73 ? 0 : t < 0.85 ? 0.72 : 0;
    data.set([128 + Math.round(slope * 100), 128, 235, 255], x * 4);
  }
  const normal = new T.DataTexture(data, 128, 1);
  normal.wrapS = normal.wrapT = T.RepeatWrapping;
  normal.minFilter = T.LinearMipmapLinearFilter;
  normal.magFilter = T.LinearFilter;
  normal.generateMipmaps = true;
  normal.needsUpdate = true;
  normal.anisotropy = 8;
  m.normalMap = normal;
  m.normalScale.set(0.65, 0.65);
  m.userData["meters"] = pitch;
  return m;
}
function galvanizedRoughness() {
  const data = new Uint8Array(64 * 64 * 4);
  let seed = 1907;
  for (let i = 0; i < data.length; i += 4) {
    seed = (seed * 1664525 + 1013904223) >>> 0;
    const v = 205 + (seed >>> 27);
    data.set([v, v, v, 255], i);
  }
  const t = new T.DataTexture(data, 64, 64);
  t.wrapS = t.wrapT = T.RepeatWrapping;
  t.repeat.set(20, 12);
  t.generateMipmaps = true;
  t.minFilter = T.LinearMipmapLinearFilter;
  t.magFilter = T.LinearFilter;
  t.needsUpdate = true;
  return t;
}
function sign(text: string, color: string, background: string, w: number, h: number) {
  const canvas = document.createElement("canvas");
  canvas.width = 1024;
  canvas.height = 256;
  const ctx = canvas.getContext("2d")!;
  ctx.fillStyle = background;
  ctx.fillRect(0, 0, 1024, 256);
  ctx.fillStyle = color;
  ctx.font = "bold 92px Arial";
  ctx.textAlign = "center";
  ctx.textBaseline = "middle";
  ctx.fillText(text, 512, 128, 970);
  const texture = new T.CanvasTexture(canvas);
  texture.colorSpace = T.SRGBColorSpace;
  texture.anisotropy = 4;
  return new T.Mesh(
    new T.PlaneGeometry(w, h),
    new T.MeshStandardMaterial({
      map: texture,
      roughness: 0.8,
      side: T.DoubleSide,
      alphaTest: 0.05,
    }),
  );
}
function facadeIdentity(artwork: string, width: number, height: number) {
  const group = new T.Group();
  group.name = "photo-confirmed-facade-mark";
  const b = new Batch();
  const inks = new Map<string, T.Material>();
  for (const path of new SVGLoader().parse(artwork).paths) {
    const color = `#${path.color.getHexString()}`;
    let material = inks.get(color);
    if (!material) {
      material = surface(color, 0.12, 0.53);
      inks.set(color, material);
    }
    for (const shape of SVGLoader.createShapes(path)) {
      const geometry = new T.ExtrudeGeometry(shape, {
        depth: 0.06,
        bevelEnabled: false,
        curveSegments: 8,
      });
      geometry.scale(width / 600, -height / 280, 1);
      geometry.translate(-width / 2, height / 2, 0);
      b.add(geometry, material);
    }
  }
  group.add(b.finish());
  return group;
}
function railing(b: Batch, from: Vec3, to: Vec3, m: T.Material) {
  const len = new T.Vector3(...from).distanceTo(new T.Vector3(...to));
  for (let i = 0; i <= Math.ceil(len / 1.5); i++) {
    const t = i / Math.ceil(len / 1.5);
    const p: Vec3 = [
      from[0] + (to[0] - from[0]) * t,
      from[1] + (to[1] - from[1]) * t,
      from[2] + (to[2] - from[2]) * t,
    ];
    b.beam(p, [p[0], p[1] + 1.05, p[2]], 0.045, m);
  }
  for (const y of [0.52, 1.05])
    b.beam([from[0], from[1] + y, from[2]], [to[0], to[1] + y, to[2]], 0.045, m);
}
function stairs(
  b: Batch,
  x: number,
  y: number,
  z: number,
  rise: number,
  run: number,
  m: T.Material,
  steel: T.Material,
) {
  const steps = Math.ceil(rise / 0.22);
  for (let i = 0; i <= steps; i++)
    b.box([1, 0.07, run / steps], [x, y + (rise * i) / steps, z - (run * i) / steps], steel);
  for (const dx of [-0.55, 0.55]) {
    b.beam([x + dx, y, z], [x + dx, y + rise, z - run], 0.12, steel);
    railing(b, [x + dx, y, z], [x + dx, y + rise, z - run], m);
  }
}
function walkingFloor(
  floors: Batch,
  center: Vec3,
  angle: number,
  width: number,
  depth: number,
  material: T.Material,
) {
  floors.add(
    new T.BoxGeometry(width, 0.065, depth),
    material,
    [center[0], center[1] - 0.0325, center[2]],
    new T.Quaternion().setFromEuler(new T.Euler(0, -angle, 0)),
  );
}
function floorLevels(floors: Batch, m: ReturnType<typeof palette>) {
  const close = floors.finish(),
    far = close.clone();
  far.traverse((object) => {
    if (object instanceof T.Mesh) object.material = m.tread;
  });
  const lod = new T.LOD();
  lod.userData["floorDetail"] = true;
  lod.addLevel(close, 0);
  lod.addLevel(far, 48, 0.1);
  return lod;
}
function cornAccess(b: Batch, floors: Batch, s: SiloPlacement, m: ReturnType<typeof palette>) {
  const a = sa05Access(s),
    r = s.diameter / 2;
  for (const section of a.segments) {
    const n = section.kind === "flight" ? Math.ceil((section.high - section.low) / 0.205) : 7;
    const edge = (t: number, side: number, offset = 0) =>
      a.point(
        section.from + (section.to - section.from) * t,
        section.low + (section.high - section.low) * t + offset,
        a.radius + (side * a.width) / 2,
      );
    for (let i = 1; i <= n; i++) {
      const t = i / n,
        angle = section.from + ((section.to - section.from) * (i - 0.5)) / n;
      walkingFloor(
        floors,
        a.point(angle, section.low + (section.high - section.low) * t),
        angle,
        a.width,
        (a.radius * Math.abs(section.to - section.from)) / n + 0.025,
        m.grating,
      );
      for (const side of [-1, 1]) {
        b.beam(edge((i - 1) / n, side, -0.16), edge(t, side, -0.16), 0.1, m.stringer, 0.15);
        for (const h of [0.52, 1.05])
          b.tube(edge((i - 1) / n, side, h), edge(t, side, h), 0.022, m.yellow, 8);
        b.beam(edge((i - 1) / n, side, 0.08), edge(t, side, 0.08), 0.035, m.yellow, 0.12);
        if (i === 1 || i === n || i % 5 === 0)
          b.tube(edge(t, side), edge(t, side, 1.05), 0.024, m.yellow, 8);
      }
    }
    if (section.kind === "landing") {
      const angle = (section.from + section.to) / 2;
      b.beam(
        a.point(angle, section.low - 0.2, r + 0.02),
        a.point(angle, section.low - 0.2, a.radius + 0.5),
        0.12,
        m.stringer,
      );
      b.beam(
        a.point(angle, section.low - 1.15, r + 0.03),
        a.point(angle, section.low - 0.2, a.radius + 0.48),
        0.09,
        m.stringer,
      );
      b.box([0.2, 0.32, 0.12], a.point(angle, section.low - 0.8, r + 0.04), m.steel);
    }
  }
  // Lower access, body flight and roof exit have separate, shared endpoints.
  const [x, y] = a.lower,
    entry = a.groundEntry;
  const lowerEndZ = -0.45;
  const n = Math.ceil((y - entry[1]) / 0.205);
  for (let i = 1; i <= n; i++)
    walkingFloor(
      floors,
      [x, entry[1] + ((y - entry[1]) * i) / n, entry[2] + ((lowerEndZ - entry[2]) * (i - 0.5)) / n],
      0,
      1,
      (lowerEndZ - entry[2]) / n + 0.025,
      m.grating,
    );
  for (const side of [-0.5, 0.5]) {
    const from: Vec3 = [x + side, entry[1], entry[2]],
      to: Vec3 = [x + side, y, lowerEndZ];
    b.beam(from, to, 0.12, m.stringer, 0.18);
    railing(b, from, to, m.yellow);
  }
  // Hatch platform is level with the first body step; hatch itself never moves.
  walkingFloor(floors, [x, y, 0.35], 0, 1.15, 1.65, m.grating);
  railing(b, [x - 0.58, y, -0.45], [x - 0.58, y, 1.18], m.yellow);
  for (const zz of [-0.35, 1.05]) {
    b.beam([x - 0.55, 0.45, zz], [x - 0.55, y - 0.1, zz], 0.13, m.steel);
    b.beam([x - 0.55, y - 0.15, zz], [-r + 0.05, y - 0.15, zz], 0.13, m.stringer);
  }
  const upper = a.upper,
    rim = a.point(a.end, a.top + 0.08, r - 0.12);
  walkingFloor(
    floors,
    [(upper[0] + rim[0]) / 2, upper[1], (upper[2] + rim[2]) / 2],
    a.end + Math.PI / 2,
    1.05,
    0.93,
    m.grating,
  );
  for (const side of [-0.52, 0.52]) {
    const dx = -Math.sin(a.end) * side,
      dz = Math.cos(a.end) * side;
    railing(
      b,
      [upper[0] + dx, upper[1], upper[2] + dz],
      [rim[0] + dx, rim[1], rim[2] + dz],
      m.yellow,
    );
  }
  const roofEnd = a.roofLanding,
    roofSteps = 9;
  for (let i = 0; i < roofSteps; i++) {
    const t = (i + 0.5) / roofSteps;
    walkingFloor(
      floors,
      [rim[0] * (1 - t), rim[1] + ((roofEnd[1] - rim[1]) * (i + 1)) / roofSteps, rim[2] * (1 - t)],
      a.end + Math.PI / 2,
      0.95,
      Math.hypot(rim[0], rim[2]) / roofSteps + 0.025,
      m.grating,
    );
  }
  for (const side of [-0.52, 0.52]) {
    const dx = -Math.sin(a.end) * side,
      dz = Math.cos(a.end) * side;
    const from: Vec3 = [rim[0] + dx, rim[1], rim[2] + dz],
      to: Vec3 = [dx, roofEnd[1], dz];
    b.beam(from, to, 0.1, m.stringer);
    railing(b, from, to, m.yellow);
  }
  walkingFloor(floors, roofEnd, 0, 2.1, 2.1, m.grating);
  for (const zz of [-1.05, 1.05])
    railing(b, [-1.05, roofEnd[1], zz], [1.05, roofEnd[1], zz], m.yellow);
  railing(b, [-1.05, roofEnd[1], -1.05], [-1.05, roofEnd[1], 1.05], m.yellow);
  for (let i = 0; i < 8; i++) {
    const angle = (i * Math.PI) / 4;
    b.beam(
      a.point(angle, a.top + 0.05, r),
      [Math.cos(angle) * 0.7, a.top + s.roof - 0.1, Math.sin(angle) * 0.7],
      0.055,
      m.steel,
    );
    b.box([0.5, 0.12, 0.3], a.point(angle, a.top + 0.55, r * 0.63), m.red);
  }
  b.box(
    [0.8, 0.1, 0.72],
    [rim[0] * 0.65, a.top + s.roof * 0.4 + 0.12, rim[2] * 0.65 + 0.7],
    m.yellow,
  );
}
function connectionTower(s: SiloPlacement, m: ReturnType<typeof palette>) {
  const { origin, deck, towerSocket, siloSocket, diameter } = sa05Connections(s);
  const b = new Batch(),
    floors = new Batch();
  const world = (x: number, y: number, z: number): Vec3 => [
    origin[0] + x,
    origin[1] + y,
    origin[2] + z,
  ];
  // Twin elevator casing distinct from its external steel supports.
  for (const x of [-0.29, 0.29])
    b.box([0.42, deck + 0.45, 0.56], world(x, (deck + 0.45) / 2, 0), m.towerCase);
  for (const x of [-0.64, 0.64])
    for (const z of [-0.48, 0.48]) {
      b.beam(world(x, 0.25, z), world(x, deck + 0.3, z), 0.1, m.steel);
      b.box([0.4, 0.18, 0.4], world(x, 0.16, z), m.concrete);
    }
  for (let y = 0.8; y < deck - 1; y += 2.6) {
    for (const z of [-0.48, 0.48]) b.beam(world(-0.64, y, z), world(0.64, y, z), 0.075, m.steel);
    b.beam(world(-0.64, y, -0.48), world(-0.64, Math.min(deck, y + 2.6), 0.48), 0.055, m.steel);
    b.beam(world(0.64, y, 0.48), world(0.64, Math.min(deck, y + 2.6), -0.48), 0.055, m.steel);
    b.box([0.88, 0.06, 0.64], world(0, y, 0), m.dark);
  }
  const levels = [10.1, 17.7, 25.3, deck];
  for (let i = 0; i < levels.length; i++) {
    const y = levels[i]!,
      side = i % 2 ? 1 : -1,
      centerX = i === 3 ? 0 : side * 0.55;
    const width = i === 3 || i === 1 ? 3.9 : 2.35,
      depth = i === 3 ? 2.65 : 1.8;
    walkingFloor(floors, world(centerX, y, 0), 0, width, depth, m.grating);
    for (const zz of [-depth / 2, depth / 2]) {
      // The ladder enters from +Z; keep its 0.65m opening.
      if (zz > 0) {
        railing(b, world(centerX - width / 2, y, zz), world(-0.34, y, zz), m.yellow);
        railing(b, world(0.34, y, zz), world(centerX + width / 2, y, zz), m.yellow);
      } else
        railing(b, world(centerX - width / 2, y, zz), world(centerX + width / 2, y, zz), m.yellow);
      b.beam(
        world(centerX - width / 2, y - 0.13, zz),
        world(centerX + width / 2, y - 0.13, zz),
        0.12,
        m.stringer,
        0.2,
      );
    }
    for (const xx of [centerX - width / 2, centerX + width / 2]) {
      railing(b, world(xx, y, -depth / 2), world(xx, y, depth / 2), m.yellow);
      b.beam(world(Math.sign(xx) * 0.6, y - 1.1, 0), world(xx, y - 0.18, 0), 0.09, m.steel);
    }
  }
  for (const x of [-0.28, 0.28])
    b.beam(world(x, 0.45, 0.84), world(x, deck + 1, 0.84), 0.055, m.steel);
  for (let y = 0.7; y < deck + 0.9; y += 0.3)
    b.tube(world(-0.28, y, 0.84), world(0.28, y, 0.84), 0.018, m.steel, 8);
  for (let y = 9.3; y < deck + 0.8; y += 0.9)
    b.add(
      new T.TorusGeometry(0.41, 0.022, 5, 18, Math.PI * 1.55),
      m.yellow,
      world(0, y, 1.01),
      new T.Quaternion().setFromEuler(new T.Euler(Math.PI / 2, 0, 0.72)),
    );
  for (const x of [-0.38, 0.38])
    b.beam(world(x, 9, 1.25), world(x, deck + 0.8, 1.25), 0.035, m.yellow);
  for (const y of [18.3, deck + 0.55]) {
    b.box([0.78, 0.9, 0.76], world(0.2, y, 0), m.blue);
    b.cylinder(0.38, 0.38, 0.34, world(0.2, y + 0.35, 0), m.blue, 20);
    b.box([0.28, 0.45, 0.55], world(0.82, y - 0.12, 0), m.dark);
  }
  b.tube(towerSocket, siloSocket, diameter / 2, m.pipe, 28);
  const direction = new T.Vector3(...towerSocket).sub(new T.Vector3(...siloSocket));
  for (const t of [0, 0.24, 0.49, 0.74, 1]) {
    const center = new T.Vector3(...siloSocket).addScaledVector(direction, t);
    const along = direction.clone().normalize().multiplyScalar(0.055);
    b.tube(
      center.clone().sub(along).toArray() as Vec3,
      center.clone().add(along).toArray() as Vec3,
      diameter * 0.57,
      m.steel,
      24,
    );
  }
  b.tube([siloSocket[0], siloSocket[1] - 0.5, siloSocket[2]], siloSocket, diameter * 0.52, m.pipe);
  const group = b.finish("sa05");
  group.name = "sa05-connection-tower";
  group.userData["sockets"] = { towerSocket, siloSocket };
  group.add(floorLevels(floors, m));
  return group;
}
function silo(s: SiloPlacement, materials: ReturnType<typeof palette>) {
  const { steel, cone, yellow, green, red, dark, smallShell, bigShell } = materials;
  const b = new Batch(),
    floors = new Batch(),
    r = s.diameter / 2,
    bottom = s.clearance + s.cone,
    top = bottom + s.straight;
  b.cylinder(r + 0.65, r + 0.65, 0.36, [0, 0.18, 0], green);
  b.cylinder(r + 0.57, r + 0.57, 0.08, [0, 0.4, 0], materials.baseFloor);
  b.cylinder(
    r,
    r,
    s.straight,
    [0, bottom + s.straight / 2, 0],
    s.key === "sa05" ? bigShell : smallShell,
    64,
  );
  b.cylinder(r, 0.25, s.cone, [0, s.clearance + s.cone / 2, 0], cone, 64);
  b.cylinder(0.1, r + 0.12, s.roof, [0, top + s.roof / 2, 0], steel, 64);
  b.cylinder(0.27, 0.27, 0.65, [0, s.clearance - 0.32, 0], dark, 16);
  b.box([0.9, 0.3, 0.65], [0, s.clearance - 0.6, 0], steel);
  b.box([0.43, 0.42, 0.43], [0.55, s.clearance - 0.52, 0], red);
  const legs = s.key === "sa05" ? 10 : 8;
  for (let i = 0; i < legs; i++) {
    const a = (i * Math.PI * 2) / legs,
      next = ((i + 1) * Math.PI * 2) / legs;
    const x = Math.cos(a) * (r + 0.08),
      z = Math.sin(a) * (r + 0.08),
      nx = Math.cos(next) * (r + 0.08),
      nz = Math.sin(next) * (r + 0.08);
    b.beam([x, 0.44, z], [x, bottom + 0.18, z], 0.18, steel, 0.24);
    b.box([0.45, 0.08, 0.45], [x, 0.48, z], steel);
    b.beam([x, 0.8, z], [nx, bottom - 0.35, nz], 0.1, steel);
    b.beam([nx, 0.8, nz], [x, bottom - 0.35, z], 0.1, steel);
    b.beam([x, bottom / 2, z], [nx, bottom / 2, nz], 0.12, steel);
    b.beam([x, bottom, z], [x, top, z], 0.09, steel);
    b.beam(
      [Math.cos(a) * r, top + 0.07, Math.sin(a) * r],
      [Math.cos(next) * r, top + 0.07, Math.sin(next) * r],
      0.07,
      steel,
    );
    if (s.key !== "sa05" || Math.abs(a - 0.3) > 0.4)
      railing(
        b,
        [Math.cos(a) * (r + 0.1), top + 0.08, Math.sin(a) * (r + 0.1)],
        [Math.cos(next) * (r + 0.1), top + 0.08, Math.sin(next) * (r + 0.1)],
        yellow,
      );
  }
  if (s.key === "sa05") {
    cornAccess(b, floors, s, materials);
    // 0.80 m circular hatch; side and elevation remain photo-derived approximations.
    const q = new T.Quaternion().setFromEuler(new T.Euler(0, 0, Math.PI / 2));
    b.add(new T.CylinderGeometry(0.4, 0.4, 0.12, 40), red, [-r - 0.06, bottom + 1.05, 0.9], q);
    b.box([0.16, 0.13, 0.32], [-r - 0.16, bottom + 1.05, 0.48], steel);
    b.beam([-r - 0.23, bottom + 1.65, 0.55], [-r - 0.23, bottom + 1.65, 1.2], 0.045, steel);
  }
  const group = b.finish(s.key);
  group.position.set(...s.position);
  if (s.key === "sa05") group.add(floorLevels(floors, materials));
  const plate = sign(
    s.key === "sa05"
      ? "EC 28 · SA 05 / AS 05"
      : `EC ${24 + Number(s.key.slice(-1)) - 1} · SA 0${s.key.slice(-1)}`,
    "#182b29",
    "#e7e5d9",
    1.35,
    0.25,
  );
  plate.position.set(-r - 0.13, s.key === "sa05" ? bottom + 1.75 : 2, 0);
  plate.rotation.y = -Math.PI / 2;
  const detail = new T.LOD();
  const close = new T.Group(),
    seams = new Batch();
  close.add(plate);
  for (let i = 0; i < 8; i++) {
    const a = (i * Math.PI) / 4;
    seams.beam(
      [Math.cos(a) * (r + 0.015), bottom, Math.sin(a) * (r + 0.015)],
      [Math.cos(a) * 0.27, s.clearance, Math.sin(a) * 0.27],
      0.035,
      steel,
    );
  }
  close.add(seams.finish());
  if (s.key === "sa05") {
    const ribs = new Batch(),
      fixings = new Batch();
    for (let i = 0; i < 24; i++) {
      const angle = (i * Math.PI) / 12,
        x = Math.cos(angle) * (r + 0.045),
        z = Math.sin(angle) * (r + 0.045);
      ribs.beam([x, bottom, z], [x, top, z], 0.095, steel, 0.13);
      for (let y = bottom + 0.3; y < top; y += 1.22)
        fixings.cylinder(0.025, 0.025, 0.035, [x, y, z], steel, 6);
    }
    for (let y = bottom + 1.22; y < top; y += 1.22)
      ribs.add(
        new T.TorusGeometry(r + 0.018, 0.013, 4, 80),
        steel,
        [0, y, 0],
        new T.Quaternion().setFromEuler(new T.Euler(Math.PI / 2, 0, 0)),
      );
    group.add(ribs.finish());
    const bolts = fixings.finish();
    bolts.userData["fineDetail"] = true;
    close.add(bolts);
  }
  detail.addLevel(close, 0);
  detail.addLevel(new T.Group(), 110, 0.1);
  group.add(detail);
  return group;
}
function palette() {
  const smallShell = surface("#c3ccd2", 0.83, 0.47);
  smallShell.normalMap = corrugation(6.6);
  smallShell.normalMap.anisotropy = 8;
  smallShell.normalScale.set(0.62, 0.62);
  smallShell.roughnessMap = galvanizedRoughness();
  smallShell.envMapIntensity = 0.85;
  const bigShell = smallShell.clone();
  bigShell.normalMap = corrugation(16.5);
  return {
    smallShell,
    bigShell,
    steel: surface("#b8c3c8", 0.65, 0.45),
    stringer: surface("#b4a45d", 0.58, 0.46),
    tread: surface("#8c989d", 0.72, 0.46),
    towerCase: surface("#8697a1", 0.72, 0.38),
    pipe: surface("#cbd3d7", 0.82, 0.28),
    blue: surface("#1e4f92", 0.32, 0.38),
    cone: surface("#a3afb5", 0.68, 0.5),
    yellow: surface("#efbe16", 0.12, 0.43),
    fence: openMesh("fence"),
    grating: openMesh("grating"),
    green: surface("#076839", 0.15, 0.46),
    greenRoof: cladding("#09713e", 0.19),
    concrete: patterned(surface("#c3bcae", 0, 0.58), "concrete", 2),
    baseFloor: patterned(surface("#b47b5a"), "concrete", 2),
    red: surface("#a53735", 0.2, 0.6),
    dark: surface("#4e5858", 0.3),
    grass: patterned(surface("#70834a", 0, 1), "grass", 18),
    field: patterned(surface("#8a8160"), "grass", 35),
    soil: patterned(surface("#b47150"), "concrete", 2.3),
    asphalt: patterned(surface("#454b4b", 0, 0.96), "concrete", 1.4),
    blocks: patterned(surface("#beb1a1", 0, 0.48), "blocks", 1.6),
    wall: patterned(surface("#bfc5c4"), "roof", 2),
    roof: patterned(surface("#c6cccd", 0.2, 0.73), "roof", 2),
    union: cladding("#e05b17"),
    white: surface("#d9d7ca"),
    cream: patterned(surface("#d5d0b8"), "concrete", 2),
    glass: surface("#3b514c", 0.25, 0.34),
    foliage: surface("#739657"),
    trunk: surface("#655a44"),
  };
}
function ground(
  b: Batch,
  points: Vec2[],
  height: number,
  material: T.Material,
  holes: Vec2[][] = [],
  _maxEdge = 18,
) {
  const shape = new T.Shape(points.map(([x, z]) => new T.Vector2(x, -z)));
  shape.holes = holes.map((hole) => new T.Path(hole.map(([x, z]) => new T.Vector2(x, -z))));
  const geo = new T.ShapeGeometry(shape);
  geo.rotateX(-Math.PI / 2);
  b.add(conformTerrain(geo, height), material);
}
function roadStrip(
  b: Batch,
  points: Vec2[],
  width: number,
  height: number,
  material: T.Material,
  offset = 0,
  joins: { points: T.Vector3[]; width: number }[] = [],
  trim: Vec2[] = [],
) {
  const curve = new T.CatmullRomCurve3(
    points.map(([x, z]) => new T.Vector3(x, height, z)),
    false,
    "centripetal",
  );
  const n = Math.max(12, Math.ceil(curve.getLength() / 2)),
    verts: number[] = [],
    uv: number[] = [],
    indices: number[] = [];
  for (let i = 0; i <= n; i++) {
    const t = i / n,
      p = curve.getPoint(t),
      direction = curve.getTangent(t),
      side = new T.Vector3(-direction.z, 0, direction.x);
    for (const sign of [-1, 1]) {
      const v = p.clone().addScaledVector(side, offset + (sign * width) / 2);
      v.y += visualGroundHeight(v.x, v.z);
      verts.push(...v.toArray());
      uv.push(v.x / 2, v.z / 2);
    }
    if (i < n) {
      const j = i * 2;
      const midpoint = curve.getPoint((i + 0.5) / n).addScaledVector(side, offset);
      const isJunction = joins.some((join) =>
        join.points.some((a, k) => {
          const next = join.points[k + 1];
          if (!next) return false;
          const dx = next.x - a.x,
            dz = next.z - a.z,
            l = dx * dx + dz * dz;
          const f = Math.max(
            0,
            Math.min(1, ((midpoint.x - a.x) * dx + (midpoint.z - a.z) * dz) / (l || 1)),
          );
          return (
            Math.hypot(midpoint.x - a.x - f * dx, midpoint.z - a.z - f * dz) < join.width / 2 + 0.1
          );
        }),
      );
      if (!isJunction) indices.push(j, j + 1, j + 2, j + 1, j + 3, j + 2);
    }
  }
  if (trim.length) {
    const clipped: number[] = [],
      mapped: number[] = [];
    for (let i = 0; i < indices.length; i += 3) {
      const triangle = indices
        .slice(i, i + 3)
        .map((j) => [verts[j * 3]!, verts[j * 3 + 2]!] as Vec2);
      for (const polygon of outsideConvex(triangle, trim))
        for (let k = 1; k < polygon.length - 1; k++)
          for (const [x, z] of [polygon[0]!, polygon[k]!, polygon[k + 1]!]) {
            clipped.push(x, visualGroundHeight(x, z) + height, z);
            mapped.push(x / 2, z / 2);
          }
    }
    const geometry = new T.BufferGeometry();
    geometry.setAttribute("position", new T.Float32BufferAttribute(clipped, 3));
    geometry.setAttribute("uv", new T.Float32BufferAttribute(mapped, 2));
    geometry.computeVertexNormals();
    b.add(geometry, material);
    return;
  }
  const g = new T.BufferGeometry();
  g.setAttribute("position", new T.Float32BufferAttribute(verts, 3));
  g.setAttribute("uv", new T.Float32BufferAttribute(uv, 2));
  g.setIndex(indices);
  b.add(conformTerrain(g, height), material);
}
function inside(x: number, z: number, points: Vec2[]) {
  let hit = false;
  for (let i = 0, j = points.length - 1; i < points.length; j = i++) {
    const a = points[i]!,
      c = points[j]!;
    if (a[1] > z !== c[1] > z && x < ((c[0] - a[0]) * (z - a[1])) / (c[1] - a[1]) + a[0])
      hit = !hit;
  }
  return hit;
}
function plants(manifest: SceneManifest, m: ReturnType<typeof palette>, economy: boolean) {
  const positions: Vec3[] = manifest.site.landmarkTrees.map((t) => [
    t.position[0],
    t.height,
    t.position[1],
  ]);
  let state = 61;
  const random = () => {
    state = (state * 1664525 + 1013904223) >>> 0;
    return state / 4294967296;
  };
  for (const zone of manifest.site.vegetation) {
    const xs = zone.map((v) => v[0]),
      zs = zone.map((v) => v[1]);
    const minX = Math.min(...xs),
      maxX = Math.max(...xs),
      minZ = Math.min(...zs),
      maxZ = Math.max(...zs);
    const desired = Math.min(economy ? 55 : 125, Math.floor(((maxX - minX) * (maxZ - minZ)) / 32));
    for (let i = 0; i < desired * 3 && positions.length < (economy ? 300 : 650); i++) {
      const x = minX + random() * (maxX - minX),
        z = minZ + random() * (maxZ - minZ);
      if (inside(x, z, zone)) positions.push([x, 4 + random() * 4, z]);
    }
  }
  const crownGeometry = new T.IcosahedronGeometry(1, 1),
    crownPositions = crownGeometry.getAttribute("position");
  for (let i = 0; i < crownPositions.count; i++) {
    const x = crownPositions.getX(i),
      y = crownPositions.getY(i),
      z = crownPositions.getZ(i),
      variation = 1 + 0.1 * Math.sin(x * 11 + y * 7 + z * 13) * Math.cos(y * 9 - z * 6);
    crownPositions.setXYZ(i, x * variation, y * variation, z * variation);
  }
  const grove = new T.Group(),
    crown = new T.InstancedMesh(crownGeometry, m.foliage, positions.length * 3),
    trunks = new T.InstancedMesh(
      new T.CylinderGeometry(0.18, 0.3, 1, 6),
      m.trunk,
      positions.length,
    ),
    matrix = new T.Matrix4();
  positions.forEach(([x, h, z], i) => {
    const groundY = visualGroundHeight(x, z);
    matrix.compose(
      new T.Vector3(x, groundY + h * 0.34, z),
      new T.Quaternion(),
      new T.Vector3(1, h * 0.68, 1),
    );
    trunks.setMatrixAt(i, matrix);
    for (let l = 0; l < 3; l++) {
      matrix.compose(
        new T.Vector3(x + (l - 1) * h * 0.17, groundY + h - l * 0.6, z + (l % 2) * h * 0.12),
        new T.Quaternion().setFromEuler(new T.Euler(0.1 * l, random() * 6, 0)),
        new T.Vector3(h * (l === 0 ? 0.42 : 0.32), h * 0.37, h * 0.32),
      );
      crown.setMatrixAt(i * 3 + l, matrix);
      crown.setColorAt(
        i * 3 + l,
        new T.Color().setHSL(
          0.23 + random() * 0.04,
          0.22 + random() * 0.12,
          0.32 + random() * 0.12,
        ),
      );
    }
  });
  crown.instanceMatrix.needsUpdate = true;
  trunks.instanceMatrix.needsUpdate = true;
  crown.receiveShadow = true;
  crown.castShadow = !economy;
  crown.userData["vegetationCount"] = crown.count;
  trunks.userData["vegetationCount"] = trunks.count;
  crown.raycast = () => {};
  trunks.raycast = () => {};
  grove.add(crown, trunks);
  return grove;
}
export function createUnitModel(manifest: SceneManifest, economy: boolean) {
  const m = palette(),
    group = new T.Group(),
    terrain = new Batch(),
    site = manifest.site;
  const outer = new T.PlaneGeometry(3000, 3000);
  outer.rotateX(-Math.PI / 2);
  terrain.add(conformTerrain(outer, -0.45), m.field);
  ground(terrain, site.outline, 0, m.grass);
  for (const surface of site.surfaces)
    ground(
      terrain,
      surface.outline,
      surface.kind === "grass" ? 0.17 : surface.kind === "asphalt" ? 0.07 : 0.04,
      m[surface.kind],
      [],
      surface.key === "estacionamento" ? 2 : 18,
    );
  const roadPaths = site.roads.map((r) => {
    const curve = new T.CatmullRomCurve3(
      r.points.map(([x, z]) => new T.Vector3(x, 0, z)),
      false,
      "centripetal",
    );
    return {
      key: r.key,
      width: r.width,
      points: curve.getPoints(Math.ceil(curve.getLength() / 2)),
    };
  });
  roadPaths.push({
    key: "parking-mouth",
    width: 2.4,
    points: [
      new T.Vector3(site.gate[0] - 4, 0, site.gate[1] + 2),
      new T.Vector3(site.gate[0] - 4, 0, site.gate[1] + 32),
    ],
  });
  const junction = junctionContours(site.junction);
  for (const road of site.roads) {
    roadStrip(
      terrain,
      road.points,
      road.width + (road.public ? 1.1 : 0.5),
      0.025,
      road.public ? m.soil : m.concrete,
      0,
      [],
      junction.outer,
    );
    roadStrip(terrain, road.points, road.width, 0.07, m.asphalt, 0, [], junction.outer);
    for (const side of [-1, 1])
      roadStrip(
        terrain,
        road.points,
        road.public ? 0.12 : 0.18,
        road.public ? 0.078 : 0.16,
        road.public ? m.white : m.concrete,
        side * (road.width / 2 - 0.16),
        roadPaths.filter((r) => r.key !== road.key),
        junction.outer,
      );
    if (road.key.startsWith("rodovia")) {
      roadStrip(terrain, road.points, 0.1, 0.081, m.yellow, -0.13);
      roadStrip(terrain, road.points, 0.1, 0.081, m.yellow, 0.13);
    }
  }
  // One pavement with two grass holes. Approaches end on its exact boundary;
  // the highway remains straight through the circular return.
  ground(terrain, junction.outer, 0.07, m.asphalt, junction.islands, 2);
  roadStrip(terrain, [...junction.outer, junction.outer[0]!], 0.18, 0.09, m.white, 0, roadPaths);
  for (const island of junction.islands) {
    ground(terrain, island, 0.14, m.grass, [], 2);
    roadStrip(terrain, [...island, island[0]!], 0.2, 0.19, m.concrete);
  }
  for (const edge of site.fences)
    for (let i = 0; i < edge.length - 1; i++) {
      const a = edge[i]!,
        c = edge[i + 1]!,
        n = Math.ceil(Math.hypot(c[0] - a[0], c[1] - a[1]) / 3.6);
      for (let j = 0; j < n; j++) {
        const x = a[0] + ((c[0] - a[0]) * j) / n,
          z = a[1] + ((c[1] - a[1]) * j) / n;
        const y = visualGroundHeight(x, z);
        terrain.box([0.13, 1.8, 0.13], [x, y + 0.9, z], m.concrete);
        terrain.beam([x, y + 1.8, z], [x - 0.25, y + 2.1, z], 0.12, m.concrete);
        const nextX = a[0] + ((c[0] - a[0]) * (j + 1)) / n,
          nextZ = a[1] + ((c[1] - a[1]) * (j + 1)) / n,
          nextY = visualGroundHeight(nextX, nextZ),
          mesh = new T.BufferGeometry();
        mesh.setAttribute(
          "position",
          new T.Float32BufferAttribute(
            [
              x,
              y + 0.12,
              z,
              nextX,
              nextY + 0.12,
              nextZ,
              x,
              y + 1.75,
              z,
              nextX,
              nextY + 0.12,
              nextZ,
              nextX,
              nextY + 1.75,
              nextZ,
              x,
              y + 1.75,
              z,
            ],
            3,
          ),
        );
        mesh.setAttribute("uv", new T.Float32BufferAttribute(new Float32Array(12), 2));
        mesh.computeVertexNormals();
        terrain.add(mesh, m.fence);
      }
      for (const y of [0.45, 0.95, 1.5]) roadStrip(terrain, [a, c], 0.025, y, m.steel);
    }
  const [gx, gz] = site.gate;
  const gy = visualGroundHeight(gx, gz);
  for (const dx of [-5, 5]) {
    terrain.box([0.35, 2.3, 0.35], [gx + dx, gy + 1.15, gz], m.white);
    // Open sliding leaves stay beside the passage; no implied access status.
    terrain.box([5, 0.1, 0.1], [gx + dx * 1.5, gy + 1.85, gz], m.green);
    terrain.box([5, 0.1, 0.1], [gx + dx * 1.5, gy + 0.25, gz], m.green);
    for (let i = 0; i <= 20; i++)
      terrain.box([0.045, 1.6, 0.045], [gx + dx * 1.5 - 2.5 + i * 0.25, gy + 1.05, gz], m.green);
  }
  for (let z = 100; z < 175; z += 26) {
    const y = visualGroundHeight(68, z);
    terrain.box([0.18, 8, 0.18], [68, y + 4, z], m.concrete);
    terrain.beam([68, y + 8, z], [66.7, y + 8.3, z], 0.1, m.steel);
    terrain.box([0.5, 0.12, 0.2], [66.7, y + 8.3, z], m.dark);
  }
  // Short parking bays at reception, outside the internal access lane.
  for (let i = 0; i < 6; i++) {
    const x = gx - 6.5,
      z = gz + 9 + i * 2.6;
    roadStrip(
      terrain,
      [
        [x - 4.7, z],
        [x, z],
      ],
      0.09,
      0.09,
      m.white,
    );
  }
  roadStrip(
    terrain,
    [
      [gx - 9, gz - 1],
      [gx - 28, gz - 1],
      [gx - 28, gz - 5],
    ],
    1.5,
    0.18,
    m.concrete,
  );
  const land = terrain.finish();
  land.traverse((o) => {
    o.raycast = () => {};
    o.castShadow = false;
  });
  group.add(land, plants(manifest, m, economy));
  for (const building of manifest.buildings) {
    const b = new Batch(),
      [w, h, d] = building.size;
    if (building.kind === "canopy") {
      for (const x of [-w / 2 + 0.2, w / 2 - 0.2])
        for (const z of [-d / 2 + 0.2, d / 2 - 0.2]) b.box([0.16, h, 0.16], [x, h / 2, z], m.steel);
      for (const side of [-1, 1]) {
        b.add(
          new T.BoxGeometry(w + 0.8, 0.18, d / 2 + 0.6),
          m.roof,
          [0, h + 0.2, (side * d) / 4],
          new T.Quaternion().setFromEuler(new T.Euler(side * 0.08, 0, 0)),
        );
        b.box([w + 0.7, 0.42, 0.13], [0, h - 0.12, side * (d / 2 + 0.3)], m.green);
        b.beam([-w / 2, h - 0.4, (side * d) / 2], [w / 2, h - 0.4, (side * d) / 2], 0.12, m.steel);
        for (let x = -w / 2; x < w / 2; x += 2)
          b.beam(
            [x, h - 0.4, (side * d) / 2],
            [Math.min(x + 2, w / 2), h, (side * d) / 2],
            0.07,
            m.steel,
          );
      }
    } else
      b.box(
        [w, h, d],
        [0, h / 2, 0],
        building.kind === "union"
          ? m.union
          : building.kind === "green-shed"
            ? m.green
            : building.kind === "warehouse" || building.kind === "support"
              ? m.cream
              : m.wall,
      );
    if (building.kind !== "canopy") b.box([w + 0.05, 2.4, d + 0.05], [0, 1.2, 0], m.white);
    if (building.kind === "union") {
      b.box([w + 0.2, 0.25, d + 0.2], [0, h, 0], m.green);
      b.box([w + 0.3, 0.45, 0.2], [0, h, d / 2 + 0.1], m.green);
      for (const x of [-w / 2, w / 2])
        for (const z of [-d / 2, d / 2])
          b.box([0.12, h - 2.4, 0.12], [x, (h + 2.4) / 2, z], m.green);
      if (building.key === "union-baixo") {
        b.box([w + 0.8, 0.18, 2.5], [0, 6.1, d / 2 + 1.15], m.greenRoof);
        b.add(
          new T.CylinderGeometry(0.2, 0.2, w + 0.8, 10),
          m.greenRoof,
          [0, 6.0, d / 2 + 2.35],
          new T.Quaternion().setFromEuler(new T.Euler(0, 0, Math.PI / 2)),
        );
        for (const x of [-w / 2 + 0.6, w / 2 - 0.6]) {
          b.box([0.14, 6, 0.14], [x, 3, d / 2 + 2.25], m.steel);
          b.beam([x, 4.9, d / 2 + 0.1], [x, 6.0, d / 2 + 2.15], 0.1, m.steel);
        }
        b.box([4.5, 4.5, 0.15], [0, 2.25, d / 2 + 0.1], m.green);
        for (const x of [-w * 0.35, -w * 0.2, w * 0.2, w * 0.35])
          b.box([0.8, 0.55, 0.08], [x, 2.5, d / 2 + 0.1], m.glass);
      } else if (building.key === "union-torre") {
        // Second visible canopy on the return; do not repeat it on unreferenced walls.
        b.box([2.6, 0.2, 5.2], [w / 2 + 1.05, 7.3, d / 2 - 2.0], m.greenRoof);
        for (const z of [d / 2 - 4, d / 2])
          b.beam([w / 2 + 0.1, 5.8, z], [w / 2 + 2.3, 7.2, z], 0.13, m.steel);
        for (const z of [-d * 0.25, d * 0.25])
          b.box([0.08, h * 0.8, 0.43], [w / 2 + 0.06, h * 0.6, z], m.white);
      }
    } else if (building.kind === "warehouse") {
      // Three observed stepped masses; use-specific identity remains pending.
      b.box([w * 0.35, h * 0.65, d * 0.85], [0, h + h * 0.325, -d * 0.08], m.cream);
      b.box([w * 0.36, 0.25, d * 0.88], [0, h * 1.65, -d * 0.08], m.roof);
      b.box([w + 1, 0.25, d + 1], [0, h + 0.1, 0], m.roof);
      for (const x of [-w * 0.32, w * 0.32])
        b.box([w * 0.22, 4.4, 0.15], [x, 2.2, d / 2 + 0.1], m.green);
      b.box([w + 0.08, 0.65, d + 0.08], [0, 0.325, 0], m.green);
      for (const side of [-1, 1]) {
        b.box([w * 0.91, 1.25, 0.08], [0, 5.3, side * (d / 2 + 0.08)], m.glass);
        b.box([w * 0.31, 0.85, 0.08], [0, h * 1.52, -d * 0.08 + side * d * 0.425 + 0.06], m.glass);
        for (let x = -w / 2 + 0.8; x < w / 2; x += 3.1)
          b.box([0.16, h + 0.1, 0.2], [x, h / 2, side * (d / 2 + 0.16)], m.cream);
      }
    } else if (building.key === "apoio-entrada") {
      for (const side of [-1, 1]) {
        b.add(
          new T.BoxGeometry(w / 2 + 0.7, 0.2, d + 1.4),
          m.roof,
          [(side * w) / 4, h + 0.45, 0],
          new T.Quaternion().setFromEuler(new T.Euler(0, 0, -side * 0.11)),
        );
        b.box([0.12, 0.18, d + 1.4], [side * (w / 2 + 0.6), h, 0], m.dark);
      }
      b.box([1.3, 2.4, 0.12], [w * 0.22, 1.2, d / 2 + 0.1], m.green);
      b.box([w + 0.1, 0.45, d + 0.1], [0, 0.225, 0], m.cream);
      for (const x of [-w * 0.29, -w * 0.02]) {
        b.box([2.5, 1.6, 0.16], [x, 2.1, d / 2 + 0.1], m.white);
        b.box([2.2, 1.3, 0.19], [x, 2.1, d / 2 + 0.12], m.glass);
        b.box([0.08, 1.4, 0.22], [x, 2.1, d / 2 + 0.14], m.white);
      }
      b.box([w * 0.75, 0.15, 1.2], [0, 3.1, d / 2 + 0.5], m.roof);
      b.box([2.4, 0.15, 1.5], [w * 0.22, 0.075, d / 2 + 0.7], m.concrete);
    } else if (building.kind !== "canopy") {
      const slope = 0.1,
        half = w / 2 + 0.7;
      for (const side of [-1, 1])
        b.add(
          new T.BoxGeometry(half, 0.25, d + 1.8),
          building.kind === "green-shed" ? m.green : m.roof,
          [(side * half) / 2, h + (half * slope) / 2, 0],
          new T.Quaternion().setFromEuler(new T.Euler(0, 0, -side * Math.atan(slope))),
        );
      for (let z = -d / 2 + 4; z <= d / 2 - 3; z += 9) {
        b.box([0.13, 6, 4.2], [-w / 2 - 0.08, 3, z], m.dark);
        b.box([0.18, 6, 0.18], [-w / 2 - 0.4, 3, z + 2.5], m.white);
      }
      for (const side of [-1, 1]) {
        b.box([0.16, 0.18, d + 1.9], [side * (w / 2 + 0.7), h - 0.05, 0], m.dark);
        for (let z = -d / 2 + 0.6; z <= d / 2; z += 9)
          b.box([0.1, h, 0.1], [side * (w / 2 + 0.22), h / 2, z], m.steel);
      }
      if (building.kind === "shed")
        for (let z = -d / 2 + 2; z < d / 2 - 2; z += 2.5)
          b.box([0.8, 0.32, 0.6], [0, h + w * 0.05 + 0.22, z], m.dark);
      if (building.kind === "support")
        for (let x = -w / 2 + 1.2; x < w / 2 - 1; x += 2.2)
          b.box([1.1, 0.85, 0.1], [x, 2.4, d / 2 + 0.08], m.glass);
    }
    const volume = b.finish(building.key);
    volume.position.set(...building.position);
    volume.rotation.y = building.rotationY ?? 0;
    volume.position.y += visualGroundHeight(building.position[0], building.position[2]);
    if (building.key === "union-torre") {
      const label = facadeIdentity(unionArtwork, 10.6, 6.5);
      label.position.set(0, 21.5, d / 2 + 0.14);
      volume.add(label);
    }
    if (building.key === "union-medio") {
      const label = facadeIdentity(cotrirosaArtwork, 10.6, 4.5);
      label.position.set(-2.8, 13.3, d / 2 + 0.14);
      volume.add(label);
    }
    if (building.kind === "distribution") {
      const label = sign("CENTRO DE DISTRIBUIÇÃO · Cotrirosa", "#315345", "#c6c7bb", 32, 2.2);
      label.position.set(0, 10.6, d / 2 + 0.04);
      volume.add(label);
    }
    group.add(volume);
  }
  let smallBase: T.Group | undefined;
  manifest.silos.forEach((s) => {
    const instance = silo(s, m);
    if (s.key !== "sa05") {
      if (!smallBase) smallBase = instance;
      else
        instance.children.forEach((mesh, i) => {
          const base = smallBase!.children[i];
          if (mesh instanceof T.Mesh && base instanceof T.Mesh && mesh.material === base.material) {
            mesh.geometry.dispose();
            mesh.geometry = base.geometry;
          }
        });
    }
    group.add(instance);
  });
  const shared = new Batch(),
    first = manifest.silos[0]!,
    last = manifest.silos[3]!,
    big = manifest.silos[4]!;
  const sx = first.position[0],
    z0 = first.position[2] - 2.5,
    z1 = last.position[2] + 2.5,
    deck = first.clearance + first.cone + first.straight + 1.25;
  shared.box([1.2, 0.12, z1 - z0], [sx, deck, (z0 + z1) / 2], m.grating);
  shared.box([0.55, 0.55, z1 - z0 + 1], [sx + 0.2, deck + 0.55, (z0 + z1) / 2], m.steel);
  shared.box([0.5, 0.35, 0.7], [sx - 0.15, deck + 0.8, z0 + 2], m.red);
  for (const x of [sx - 0.65, sx + 0.65]) {
    railing(shared, [x, deck, z0], [x, deck, z1], m.yellow);
    shared.beam([x, deck - 0.9, z0], [x, deck - 0.9, z1], 0.1, m.steel);
    for (let z = z0; z < z1 - 2; z += 2)
      shared.beam([x, deck - 0.9, z], [x, deck, z + 2], 0.07, m.steel);
  }
  // The PDF documents the upper inclined/caged access, not a long stair
  // projecting into the yard. Keep that unproven ground flight out of the model.
  stairs(shared, sx + 3.7, deck - 2.6, z0 + 4.5, 2.6, 4.5, m.yellow, m.steel);
  shared.box([4, 0.12, 1.2], [sx + 1.7, deck, z0], m.grating);
  railing(shared, [sx, deck, z0 - 0.6], [sx + 3.7, deck, z0 - 0.6], m.yellow);
  for (const dx of [-0.3, 0.3])
    shared.beam(
      [sx + 3.7 + dx, deck - 5, z0 + 4.6],
      [sx + 3.7 + dx, deck - 1.6, z0 + 4.6],
      0.06,
      m.steel,
    );
  for (let y = deck - 5; y < deck - 1.6; y += 0.3)
    shared.beam([sx + 3.4, y, z0 + 4.6], [sx + 4, y, z0 + 4.6], 0.035, m.steel);
  for (let y = deck - 4.6; y < deck - 1.6; y += 0.8)
    shared.add(
      new T.TorusGeometry(0.48, 0.025, 4, 16),
      m.steel,
      [sx + 3.7, y, z0 + 4.8],
      new T.Quaternion().setFromEuler(new T.Euler(Math.PI / 2, 0, 0)),
    );
  for (const x of [sx - 0.65, sx + 0.65]) {
    shared.beam([x, deck - 1.5, z0], [x, deck + 2.3, z0], 0.12, m.steel);
    shared.beam([x, deck + 2.3, z0], [x, deck + 1.2, z0 + 5], 0.12, m.steel);
  }
  shared.beam([sx - 0.65, deck + 2.3, z0], [sx + 0.65, deck + 2.3, z0], 0.12, m.steel);
  group.add(connectionTower(big, m));
  group.add(shared.finish("passarela"));
  return group;
}
export function configureUnitModel(group: T.Group, profile: GraphicsProfile) {
  const config = GRAPHICS_PROFILES[profile];
  group.traverse((object) => {
    if (object instanceof T.InstancedMesh && object.userData["vegetationCount"])
      object.count = Math.max(1, Math.floor(object.userData["vegetationCount"] * config.density));
    if (object.userData["fineDetail"]) object.visible = config.fine;
    if (object instanceof T.LOD && object.userData["floorDetail"])
      object.levels[1]!.distance = config.floorDistance;
  });
}
export function disposeUnitModel(group: T.Group) {
  const materials = new Set<T.Material>(),
    geometries = new Set<T.BufferGeometry>(),
    textures = new Set<T.Texture>();
  group.traverse((object) => {
    if (object instanceof T.Mesh) {
      geometries.add(object.geometry);
      for (const m of Array.isArray(object.material) ? object.material : [object.material])
        materials.add(m);
    }
  });
  materials.forEach((m) => {
    for (const value of Object.values(m)) if (value instanceof T.Texture) textures.add(value);
    m.dispose();
  });
  geometries.forEach((g) => g.dispose());
  textures.forEach((t) => t.dispose());
}
