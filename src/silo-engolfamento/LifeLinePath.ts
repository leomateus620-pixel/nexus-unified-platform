import { SILO_CONFIG, SUPPORT_ANGLES } from "./SiloConfig";

export const TAU = Math.PI * 2;
export const LIFE_LINE_LENGTH = TAU * SILO_CONFIG.ringRadius.value;
export interface PathPoint {
  x: number;
  y: number;
  z: number;
}
export interface TrolleyFrame {
  angle: number;
  unwrappedAngle: number;
  distance: number;
  /** Distance travelled since this demonstration/incident start, not arc coordinate. */
  travelledDistance: number;
  /** Nominal cable-centre reference, not either roller's physical axle. */
  position: PathPoint;
  eye: PathPoint;
  tangent: PathPoint;
  yaw: number;
  wheelRotation: number;
  supportIndex: number;
}
export const wrapAngle = (angle: number) => ((angle % TAU) + TAU) % TAU;
export function createTrolleyFrame(): TrolleyFrame {
  return {
    angle: 0,
    unwrappedAngle: 0,
    distance: 0,
    travelledDistance: 0,
    position: { x: 0, y: 0, z: 0 },
    eye: { x: 0, y: 0, z: 0 },
    tangent: { x: 1, y: 0, z: 0 },
    yaw: 0,
    wheelRotation: 0,
    supportIndex: 0,
  };
}
/** Unwrapped arc distance is the only trolley state. Evaluating reverse seeks is exact. */
export function evaluateTrolley(distance: number, out = createTrolleyFrame()): TrolleyFrame {
  const radius = SILO_CONFIG.ringRadius.value;
  out.distance = distance;
  out.travelledDistance = Math.abs(distance);
  out.unwrappedAngle = distance / radius;
  out.angle = wrapAngle(out.unwrappedAngle);
  out.position.x = Math.sin(out.unwrappedAngle) * radius;
  out.position.y = SILO_CONFIG.ringY.value;
  out.position.z = Math.cos(out.unwrappedAngle) * radius;
  const eyeRadius = radius + SILO_CONFIG.trolleyEyeRadialOffset.value;
  out.eye.x = Math.sin(out.unwrappedAngle) * eyeRadius;
  out.eye.y = out.position.y - SILO_CONFIG.trolleyEyeOffset.value;
  out.eye.z = Math.cos(out.unwrappedAngle) * eyeRadius;
  out.tangent.x = Math.cos(out.unwrappedAngle);
  out.tangent.y = 0;
  out.tangent.z = -Math.sin(out.unwrappedAngle);
  // Trolley local X follows the tangent; local Z points radially outward.
  out.yaw = out.unwrappedAngle;
  out.wheelRotation = distance / (SILO_CONFIG.wheelDiameter.value / 2);
  out.supportIndex = Math.round((out.angle / TAU) * SUPPORT_ANGLES.length) % SUPPORT_ANGLES.length;
  return out;
}
