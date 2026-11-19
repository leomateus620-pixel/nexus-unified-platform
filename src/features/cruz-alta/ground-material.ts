import * as T from "three";
import { opticalAlignment } from "./optical-alignment";
import {
  groundPatches,
  yardPatches,
  finishLines,
  type GroundCover,
  type GroundPatch,
} from "./terrain-surfaces";
import type { CruzArea, CruzPart, GroundPoint } from "./scene-types";
import { extent } from "./spatial";

const land: Record<GroundCover, [string, number]> = {
  campo: ["#788257", 0.95],
  lavoura: ["#92906a", 0.95],
  solo: ["#946548", 0.97],
  saibro: ["#9d8b78", 0.94],
  concretoDique: ["#dcdedd", 0.88],
  pisoMineral: ["#afa28f", 0.92],
  concreto: ["#c1bab0", 0.88],
  asfalto: ["#686864", 0.94],
  lastro: ["#777067", 0.98],
  mata: ["#364d36", 0.96],
  agua: ["#536f69", 0.4],
  urbano: ["#a69b88", 0.91],
};
const key: Record<CruzArea["kind"], GroundCover> = {
  via: "asfalto",
  ferrovia: "lastro",
  vegetacao: "mata",
  agua: "agua",
  patio: "saibro",
  vizinhanca: "saibro",
};
export function randomSequence(seed: number) {
  return () => {
    seed = (Math.imul(seed, 1664525) + 1013904223) >>> 0;
    return seed / 4294967296;
  };
}
function canvas(size: number) {
  const el = document.createElement("canvas");
  el.width = el.height = size;
  return el;
}
function sampler(image: HTMLCanvasElement, repeat = false) {
  const tex = new T.CanvasTexture(image);
  tex.anisotropy = 8;
  if (repeat) tex.wrapS = tex.wrapT = T.RepeatWrapping;
  return tex;
}

