import * as T from "three";
import type { CruzArea, CruzPart, GroundPoint } from "./scene-types";
import { extent, inside } from "./spatial";
import { nearCanopies, type StandTree } from "./vegetation-near";
import { randomSequence } from "./ground-material";

type CrownForm = "mixed" | "tall" | "scrub";

interface Canopy extends StandTree {
  form: CrownForm;
  breadth: number;
  yaw: number;
}

// Indexed rings share normals at the seam. The offset high point and different radial
// lobes make the crowns read as masses even after the finest edges have left the pixel grid.
function crownGeometry(form: CrownForm, economical: boolean) {
  const tall = form === "tall";
  const segments = economical ? 6 : 8;
  const rings: [number, number][] = economical
    ? tall
      ? [
          [-0.63, 0.64],
          [0.02, 1],
          [0.64, 0.69],
        ]
      : [
          [-0.62, 0.65],
          [-0.07, 1],
          [0.55, 0.79],
        ]
    : tall
      ? [
          [-0.76, 0.46],
          [-0.29, 0.95],
          [0.29, 1],
          [0.77, 0.59],
        ]
      : [
          [-0.7, 0.58],
          [-0.31, 0.98],
          [0.15, 1],
          [0.63, 0.7],
        ];
  const centerShift = tall ? 0.15 : 0.24;
  const vertices: number[] = [],
    rgb: number[] = [],
    indices: number[] = [];
  function vertex(x: number, y: number, z: number, shade: number) {
    vertices.push(x, y, z);
    rgb.push(shade * 0.97, shade, shade * 0.93);
  }
  vertex(-centerShift * 0.38, -1, 0, 0.58);
  for (const [y, radius] of rings) {
    for (let i = 0; i < segments; i++) {
      const a = (i / segments) * Math.PI * 2;
      const lobes = Math.cos(3 * a + y * 2.7) * 0.135 + Math.sin(2 * a - y * 2.8) * 0.1;
      const r = radius * (1 + lobes);
      const lift = y + Math.sin(3 * a + y) * (tall ? 0.145 : 0.18) * radius;
      const shade = 0.76 + 0.2 * lift + 0.14 * lobes + 0.06 * Math.cos(a * 3 - y);
      vertex(r * Math.cos(a) + centerShift * y, lift, r * Math.sin(a), shade);
    }
  }
  const top = vertices.length / 3;
  vertex(centerShift * 1.25, 1, -0.18, 1.03);
  for (let i = 0; i < segments; i++) {
    const right = (i + 1) % segments;
    indices.push(0, 1 + i, 1 + right);
    for (let ring = 0; ring < rings.length - 1; ring++) {
      const first = 1 + ring * segments;
      indices.push(first + i, first + segments + i, first + right);
      indices.push(first + right, first + segments + i, first + segments + right);
    }
    const upper = 1 + (rings.length - 1) * segments;
    indices.push(upper + i, top, upper + right);
  }
  const geo = new T.BufferGeometry();
  geo.setAttribute("position", new T.Float32BufferAttribute(vertices, 3));
  geo.setAttribute("color", new T.Float32BufferAttribute(rgb, 3));
  geo.setIndex(indices);
  geo.computeVertexNormals();
  return geo;
}

function edgeDistance(x: number, z: number, polygon: GroundPoint[]) {
  let closest = Infinity;
  for (let i = 0; i < polygon.length; i++) {
    const [ax, az] = polygon[i]!,
      [bx, bz] = polygon[(i + 1) % polygon.length]!;
    const dx = bx - ax,
      dz = bz - az;
    const t = T.MathUtils.clamp(((x - ax) * dx + (z - az) * dz) / (dx * dx + dz * dz || 1), 0, 1);
    closest = Math.min(closest, Math.hypot(x - ax - t * dx, z - az - t * dz));
  }
  return closest;
}

function orbitalPoint(x: number, y: number): GroundPoint {
  // Same registered World Imagery z18 window as the masses west of the yard.
  return [
    ((x * 1536) / 1029 - 841.0340028852224) * 0.523982671817757,
    ((y * 1792) / 1200 - 911.9575319737196) * 0.523982671817757,
  ];
}

