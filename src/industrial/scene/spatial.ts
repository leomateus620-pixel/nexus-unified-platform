import { elements, site } from "../data";
import type { ElementRecord, Vec3 } from "../types";

export interface SpatialBounds {
  min: Vec3;
  max: Vec3;
}

/** All returned coordinates are in the existing Nexus world frame, in metres. */
export function elementFootprint(element: ElementRecord): [number, number][] {
  if (element.footprint?.points.length) return element.footprint.points;
  const [x, , z] = element.position;
  const radius = Number(element.geometry["radius"] ?? 0);
  if (radius > 0)
    return Array.from({ length: 48 }, (_, i) => {
      const angle = (i * Math.PI * 2) / 48;
      return [x + radius * Math.cos(angle), z + radius * Math.sin(angle)];
    });
  const halfWidth = Number(element.geometry["width"] ?? 2) / 2;
  const halfDepth = Number(element.geometry["depth"] ?? 2) / 2;
  const yaw = element.rotation[1];
  return [
    [-halfWidth, -halfDepth],
    [halfWidth, -halfDepth],
    [halfWidth, halfDepth],
    [-halfWidth, halfDepth],
  ].map(([dx = 0, dz = 0]) => [
    x + dx * Math.cos(yaw) + dz * Math.sin(yaw),
    z - dx * Math.sin(yaw) + dz * Math.cos(yaw),
  ]);
}

export function elementBounds(element: ElementRecord): SpatialBounds {
  if (element.bounds) return element.bounds;
  const points = elementFootprint(element);
  const geometry = element.geometry;
  const height =
    element.category === "silos"
      ? Number(geometry["bodyHeight"] ?? 0) +
        Number(geometry["baseHeight"] ?? 0) +
        Number(geometry["coneHeight"] ?? 0) +
        Number(geometry["topHeight"] ?? 0)
      : Number(geometry["height"] ?? 2) + Number(geometry["rise"] ?? 0);
  return {
    min: [
      Math.min(...points.map((p) => p[0])),
      element.position[1],
      Math.min(...points.map((p) => p[1])),
    ],
    max: [
      Math.max(...points.map((p) => p[0])),
      element.position[1] + height,
      Math.max(...points.map((p) => p[1])),
    ],
  };
}

export function boundsCenter(bounds: SpatialBounds): Vec3 {
  return bounds.min.map((value, i) => (value + bounds.max[i]!) / 2) as Vec3;
}

export const groundY = site.cadRegistration?.groundY ?? 0;

function insidePolygon(x: number, z: number, polygon: number[][]): boolean {
  let inside = false;
  for (let i = 0, j = polygon.length - 1; i < polygon.length; j = i++) {
    const a = polygon[j]!,
      b = polygon[i]!;
    if (a[1]! > z !== b[1]! > z && x < ((b[0]! - a[0]!) * (z - a[1]!)) / (b[1]! - a[1]!) + a[0]!)
      inside = !inside;
  }
  return inside;
}

// Matches the preserved Blender terrain's two corner-smoothing passes.
function roundedPolygon(polygon: number[][]): number[][] {
  for (let pass = 0; pass < 2; pass++)
    polygon = polygon.flatMap((point, i) => {
      const next = polygon[(i + 1) % polygon.length]!;
      return [
        [point[0]! * 0.78 + next[0]! * 0.22, point[1]! * 0.78 + next[1]! * 0.22],
        [point[0]! * 0.22 + next[0]! * 0.78, point[1]! * 0.22 + next[1]! * 0.78],
      ];
    });
  return polygon;
}
const yard = roundedPolygon(site.terrain.yard);
const yardCenter = yard.reduce(
  (sum, p) => [sum[0]! + p[0]! / yard.length, sum[1]! + p[1]! / yard.length],
  [0, 0],
);
const gravel = yard.map((p) => [
  yardCenter[0]! + (p[0]! - yardCenter[0]!) * 0.986,
  yardCenter[1]! + (p[1]! - yardCenter[1]!) * 0.986,
]);
const islands = site.terrain.islands.map(roundedPolygon);
const access = site.terrain.access;
const accessCenterline: [number, number][] = access.slice(0, -1).flatMap((p1, i) => {
  const p0 = access[Math.max(0, i - 1)]!,
    p2 = access[i + 1]!,
    p3 = access[Math.min(access.length - 1, i + 2)]!;
  return Array.from(
    { length: 16 },
    (_, j) =>
      [0, 1].map((axis) => {
        const t = j / 16,
          a = p0[axis]!,
          b = p1[axis]!,
          c = p2[axis]!,
          d = p3[axis]!;
        return (
          0.5 *
          (2 * b +
            (-a + c) * t +
            (2 * a - 5 * b + 4 * c - d) * t * t +
            (-a + 3 * b - 3 * c + d) * t * t * t)
        );
      }) as [number, number],
  );
});
accessCenterline.push(access[access.length - 1]! as [number, number]);
export const accessWidth = Number(
  elements.find((element) => element.id === "TR-02")?.geometry["renderedWidth"] ?? 9,
);
export const highwayWidth = Number(
  elements.find((element) => element.id === "TR-03")?.geometry["width"] ?? 9.8,
);
const accessEdges = accessCenterline.map((point, i) => {
  const before = accessCenterline[Math.max(0, i - 1)]!;
  const after = accessCenterline[Math.min(accessCenterline.length - 1, i + 1)]!;
  const dx = after[0] - before[0],
    dz = after[1] - before[1];
  const length = Math.hypot(dx, dz) || 1;
  const nx = ((-dz / length) * accessWidth) / 2,
    nz = ((dx / length) * accessWidth) / 2;
  return {
    left: [point[0] + nx, point[1] + nz] as [number, number],
    right: [point[0] - nx, point[1] - nz] as [number, number],
  };
});
// The same sampled strip and end caps as Blender, without circular expansion
// around segment endpoints. Shared by walking surfaces and the minimap.
export const accessFootprint = [
  ...accessEdges.map((edge) => edge.left),
  ...accessEdges.map((edge) => edge.right).reverse(),
];
const weighingStrip = elements.find((element) => element.id === "PV-01");
const weighingFootprint = weighingStrip ? elementFootprint(weighingStrip) : [];

