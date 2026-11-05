import { describe, expect, it } from "vitest";
import { junctionContours, outsideConvex } from "../src/features/nr/mapa/junction";
import { cotrirosa } from "../src/features/nr/mapa/cotrirosa.server";
import type { Vec2 } from "../src/features/nr/mapa/types";
const area = (p: Vec2[]) =>
  Math.abs(
    p.reduce((sum, a, i) => {
      const b = p[(i + 1) % p.length]!;
      return sum + a[0] * b[1] - b[0] * a[1];
    }, 0) / 2,
  );
const inside = (p: Vec2, poly: Vec2[]) => {
  let hit = false;
  for (let i = 0, j = poly.length - 1; i < poly.length; j = i++) {
    const a = poly[i]!,
      b = poly[j]!;
    if (
      a[1] > p[1] !== b[1] > p[1] &&
      p[0] < ((b[0] - a[0]) * (p[1] - a[1])) / (b[1] - a[1]) + a[0]
    )
      hit = !hit;
  }
  return hit;
};
describe("continuous entrance pavement", () => {
  it("clips crossing strips without losing their exterior or doubling the junction", () => {
    const parts = outsideConvex(
      [
        [-2, -2],
        [2, -2],
        [2, 2],
        [-2, 2],
      ],
      [
        [-1, -1],
        [1, -1],
        [1, 1],
        [-1, 1],
      ],
    );
    expect(parts.reduce((s, p) => s + area(p), 0)).toBeCloseTo(12, 7);
    expect(
      outsideConvex(
        [
          [0, 0],
          [0.2, 0],
          [0, 0.2],
        ],
        [
          [-1, -1],
          [1, -1],
          [1, 1],
          [-1, 1],
        ],
      ),
    ).toEqual([]);
  });
  it("keeps both highway lanes clear through the return and joins the private approach", () => {
    const j = cotrirosa.site.junction,
      { outer, islands } = junctionContours(j);
    for (let t = -25; t <= 25; t += 0.5)
      for (const offset of [-2.5, 2.5]) {
        const p: Vec2 = [
          j.center[0] + Math.sin(j.bearing) * t + Math.cos(j.bearing) * offset,
          j.center[1] - Math.cos(j.bearing) * t + Math.sin(j.bearing) * offset,
        ];
        expect(islands.some((island) => inside(p, island))).toBe(false);
      }
    for (const key of ["eixo-principal", "via-publica-oeste"]) {
      const p = cotrirosa.site.roads.find((r) => r.key === key)!.points.at(-1)!;
      expect(inside(p, outer)).toBe(true);
      expect(islands.some((island) => inside(p, island))).toBe(false);
    }
    expect(cotrirosa.site.roads.some((r) => r.key === "alca-acesso")).toBe(false);
  });
});
