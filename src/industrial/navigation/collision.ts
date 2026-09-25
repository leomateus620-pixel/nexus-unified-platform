import { elements, site } from "../data";
import type { GroundCollider } from "../types";
import { elementFootprint, groundHeightAt, groundY, navigationBounds } from "../scene/spatial";

function segmentDistance(x: number, z: number, a: number[], b: number[]): number {
  const dx = b[0]! - a[0]!,
    dz = b[1]! - a[1]!;
  const lengthSquared = dx * dx + dz * dz;
  const t = lengthSquared
    ? Math.max(0, Math.min(1, ((x - a[0]!) * dx + (z - a[1]!) * dz) / lengthSquared))
    : 0;
  return Math.hypot(x - a[0]! - dx * t, z - a[1]! - dz * t);
}

export function polygonBlocks(x: number, z: number, points: number[][], margin: number): boolean {
  let inside = false;
  for (let i = 0, j = points.length - 1; i < points.length; j = i++) {
    const a = points[j]!,
      b = points[i]!;
    if (segmentDistance(x, z, a, b) < margin) return true;
    if (a[1]! > z !== b[1]! > z && x < ((b[0]! - a[0]!) * (z - a[1]!)) / (b[1]! - a[1]!) + a[0]!)
      inside = !inside;
  }
  return inside;
}

export function colliderBlocks(
  collider: GroundCollider,
  x: number,
  z: number,
  margin: number,
  surfaceY = groundY,
): boolean {
  // Underground tunnels and overhead pipes are not ground-level walls. CAD
  // assemblies supply individual occupied footprints, not one global AABB.
  if (
    collider.kind === "none" ||
    collider.maxY <= surfaceY + 0.05 ||
    collider.minY >= surfaceY + 1.8
  )
    return false;
  if (collider.kind === "circle" && collider.center && collider.radius !== undefined)
    return Math.hypot(x - collider.center[0], z - collider.center[1]) < collider.radius + margin;
  return (
    collider.kind === "polygon" &&
    Boolean(collider.points && polygonBlocks(x, z, collider.points, margin))
  );
}

// Swept substeps preserve the existing sliding behavior on slow frames.
export function blocked(x: number, z: number, margin = 0.48): boolean {
  if (
    x < navigationBounds.min[0] ||
    x > navigationBounds.max[0] ||
    z < navigationBounds.min[2] ||
    z > navigationBounds.max[2]
  )
    return true;
  const surfaceY = groundHeightAt(x, z);
  return (
    elements.some((e) => {
      const colliders = e.colliders ?? (e.collider ? [e.collider] : null);
      if (colliders)
        return colliders.some((collider) => colliderBlocks(collider, x, z, margin, surfaceY));
      const dx = x - e.position[0],
        dz = z - e.position[2],
        g = e.geometry;
      if (e.category === "silos" || e.id === "EQ-03")
        return dx * dx + dz * dz < (Number(g["radius"]) + margin + 0.6) ** 2;
      if (e.category === "buildings") return polygonBlocks(x, z, elementFootprint(e), margin);
      if (e.id === "EQ-01") return Math.abs(dx) < 1.5 + margin && Math.abs(dz) < 1.5 + margin;
      if (e.id === "EQ-02")
        return [e.position[2] - 6, e.position[2] + 9].some(
          (cz) => Math.abs(x - e.position[0]) < 1.25 + margin && Math.abs(z - cz) < 0.4 + margin,
        );
      return false;
    }) ||
    site.terrain.fences.some((f) => {
      if (f.type === "gate-open") return false;
      return f.points.slice(1).some((b, i) => {
        const a = f.points[i]!;
        return segmentDistance(x, z, a, b) < margin;
      });
    })
  );
}
export function moveWithCollisions(
  position: [number, number],
  delta: [number, number],
): [number, number] {
  let [x, z] = position;
  const n = Math.max(1, Math.ceil(Math.hypot(...delta) / 0.2));
  for (let i = 0; i < n; i++) {
    if (!blocked(x + delta[0] / n, z)) x += delta[0] / n;
    if (!blocked(x, z + delta[1] / n)) z += delta[1] / n;
  }
  return [x, z];
}
