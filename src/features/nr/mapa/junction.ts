import type { SceneManifest, Vec2 } from "./types";

/** A circular return crossed by the highway, not a grass disk over the road.
 * All approach strips are trimmed at the same outer edge used by this surface. */
export function junctionContours(j: SceneManifest["site"]["junction"]) {
  const point = (across: number, along: number): Vec2 => [
    j.center[0] + across * Math.cos(j.bearing) + along * Math.sin(j.bearing),
    j.center[1] + across * Math.sin(j.bearing) - along * Math.cos(j.bearing),
  ];
  const outer = Array.from({ length: 128 }, (_, i) =>
    point(j.radius * Math.cos((i * Math.PI) / 64), j.radius * Math.sin((i * Math.PI) / 64)),
  );
  // Keep CCW orientation for convex clipping in the scene X/Z plane.
  outer.reverse();
  const a = Math.acos((j.highwayHalfWidth + 0.35) / j.islandRadius);
  const islands = [-1, 1].map((side) =>
    Array.from({ length: 65 }, (_, i) => {
      const angle = -a + (2 * a * i) / 64;
      return point(side * j.islandRadius * Math.cos(angle), j.islandRadius * Math.sin(angle));
    }),
  );
  return { outer, islands };
}

/** Difference of a convex road triangle and a convex junction footprint.
 * Emits disjoint pieces, avoiding coplanar asphalt and terrain cracks at joins. */
export function outsideConvex(polygon: Vec2[], boundary: Vec2[]): Vec2[][] {
  const outside: Vec2[][] = [];
  let remaining = polygon;
  for (let i = 0; i < boundary.length && remaining.length; i++) {
    const a = boundary[i]!,
      b = boundary[(i + 1) % boundary.length]!;
    const distance = (p: Vec2) => (b[0] - a[0]) * (p[1] - a[1]) - (b[1] - a[1]) * (p[0] - a[0]);
    const inner: Vec2[] = [],
      outer: Vec2[] = [];
    for (let k = 0; k < remaining.length; k++) {
      const p = remaining[k]!,
        q = remaining[(k + 1) % remaining.length]!;
      const dp = distance(p),
        dq = distance(q);
      (dp >= -1e-8 ? inner : outer).push(p);
      if ((dp > 1e-8 && dq < -1e-8) || (dp < -1e-8 && dq > 1e-8)) {
        const t = dp / (dp - dq);
        const hit: Vec2 = [p[0] + (q[0] - p[0]) * t, p[1] + (q[1] - p[1]) * t];
        inner.push(hit);
        outer.push(hit);
      }
    }
    if (outer.length >= 3) outside.push(outer);
    remaining = inner;
  }
  return outside;
}
