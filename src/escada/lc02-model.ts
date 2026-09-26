import * as THREE from "three";
import { mergeGeometries } from "three/examples/jsm/utils/BufferGeometryUtils.js";
import { LC02, FLIGHTS, VISUAL_TREADS, treadCenter, type LayerId, type Point } from "./lc02-layout";

type MaterialId = "steel" | "tread" | "yellow" | "rust" | "concrete" | "cladding" | "roof" | "door";
/** Batched by semantic group + shared material: no per-step draw calls or textures. */
export function createLC02Model() {
  const root = new THREE.Group();
  root.name = "Escada_LC02_estudo_de_layout";
  root.userData = {
    source: LC02.source,
    units: "metres",
    datum: "departure ±0.00",
    purpose: "Preliminary layout. Not for fabrication.",
    verifiedDimensions: { width: 1.2, intermediate: 3, door: 6, edgeToP1: 3, p1ToP2: 5 },
    visualAssumptions: [
      "flight run",
      "tread repetition",
      "sections",
      "terrain",
      "building envelope",
      "connections",
      "inward door swing and schematic interior arrival floor",
    ],
  };
  const materials: Record<MaterialId, THREE.MeshStandardMaterial> = {
    steel: new THREE.MeshStandardMaterial({ color: "#596773", metalness: 0.65, roughness: 0.4 }),
    tread: new THREE.MeshStandardMaterial({ color: "#97a5ac", metalness: 0.6, roughness: 0.42 }),
    yellow: new THREE.MeshStandardMaterial({ color: "#e9bc28", metalness: 0.35, roughness: 0.35 }),
    rust: new THREE.MeshStandardMaterial({ color: "#9e603b", metalness: 0.48, roughness: 0.53 }),
    concrete: new THREE.MeshStandardMaterial({ color: "#a2a59e", roughness: 0.9 }),
    cladding: new THREE.MeshStandardMaterial({
      color: "#b5bebf",
      metalness: 0.38,
      roughness: 0.52,
      side: THREE.DoubleSide,
    }),
    roof: new THREE.MeshStandardMaterial({
      color: "#778685",
      metalness: 0.4,
      roughness: 0.56,
      side: THREE.DoubleSide,
    }),
    door: new THREE.MeshStandardMaterial({ color: "#344b4c", metalness: 0.3, roughness: 0.5 }),
  };
  Object.entries(materials).forEach(([id, m]) => {
    m.name = id;
  });
  const batches = new Map<string, THREE.BufferGeometry[]>();
  const put = (layer: LayerId, mat: MaterialId, geometry: THREE.BufferGeometry) => {
    const key = `${layer}:${mat}`;
    const items = batches.get(key) ?? [];
    items.push(geometry);
    batches.set(key, items);
  };
  const box = (layer: LayerId, mat: MaterialId, center: Point, size: Point) => {
    const g = new THREE.BoxGeometry(...size);
    g.translate(...center);
    put(layer, mat, g);
  };
  const beam = (
    layer: LayerId,
    mat: MaterialId,
    a: Point,
    b: Point,
    width: number,
    depth = width,
    tube = false,
  ) => {
    const start = new THREE.Vector3(...a),
      end = new THREE.Vector3(...b),
      delta = end.clone().sub(start);
    const g = tube
      ? new THREE.CylinderGeometry(width / 2, width / 2, delta.length(), 8)
      : new THREE.BoxGeometry(width, delta.length(), depth);
    g.applyMatrix4(
      new THREE.Matrix4().compose(
        start.add(end).multiplyScalar(0.5),
        new THREE.Quaternion().setFromUnitVectors(new THREE.Vector3(0, 1, 0), delta.normalize()),
        new THREE.Vector3(1, 1, 1),
      ),
    );
    put(layer, mat, g);
  };
  const rail = (a: Point, b: Point, layer: LayerId = "rails", mat: MaterialId = "yellow") => {
    const length = Math.hypot(b[0] - a[0], b[2] - a[2]);
    const segments = Math.max(1, Math.ceil(length / 1.1));
    for (let i = 0; i <= segments; i++) {
      const p = a.map((v, j) => v + ((b[j]! - v) * i) / segments) as Point;
      beam(layer, mat, p, [p[0], p[1] + 1.05, p[2]], 0.042, 0.042, true);
    }
    for (const h of [0.36, 0.7, 1.05])
      beam(
        layer,
        mat,
        [a[0], a[1] + h, a[2]],
        [b[0], b[1] + h, b[2]],
        h === 1.05 ? 0.045 : 0.027,
        0.03,
        true,
      );
    beam(layer, mat, [a[0], a[1] + 0.09, a[2]], [b[0], b[1] + 0.09, b[2]], 0.04, 0.13);
  };
  const platform = (
    x0: number,
    x1: number,
    z0: number,
    z1: number,
    y: number,
    layer: LayerId = "landings",
  ) => {
    // An open-grating impression with shared geometry, no fabrication schedule.
    for (let x = x0 + 0.035; x < x1; x += 0.105)
      box(layer, "tread", [x, y - 0.028, (z0 + z1) / 2], [0.023, 0.055, z1 - z0]);
    for (let z = z0 + 0.05; z < z1; z += 0.28)
      box(layer, "steel", [(x0 + x1) / 2, y - 0.055, z], [x1 - x0, 0.035, 0.026]);
    for (const z of [z0, z1])
      box(layer, "steel", [(x0 + x1) / 2, y - 0.14, z], [x1 - x0, 0.22, 0.07]);
    for (const x of [x0, x1])
      box(layer, "steel", [x, y - 0.14, (z0 + z1) / 2], [0.07, 0.22, z1 - z0]);
  };
  platform(-1.4, 0, -5.8, -4.6, 0, "existing");
  platform(0, 1.2, -5.8, -4.6, 0);
  platform(0, 1.2, 0, 1.2, 3);
  platform(5.8, 9.4, 0, 1.2, 6);
  // Open shared edge existing/new; open entries at both flights and at the door.
  rail([-1.4, 0, -5.8], [0, 0, -5.8], "existing", "steel");
  rail([-1.4, 0, -5.8], [-1.4, 0, -4.6], "existing", "steel");
  rail([-1.4, 0, -4.6], [0, 0, -4.6], "existing", "steel");
  rail([0, 0, -5.8], [1.23, 0, -5.8]);
  rail([1.23, 0, -5.8], [1.23, 0, -4.6]);
  rail([-0.03, 3, 0], [-0.03, 3, 1.23]);
  rail([-0.03, 3, 1.23], [1.2, 3, 1.23]);
  rail([5.8, 6, 1.23], [9.43, 6, 1.23]);
  rail([9.43, 6, 1.23], [9.43, 6, -0.03]);
  rail([5.8, 6, -0.03], [8.08, 6, -0.03]);
  rail([9.32, 6, -0.03], [9.43, 6, -0.03]);
  // Mesh subdivision for visual treads only. Never expose a definitive step count.
  const visualSubdivisions = VISUAL_TREADS;
  for (let flight = 0; flight < 2; flight++) {
    const { start, end } = FLIGHTS[flight]!;
    for (let i = 1; i <= visualSubdivisions; i++) {
      const run = LC02.illustrativeRun / visualSubdivisions;
      const [x, y, z] = treadCenter(flight, i - 1);
      box(
        "stairs",
        "tread",
        [x, y - 0.025, z],
        flight === 0 ? [1.2, 0.05, run * 0.94] : [run * 0.94, 0.05, 1.2],
      );
      // Dark insets suggest a metal grating tread at a low polygon cost.
      for (let k = 0; k < 4; k++)
        box(
          "stairs",
          "steel",
          flight === 0
            ? [x, y + 0.002, z - run * 0.35 + k * run * 0.2]
            : [x - run * 0.35 + k * run * 0.2, y + 0.002, z],
          flight === 0 ? [1.16, 0.009, 0.014] : [0.014, 0.009, 1.16],
        );
    }
    for (const side of [-1, 1]) {
      const a: Point = [
        start[0] + (flight === 0 ? side * 0.635 : 0),
        start[1] - 0.13,
        start[2] + (flight === 1 ? side * 0.635 : 0),
      ];
      const b: Point = [
        end[0] + (flight === 0 ? side * 0.635 : 0),
        end[1] - 0.13,
        end[2] + (flight === 1 ? side * 0.635 : 0),
      ];
      beam("stairs", "steel", a, b, flight === 0 ? 0.075 : 0.24, flight === 0 ? 0.24 : 0.075);
      rail([a[0], start[1], a[2]], [b[0], end[1], b[2]]);
    }
  }
  // Existing facade references P1 / P2 and conceptual wall attachment plates.
  for (const x of [3, 8]) {
    box("references", "concrete", [x, -0.95, -0.1], [0.32, 1.4, 0.35]);
    box("supports", "rust", [x, -0.93, 0.095], [0.28, 1.05, 0.035]);
    beam("supports", "rust", [x, -1.45, 0.12], [x, -1.45, 1.37], 0.13, 0.2);
    beam("supports", "rust", [x, -0.6, 0.12], [x, -1.45, 1.37], 0.1, 0.12);
    beam("supports", "rust", [x, -1.45, 1.37], [x, x === 3 ? 3.83 : 5.84, 1.37], 0.14, 0.18);
    box("supports", "rust", [x, -1.48, 1.37], [0.38, 0.055, 0.36]);
  }
  beam("supports", "rust", [3, -1.4, 1.37], [8, 5.83, 1.37], 0.12, 0.13);
  beam("supports", "rust", [8, -1.4, 1.39], [3, 3.83, 1.39], 0.12, 0.13);
  beam("supports", "rust", [3, 3.8, 1.37], [8, 5.83, 1.37], 0.13, 0.16);
  for (const z of [0, 1.2]) {
    beam("supports", "rust", [0.02, 2.78, z], [3, 2.78, z], 0.13, 0.18);
    beam("supports", "rust", [0.03, 2.78, z], [3, -1.4, 1.37], 0.12, 0.14);
    beam("supports", "rust", [8, 5.78, 0], [8, 5.78, 1.37], 0.14, 0.18);
  }
  for (const x of [-1.2, 1]) {
    beam("existing", "steel", [x, -1.6, -5.3], [x, -0.18, -5.3], 0.12, 0.12);
    box("existing", "concrete", [x, -1.56, -5.3], [0.45, 0.18, 0.45]);
  }
  // Corrugated context wall follows the sloping envelope seen in pp.2–3.
  const heightAt = (x: number) => Math.min(8.85, 0.8 + (x - 2.45) * 1.32);
  for (let x = 2.45; x < 10; x += 0.1) {
    const top = heightAt(x),
      bottom = LC02.ground;
    // Keep an actual opening, including in opaque context mode.
    const doorZone = x > 8.08 && x < 9.32;
    const sections = doorZone
      ? [
          [bottom, 6],
          [8.2, top],
        ]
      : [[bottom, top]];
    for (const [lo, hi] of sections)
      if (hi! > lo!) {
        box("existing", "cladding", [x, (lo! + hi!) / 2, -0.1], [0.096, hi! - lo!, 0.055]);
        box(
          "existing",
          "cladding",
          [x - 0.031, (lo! + hi!) / 2, -0.053],
          [0.025, hi! - lo!, 0.065],
        );
      }
  }
  box("existing", "concrete", [6.25, -1.2, -0.17], [7.6, 0.9, 0.18]);
  // Roof is context geometry only; never intersects the external route.
  const roofStart = 2.3,
    roofEnd = 2.45 + (8.85 - 0.8) / 1.32;
  const roofLow = heightAt(roofStart) + 0.08,
    roofHigh = 8.93;
  const roofLength = Math.hypot(roofEnd - roofStart, roofHigh - roofLow);
  const roofSlope = Math.atan2(roofHigh - roofLow, roofEnd - roofStart);
  const roofSheet = new THREE.BoxGeometry(roofLength, 0.065, 5.65);
  roofSheet.rotateZ(roofSlope);
  roofSheet.translate((roofStart + roofEnd) / 2, (roofLow + roofHigh) / 2, -2.75);
  put("existing", "roof", roofSheet);
  box("existing", "roof", [(roofEnd + 10.15) / 2, roofHigh, -2.75], [10.15 - roofEnd, 0.065, 5.65]);
  for (let z = -5.5; z < 0.05; z += 0.19) {
    beam(
      "existing",
      "roof",
      [roofStart, roofLow + 0.035, z],
      [roofEnd, roofHigh + 0.035, z],
      0.035,
      0.035,
    );
    box(
      "existing",
      "roof",
      [(roofEnd + 10.15) / 2, roofHigh + 0.035, z],
      [10.15 - roofEnd, 0.035, 0.035],
    );
  }
  box("existing", "cladding", [10.01, 3.6, -2.75], [0.065, 10.5, 5.5]);
  // Separate pivot is shared by the live viewer and the static GLB export.
  const doorPivot = new THREE.Group();
  doorPivot.name = "door-pivot";
  doorPivot.position.set(8.1, 6, -0.04);
  const leaf = new THREE.Mesh(new THREE.BoxGeometry(1.2, 2.2, 0.065), materials.door);
  leaf.position.set(0.6, 1.1, 0);
  leaf.name = "door-leaf";
  leaf.castShadow = leaf.receiveShadow = true;
  doorPivot.add(leaf);
  const handle = new THREE.Mesh(new THREE.BoxGeometry(0.03, 0.14, 0.075), materials.tread);
  handle.position.set(1.05, 1.05, 0.06);
  doorPivot.add(handle);
  box("references", "tread", [8.7, 5.96, -0.9], [1.3, 0.08, 1.8]);
  for (const x of [8.055, 9.345]) box("references", "steel", [x, 7.1, 0.005], [0.07, 2.28, 0.08]);
  box("references", "steel", [8.7, 8.24, 0.005], [1.36, 0.08, 0.08]);
  box("references", "tread", [8.7, 6, -0.01], [1.3, 0.045, 0.16]);
  // Schematic diagonal tie visible behind the access in the source isometrics.
  beam("existing", "steel", [2.45, -1.5, -0.2], [8.55, 6, -0.2], 0.17, 0.15);
  const layers = {} as Record<LayerId, THREE.Group>;
  for (const id of [
    "existing",
    "stairs",
    "landings",
    "rails",
    "supports",
    "references",
  ] as LayerId[]) {
    const g = new THREE.Group();
    g.name = id;
    layers[id] = g;
    root.add(g);
  }
  for (const [key, geometries] of batches) {
    const [layer, material] = key.split(":") as [LayerId, MaterialId];
    const merged = mergeGeometries(geometries);
    geometries.forEach((g) => g.dispose());
    if (!merged) throw new Error(`Unable to merge ${key}`);
    merged.deleteAttribute("uv"); // No textures; omit unused vertex data in both runtime and GLB.
    merged.computeBoundingSphere();
    const mesh = new THREE.Mesh(merged, materials[material]);
    mesh.name = key;
    mesh.castShadow = true;
    mesh.receiveShadow = true;
    layers[layer].add(mesh);
  }
  layers.references.add(doorPivot);
  return {
    root,
    doorPivot,
    layers,
    materials,
    dispose: () => {
      root.traverse((o) => {
        if (o instanceof THREE.Mesh) o.geometry.dispose();
      });
      Object.values(materials).forEach((m) => m.dispose());
    },
  };
}