export function groundSkin(
  areas: CruzArea[],
  parts: CruzPart[],
  cx: number,
  cz: number,
  span: number,
) {
  const width = 1520,
    size = 2048,
    scale = size / width;
  const atlas = canvas(size),
    surface = canvas(512);
  const ink = atlas.getContext("2d")!,
    mask = surface.getContext("2d")!;
  const rng = randomSequence(80624);
  const u = (x: number) => (x - cx + width / 2) * scale,
    v = (z: number) => (z - cz + width / 2) * scale;
  ink.fillStyle = land.campo[0];
  ink.fillRect(0, 0, size, size);
  mask.fillStyle = "rgb(191,191,12)";
  mask.fillRect(0, 0, 512, 512);
  mask.scale(0.25, 0.25);
  function path(footprint: GroundPoint[], soft: boolean) {
    const p = new Path2D();
    for (let i = 0; i < footprint.length; i++) {
      const a = footprint[i]!,
        b = footprint[(i + 1) % footprint.length]!;
      if (!i) p.moveTo(u(a[0]), v(a[1]));
      const dx = b[0] - a[0],
        dz = b[1] - a[1],
        length = Math.hypot(dx, dz);
      // Small undulations belong only to unpaved breaks visible in the aerial record.
      const steps = soft ? Math.max(1, Math.ceil(length / 2.7)) : 1;
      for (let j = 1; j <= steps; j++) {
        const t = j / steps,
          offset = j === steps ? 0 : (rng() - 0.5) * 0.9;
        p.lineTo(
          u(a[0] + t * dx - (offset * dz) / length),
          v(a[1] + t * dz + (offset * dx) / length),
        );
      }
    }
    p.closePath();
    return p;
  }
  function cover({ surface: kind, footprint, soft = false }: GroundPatch) {
    if (footprint.length < 3) return;
    const area = path(footprint, soft);
    ink.fillStyle = land[kind][0];
    ink.fill(area);
    const grey = Math.round(255 * land[kind][1]);
    const interpretado = {
      campo: 36,
      lavoura: 22,
      urbano: 12,
      mata: 67,
      agua: 105,
      asfalto: 220,
      lastro: 245,
      solo: 218,
      concreto: 250,
      saibro: 238,
      pisoMineral: 244,
      concretoDique: 255,
    }[kind];
    mask.fillStyle = `rgb(${grey},${grey},${interpretado})`;
    mask.fill(area);
    // Broad changes follow the footprint. A nonrepeating atlas keeps field boundaries stable at all zooms.
    const e = extent(footprint);
    ink.save();
    ink.clip(area);
    const count = Math.min(220, Math.ceil(((e.east - e.west) * (e.south - e.north)) / 135));
    const grass = kind === "mata" || kind === "campo" || kind === "lavoura";
    for (let i = 0; i < count; i++) {
      const x = u(e.west + (e.east - e.west) * rng()),
        y = v(e.north + (e.south - e.north) * rng());
      const radius = (grass ? 6 + rng() * 26 : 3 + rng() * 13) * scale;
      const g = ink.createRadialGradient(x, y, 0, x, y, radius);
      const alpha = grass ? 0.16 : 0.1,
        tone = rng() > 0.5 ? "242,226,196" : "46,46,35";
      g.addColorStop(0, `rgba(${tone},${alpha})`);
      g.addColorStop(1, `rgba(${tone},0)`);
      ink.fillStyle = g;
      ink.fillRect(x - radius, y - radius, 2 * radius, 2 * radius);
    }
    ink.restore();
  }
  for (const patch of groundPatches) cover(patch);
  // Deposit traffic areas before verges, paths and ballast so visible edge ownership is deterministic.
  for (const kind of ["vizinhanca", "patio", "vegetacao", "agua", "via", "ferrovia"] as const) {
    for (const a of areas.filter((a) => a.kind === kind))
      cover({
        surface: key[kind],
        footprint: a.footprint,
        soft: kind === "vegetacao" || kind === "agua",
      });
  }
  for (const patch of yardPatches) cover(patch);
  for (const line of finishLines) {
    const first = line.points[0]!;
    ink.beginPath();
    ink.moveTo(u(first[0]), v(first[1]));
    for (const [x, z] of line.points.slice(1)) ink.lineTo(u(x), v(z));
    ink.lineJoin = "round";
    ink.lineCap = "round";
    ink.strokeStyle =
      line.type === "giro"
        ? "rgba(203,181,151,.46)"
        : line.type === "dique"
          ? "rgba(120,111,99,.79)"
          : "rgba(121,104,85,.48)";
    ink.lineWidth = (line.type === "giro" ? 0.44 : line.type === "dique" ? 0.31 : 0.22) * scale;
    ink.stroke();
  }
  // Bake short-range ambient contact at the base rather than a second coplanar mesh or directional shadow.
  for (const part of parts)
    if ((part.base ?? 0) < 0.3) {
      const p = path(part.footprint, false);
      ink.save();
      ink.shadowColor = "rgba(41,34,25,.33)";
      ink.shadowBlur = 2.6 * scale;
      ink.lineWidth = 0.85 * scale;
      ink.strokeStyle = "rgba(70,55,40,.18)";
      ink.stroke(p);
      ink.restore();
    }
  const gr = canvas(256),
    grain = gr.getContext("2d")!,
    pixels = grain.createImageData(256, 256);
  for (let i = 0; i < pixels.data.length; i += 4) {
    const a = rng(),
      b = rng();
    const val = Math.round(132 + (a + b - 1) * 54 + (a < 0.032 ? -28 : 0));
    pixels.data[i] = val;
    pixels.data[i + 1] = val;
    pixels.data[i + 2] = val;
    pixels.data[i + 3] = 255;
  }
  grain.putImageData(pixels, 0, 0);
  const map = sampler(atlas);
  map.colorSpace = T.SRGBColorSpace;
  const rough = sampler(surface),
    micro = sampler(gr, true);
  // 1.60 m per tile, approx. 6 mm per texel. The independent larger-scale samples break repetition.
  const bump = micro.clone();
  bump.repeat.set(width / 1.6, width / 1.6);
  const ground = new T.MeshStandardMaterial({
    map,
    roughnessMap: rough,
    roughness: 1,
    metalness: 0,
    bumpMap: bump,
    bumpScale: 0.012,
  });
  const backdrop = { value: map as T.Texture },
    backdropAmount = { value: 0 };
  const sampleOffset = { value: new T.Vector2() };
  const backdropUv = { value: new T.Vector4() };
  function useBackdrop(
    texture: T.Texture,
    bounds: [number, number, number, number],
    adjusted: boolean,
  ) {
    const [w, n, e, s] = bounds;
    sampleOffset.value.set(
      adjusted ? opticalAlignment.east : 0,
      adjusted ? -opticalAlignment.south : 0,
    );
    backdrop.value = texture;
    backdropAmount.value = 1;
    backdropUv.value.set((cx - w) / (e - w), 1 - (cz - n) / (s - n), 1 / (e - w), 1 / (s - n));
  }
  ground.onBeforeCompile = (shader) => {
    shader.uniforms["caGrain"] = { value: micro };
    shader.uniforms["caRegionMap"] = backdrop;
    shader.uniforms["caRegionOpacity"] = backdropAmount;
    shader.uniforms["caRegionMatrix"] = backdropUv;
    shader.uniforms["caSampleOffset"] = sampleOffset;
    shader.uniforms["caObserved"] = { value: rough };
    shader.vertexShader = shader.vertexShader
      .replace("#include <common>", "#include <common>\nvarying vec2 vCaMetres;")
      .replace("#include <uv_vertex>", "#include <uv_vertex>\nvCaMetres = position.xy;");
    shader.fragmentShader = shader.fragmentShader
      .replace(
        "#include <common>",
        "#include <common>\nuniform vec2 caSampleOffset; uniform sampler2D caGrain; uniform sampler2D caObserved; uniform sampler2D caRegionMap; uniform vec4 caRegionMatrix; uniform float caRegionOpacity; varying vec2 vCaMetres;",
      )
      .replace(
        "#include <map_fragment>",
        `#include <map_fragment>
      float localWeight=1.-smoothstep(${opticalAlignment.fullRadius}.,${opticalAlignment.outerRadius}.,length(vCaMetres));
      vec2 geoUv=caRegionMatrix.xy+(vCaMetres+caSampleOffset*localWeight)*caRegionMatrix.zw;
      float observedGround=texture2D(caObserved,vMapUv).b;
      diffuseColor.rgb=mix(diffuseColor.rgb,texture2D(caRegionMap,geoUv).rgb,caRegionOpacity*(1.-observedGround));
      float caFine = texture2D(caGrain, vCaMetres/1.6).r - .52;
      vec2 caRot = mat2(.872,-.489,.489,.872)*vCaMetres;
      float caMid = texture2D(caGrain, caRot/18.5).r - .52;
      float caFar = texture2D(caGrain, vCaMetres/122.0).r - .52;
      diffuseColor.rgb *= 1.0 + caFine*.68 + caMid*.25 + caFar*.13;
      `,
      );
  };

  function floor(full: number) {
    const geo = new T.PlaneGeometry(full, full);
    const uv = geo.attributes["uv"]!;
    for (let i = 0; i < uv.count; i++)
      uv.setXY(
        i,
        ((uv.getX(i) - 0.5) * full) / width + 0.5,
        ((uv.getY(i) - 0.5) * full) / width + 0.5,
      );
    const m = new T.Mesh(geo, ground);
    m.rotation.x = -Math.PI / 2;
    m.position.set(cx, -0.005, cz);
    m.receiveShadow = true;
    return m;
  }
  const padWidth = span + 36,
    half = padWidth / 2;
  const pad: [number, number, number, number] = [cx - half, cz - half, cx + half, cz + half];
  return {
    plate: floor(span * 12),
    padPlate: floor(padWidth),
    map,
    rough,
    useBackdrop,
    pad,
    width,
    textures: [map, rough, micro, bump],
  };
}
