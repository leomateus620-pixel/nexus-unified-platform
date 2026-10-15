/** Flat-floor educational bulk model. Local collapse redistributes existing volume;
 * it is a deterministic cinematic illustration, not DEM/contact or load physics. */
import { INCIDENT_CENTRES, SILO_CONFIG } from "./SiloConfig";
export type Metres = number & { readonly __unit: "m" };
export type Seconds = number & { readonly __unit: "s" };
export type Speed = number & { readonly __unit: "m/s" };
export type CubicMetres = number & { readonly __unit: "m3" };
export type VolumeFlow = number & { readonly __unit: "m3/s" };
export type Ratio = number & { readonly __unit: "ratio" };

export const metres = (value: number) => value as Metres;
export const seconds = (value: number) => value as Seconds;
export const ratio = (value: number) => value as Ratio;

export const SILO = Object.freeze({
  radius: metres(SILO_CONFIG.radius.value),
  outletRadius: metres(0.18),
  outletY: metres(SILO_CONFIG.floorY.value),
  floorY: metres(SILO_CONFIG.floorY.value),
  /** Compatibility alias only. No hopper volume or hopper geometry is present. */
  hopperTop: metres(SILO_CONFIG.floorY.value),
  bodyTop: metres(SILO_CONFIG.bodyTop.value),
  roofTop: metres(SILO_CONFIG.roofTop.value),
  initialSurface: metres(SILO_CONFIG.initialSurface.value),
  ringRadius: metres(SILO_CONFIG.ringRadius.value),
  ringY: metres(SILO_CONFIG.ringY.value),
  workerRadius: metres(SILO_CONFIG.workerRadius.value),
  flowRadius: metres(SILO_CONFIG.collapseRadius.value),
  maximumDepression: metres(SILO_CONFIG.collapseDepth.value),
  nominalRedistribution: SILO_CONFIG.nominalRedistribution.value as VolumeFlow,
  /** Compatibility alias for historical flow consumers; no net discharge. */
  nominalDischarge: SILO_CONFIG.nominalRedistribution.value as VolumeFlow,
  eyeHeight: metres(1.65),
  dorsalHeight: metres(1.42),
  dorsalBack: metres(-0.14),
  /** Legacy coordinate, only catalogue reference. Domain uses frame.trolley.eye. */
  anchor: Object.freeze([
    0,
    SILO_CONFIG.ringY.value - SILO_CONFIG.trolleyEyeOffset.value,
    SILO_CONFIG.ringRadius.value,
  ] as const),
  fixedStep: seconds(1 / 60),
  maxSubsteps: 8,
  duration: seconds(30),
  incidentStart: seconds(6),
  dischargeStop: seconds(22),
  seed: 0x50_59_41,
});

export interface GrainState {
  surfaceHeight: Metres;
  depression: Metres;
  flow: VolumeFlow;
}
export interface FlowVector {
  x: Speed;
  y: Speed;
  z: Speed;
}

export const clamp = (value: number, minimum: number, maximum: number) =>
  Math.max(minimum, Math.min(maximum, value));
export const smooth = (value: number) => {
  const p = clamp(value, 0, 1);
  return p * p * (3 - 2 * p);
};

export const BODY_AREA = Math.PI * SILO.radius ** 2;
export const HOPPER_VOLUME = 0;
export const INITIAL_GRAIN_VOLUME = grainVolume(SILO.initialSurface);

export function grainVolume(meanSurface: number): CubicMetres {
  return (BODY_AREA *
    clamp(meanSurface - SILO.floorY, 0, SILO.bodyTop - SILO.floorY)) as CubicMetres;
}

/** Each compact patch has exactly zero integral; no global hidden compensator. */
export const DEPRESSION_MEAN = 0;
const CORE_RADIUS = SILO.flowRadius * 0.64;
const REDISTRIBUTION_RATIO = (CORE_RADIUS / SILO.flowRadius) ** 2;
export function collapseShape(distance: number): number {
  const broad = Math.max(0, 1 - distance ** 2 / SILO.flowRadius ** 2) ** 2;
  const core = Math.max(0, 1 - distance ** 2 / CORE_RADIUS ** 2) ** 2;
  return (REDISTRIBUTION_RATIO * broad - core) / (1 - REDISTRIBUTION_RATIO);
}

export function surfaceAt(x: number, z: number, grain: GrainState): Metres {
  let shape = 0;
  for (const centre of INCIDENT_CENTRES)
    shape += collapseShape(Math.hypot(x - centre.x, z - centre.z));
  return metres(grain.surfaceHeight + grain.depression * shape);
}

/** Reuses an output buffer. Velocity is visual advection, not grain contact physics. */
export function flowAt(
  x: number,
  z: number,
  grain: GrainState,
  out: FlowVector = { x: 0 as Speed, y: 0 as Speed, z: 0 as Speed },
): FlowVector {
  const centre = INCIDENT_CENTRES.reduce((nearest, candidate) =>
    Math.hypot(x - candidate.x, z - candidate.z) < Math.hypot(x - nearest.x, z - nearest.z)
      ? candidate
      : nearest,
  );
  const dx = x - centre.x,
    dz = z - centre.z;
  const r = Math.hypot(dx, dz);
  const influence = Math.max(0, 1 - r / SILO.flowRadius);
  const speed = (grain.flow / SILO.nominalDischarge) * 0.045 * influence;
  if (speed === 0) {
    out.x = out.y = out.z = 0 as Speed;
    return out;
  }
  const inverseR = r > 1e-5 ? 1 / r : 0;
  out.x = (-dx * inverseR * speed) as Speed;
  out.z = (-dz * inverseR * speed) as Speed;
  out.y = (-speed * (0.8 + influence)) as Speed;
  return out;
}

/** Index-based randomness: evaluating a seek never consumes a mutable PRNG. */
export function seededValue(index: number, seed = SILO.seed): number {
  let value = (index ^ seed) >>> 0;
  value = Math.imul(value ^ (value >>> 16), 0x7feb352d);
  value = Math.imul(value ^ (value >>> 15), 0x846ca68b);
  return ((value ^ (value >>> 16)) >>> 0) / 0x1_0000_0000;
}

/** Internal redistribution activity ramps up and ceases at 22s. No exterior
 * discharge is present in this flat-floor crust-collapse scenario. */
export function dischargeAt(time: number): {
  gate: Ratio;
  discharged: CubicMetres;
  mobilised: CubicMetres;
} {
  const incident = Math.max(0, time - SILO.incidentStart);
  const closing = SILO.dischargeStop - SILO.incidentStart - 1;
  let gate: number;
  let integral: number;
  if (incident <= 1) {
    gate = smooth(incident);
    // Antiderivative of smoothstep, t³ - t⁴/2.
    integral = incident ** 3 - incident ** 4 / 2;
  } else if (incident <= closing) {
    gate = 1;
    integral = incident - 0.5;
  } else {
    const c = clamp(incident - closing, 0, 1);
    gate = 1 - smooth(c);
    integral = closing - 0.5 + c - c ** 3 + c ** 4 / 2;
  }
  return {
    gate: ratio(gate),
    discharged: 0 as CubicMetres,
    mobilised: (integral * SILO.nominalDischarge) as CubicMetres,
  };
}