/** Preserved terrain surfaces only; underground CAD is never walkable by inference. */
export function groundHeightAt(x: number, z: number): number {
  const heights = site.terrain.surfaceHeights;
  let height = heights?.environment ?? -0.1;
  if (z <= (site.terrain.northSoilEdgeZ ?? -68)) height = heights?.northSoil ?? -0.07;
  if (insidePolygon(x, z, site.terrain.site)) height = heights?.site ?? 0.005;
  if (insidePolygon(x, z, yard)) height = heights?.yardShoulder ?? 0.04;
  if (insidePolygon(x, z, gravel)) height = heights?.yard ?? 0.08;
  if (islands.some((polygon) => insidePolygon(x, z, polygon))) height = heights?.islands ?? 0.12;
  if (insidePolygon(x, z, accessFootprint)) height = Math.max(height, heights?.access ?? 0.085);
  if (Math.abs(x - site.terrain.highwayX) <= highwayWidth / 2)
    height = Math.max(height, heights?.highway ?? 0.0875);
  for (const patch of site.terrain.localPatches ?? [])
    if (insidePolygon(x, z, patch.points)) height = Math.max(height, patch.height);
  if (weighingStrip && insidePolygon(x, z, weighingFootprint))
    height = Math.max(height, weighingStrip.position[1] + Number(weighingStrip.geometry["height"]));
  return height;
}

// Terrain and equipment have separate bounds: the 1800 × 1600 rural backdrop
// must never determine navigation limits, minimap scale or object focus.
const physicalBounds = elements
  .filter((element) => ["silos", "buildings", "equipment"].includes(element.category))
  .map(elementBounds);
export const industrialBounds: SpatialBounds = {
  min: [
    Math.min(...site.terrain.site.map((p) => p[0]!), ...physicalBounds.map((b) => b.min[0])),
    Math.min(groundY, ...physicalBounds.map((b) => b.min[1])),
    Math.min(...site.terrain.site.map((p) => p[1]!), ...physicalBounds.map((b) => b.min[2])),
  ],
  max: [
    Math.max(...site.terrain.site.map((p) => p[0]!), ...physicalBounds.map((b) => b.max[0])),
    Math.max(groundY, ...physicalBounds.map((b) => b.max[1])),
    Math.max(...site.terrain.site.map((p) => p[1]!), ...physicalBounds.map((b) => b.max[2])),
  ],
};
export const navigationBounds: SpatialBounds = {
  min: [industrialBounds.min[0] - 12, industrialBounds.min[1], industrialBounds.min[2] - 12],
  max: [industrialBounds.max[0] + 12, industrialBounds.max[1] + 8, industrialBounds.max[2] + 12],
};
export const industrialSpan = Math.max(
  industrialBounds.max[0] - industrialBounds.min[0],
  industrialBounds.max[2] - industrialBounds.min[2],
);
const siloCenters = elements
  .filter((element) => element.category === "silos")
  .map((element) => element.anchors?.center ?? boundsCenter(elementBounds(element)));
export const siloCenter = [0, 1, 2].map(
  (axis) =>
    siloCenters.reduce((total, center) => total + center[axis]!, 0) /
    Math.max(1, siloCenters.length),
) as Vec3;

export function identificationLabel(element: ElementRecord): string {
  return element.identification?.associationStatus === "HIGH_CONFIDENCE"
    ? "Identificação técnica"
    : "Identificação provisória";
}

export function matchesElement(element: ElementRecord, query: string, categoryName = ""): boolean {
  const normalize = (value: string) =>
    value
      .normalize("NFD")
      .replace(/[\u0300-\u036f]/g, "")
      .toLocaleLowerCase("pt-BR");
  return normalize(
    [
      element.id,
      element.name,
      categoryName,
      element.identification?.cadName,
      element.identification?.technicalIdentifier,
      ...(element.identification?.aliases ?? []),
      element.cad?.sourceObjectId,
      element.cad?.sourceInstancePath,
    ]
      .filter((value) => value !== undefined)
      .join(" "),
  ).includes(normalize(query.trim()));
}
