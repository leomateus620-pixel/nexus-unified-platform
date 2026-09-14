import { elements, site } from "../data";
// Swept substeps avoid tunnelling on a slow frame. Includes cylinders, building
// footprints and central columns; height remains locked to conservative ground.
export function blocked(x: number, z: number, margin = 0.48): boolean {
  if (x < -85 || x > 95 || z < -66 || z > 77) return true;
  return (
    elements.some((e) => {
      const dx = x - e.position[0],
        dz = z - e.position[2],
        g = e.geometry;
      if (e.category === "silos" || e.id === "EQ-03")
        return dx * dx + dz * dz < (Number(g["radius"]) + margin + 0.6) ** 2;
      if (e.category === "buildings")
        return (
          Math.abs(dx) < Number(g["width"]) / 2 + margin &&
          Math.abs(dz) < Number(g["depth"]) / 2 + margin
        );
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
        const dx = b[0]! - a[0]!,
          dz = b[1]! - a[1]!;
        const t = Math.max(
          0,
          Math.min(1, ((x - a[0]!) * dx + (z - a[1]!) * dz) / (dx * dx + dz * dz)),
        );
        return Math.hypot(x - a[0]! - dx * t, z - a[1]! - dz * t) < margin;
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
