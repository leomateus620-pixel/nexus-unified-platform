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
  y: number;
}
function leafTexture() {
  const canvas = document.createElement("canvas");
  canvas.width = canvas.height = 128;
  const c = canvas.getContext("2d")!,
    random = randomSequence(231998);
  c.scale(0.5, 0.5);
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
const cap = 22;
const clusters = 16;
const forks = 8;
const detailRadius = 39;
const cellSize = 32;
const up = new T.Vector3(0, 1, 0);

/** Sprays and branch forks complement the continuous crown. No replacement or moving billboards. */
export function nearCanopies(trees: StandTree[]) {
  const root = new T.Group(),
    texture = leafTexture();
  root.name = "Folhagem no nível do pátio";
  const foil = new T.MeshStandardMaterial({
    map: texture,
    alphaTest: 0.25,
    alphaToCoverage: true,
    side: T.DoubleSide,
    roughness: 0.97,
  });
  const patch = new T.PlaneGeometry(1, 1, 2, 1);
  const vertices = patch.getAttribute("position");
  for (let i = 0; i < vertices.count; i++) vertices.setZ(i, -0.29 * vertices.getX(i) ** 2);
  patch.computeVertexNormals();
  const foliage = new T.InstancedMesh(patch, foil, cap * clusters);
  const branches = new T.InstancedMesh(
    new T.CylinderGeometry(0.35, 1, 1, 5, 1, true),
    new T.MeshStandardMaterial({ color: "#6e6454", roughness: 0.98 }),
    cap * forks,
  );
  foliage.count = branches.count = 0;
  foliage.frustumCulled = branches.frustumCulled = false;
  // The crown already casts the coherent shadow. The cards only add detail to the visible surface.
  foliage.receiveShadow = branches.receiveShadow = true;
  foliage.instanceMatrix.setUsage(T.DynamicDrawUsage);
  branches.instanceMatrix.setUsage(T.DynamicDrawUsage);
  root.add(foliage, branches);
  const cells = new Map<string, StandTree[]>();
  for (const t of trees) {
    const k = Math.floor(t.x / cellSize) + "," + Math.floor(t.z / cellSize);
    let row = cells.get(k);
    if (!row) cells.set(k, (row = []));
    row.push(t);
  }
  const last = new T.Vector3(Infinity, Infinity, Infinity);
  const piece = new T.Object3D(),
    delta = new T.Vector3(),
    tint = new T.Color();
  function limb(ax: number, ay: number, az: number, bx: number, by: number, bz: number, r: number) {
    delta.set(bx - ax, by - ay, bz - az);
    const len = delta.length();
    piece.position.set((ax + bx) / 2, (ay + by) / 2, (az + bz) / 2);
    piece.quaternion.setFromUnitVectors(up, delta.multiplyScalar(1 / len));
    piece.scale.set(r, len, r);
    piece.updateMatrix();
    return piece.matrix;
  }
  let dirty = true;
  let previousEconomy = false;
  function update(eye: T.Vector3, economical: boolean) {
    if (!dirty && previousEconomy === economical && last.distanceToSquared(eye) < 0.64) return;
    dirty = false;
    previousEconomy = economical;
    last.copy(eye);
    if (economical) {
      foliage.count = branches.count = 0;
      return;
    }
    const col = Math.floor(eye.x / cellSize),
      row = Math.floor(eye.z / cellSize);
    const near: { t: StandTree; distance: number }[] = [];
    for (let i = col - 2; i <= col + 2; i++)
      for (let j = row - 2; j <= row + 2; j++)
        for (const t of cells.get(i + "," + j) ?? []) {
          const distance = Math.hypot(t.x - eye.x, t.z - eye.z, t.y + t.height * 0.56 - eye.y);
          if (distance < detailRadius) near.push({ t, distance });
        }
    near.sort((a, b) => a.distance - b.distance);
    // Reduce the falloff radius in a dense stand so the cap is reached with no visible swap.
    const falloff = Math.min(detailRadius, Math.max(1, near[cap]?.distance ?? detailRadius));
    let foliageCount = 0,
      branchCount = 0;
    for (const { t, distance } of near.slice(0, cap)) {
      const fade = 1 - T.MathUtils.smoothstep(distance, falloff * 0.52, falloff);
      if (fade < 0.015) continue;
      const radius = t.diameter / 2,
        cy = t.y + t.height - t.depth / 2;
      const rng = randomSequence(t.phase),
        start = rng() * Math.PI * 2;
      for (let k = 0; k < clusters; k++) {
        // Bias the sprays toward the sides and underside visible from the paved edge.
        const v = 0.53 - (1.4 * (k + 0.38)) / clusters;
        const ang = start + k * 2.39996 + rng() * 0.4;
        const ring = Math.sqrt(Math.max(0, 1 - v * v));
        const rad = radius * (0.68 + 0.35 * rng());
        piece.position.set(
          t.x + Math.cos(ang) * ring * rad,
          cy + v * t.depth * 0.46,
          t.z + Math.sin(ang) * ring * rad,
        );
        piece.rotation.set(
          -v * 0.9 + (rng() - 0.5) * 0.8,
          Math.PI * 0.5 - ang,
          (rng() - 0.5) * 1.4,
          "YXZ",
        );
        const w = t.diameter * (0.19 + 0.17 * rng()) * fade;
        piece.scale.set(w, w * (0.82 + 0.3 * rng()), w);
        piece.updateMatrix();
        foliage.setMatrixAt(foliageCount, piece.matrix);
        tint.copy(t.color).multiplyScalar(0.99 + 0.27 * rng());
        foliage.setColorAt(foliageCount++, tint);
      }
      for (let k = 0; k < forks / 2; k++) {
        const a = start + 1.92 * k,
          frac = 0.62 + (0.5 - rng()) * 0.22;
        const fromY = t.y + t.height * (0.29 + k * 0.046);
        const bx = t.x + Math.cos(a) * radius * 0.43,
          bz = t.z + Math.sin(a) * radius * 0.43;
        const by = t.y + t.height * frac;
        branches.setMatrixAt(
          branchCount++,
          limb(t.x, fromY, t.z, bx, by, bz, radius * 0.038 * fade),
        );
        const end = a + (rng() - 0.5) * 1.1;
        branches.setMatrixAt(
          branchCount++,
          limb(
            bx,
            by,
            bz,
            t.x + Math.cos(end) * radius * 0.64,
            t.y + t.height * (0.68 + rng() * 0.13),
            t.z + Math.sin(end) * radius * 0.64,
            radius * 0.022 * fade,
          ),
        );
      }
    }
    foliage.count = foliageCount;
    branches.count = branchCount;
    if (foliageCount) {
      foliage.instanceMatrix.needsUpdate = true;
      foliage.instanceColor!.needsUpdate = true;
      branches.instanceMatrix.needsUpdate = true;
    }
  }
  return {
    root,
    texture,
    update,
    setDirty: () => {
      dirty = true;
    },
  };
}
