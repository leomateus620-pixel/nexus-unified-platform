import * as THREE from "three";
import { DIM, type GroupId, type LayerId, type Vec3 } from "./data.ts";

type MaterialId =
  | "steel"
  | "red"
  | "blue"
  | "roof"
  | "white"
  | "masonry"
  | "concrete"
  | "glass"
  | "dark"
  | "cream"
  | "symbol";
type Instance = { position: Vec3; scale: Vec3; quaternion: THREE.Quaternion };
type Batch = {
  entity: string;
  group: GroupId;
  layer: LayerId;
  material: MaterialId;
  instances: Instance[];
  vertices: number[];
  uv: number[];
};
export interface TrevisanModel {
  root: THREE.Group;
  entities: Map<string, THREE.Group>;
  stats: { instances: number; batches: number; triangles: number };
  dispose: () => void;
}

/** Procedural, metre-based geometry. Unspecified heights are NEVER extruded. */
export function buildTrevisanModel(): TrevisanModel {
  const root = new THREE.Group();
  root.name = "Trevisan — levantamento preliminar";
  const entities = new Map<string, THREE.Group>();
  const batches = new Map<string, Batch>();
  const geom = new THREE.BoxGeometry(1, 1, 1);
  // Shared micro-normal texture: corrugated sheet, a visual finish, not sheet specification.
  const pixels = new Uint8Array(64 * 4);
  for (let i = 0; i < 64; i++) {
    const n = new THREE.Vector3(Math.sin((i / 64) * Math.PI * 2) * 0.65, 0, 1).normalize();
    pixels.set(
      [Math.round((n.x * 0.5 + 0.5) * 255), 128, Math.round((n.z * 0.5 + 0.5) * 255), 255],
      i * 4,
    );
  }
  const normal = new THREE.DataTexture(pixels, 64, 1);
  normal.wrapS = normal.wrapT = THREE.RepeatWrapping;
  normal.magFilter = THREE.LinearFilter;
  normal.minFilter = THREE.LinearFilter;
  normal.needsUpdate = true;
  const standard = (color: string, metalness: number, roughness: number) =>
    new THREE.MeshStandardMaterial({ color, metalness, roughness, side: THREE.DoubleSide });
  const mats: Record<MaterialId, THREE.MeshStandardMaterial> = {
    steel: standard("#616f78", 0.65, 0.48),
    red: standard("#884936", 0.42, 0.57),
    blue: standard("#32617e", 0.42, 0.5),
    roof: standard("#a6b5bc", 0.52, 0.53),
    white: standard("#e4e8e5", 0.3, 0.61),
    masonry: standard("#d1cbbd", 0.02, 0.92),
    concrete: standard("#b9b9ac", 0.02, 0.93),
    glass: standard("#91b8c3", 0.12, 0.28),
    dark: standard("#27393d", 0.3, 0.77),
    cream: standard("#d6c397", 0.25, 0.65),
    symbol: standard("#b4884d", 0.15, 0.8),
  };
  mats.roof.normalMap = normal;
  mats.white.normalMap = normal;
  mats.roof.normalScale.set(0.32, 0.32);
  mats.white.normalScale.set(0.24, 0.24);
  const owner = (id: string, group: GroupId) => {
    let e = entities.get(id);
    if (!e) {
      e = new THREE.Group();
      e.name = id;
      e.userData = { entity: id, group };
      entities.set(id, e);
      root.add(e);
    }
    return e;
  };
  const batch = (entity: string, group: GroupId, layer: LayerId, material: MaterialId) => {
    const key = [entity, layer, material].join("/");
    let b = batches.get(key);
    if (!b) {
      b = { entity, group, layer, material, instances: [], vertices: [], uv: [] };
      batches.set(key, b);
    }
    return b;
  };
  const box = (
    e: string,
    g: GroupId,
    l: LayerId,
    m: MaterialId,
    p: Vec3,
    s: Vec3,
    q = new THREE.Quaternion(),
  ) => batch(e, g, l, m).instances.push({ position: p, scale: s, quaternion: q });
  const beam = (
    e: string,
    g: GroupId,
    l: LayerId,
    m: MaterialId,
    a: Vec3,
    b: Vec3,
    w = 0.065,
    d = w,
  ) => {
    const av = new THREE.Vector3(...a),
      bv = new THREE.Vector3(...b),
      dir = bv.clone().sub(av);
    if (dir.length() < 0.0001) return;
    box(
      e,
      g,
      l,
      m,
      av.add(bv).multiplyScalar(0.5).toArray() as Vec3,
      [w, dir.length(), d],
      new THREE.Quaternion().setFromUnitVectors(new THREE.Vector3(0, 1, 0), dir.normalize()),
    );
  };
  const quad = (
    e: string,
    g: GroupId,
    l: LayerId,
    m: MaterialId,
    a: Vec3,
    b: Vec3,
    c: Vec3,
    d: Vec3,
  ) => {
    const s = batch(e, g, l, m),
      w = new THREE.Vector3(...a).distanceTo(new THREE.Vector3(...b)),
      h = new THREE.Vector3(...b).distanceTo(new THREE.Vector3(...c));
    s.vertices.push(...a, ...b, ...c, ...a, ...c, ...d);
    s.uv.push(0, 0, w * 4, 0, w * 4, h * 4, 0, 0, w * 4, h * 4, 0, h * 4);
  };
  const triangle = (
    e: string,
    g: GroupId,
    l: LayerId,
    m: MaterialId,
    a: Vec3,
    b: Vec3,
    c: Vec3,
  ) => {
    const s = batch(e, g, l, m);
    s.vertices.push(...a, ...b, ...c);
    s.uv.push(0, 0, 1, 0, 0.5, 1);
  };
  const wall = (
    e: string,
    g: GroupId,
    m: MaterialId,
    x: number,
    z: number,
    w: number,
    d: number,
    bottom: number,
    top: number,
  ) => box(e, g, "fechamentos", m, [x, (bottom + top) / 2, z], [w, top - bottom, d]);
  const truss = (
    e: string,
    g: GroupId,
    m: MaterialId,
    a: Vec3,
    b: Vec3,
    depth: number,
    panel = 1.5,
  ) => {
    beam(e, g, "estrutura", m, a, b);
    beam(e, g, "estrutura", m, [a[0], a[1] - depth, a[2]], [b[0], b[1] - depth, b[2]]);
    const count = Math.ceil(new THREE.Vector3(...a).distanceTo(new THREE.Vector3(...b)) / panel);
    for (let i = 0; i <= count; i++) {
      const t = i / count,
        p: Vec3 = [a[0] + (b[0] - a[0]) * t, a[1] + (b[1] - a[1]) * t, a[2] + (b[2] - a[2]) * t];
      beam(e, g, "estrutura", m, p, [p[0], p[1] - depth, p[2]], 0.04);
      if (i < count) {
        const k = (i + 1) / count;
        beam(
          e,
          g,
          "estrutura",
          m,
          [p[0], p[1] - depth, p[2]],
          [a[0] + (b[0] - a[0]) * k, a[1] + (b[1] - a[1]) * k, a[2] + (b[2] - a[2]) * k],
          0.04,
        );
      }
    }
  };
  const lattice = (
    e: string,
    g: GroupId,
    m: MaterialId,
    x: number,
    z: number,
    bottom: number,
    top: number,
    width = 0.6,
  ) => {
    const r = width / 2;
    for (const dx of [-r, r])
      for (const dz of [-r, r])
        beam(e, g, "estrutura", m, [x + dx, bottom, z + dz], [x + dx, top, z + dz], 0.07);
    const n = Math.ceil((top - bottom) / 1.2);
    for (let i = 0; i < n; i++) {
      const y = bottom + ((top - bottom) * i) / n,
        ny = bottom + ((top - bottom) * (i + 1)) / n;
      for (const s of [-r, r]) {
        beam(e, g, "estrutura", m, [x - r, y, z + s], [x + r, ny, z + s], 0.035);
        beam(e, g, "estrutura", m, [x + s, y, z - r], [x + s, ny, z + r], 0.035);
      }
    }
  };
  type Cut = { x: number; z: number; w: number; d: number };
  const roof = (
    e: string,
    g: GroupId,
    x: number,
    z: number,
    w: number,
    d: number,
    eave: number,
    ridge: number,
    axis: "x" | "z" = "x",
    material: MaterialId = "roof",
    cuts: Cut[] = [],
  ) => {
    const cx = x + w / 2,
      cz = z + d / 2;
    const height = (xx: number, zz: number) =>
      axis === "x"
        ? ridge - ((ridge - eave) * Math.abs(xx - cx)) / (w / 2)
        : ridge - ((ridge - eave) * Math.abs(zz - cz)) / (d / 2);
    const xs = [
      x,
      ...(axis === "x" ? [cx] : []),
      x + w,
      ...cuts.flatMap((c) => [c.x, c.x + c.w]).filter((v) => v > x && v < x + w),
    ].sort((a, b) => a - b);
    const zs = [
      z,
      ...(axis === "z" ? [cz] : []),
      z + d,
      ...cuts.flatMap((c) => [c.z, c.z + c.d]).filter((v) => v > z && v < z + d),
    ].sort((a, b) => a - b);
    for (let i = 0; i < xs.length - 1; i++)
      for (let j = 0; j < zs.length - 1; j++) {
        const a = xs[i]!,
          b = xs[i + 1]!,
          c = zs[j]!,
          f = zs[j + 1]!;
        if (
          b - a < 0.001 ||
          f - c < 0.001 ||
          cuts.some(
            (k) =>
              (a + b) / 2 > k.x &&
              (a + b) / 2 < k.x + k.w &&
              (c + f) / 2 > k.z &&
              (c + f) / 2 < k.z + k.d,
          )
        )
          continue;
        quad(
          e,
          g,
          "coberturas",
          material,
          [a, height(a, c), c],
          [a, height(a, f), f],
          [b, height(b, f), f],
          [b, height(b, c), c],
        );
      }
    if (axis === "x") {
      beam(
        e,
        g,
        "coberturas",
        "white",
        [cx, ridge + 0.035, z],
        [cx, ridge + 0.035, z + d],
        0.15,
        0.12,
      );
      for (const xx of [x, x + w])
        beam(e, g, "coberturas", "steel", [xx, eave, z], [xx, eave, z + d], 0.16, 0.2);
    } else {
      beam(
        e,
        g,
        "coberturas",
        "white",
        [x, ridge + 0.035, cz],
        [x + w, ridge + 0.035, cz],
        0.15,
        0.12,
      );
    }
    return height;
  };
  const line = (e: string, g: GroupId, points: Vec3[], dashed = false) => {
    const geometry = new THREE.BufferGeometry().setFromPoints(
      points.map((p) => new THREE.Vector3(...p)),
    );
    const material = dashed
      ? new THREE.LineDashedMaterial({ color: "#b78945", dashSize: 0.65, gapSize: 0.4 })
      : new THREE.LineBasicMaterial({ color: "#977447" });
    const mesh = new THREE.Line(geometry, material);
    mesh.computeLineDistances();
    mesh.userData = { layer: "referencias" };
    owner(e, g).add(mesh);
  };
  const outline = (e: string, g: GroupId, x: number, z: number, w: number, d: number, y = 0.04) =>
    line(
      e,
      g,
      [
        [x, y, z],
        [x + w, y, z],
        [x + w, y, z + d],
        [x, y, z + d],
        [x, y, z],
      ],
      true,
    );

  // Main hall: distinct naves, regular lattice frames and longitudinal trusses.
  let nx = 0;
  for (let n = 0; n < 3; n++) {
    const w = DIM.main.naves[n]!,
      id = `nave-${n + 1}`,
      g: GroupId = "principal";
    box(id, g, "piso", "concrete", [nx + w / 2, -0.085, 20.75], [w, 0.16, 41.5]);
    const highCut = { x: DIM.high.x, z: 0, w: DIM.high.width, d: 11 };
    const lanternCut = {
      x: DIM.lantern.x,
      z: DIM.lantern.z,
      w: DIM.lantern.width,
      d: DIM.lantern.depth,
    };
    const height = roof(id, g, nx, 0, w, 41.5, 5.68, 9.395, "x", "roof", [highCut, lanternCut]);
    for (const z of DIM.main.frames) {
      if (n === 2 && z < 11) continue;
      for (const x of n === 0 ? [nx, nx + w] : [nx + w]) lattice(id, g, "steel", x, z, 0, 5.68);
      truss(id, g, "steel", [nx, 5.68, z], [nx + w / 2, 9.395, z], 0.8);
      truss(id, g, "steel", [nx + w / 2, 9.395, z], [nx + w, 5.68, z], 0.8);
    }
    for (const x of n === 0 ? [nx, nx + w] : [nx + w])
      truss(id, g, "steel", [x, 5.68, n === 2 ? 11 : 0], [x, 5.68, 41.5], 0.6);
    const count = Math.ceil(w / 1.5);
    for (let i = 0; i <= count; i++) {
      const x = nx + (w * i) / count;
      const start = x >= DIM.high.x ? 11 : 0;
      if (x >= 31.1) {
        beam(
          id,
          g,
          "estrutura",
          "steel",
          [x, height(x, start) - 0.12, start],
          [x, height(x, 30.2) - 0.12, 30.2],
          0.09,
          0.06,
        );
        beam(
          id,
          g,
          "estrutura",
          "steel",
          [x, height(x, 36.4) - 0.12, 36.4],
          [x, height(x, 41.5) - 0.12, 41.5],
          0.09,
          0.06,
        );
      } else
        beam(
          id,
          g,
          "estrutura",
          "steel",
          [x, height(x, 0) - 0.12, 0],
          [x, height(x, 41.5) - 0.12, 41.5],
          0.09,
          0.06,
        );
    }
    for (const z of [0, 41.5]) {
      if (z === 0 && n === 2) continue;
      wall(id, g, "white", nx + w / 2, z, w, 0.09, 0, 5.68);
      triangle(
        id,
        g,
        "fechamentos",
        "white",
        [nx, 5.68, z],
        [nx + w, 5.68, z],
        [nx + w / 2, 9.395, z],
      );
    }
    if (n === 0) wall(id, g, "white", 0, 20.75, 0.09, 41.5, 0, 5.68);
    if (n === 2) wall(id, g, "white", 62.7, 26.25, 0.09, 30.5, 0, 5.68);
    nx += w;
  }
  // Moega: D1 rotated relative to sheet 01. Gates to the west (negative X).
  const m = DIM.moega,
    mx = m.x,
    mz = m.z,
    mc = mx + 8.5;
  const roofY = roof("moega", "moega", mx - 3, mz - 0.4, 23, 19.838, 4.03, 6.925);
  box("descarga", "moega", "piso", "concrete", [mc, -0.085, mz + 3], [17, 0.16, 6]);
  box("interna", "moega", "piso", "concrete", [mc, -0.085, mz + 12.8175], [17, 0.16, 3.435]);
  box("elevadores", "moega", "piso", "concrete", [mc, -0.085, -2.4515], [17, 0.16, 4.903]);
  for (const x of [mx + 0.5, mx + 16.5])
    box("passagem", "moega", "piso", "concrete", [x, -0.085, mz + 8.55], [1, 0.16, 5.1]);
  for (const z of [mz + 6.1, mz + 11])
    box("passagem", "moega", "piso", "concrete", [mc, -0.085, z], [15, 0.16, 0.2]);
  // The pit is a flat symbol, not a fabricated subterranean volume.
  box("fosso", "moega", "piso", "dark", [mc, -0.015, mz + 8.55], [15, 0.02, 4.7]);
  outline("fosso", "moega", mx + 1, mz + 6.2, 15, 4.7, 0.025);
  for (let i = 0; i <= 100; i++)
    box(
      "grelha",
      "moega",
      "piso",
      "steel",
      [mx + 1 + i * 0.15, 0.025, mz + 8.55],
      [0.035, 0.06, 4.7],
    );
  for (let i = 0; i < 6; i++)
    box("grelha", "moega", "piso", "steel", [mc, 0.015, mz + 6.2 + i * 0.94], [15, 0.055, 0.055]);
  for (const z of [mz, mz + 14.535, 0]) {
    wall("moega", "moega", "masonry", mc, z, 17, 0.2, 0, 4.365);
    quad(
      "moega",
      "moega",
      "fechamentos",
      "masonry",
      [mx, 4.365, z],
      [mx, roofY(mx, z) - 0.08, z],
      [mc, 6.845, z],
      [mc, 4.365, z],
    );
    quad(
      "moega",
      "moega",
      "fechamentos",
      "masonry",
      [mc, 4.365, z],
      [mc, 6.845, z],
      [mx + 17, roofY(mx + 17, z) - 0.08, z],
      [mx + 17, 4.365, z],
    );
  }
  for (const x of [mx, mx + 17]) {
    wall("moega", "moega", "masonry", x, mz + (11.1 + 19.438) / 2, 0.2, 8.338, 0, 4.7);
    // Two leaves, no crossbar across the 5.10m vehicle passage.
    for (const z of [mz + 1.5, mz + 4.5])
      wall("descarga", "moega", "blue", x, z, 0.07, 2.97, 0, 1.8);
    for (let i = 0; i <= 20; i++)
      beam(
        "descarga",
        "moega",
        "fechamentos",
        "steel",
        [x - 0.04, 0, mz + i * 0.3],
        [x - 0.04, 1.8, mz + i * 0.3],
        0.025,
      );
  }
  for (const u of [6, 11.1]) {
    const z = mz + u;
    for (const x of [mx, mx + 17])
      box("moega", "moega", "estrutura", "steel", [x, 4.365 / 2, z], [0.5, 4.365, 0.15]);
    // No centre support in the vehicle lane; the sketch pillar at B is the background gable.
    beam("moega", "moega", "estrutura", "steel", [mx, 4.365, z], [mx + 17, 4.365, z], 0.065);
    for (const side of [-1, 1]) {
      const ex = mc + side * 11.5;
      beam("moega", "moega", "estrutura", "steel", [mc, 6.845, z], [ex, 3.95, z], 0.065);
      const count = 12;
      for (let i = 0; i < count; i++) {
        const x = mc + (side * 8.5 * i) / count,
          xx = mc + (side * 8.5 * (i + 1)) / count;
        beam(
          "moega",
          "moega",
          "estrutura",
          "steel",
          [x, 4.365, z],
          [x, roofY(x, z) - 0.08, z],
          0.035,
        );
        beam(
          "moega",
          "moega",
          "estrutura",
          "steel",
          [x, 4.365, z],
          [xx, roofY(xx, z) - 0.08, z],
          0.035,
        );
      }
      truss(
        "moega",
        "moega",
        "steel",
        [mc + side * 8.5, roofY(mc + side * 8.5, z) - 0.08, z],
        [ex, 3.95, z],
        0.22,
        0.6,
      );
    }
  }
  for (let i = 0; i < 5; i++) {
    const x = mx + i * 4.25;
    beam(
      "moega",
      "moega",
      "estrutura",
      "blue",
      [x, 0, mz - 0.11],
      [x, roofY(x, mz) - 0.08, mz - 0.11],
      0.13,
      0.13,
    );
  }
  for (let i = 0; i <= 16; i++) {
    const x = mx - 3 + (23 * i) / 16;
    beam(
      "moega",
      "moega",
      "estrutura",
      "steel",
      [x, roofY(x, mz) - 0.11, mz - 0.4],
      [x, roofY(x, 0) - 0.11, 0],
      0.07,
      0.05,
    );
  }
  // Cabin and tower are footprints on the known roof, no invented height.
  outline("cabine", "moega", mc - 0.9, -3.75, 1.8, 1.8, 6.96);
  line("cabine", "moega", [
    [mc - 0.9, 6.96, -3.75],
    [mc + 0.9, 6.96, -1.95],
  ]);
  outline("torre-moega", "transportes", 49.5, -5.7, 1.6, 1.6, roofY(50.3, -4.9) + 0.1);

  // High block: sheet 08. Local frames, red lattice columns and I-section rafters.
  const h = DIM.high;
  roof("bloco", "bloco", h.x, h.z, h.width, h.depth, h.eave, h.ridge, "x", "white");
  for (const z of [0, 5.5, 11]) {
    for (const x of [h.x, h.x + h.width]) lattice("bloco", "bloco", "red", x, z, 0, 10.4);
    for (const [a, b] of [
      [
        [h.x, 10.4, z],
        [h.x + 11, 12.2, z],
      ],
      [
        [h.x + 11, 12.2, z],
        [h.x + h.width, 10.4, z],
      ],
    ] as [Vec3, Vec3][]) {
      // Keep the whole I-section below the surveyed roof surface.
      a[1] -= 0.25;
      b[1] -= 0.25;
      beam("bloco", "bloco", "estrutura", "red", a, b, 0.38, 0.018);
      for (const dy of [-0.2, 0.2])
        beam(
          "bloco",
          "bloco",
          "estrutura",
          "red",
          [a[0], a[1] + dy, a[2]],
          [b[0], b[1] + dy, b[2]],
          0.025,
          0.18,
        );
    }
  }
  for (const x of [h.x, h.x + h.width]) {
    wall("bloco", "bloco", "masonry", x, 5.5, 0.2, 11, 0, 5.68);
    wall("bloco", "bloco", "white", x, 5.5, 0.09, 11, 5.68, 9.3);
    wall("bloco", "bloco", "glass", x, 5.5, 0.07, 11, 9.3, 10.1);
    wall("bloco", "bloco", "white", x, 5.5, 0.09, 11, 10.1, 10.4);
    beam("bloco", "bloco", "estrutura", "cream", [x, 7.2, 0], [x, 7.2, 11], 0.18, 0.26);
    for (const z of [0, 5.5]) {
      beam("bloco", "bloco", "estrutura", "red", [x, 5.68, z], [x, 10.4, z + 5.5], 0.055);
      beam("bloco", "bloco", "estrutura", "red", [x, 10.4, z], [x, 5.68, z + 5.5], 0.055);
    }
    for (let y = 5.9; y < 10.4; y += 1.5)
      beam("bloco", "bloco", "estrutura", "red", [x, y, 0], [x, y, 11], 0.07, 0.1);
  }
  for (const z of [0, 11]) {
    wall("bloco", "bloco", "masonry", 51.8, z, 21.8, 0.2, 0, 5.68);
    wall("bloco", "bloco", "white", 51.8, z, 21.8, 0.09, 5.68, 9.3);
    wall("bloco", "bloco", "glass", 51.8, z, 21.8, 0.07, 9.3, 10.1);
    wall("bloco", "bloco", "white", 51.8, z, 21.8, 0.09, 10.1, 10.4);
    triangle(
      "bloco",
      "bloco",
      "fechamentos",
      "white",
      [h.x, 10.4, z],
      [h.x + h.width, 10.4, z],
      [h.x + 11, 12.2, z],
    );
    beam(
      "bloco",
      "bloco",
      "estrutura",
      "cream",
      [h.x, 7.2, z],
      [h.x + h.width, 7.2, z],
      0.18,
      0.26,
    );
  }
  for (let i = 0; i <= 15; i++) {
    const x = h.x + (h.width * i) / 15,
      y = 12.2 - (1.8 * Math.abs(x - 51.8)) / 10.9;
    beam("bloco", "bloco", "estrutura", "red", [x, y - 0.16, 0], [x, y - 0.16, 11], 0.1, 0.06);
  }

  // Raised transverse lanternim, with its internal elevated gallery.
  const l = DIM.lantern,
    le = "lanternim",
    lg: GroupId = "principal";
  roof(le, lg, l.x, l.z, l.width, l.depth, l.eave, l.ridge, "z", "white");
  for (const x of [31.1, 41.9, 52.3, 62.7, 65]) {
    for (const z of [30.75, 35.75]) lattice(le, lg, "steel", x, z, 5.68, 9.395, 0.4);
    truss(le, lg, "steel", [x, 9.395, 30.2], [x, 10.2, 33.3], 0.35, 1);
    truss(le, lg, "steel", [x, 10.2, 33.3], [x, 9.395, 36.4], 0.35, 1);
  }
  for (const z of [30.2, 36.4]) {
    beam(le, lg, "estrutura", "steel", [31.1, 9.395, z], [65, 9.395, z], 0.15);
    // Infill follows the old sawtooth roofs, avoiding a solid slab through the hall.
    const knots = [31.1, 31.55, 41.9, 52.3, 62.7, 65];
    const oldY = (x: number) =>
      x <= 41.9
        ? 9.395 - (3.715 * Math.abs(x - 31.55)) / 10.35
        : x <= 62.7
          ? 9.395 - (3.715 * Math.abs(x - 52.3)) / 10.4
          : 5.68;
    for (let i = 0; i < knots.length - 1; i++) {
      const a = knots[i]!,
        b = knots[i + 1]!;
      quad(
        le,
        lg,
        "fechamentos",
        "white",
        [a, oldY(a), z],
        [b, oldY(b), z],
        [b, 9.395, z],
        [a, 9.395, z],
      );
    }
  }
  for (const x of [31.1, 65]) {
    wall(le, lg, "white", x, 33.3, 0.08, 6.2, 9.05, 9.395);
    triangle(le, lg, "fechamentos", "white", [x, 9.395, 30.2], [x, 9.395, 36.4], [x, 10.2, 33.3]);
  }
  for (const z of [32.3, 34.3]) truss(le, lg, "steel", [31.1, 9.2, z], [65, 9.2, z], 1.4);
  for (let x = 31.1; x < 65; x += 0.25)
    box(le, lg, "estrutura", "steel", [x, 7.8, 33.3], [0.035, 0.045, 2]);
  for (const x of [35, 43, 51, 59]) {
    // Translucent strip on both slopes (sheet 07), lifted only to avoid z-fighting.
    quad(
      le,
      lg,
      "coberturas",
      "glass",
      [x, 9.41, 30.2],
      [x, 10.215, 33.3],
      [x + 0.8, 10.215, 33.3],
      [x + 0.8, 9.41, 30.2],
    );
    quad(
      le,
      lg,
      "coberturas",
      "glass",
      [x, 10.215, 33.3],
      [x, 9.41, 36.4],
      [x + 0.8, 9.41, 36.4],
      [x + 0.8, 10.215, 33.3],
    );
  }
  // Eolic ventilators drawn as unscaled symbols; the PDF does not size them.
  for (let x = 33; x < 65; x += 4) {
    const y = 10.27;
    line(le, lg, [
      [x - 0.24, y, 33.3],
      [x, y, 33.06],
      [x + 0.24, y, 33.3],
      [x, y, 33.54],
      [x - 0.24, y, 33.3],
    ]);
  }

  // Unknown vertical geometry: source-faithful plan symbols only.
  const s = DIM.silo;
  const circle: Vec3[] = Array.from({ length: 97 }, (_, i) => [
    s.x + 10.5 * Math.cos((i / 96) * Math.PI * 2),
    0.045,
    s.z + 10.5 * Math.sin((i / 96) * Math.PI * 2),
  ]);
  line("silo", "silo", circle, true);
  for (let i = 0; i < 12; i++) {
    const a = (i / 12) * Math.PI * 2;
    line("silo", "silo", [
      [s.x, 0.045, s.z],
      [s.x + 10.5 * Math.cos(a), 0.045, s.z + 10.5 * Math.sin(a)],
    ]);
  }
  for (const a of DIM.auxiliaries) {
    outline(a.id, "auxiliares", a.x, a.z, a.width, a.depth);
    const y = 0.045;
    if (a.roof === "x")
      line(a.id, "auxiliares", [
        [a.x + a.width / 2, y, a.z],
        [a.x + a.width / 2, y, a.z + a.depth],
      ]);
    else if (a.roof === "z")
      line(a.id, "auxiliares", [
        [a.x, y, a.z + a.depth / 2],
        [a.x + a.width, y, a.z + a.depth / 2],
      ]);
    else
      line(a.id, "auxiliares", [
        [a.x + 2, y, a.z + a.depth / 2],
        [a.x + a.width - 2, y, a.z + a.depth / 2],
        [a.x + a.width - 3, y, a.z + a.depth / 2 - 1],
      ]);
  }
  outline("galeria", "transportes", 0, -1.7, 37.3, 1.7);
  for (let x = 0; x < 37.3; x += 2)
    line("galeria", "transportes", [
      [x, 0.045, -1.7],
      [Math.min(x + 2, 37.3), 0.045, 0],
    ]);
  outline("torre", "transportes", 66, -2.8, 2.8, 2.5);
  line("torre", "transportes", [
    [66, 0.045, -2.8],
    [68.8, 0.045, -0.3],
    [66, 0.045, -0.3],
    [68.8, 0.045, -2.8],
  ]);
  line(
    "transportador",
    "transportes",
    [
      [50.3, 0.07, -4.9],
      [23, 0.07, -49.7],
    ],
    true,
  );

  let instances = 0,
    triangles = 0;
  const dummy = new THREE.Object3D();
  for (const b of batches.values()) {
    const parent = owner(b.entity, b.group);
    if (b.instances.length) {
      const mesh = new THREE.InstancedMesh(geom, mats[b.material], b.instances.length);
      mesh.name = `${b.entity}/${b.layer}/${b.material}`;
      mesh.userData = { layer: b.layer };
      b.instances.forEach((item, i) => {
        dummy.position.set(...item.position);
        dummy.scale.set(...item.scale);
        dummy.quaternion.copy(item.quaternion);
        dummy.updateMatrix();
        mesh.setMatrixAt(i, dummy.matrix);
      });
      mesh.instanceMatrix.needsUpdate = true;
      mesh.computeBoundingSphere();
      mesh.castShadow = b.layer !== "piso";
      mesh.receiveShadow = true;
      parent.add(mesh);
      instances += b.instances.length;
      triangles += b.instances.length * 12;
    }
    if (b.vertices.length) {
      const geo = new THREE.BufferGeometry();
      geo.setAttribute("position", new THREE.Float32BufferAttribute(b.vertices, 3));
      geo.setAttribute("uv", new THREE.Float32BufferAttribute(b.uv, 2));
      geo.computeVertexNormals();
      const mesh = new THREE.Mesh(geo, mats[b.material]);
      mesh.name = `${b.entity}/${b.layer}/surfaces`;
      mesh.userData = { layer: b.layer };
      mesh.castShadow = true;
      mesh.receiveShadow = true;
      parent.add(mesh);
      triangles += b.vertices.length / 9;
    }
  }
  return {
    root,
    entities,
    stats: { instances, batches: batches.size, triangles },
    dispose: () => {
      const gs = new Set<THREE.BufferGeometry>([geom]);
      const ms = new Set<THREE.Material>(Object.values(mats));
      root.traverse((o) => {
        if (o instanceof THREE.Mesh || o instanceof THREE.Line) {
          gs.add(o.geometry);
          (Array.isArray(o.material) ? o.material : [o.material]).forEach((m) => ms.add(m));
          if (o instanceof THREE.InstancedMesh) o.dispose();
        }
      });
      gs.forEach((g) => g.dispose());
      ms.forEach((m) => m.dispose());
      normal.dispose();
    },
  };
}
