import * as T from "three";
import { surfaceAt, dischargeAt, metres, type VolumeFlow } from "./GrainField";
import { SILO, type SiloFrame } from "./simulation";
import { CUT_PLANE_Z } from "./SiloModel";

export type Quality = "economic" | "balanced" | "high";
// Inset includes the inward corrugation valley AND the circumferential chord.
// At 80 shell sectors the valley chord reaches R10.9795m, so a 15mm inset leaks.
// 25mm retains >4mm clearance; an actual wall-triangle containment test guards it.
// <2% volume display approximation; the domain's conserved volume is unchanged.
const GRAIN_RADIUS = SILO.radius - 0.025;
export const QUALITY = {
  economic: { grains: 900, dpr: 0.8 },
  balanced: { grains: 1800, dpr: 1.15 },
  high: { grains: 3000, dpr: 1.5 },
} as const;

/** Exact indexed normals on the affected one-ring only. Adjacency retains the
 * original index order, including Float32 accumulation after each face, so its
 * result matches Three.computeVertexNormals rather than approximating slopes. */
function createBulkUpdater(geometry: T.BufferGeometry) {
  const attribute = geometry.getAttribute("position") as T.BufferAttribute;
  const positions = attribute.array as Float32Array;
  const indices = geometry.index!.array as Uint16Array | Uint32Array;
  const count = attribute.count,
    shape = new Float64Array(count),
    moving = new Uint8Array(count),
    dirty = new Uint8Array(count);
  const active: number[] = [];
  const unitSurface = { surfaceHeight: metres(0), depression: metres(1), flow: 0 as VolumeFlow };
  for (let vertex = 0; vertex < count; vertex++) {
    shape[vertex] = surfaceAt(positions[vertex * 3]!, positions[vertex * 3 + 2]!, unitSurface);
    if (shape[vertex] !== 0) {
      moving[vertex] = 1;
      active.push(vertex);
    }
  }
  for (let face = 0; face < indices.length; face += 3) {
    const a = indices[face]!,
      b = indices[face + 1]!,
      c = indices[face + 2]!;
    if (moving[a] || moving[b] || moving[c]) dirty[a] = dirty[b] = dirty[c] = 1;
  }
  const adjacency = new Map<number, number[]>();
  for (let vertex = 0; vertex < count; vertex++) if (dirty[vertex]) adjacency.set(vertex, []);
  for (let face = 0; face < indices.length; face += 3)
    for (let corner = 0; corner < 3; corner++) {
      const vertex = indices[face + corner]!;
      if (dirty[vertex]) adjacency.get(vertex)!.push(face);
    }
  // One full flat build at construction. Dynamic updates retain all unaffected normals.
  geometry.computeVertexNormals();
  const normal = geometry.getAttribute("normal") as T.BufferAttribute,
    normals = normal.array as Float32Array;
  let height = NaN,
    depression = NaN,
    updates = 0,
    normalUpdates = 0;
  return {
    get stats() {
      return {
        activeVertices: active.length,
        normalVertices: adjacency.size,
        positionVertices: count,
        fullNormalBuilds: 1,
        updates,
        normalUpdates,
      };
    },
    update(nextHeight: number, nextDepression: number) {
      if (nextHeight === height && nextDepression === depression) return false;
      const heightChanged = nextHeight !== height;
      if (heightChanged)
        for (let vertex = 0; vertex < count; vertex++)
          positions[vertex * 3 + 1] = nextHeight + nextDepression * shape[vertex]!;
      else
        for (const vertex of active)
          positions[vertex * 3 + 1] = nextHeight + nextDepression * shape[vertex]!;
      attribute.needsUpdate = true;
      if (nextDepression !== depression || (heightChanged && nextDepression !== 0)) {
        for (const [vertex, faces] of adjacency) {
          let nx = 0,
            ny = 0,
            nz = 0;
          for (const face of faces) {
            const a = indices[face]! * 3,
              b = indices[face + 1]! * 3,
              c = indices[face + 2]! * 3;
            const cbx = positions[c]! - positions[b]!,
              cby = positions[c + 1]! - positions[b + 1]!,
              cbz = positions[c + 2]! - positions[b + 2]!;
            const abx = positions[a]! - positions[b]!,
              aby = positions[a + 1]! - positions[b + 1]!,
              abz = positions[a + 2]! - positions[b + 2]!;
            const cx = cby * abz - cbz * aby,
              cy = cbz * abx - cbx * abz,
              cz = cbx * aby - cby * abx;
            nx = Math.fround(nx + cx);
            ny = Math.fround(ny + cy);
            nz = Math.fround(nz + cz);
          }
          const inverseLength = 1 / (Math.sqrt(nx * nx + ny * ny + nz * nz) || 1),
            offset = vertex * 3;
          normals[offset] = nx * inverseLength;
          normals[offset + 1] = ny * inverseLength;
          normals[offset + 2] = nz * inverseLength;
        }
        normal.needsUpdate = true;
        normalUpdates++;
      }
      height = nextHeight;
      depression = nextDepression;
      updates++;
      return true;
    },
  };
}
/** Visible shell + bounded local instances. No rigid body per grain. */
export function createGrains() {
  const root = new T.Group(),
    geo = new T.BufferGeometry();
  const radial = 72,
    angular = 256,
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
  const bulk = createBulkUpdater(geo);
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
  top.name = "Massa_soja_superficie";
  top.userData["componentId"] = "grain";
  top.receiveShadow = true;
  root.add(top);
  const sideGeo = new T.CylinderGeometry(GRAIN_RADIUS, GRAIN_RADIUS, 1, 128, 1, true);
  const sidePos = sideGeo.getAttribute("position");
  const sideUV = sideGeo.getAttribute("uv");
  for (let i = 0; i < sidePos.count; i++)
    sideUV.setX(i, (Math.atan2(sidePos.getX(i), sidePos.getZ(i)) * SILO.radius) / 0.22);
  const sideMat = mat.clone(),
    side = new T.Mesh(sideGeo, sideMat);
  root.add(side);
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
  let lastTime = -1,
    lastDepression = NaN,
    lastWorkerAX = NaN,
    lastWorkerAZ = NaN,
    lastWorkerBX = NaN,
    lastWorkerBZ = NaN,
    lastQuality: Quality = "balanced",
    lastCut = false,
    lastEntryBlocked = false,
    lastConnected = false,
    near = false;
  return {
    root,
    get bulkStats() {
      return bulk.stats;
    },
    update(frame: SiloFrame, quality: Quality, cut: boolean, internal: boolean, camera: T.Camera) {
      const clipped = cut && !internal;
      for (const m of [mat, sideMat, grainMat]) {
        const active = !!m.clippingPlanes?.length;
        if (active !== clipped) {
          m.clippingPlanes = clipped ? [cutPlane] : [];
          m.needsUpdate = true;
        }
      }
      face.visible = clipped;
      // Detail belongs to the grain surface, never to workers outside the silo.
      instances.visible = !frame.entryBlocked && frame.supportAvailable;
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
        frame.depression === lastDepression &&
        frame.workers.A.position.x === lastWorkerAX &&
        frame.workers.A.position.z === lastWorkerAZ &&
        frame.workers.B.position.x === lastWorkerBX &&
        frame.workers.B.position.z === lastWorkerBZ &&
        top.userData["surfaceHeight"] === frame.surfaceHeight &&
        instances.userData["count"] === instances.count
      )
        return;
      lastTime = frame.time;
      lastDepression = frame.depression;
      lastWorkerAX = frame.workers.A.position.x;
      lastWorkerAZ = frame.workers.A.position.z;
      lastWorkerBX = frame.workers.B.position.x;
      lastWorkerBZ = frame.workers.B.position.z;
      lastQuality = quality;
      lastCut = clipped;
      lastEntryBlocked = frame.entryBlocked;
      lastConnected = frame.connection.connected;
      top.userData["surfaceHeight"] = frame.surfaceHeight;
      instances.userData["count"] = instances.count;
      // Bulk geometry depends only on these domain surface parameters. Keep its
      // exact buffers/normals when only technicians or local grain detail move.
      // The CPU profile found full normal rebuilding consumed 45% of wall time.
      if (bulk.update(frame.surfaceHeight, frame.depression)) {
        for (let i = 0; i < sidePos.count; i++) {
          const x = sidePos.getX(i),
            z = sidePos.getZ(i);
          sidePos.setY(i, i < 129 ? surfaceAt(x, z, frame) : SILO.floorY);
          sideUV.setY(i, sidePos.getY(i) / 0.22);
        }
        sidePos.needsUpdate = true;
        sideUV.needsUpdate = true;
        for (let i = 0; i < 65; i++) {
          const x = facePosition[i * 6]!;
          const bottom = SILO.floorY;
          facePosition[i * 6 + 1] = bottom;
          facePosition[i * 6 + 4] = surfaceAt(x, CUT_PLANE_Z, frame);
          faceUV[i * 4 + 1] = bottom / 0.22;
          faceUV[i * 4 + 3] = facePosition[i * 6 + 4]! / 0.22;
        }
        faceGeo.getAttribute("position").needsUpdate = true;
        faceGeo.getAttribute("uv").needsUpdate = true;
        faceGeo.computeVertexNormals();
      }
      const phase = dischargeAt(frame.time).mobilised * 0.025;
      for (let i = 0; i < instances.count; i++) {
        const w = i % 2 === 0 ? frame.workers.A : frame.workers.B;
        // Local redistribution uses the same deterministic motion integral.
        // No particles emerge under the floor: this scenario has no net discharge.
        const ox = offsets[i * 4]!,
          oz = offsets[i * 4 + 1]!,
          seed = offsets[i * 4 + 2]!;
        const theta = Math.atan2(oz, ox),
          rr = Math.hypot(ox, oz);
        const localTravel = (phase * (0.8 + seed * 0.2) + seed * 0.15) % 0.15;
        const localRadius = Math.max(0, rr - localTravel * frame.gate);
        const x = w.position.x + Math.cos(theta) * localRadius,
          z = w.position.z + Math.sin(theta) * localRadius;
        scratch.position.set(x, surfaceAt(x, z, frame) + 0.003, z);
        scratch.rotation.set(seed * 6.28, theta, seed * 3);
        scratch.scale.setScalar(offsets[i * 4 + 3]!);
        scratch.updateMatrix();
        instances.setMatrixAt(i, scratch.matrix);
      }
      instances.instanceMatrix.needsUpdate = true;
    },
    dispose() {
      for (const g of [geo, sideGeo, faceGeo, grainGeo]) g.dispose();
      for (const m of [mat, sideMat, faceMat, grainMat]) m.dispose();
      texture.dispose();
      instances.dispose();
      root.clear();
    },
  };
}
