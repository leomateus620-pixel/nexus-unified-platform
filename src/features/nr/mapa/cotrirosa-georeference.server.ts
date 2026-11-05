import type { Vec2 } from "./types";

/** Manual visual readings, Google Earth / Airbus 19 Mar 2026, captured 5 Nov 2026.
 * WGS84. NOT a cadastral survey. Roof edges are not certified wall footprints.
 * A screenshot click has metre-scale uncertainty; decimal digits retain the reading,
 * not survey precision. No image tiles or customer originals ship with this scene. */
export const cotrirosaGeoreference = {
  suppliedPoint: { latitude: -27.8325861111, longitude: -54.4297111111 },
  origin: {
    latitude: -27.832775,
    longitude: -54.4300861111,
    label: "Centro visual da cobertura SA 05",
  },
  imageMetersPerPixel: 0.46,
  imageOrigin: [298, 866] as Vec2,
  imageDate: "2026-03-19",
  measuredAreaM2: 115851.58,
  measuredPerimeterM: 1421.5,
  perimeterDmsSeconds: [
    [49, 45.94, 25, 46.21],
    [49, 47.21, 25, 43.61],
    [49, 47.77, 25, 42.27],
    [49, 49.59, 25, 41.57],
    [49, 52.71, 25, 41.74],
    [49, 56.62, 25, 41.3],
    [50, 0.18, 25, 40.6],
    [50, 5.3, 25, 45.02],
    [50, 5.99, 25, 46.26],
    [50, 2.72, 25, 49.05],
    [49, 59.31, 25, 50.08],
    [49, 54.64, 25, 50.1],
    [49, 51.18, 25, 49.65],
    [49, 48.6, 25, 48.33],
  ],
};

/** East / south tangent plane in metres, Y reserved for visual elevation. */
export function geographicToScene(latitude: number, longitude: number): Vec2 {
  const o = cotrirosaGeoreference.origin;
  return [
    (longitude - o.longitude) * 111320 * Math.cos((o.latitude * Math.PI) / 180),
    -(latitude - o.latitude) * 110810,
  ];
}
export const workPerimeter: Vec2[] = cotrirosaGeoreference.perimeterDmsSeconds.map(
  ([lm, ls, om, os]) =>
    geographicToScene(-(27 + lm! / 60 + ls! / 3600), -(54 + om! / 60 + os! / 3600)),
);
