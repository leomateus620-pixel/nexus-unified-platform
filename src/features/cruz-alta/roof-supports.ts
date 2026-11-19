import type { CruzPart, GroundPoint } from "./scene-types";
// Open bays identified in the 14/15/65/66 and 18/19/54 assembly sheets.
// The camera clearance and render geometry share these support positions.
const openBays = new Set(
  ["08", "35", "14", "15", "65", "66", "18", "19", "54", "57", "62", "28.1"].map(
    (c) => "cobertura-" + c,
  ),
);
export const openRoof = (p: CruzPart) => openBays.has(p.id);
export const raisedRoof = (p: CruzPart) => p.id === "cobertura-27" || p.id === "cobertura-27.1";
export function roofFrames(p: CruzPart): [GroundPoint, GroundPoint][] {
  if ((!openRoof(p) && !raisedRoof(p)) || p.footprint.length !== 4) return [];
  const [a, b, c, d] = p.footprint as [GroundPoint, GroundPoint, GroundPoint, GroundPoint];
  const length = Math.hypot(a[0] - b[0], a[1] - b[1]);
  const bays =
    p.id === "cobertura-62"
      ? 3
      : Math.max(1, Math.round(length / (p.id === "cobertura-28.1" ? 10 : 7.5)));
  const lerp = (u: GroundPoint, v: GroundPoint, t: number): GroundPoint => [
    u[0] + (v[0] - u[0]) * t,
    u[1] + (v[1] - u[1]) * t,
  ];
  return Array.from({ length: bays + 1 }, (_, i) => [lerp(a, b, i / bays), lerp(d, c, i / bays)]);
}
