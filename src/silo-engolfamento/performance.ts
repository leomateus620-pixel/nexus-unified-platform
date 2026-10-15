import * as T from "three";
import type { Quality } from "./GrainRenderer";

export function createMetrics() {
  return {
    version: 3,
    startedAt: performance.now(),
    readyMs: 0,
    explorationMs: 0,
    preparationMs: 0,
    assetReadyMs: 0,
    mainCompileMs: 0,
    workerCompileMs: 0,
    parallelShaderCompile: false,
    renderCount: 0,
    statusReason: "",
    assets: {} as Record<string, number>,
    frames: [] as {
      atMs: number;
      ms: number;
      cpuMs: number;
      updateCpuMs: number;
      tickCpuMs: number;
      camera: string;
      quality: Quality;
      calls: number;
      triangles: number;
      shadowCalls: number;
      shadowTriangles: number;
      activity?: "playback" | "navigation";
    }[],
    picking: [] as number[],
    dorsalError: 0,
    cameraPosition: [0, 0, 0],
    cameraTarget: [0, 0, 0],
    cameraQuaternion: [0, 0, 0, 1],
    projection: [] as number[],
    cameraLens: [0, 0, 0],
    controllerCamera: "frontal",
    selectedId: null as string | null,
    isolatedId: null as string | null,
    workerVisible: { A: false, B: false },
    grainsVisible: false,
    ropeVisible: false,
    calls: 0,
    triangles: 0,
    shadowCalls: 0,
    shadowTriangles: 0,
    geometryBytes: 0,
    textureBytes: 0,
    geometries: 0,
    textures: 0,
    contextLosses: 0,
    renderer: "",
    errors: [] as string[],
    quality: "economic" as Quality,
    disposed: false,
  };
}
export type SiloMetrics = ReturnType<typeof createMetrics>;
export function estimateResources(scene: T.Scene, metrics: SiloMetrics) {
  const arrays = new Set<ArrayBufferLike>(),
    textures = new Set<T.Texture>();
  scene.traverse((o) => {
    if (!(o instanceof T.Mesh)) return;
    for (const a of Object.values(o.geometry.attributes) as (
      T.BufferAttribute | T.InterleavedBufferAttribute
    )[])
      arrays.add(("data" in a ? a.data.array : a.array).buffer);
    if (o.geometry.index) arrays.add(o.geometry.index.array.buffer);
    if (o instanceof T.InstancedMesh) arrays.add(o.instanceMatrix.array.buffer);
    for (const m of Array.isArray(o.material) ? o.material : [o.material])
      for (const value of Object.values(m)) if (value instanceof T.Texture) textures.add(value);
  });
  metrics.geometryBytes = [...arrays].reduce((n, a) => n + a.byteLength, 0);
  metrics.textureBytes = [...textures].reduce((n, t) => {
    const img = t.image as { width?: number; height?: number } | undefined;
    return n + ((img?.width ?? 0) * (img?.height ?? 0) * 4 * 4) / 3;
  }, 0);
}
/** Per-session bounded measurements, active animation frames only. GPU time is not CPU render time. */
export class AdaptiveQuality {
  quality: Quality = "economic";
  private samples: number[] = [];
  private slow = 0;
  private fast = 0;
  private changedAt = 0;
  observe(ms: number, now: number) {
    this.samples.push(ms);
    if (this.samples.length < 120) return false;
    const sorted = this.samples.sort((a, b) => a - b),
      p95 = sorted[Math.floor(sorted.length * 0.95)]!;
    this.samples = [];
    if (p95 > 36) {
      this.slow++;
      this.fast = 0;
    } else if (p95 < 19) {
      this.fast++;
      this.slow = 0;
    } else {
      this.fast = this.slow = 0;
    }
    if (now - this.changedAt < 8000) return false;
    const old = this.quality;
    if (this.slow >= 2) {
      this.quality = this.quality === "high" ? "balanced" : "economic";
      this.slow = 0;
    } else if (this.fast >= 3) {
      this.quality = this.quality === "economic" ? "balanced" : "high";
      this.fast = 0;
    }
    if (old !== this.quality) {
      this.changedAt = now;
      return true;
    }
    return false;
  }
}
declare global {
  interface Window {
    __siloMetrics?: SiloMetrics;
  }
}
