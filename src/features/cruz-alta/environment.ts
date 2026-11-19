import * as T from "three";
import { shell } from "./geometry";
import type { CruzArea, CruzPart, GroundPoint } from "./scene-types";
import { extent, center, type SpatialIndex } from "./spatial";
import { groundSkin } from "./ground-material";
import { regionalHorizon } from "./regional";
import { woodedAreas } from "./vegetation";
import {
  approachJoint,
  groundPatches,
  northReservoirBund,
  roadsideMasses,
} from "./terrain-surfaces";
import { localGroundHeight } from "./site-ground";
import { railway } from "./railway";

function pavementJoint(points: GroundPoint[]) {
  const positions: number[] = [];
  for (let i = 1; i < points.length; i++) {
    const [ax, az] = points[i - 1]!,
      [bx, bz] = points[i]!;
    const dx = bx - ax,
      dz = bz - az,
      length = Math.hypot(dx, dz);
    const ex = (-dz / length) * 0.072,
      ez = (dx / length) * 0.072;
    const vertex = (x: number, z: number) => [x, localGroundHeight(x, z) + 0.003, z];
    const a = vertex(ax - ex, az - ez),
      b = vertex(ax + ex, az + ez);
    const c = vertex(bx + ex, bz + ez),
      d = vertex(bx - ex, bz - ez);
    positions.push(...a, ...b, ...c, ...a, ...c, ...d);
  }
  const geometry = new T.BufferGeometry();
  geometry.setAttribute("position", new T.Float32BufferAttribute(positions, 3));
  geometry.computeVertexNormals();
  const material = new T.MeshStandardMaterial({
    color: "#746a5e",
    roughness: 0.95,
    side: T.DoubleSide,
    polygonOffset: true,
    polygonOffsetFactor: -1,
    polygonOffsetUnits: -1,
  });
  const joint = new T.Mesh(geometry, material);
  joint.name = "Junta entre a via de aproximação e o pátio";
  joint.receiveShadow = true;
  return joint;
}

function bundLip(material: T.Material) {
  const [cx, cz] = center(extent(northReservoirBund));
  const path = northReservoirBund.map(([x, z]) => new T.Vector2(x, -z));
  const inner = northReservoirBund.map(([x, z]) => {
    const dx = cx - x,
      dz = cz - z;
    const t = 0.26 / Math.hypot(dx, dz);
    return new T.Vector2(x + dx * t, -(z + dz * t));
  });
  const perimeter = new T.Shape(path);
  perimeter.holes.push(new T.Path(inner));
  // Lábio contínuo visível aos 150 s. A altura ainda é esquemática.
  const lip = new T.Mesh(
    new T.ExtrudeGeometry(perimeter, { depth: 0.62, bevelEnabled: false }),
    material,
  );
  lip.name = "Contenção em concreto do reservatório norte";
  lip.rotation.x = -Math.PI / 2;
  lip.position.y = -0.02;
  lip.castShadow = lip.receiveShadow = true;
  return lip;
}

