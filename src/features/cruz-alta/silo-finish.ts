import * as T from "three";
import { palette as c } from "./paleta";
import { center, extent } from "./spatial";
import type { CruzPart } from "./scene-types";

/** The February panorama resolves a short concrete toe, upper hoop bands, radial seams and individually weathered caps. */
export function siloFinish(parts: CruzPart[], steel: T.Material, concrete: T.Material) {
  const result: { mesh: T.InstancedMesh; ids: string[] }[] = [];
  const hoops: T.Matrix4[] = [],
    hoopIds: string[] = [],
    bases: T.Matrix4[] = [],
    baseIds: string[] = [];
  const saddle: T.Matrix4[] = [],
    saddleIds: string[] = [];
  for (const p of parts.filter((p) => p.roof === "silo")) {
    const bounds = extent(p.footprint),
      [x, z] = center(bounds),
      rx = (bounds.east - bounds.west) / 2,
      rz = (bounds.south - bounds.north) / 2;
    const base = p.base ?? 0,
      height = p.eave - base;
    const body = (w: number, h: number, d: number, y: number) =>
      new T.Matrix4().makeScale(w, h, d).setPosition(x, y, z);
    bases.push(body(rx + 0.19, 0.29, rz + 0.19, base + 0.145));
    baseIds.push(p.id);
    for (const t of [0.62, 0.71, 0.8, 0.9, 0.994]) {
      hoops.push(body(rx + 0.075, 0.12, rz + 0.075, base + height * t));
      hoopIds.push(p.id);
    }
    // The gallery follows the four apices. Each top connection terminates below its deck.
    saddle.push(body(1.08, 0.4, 0.94, p.eave + p.rise + 0.02));
    saddleIds.push(p.id);
  }
  function make(
    matrices: T.Matrix4[],
    ids: string[],
    geometry: T.BufferGeometry,
    material: T.Material,
  ) {
    if (!matrices.length) {
      geometry.dispose();
      return;
    }
    const mesh = new T.InstancedMesh(geometry, material, matrices.length);
    matrices.forEach((m, i) => mesh.setMatrixAt(i, m));
    mesh.castShadow = mesh.receiveShadow = true;
    result.push({ mesh, ids });
  }
  make(hoops, hoopIds, new T.CylinderGeometry(1, 1, 1, 64, 1, true), steel);
  make(bases, baseIds, new T.CylinderGeometry(1, 1, 1, 64), concrete);
  make(saddle, saddleIds, new T.BoxGeometry(1, 1, 1), steel);
  return result;
}
const colors: Record<string, string> = {
  "silo-sul-1": c.silo1,
  "silo-sul-2": c.silo2,
  "silo-sul-3": c.silo3,
  "silo-sul-4": c.silo4,
};
export const siloCapColor = (id: string) => new T.Color(colors[id] ?? "#ffffff");
