import * as T from "three";
import { mergeGeometries } from "three/examples/jsm/utils/BufferGeometryUtils.js";
import { SILO_CONFIG } from "./SiloConfig";
import { canonicalComponentId } from "./ComponentRegistry";

/** Same plane as the grain renderer. The section changes visibility only. */
export const CUT_PLANE_Z = 0.7;
const UP = new T.Vector3(0, 1, 0);

/** Grounded reconstruction, metres/Y-up. No manufacturer CAD was available.
 * The external-envelope difference is deliberately not a 320 mm wall. */
export function createSiloModel() {
  const root = new T.Group(),
    shell = new T.Group(),
    roof = new T.Group(),
    access = new T.Group();
  root.name = "Nexus_silo_fundo_plano_parametrico";
  root.add(shell, roof, access);
  const bindings = new Map<string, T.Object3D[]>();
  const geometries = new Set<T.BufferGeometry>(),
    materials = new Set<T.Material>(),
    textures = new Set<T.Texture>();
  const buckets = new Map<
    string,
    { id: string; group: T.Group; material: T.Material; parts: T.BufferGeometry[] }
  >();
  const r = SILO_CONFIG.radius.value,
    top = SILO_CONFIG.bodyTop.value,
    rt = SILO_CONFIG.roofTop.value,
    floor = SILO_CONFIG.floorY.value;
  const cutPlane = new T.Plane(new T.Vector3(0, 0, -1), CUT_PLANE_Z);
  const bind = (id: string, object: T.Object3D) => {
    object.userData["componentId"] = id;
    const list = bindings.get(id) ?? [];
    list.push(object);
    bindings.set(id, list);
  };
  // Deterministic local zinc spangles and fine roughness, rather than external photos.
  const size = 128,
    colour = new Uint8Array(size * size * 4),
    rough = new Uint8Array(size * size * 4);
  for (let y = 0; y < size; y++)
    for (let x = 0; x < size; x++) {
      const i = (y * size + x) * 4,
        cell = ((Math.floor(x / 7) * 73856093) ^ (Math.floor(y / 9) * 19349663)) >>> 0;
      const n = (cell % 19) + ((x * 17 + y * 31) % 7),
        value = 156 + (cell % 28);
      colour.set([191 + n, 198 + n, 199 + n, 255], i);
      rough.set([value, value, value, 255], i);
    }
  const zinc = new T.DataTexture(colour, size, size),
    roughness = new T.DataTexture(rough, size, size);
  for (const texture of [zinc, roughness]) {
    texture.wrapS = texture.wrapT = T.RepeatWrapping;
    // 7×9 texel spangles occupy about 21×5 mm on the 69m×24.7m shell.
    texture.repeat.set(180, 320);
    texture.generateMipmaps = true;
    texture.minFilter = T.LinearMipmapLinearFilter;
    texture.magFilter = T.LinearFilter;
    texture.anisotropy = 4;
    texture.needsUpdate = true;
    textures.add(texture);
  }
  zinc.colorSpace = T.SRGBColorSpace;
  const steel = new T.MeshStandardMaterial({
    color: "#c0c8c7",
    map: zinc,
    roughnessMap: roughness,
    metalness: 0.62,
    roughness: 0.74,
    side: T.DoubleSide,
  });
  const frame = new T.MeshStandardMaterial({ color: "#98a5a9", metalness: 0.74, roughness: 0.57 });
  const concrete = new T.MeshStandardMaterial({ color: "#94998b", roughness: 1 });
  const floorMat = new T.MeshStandardMaterial({ color: "#858b83", roughness: 0.94 });
  const yellow = new T.MeshStandardMaterial({ color: "#bf943c", metalness: 0.5, roughness: 0.62 });
  const dark = new T.MeshStandardMaterial({ color: "#394543", metalness: 0.58, roughness: 0.68 });
  // The external presentation channel remains with the foundation/floor context
  // when the shell is sectioned. Its material must not inherit dark's shell cut.
  const extractionMat = dark.clone();
  const red = new T.MeshStandardMaterial({ color: "#9e4e31", metalness: 0.45, roughness: 0.64 });
  [steel, frame, concrete, floorMat, yellow, dark, extractionMat, red].forEach((mat) =>
    materials.add(mat),
  );
  const add = (
    group: T.Group,
    id: string,
    material: T.Material,
    geometry: T.BufferGeometry,
    p = new T.Vector3(),
    q?: T.Quaternion,
  ) => {
    if (q) geometry.applyQuaternion(q);
    geometry.translate(p.x, p.y, p.z);
    const key = `${group.uuid}:${id}:${material.uuid}`;
    let bucket = buckets.get(key);
    if (!bucket) {
      bucket = { id, group, material, parts: [] };
      buckets.set(key, bucket);
    }
    bucket.parts.push(geometry);
  };
  const box = (
    g: T.Group,
    id: string,
    mat: T.Material,
    x: number,
    y: number,
    z: number,
    w: number,
    h: number,
    d: number,
    angle = 0,
  ) =>
    add(
      g,
      id,
      mat,
      new T.BoxGeometry(w, h, d),
      new T.Vector3(x, y, z),
      new T.Quaternion().setFromAxisAngle(UP, angle),
    );
  const beam = (
    g: T.Group,
    id: string,
    mat: T.Material,
    a: number[],
    b: number[],
    radius = 0.025,
  ) => {
    const p = new T.Vector3().fromArray(a),
      end = new T.Vector3().fromArray(b);
    add(
      g,
      id,
      mat,
      new T.CylinderGeometry(radius, radius, p.distanceTo(end), 6),
      p.clone().add(end).multiplyScalar(0.5),
      new T.Quaternion().setFromUnitVectors(UP, end.sub(p).normalize()),
    );
  };
  const ring = (g: T.Group, id: string, mat: T.Material, radius: number, y: number, tube = 0.04) =>
    add(
      g,
      id,
      mat,
      // Millimetre sheet seams need a silhouette, not a fully round pipe. Keep
      // the larger concrete plinth round while simplifying only distant seams.
      new T.TorusGeometry(radius, tube, tube > 0.06 ? 8 : 3, tube > 0.06 ? 128 : 96).rotateX(
        Math.PI / 2,
      ),
      new T.Vector3(0, y, 0),
    );
  // Actual corrugated silhouette: retain 512 vertical samples (~3 per wave),
  // use 80 circumferential samples (8.5mm nominal chord error at 11m radius).
  // Fine texture uses filtered roughness rather than extra geometry.
  const body = new T.CylinderGeometry(r, r, top - floor, 80, 512, true),
    pos = body.getAttribute("position");
  for (let i = 0; i < pos.count; i++) {
    const y = pos.getY(i) + (top + floor) / 2,
      rr = r + 0.012 * Math.cos(((y - floor) * Math.PI * 2) / 0.152),
      length = Math.hypot(pos.getX(i), pos.getZ(i));
    pos.setXYZ(i, (pos.getX(i) / length) * rr, y, (pos.getZ(i) / length) * rr);
  }
  body.computeVertexNormals();
  add(shell, "structure.shell", steel, body);
  add(root, "structure.foundation", concrete, new T.CylinderGeometry(r + 0.8, r + 0.92, 0.36, 128));
  ring(root, "structure.foundation", concrete, r + 0.16, floor + 0.07, 0.12);
  add(
    root,
    "structure.floor",
    floorMat,
    new T.CylinderGeometry(r - 0.015, r - 0.015, 0.06, 96),
    new T.Vector3(0, floor - 0.03, 0),
  );
  for (let i = 0; i < 32; i++) {
    const a = (i * Math.PI * 2) / 32,
      x = Math.sin(a) * (r + 0.065),
      z = Math.cos(a) * (r + 0.065);
    box(
      shell,
      "structure.stiffeners",
      frame,
      x,
      (top + floor) / 2,
      z,
      0.105,
      top - floor,
      0.095,
      a,
    );
    box(shell, "structure.foundation", frame, x, floor + 0.055, z, 0.24, 0.045, 0.24, a);
    for (let y = floor + 1.15; y < top; y += 1.22)
      box(shell, "structure.stiffeners", frame, x, y, z, 0.18, 0.07, 0.115, a);
  }
  for (let y = floor + 1.22; y < top; y += 1.22)
    ring(shell, "structure.stiffeners", frame, r + 0.026, y, 0.013);
  for (const y of [floor + 0.12, top - 0.045])
    ring(shell, "structure.stiffeners", frame, r + 0.055, y, 0.052);
  const boltGeometry = new T.CylinderGeometry(0.012, 0.012, 0.014, 6).rotateX(Math.PI / 2);
  // The rear cap is embedded in the mounting strip. Preserve the visible hex
  // head and side wall; omit only the six permanently hidden rear triangles.
  boltGeometry.setIndex(Array.from(boltGeometry.index!.array).slice(0, -18));
  geometries.add(boltGeometry);
  const bolts = new T.InstancedMesh(boltGeometry, dark, 32 * 21),
    transform = new T.Object3D();
  let bolt = 0;
  for (let i = 0; i < 32; i++)
    for (let j = 0; j < 21; j++) {
      const a = (i * Math.PI * 2) / 32;
      transform.position.set(
        Math.sin(a) * (r + 0.122),
        floor + 0.2 + j * 1.16,
        Math.cos(a) * (r + 0.122),
      );
      transform.rotation.set(0, a, 0);
      transform.updateMatrix();
      bolts.setMatrixAt(bolt++, transform.matrix);
    }
  shell.add(bolts);
  bind("structure.stiffeners", bolts);
  // Ring-grid roof includes a genuine opening; no black rectangle over solid roof.
  const hatchAngle = (8.4 * Math.PI) / 180,
    half = 0.043;
  const angles = Array.from({ length: 129 }, (_, i) => (i / 128) * Math.PI * 2);
  angles.push(hatchAngle - half, hatchAngle + half);
  angles.sort((a, b) => a - b);
  const roofRadius = SILO_CONFIG.roofEaveRadius.value;
  const radii = [1, 2, 3, 4, 5, 6, 7, 8, 9, 10, 10.15, 10.95, roofRadius];
  const roofY = (rr: number) => top + ((rt - top) * (roofRadius - rr)) / (roofRadius - 1),
    verts: number[] = [];
  for (let ia = 0; ia < angles.length - 1; ia++)
    for (let ir = 0; ir < radii.length - 1; ir++) {
      const mid = (angles[ia]! + angles[ia + 1]!) / 2;
      if (
        mid > hatchAngle - half &&
        mid < hatchAngle + half &&
        radii[ir]! >= 10.15 &&
        radii[ir + 1]! <= 10.95
      )
        continue;
      const points = [
        [angles[ia]!, radii[ir]!],
        [angles[ia + 1]!, radii[ir]!],
        [angles[ia + 1]!, radii[ir + 1]!],
        [angles[ia]!, radii[ir + 1]!],
      ];
      for (const index of [0, 1, 2, 0, 2, 3]) {
        const [a, rr] = points[index]!;
        verts.push(Math.sin(a!) * rr!, roofY(rr!), Math.cos(a!) * rr!);
      }
    }
  const roofGeometry = new T.BufferGeometry();
  roofGeometry.setAttribute("position", new T.Float32BufferAttribute(verts, 3));
  const roofUv: number[] = [];
  for (let i = 0; i < verts.length; i += 3)
    roofUv.push(verts[i]! / (Math.PI * 2 * r) + 0.5, verts[i + 2]! / (top - floor) + 0.5);
  roofGeometry.setAttribute("uv", new T.Float32BufferAttribute(roofUv, 2));
  roofGeometry.setIndex(Array.from({ length: verts.length / 3 }, (_, i) => i));
  roofGeometry.computeVertexNormals();
  add(roof, "structure.roof", steel, roofGeometry);
  for (let i = 0; i < 32; i++) {
    const a = (i * Math.PI * 2) / 32;
    beam(
      roof,
      "structure.roof",
      frame,
      [Math.sin(a), rt + 0.018, Math.cos(a)],
      [Math.sin(a) * roofRadius, roofY(roofRadius) + 0.018, Math.cos(a) * roofRadius],
      0.023,
    );
  }
  add(
    roof,
    "structure.roof",
    frame,
    new T.CylinderGeometry(1, 1, 0.22, 64, 1, true),
    new T.Vector3(0, rt - 0.11, 0),
  );
  add(
    roof,
    "structure.roof",
    steel,
    new T.CircleGeometry(1, 64).rotateX(-Math.PI / 2),
    new T.Vector3(0, rt, 0),
  );
  ring(roof, "structure.roof", frame, roofRadius, top, 0.055);
  const corners = [
    [hatchAngle - half, 10.15],
    [hatchAngle + half, 10.15],
    [hatchAngle + half, 10.95],
    [hatchAngle - half, 10.95],
  ].map(([a, rr]) => [Math.sin(a!) * rr!, roofY(rr!) + 0.05, Math.cos(a!) * rr!]);
  for (let i = 0; i < 4; i++)
    beam(roof, "structure.manhole", frame, corners[i]!, corners[(i + 1) % 4]!, 0.035);
  const hatch = new T.Group();
  hatch.position.set(
    Math.sin(hatchAngle) * 10.55,
    roofY(10.55) + 0.07,
    Math.cos(hatchAngle) * 10.55,
  );
  hatch.rotation.set(Math.atan((rt - top) / (roofRadius - 1)), hatchAngle, 0, "YXZ");
  roof.add(hatch);
  const hatchHinge = new T.Group(),
    hatchLid = new T.Group();
  hatchHinge.position.z = -0.42;
  hatchLid.position.z = 0.42;
  hatchHinge.add(hatchLid);
  hatch.add(hatchHinge);
  box(hatchLid, "structure.manhole", steel, 0, 0.035, 0, 0.91, 0.035, 0.84);
  beam(hatchLid, "structure.manhole", dark, [-0.12, 0.1, 0], [0.12, 0.1, 0], 0.016);
  for (const x of [-0.31, 0.31])
    box(hatch, "structure.manhole", dark, x, 0.05, -0.43, 0.085, 0.04, 0.065);
  // Exterior ladder, real arrival platforms, then a bridge to the hatch lip.
  const rr = r + 0.78,
    local = new T.Group();
  local.rotation.y = hatchAngle;
  access.add(local);
  for (const x of [-0.32, 0.32])
    beam(local, "structure.access", frame, [x, floor, rr], [x, top + 1.1, rr], 0.035);
  for (let y = floor + 0.24; y < top; y += 0.28)
    beam(local, "structure.access", frame, [-0.32, y, rr], [0.32, y, rr], 0.025);
  for (const level of [8.3, 16.6, top]) {
    box(local, "structure.access", dark, 0, level, rr + 0.25, 1.25, 0.07, 1.25);
    for (const x of [-0.6, 0.6]) {
      for (const z of [rr - 0.34, rr + 0.86])
        beam(local, "structure.access", yellow, [x, level, z], [x, level + 1.1, z], 0.022);
      for (const y of [level + 0.55, level + 1.1])
        beam(local, "structure.access", yellow, [x, y, rr - 0.34], [x, y, rr + 0.86], 0.022);
    }
    for (const y of [level + 0.55, level + 1.1])
      beam(local, "structure.access", yellow, [-0.6, y, rr + 0.86], [0.6, y, rr + 0.86], 0.022);
  }
  for (const x of [-0.48, 0.48]) {
    beam(
      local,
      "structure.access",
      frame,
      [x, top + 0.02, rr - 0.35],
      [x, roofY(10.95) + 0.07, 10.95],
      0.045,
    );
    beam(
      local,
      "structure.access",
      yellow,
      [x, top + 1.05, rr - 0.35],
      [x, roofY(10.95) + 1.1, 10.95],
      0.023,
    );
  }
  for (let j = 0; j < 5; j++) {
    const z = rr - 0.35 - (j * (rr - 0.35 - 10.95)) / 4,
      y = top + ((roofY(10.95) - top) * j) / 4 + 0.05;
    beam(local, "structure.access", dark, [-0.48, y, z], [0.48, y, z], 0.05);
  }
  // Visual-only channel. It is not a second invisible cause of the incident.
  box(root, "structure.extraction", extractionMat, 0, floor + 0.1, 11.28, 0.7, 0.2, 1.55);
  const gate = new T.Mesh(new T.BoxGeometry(0.6, 0.06, 0.7), red);
  gate.position.set(0, floor + 0.22, 11.55);
  root.add(gate);
  bind("structure.extraction", gate);
  geometries.add(gate.geometry);
  for (const bucket of buckets.values()) {
    const merged = mergeGeometries(bucket.parts, false);
    bucket.parts.forEach((geometry) => geometry.dispose());
    if (!merged) throw new Error("Falha ao consolidar subsistema do silo");
    geometries.add(merged);
    const mesh = new T.Mesh(merged, bucket.material);
    mesh.castShadow = [
      "structure.shell",
      "structure.roof",
      "structure.access",
      "structure.stiffeners",
    ].includes(bucket.id);
    // Fine corrugations retain their geometry and direct-light normals. They do
    // not sample a coarse shadow map into each 12mm valley (self-shadow acne).
    mesh.receiveShadow = !["structure.shell", "structure.roof"].includes(bucket.id);
    bucket.group.add(mesh);
    bind(bucket.id, mesh);
  }
  let clipped: boolean | null = null,
    revealed = false,
    transparent = false,
    disposed = false;
  const highlighted = new Map<T.Mesh, T.Material | T.Material[]>();
  const clearHighlight = () => {
    for (const [mesh, original] of highlighted) {
      const current = mesh.material;
      mesh.material = original;
      (Array.isArray(current) ? current : [current]).forEach((mat) => mat.dispose());
    }
    highlighted.clear();
  };
  return {
    root,
    gate,
    bindings,
    setView(cut: boolean, internal: boolean, topView: boolean) {
      roof.visible = !(topView || revealed);
      const enabled = cut && !internal;
      if (clipped === enabled) return;
      clipped = enabled;
      for (const mat of [steel, frame, yellow, dark]) {
        mat.clippingPlanes = enabled ? [cutPlane] : [];
        mat.clipShadows = enabled;
        mat.needsUpdate = true;
      }
    },
    setPresentation(options: {
      roof?: "closed" | "revealed";
      transparent?: boolean;
      hatchOpen?: boolean;
    }) {
      if (options.roof) revealed = options.roof === "revealed";
      if (options.hatchOpen !== undefined) hatchHinge.rotation.x = options.hatchOpen ? -2 : 0;
      if (options.transparent !== undefined && transparent !== options.transparent) {
        transparent = options.transparent;
        steel.transparent = transparent;
        steel.opacity = transparent ? 0.22 : 1;
        steel.depthWrite = !transparent;
        steel.needsUpdate = true;
      }
    },
    highlight(id: string | null) {
      clearHighlight();
      if (!id) return;
      for (const object of bindings.get(canonicalComponentId(id)) ?? [])
        object.traverse((node) => {
          if (!(node instanceof T.Mesh)) return;
          highlighted.set(node, node.material);
          const list = (Array.isArray(node.material) ? node.material : [node.material]).map(
            (mat) => {
              const copy = mat.clone();
              if (copy instanceof T.MeshStandardMaterial) {
                copy.emissive.set("#92c83e");
                copy.emissiveIntensity = 0.22;
              }
              return copy;
            },
          );
          node.material = Array.isArray(node.material) ? list : list[0]!;
        });
    },
    update(open: number) {
      gate.position.x = Math.max(0, Math.min(1, open)) * 0.65;
    },
    dispose() {
      if (disposed) return;
      disposed = true;
      clearHighlight();
      geometries.forEach((g) => g.dispose());
      materials.forEach((m) => m.dispose());
      textures.forEach((t) => t.dispose());
      root.clear();
      bindings.clear();
    },
  };
}
