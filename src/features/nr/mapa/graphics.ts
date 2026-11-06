import type { Vec3 } from "./types";
export type GraphicsProfile = "low" | "balanced" | "high";
export type GraphicsChoice = "auto" | GraphicsProfile;
export type LightState = "day" | "late";
export const QUALITY_STORAGE = "nexus:nr-map:quality:v1";
export const PROFILE_LABELS = { low: "Baixa", balanced: "Equilibrada", high: "Alta" };
export const GRAPHICS_PROFILES = {
  low: { dpr: 0.8, shadow: 1024, density: 0.46, floorDistance: 0, fine: false },
  balanced: { dpr: 1, shadow: 1536, density: 0.72, floorDistance: 38, fine: false },
  high: { dpr: 1.5, shadow: 2048, density: 1, floorDistance: 55, fine: true },
} as const;
export const LIGHT_STATES = {
  day: {
    sun: [-70, 110, 65] as Vec3,
    color: "#fff4df",
    intensity: 3.5,
    sky: "#bddcff",
    ground: "#68563d",
    hemisphere: 0.38,
    environment: 0.72,
    background: 1,
    fog: "#cee0e8",
  },
  late: {
    sun: [-110, 35, -80] as Vec3,
    color: "#ffbd7c",
    intensity: 3.3,
    sky: "#a9c5ed",
    ground: "#73513a",
    hemisphere: 0.3,
    environment: 0.65,
    background: 1,
    fog: "#d8bc9e",
  },
} as const;
export type GraphicsCapability = {
  software: boolean;
  maxTextureSize: number;
  cores: number;
  memory?: number | undefined;
  width: number;
  renderer: string;
};
export function validGraphicsChoice(value: unknown): GraphicsChoice {
  return value === "low" || value === "balanced" || value === "high" ? value : "auto";
}
export function initialAutomatic(c: GraphicsCapability): GraphicsProfile {
  return c.software ||
    c.maxTextureSize < 4096 ||
    c.cores <= 2 ||
    (c.memory !== undefined && c.memory <= 2)
    ? "low"
    : "balanced";
}
export function graphicsLimits(choice: GraphicsProfile, c: GraphicsCapability) {
  const config = GRAPHICS_PROFILES[choice];
  const shadow = Math.min(config.shadow, c.maxTextureSize, c.software ? 512 : 4096);
  return {
    ...config,
    shadow,
    dpr: c.software ? Math.min(0.75, config.dpr) : config.dpr,
    message: c.software
      ? "Renderização por software: resolução e mapa de sombras limitados neste recurso."
      : shadow < config.shadow
        ? `Mapa de sombras limitado a ${shadow} px pelo WebGL.`
        : "",
  };
}

/** Samples rendered interaction frames only. Idle demand gaps are never slow frames.
 * Stable 1.5s windows, asymmetric thresholds, three fast windows for promotion,
 * 15s cooldown and a proposal committed only after the gesture (including damping). */
export class AutomaticQuality {
  private samples: number[] = [];
  private start = 0;
  private fast = 0;
  private lastChange = -Infinity;
  pending: GraphicsProfile | null = null;
  constructor(public active: GraphicsProfile = "balanced") {}
  sample(ms: number, now: number, capability: GraphicsCapability, interacting = true) {
    if (!interacting || ms <= 0 || ms > 5000) {
      this.samples = [];
      this.start = now;
      return;
    }
    if (!this.samples.length) this.start = now;
    this.samples.push(ms);
    if (now - this.start < 1500 || this.samples.length < 24) return;
    const sorted = this.samples.sort((a, b) => a - b),
      p75 = sorted[Math.floor(sorted.length * 0.75)]!;
    this.samples = [];
    this.start = now;
    if (now - this.lastChange < 15000 || this.pending) return;
    const profiles: GraphicsProfile[] = ["low", "balanced", "high"],
      index = profiles.indexOf(this.active);
    if (p75 > 29 && index > 0) {
      this.pending = profiles[index - 1]!;
      this.fast = 0;
    } else if (
      p75 < 18.5 &&
      index < 2 &&
      !capability.software &&
      capability.maxTextureSize >= 4096 &&
      capability.cores > 2
    ) {
      this.fast++;
      // Small viewport is a secondary ceiling; it never selects initial quality.
      if (
        this.fast >= 3 &&
        !(
          index === 1 &&
          (capability.width < 700 || /intel|integrated|iris|uhd/i.test(capability.renderer))
        )
      )
        this.pending = profiles[index + 1]!;
    } else this.fast = 0;
  }
  finish(now: number) {
    if (!this.pending) return null;
    this.active = this.pending;
    this.pending = null;
    this.fast = 0;
    this.lastChange = now;
    return this.active;
  }
  reset(profile: GraphicsProfile) {
    this.active = profile;
    this.pending = null;
    this.samples = [];
    this.fast = 0;
  }
}
