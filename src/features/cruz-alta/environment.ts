import * as T from "three";
import { shell } from "./geometry";
import type { CruzArea, CruzPart } from "./scene-types";
import { extent, center, type SpatialIndex } from "./spatial";
import { groundSkin } from "./ground-material";
import { regionalHorizon } from "./regional";
import { woodedAreas } from "./vegetation";
import { northReservoirBund, roadsideMasses } from "./terrain-surfaces";
export function createGroundContext(
  context: CruzArea[],
  index: SpatialIndex,
  invalidate: () => void,
  parts: CruzPart[] = [],
  maxAnisotropy = 8,
) {
  const root = new T.Group();
  const material = (color: T.ColorRepresentation, roughness: number, metalness = 0) =>
    new T.MeshStandardMaterial({ color, roughness, metalness, side: T.DoubleSide });
  const steel = material("#898883", 0.56, 0.37);
  const b = index.unit,
    [cx, cz] = center(b),
    span = Math.max(b.east - b.west, b.south - b.north, 60);
  const { plate, padPlate, pad, map, rough, useBackdrop, width, textures } = groundSkin(
    context,
    parts,
    cx,
    cz,
    span,
  );
  for (const texture of textures) texture.anisotropy = maxAnisotropy;
  padPlate.visible = false;
  root.add(plate, padPlate);
  const bund = new T.InstancedMesh(
    new T.BoxGeometry(1, 1, 1),
    material("#dcdedd", 0.88),
    northReservoirBund.length,
  );
  const curb = new T.Object3D();
  northReservoirBund.forEach(([x, z], i) => {
    const [nx, nz] = northReservoirBund[(i + 1) % northReservoirBund.length]!;
    const dx = nx - x,
      dz = nz - z;
    // Contorno interpretado da ortoimagem; lábio do dique visível no vídeo. Altura esquemática.
    curb.position.set((x + nx) / 2, 0.3, (z + nz) / 2);
    curb.rotation.y = Math.atan2(dx, dz);
    curb.scale.set(0.2, 0.6, Math.hypot(dx, dz));
    curb.updateMatrix();
    bund.setMatrixAt(i, curb.matrix);
  });
  bund.castShadow = bund.receiveShadow = true;
  root.add(bund);
  const backgroundRoof = material("#acaaa0", 0.79, 0.08),
    backdropWalls = material("#a29f92", 0.9);
  for (const a of context) {
    const bb = extent(a.footprint);
    if (a.kind === "vizinhanca") {
      const circular = a.footprint.length > 12;
      if (circular) {
        const [x, z] = center(bb),
          r = (bb.east - bb.west) / 2,
          estimatedHeight = r * 1.45;
        const wall = new T.Mesh(new T.CylinderGeometry(r, r, estimatedHeight, 24), backdropWalls);
        const cap = new T.Mesh(new T.ConeGeometry(r, r * 0.45, 24), backgroundRoof);
        wall.position.set(x, estimatedHeight / 2, z);
        cap.position.set(x, estimatedHeight + r * 0.225, z);
        wall.castShadow = cap.castShadow = true;
        root.add(wall, cap);
      } else {
        const mass = shell({
          id: "",
          footprint: a.footprint,
          ...(a.mass ?? { eave: 5, rise: 1.9, roof: "gable" }),
        });
        const wall = new T.Mesh(mass.wall, backdropWalls),
          cap = new T.Mesh(mass.roof, backgroundRoof);
        wall.castShadow = cap.castShadow = true;
        root.add(wall, cap);
      }
    }
    if (a.kind === "ferrovia" && a.footprint.length === 4) {
      const [a0, a1, a2, a3] = a.footprint;
      const from = new T.Vector3((a0![0] + a3![0]) / 2, 0.14, (a0![1] + a3![1]) / 2),
        to = new T.Vector3((a1![0] + a2![0]) / 2, 0.14, (a1![1] + a2![1]) / 2);
      const delta = to.clone().sub(from),
        perp = new T.Vector3(-delta.z, 0, delta.x).normalize();
      for (const side of [-0.63, 0.63]) {
        const geo = new T.BoxGeometry(0.085, 0.09, delta.length());
        const rail = new T.Mesh(geo, steel);
        rail.position.copy(from).lerp(to, 0.5).addScaledVector(perp, side);
        rail.lookAt(rail.position.clone().add(delta));
        root.add(rail);
      }
    }
  }
  const grove = woodedAreas(context, parts);
  grove.texture.anisotropy = maxAnisotropy;
  root.add(grove.root);
  let terrainHeight: (x: number, z: number) => number = () => 0;
  let repositionTrees = false;
  const homes = new T.InstancedMesh(
    new T.BoxGeometry(1, 1, 1),
    backdropWalls,
    roadsideMasses.length,
  );
  const roofs = new T.InstancedMesh(
    new T.ConeGeometry(1, 1, 4),
    backgroundRoof,
    roadsideMasses.length,
  );
  const matrix = new T.Object3D();
  for (const [i, h] of roadsideMasses.entries()) {
    matrix.position.set(h.x, 1.55, h.z);
    matrix.scale.set(h.width, 3.1, h.length);
    matrix.rotation.set(0, -0.3, 0);
    matrix.updateMatrix();
    homes.setMatrixAt(i, matrix.matrix);
    matrix.position.y = 3.76;
    matrix.rotation.y += Math.PI / 4;
    matrix.scale.set(h.width * 0.72, 1.35, h.length * 0.74);
    matrix.updateMatrix();
    roofs.setMatrixAt(i, matrix.matrix);
    roofs.setColorAt(i, new T.Color(i % 3 === 1 ? "#b1aaa1" : "#bd9480"));
  }
  homes.receiveShadow = roofs.receiveShadow = true;
  homes.castShadow = roofs.castShadow = true;
  root.add(homes, roofs);
  const elevations = new Map<T.InstancedMesh, Float32Array>();
  root.traverse((o) => {
    if (o instanceof T.InstancedMesh) {
      const y = new Float32Array(o.count);
      for (let i = 0; i < o.count; i++) y[i] = o.instanceMatrix.array[i * 16 + 13]!;
      elevations.set(o, y);
    }
  });
  const region = regionalHorizon(
    b,
    map,
    rough,
    useBackdrop,
    pad,
    width,
    maxAnisotropy,
    invalidate,
    (visible, heightAt) => {
      if (padPlate.visible === visible) return;
      terrainHeight = visible ? heightAt : () => 0;
      repositionTrees = true;
      plate.visible = !visible;
      padPlate.visible = visible;
      for (const [mesh, flat] of elevations) {
        const inst = mesh.instanceMatrix;
        for (let i = 0; i < mesh.count; i++) {
          const p = i * 16;
          inst.array[p + 13] =
            flat[i]! + (visible ? heightAt(inst.array[p + 12]!, inst.array[p + 14]!) : 0);
        }
        inst.needsUpdate = true;
        mesh.computeBoundingSphere();
      }
    },
  );
  root.add(region.root);
  function dispose() {
    region.dispose();
    grove.texture.dispose();
    const materials = new Set<T.Material>(),
      geometries = new Set<T.BufferGeometry>();
    root.traverse((o) => {
      if (o instanceof T.Mesh) {
        geometries.add(o.geometry);
        for (const m of Array.isArray(o.material) ? o.material : [o.material]) materials.add(m);
      }
      if (o instanceof T.InstancedMesh) o.dispose();
    });
    for (const m of materials) m.dispose();
    for (const geo of geometries) geo.dispose();
    for (const texture of textures) texture.dispose();
  }
  return {
    root,
    dispose,
    setRegion: region.setRegion,
    updateRegion: (eye: T.Vector3) => {
      grove.update(eye, terrainHeight, repositionTrees);
      repositionTrees = false;
      region.updateRegion(eye);
    },
    regionInfo: region.regionInfo,
  };
}
