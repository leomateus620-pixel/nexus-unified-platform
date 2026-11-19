import type { CruzLine, CruzObject, CruzPart, GroundPoint } from "./scene-types";

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
    return { part: p, bounds: e };
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
  function occupied(x: number, z: number) {
    if (x < unit.west - 32 || x > unit.east + 32 || z < unit.north - 32 || z > unit.south + 32)
      return true;
    return solids.some(
      ({ part: p, bounds: b }) =>
        (p.base ?? 0) < 2.1 &&
        x >= b.west &&
        x <= b.east &&
        z >= b.north &&
        z <= b.south &&
        inside(x, z, p.footprint),
    );
  }
  return { byId, chains, bounds, unit, focus, search, occupied };
}
export type SpatialIndex = ReturnType<typeof spatialIndex>;