/** Crown centres are an interpretation of the visible stands and isolated crowns. */
export function forestCanopies(areas: CruzArea[], parts: CruzPart[], hardGround: GroundPoint[][]) {
  const rng = randomSequence(24082026);
  const excluded = [
    ...areas.filter((a) => a.kind !== "vegetacao").map((a) => a.footprint),
    ...parts.map((p) => p.footprint),
    ...hardGround,
  ].map((polygon) => ({ polygon, box: extent(polygon) }));
  function clearance(x: number, z: number, radius: number) {
    let max = radius;
    for (const { box, polygon } of excluded) {
      if (x < box.west - max || x > box.east + max || z < box.north - max || z > box.south + max)
        continue;
      if (inside(x, z, polygon)) return 0;
      max = Math.min(max, edgeDistance(x, z, polygon) - 0.12);
    }
    return max;
  }
  const trees: Canopy[] = [];
  const cells = new Map<string, Canopy[]>();
  function place(
    x: number,
    z: number,
    form: CrownForm,
    diameter: number,
    pad: number,
    tone: number,
  ) {
    const breadth = 0.79 + 0.19 * rng();
    // The bound also encloses the close foliage cards, which extend beyond the primary crown.
    const room = Math.min(clearance(x, z, diameter * 0.68), pad);
    diameter = Math.min(diameter, room / 0.68);
    if (diameter < (form === "scrub" ? 1.0 : 3.05)) return;
    const col = Math.floor(x / 5),
      row = Math.floor(z / 5),
      key = col + "," + row;
    for (let a = col - 1; a <= col + 1; a++)
      for (let b = row - 1; b <= row + 1; b++)
        if (
          cells
            .get(a + "," + b)
            ?.some(
              (t) =>
                Math.hypot(t.x - x, t.z - z) <
                (t.diameter + diameter) * (form === "scrub" ? 0.24 : 0.33),
            )
        )
          return;
    const tall = form === "tall";
    const height = diameter * (tall ? 1.36 + 0.48 * tone + 0.46 * rng() : 0.82 + 0.54 * rng());
    const depth = height * (tall ? 0.66 : form === "mixed" ? 0.78 : 0.88);
    const color = new T.Color().setHSL(
      (tall ? 0.249 : form === "scrub" ? 0.23 : 0.244) + 0.049 * rng(),
      0.13 + 0.12 * rng(),
      0.248 + 0.063 * tone + 0.047 * rng(),
      T.SRGBColorSpace,
    );
    const tree = {
      x,
      y: 0,
      z,
      height,
      diameter,
      depth,
      color,
      form,
      breadth,
      phase: Math.abs((Math.round(x * 31) * 7231) ^ Math.round(z * 363)),
      yaw: rng() * Math.PI * 2,
    };
    trees.push(tree);
    if (!cells.has(key)) cells.set(key, []);
    cells.get(key)!.push(tree);
  }
  // Singular rounded crowns outside the stand outlines visible beside the west approach
  // and south of the eastern tanks in the registered orbital view.
  for (const [u, v, size] of [
    [382, 566, 10.8],
    [869, 595, 8.0],
  ] as const) {
    const [x, z] = orbitalPoint(u, v);
    place(x, z, "mixed", size, Infinity, 0.69);
  }

  const wooded = areas.filter((a) => a.kind === "vegetacao");
  // The exposed opening in the western mixed mass is visible in the wider z17 window.
  const westOpening: GroundPoint = [
    ((369 * 1792) / 1200 - 932.5170014426112) * 1.047965343635514,
    ((579 * 1536) / 1029 - 967.9787659868598) * 1.047965343635514,
  ];
  for (const area of wooded) {
    const box = extent(area.footprint);
    const tall = area.vegetation === "talhao";
    const step = tall ? 8.25 : 9.15;
    const lattice = step * 0.88;
    for (let row = Math.floor(box.north / lattice); row * lattice < box.south + lattice; row++) {
      for (let col = Math.floor(box.west / step); col * step < box.east + step; col++) {
        const x = (col + (row % 2) * 0.5 + (rng() - 0.5) * 0.46) * step;
        const z = (row + (rng() - 0.5) * 0.52) * lattice;
        if (!inside(x, z, area.footprint)) continue;
        // Wavelengths describe patches of canopy volume; independent tree jitter breaks the lattice.
        const patch =
          0.5 + 0.28 * Math.cos(x * 0.087 + z * 0.036) + 0.22 * Math.sin(z * 0.124 - x * 0.04);
        const edge = edgeDistance(x, z, area.footprint);
        const opening = Math.hypot(x - westOpening[0], z - westOpening[1]) < 22;
        if (opening || rng() < (tall ? 0.045 : 0.082) + Math.max(0, 0.31 - patch) * 0.7) continue;
        const tallChance = (edge > 8 ? 0.67 : 0.49) + 0.24 * patch;
        const form = tall && rng() < tallChance ? "tall" : "mixed";
        const width = step * (0.73 + 0.36 * rng() + 0.24 * patch);
        place(x, z, form, width, edge + 1.55, patch);
        if (edge < 10.5 && rng() < 0.36) {
          const a = rng() * Math.PI * 2;
          const sx = x + 3.5 * Math.cos(a),
            sz = z + 3.5 * Math.sin(a);
          if (inside(sx, sz, area.footprint))
            place(
              sx,
              sz,
              "scrub",
              2.1 + rng() * 2.8,
              edgeDistance(sx, sz, area.footprint) + 0.7,
              patch,
            );
        }
      }
    }
  }
  return trees;
}

