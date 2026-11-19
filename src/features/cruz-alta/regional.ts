import * as T from "three";
import { opticalAlignment } from "./optical-alignment";
import { urbanSilhouette } from "./regional-buildings";
import type { Extent } from "./spatial";
import type { HorizonControls, HorizonInfo } from "./regional-types";
import {
  sampleAxis,
  siteHeight,
  type Elevations,
  type GridBounds,
  type HorizonGrid,
  type HorizonManifest,
} from "./regional-grid";

const base = "/models/cruz-alta/regional/";
function validGrid(g: HorizonGrid) {
  if (
    !g ||
    !Array.isArray(g.bounds) ||
    g.bounds.length !== 4 ||
    !g.bounds.every(Number.isFinite) ||
    g.bounds[0] >= g.bounds[2] ||
    g.bounds[1] >= g.bounds[3] ||
    ![g.rows, g.cols].every((n) => Number.isInteger(n) && n >= 2 && n <= 4097) ||
    ![g.verticalScaleMeters, g.altitudeOffsetMeters, g.siteElevationMeters].every(
      Number.isFinite,
    ) ||
    g.verticalScaleMeters <= 0 ||
    ![g.heights, g.albedo].every(
      (p) => typeof p === "string" && /^[\w-]+(?:\/[\w-]+)*\.[\w]+$/.test(p),
    )
  )
    throw new Error("Grade topográfica inválida.");
}
async function resource(name: string, signal: AbortSignal) {
  if (!/^[\w-]+(?:\/[\w-]+)*\.[\w]+$/.test(name))
    throw new Error("Nome de recurso regional inválido.");
  const r = await fetch(base + name, { signal });
  if (!r.ok) throw new Error("Fonte regional indisponível.");
  return r;
}
async function loadImage(
  meta: Pick<HorizonGrid, "albedo" | "bounds">,
  signal: AbortSignal,
  anisotropy: number,
) {
  if (
    !Array.isArray(meta.bounds) ||
    meta.bounds.length !== 4 ||
    !meta.bounds.every(Number.isFinite) ||
    meta.bounds[2] <= meta.bounds[0] ||
    meta.bounds[3] <= meta.bounds[1]
  )
    throw new Error("Extensão do mosaico inválida.");
  const blob = await (await resource(meta.albedo, signal)).blob();
  const pixels = await createImageBitmap(blob, {
    imageOrientation: "flipY",
    premultiplyAlpha: "none",
  });
  if (signal.aborted) {
    pixels.close();
    throw new DOMException("Cancelado", "AbortError");
  }
  const texture = new T.Texture(pixels);
  texture.flipY = false;
  texture.colorSpace = T.SRGBColorSpace;
  texture.minFilter = T.LinearMipmapLinearFilter;
  texture.anisotropy = anisotropy;
  texture.needsUpdate = true;
  return { meta, texture, pixels };
}
type Mosaic = Awaited<ReturnType<typeof loadImage>>;
async function loadGrid(meta: HorizonGrid, signal: AbortSignal, anisotropy: number) {
  validGrid(meta);
  const file = await (await resource(meta.heights, signal)).arrayBuffer();
  if (file.byteLength !== meta.rows * meta.cols * 2)
    throw new Error("Grade topográfica incompleta.");
  const image = await loadImage(meta, signal, anisotropy);
  return { ...image, meta, raw: new Uint16Array(file) };
}
type Layer = Awaited<ReturnType<typeof loadGrid>>;
function demGeometry(
  wide: Elevations,
  detail: Elevations | null,
  pad: GridBounds,
  localWidth: number,
) {
  const [w, n, e, s] = wide.meta.bounds,
    [pw, pn, pe, ps] = pad,
    cx = (pw + pe) / 2,
    cz = (pn + ps) / 2;
  const inner = detail?.meta.bounds ?? wide.meta.bounds;
  const minStep = detail
    ? Math.max(30, (inner[2] - inner[0]) / (detail.meta.cols - 1))
    : Math.max(40, Math.min(75, (e - w) / (wide.meta.cols - 1)));
  const xs = sampleAxis(w, e, cx, [pw, pe, inner[0], inner[2]], minStep);
  const zs = sampleAxis(n, s, cz, [pn, ps, inner[1], inner[3]], minStep);
  const pos: number[] = [],
    uv = [],
    regional = [],
    local = [],
    indices = [];
  for (const z of zs)
    for (const x of xs) {
      pos.push(x, siteHeight(x, z, wide, detail, pad), z);
      uv.push((x - w) / (e - w), 1 - (z - n) / (s - n));
      regional.push(
        (x - inner[0]) / (inner[2] - inner[0]),
        1 - (z - inner[1]) / (inner[3] - inner[1]),
      );
      local.push((x - cx) / localWidth + 0.5, 0.5 - (z - cz) / localWidth);
    }
  for (let j = 0; j < zs.length - 1; j++)
    for (let i = 0; i < xs.length - 1; i++) {
      if (xs[i]! >= pw && xs[i + 1]! <= pe && zs[j]! >= pn && zs[j + 1]! <= ps) continue;
      const a = j * xs.length + i,
        b = a + xs.length;
      indices.push(a, b, a + 1, a + 1, b, b + 1);
    }
  const g = new T.BufferGeometry();
  g.setAttribute("position", new T.Float32BufferAttribute(pos, 3));
  g.setAttribute("uv", new T.Float32BufferAttribute(uv, 2));
  g.setAttribute("regionalUv", new T.Float32BufferAttribute(regional, 2));
  g.setAttribute("localUv", new T.Float32BufferAttribute(local, 2));
  g.setIndex(indices);
  g.computeVertexNormals();
  function cell(axis: number[], p: number) {
    let from = 0,
      to = axis.length - 1;
    while (to - from > 1) {
      const mid = (from + to) >>> 1;
      if (p < axis[mid]!) to = mid;
      else from = mid;
    }
    return from;
  }
  function meshHeight(x: number, z: number) {
    if (x >= pw && x <= pe && z >= pn && z <= ps) return siteHeight(x, z, wide, detail, pad);
    const i = cell(xs, x),
      j = cell(zs, z);
    const fraction = (p: number, low: number, high: number) =>
      Math.max(0, Math.min(1, (p - low) / (high - low)));
    const u = fraction(x, xs[i]!, xs[i + 1]!),
      v = fraction(z, zs[j]!, zs[j + 1]!);
    const nw = j * xs.length + i,
      sw = nw + xs.length;
    const a = pos[nw * 3 + 1]!,
      b = pos[(nw + 1) * 3 + 1]!;
    const c = pos[sw * 3 + 1]!,
      d = pos[(sw + 1) * 3 + 1]!;
    return u + v <= 1
      ? a * (1 - u - v) + b * u + c * v
      : d * (u + v - 1) + b * (1 - v) + c * (1 - u);
  }
  return { geometry: g, meshHeight };
}
function landMaterial(
  wide: Layer,
  detail: Layer | null,
  nearby: Mosaic | null,
  adjusted: boolean,
  local: T.Texture,
  observed: T.Texture,
  padWidth: number,
  localWidth: number,
) {
  const mat = new T.MeshStandardMaterial({ map: wide.texture, roughness: 0.98, metalness: 0 });
  const b = (detail ?? wide).meta.bounds,
    nb = (nearby ?? detail ?? wide).meta.bounds;
  const nwidth = nb[2] - nb[0],
    nheight = nb[3] - nb[1];
  mat.onBeforeCompile = (shader) => {
    shader.uniforms["caSampleOffset"] = {
      value: new T.Vector2(
        adjusted ? opticalAlignment.east : 0,
        adjusted ? -opticalAlignment.south : 0,
      ),
    };
    shader.uniforms["caNearby"] = { value: (nearby ?? detail ?? wide).texture };
    shader.uniforms["caNearSpan"] = { value: new T.Vector2(nwidth, nheight) };
    shader.uniforms["caNearUv"] = {
      value: new T.Vector4(
        (b[0] - nb[0]) / nwidth,
        (nb[3] - b[3]) / nheight,
        (b[2] - b[0]) / nwidth,
        (b[3] - b[1]) / nheight,
      ),
    };
    shader.uniforms["caDetail"] = { value: (detail ?? wide).texture };
    shader.uniforms["caLocal"] = { value: local };
    shader.uniforms["caObserved"] = { value: observed };
    shader.uniforms["caMetres"] = { value: new T.Vector2(b[2] - b[0], b[3] - b[1]) };
    shader.uniforms["caLocalSize"] = { value: new T.Vector2(padWidth, localWidth) };
    shader.vertexShader = shader.vertexShader
      .replace(
        "#include <common>",
        "#include <common>\nattribute vec2 regionalUv; attribute vec2 localUv; varying vec2 vRegional; varying vec2 vLocal;",
      )
      .replace(
        "#include <uv_vertex>",
        "#include <uv_vertex>\nvRegional=regionalUv; vLocal=localUv;",
      );
    shader.fragmentShader = shader.fragmentShader
      .replace(
        "#include <common>",
        "#include <common>\nvarying vec2 vRegional; varying vec2 vLocal; uniform vec2 caSampleOffset; uniform sampler2D caNearby; uniform vec2 caNearSpan; uniform vec4 caNearUv; uniform sampler2D caDetail; uniform sampler2D caLocal; uniform sampler2D caObserved; uniform vec2 caMetres; uniform vec2 caLocalSize;",
      )
      .replace(
        "#include <map_fragment>",
        `#include <map_fragment>
        float localWeight=1.-smoothstep(${opticalAlignment.fullRadius}.,${opticalAlignment.outerRadius}.,length((vLocal-.5)*caLocalSize.y));
        vec2 offset=caSampleOffset*localWeight;
        vec2 detailUv=vRegional+offset/caMetres;
        vec2 edge=min(detailUv,1.-detailUv)*caMetres;
        float blend=smoothstep(0.,400.,min(edge.x,edge.y));
        diffuseColor.rgb=mix(diffuseColor.rgb,texture2D(caDetail,detailUv).rgb,blend);
        vec2 nearUv=caNearUv.xy+vRegional*caNearUv.zw+offset/caNearSpan;
        vec2 nearBorder=min(nearUv,1.-nearUv)*caNearSpan;
        float nearMix=smoothstep(0.,125.,min(nearBorder.x,nearBorder.y));
        diffuseColor.rgb=mix(diffuseColor.rgb,texture2D(caNearby,nearUv).rgb,nearMix);
        vec2 fromPad=abs(vLocal-.5)*caLocalSize.y-caLocalSize.x*.5;
        float localBlend=1.-smoothstep(0.,90.,max(fromPad.x,fromPad.y));
        diffuseColor.rgb=mix(diffuseColor.rgb,texture2D(caLocal,vLocal).rgb,localBlend*texture2D(caObserved,vLocal).b);`,
      );
  };
  return mat;
}
/** The background never extends the area used by orbit, walking, search or selection. */
export function regionalHorizon(
  unit: Extent,
  local: T.Texture,
  observed: T.Texture,
  useBackdrop: (texture: T.Texture, bounds: GridBounds, adjusted: boolean) => void,
  pad: GridBounds,
  localWidth: number,
  anisotropy: number,
  invalidate: () => void,
  onVisible: (v: boolean, h: (x: number, z: number) => number) => void,
) {
  const root = new T.Group(),
    controller = new AbortController(),
    layers: Mosaic[] = [];
  let active = false,
    disposed = false;
  let heightAt: (x: number, z: number) => number = () => 0;
  const info: HorizonInfo = { state: "idle", bounds: unit, attribution: "", labels: [] };
  function show() {
    root.visible = active && info.state === "ready";
    onVisible(root.visible, heightAt);
    invalidate();
  }
  async function enable() {
    info.state = "loading";
    try {
      const res = await fetch(base + "manifest.json", { signal: controller.signal });
      if (!res.ok) throw new Error("Manifesto regional indisponível.");
      const m: HorizonManifest = await res.json();
      const wide = await loadGrid(m, controller.signal, anisotropy);
      layers.push(wide);
      // A damaged high-resolution raster can be replaced independently of the municipality DEM.
      let detail: Layer | null = null;
      if (m.detail) {
        try {
          detail = await loadGrid(m.detail, controller.signal, anisotropy);
          layers.push(detail);
        } catch {
          if (controller.signal.aborted) return;
        }
      }
      let nearby: Mosaic | null = null;
      if (m.nearby) {
        try {
          nearby = await loadImage(m.nearby, controller.signal, anisotropy);
          layers.push(nearby);
        } catch {
          if (controller.signal.aborted) return;
        }
      }
      if (disposed) return;
      const { geometry: geo, meshHeight } = demGeometry(wide, detail, pad, localWidth);
      heightAt = meshHeight;
      const inner = nearby ?? detail ?? wide;
      const adjusted = Boolean(m.nearby && (nearby || detail));
      useBackdrop(inner.texture, inner.meta.bounds, adjusted);
      const land = new T.Mesh(
        geo,
        landMaterial(wide, detail, nearby, adjusted, local, observed, pad[2] - pad[0], localWidth),
      );
      land.name = "Horizonte topográfico de Cruz Alta";
      land.receiveShadow = true;
      root.add(land);
      geo.computeBoundingBox();
      const [west, north, east, south] = m.bounds;
      info.bounds = { west, north, east, south, top: geo.boundingBox!.max.y };
      info.attribution = m.attribution.join(" · ");
      void urbanSilhouette(controller.signal, heightAt)
        .then((city) => {
          if (disposed) {
            city.geometry.dispose();
            city.material.dispose();
            return;
          }
          root.add(city);
          invalidate();
        })
        .catch(() => {});
      info.state = "ready";
    } catch {
      if (!disposed) info.state = "failed";
    }
    if (!disposed) show();
  }
  const controls: HorizonControls = {
    setRegion(value) {
      active = value;
      if (value && (info.state === "idle" || info.state === "failed")) void enable();
      show();
    },
    regionInfo: () => info,
    updateRegion() {
      /* Distance tiers are fixed to the constrained factory viewpoint. */
    },
  };
  return {
    root,
    ...controls,
    dispose() {
      disposed = true;
      controller.abort();
      for (const l of layers) {
        l.texture.dispose();
        l.pixels.close();
      }
      layers.length = 0;
    },
  };
}
