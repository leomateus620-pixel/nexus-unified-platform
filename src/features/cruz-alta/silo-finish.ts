import * as T from "three";
import { palette as c } from "./paleta";
import { center, extent } from "./spatial";
import type { CruzPart } from "./scene-types";

/** The February panorama resolves a short concrete toe, upper hoop bands, radial seams and individually weathered caps. */
export function siloFinish(
  parts: CruzPart[],
  steel: T.Material,
  rings: T.Material,
  concrete: T.Material,
) {
  const result: { mesh: T.InstancedMesh; ids: string[]; fine: boolean }[] = [];
  const hoops: T.Matrix4[] = [],
    hoopIds: string[] = [],
    bases: T.Matrix4[] = [],
    baseIds: string[] = [];
  const saddle: T.Matrix4[] = [],
    saddleIds: string[] = [];
  const vents: T.Matrix4[] = [],
    ventIds: string[] = [];
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
    for (const t of [0.017, 0.62, 0.71, 0.8, 0.9, 0.994]) {
      const ring = t > 0.98 ? 0.17 : 0.085;
      hoops.push(body(rx + ring, t > 0.98 ? 0.28 : 0.21, rz + ring, base + height * t));
      hoopIds.push(p.id);
    }
    // The gallery follows the four apices. Each top connection terminates below its deck.
    saddle.push(body(1.29, 0.47, 1.04, p.eave + p.rise - 0.015));
    saddleIds.push(p.id);
    // Raised fittings trace two conical courses in the layout photo and video at 36 s.
    // Their exact count, dimensions and function remain to be checked.
    for (const [course, count] of [
      [0.62, 16],
      [0.84, 20],
    ] as const)
      for (let i = 0; i < count; i++) {
        const angle = (2 * Math.PI * (i + 0.35)) / count;
        const y = p.eave + p.rise * (1 - course);
        vents.push(
          new T.Matrix4().makeTranslation(
            x + rx * course * Math.cos(angle),
            y + 0.14,
            z + rz * course * Math.sin(angle),
          ),
        );
        ventIds.push(p.id);
      }
  }
  function make(
    matrices: T.Matrix4[],
    ids: string[],
    geometry: T.BufferGeometry,
    material: T.Material,
    fine = false,
  ) {
    if (!matrices.length) {
      geometry.dispose();
      return;
    }
    const mesh = new T.InstancedMesh(geometry, material, matrices.length);
    matrices.forEach((m, i) => mesh.setMatrixAt(i, m));
    mesh.castShadow = !fine;
    mesh.receiveShadow = true;
    result.push({ mesh, ids, fine });
  }
  const flange = [
    new T.Vector2(0.989, -0.5),
    new T.Vector2(1.004, -0.5),
    new T.Vector2(1.009, -0.23),
    new T.Vector2(1.009, 0.21),
    new T.Vector2(1.002, 0.5),
    new T.Vector2(0.989, 0.5),
  ];
  make(hoops, hoopIds, new T.LatheGeometry(flange, 48), rings);
  make(bases, baseIds, new T.CylinderGeometry(1, 1, 1, 64), concrete);
  make(saddle, saddleIds, new T.BoxGeometry(1, 1, 1), steel);
  make(vents, ventIds, new T.CylinderGeometry(0.095, 0.17, 0.27, 6), steel, true);
  return result;
}
const colors: Record<string, string> = {
  "silo-sul-1": c.silo1,
  "silo-sul-2": c.silo2,
  "silo-sul-3": c.silo3,
  "silo-sul-4": c.silo4,
};
export const siloCapColor = (id: string) => new T.Color(colors[id] ?? "#ffffff");
