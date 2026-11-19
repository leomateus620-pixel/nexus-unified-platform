import * as T from "three";
import { randomSequence } from "./ground-material";

export interface StandTree {
  x: number;
  z: number;
  height: number;
  diameter: number;
  depth: number;
  phase: number;
  color: T.Color;
  type: 0 | 1;
  index: number;
}
function leafTexture() {
  const canvas = document.createElement("canvas");
  canvas.width = canvas.height = 256;
  const c = canvas.getContext("2d")!,
    random = randomSequence(231998);
  function leaf(x: number, y: number, length: number, angle: number) {
    const w = length * (0.29 + random() * 0.17),
      light = 148 + Math.floor(random() * 98);
    c.fillStyle = `rgb(${light},${Math.min(255, light + 5)},${light - 13})`;
    c.beginPath();
    c.moveTo(x, y);
    const dx = Math.cos(angle),
      dy = Math.sin(angle);
    c.quadraticCurveTo(
      x + dx * length * 0.47 - dy * w,
      y + dy * length * 0.47 + dx * w,
      x + dx * length,
      y + dy * length,
    );
    c.quadraticCurveTo(x + dx * length * 0.55 + dy * w, y + dy * length * 0.55 - dx * w, x, y);
    c.fill();
  }
  // Leaflets branch from visible curved twigs with a transparent margin between sprigs.
  for (let sprig = 0; sprig < 13; sprig++) {
    const x = 105 + random() * 46,
      y = 142 + random() * 23;
    const a = sprig * 0.483 + random() * 0.35,
      len = 50 + random() * 66;
    for (let j = 0; j < 11; j++) {
      const t = j / 10,
        ang = a + 0.28 * Math.sin(t * 2.8 + a);
      const px = x + Math.cos(ang) * len * t,
        py = y + Math.sin(ang) * len * t;
      const endx = x + Math.cos(ang + 0.018) * len * (t + 0.09),
        endy = y + Math.sin(ang + 0.018) * len * (t + 0.09);
      c.strokeStyle = "rgb(125,120,94)";
      c.lineWidth = 1.65 - t;
      c.beginPath();
      c.moveTo(px, py);
      c.lineTo(endx, endy);
      c.stroke();
      if (j < 2) continue;
      for (const s of [-1, 1]) {
        const side = ang + s * (0.76 + random() * 0.5),
          reach = (16 + random() * 14) * (1.3 - 0.55 * t);
        c.lineWidth = 0.7;
        c.beginPath();
        c.moveTo(px, py);
        c.lineTo(px + Math.cos(side) * reach, py + Math.sin(side) * reach);
        c.stroke();
        for (let k = 1; k <= 4; k++) {
          const u = k / 4;
          leaf(
            px + Math.cos(side) * reach * u,
            py + Math.sin(side) * reach * u,
            3.4 + random() * 7,
            side + (k % 2 === 0 ? 0.8 : -0.8),
          );
        }
      }
    }
  }
  const tex = new T.CanvasTexture(canvas);
  tex.colorSpace = T.SRGBColorSpace;
  tex.anisotropy = 8;
  return tex;
}
const cap = 26,
  clusters = 26,
  forks = 12,
  up = new T.Vector3(0, 1, 0);
