import * as T from "three";
import { surfaceAt, INITIAL_GRAIN_VOLUME } from "./GrainField";
import { SILO, type SiloFrame } from "./simulation";
import { CUT_PLANE_Z } from "./SiloModel";

export type Quality = "economic" | "balanced" | "high";
// Keep bulk just inside the corrugated sheets, including their inward valleys.
// <2% volume display approximation; the domain's conserved volume is unchanged.
const GRAIN_RADIUS = SILO.radius - 0.015;
const GRAIN_OUTLET_RADIUS = SILO.outletRadius - 0.003;
export const QUALITY = {
  economic: { grains: 900, dpr: 0.8 },
  balanced: { grains: 1800, dpr: 1.15 },
  high: { grains: 3000, dpr: 1.5 },
} as const;
/** Visible shell + bounded local instances. No rigid body per grain. */
export function createGrains() {
  const root = new T.Group(),
    geo = new T.BufferGeometry();
  const radial = 28,
    angular = 80,
    count = (radial + 1) * (angular + 1);
  const position = new Float32Array(count * 3),
    uv = new Float32Array(count * 2),
    indices: number[] = [];
  for (let j = 0; j <= radial; j++)
    for (let i = 0; i <= angular; i++) {
      const index = j * (angular + 1) + i,
        a = (i / angular) * Math.PI * 2,
        r = (j / radial) * GRAIN_RADIUS;
      position[index * 3] = Math.sin(a) * r;
      position[index * 3 + 2] = Math.cos(a) * r;
      uv[index * 2] = position[index * 3]! / 0.22;
      uv[index * 2 + 1] = position[index * 3 + 2]! / 0.22;
      if (j < radial && i < angular) {
        const n = index + angular + 1;
        indices.push(index, n, index + 1, n, n + 1, index + 1);
      }
    }
  geo.setAttribute("position", new T.BufferAttribute(position, 3).setUsage(T.DynamicDrawUsage));
  geo.setAttribute("uv", new T.BufferAttribute(uv, 2));
  geo.setIndex(indices);
  const canvas = document.createElement("canvas");
  canvas.width = canvas.height = 512;
  const ctx = canvas.getContext("2d")!;
  ctx.fillStyle = "#957944";
  ctx.fillRect(0, 0, 512, 512);
  let seed = 81217;
  const random = () => {
    seed = (Math.imul(seed, 1664525) + 1013904223) >>> 0;
    return seed / 4294967296;
  };
  for (let i = 0; i < 720; i++) {
    const x = random() * 512,
      y = random() * 512,
      r = 7 + random() * 3;
    ctx.save();
    ctx.translate(x, y);
    ctx.rotate(random() * 6.28);
    ctx.scale(1, 0.87);
    ctx.fillStyle = "#745b31";
    ctx.beginPath();
    ctx.arc(1, 2, r + 1, 0, Math.PI * 2);
    ctx.fill();
    const gradient = ctx.createRadialGradient(-2, -3, 1, 0, 0, r);
    gradient.addColorStop(0, "#dfc994");
    gradient.addColorStop(1, random() > 0.5 ? "#c0a36b" : "#b89c60");
    ctx.fillStyle = gradient;
    ctx.beginPath();
    ctx.arc(0, 0, r, 0, Math.PI * 2);
    ctx.fill();
    ctx.fillStyle = "#96733d";
    ctx.fillRect(-2, -1, 3, 1);
    ctx.restore();
  }
  const texture = new T.CanvasTexture(canvas);
  texture.colorSpace = T.SRGBColorSpace;
  texture.wrapS = texture.wrapT = T.RepeatWrapping;
  texture.anisotropy = 4;
  const cutPlane = new T.Plane(new T.Vector3(0, 0, -1), CUT_PLANE_Z);
  const mat = new T.MeshStandardMaterial({
    map: texture,
    bumpMap: texture,
    bumpScale: 0.003,
    color: "#e2d0a7",
    roughness: 0.95,
    side: T.DoubleSide,
  });
  const top = new T.Mesh(geo, mat);
  top.receiveShadow = true;
  root.add(top);
  const sideGeo = new T.CylinderGeometry(GRAIN_RADIUS, GRAIN_RADIUS, 1, 80, 1, true);
  const sidePos = sideGeo.getAttribute("position");
  const sideUV = sideGeo.getAttribute("uv");
  for (let i = 0; i < sidePos.count; i++)
    sideUV.setX(i, (Math.atan2(sidePos.getX(i), sidePos.getZ(i)) * SILO.radius) / 0.22);
  const sideMat = mat.clone(),
    side = new T.Mesh(sideGeo, sideMat);
  root.add(side);
  const coneGeo = new T.CylinderGeometry(
    GRAIN_RADIUS,
    GRAIN_OUTLET_RADIUS,
    SILO.hopperTop - SILO.outletY,
    64,
    1,
    true,
  );
  coneGeo.translate(0, (SILO.hopperTop + SILO.outletY) / 2, 0);
  const conePosition = coneGeo.getAttribute("position"),
    coneUV = coneGeo.getAttribute("uv");
  for (let i = 0; i < conePosition.count; i++) {
    coneUV.setXY(
      i,
      (Math.atan2(conePosition.getX(i), conePosition.getZ(i)) *
        Math.hypot(conePosition.getX(i), conePosition.getZ(i))) /
        0.22,
      conePosition.getY(i) / 0.22,
    );
  }
  const coneMat = mat.clone(),
    cone = new T.Mesh(coneGeo, coneMat);
  root.add(cone);
  // The didactic section face fills the bulk, not an acrylic wall or a physical escape.
  const faceGeo = new T.BufferGeometry(),
    facePosition = new Float32Array(65 * 2 * 3),
    faceUV = new Float32Array(65 * 2 * 2),
    faceIndices: number[] = [];
  for (let i = 0; i < 65; i++) {
    const x = ((i / 64) * 2 - 1) * Math.sqrt(GRAIN_RADIUS ** 2 - CUT_PLANE_Z ** 2);
    for (let j = 0; j < 2; j++) {
      const n = i * 2 + j;
      facePosition[n * 3] = x;
      facePosition[n * 3 + 2] = CUT_PLANE_Z;
      faceUV[n * 2] = x / 0.22;
    }
    if (i < 64) {
      const n = i * 2;
      faceIndices.push(n, n + 1, n + 2, n + 1, n + 3, n + 2);
    }
  }
  faceGeo.setAttribute(
    "position",
    new T.BufferAttribute(facePosition, 3).setUsage(T.DynamicDrawUsage),
  );
  faceGeo.setAttribute("uv", new T.BufferAttribute(faceUV, 2));
  faceGeo.setIndex(faceIndices);
  const faceMat = mat.clone(),
    face = new T.Mesh(faceGeo, faceMat);
  root.add(face);
  // Shader-independent fixed pool. Largest profile still remains bounded.
  const grainGeo = new T.SphereGeometry(1, 7, 4);
  grainGeo.scale(1, 0.88, 0.93);
  const grainMat = new T.MeshStandardMaterial({ color: "#cdb27a", roughness: 0.9 });
  const instances = new T.InstancedMesh(grainGeo, grainMat, 3000);
  instances.instanceMatrix.setUsage(T.DynamicDrawUsage);
  instances.frustumCulled = false;
  root.add(instances);
  const offsets = new Float32Array(3000 * 4),
    scratch = new T.Object3D(),
    color = new T.Color();
  for (let i = 0; i < 3000; i++) {
    const radius = Math.sqrt(random()) * 0.38,
      angle = random() * Math.PI * 2;
    offsets[i * 4] = Math.cos(angle) * radius;
    offsets[i * 4 + 1] = Math.sin(angle) * radius;
    offsets[i * 4 + 2] = random();
    offsets[i * 4 + 3] = 0.0035 + random() * 0.0012;
    color.setHSL(0.105 + random() * 0.02, 0.36, 0.48 + random() * 0.16);
    instances.setColorAt(i, color);
  }
  const outlet = new T.InstancedMesh(grainGeo, grainMat, 180);
  outlet.instanceMatrix.setUsage(T.DynamicDrawUsage);
  outlet.frustumCulled = false;
  root.add(outlet);
  let lastTime = -1,
    lastQuality: Quality = "balanced",
    lastCut = false,
    lastEntryBlocked = false,
    lastConnected = false,
    near = false;
  return {
    root,
    update(frame: SiloFrame, quality: Quality, cut: boolean, internal: boolean, camera: T.Camera) {
      const clipped = cut && !internal;
      for (const m of [mat, sideMat, coneMat]) {
        const active = !!m.clippingPlanes?.length;
        if (active !== clipped) {
          m.clippingPlanes = clipped ? [cutPlane] : [];
          m.needsUpdate = true;
        }
      }
      face.visible = clipped;
      // Detail belongs to the grain surface, never to workers outside the silo.
      instances.visible = !frame.entryBlocked;
      const distance = Math.min(
        Math.hypot(
          camera.position.x - frame.workers.A.position.x,
          camera.position.y - frame.surfaceHeight,
          camera.position.z - frame.workers.A.position.z,
        ),
        Math.hypot(
          camera.position.x - frame.workers.B.position.x,
          camera.position.y - frame.surfaceHeight,
          camera.position.z - frame.workers.B.position.z,
        ),
      );
      if (distance < 4) near = true;
      else if (distance > 5) near = false;
      const num = QUALITY[quality].grains * (near ? 1 : 0.4);
      instances.count = Math.floor(num);
      if (
        frame.time === lastTime &&
        quality === lastQuality &&
        clipped === lastCut &&
        frame.entryBlocked === lastEntryBlocked &&
        frame.connection.connected === lastConnected &&
        instances.userData["count"] === instances.count
      )
        return;
      lastTime = frame.time;
      lastQuality = quality;
      lastCut = clipped;
      lastEntryBlocked = frame.entryBlocked;
      lastConnected = frame.connection.connected;
      instances.userData["count"] = instances.count;
      for (let i = 0; i < count; i++)
        position[i * 3 + 1] = surfaceAt(position[i * 3]!, position[i * 3 + 2]!, frame);
      geo.getAttribute("position").needsUpdate = true;
      geo.computeVertexNormals();
      for (let i = 0; i < sidePos.count; i++) {
        const x = sidePos.getX(i),
          z = sidePos.getZ(i);
        sidePos.setY(i, i < 81 ? surfaceAt(x, z, frame) : SILO.hopperTop);
        sideUV.setY(i, sidePos.getY(i) / 0.22);
      }
      sidePos.needsUpdate = true;
      sideUV.needsUpdate = true;
      for (let i = 0; i < 65; i++) {
        const x = facePosition[i * 6]!,
          edge = Math.hypot(x, CUT_PLANE_Z);
        const bottom =
          SILO.outletY +
          (SILO.hopperTop - SILO.outletY) *
            Math.max(0, (edge - GRAIN_OUTLET_RADIUS) / (GRAIN_RADIUS - GRAIN_OUTLET_RADIUS));
        facePosition[i * 6 + 1] = bottom;
        facePosition[i * 6 + 4] = surfaceAt(x, CUT_PLANE_Z, frame);
        faceUV[i * 4 + 1] = bottom / 0.22;
        faceUV[i * 4 + 3] = facePosition[i * 6 + 4]! / 0.22;
      }
      faceGeo.getAttribute("position").needsUpdate = true;
      faceGeo.getAttribute("uv").needsUpdate = true;
      faceGeo.computeVertexNormals();
      for (let i = 0; i < instances.count; i++) {
        const w = i % 2 === 0 ? frame.workers.A : frame.workers.B;
        // Cumulative discharged volume prevents a visual rewind when the gate closes.
        const phase = (INITIAL_GRAIN_VOLUME - frame.volume) * 0.025;
        const ox = offsets[i * 4]!,
          oz = offsets[i * 4 + 1]!,
          seed = offsets[i * 4 + 2]!;
        const theta = Math.atan2(oz, ox),
          rr = Math.hypot(ox, oz);
        const localTravel = (phase * (0.8 + seed * 0.2) + seed * 0.15) % 0.15;
        const length = Math.max(0.1, Math.hypot(w.position.x, w.position.z));
        const x = w.position.x + Math.cos(theta) * rr - (localTravel * w.position.x) / length,
          z = w.position.z + Math.sin(theta) * rr - (localTravel * w.position.z) / length;
        scratch.position.set(x, surfaceAt(x, z, frame) + 0.003, z);
        scratch.rotation.set(seed * 6.28, theta, seed * 3);
        scratch.scale.setScalar(offsets[i * 4 + 3]!);
        scratch.updateMatrix();
        instances.setMatrixAt(i, scratch.matrix);
      }
      instances.instanceMatrix.needsUpdate = true;
      outlet.visible = frame.gate > 0.01;
      for (let i = 0; i < 180 && outlet.visible; i++) {
        const p = (frame.time * 2 + offsets[i * 4 + 2]!) % 1,
          a = offsets[i * 4 + 2]! * 6.28;
        scratch.position.set(Math.sin(a) * 0.16, SILO.outletY - 0.35 - p * 0.7, Math.cos(a) * 0.16);
        scratch.scale.setScalar(0.0045);
        scratch.updateMatrix();
        outlet.setMatrixAt(i, scratch.matrix);
      }
      if (outlet.visible) outlet.instanceMatrix.needsUpdate = true;
    },
    dispose() {
      for (const g of [geo, sideGeo, coneGeo, faceGeo, grainGeo]) g.dispose();
      for (const m of [mat, sideMat, coneMat, faceMat, grainMat]) m.dispose();
      texture.dispose();
      instances.dispose();
      outlet.dispose();
      root.clear();
    },
  };
}
