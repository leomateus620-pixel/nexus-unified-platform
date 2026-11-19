import type { GroundPoint } from "./scene-types";
import { northReservoirBund, railwayCorridors } from "./terrain-surfaces";

type Vertex = [x: number, z: number, y: number];
type GroundTriangle = [Vertex, Vertex, Vertex];
interface LevelPatch {
  edge: GroundPoint[];
  triangles: GroundTriangle[];
  bounds: [west: number, north: number, east: number, south: number];
}

function levelPatch(edge: GroundPoint[], crown: Vertex[]): LevelPatch {
  const base = edge.map(([x, z]): Vertex => [x, z, 0]);
  const triangles: GroundTriangle[] = [];
  crown.forEach((inner, i) => {
    const j = (i + 1) % crown.length;
    triangles.push([base[i]!, base[j]!, inner], [base[j]!, crown[j]!, inner]);
  });
  for (let i = 2; i < crown.length; i++) {
    triangles.push([crown[0]!, crown[i - 1]!, crown[i]!]);
  }
  const xs = edge.map(([x]) => x);
  const zs = edge.map(([, z]) => z);
  return {
    edge,
    triangles,
    bounds: [Math.min(...xs), Math.min(...zs), Math.max(...xs), Math.max(...zs)],
  };
}

// A linha de quebra está no concreto do dique, visível aos 150 s. A pequena diferença
// em relação ao pátio é esquemática. O piso interno é plano, sem amarração altimétrica.
const bundCenter = northReservoirBund.reduce<GroundPoint>(
  ([cx, cz], [x, z]) => [cx + x / northReservoirBund.length, cz + z / northReservoirBund.length],
  [0, 0],
);
const bundFloor = levelPatch(
  northReservoirBund,
  northReservoirBund.map(([x, z]) => {
    const dx = bundCenter[0] - x,
      dz = bundCenter[1] - z;
    const fraction = 0.65 / Math.hypot(dx, dz);
    return [x + dx * fraction, z + dz * fraction, 0.08];
  }),
);

export const railwayAxes = railwayCorridors.map(({ footprint: [a, b, c, d] }) => {
  const from: GroundPoint = [(a![0] + d![0]) / 2, (a![1] + d![1]) / 2];
  const to: GroundPoint = [(b![0] + c![0]) / 2, (b![1] + c![1]) / 2];
  const dx = to[0] - from[0],
    dz = to[1] - from[1];
  const length = Math.hypot(dx, dz);
  const point = (t: number, lateral = 0): GroundPoint => [
    from[0] + dx * t - (dz / length) * lateral,
    from[1] + dz * t + (dx / length) * lateral,
  ];
  return { from, to, length, point };
});

// Lastro aparente nas extremidades da faixa fotografada. Na área de manobra e sob
// as coberturas, conserva-se o chão local. O greide e a espessura praticada são pendentes.
export const exposedBallast: ReadonlyArray<readonly [start: number, end: number]> = [
  [0, 0.15],
  [0.8, 1],
];
export const railBedHalfWidth = 1.12;
export const railBedCrownHalfWidth = 0.87;
const railBedRise = 0.095;
const railEndGradient = 2.4;

const railBeds = railwayAxes.flatMap(({ length, point }) =>
  exposedBallast.map(([from, to]) => {
    const ramp = railEndGradient / length;
    const edge = [
      point(from, -railBedHalfWidth),
      point(to, -railBedHalfWidth),
      point(to, railBedHalfWidth),
      point(from, railBedHalfWidth),
    ];
    const crown = [
      point(from + ramp, -railBedCrownHalfWidth),
      point(to - ramp, -railBedCrownHalfWidth),
      point(to - ramp, railBedCrownHalfWidth),
      point(from + ramp, railBedCrownHalfWidth),
    ].map(([x, z]): Vertex => [x, z, railBedRise]);
    return levelPatch(edge, crown);
  }),
);

export const localBreaklines = [bundFloor, ...railBeds];

/** Apoio relativo usado pela malha e pela navegação, inclusive sem a paisagem regional. */
export function localGroundHeight(x: number, z: number) {
  for (const patch of localBreaklines) {
    const [west, north, east, south] = patch.bounds;
    if (x < west || x > east || z < north || z > south) continue;
    for (const [[ax, az, ay], [bx, bz, by], [cx, cz, cy]] of patch.triangles) {
      const det = (bz - cz) * (ax - cx) + (cx - bx) * (az - cz);
      const a = ((bz - cz) * (x - cx) + (cx - bx) * (z - cz)) / det;
      const b = ((cz - az) * (x - cx) + (ax - cx) * (z - cz)) / det;
      const c = 1 - a - b;
      if (a >= -1e-8 && b >= -1e-8 && c >= -1e-8) return Math.max(0, a * ay + b * by + c * cy);
    }
  }
  return 0;
}

/** The visible concrete lip is a closed barrier; the railway bed remains walkable. */
export function localGroundBlocked(x: number, z: number) {
  return northReservoirBund.some(([ax, az], i) => {
    const [bx, bz] = northReservoirBund[(i + 1) % northReservoirBund.length]!;
    const dx = bx - ax,
      dz = bz - az;
    const t = Math.max(0, Math.min(1, ((x - ax) * dx + (z - az) * dz) / (dx * dx + dz * dz)));
    return Math.hypot(x - ax - t * dx, z - az - t * dz) < 0.37;
  });
}
