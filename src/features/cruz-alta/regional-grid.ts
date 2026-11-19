export type GridBounds = [west: number, north: number, east: number, south: number];
export interface HorizonGrid {
  bounds: GridBounds;
  cols: number;
  rows: number;
  heights: string;
  albedo: string;
  verticalScaleMeters: number;
  altitudeOffsetMeters: number;
  siteElevationMeters: number;
}
export interface HorizonManifest extends HorizonGrid {
  attribution: string[];
  detail?: HorizonGrid;
  nearby?: Pick<HorizonGrid, "bounds" | "albedo">;
}
export interface Elevations {
  meta: HorizonGrid;
  raw: Uint16Array;
}
export function elevationAt({ meta, raw }: Elevations, x: number, z: number) {
  const [w, n, e, s] = meta.bounds;
  const u = Math.max(0, Math.min(meta.cols - 1, ((x - w) / (e - w)) * (meta.cols - 1)));
  const v = Math.max(0, Math.min(meta.rows - 1, ((z - n) / (s - n)) * (meta.rows - 1)));
  const col = Math.min(Math.floor(u), meta.cols - 2),
    row = Math.min(Math.floor(v), meta.rows - 2);
  const i = row * meta.cols + col,
    dx = u - col,
    dz = v - row;
  const upper = raw[i]! * (1 - dx) + raw[i + 1]! * dx;
  const lower = raw[i + meta.cols]! * (1 - dx) + raw[i + meta.cols + 1]! * dx;
  return (
    (upper * (1 - dz) + lower * dz) * meta.verticalScaleMeters +
    meta.altitudeOffsetMeters -
    meta.siteElevationMeters
  );
}
export function innerDistance([west, north, east, south]: GridBounds, x: number, z: number) {
  return Math.min(x - west, z - north, east - x, south - z);
}
function ramp(value: number) {
  const t = Math.max(0, Math.min(1, value));
  return t * t * (3 - 2 * t);
}
export function siteHeight(
  x: number,
  z: number,
  wide: Elevations,
  detail: Elevations | null,
  pad: GridBounds,
) {
  const padDistance = innerDistance(pad, x, z);
  if (padDistance >= 0) return -0.005;
  let h = elevationAt(wide, x, z);
  if (detail) {
    const weight = ramp(innerDistance(detail.meta.bounds, x, z) / 400);
    if (weight > 0) h += (elevationAt(detail, x, z) - h) * weight;
  }
  // Local tangent plane on WGS 84. At 30 km the curvature lowers the visible skyline by ~71 m.
  const tangentDrop = (x * x + z * z) / (2 * 6371008.8);
  return -0.005 + (h - tangentDrop + 0.005) * ramp(-padDistance / 225);
}
/** LOD fixed to the only navigable area. Both grids use the same triangle edges at every distance. */
export function sampleAxis(
  min: number,
  max: number,
  origin: number,
  anchors: number[],
  nativeStep: number,
) {
  const values = new Set([min, max, ...anchors.filter((x) => x > min && x < max)]);
  values.add(origin);
  for (const sign of [-1, 1]) {
    let d = 0;
    while (sign < 0 ? origin - d > min : origin + d < max) {
      d += Math.max(nativeStep, Math.min(1550, d * 0.075));
      const p = origin + sign * d;
      if (p > min && p < max) values.add(p);
    }
  }
  return [...values].sort((a, b) => a - b);
}
