import { openRoof, roofFrames } from "./roof-supports";
import type { CruzLine, CruzObject, CruzPart, GroundPoint, SceneLayers } from "./scene-types";

export type Extent = { west: number; east: number; north: number; south: number; top: number };
export function extent(points: GroundPoint[], top = 0): Extent {
  return points.reduce(
    (e, [x, z]) => ({
      west: Math.min(e.west, x),
      east: Math.max(e.east, x),
      north: Math.min(e.north, z),
      south: Math.max(e.south, z),
      top,
    }),
    { west: Infinity, east: -Infinity, north: Infinity, south: -Infinity, top },
  );
}
function union(a: Extent, b: Extent): Extent {
  return {
    west: Math.min(a.west, b.west),
    east: Math.max(a.east, b.east),
    north: Math.min(a.north, b.north),
    south: Math.max(a.south, b.south),
    top: Math.max(a.top, b.top),
  };
}
export function center(e: Extent): GroundPoint {
  return [(e.west + e.east) / 2, (e.north + e.south) / 2];
}
export function inside(x: number, z: number, polygon: GroundPoint[]) {
  let result = false;
  for (let i = 0, j = polygon.length - 1; i < polygon.length; j = i++) {
    const [ax, az] = polygon[i]!,
      [bx, bz] = polygon[j]!;
    if (az > z !== bz > z && x < ((bx - ax) * (z - az)) / (bz - az) + ax) result = !result;
  }
  return result;
}
/** Technical navigation envelope; independent of any legal boundary. */
function convexHull(points: GroundPoint[]) {
  const sorted = [...points].sort((a, b) => a[0] - b[0] || a[1] - b[1]);
  const turn = (a: GroundPoint, b: GroundPoint, c: GroundPoint) =>
    (b[0] - a[0]) * (c[1] - a[1]) - (b[1] - a[1]) * (c[0] - a[0]);
  function half(list: GroundPoint[]) {
    const edge: GroundPoint[] = [];
    for (const p of list) {
      while (edge.length > 1 && turn(edge.at(-2)!, edge.at(-1)!, p) <= 0) edge.pop();
      edge.push(p);
    }
    return edge.slice(0, -1);
  }
  return [...half(sorted), ...half(sorted.reverse())];
}
function constrain(x: number, z: number, hull: GroundPoint[], margin: number): GroundPoint {
  if (inside(x, z, hull)) return [x, z];
  let best = Infinity,
    closest: GroundPoint = [x, z];
  for (let i = 0; i < hull.length; i++) {
    const [ax, az] = hull[i]!,
      [bx, bz] = hull[(i + 1) % hull.length]!,
      dx = bx - ax,
      dz = bz - az;
    const u = Math.max(
      0,
      Math.min(1, ((x - ax) * dx + (z - az) * dz) / Math.max(0.0001, dx * dx + dz * dz)),
    );
    const px = ax + u * dx,
      pz = az + u * dz,
      d = Math.hypot(px - x, pz - z);
    if (d < best) {
      best = d;
      closest = [px, pz];
    }
  }
  if (best <= margin) return [x, z];
  return [
    closest[0] + ((x - closest[0]) * margin) / best,
    closest[1] + ((z - closest[1]) * margin) / best,
  ];
}
export function normalize(value: string) {
  return value
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .toLowerCase()
    .trim();
}
export function spatialIndex(objects: CruzObject[], parts: CruzPart[], lines: CruzLine[]) {
  const byId = new Map(objects.map((o) => [o.id, o]));
  const bounds = new Map<string, Extent>();
  const chains = new Map<string, string[]>();
  for (const o of objects) {
    const path = [o.id];
    let parent = o.parent;
    while (parent && byId.has(parent) && !path.includes(parent)) {
      path.push(parent);
      parent = byId.get(parent)?.parent;
    }
    chains.set(o.id, path);
  }
  const add = (id: string, e: Extent) => {
    for (const key of chains.get(id) ?? [])
      bounds.set(key, bounds.has(key) ? union(bounds.get(key)!, e) : e);
  };
  const solids = parts.map((p) => {
    const e = extent(p.footprint, p.eave + p.rise + (p.parapet?.height ?? 0));
    add(p.id, e);
    return { part: p, bounds: e, columns: openRoof(p) ? roofFrames(p).flat() : null };
  });
  for (const l of lines) if (l.points.length) add(l.id, extent(l.points, l.y ?? 0));
  const unit = [...bounds.values()].reduce<Extent>((a, b) => union(a, b), extent([]));
  // Items on a documented roof can focus the parent when their path is unlocated.
  function focus(id: string) {
    const ancestry = chains.get(id) ?? [];
    return (
      bounds.get(id) ??
      (ancestry[1] && byId.get(ancestry[1])?.kind === "componente"
        ? bounds.get(ancestry[1])
        : undefined)
    );
  }
  const textIndex = objects.map((o) => ({
    o,
    text: normalize(
      [
        o.name,
        o.code,
        ...(o.aliases ?? []),
        ...(chains.get(o.id) ?? []).slice(1).map((id) => byId.get(id)?.name),
      ]
        .filter(Boolean)
        .join(" "),
    ),
    label: normalize(o.name),
  }));
  function search(value: string) {
    const q = normalize(value),
      words = q.split(/\s+/);
    const score = (entry: (typeof textIndex)[number]) =>
      entry.o.kind === "componente" && entry.o.aliases?.some((alias) => normalize(alias) === q)
        ? 0
        : entry.o.code === q
          ? 1
          : entry.label === q
            ? 2
            : entry.label.startsWith(q)
              ? 3
              : 4;
    return textIndex
      .filter((e) => words.every((word) => e.text.includes(word)))
      .sort((a, b) => score(a) - score(b))
      .map((e) => e.o);
  }
  const hull = convexHull(parts.flatMap((p) => p.footprint));
  const restrict = (x: number, z: number) => constrain(x, z, hull, 10);
  const closedWalls: Record<string, number[]> = {
    "cobertura-57": [0, 1, 3],
    "cobertura-35": [1, 2, 3],
    "cobertura-08": [3],
  };
  function occupied(x: number, z: number) {
    const allowed = restrict(x, z);
    if (Math.hypot(allowed[0] - x, allowed[1] - z) > 0.02) return true;
    return solids.some(
      ({ part: p, bounds: b, columns }) =>
        (p.base ?? 0) < 2.1 &&
        x >= b.west &&
        x <= b.east &&
        z >= b.north &&
        z <= b.south &&
        (columns
          ? columns.some(([cx, cz]) => Math.hypot(cx - x, cz - z) < 0.44) ||
            (closedWalls[p.id] ?? []).some((i) => {
              const a = p.footprint[i]!,
                b = p.footprint[(i + 1) % 4]!,
                dx = b[0] - a[0],
                dz = b[1] - a[1];
              const t = Math.max(
                0,
                Math.min(1, ((x - a[0]) * dx + (z - a[1]) * dz) / (dx * dx + dz * dz)),
              );
              return Math.hypot(x - a[0] - t * dx, z - a[1] - t * dz) < 0.38;
            })
          : inside(x, z, p.footprint)),
    );
  }
  function labelOccluded(
    eye: { x: number; y: number; z: number },
    x: number,
    y: number,
    z: number,
    id: string,
    visible: SceneLayers,
  ) {
    const dx = x - eye.x,
      dz = z - eye.z,
      dy = y - eye.y;
    const minX = Math.min(eye.x, x),
      maxX = Math.max(eye.x, x),
      minZ = Math.min(eye.z, z),
      maxZ = Math.max(eye.z, z);
    return solids.some(({ part: p, bounds: b, columns }) => {
      const layer =
        p.roof === "tank" || p.roof === "silo" ? "equipamentos" : (p.layer ?? "edificacoes");
      if (
        !visible[layer] ||
        p.bracing ||
        columns ||
        p.id === id ||
        chains.get(p.id)?.includes(id) ||
        b.east < minX ||
        b.west > maxX ||
        b.south < minZ ||
        b.north > maxZ
      )
        return false;
      for (let i = 0; i < p.footprint.length; i++) {
        const a = p.footprint[i]!,
          b = p.footprint[(i + 1) % p.footprint.length]!,
          sx = b[0] - a[0],
          sz = b[1] - a[1];
        const det = dx * sz - dz * sx;
        if (Math.abs(det) < 1e-7) continue;
        const ax = a[0] - eye.x,
          az = a[1] - eye.z,
          t = (ax * sz - az * sx) / det,
          v = (ax * dz - az * dx) / det;
        if (t <= 0.001 || t >= 0.995 || v < 0 || v > 1) continue;
        const elevation = eye.y + t * dy;
        if (elevation > (p.base ?? 0) && elevation < p.eave) return true;
      }
      return false;
    });
  }
  return { byId, chains, bounds, unit, focus, search, occupied, restrict, labelOccluded };
}
export type SpatialIndex = ReturnType<typeof spatialIndex>;
