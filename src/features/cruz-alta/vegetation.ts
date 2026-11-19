import * as T from "three";
import type { CruzArea, CruzPart } from "./scene-types";
import { extent, inside } from "./spatial";
import { nearCanopies, type StandTree } from "./vegetation-near";
import { randomSequence } from "./ground-material";

function crownGeometry(tall: boolean) {
  const geo = new T.SphereGeometry(1, 8, 5);
  const vertices = geo.getAttribute("position"),
    rgb: number[] = [];
  for (let i = 0; i < vertices.count; i++) {
    const x = vertices.getX(i),
      y = vertices.getY(i),
      z = vertices.getZ(i);
    const angle = Math.atan2(z, x);
    const lobes = 1 + 0.095 * Math.cos(angle * 3 + y * 2) + 0.065 * Math.sin(angle * 5 - y * 3);
    const breadth = lobes * (tall ? 1.15 - 0.23 * y : 1);
    vertices.setXYZ(
      i,
      x * breadth + 0.085 * y,
      y + 0.085 * Math.sin(angle * 3.2) * (1 - Math.abs(y)),
      z * breadth,
    );
    const light = 0.55 + (0.36 * (y + 1)) / 2 + 0.07 * Math.cos(angle * 3 + y);
    rgb.push(light * 0.96, light, light * 0.85);
  }
  geo.setAttribute("color", new T.Float32BufferAttribute(rgb, 3));
  geo.computeVertexNormals();
  return geo;
}

/** Generalized canopy: placement describes wooded areas, not an inventory of individual trees. */
export function woodedAreas(areas: CruzArea[], parts: CruzPart[]) {
  const rng = randomSequence(24082026),
    group = new T.Group();
  const excluded = [
    ...areas.filter((a) => ["via", "ferrovia", "agua", "patio", "vizinhanca"].includes(a.kind)),
    ...parts,
  ].map((a) => ({ polygon: a.footprint, box: extent(a.footprint) }));
  function blocked(x: number, z: number) {
    return excluded.some(
      ({ box, polygon }) =>
        x >= box.west && x <= box.east && z >= box.north && z <= box.south && inside(x, z, polygon),
    );
  }
  const samples: [T.Matrix4[], T.Matrix4[]] = [[], []],
    colors: [T.Color[], T.Color[]] = [[], []];
  const timber: StandTree[] = [],
    crownMeshes: T.InstancedMesh[] = [];
  const trunks: T.Matrix4[] = [],
    occupied = new Set<string>();
  const matrix = new T.Object3D();
  const polys = areas.filter((a) => a.kind === "vegetacao");
  for (const [region, area] of polys.entries()) {
    const bb = extent(area.footprint),
      len = Math.max(bb.east - bb.west, bb.south - bb.north);
    const step = len > 170 ? 9.8 : 6.4;
    for (let i = bb.west; i < bb.east; i += step)
      for (let j = bb.north; j < bb.south; j += step * 0.85) {
        const x = i + (rng() - 0.25) * step * 0.96,
          z = j + (rng() - 0.25) * step * 0.96;
        if (!inside(x, z, area.footprint) || blocked(x, z)) continue;
        const key = Math.floor(x / 4) + ":" + Math.floor(z / 4);
        if (occupied.has(key)) continue;
        occupied.add(key);
        const diversity = 0.5 + 0.5 * Math.sin(x * 0.073 + Math.sin(z * 0.027) * 0.82);
        const openness = 0.035 + (1 - diversity) * 0.18;
        if (rng() < openness) continue;
        const tall = region % 4 === 1 || rng() < 0.3 ? 1 : 0;
        const diameter = step * (0.87 + 0.33 * rng() + 0.24 * diversity);
        const total = diameter * (tall ? 1.4 + rng() * 0.35 : 0.81 + rng() * 0.3);
        const crownDepth = total * (tall ? 0.68 : 0.8);
        matrix.position.set(x, total - crownDepth / 2, z);
        matrix.scale.set(diameter * 0.51, crownDepth / 2, diameter * (0.45 + rng() * 0.1));
        matrix.rotation.set(0.07 * (rng() - 0.5), rng() * 6.28, 0.08 * (rng() - 0.5));
        matrix.updateMatrix();
        samples[tall].push(matrix.matrix.clone());
        const light = 0.245 + diversity * 0.055 + rng() * 0.068;
        const foliage = new T.Color().setHSL(
          0.231 + rng() * 0.057,
          0.17 + 0.13 * rng(),
          light,
          T.SRGBColorSpace,
        );
        colors[tall].push(foliage);
        timber.push({
          x,
          z,
          height: total,
          depth: crownDepth,
          diameter,
          phase: Math.abs((Math.round(x * 31) * 7231) ^ Math.round(z * 363)),
          color: foliage,
          type: tall,
          index: samples[tall].length - 1,
        });
        matrix.position.set(x, (total - crownDepth * 0.72) * 0.49, z);
        matrix.scale.set(diameter * 0.028, total - crownDepth * 0.72, diameter * 0.028);
        matrix.rotation.set(0, 0, 0);
        matrix.updateMatrix();
        trunks.push(matrix.matrix.clone());
      }
  }
  for (const type of [0, 1] as const) {
    const material = new T.MeshStandardMaterial({
      color: "#ffffff",
      roughness: 0.97,
      vertexColors: true,
    });
    const mesh = new T.InstancedMesh(crownGeometry(!!type), material, samples[type].length);
    samples[type].forEach((m, i) => {
      mesh.setMatrixAt(i, m);
      mesh.setColorAt(i, colors[type][i]!);
    });
    mesh.receiveShadow = true;
    mesh.castShadow = true;
    group.add(mesh);
    crownMeshes.push(mesh);
  }
  const bark = new T.MeshStandardMaterial({ color: "#665645", roughness: 0.98 });
  const stems = new T.InstancedMesh(new T.CylinderGeometry(0.6, 1, 1, 5), bark, trunks.length);
  trunks.forEach((m, i) => stems.setMatrixAt(i, m));
  group.add(stems);
  const near = nearCanopies(timber, [crownMeshes[0]!, crownMeshes[1]!]);
  group.add(near.root);
  return { root: group, update: near.update, texture: near.texture };
}
