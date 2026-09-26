import { VISUAL_TREADS, treadCenter, type Point } from "./lc02-layout";

export type WalkStation = { p: Point; s: number; heading: number; stair: boolean };
const anchors: { p: Point; stair: boolean }[] = [];
const add = (p: Point, stair = false) => anchors.push({ p, stair });
add([-0.85, 0, -5.2]);
add([-0.45, 0, -5.2]);
add([-0.05, 0, -5.2]);
add([0.32, 0, -5.2]);
add([0.58, 0, -4.95]);
for (let i = 0; i < VISUAL_TREADS; i++) add(treadCenter(0, i), true);
add([0.6, 3, 0.29]);
add([0.88, 3, 0.6]);
add([1.16, 3, 0.6]);
for (let i = 0; i < VISUAL_TREADS; i++) add(treadCenter(1, i), true);
for (const x of [6.09, 6.54, 6.99, 7.44, 7.89, 8.3]) add([x, 6, 0.6]);
add([8.66, 6, 0.44]);
add([8.7, 6, 0.07]);
for (const z of [-0.35, -0.8, -1.25]) add([8.7, 6, z]);
let distance = 0;
export const WALK_STATIONS: WalkStation[] = anchors.map((a, i) => {
  const previous = anchors[Math.max(0, i - 1)]!.p;
  const next = anchors[Math.min(anchors.length - 1, i + 1)]!.p;
  distance += Math.hypot(a.p[0] - previous[0], a.p[2] - previous[2]);
  return { ...a, s: distance, heading: Math.atan2(next[0] - previous[0], next[2] - previous[2]) };
});
export const WALK_LENGTH = WALK_STATIONS.at(-1)!.s;
export const DOOR_WAIT_S = WALK_STATIONS.find((a) => a.p[0] === 8.3)!.s;
export const DOOR_CROSSED_S = WALK_STATIONS.find((a) => a.p[2] === -0.8)!.s;
export const clamp = (n: number, lo: number, hi: number) => Math.min(hi, Math.max(lo, n));
export function angleLerp(a: number, b: number, t: number) {
  return a + Math.atan2(Math.sin(b - a), Math.cos(b - a)) * t;
}
export function segmentAt(s: number) {
  const limited = clamp(s, 0, WALK_LENGTH - 1e-7);
  let index = 0;
  while (index < WALK_STATIONS.length - 2 && WALK_STATIONS[index + 1]!.s <= limited) index++;
  const a = WALK_STATIONS[index]!,
    b = WALK_STATIONS[index + 1]!;
  return { index, a, b, t: (limited - a.s) / (b.s - a.s) };
}
export function routeAt(s: number) {
  const { a, b, t } = segmentAt(s);
  return {
    p: a.p.map((v, i) => v + (b.p[i]! - v) * t) as Point,
    heading: angleLerp(a.heading, b.heading, t),
    stair: a.stair || b.stair,
  };
}
function footAnchor(index: number, side: number): Point {
  const a = WALK_STATIONS[clamp(index, 0, WALK_STATIONS.length - 1)]!;
  return [
    a.p[0] + Math.cos(a.heading) * side * 0.105,
    a.p[1] + 0.007,
    a.p[2] - Math.sin(a.heading) * side * 0.105,
  ];
}
/** One foot stays planted in world space while the other clears the next tread. */
export function feetAt(s: number) {
  const { index, t, a, b } = segmentAt(s);
  const stanceSide = index % 2 === 0 ? -1 : 1;
  const stance = footAnchor(index, stanceSide);
  const from = footAnchor(index - 1, -stanceSide),
    to = footAnchor(index + 1, -stanceSide);
  const ease = t * t * (3 - 2 * t);
  const swing = from.map((v, i) => v + (to[i]! - v) * ease) as Point;
  swing[1] += Math.pow(Math.sin(Math.PI * t), 0.7) * (a.stair || b.stair ? 0.19 : 0.095);
  return {
    left: stanceSide === 1 ? stance : swing,
    right: stanceSide === -1 ? stance : swing,
    phase: (index + t) * Math.PI,
    stance: stanceSide === 1 ? "left" : "right",
  };
}
