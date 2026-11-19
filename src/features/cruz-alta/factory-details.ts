import * as T from "three";
import { mergeGeometries } from "three/addons/utils/BufferGeometryUtils.js";
import { edgeCuts, meshGeometry, profile } from "./geometry";
import type { CruzPart, GroundPoint } from "./scene-types";

export function edgeBand(
  part: CruzPart,
  bottom: (point: GroundPoint) => number,
  upper: (point: GroundPoint) => number,
  outset: number,
  inset = 0,
  followRoof = false,
) {
  const { p: boundary, t, stations } = profile(part);
  const controls = followRoof ? stations(18) : [0, 1];
  const clockwise = T.ShapeUtils.isClockWise(boundary.map(([x, z]) => new T.Vector2(x, z)));
  const position: number[] = [],
    uv: number[] = [];
  for (let i = 0; i < boundary.length; i++) {
    const a = boundary[i]!,
      b = boundary[(i + 1) % boundary.length]!;
    const dx = b[0] - a[0],
      dz = b[1] - a[1],
      length = Math.hypot(dx, dz);
    if (length < 0.001) continue;
    const nx = (clockwise ? -dz : dz) / length,
      nz = (clockwise ? dx : -dx) / length;
    const point = (u: number): GroundPoint => [a[0] + dx * u, a[1] + dz * u];
    const cuts = edgeCuts(t(a), t(b), controls);
    for (let j = 1; j < cuts.length; j++) {
      const u = cuts[j - 1]!,
        v = cuts[j]!;
      const start = point(u),
        end = point(v);
      const vertex = (p: GroundPoint, h: number, offset: number): [number, number, number] => [
        p[0] + nx * offset,
        h,
        p[1] + nz * offset,
      ];
      const aLow = vertex(start, bottom(start), outset),
        bLow = vertex(end, bottom(end), outset),
        aTop = vertex(start, upper(start), outset),
        bTop = vertex(end, upper(end), outset),
        ai = vertex(start, upper(start), inset),
        bi = vertex(end, upper(end), inset);
      const face = (
        a: number[],
        b: number[],
        c: number[],
        aUV: number[],
        bUV: number[],
        cUV: number[],
      ) => {
        const corners = clockwise
          ? [
              [a, aUV],
              [c, cUV],
              [b, bUV],
            ]
          : [
              [a, aUV],
              [b, bUV],
              [c, cUV],
            ];
        for (const [v, t] of corners) {
          position.push(...v!);
          uv.push(...t!);
        }
      };
      const aluv = [u * length, aLow[1]],
        bluv = [v * length, bLow[1]],
        atuv = [u * length, aTop[1]],
        btuv = [v * length, bTop[1]];
      face(aLow, aTop, bLow, aluv, atuv, bluv);
      face(bLow, aTop, bTop, bluv, atuv, btuv);
      if (outset > inset) {
        face(aTop, ai, bTop, atuv, [atuv[0]!, aTop[1] + outset - inset], btuv);
        face(
          bTop,
          ai,
          bi,
          btuv,
          [atuv[0]!, aTop[1] + outset - inset],
          [btuv[0]!, bTop[1] + outset - inset],
        );
      }
    }
  }
  return meshGeometry(position, uv);
}

export function roofFascia(part: CruzPart) {
  const { h } = profile(part);
  const depth = part.roof === "flat" ? 0.22 : 0.19;
  // A thin folded external edge wraps the sheets and covers their cut at either LOD.
  return edgeBand(
    part,
    (p) => h(p) - depth,
    (p) => h(p) + 0.012,
    0.036,
    -0.027,
    true,
  );
}

/** Intersection flashing at the registered meeting of the pitched annex and curved gable. */
export function annexFlashing(annex: CruzPart, nave: CruzPart) {
  const [, a, b] = annex.footprint as [GroundPoint, GroundPoint, GroundPoint, GroundPoint];
  const [d, , , c] = nave.footprint as [GroundPoint, GroundPoint, GroundPoint, GroundPoint];
  const { h } = profile(annex);
  const lerp = (t: number): GroundPoint => [a[0] + (b[0] - a[0]) * t, a[1] + (b[1] - a[1]) * t];
  const positions: number[] = [],
    uv: number[] = [];
  const dx = d[0] - c[0],
    dz = d[1] - c[1],
    length = Math.hypot(dx, dz);
  const toWall = ([x, z]: GroundPoint): GroundPoint => {
    const t = ((x - c[0]) * dx + (z - c[1]) * dz) / (length * length);
    return [c[0] + t * dx, c[1] + t * dz];
  };
  for (const [from, to] of [
    [0, 0.5],
    [0.5, 1],
  ] as const) {
    const bounds = (t: number) => {
      const point = lerp(t);
      const wall = toWall(point);
      const awayX = wall[0] - point[0],
        awayZ = wall[1] - point[1];
      const gap = Math.hypot(awayX, awayZ);
      const outer: GroundPoint =
        gap > 0.001 ? [point[0] - (0.19 * awayX) / gap, point[1] - (0.19 * awayZ) / gap] : point;
      const height = h(point) + 0.035;
      return [
        [outer[0], height, outer[1]],
        [wall[0], height + 0.17, wall[1]],
      ];
    };
    const [low0, high0] = bounds(from),
      [low1, high1] = bounds(to);
    positions.push(...low0!, ...high0!, ...low1!, ...low1!, ...high0!, ...high1!);
    uv.push(
      from * length,
      0,
      from * length,
      0.28,
      to * length,
      0,
      to * length,
      0,
      from * length,
      0.28,
      to * length,
      0.28,
    );
  }
  return meshGeometry(positions, uv);
}

export function preparationBands(part: CruzPart, deck: number) {
  const courses = part.id === "cobertura-28" ? 2 : 4;
  const base = part.base ?? 0;
  const floor = deck - base;
  const panelPieces: T.BufferGeometry[] = [],
    apronPieces: T.BufferGeometry[] = [];
  // V108 shows pale continuous edges separated by recessed dark strips.
  for (let i = 0; i < courses; i++) {
    const cap = base + ((i + 1) / courses) * floor;
    const sill = base + (i / courses) * floor + (i === 0 ? 0.38 : (floor / courses) * 0.27);
    panelPieces.push(
      edgeBand(
        part,
        () => sill,
        () => cap - 0.24,
        0.18,
      ),
    );
    apronPieces.push(
      edgeBand(
        part,
        () => cap - 0.26,
        () => cap,
        0.36,
        0.05,
      ),
    );
  }
  function combine(list: T.BufferGeometry[]) {
    const geo = mergeGeometries(list)!;
    list.forEach((piece) => piece.dispose());
    return geo;
  }
  return { panels: combine(panelPieces), aprons: combine(apronPieces) };
}

export function roofTerminal() {
  const pieces = [
    new T.CylinderGeometry(0.34, 0.47, 0.13, 12).translate(0, -0.22, 0),
    new T.CylinderGeometry(0.21, 0.27, 0.45, 12).translate(0, 0.03, 0),
    new T.CylinderGeometry(0.25, 0.27, 0.07, 12).translate(0, 0.26, 0),
  ];
  const terminal = mergeGeometries(pieces)!;
  pieces.forEach((piece) => piece.dispose());
  return terminal;
}
