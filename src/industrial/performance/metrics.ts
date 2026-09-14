import { Mesh, Texture } from "three";
import type { BufferGeometry, Scene, WebGLRenderer } from "three";
export interface FrameSample {
  ms: number;
  calls: number;
  triangles: number;
  cpuRenderMs?: number;
  mainCalls?: number;
  shadowCalls?: number;
  mainTriangles?: number;
  shadowTriangles?: number;
}
export interface MapDiagnostics {
  samples: FrameSample[];
  renderedFrames: number;
  calls: number;
  triangles: number;
  geometries: number;
  textures: number;
  programs: number;
  contextLosses: number;
  readyAt: number | null;
  startedAt: number;
  camera: number[];
  quality: string;
  renderer: string;
  status: string;
  assets: Record<string, { bytes: number; fetchMs: number; decodeMs: number }>;
  estimatedGeometryBytes: number;
  estimatedTextureBytes: number;
  mainCalls: number;
  shadowCalls: number;
  mainTriangles: number;
  shadowTriangles: number;
}
export const diagnostics: MapDiagnostics = {
  samples: [],
  renderedFrames: 0,
  calls: 0,
  triangles: 0,
  geometries: 0,
  textures: 0,
  programs: 0,
  contextLosses: 0,
  readyAt: null,
  startedAt: 0,
  camera: [],
  quality: "balanced",
  renderer: "",
  status: "loading",
  assets: {},
  estimatedGeometryBytes: 0,
  estimatedTextureBytes: 0,
  mainCalls: 0,
  shadowCalls: 0,
  mainTriangles: 0,
  shadowTriangles: 0,
};
export function captureFrame(gl: WebGLRenderer, ms: number, cpuRenderMs = 0) {
  const info = gl.info;
  diagnostics.renderedFrames++;
  diagnostics.calls = info.render.calls;
  diagnostics.triangles = info.render.triangles;
  diagnostics.geometries = info.memory.geometries;
  diagnostics.textures = info.memory.textures;
  diagnostics.programs = info.programs?.length ?? 0;
  diagnostics.samples.push({
    ms,
    calls: info.render.calls,
    triangles: info.render.triangles,
    cpuRenderMs,
    mainCalls: diagnostics.mainCalls,
    shadowCalls: diagnostics.shadowCalls,
    mainTriangles: diagnostics.mainTriangles,
    shadowTriangles: diagnostics.shadowTriangles,
  });
  if (diagnostics.samples.length > 9000)
    diagnostics.samples.splice(0, diagnostics.samples.length - 9000);
}
export function estimateResources(scene: Scene) {
  const arrays = new Set<ArrayBufferLike>();
  const textures = new Set<Texture>();
  scene.traverse((o) => {
    if (o instanceof Mesh) {
      const g = o.geometry as BufferGeometry;
      for (const attr of Object.values(g.attributes)) {
        const a = "data" in attr ? attr.data.array : attr.array;
        arrays.add(a.buffer);
      }
      if (g.index) arrays.add(g.index.array.buffer);
      (Array.isArray(o.material) ? o.material : [o.material]).forEach((m) =>
        Object.values(m).forEach((t) => {
          if (t instanceof Texture) textures.add(t);
        }),
      );
    }
  });
  diagnostics.estimatedGeometryBytes = [...arrays].reduce((s, b) => s + b.byteLength, 0);
  diagnostics.estimatedTextureBytes = [...textures].reduce((s, t) => {
    const img = t.image as { width?: number; height?: number } | undefined;
    return s + (img?.width ?? 0) * (img?.height ?? 0) * 4 * (t.generateMipmaps ? 4 / 3 : 1);
  }, 0);
  // Proxy estimates: excludes driver alignment, render targets, shadow maps,
  // PMREM allocations and vertex buffers created internally by the renderer.
}
export function resetMetrics() {
  diagnostics.samples.length = 0;
  diagnostics.renderedFrames = 0;
  diagnostics.contextLosses = 0;
  diagnostics.readyAt = null;
  diagnostics.startedAt = performance.now();
  diagnostics.assets = {};
  diagnostics.status = "loading";
}
declare global {
  interface Window {
    __industrialMetrics?: MapDiagnostics;
  }
}
