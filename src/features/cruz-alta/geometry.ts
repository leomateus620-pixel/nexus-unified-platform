import * as T from "three";
import type { CruzArea, CruzPart, GroundPoint } from "./scene-types";
function perimeter(p: GroundPoint[]) {
  return p.filter(([x, z], i) => {
    const next = p[(i + 1) % p.length];
    return next && (next[0] !== x || next[1] !== z);
  });
}
function triangles(p: GroundPoint[]) {
  return T.ShapeUtils.triangulateShape(
    p.map(([x, z]) => new T.Vector2(x, z)),
    [],
  );
}
export function profile(part: CruzPart) {
  const p = perimeter(part.footprint);
  const edge = p
    .map(
      ([x, z], i) => [p[(i + 1) % p.length]![0] - x, p[(i + 1) % p.length]![1] - z] as GroundPoint,
    )
    .sort((a, b) => Math.hypot(...b) - Math.hypot(...a))[0]!;
  const [dx, dz] = part.axis ?? edge,
    len = Math.hypot(dx, dz) || 1;
  const along = ([x, z]: GroundPoint) => (x * dx + z * dz) / len;
  const across = ([x, z]: GroundPoint) => (z * dx - x * dz) / len;
  const distances = p.map(across),
    lo = Math.min(...distances),
    width = Math.max(0.001, Math.max(...distances) - lo);
  const t = (v: GroundPoint) => (across(v) - lo) / width;
  const section = part.roofSection;
  const segment = (u: number) => {
    const i = section!.findIndex(([at]) => at >= u);
    const end = Math.max(1, i);
    return [section![end - 1]!, section![end]!] as const;
  };
  const h = (v: GroundPoint) => {
    const u = T.MathUtils.clamp(t(v), 0, 1);
    if (section) {
      const [[start, low], [end, high]] = segment(u);
      return T.MathUtils.lerp(low, high, (u - start) / (end - start));
    }
    const rise =
      part.roof === "gable"
        ? 1 - Math.abs(2 * u - 1)
        : part.roof === "arc"
          ? 4 * u * (1 - u)
          : part.roof === "mono"
            ? u
            : 0;
    return part.eave + rise * part.rise;
  };
  const roofDistance = (v: GroundPoint) => {
    const distance = t(v) * width;
    if (section) {
      const u = T.MathUtils.clamp(t(v), 0, 1);
      let length = 0;
      for (let i = 1; i < section.length; i++) {
        const [a, h1] = section[i - 1]!;
        const [b, h2] = section[i]!;
        length += Math.hypot((b - a) * width, h2 - h1) * T.MathUtils.clamp((u - a) / (b - a), 0, 1);
      }
      return length;
    }
    if (part.roof === "mono") return Math.hypot(width, part.rise) * t(v);
    if (part.roof === "gable") return Math.hypot(width, 2 * part.rise) * t(v);
    if (part.roof !== "arc") return distance;
    // Integral of arc length over the parabolic profile. Independent of LOD tessellation.
    const slope = (4 * part.rise) / width;
    if (Math.abs(slope) < 0.001) return distance;
    const primitive = (k: number) => (k * Math.hypot(1, k) + Math.asinh(k)) / 2;
    return (width / (2 * slope)) * (primitive(slope) - primitive(slope * (1 - 2 * t(v))));
  };
  const stations = (arcSegments = 72) => {
    if (section) return section.map(([at]) => at);
    const steps = part.roof === "arc" ? arcSegments : part.roof === "gable" ? 2 : 1;
    return Array.from({ length: steps + 1 }, (_, i) => i / steps);
  };
  const normalAt = (v: GroundPoint) => {
    const derivative = (4 * part.rise * (1 - 2 * t(v))) / width;
    return new T.Vector3((derivative * dz) / len, 1, (-derivative * dx) / len).normalize();
  };
  return { p, along, across, t, h, stations, normalAt, roofDistance };
}
function clip(poly: GroundPoint[], at: number, t: (p: GroundPoint) => number, above: boolean) {
  const out: GroundPoint[] = [];
  for (let i = 0; i < poly.length; i++) {
    const a = poly[i]!,
      b = poly[(i + 1) % poly.length]!,
      ta = t(a),
      tb = t(b);
    const keepA = above ? ta >= at : ta <= at,
      keepB = above ? tb >= at : tb <= at;
    if (keepA) out.push(a);
    if (keepA !== keepB) {
      const u = (at - ta) / (tb - ta);
      out.push([a[0] + (b[0] - a[0]) * u, a[1] + (b[1] - a[1]) * u]);
    }
  }
  return out;
}
export function meshGeometry(positions: number[], uvs?: number[]) {
  const geo = new T.BufferGeometry();
  geo.setAttribute("position", new T.Float32BufferAttribute(positions, 3));
  if (uvs) geo.setAttribute("uv", new T.Float32BufferAttribute(uvs, 2));
  geo.computeVertexNormals();
  return geo;
}
export function edgeCuts(a: number, b: number, stations: readonly number[]) {
  const cuts = [0, 1];
  for (const station of stations.slice(1, -1)) {
    const cut = (station - a) / (b - a);
    if (cut > 0 && cut < 1) cuts.push(cut);
  }
  return cuts.sort((a, b) => a - b);
}
export function shell(part: CruzPart, arcSegments?: number) {
  const surface = profile(part),
    { p, h, t, along, roofDistance } = surface,
    stations = surface.stations(arcSegments);
  const roof: number[] = [],
    wall: number[] = [],
    wallUV: number[] = [],
    gableWall: number[] = [],
    gableUV: number[] = [],
    uv: number[] = [],
    parapet: number[] = [],
    normals: number[] = [];
  for (const [i, j, k] of triangles(p)) {
    const face = [p[i!]!, p[j!]!, p[k!]!];
    for (let s = 1; s < stations.length; s++) {
      const band = clip(clip(face, stations[s - 1]!, t, true), stations[s]!, t, false);
      for (let n = 1; n + 1 < band.length; n++)
        for (const v of [band[0]!, band[n + 1]!, band[n]!]) {
          roof.push(v[0], h(v), v[1]);
          uv.push(along(v), roofDistance(v));
          if (part.roof === "arc") {
            const n = surface.normalAt(v);
            normals.push(n.x, n.y, n.z);
          }
        }
    }
  }
  const boundary = T.ShapeUtils.isClockWise(p.map(([x, z]) => new T.Vector2(x, z)))
    ? p
    : [...p].reverse();
  for (let i = 0; i < boundary.length; i++) {
    const a = boundary[i]!,
      b = boundary[(i + 1) % boundary.length]!,
      ta = t(a),
      tb = t(b);
    const cuts = edgeCuts(ta, tb, stations);
    const interpolate = (fraction: number): GroundPoint => [
      a[0] + (b[0] - a[0]) * fraction,
      a[1] + (b[1] - a[1]) * fraction,
    ];
    for (let j = 1; j < cuts.length; j++) {
      const v = interpolate(cuts[j - 1]!),
        w = interpolate(cuts[j]!);
      const bottom = part.base ?? 0,
        vh = h(v),
        wh = h(w);
      const quad = (buffer: number[], v1: number, w1: number, v2: number, w2: number) => {
        buffer.push(
          v[0],
          v1,
          v[1],
          w[0],
          w1,
          w[1],
          v[0],
          v2,
          v[1],
          v[0],
          v2,
          v[1],
          w[0],
          w1,
          w[1],
          w[0],
          w2,
          w[1],
        );
      };
      const edge = (i: number) => {
        const j = (i + 1) % p.length;
        return (a === p[i] && b === p[j]) || (a === p[j] && b === p[i]);
      };
      const openFront =
        (part.id === "cobertura-57" && edge(2)) ||
        (part.id === "cobertura-08" && edge(1)) ||
        (part.id === "cobertura-35" && edge(0));
      const eaveApron = part.id === "cobertura-08" && (edge(0) || edge(2));
      const terminal = (part.id === "cobertura-11" && edge(3)) || eaveApron;
      const low = eaveApron ? part.eave - 1.9 : bottom;
      if (!openFront) {
        quad(terminal ? gableWall : wall, low, low, vh, wh);
        const u0 = Math.hypot(v[0] - a[0], v[1] - a[1]),
          u1 = Math.hypot(w[0] - a[0], w[1] - a[1]);
        (terminal ? gableUV : wallUV).push(u0, low, u1, low, u0, vh, u0, vh, u1, low, u1, wh);
      }
      if (part.parapet) {
        quad(
          parapet,
          vh,
          wh,
          part.eave + part.rise + part.parapet.height,
          part.eave + part.rise + part.parapet.height,
        );
        // Folded top and inside face. The narrow return gives the parapet a visible thickness.
        const top = part.eave + part.rise + part.parapet.height,
          dx = w[0] - v[0],
          dz = w[1] - v[1],
          span = Math.hypot(dx, dz) || 1;
        const ix = (0.16 * dz) / span,
          iz = (-0.16 * dx) / span;
        const vi = [v[0] + ix, top, v[1] + iz],
          wi = [w[0] + ix, top, w[1] + iz],
          vo = [v[0], top, v[1]],
          wo = [w[0], top, w[1]];
        parapet.push(
          ...vo,
          ...vi,
          ...wo,
          ...wo,
          ...vi,
          ...wi,
          ...vi,
          ...wi,
          w[0] + ix,
          wh,
          w[1] + iz,
          ...vi,
          w[0] + ix,
          wh,
          w[1] + iz,
          v[0] + ix,
          vh,
          v[1] + iz,
        );
      }
    }
  }
  const roofGeo = meshGeometry(roof, uv);
  if (normals.length) roofGeo.setAttribute("normal", new T.Float32BufferAttribute(normals, 3));
  return {
    roof: roofGeo,
    wall: meshGeometry(wall, wallUV),
    gable: gableWall.length ? meshGeometry(gableWall, gableUV) : null,
    parapet: parapet.length ? meshGeometry(parapet) : null,
  };
}
export function groundFace(a: CruzArea, y: number) {
  const p = perimeter(a.footprint),
    pos: number[] = [],
    uv: number[] = [];
  for (const face of triangles(p))
    for (const i of face.slice().reverse()) {
      const [x, z] = p[i]!;
      pos.push(x, y, z);
      uv.push(x / 12, z / 12);
    }
  return meshGeometry(pos, uv);
}
