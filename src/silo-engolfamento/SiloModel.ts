import * as T from "three";
import { mergeGeometries } from "three/examples/jsm/utils/BufferGeometryUtils.js";
import { SILO } from "./simulation";

// Section is slightly ahead of the technicians, so material can surround their
// feet and progressively occlude them. Every cut resource uses this same plane.
export const CUT_PLANE_Z = 0.7;

/** Original parametric presentation in metres, Y up, pivot at foundation centre.
 * Photo-inspired dimensions; NOT a manufacturer model or structural design. */
export function createSiloModel() {
  const root = new T.Group();
  const back = new T.Group(),
    front = new T.Group(),
    roof = new T.Group();
  const access = new T.Group(),
    structure = new T.Group();
  root.add(back, front, roof, access, structure);
  const cutPlane = new T.Plane(new T.Vector3(0, 0, -1), CUT_PLANE_Z);
  const geometries: T.BufferGeometry[] = [],
    materials: T.Material[] = [],
    textures: T.Texture[] = [];
  // Fine galvanized mottling is a normal/roughness detail, never thousands of bolts.
  const pixels = new Uint8Array(128 * 128 * 4);
  for (let i = 0; i < 128 * 128; i++) {
    const n = ((i * 1664525 + 1013904223) >>> 11) % 9;
    pixels.set([203 + n, 209 + n, 210 + n, 255], i * 4);
  }
  const galvanizing = new T.DataTexture(pixels, 128, 128);
  galvanizing.wrapS = galvanizing.wrapT = T.RepeatWrapping;
  galvanizing.repeat.set(12, 18);
  galvanizing.colorSpace = T.SRGBColorSpace;
  galvanizing.needsUpdate = true;
  textures.push(galvanizing);
  const steel = new T.MeshStandardMaterial({
    color: "#bbc5c7",
    map: galvanizing,
    metalness: 0.54,
    roughness: 0.68,
    side: T.DoubleSide,
  });
  const frame = new T.MeshStandardMaterial({ color: "#788d93", metalness: 0.55, roughness: 0.66 });
  const yellow = new T.MeshStandardMaterial({ color: "#e4af29", metalness: 0.22, roughness: 0.62 });
  const dark = new T.MeshStandardMaterial({ color: "#29474e", roughness: 0.8, metalness: 0.3 });
  const red = new T.MeshStandardMaterial({ color: "#ba552e", roughness: 0.7, metalness: 0.35 });
  materials.push(steel, frame, yellow, dark, red);
  const buckets = new Map<T.Group, Map<T.Material, T.BufferGeometry[]>>();
  const add = (
    group: T.Group,
    mat: T.Material,
    geometry: T.BufferGeometry,
    position: T.Vector3 = new T.Vector3(),
    rotation?: T.Euler,
  ) => {
    if (rotation) geometry.applyMatrix4(new T.Matrix4().makeRotationFromEuler(rotation));
    geometry.translate(position.x, position.y, position.z);
    if (!buckets.has(group)) buckets.set(group, new Map());
    const byMaterial = buckets.get(group)!;
    if (!byMaterial.has(mat)) byMaterial.set(mat, []);
    byMaterial.get(mat)!.push(geometry);
  };
  const box = (
    g: T.Group,
    m: T.Material,
    x: number,
    y: number,
    z: number,
    w: number,
    h: number,
    d: number,
  ) => add(g, m, new T.BoxGeometry(w, h, d), new T.Vector3(x, y, z));
  const beam = (g: T.Group, m: T.Material, a: number[], b: number[], width = 0.055) => {
    const p = new T.Vector3(...(a as [number, number, number])),
      end = new T.Vector3(...(b as [number, number, number]));
    const geo = new T.CylinderGeometry(width, width, p.distanceTo(end), 6, 1);
    geo.applyQuaternion(
      new T.Quaternion().setFromUnitVectors(new T.Vector3(0, 1, 0), end.clone().sub(p).normalize()),
    );
    add(g, m, geo, p.add(end).multiplyScalar(0.5));
  };
  const { radius: r, hopperTop: h, bodyTop: top, outletY: o, roofTop: rt } = SILO;
  for (const [group, start] of [
    [back, Math.PI / 2],
    [front, -Math.PI / 2],
  ] as const) {
    // Corrugated silhouette, one mesh per half. 75 mm horizontal corrugation.
    const geo = new T.CylinderGeometry(r, r, top - h, 64, 320, true, start, Math.PI);
    const p = geo.getAttribute("position");
    for (let i = 0; i < p.count; i++) {
      const y = p.getY(i) + (top + h) / 2;
      const rr = r + 0.007 * Math.sin(((y - h) * 2 * Math.PI) / 0.075);
      const x = p.getX(i),
        z = p.getZ(i),
        length = Math.hypot(x, z);
      p.setXYZ(i, (x * rr) / length, y, (z * rr) / length);
    }
    geo.computeVertexNormals();
    add(group, steel, geo);
    add(
      group,
      steel,
      new T.CylinderGeometry(r, SILO.outletRadius, h - o, 48, 1, true, start, Math.PI),
      new T.Vector3(0, (h + o) / 2, 0),
    );
    for (let j = 0; j < 7; j++) {
      const angle = start + (j * Math.PI) / 6,
        x = Math.sin(angle) * (r + 0.055),
        z = Math.cos(angle) * (r + 0.055);
      box(group, frame, x, (top + h) / 2, z, 0.095, top - h + 0.13, 0.075);
      for (let y = h + 0.25; y < top; y += 0.65) box(group, dark, x, y, z, 0.13, 0.025, 0.09);
    }
    for (const y of [h, top])
      add(
        group,
        frame,
        new T.CylinderGeometry(r + 0.065, r + 0.065, 0.1, 48, 1, true, start, Math.PI),
        new T.Vector3(0, y, 0),
      );
  }
  // Roof back/front coordinated separately so top camera can remove the whole roof.
  const roofBack = new T.Group(),
    roofFront = new T.Group();
  roof.add(roofBack, roofFront);
  for (const [group, start] of [
    [roofBack, Math.PI / 2],
    [roofFront, -Math.PI / 2],
  ] as const) {
    add(
      group,
      steel,
      new T.CylinderGeometry(0.48, r + 0.07, rt - top, 48, 1, true, start, Math.PI),
      new T.Vector3(0, (rt + top) / 2, 0),
    );
    for (let i = 0; i <= 8; i++) {
      const a = start + (i * Math.PI) / 8;
      beam(
        group,
        frame,
        [Math.sin(a) * 0.48, rt, Math.cos(a) * 0.48],
        [Math.sin(a) * r, top, Math.cos(a) * r],
        0.025,
      );
    }
  }
  // Roof inspection collar and illustrative vent. Removed with roof in top mode.
  add(
    roofBack,
    dark,
    new T.CylinderGeometry(0.48, 0.48, 0.18, 32, 1, true),
    new T.Vector3(0, rt + 0.08, 0),
  );
  add(
    roofBack,
    steel,
    new T.CylinderGeometry(0.28, 0.18, 0.25, 20),
    new T.Vector3(-1.4, top + 1.02, -1),
  );
  add(
    roofBack,
    red,
    new T.CylinderGeometry(0.38, 0.38, 0.06, 20),
    new T.Vector3(-1.4, top + 1.16, -1),
  );
  // Structural ring, eight columns, base plates, and crossed bracing.
  for (let i = 0; i < 8; i++) {
    const a = (i * Math.PI) / 4,
      x = Math.sin(a) * r,
      z = Math.cos(a) * r;
    box(structure, frame, x, h / 2, z, 0.15, h, 0.15);
    box(structure, frame, x, 0.13, z, 0.4, 0.035, 0.4);
    const next = ((i + 1) * Math.PI) / 4,
      nx = Math.sin(next) * r,
      nz = Math.cos(next) * r;
    beam(structure, frame, [x, 0.25, z], [nx, h - 0.18, nz], 0.045);
    beam(structure, frame, [nx, 0.25, nz], [x, h - 0.18, z], 0.045);
  }
  const foundation = new T.Mesh(
    new T.CylinderGeometry(r + 1.05, r + 1.12, 0.18, 64),
    new T.MeshStandardMaterial({ color: "#c0c9c3", roughness: 0.95 }),
  );
  foundation.position.y = 0.02;
  foundation.receiveShadow = true;
  root.add(foundation);
  geometries.push(foundation.geometry);
  materials.push(foundation.material);
  // Photo-inspired access ladder with rest platforms; no conformity claim.
  const x = -r - 0.6,
    z = -0.2;
  box(access, yellow, x, 4.75, z, 1.1, 0.1, 1.2);
  box(access, yellow, x, top, z, 1.1, 0.1, 1.2);
  for (let i = 0; i < 34; i++) {
    const y = 0.3 + i * 0.28;
    beam(access, yellow, [x - 0.3, y, z], [x + 0.3, y, z], 0.027);
  }
  beam(access, yellow, [x - 0.35, 0.16, z], [x - 0.35, top + 0.2, z], 0.035);
  beam(access, yellow, [x + 0.35, 0.16, z], [x + 0.35, top + 0.2, z], 0.035);
  for (const level of [4.75, top]) {
    for (const xx of [x - 0.52, x + 0.52]) {
      for (const zz of [z - 0.55, z + 0.55])
        beam(access, yellow, [xx, level, zz], [xx, level + 1.15, zz], 0.025);
      beam(access, yellow, [xx, level + 1.15, z - 0.55], [xx, level + 1.15, z + 0.55], 0.025);
      box(access, yellow, xx, level + 0.1, z, 0.025, 0.2, 1.2);
    }
    for (const y of [level + 0.7, level + 1.15])
      beam(access, yellow, [x - 0.52, y, z - 0.55], [x + 0.52, y, z - 0.55], 0.025);
  }
  // Central outlet and driven slide gate: visual aperture uses domain gate only.
  add(
    structure,
    dark,
    new T.CylinderGeometry(SILO.outletRadius, SILO.outletRadius, 0.28, 24, 1, true),
    new T.Vector3(0, o - 0.14, 0),
  );
  // Open guide frame around the outlet, not a solid plug through the grain path.
  for (const x of [-0.34, 0.34]) box(structure, frame, x, o - 0.32, 0, 0.055, 0.1, 0.5);
  for (const z of [-0.22, 0.22]) box(structure, frame, 0, o - 0.32, z, 0.68, 0.1, 0.055);
  const gate = new T.Mesh(new T.BoxGeometry(SILO.outletRadius * 2 + 0.04, 0.09, 0.42), red);
  gate.position.set(0, o - 0.32, 0);
  root.add(gate);
  geometries.push(gate.geometry);
  const handle = new T.Mesh(new T.TorusGeometry(0.14, 0.024, 6, 20), dark);
  handle.position.set(0.64, o - 0.31, 0.05);
  handle.rotation.y = Math.PI / 2;
  gate.add(handle);
  geometries.push(handle.geometry);
  for (const [group, byMaterial] of buckets)
    for (const [mat, list] of byMaterial) {
      const merged = mergeGeometries(list, false)!;
      list.forEach((g) => g.dispose());
      geometries.push(merged);
      const mesh = new T.Mesh(merged, mat);
      mesh.castShadow = group === structure || group === back;
      mesh.receiveShadow = true;
      group.add(mesh);
    }
  let highlighted: T.Material | null = null;
  return {
    root,
    gate,
    setView(cut: boolean, internal: boolean, topView: boolean) {
      front.visible = true;
      roof.visible = !topView;
      roofFront.visible = true;
      access.visible = !internal;
      const clipped = cut && !internal;
      for (const material of [steel, frame, yellow, dark, red]) {
        if (Boolean(material.clippingPlanes?.length) === clipped) continue;
        material.clippingPlanes = clipped ? [cutPlane] : [];
        material.clipShadows = clipped;
        material.needsUpdate = true;
      }
    },
    highlight(id: string | null) {
      if (highlighted instanceof T.MeshStandardMaterial) highlighted.emissive.set(0);
      highlighted = id === "gate" ? red : null;
      if (highlighted instanceof T.MeshStandardMaterial) highlighted.emissive.set("#6c290e");
    },
    update(open: number) {
      gate.position.x = open * 0.65;
    },
    dispose() {
      geometries.forEach((g) => g.dispose());
      materials.forEach((m) => m.dispose());
      textures.forEach((t) => t.dispose());
      root.clear();
    },
  };
}
