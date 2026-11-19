import * as T from "three";
import type { CruzPart } from "./scene-types";
import { profile } from "./geometry";
import { palette as c } from "./paleta";

const roofColors: Record<string, [string, string?]> = {
  "cobertura-11": [c.arc11Claro, c.arc11Patina],
  "cobertura-56": [c.agua56Clara, c.agua56Patina],
  "cobertura-03": [c.cascaLateral],
  "cobertura-04": [c.cascaNave04],
  "cobertura-05": [c.cascaNave05],
  "cobertura-46": [c.cascaLateral],
  "cobertura-08": [c.covCavaco],
  "cobertura-16": [c.caldeiraChapa],
  "cobertura-35": [c.caldeiraChapa],
  "cobertura-27": [c.preparacaoTelha],
  "cobertura-27.1": [c.preparacaoTelha],
  "cobertura-28": [c.preparacaoTelha],
  "cobertura-28.1": [c.preparacaoTelha],
};
export function paintRoof(geometry: T.BufferGeometry, part: CruzPart) {
  const colors = roofColors[part.id];
  if (!colors) return false;
  const surface = profile(part),
    a = new T.Color(colors[0]),
    b = colors[1] ? new T.Color(colors[1]) : a;
  const position = geometry.getAttribute("position"),
    values = new Float32Array(position.count * 3);
  for (let i = 0; i < position.count; i += 3) {
    const x = (position.getX(i) + position.getX(i + 1) + position.getX(i + 2)) / 3;
    const z = (position.getZ(i) + position.getZ(i + 1) + position.getZ(i + 2)) / 3;
    const value = surface.t([x, z]) < 0.5 ? a : b;
    for (let n = 0; n < 3; n++) value.toArray(values, 3 * (i + n));
  }
  geometry.setAttribute("color", new T.BufferAttribute(values, 3));
  return true;
}
const central: Record<string, string> = {
  "reservatorio-central-1": c.tanque1,
  "reservatorio-central-2": c.tanque2,
  "reservatorio-central-3": c.tanquePequeno,
  "reservatorio-central-4": c.tanque3,
  "reservatorio-central-5": c.tanque4,
  "reservatorio-central-6": c.tanquePequeno,
};
export function tankColor(id: string, cap: boolean) {
  return new T.Color(
    id === "reservatorio-norte-6"
      ? c.reservatorioBranco
      : cap
        ? (central[id] ?? "#d2d0c7")
        : "#d2d0c7",
  );
}