export function nearCanopies(trees: StandTree[], crowns: [T.InstancedMesh, T.InstancedMesh]) {
  const root = new T.Group(),
    texture = leafTexture();
  const foil = new T.MeshStandardMaterial({
    map: texture,
    alphaTest: 0.26,
    alphaToCoverage: true,
    side: T.DoubleSide,
    roughness: 0.97,
  });
  const patch = new T.PlaneGeometry(1, 1, 2, 2),
    vertices = patch.getAttribute("position");
  for (let i = 0; i < vertices.count; i++)
    vertices.setZ(i, -0.15 * (vertices.getX(i) ** 2 + vertices.getY(i) ** 2));
  patch.computeVertexNormals();
  const foliage = new T.InstancedMesh(patch, foil, cap * clusters);
  const branches = new T.InstancedMesh(
    new T.CylinderGeometry(0.4, 1, 1, 6),
    new T.MeshStandardMaterial({ color: "#695c49", roughness: 0.98 }),
    cap * forks,
  );
  foliage.count = branches.count = 0;
  foliage.frustumCulled = branches.frustumCulled = false;
  foliage.castShadow = branches.castShadow = true;
  foliage.receiveShadow = branches.receiveShadow = true;
  foliage.instanceMatrix.setUsage(T.DynamicDrawUsage);
  branches.instanceMatrix.setUsage(T.DynamicDrawUsage);
  root.add(foliage, branches);
  const cells = new Map<string, StandTree[]>(),
    bases = crowns.map((m) => m.instanceMatrix.array.slice());
  for (const t of trees) {
    const k = Math.floor(t.x / 45) + "," + Math.floor(t.z / 45);
    let row = cells.get(k);
    if (!row) cells.set(k, (row = []));
    row.push(t);
  }
  let prior = new Set<StandTree>();
  const last = new T.Vector3(Infinity, Infinity, Infinity);
  const piece = new T.Object3D(),
    delta = new T.Vector3(),
    m = new T.Matrix4(),
    tint = new T.Color();
  let foliageCount = 0,
    branchCount = 0;
  function limb(ax: number, ay: number, az: number, bx: number, by: number, bz: number, r: number) {
    delta.set(bx - ax, by - ay, bz - az);
    const len = delta.length();
    piece.position.set((ax + bx) / 2, (ay + by) / 2, (az + bz) / 2);
    piece.quaternion.setFromUnitVectors(up, delta.multiplyScalar(1 / len));
    piece.scale.set(r, len, r);
    piece.updateMatrix();
    branches.setMatrixAt(branchCount++, piece.matrix);
  }
  function crown(t: StandTree, scale: number, baseY: number) {
    const mesh = crowns[t.type];
    m.fromArray(bases[t.type]!, 16 * t.index);
    m.elements[13]! += baseY;
    for (const j of [0, 1, 2, 4, 5, 6, 8, 9, 10]) m.elements[j]! *= scale;
    mesh.setMatrixAt(t.index, m);
    mesh.instanceMatrix.needsUpdate = true;
  }
  function update(eye: T.Vector3, elevation: (x: number, z: number) => number, force = false) {
    if (!force && last.distanceToSquared(eye) < 2.25) return;
    last.copy(eye);
    foliageCount = branchCount = 0;
    const next = new Set<StandTree>();
    const col = Math.floor(eye.x / 45),
      row = Math.floor(eye.z / 45),
      near: { t: StandTree; d: number; y: number }[] = [];
    for (let i = col - 2; i <= col + 2; i++)
      for (let j = row - 2; j <= row + 2; j++)
        for (const t of cells.get(i + "," + j) ?? []) {
          const y = elevation(t.x, t.z),
            d = Math.hypot(t.x - eye.x, t.z - eye.z, y + t.height * 0.62 - eye.y);
          if (d < 50) near.push({ t, d, y });
        }
    near.sort((a, b) => a.d - b.d);
    for (const { t, d, y } of near.slice(0, cap)) {
      next.add(t);
      const fade = 1 - T.MathUtils.smoothstep(d, 26, 50);
      crown(t, 1 - fade * 0.985, y);
      const radius = t.diameter / 2,
        cy = y + t.height - t.depth / 2;
      const rng = randomSequence(t.phase),
        start = rng() * Math.PI * 2;
      for (let k = 0; k < clusters; k++) {
        // Rotate and tilt overlapping curved sprays through the ellipsoid. No camera-facing billboards.
        const v = 1 - (2 * (k + 0.38)) / clusters,
          ang = start + k * 2.39996 + rng() * 0.36,
          ring = Math.sqrt(Math.max(0, 1 - v * v));
        const rad = radius * (0.5 + 0.32 * rng());
        piece.position.set(
          t.x + Math.cos(ang) * ring * rad,
          cy + v * t.depth * 0.38,
          t.z + Math.sin(ang) * ring * rad,
        );
        piece.rotation.set(
          -v * 0.88 + (rng() - 0.5) * 0.8,
          Math.PI * 0.5 - ang,
          (rng() - 0.5) * 1.4,
          "YXZ",
        );
        const w = t.diameter * (0.36 + 0.23 * rng()) * fade;
        piece.scale.set(w, w * (0.82 + 0.3 * rng()), w);
        piece.updateMatrix();
        foliage.setMatrixAt(foliageCount, piece.matrix);
        tint.copy(t.color).multiplyScalar(1.12 + 0.38 * rng());
        foliage.setColorAt(foliageCount++, tint);
      }
      for (let k = 0; k < forks / 2; k++) {
        const a = start + 1.92 * k,
          frac = 0.62 + (0.5 - rng()) * 0.24;
        const fromY = y + t.height * (0.22 + k * 0.032),
          bx = t.x + Math.cos(a) * radius * 0.39,
          bz = t.z + Math.sin(a) * radius * 0.39,
          by = y + t.height * frac;
        limb(t.x, fromY, t.z, bx, by, bz, radius * 0.046 * fade);
        const end = a + (rng() - 0.5) * 1.1;
        limb(
          bx,
          by,
          bz,
          t.x + Math.cos(end) * radius * 0.58,
          y + t.height * (0.70 + rng() * 0.13),
          t.z + Math.sin(end) * radius * 0.58,
          radius * 0.025 * fade,
        );
      }
    }
    for (const t of prior) if (!next.has(t)) crown(t, 1, elevation(t.x, t.z));
    prior = next;
    foliage.count = foliageCount;
    branches.count = branchCount;
    if (foliageCount) {
      foliage.instanceMatrix.needsUpdate = true;
      foliage.instanceColor!.needsUpdate = true;
      branches.instanceMatrix.needsUpdate = true;
    }
  }
  return { root, texture, update };
}
