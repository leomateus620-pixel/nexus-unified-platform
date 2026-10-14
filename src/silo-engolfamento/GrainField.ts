/**
 * Educational, axisymmetric bulk approximation, not a DEM or certified flow model.
 * Coordinates: metres, Y up, silo axis X=Z=0; feet and volume use this frame.
 * The upper surface is volume-equivalent: the radial depression has an exactly
 * integrated compensating offset. No invisible particles are counted as volume.
 */
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
  radius: metres(3),
  outletRadius: metres(0.18),
  outletY: metres(1.2),
  hopperTop: metres(3.5),
  bodyTop: metres(9.5),
  roofTop: metres(11.2),
  initialSurface: metres(6.35),
  flowRadius: metres(2.1),
  maximumDepression: metres(0.42),
  nominalDischarge: 0.65 as VolumeFlow,
  eyeHeight: metres(1.65),
  dorsalHeight: metres(1.42),
  dorsalBack: metres(-0.14),
  anchor: Object.freeze([-0.7, 9.25, 0] as const),
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
export const HOPPER_VOLUME =
  (Math.PI *
    (SILO.hopperTop - SILO.outletY) *
    (SILO.radius ** 2 + SILO.radius * SILO.outletRadius + SILO.outletRadius ** 2)) /
  3;
export const INITIAL_GRAIN_VOLUME = grainVolume(SILO.initialSurface);

export function grainVolume(meanSurface: number): CubicMetres {
  // This module's incident stays above the hopper. Deeper empties use the exact
  // similar-frustum volume rather than treating the cone as a cylinder.
  if (meanSurface <= SILO.outletY) return 0 as CubicMetres;
  if (meanSurface >= SILO.hopperTop)
    return (HOPPER_VOLUME + BODY_AREA * (meanSurface - SILO.hopperTop)) as CubicMetres;
  const h = meanSurface - SILO.outletY;
  const r =
    SILO.outletRadius + ((SILO.radius - SILO.outletRadius) * h) / (SILO.hopperTop - SILO.outletY);
  return ((Math.PI * h * (r * r + r * SILO.outletRadius + SILO.outletRadius ** 2)) /
    3) as CubicMetres;
}

/** Mean of (1-r/Rf)^2 on a disc of silo radius R is Rf²/(6R²). */
export const DEPRESSION_MEAN = SILO.flowRadius ** 2 / (6 * SILO.radius ** 2);

export function surfaceAt(x: number, z: number, grain: GrainState): Metres {
  const radial = Math.hypot(x, z);
  const shape = Math.max(0, 1 - radial / SILO.flowRadius) ** 2;
  return metres(grain.surfaceHeight + grain.depression * (DEPRESSION_MEAN - shape));
}

/** Reuses an output buffer. Velocity is visual advection, not grain contact physics. */
export function flowAt(
  x: number,
  z: number,
  grain: GrainState,
  out: FlowVector = { x: 0 as Speed, y: 0 as Speed, z: 0 as Speed },
): FlowVector {
  const r = Math.hypot(x, z);
  const influence = Math.max(0, 1 - r / SILO.flowRadius);
  const speed = (grain.flow / SILO.nominalDischarge) * 0.045 * influence;
  if (speed === 0) {
    out.x = out.y = out.z = 0 as Speed;
    return out;
  }
  const inverseR = r > 1e-5 ? 1 / r : 0;
  out.x = (-x * inverseR * speed) as Speed;
  out.z = (-z * inverseR * speed) as Speed;
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

/** Gate opens over 1 s, stays open, and closes over 1 s at t=22 s. */
export function dischargeAt(time: number): { gate: Ratio; discharged: CubicMetres } {
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
    discharged: (integral * SILO.nominalDischarge) as CubicMetres,
  };
}
