import type { SiloPlacement, Vec3 } from "./types";

/** Photo proportions, not surveyed stair/structural dimensions. +Y is vertical.
 * Reference 5 looks from the exterior SW (+Z, -X), Union on screen right.
 * Descending azimuth crosses the visible front (+Z), regardless of the camera.
 * EC28 hatch remains at its existing local coordinates (PDF pp.10-13). */
export const SA05_REFERENCE = {
  position: [-22, 13, 62] as Vec3,
  target: [3, 16, -1] as Vec3,
  fov: 38,
};
export function sa05Access(s: SiloPlacement) {
  const r = s.diameter / 2,
    bottom = s.clearance + s.cone,
    top = bottom + s.straight;
  const radius = r + 0.73,
    width = 1;
  const start = Math.atan2(0.9, -Math.sqrt(radius * radius - 0.81));
  const end = 0.3,
    landingArc = 0.19,
    flights = 4;
  const flightArc = (start - end - 3 * landingArc) / flights;
  const lowY = bottom + 0.15,
    highY = top + 0.08;
  const point = (angle: number, y: number, radial = radius): Vec3 => [
    Math.cos(angle) * radial,
    y,
    Math.sin(angle) * radial,
  ];
  const segments: {
    kind: "flight" | "landing";
    from: number;
    to: number;
    low: number;
    high: number;
  }[] = [];
  let angle = start;
  for (let i = 0; i < flights; i++) {
    const low = lowY + ((highY - lowY) * i) / flights,
      high = lowY + ((highY - lowY) * (i + 1)) / flights;
    segments.push({ kind: "flight", from: angle, to: angle - flightArc, low, high });
    angle -= flightArc;
    if (i < flights - 1) {
      segments.push({ kind: "landing", from: angle, to: angle - landingArc, low: high, high });
      angle -= landingArc;
    }
  }
  const lower = point(start, lowY),
    upper = point(end, highY);
  return {
    radius,
    width,
    bottom,
    top,
    start,
    end,
    segments,
    point,
    lower,
    upper,
    front: point(Math.PI / 2, lowY + (highY - lowY) * 0.55),
    hatch: [-r - 0.06, bottom + 1.05, 0.9] as Vec3,
    groundEntry: [lower[0], 0.5, lower[2] - 10.6] as Vec3,
    roofLanding: [0, top + s.roof + 0.2, 0] as Vec3,
  };
}

export function sa05Connections(s: SiloPlacement) {
  const access = sa05Access(s);
  // Tower sits in front of the calibrated intermediate building, clear of its roof.
  const origin: Vec3 = [s.position[0] + 8, s.position[1], s.position[2] - 5.6];
  const deck = access.top + s.roof + 9.0;
  const towerSocket: Vec3 = [origin[0] - 0.45, origin[1] + deck - 0.7, origin[2] + 0.25];
  const siloSocket: Vec3 = [
    s.position[0],
    s.position[1] + access.roofLanding[1] + 0.52,
    s.position[2],
  ];
  return { origin, deck, towerSocket, siloSocket, diameter: 0.46 };
}