export function createGroundContext(
  context: CruzArea[],
  index: SpatialIndex,
  invalidate: () => void,
  parts: CruzPart[] = [],
  maxAnisotropy = 8,
) {
  const root = new T.Group(),
    surface = new T.Group();
  const material = (color: T.ColorRepresentation, roughness: number, metalness = 0) =>
    new T.MeshStandardMaterial({ color, roughness, metalness, side: T.DoubleSide });
  const b = index.unit,
    [cx, cz] = center(b),
    span = Math.max(b.east - b.west, b.south - b.north, 60);
  const hardGround = groundPatches
    .filter(({ surface }) => ["concreto", "concretoDique", "asfalto"].includes(surface))
    .map(({ footprint }) => footprint);
  const grove = woodedAreas(context, parts, hardGround);
  grove.texture.anisotropy = maxAnisotropy;
  grove.setHeight(localGroundHeight);
  const {
    plate,
    padPlate,
    pad,
    map,
    rough,
    useBackdrop,
    setBackdropVisible,
    width,
    textures,
    local,
  } = groundSkin(context, parts, cx, cz, span, maxAnisotropy, invalidate, grove.contacts);
  for (const texture of textures) texture.anisotropy = maxAnisotropy;
  surface.add(plate, padPlate, bundLip(material("#dcdedd", 0.87)), pavementJoint(approachJoint));
  const rails = railway();
  root.add(rails.root);
  const backgroundRoof = material("#acaaa0", 0.79, 0.08);
  const backdropWalls = material("#a29f92", 0.9);
  const neighbors: { floor: T.Group; footprint: GroundPoint[] }[] = [];
  for (const a of context.filter((a) => a.kind === "vizinhanca")) {
    const bb = extent(a.footprint);
    const floor = new T.Group();
    if (a.footprint.length > 12) {
      const [x, z] = center(bb),
        r = (bb.east - bb.west) / 2,
        estimatedHeight = r * 1.45;
      const wall = new T.Mesh(new T.CylinderGeometry(r, r, estimatedHeight, 24), backdropWalls);
      const cap = new T.Mesh(new T.ConeGeometry(r, r * 0.45, 24), backgroundRoof);
      wall.position.set(x, estimatedHeight / 2, z);
      cap.position.set(x, estimatedHeight + r * 0.225, z);
      wall.castShadow = cap.castShadow = true;
      floor.add(wall, cap);
    } else {
      const mass = shell({
        id: "",
        footprint: a.footprint,
        ...(a.mass ?? { eave: 5, rise: 1.9, roof: "gable" }),
      });
      const wall = new T.Mesh(mass.wall, backdropWalls),
        cap = new T.Mesh(mass.roof, backgroundRoof);
      wall.castShadow = cap.castShadow = true;
      floor.add(wall, cap);
    }
    neighbors.push({ floor, footprint: a.footprint });
    root.add(floor);
  }
  root.add(grove.root);
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
  let regionalVisible = false;
  let contextVisible = true;
  let regionHeight = localGroundHeight;
  function updateSeam() {
    const visible = contextVisible && regionalVisible;
    if (plate.visible === !visible) return;
    const heightAt = visible ? regionHeight : localGroundHeight;
    plate.visible = !visible;
    setBackdropVisible(visible);
    grove.setHeight(heightAt);
    for (const { floor, footprint } of neighbors) {
      floor.position.y = Math.min(...footprint.map(([x, z]) => heightAt(x, z)));
    }
    for (const [mesh, y] of [
      [homes, 1.55],
      [roofs, 3.76],
    ] as const) {
      const inst = mesh.instanceMatrix;
      for (let i = 0; i < mesh.count; i++) {
        const at = i * 16;
        inst.array[at + 13] = y + heightAt(inst.array[at + 12]!, inst.array[at + 14]!);
      }
      inst.needsUpdate = true;
      mesh.computeBoundingSphere();
    }
  }
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
      regionalVisible = visible;
      regionHeight = heightAt;
      updateSeam();
    },
  );
  root.add(region.root);
  function dispose() {
    region.dispose();
    local.dispose();
    grove.texture.dispose();
    const materials = new Set<T.Material>(),
      geometries = new Set<T.BufferGeometry>();
    const collect = (o: T.Object3D) => {
      if (o instanceof T.Mesh) {
        geometries.add(o.geometry);
        for (const m of Array.isArray(o.material) ? o.material : [o.material]) materials.add(m);
      }
      if (o instanceof T.InstancedMesh) o.dispose();
    };
    root.traverse(collect);
    surface.traverse(collect);
    for (const m of materials) m.dispose();
    for (const geo of geometries) geo.dispose();
    for (const texture of textures) texture.dispose();
  }
  return {
    root,
    surface,
    dispose,
    setRegion: region.setRegion,
    setContextVisible(visible: boolean) {
      contextVisible = visible;
      updateSeam();
    },
    updateRegion: (eye: T.Vector3, economical = false) => {
      grove.update(eye, economical);
      rails.update(eye, economical);
      local.update(eye);
      region.updateRegion(eye);
    },
    regionInfo: region.regionInfo,
  };
}
