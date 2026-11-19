import * as T from "three";
import { opticalAlignment } from "./optical-alignment";
import {
  groundPatches,
  yardPatches,
  railwayYard,
  finishLines,
  type GroundCover,
  type GroundPatch,
} from "./terrain-surfaces";
import type { CruzArea, CruzPart, GroundPoint } from "./scene-types";
import {
  groundDetail,
  groundGrain,
  groundTileSize,
  metricGroundPath,
  paintGroundWear,
  surfaceClasses,
} from "./ground-detail";
import { localBreaklines, railwayAxes, railBedHalfWidth } from "./site-ground";
import type { GridBounds } from "./regional-grid";

const land: Record<GroundCover, [string, number]> = {
  campo: ["#788257", 0.95],
  lavoura: ["#92906a", 0.95],
  solo: ["#9a7258", 0.97],
  saibro: ["#897864", 0.94],
  concretoDique: ["#dcdedd", 0.88],
  pisoMineral: ["#928878", 0.88],
  concreto: ["#bcb9af", 0.74],
  asfalto: ["#62615d", 0.81],
  lastro: ["#746f65", 0.98],
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
function sampler(image: HTMLCanvasElement) {
  const tex = new T.CanvasTexture(image);
  tex.anisotropy = 8;
  return tex;
}

export function groundSkin(
  areas: CruzArea[],
  parts: CruzPart[],
  cx: number,
  cz: number,
  span: number,
  maxAnisotropy: number,
  invalidate: () => void,
  contacts: ReadonlyArray<{ x: number; z: number; radius: number }>,
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
  mask.fillStyle = "rgb(113,191,12)";
  mask.fillRect(0, 0, 512, 512);
  mask.scale(0.25, 0.25);
  function path(footprint: GroundPoint[], soft: boolean) {
    const p = metricGroundPath(footprint, soft, true);
    const projected = new Path2D();
    projected.addPath(p, new DOMMatrix([scale, 0, 0, scale, u(0), v(0)]));
    projected.closePath();
    return projected;
  }
  function cover(patch: GroundPatch) {
    const { surface: kind, footprint, soft = false } = patch;
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
    const aging = {
      campo: 130,
      lavoura: 105,
      urbano: 90,
      mata: 130,
      agua: 0,
      asfalto: 104,
      lastro: 174,
      solo: 244,
      concreto: 63,
      saibro: 190,
      pisoMineral: 184,
      concretoDique: 42,
    }[kind];
    mask.fillStyle = `rgb(${aging},${grey},${interpretado})`;
    mask.fill(area);
    // The same wear layout is painted at the panoramic and at the local resolution.
    ink.save();
    ink.clip(area);
    ink.transform(scale, 0, 0, scale, u(0), v(0));
    paintGroundWear(ink, patch, [cx - width / 2, cz - width / 2, cx + width / 2, cz + width / 2]);
    ink.restore();
  }
  const patchesFor = (kinds: CruzArea["kind"][]): GroundPatch[] =>
    kinds.flatMap((kind) =>
      areas
        .filter((a) => a.kind === kind)
        .map((a) => ({
          surface: key[kind],
          footprint: a.footprint,
          soft: kind === "vegetacao" || kind === "agua",
        })),
    );
  // Network and hard limits own their seam; the clay and yard masks sit under them.
  const patches = [
    ...groundPatches.filter((p) => !["asfalto", "concreto", "concretoDique"].includes(p.surface)),
    ...patchesFor(["vizinhanca", "patio"]),
    ...yardPatches,
    railwayYard,
    ...patchesFor(["vegetacao", "agua"]),
    ...groundPatches.filter((p) => ["asfalto", "concreto", "concretoDique"].includes(p.surface)),
    ...patchesFor(["via", "ferrovia"]),
  ];
  for (const patch of patches) cover(patch);
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
      ink.shadowColor = "rgba(41,34,25,.21)";
      ink.shadowBlur = 2.6 * scale;
      ink.lineWidth = 0.85 * scale;
      ink.strokeStyle = "rgba(70,55,40,.11)";
      ink.stroke(p);
      ink.restore();
    }
  for (const { x, z, radius } of contacts) {
    const px = u(x),
      py = v(z),
      r = Math.max(radius * 0.66, 0.8) * scale;
    if (px < r || px > size - r || py < r || py > size - r) continue;
    const shade = ink.createRadialGradient(px, py, 0, px, py, r);
    shade.addColorStop(0, "rgba(36,31,22,.16)");
    shade.addColorStop(1, "rgba(36,31,22,0)");
    ink.fillStyle = shade;
    ink.fillRect(px - r, py - r, 2 * r, 2 * r);
  }
  const map = sampler(atlas);
  map.colorSpace = T.SRGBColorSpace;
  const rough = sampler(surface),
    micro = groundGrain(rng);
  const padWidth = span + 36,
    half = padWidth / 2;
  const pad: GridBounds = [cx - half, cz - half, cx + half, cz + half];
  const local = groundDetail(
    pad,
    patches.filter(({ surface }) => surface !== "lastro"),
    land,
    maxAnisotropy,
    invalidate,
  );
  const ground = new T.MeshStandardMaterial({
    map,
    roughnessMap: rough,
    roughness: 1,
    metalness: 0,
    bumpMap: micro,
    bumpScale: 0.015,
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
    backdropUv.value.set((cx - w) / (e - w), 1 - (cz - n) / (s - n), 1 / (e - w), 1 / (s - n));
  }
  ground.onBeforeCompile = (shader) => {
    shader.uniforms["caGrain"] = { value: micro };
    shader.uniforms["caRegionMap"] = backdrop;
    shader.uniforms["caRegionOpacity"] = backdropAmount;
    shader.uniforms["caRegionMatrix"] = backdropUv;
    shader.uniforms["caSampleOffset"] = sampleOffset;
    shader.uniforms["caObserved"] = { value: rough };
    shader.uniforms["caSectorMask"] = local.sampler;
    shader.uniforms["caSectorStrength"] = local.strengths;
    shader.uniforms["caTileSize"] = local.tileSize;
    shader.uniforms["caGroundCenter"] = { value: new T.Vector2(cx, cz) };
    shader.uniforms["caGroundRoughness"] = { value: surfaceClasses.map((kind) => land[kind][1]) };
    shader.uniforms["caRailAxis"] = {
      value: railwayAxes.map(({ from, to }) => new T.Vector4(...from, ...to)),
    };
    shader.uniforms["caBallastAlbedo"] = { value: new T.Color(land.lastro[0]) };
    shader.vertexShader = shader.vertexShader
      .replace("#include <common>", "#include <common>\nvarying vec2 vCaMetres;")
      .replace("#include <uv_vertex>", "#include <uv_vertex>\nvCaMetres = position.xy;");
    shader.fragmentShader = shader.fragmentShader
      .replace(
        "#include <common>",
        `#include <common>
        uniform vec2 caSampleOffset;
        uniform sampler2D caGrain, caObserved, caRegionMap;
        uniform highp sampler2DArray caSectorMask;
        uniform vec4 caRegionMatrix, caTileSize;
        uniform vec2 caGroundCenter;
        uniform vec4 caRailAxis[2];
        uniform vec3 caBallastAlbedo;
        uniform float caGroundRoughness[12];
        uniform float caRegionOpacity, caSectorStrength[9];
        varying vec2 vCaMetres;
        // Repeat length in metres, relief strength, packed field and albedo contrast.
        vec4 caProfile(int k) {
          if (k == 4 || k == 6) return vec4(.70, .035, 3., .21);
          if (k == 7) return vec4(1.06, .072, 0., .52);
          if (k == 8) return vec4(4.14, .185, 1., .97);
          if (k == 5) return vec4(1.88, .080, 1., .64);
          if (k == 3) return vec4(2.35, .065, 2., .64);
          if (k == 2) return vec4(2.95, .082, 2., .76);
          if (k == 10) return vec4(2., 0., 0., 0.);
          return vec4(4.90, .055, 2., .61);
        }
        float caRelief(vec4 value, float channel) {
          if (channel < .5) return value.r;
          if (channel < 1.5) return value.g;
          if (channel < 2.5) return value.b;
          return value.a;
        }
        float caRailDistance(vec2 p, vec4 axis) {
          vec2 d = axis.zw - axis.xy;
          return length(p - axis.xy - d * clamp(dot(p - axis.xy, d) / dot(d, d), 0., 1.));
        }`,
      )
      .replace(
        "#include <map_fragment>",
        `#include <map_fragment>
      float localWeight=1.-smoothstep(${opticalAlignment.fullRadius}.,${opticalAlignment.outerRadius}.,length(vCaMetres));
      vec2 geoUv=caRegionMatrix.xy+(vCaMetres+caSampleOffset*localWeight)*caRegionMatrix.zw;
      vec3 caCover=texture2D(caObserved,vMapUv).rgb;
      float observedGround=caCover.b;
      diffuseColor.rgb=mix(diffuseColor.rgb,texture2D(caRegionMap,geoUv).rgb,caRegionOpacity*(1.-observedGround));
      vec2 caRot = mat2(.872,-.489,.489,.872)*vCaMetres;
      float caMid = texture2D(caGrain, caRot/21.8).b - .487;
      float caFar = texture2D(caGrain, vCaMetres/137.5).b - .487;
      vec2 caWorld = caGroundCenter + vCaMetres * vec2(1., -1.);
      vec2 caGridUv = (caWorld - caTileSize.xy) / caTileSize.zw;
      ivec2 caTile = ivec2(clamp(floor(caGridUv), 0., 2.));
      int caIndex = caTile.y * 3 + caTile.x;
      float caDistance = length(vViewPosition);
      float caInGrid = float(all(greaterThanEqual(caGridUv, vec2(0.))) && all(lessThan(caGridUv, vec2(3.))));
      float caGain = caSectorStrength[caIndex] * caInGrid * (1. - smoothstep(38., 97., caDistance));
      int caClass = 3;
      float caRailDist = min(caRailDistance(caWorld, caRailAxis[0]), caRailDistance(caWorld, caRailAxis[1]));
      float caRailAA = min(.55, fwidth(caRailDist) * .55);
      float caTrack = 1. - smoothstep(.90 - caRailAA, ${railBedHalfWidth} + caRailAA, caRailDist);
      vec2 caGridDx = dFdx(caGridUv), caGridDy = dFdy(caGridUv);
      if (caGain > .001) {
        vec2 st = fract(caGridUv);
        ivec2 samplePoint = ivec2(st * ${groundTileSize}.);
        caClass = int(round(texelFetch(caSectorMask, ivec3(samplePoint, caIndex), 0).a * 12.75));
        vec3 caInk = textureGrad(caSectorMask, vec3(st, float(caIndex)), caGridDx, caGridDy).rgb;
        diffuseColor.rgb = mix(diffuseColor.rgb, mix(caInk, caBallastAlbedo, caTrack), caGain * .93);
      }
      vec4 caMaterial = caProfile(caClass);
      vec4 caSurface = mix(vec4(2.4, .035, 2., .18), mix(caMaterial, caProfile(8), caTrack), caGain);
      // Two differently rotated samplings break recurrence without redistributing tracked marks.
      vec2 caFineUv = caRot / caSurface.x + vec2(caMid * .44, caFar * .18);
      vec4 caSample = texture2D(caGrain, caFineUv);
      float caFine = mix(caRelief(caSample, caMaterial.z), caSample.g, caTrack * caGain);
      float caMean = mix(caClass == 4 || caClass == 6 ? .64 : .48, .53, caTrack * caGain);
      float caAggregate = (caFine - caMean) * caSurface.w;
      float caWear = mix(.18, .91, caCover.r);
      float caMottle = (caMid * .67 + caFar * .57) * caWear;
      diffuseColor.rgb *= vec3(1. + caAggregate + caMottle);
      `,
      )
      .replace(
        "#include <roughnessmap_fragment>",
        `#include <roughnessmap_fragment>
        roughnessFactor = clamp(mix(roughnessFactor, mix(caGroundRoughness[caClass], caGroundRoughness[8], caTrack), caGain) + (caMid * .37 - (caFine - .5) * .23) * caGain, .45, 1.);`,
      )
      .replace(
        "#include <normal_fragment_maps>",
        `vec2 caUvDx = dFdx(caFineUv), caUvDy = dFdy(caFineUv);
        if (caDistance < 135.) {
          float caChannel = caMaterial.z;
          vec4 caShiftX = textureGrad(caGrain, caFineUv + caUvDx, caUvDx, caUvDy);
          vec4 caShiftY = textureGrad(caGrain, caFineUv + caUvDy, caUvDx, caUvDy);
          vec2 caBump = mix(vec2(caRelief(caShiftX, caChannel), caRelief(caShiftY, caChannel)), vec2(caShiftX.g, caShiftY.g), caTrack * caGain) - caFine;
          normal = perturbNormalArb(-vViewPosition, normal, caBump * caSurface.y * (1. - smoothstep(90., 135., caDistance)), faceDirection);
        }`,
      );
  };

  function floor(full: number, outer = false) {
    const d = full / 2;
    const square = (r: number) => [
      new T.Vector2(-r, -r),
      new T.Vector2(r, -r),
      new T.Vector2(r, r),
      new T.Vector2(-r, r),
    ];
    const contour = square(d);
    const holes = outer
      ? [square(half)]
      : localBreaklines.map(({ edge }) => edge.map(([x, z]) => new T.Vector2(x - cx, cz - z)));
    const points = contour.concat(holes.flat());
    const position: number[] = [],
      uv: number[] = [];
    function triangle([ax, ay, ah]: number[], [bx, by, bh]: number[], [cx, cy, ch]: number[]) {
      const vertices =
        (bx! - ax!) * (cy! - ay!) < (by! - ay!) * (cx! - ax!)
          ? [
              [ax!, ay!, ah!],
              [cx!, cy!, ch!],
              [bx!, by!, bh!],
            ]
          : [
              [ax!, ay!, ah!],
              [bx!, by!, bh!],
              [cx!, cy!, ch!],
            ];
      for (const [x, y, h] of vertices) {
        position.push(x!, y!, h!);
        uv.push(x! / width + 0.5, y! / width + 0.5);
      }
    }
    for (const face of T.ShapeUtils.triangulateShape(contour, holes)) {
      const [a, b, c] = face.map((i) => points[i]!.toArray());
      triangle([...a!, 0], [...b!, 0], [...c!, 0]);
    }
    if (!outer)
      for (const patch of localBreaklines)
        for (const [a, b, c] of patch.triangles) {
          const convert = ([x, z, h]: typeof a) => [x - cx, cz - z, h];
          triangle(convert(a), convert(b), convert(c));
        }
    const geo = new T.BufferGeometry();
    geo.setAttribute("position", new T.Float32BufferAttribute(position, 3));
    geo.setAttribute("uv", new T.Float32BufferAttribute(uv, 2));
    geo.computeVertexNormals();
    const m = new T.Mesh(geo, ground);
    m.rotation.x = -Math.PI / 2;
    m.position.set(cx, 0, cz);
    m.receiveShadow = true;
    return m;
  }
  return {
    plate: floor(span * 12, true),
    padPlate: floor(padWidth),
    map,
    rough,
    useBackdrop,
    setBackdropVisible: (visible: boolean) => {
      backdropAmount.value = visible ? 1 : 0;
    },
    pad,
    width,
    textures: [map, rough, micro],
    local,
  };
}