export function woodedAreas(
  areas: CruzArea[],
  parts: CruzPart[],
  hardGround: GroundPoint[][] = [],
) {
  const root = new T.Group();
  root.name = "Manchas de mata e bordas da implantação";
  const trees = forestCanopies(areas, parts, hardGround);
  const material = new T.MeshStandardMaterial({
    roughness: 0.96,
    vertexColors: true,
    envMapIntensity: 0.55,
  });
  const trunkMaterial = new T.MeshStandardMaterial({ color: "#665951", roughness: 0.98 });
  const primary = trees.filter((t) => t.form !== "scrub");
  const stems = new T.InstancedMesh(
    new T.CylinderGeometry(0.53, 1, 1, 5, 1, true),
    trunkMaterial,
    primary.length,
  );
  stems.name = "Fustes";
  stems.receiveShadow = true;
  const batches = (["tall", "mixed", "scrub"] as const).map((form) => {
    const members = trees.filter((t) => t.form === form);
    const detailed = new T.InstancedMesh(
      crownGeometry(form, form === "scrub"),
      material,
      members.length,
    );
    detailed.name = "Copas · " + form;
    detailed.receiveShadow = true;
    detailed.castShadow = form !== "scrub";
    const economy =
      form === "scrub"
        ? null
        : new T.InstancedMesh(crownGeometry(form, true), material, members.length);
    if (economy) {
      economy.name = "Copas econômicas · " + form;
      economy.receiveShadow = true;
      economy.visible = false;
      root.add(economy);
    }
    root.add(detailed);
    return { members, detailed, economy };
  });
  root.add(stems);
  const near = nearCanopies(primary);
  root.add(near.root);
  const matrix = new T.Object3D();
  function setHeight(heightAt: (x: number, z: number) => number) {
    for (const t of trees) t.y = heightAt(t.x, t.z);
    primary.forEach((t, i) => {
      const len = t.height - t.depth * 0.65;
      const radius = t.diameter * (t.form === "tall" ? 0.022 : 0.041);
      // Sink the foot by a few centimetres to hide the seat at oblique angles.
      matrix.position.set(t.x, t.y + len / 2 - 0.05, t.z);
      matrix.scale.set(radius, len, radius);
      matrix.rotation.set(0, t.yaw, 0);
      matrix.updateMatrix();
      stems.setMatrixAt(i, matrix.matrix);
    });
    stems.instanceMatrix.needsUpdate = true;
    stems.computeBoundingSphere();
    for (const { members, detailed, economy } of batches) {
      members.forEach((t, i) => {
        matrix.position.set(t.x, t.y + t.height - t.depth / 2, t.z);
        matrix.rotation.set(0, t.yaw, 0);
        matrix.scale.set(t.diameter / 2, t.depth / 2, (t.diameter * t.breadth) / 2);
        matrix.updateMatrix();
        detailed.setMatrixAt(i, matrix.matrix);
        economy?.setMatrixAt(i, matrix.matrix);
      });
      for (const mesh of economy ? [detailed, economy] : [detailed]) {
        mesh.instanceMatrix.needsUpdate = true;
        mesh.computeBoundingSphere();
      }
    }
    near.setDirty();
  }
  for (const { members, detailed, economy } of batches) {
    members.forEach((t, i) => {
      detailed.setColorAt(i, t.color);
      economy?.setColorAt(i, t.color);
    });
  }
  setHeight(() => 0);
  let priorEconomical = false;
  function update(eye: T.Vector3, economical = false) {
    if (priorEconomical !== economical) {
      for (const { detailed, economy } of batches) {
        detailed.visible = !economical;
        if (economy) economy.visible = economical;
      }
      priorEconomical = economical;
    }
    near.update(eye, economical);
  }
  const contacts = primary.map(({ x, z, diameter }) => ({ x, z, radius: diameter * 0.47 }));
  return { root, setHeight, update, texture: near.texture, contacts };
}
