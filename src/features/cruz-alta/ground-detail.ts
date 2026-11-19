import * as T from "three";
import { finishLines, type GroundCover, type GroundPatch } from "./terrain-surfaces";
import type { GroundPoint } from "./scene-types";
import type { GridBounds } from "./regional-grid";

export const surfaceClasses: GroundCover[] = [
  "campo",
  "lavoura",
  "solo",
  "saibro",
  "concretoDique",
  "pisoMineral",
  "concreto",
  "asfalto",
  "lastro",
  "mata",
  "agua",
  "urbano",
];

const columns = 3;
const rows = 3;
export const groundTileSize = 512;

export function metricGroundPath(points: GroundPoint[], soft = false, closed = false) {
  const path = new Path2D();
  const vertices = closed ? [...points, points[0]!] : points;
  vertices.forEach(([x, z], i) => {
    if (i === 0) {
      path.moveTo(x, z);
      return;
    }
    const [px, pz] = points[i - 1]!;
    const dx = x - px,
      dz = z - pz,
      length = Math.hypot(dx, dz);
    if (soft && length > 1.5) {
      const steps = Math.ceil(length / 1.35);
      for (let j = 1; j < steps; j++) {
        const t = j / steps,
          offset = Math.sin(px * 8.219 + pz * 5.993 + j * 9.119) * 0.44;
        path.lineTo(px + dx * t - (dz / length) * offset, pz + dz * t + (dx / length) * offset);
      }
    }
    path.lineTo(x, z);
  });
  if (closed) path.closePath();
  return path;
}

type Wear = { tones: string[]; intensity: number; width: [number, number]; aspect: number };
// Tonal classes interpreted from the A1, DJI 0044 and video. Individual spots are procedural.
const wear: Partial<Record<GroundCover, Wear>> = {
  solo: {
    tones: ["100,54,36", "188,136,88", "124,80,53"],
    intensity: 0.32,
    width: [1.5, 8],
    aspect: 1.65,
  },
  saibro: {
    tones: ["105,89,75", "168,140,107", "91,80,69"],
    intensity: 0.29,
    width: [1.2, 7],
    aspect: 2.05,
  },
  pisoMineral: {
    tones: ["100,89,75", "174,156,125", "122,113,100"],
    intensity: 0.28,
    width: [1.3, 8],
    aspect: 2.3,
  },
  asfalto: {
    tones: ["58,54,49", "131,119,104", "81,74,68"],
    intensity: 0.27,
    width: [0.9, 6],
    aspect: 2.5,
  },
  concreto: {
    tones: ["105,105,98", "212,207,193", "145,129,106"],
    intensity: 0.28,
    width: [0.9, 5],
    aspect: 1.5,
  },
  concretoDique: {
    tones: ["117,114,102", "236,229,213", "174,161,144"],
    intensity: 0.23,
    width: [0.7, 4.2],
    aspect: 1.5,
  },
  lastro: {
    tones: ["68,62,55", "145,136,110", "107,97,83"],
    intensity: 0.24,
    width: [0.8, 4.5],
    aspect: 1.8,
  },
  mata: {
    tones: ["36,49,31", "95,101,51", "72,82,44"],
    intensity: 0.22,
    width: [2.5, 13],
    aspect: 1.5,
  },
  campo: {
    tones: ["69,84,39", "142,139,86", "95,103,56"],
    intensity: 0.27,
    width: [2.1, 19],
    aspect: 1.8,
  },
  lavoura: {
    tones: ["55,65,34", "151,140,89", "113,114,51"],
    intensity: 0.22,
    width: [5, 28],
    aspect: 1.8,
  },
};

type GroundMark = [
  x: number,
  z: number,
  width: number,
  aspect: number,
  angle: number,
  ink: string,
  alpha: number,
];
const marks = new WeakMap<GroundPatch, GroundMark[]>();

/** World-anchored tonality shared by the aerial map and the nearby sectors. */
export function paintGroundWear(
  ctx: CanvasRenderingContext2D,
  patch: GroundPatch,
  visible: GridBounds,
) {
  const style = wear[patch.surface];
  if (!style || patch.footprint.length < 3) return;
  let placed = marks.get(patch);
  if (!placed) {
    const xs = patch.footprint.map(([x]) => x),
      zs = patch.footprint.map(([, z]) => z);
    const west = Math.min(...xs),
      north = Math.min(...zs),
      width = Math.max(...xs) - west,
      depth = Math.max(...zs) - north;
    let seed = Math.round((west + 1000) * 6323 + (north + 1000) * 7703);
    const random = () => {
      seed = (Math.imul(seed, 1664525) + 1013904223) >>> 0;
      return seed / 4294967296;
    };
    const [min, max] = style.width;
    const count = Math.min(185, Math.max(6, Math.ceil((width * depth) / (max * 2.6))));
    placed = Array.from({ length: count }, () => [
      west + width * random(),
      north + depth * random(),
      min + (max - min) * random() ** 1.65,
      1 + (style.aspect - 1) * random(),
      random() * Math.PI,
      style.tones[Math.floor(random() * style.tones.length)]!,
      style.intensity * (0.42 + 0.75 * random()),
    ]);
    marks.set(patch, placed);
  }
  const [w, n, e, s] = visible;
  for (const [x, z, radius, aspect, angle, tone, alpha] of placed) {
    const envelope = radius * aspect;
    if (x + envelope < w || x - envelope > e || z + envelope < n || z - envelope > s) continue;
    ctx.save();
    ctx.translate(x, z);
    ctx.rotate(angle);
    ctx.scale(aspect, 1);
    const g = ctx.createRadialGradient(radius * 0.11, -radius * 0.1, radius * 0.1, 0, 0, radius);
    g.addColorStop(0, `rgba(${tone},${alpha})`);
    g.addColorStop(0.56, `rgba(${tone},${alpha * 0.43})`);
    g.addColorStop(1, `rgba(${tone},0)`);
    ctx.fillStyle = g;
    ctx.fillRect(-radius, -radius, radius * 2, radius * 2);
    ctx.restore();
  }
}

/** Packed linear relief: asphalt, angular ballast, compacted fines and concrete pores. */
export function groundGrain(random: () => number) {
  const size = 256;
  function field(cells: number) {
    const grid = Float32Array.from({ length: cells * cells }, random);
    const sample = (x: number, z: number) => grid[(z % cells) * cells + (x % cells)]!;
    const ease = (t: number) => t * t * (3 - 2 * t);
    return (px: number, pz: number) => {
      const u = (px * cells) / size,
        v = (pz * cells) / size;
      const x = Math.floor(u),
        z = Math.floor(v);
      const dx = ease(u - x),
        dz = ease(v - z);
      const north = sample(x, z) * (1 - dx) + sample(x + 1, z) * dx;
      const south = sample(x, z + 1) * (1 - dx) + sample(x + 1, z + 1) * dx;
      return north * (1 - dz) + south * dz;
    };
  }
  const grit = field(103),
    fines = field(48),
    compacted = field(21),
    dust = field(9);
  const cells = 53;
  const chips = Array.from(
    { length: cells * cells },
    () => [0.11 + random() * 0.78, 0.11 + random() * 0.78, random(), random() * 2 - 1] as const,
  );
  const bytes = new Uint8Array(size * size * 4);
  for (let z = 0; z < size; z++) {
    for (let x = 0; x < size; x++) {
      const index = (z * size + x) * 4;
      const u = (x * cells) / size,
        v = (z * cells) / size;
      const cx = Math.floor(u),
        cz = Math.floor(v);
      let first = Infinity,
        next = Infinity,
        height = 0,
        facet = 0;
      for (let nz = cz - 1; nz <= cz + 1; nz++)
        for (let nx = cx - 1; nx <= cx + 1; nx++) {
          const [sx, sz, h, tilt] = chips[((nz + cells) % cells) * cells + ((nx + cells) % cells)]!;
          const dx = u - nx - sx,
            dz = v - nz - sz;
          const d = dx * dx + dz * dz;
          if (d < first) {
            next = first;
            first = d;
            height = h;
            facet = tilt * dx + dz * 0.37;
          } else if (d < next) {
            next = d;
          }
        }
      const edge = Math.min(1, Math.max(0, (Math.sqrt(next) - Math.sqrt(first)) * 6));
      const speckle = random();
      const fine = fines(x, z),
        compact = compacted(x, z);
      bytes[index] = 122 + (grit(x, z) - 0.5) * 148 + (speckle - 0.5) * 49;
      bytes[index + 1] = Math.min(
        255,
        (47 + edge * (64 + height * 98 + facet * 46)) * (0.91 + fine * 0.15),
      );
      bytes[index + 2] = Math.max(
        0,
        Math.min(
          255,
          124 +
            (fine - 0.5) * 76 +
            (compact - 0.5) * 104 +
            (dust(x, z) - 0.5) * 81 +
            (speckle - 0.5) * 38,
        ),
      );
      bytes[index + 3] = speckle < 0.14 ? 58 + fine * 83 : 158 + compact * 59 + (fine - 0.5) * 42;
    }
  }
  const texture = new T.DataTexture(bytes, size, size);
  texture.wrapS = texture.wrapT = T.RepeatWrapping;
  texture.minFilter = T.LinearMipmapLinearFilter;
  texture.magFilter = T.LinearFilter;
  texture.generateMipmaps = true;
  texture.needsUpdate = true;
  return texture;
}

/** A second, metric mask is rasterised a tile at a time as the view approaches the yard. */
export function groundDetail(
  [west, north, east, south]: GridBounds,
  patches: GroundPatch[],
  albedo: Record<GroundCover, [string, number]>,
  anisotropy: number,
  invalidate: () => void,
) {
  const tileWidth = (east - west) / columns;
  const tileDepth = (south - north) / rows;
  const tiles = Array.from({ length: columns * rows }, (_, i) => ({
    column: i % columns,
    row: Math.floor(i / columns),
    start: -1,
  }));
  const strengths = { value: new Float32Array(tiles.length) };
  const paths = patches.map((patch) => {
    const path = metricGroundPath(patch.footprint, patch.soft, true);
    return { patch, path };
  });
  const tileSize = { value: new T.Vector4(west, north, tileWidth, tileDepth) };
  const empty = new T.DataArrayTexture(new Uint8Array([0, 0, 0, 0]), 1, 1, 1);
  empty.colorSpace = T.SRGBColorSpace;
  empty.needsUpdate = true;
  const sampler = { value: empty };
  let canvas: HTMLCanvasElement | undefined;
  let timer: ReturnType<typeof setTimeout> | undefined;
  let eye: T.Vector3 | undefined;

  function rasterise(i: number) {
    const size = groundTileSize;
    const tile = tiles[i]!;
    if (sampler.value === empty) {
      const data = new Uint8Array(size * size * 4 * tiles.length);
      const texture = new T.DataArrayTexture(data, size, size, tiles.length);
      texture.colorSpace = T.SRGBColorSpace;
      texture.minFilter = T.LinearMipmapLinearFilter;
      texture.magFilter = T.LinearFilter;
      texture.generateMipmaps = true;
      texture.anisotropy = anisotropy;
      sampler.value = texture;
    }
    if (!canvas) {
      canvas = document.createElement("canvas");
      canvas.width = canvas.height = size;
    }
    const ctx = canvas.getContext("2d", { willReadFrequently: true })!;
    const x = west + tile.column * tileWidth;
    const z = north + tile.row * tileDepth;
    ctx.setTransform(
      size / tileWidth,
      0,
      0,
      size / tileDepth,
      (-x * size) / tileWidth,
      (-z * size) / tileDepth,
    );
    ctx.fillStyle = "#000";
    ctx.fillRect(x - 1, z - 1, tileWidth + 2, tileDepth + 2);
    for (const { patch, path } of paths) {
      const color = surfaceClasses.indexOf(patch.surface) * 20;
      ctx.fillStyle = `rgb(${color},0,0)`;
      ctx.fill(path);
    }
    const material = ctx.getImageData(0, 0, size, size).data;
    ctx.fillStyle = albedo.campo[0];
    ctx.fillRect(x - 1, z - 1, tileWidth + 2, tileDepth + 2);
    for (const { patch, path } of paths) {
      ctx.fillStyle = albedo[patch.surface][0];
      ctx.fill(path);
      ctx.save();
      ctx.clip(path);
      paintGroundWear(ctx, patch, [x, z, x + tileWidth, z + tileDepth]);
      ctx.restore();
    }
    ctx.lineJoin = ctx.lineCap = "round";
    for (const line of finishLines) {
      const turn = line.type === "giro";
      ctx.strokeStyle = turn ? "rgba(209,192,165,.43)" : "rgba(99,84,71,.28)";
      ctx.lineWidth = turn ? 0.46 : 0.23;
      ctx.stroke(metricGroundPath(line.points));
    }
    const ink = ctx.getImageData(0, 0, size, size).data;
    const data = sampler.value.image.data as Uint8Array;
    const offset = i * size * size * 4;
    data.set(ink, offset);
    for (let n = 0; n < ink.length; n += 4) data[offset + n + 3] = material[n]!;
    sampler.value.addLayerUpdate(i);
    sampler.value.needsUpdate = true;
    tile.start = performance.now();
  }

  function nearbyTile(position: T.Vector3) {
    let closest = -1;
    let distance = 136;
    for (const [i, tile] of tiles.entries()) {
      if (tile.start >= 0) continue;
      const x = west + tile.column * tileWidth;
      const z = north + tile.row * tileDepth;
      const dx = Math.max(x - position.x, position.x - x - tileWidth, 0);
      const dz = Math.max(z - position.z, position.z - z - tileDepth, 0);
      const d = Math.hypot(dx, dz, position.y);
      if (d < distance) {
        closest = i;
        distance = d;
      }
    }
    return closest;
  }

  return {
    sampler,
    strengths,
    tileSize,
    update(position: T.Vector3) {
      eye = position;
      const time = performance.now();
      let changing = false;
      for (const [i, tile] of tiles.entries()) {
        if (tile.start < 0 || strengths.value[i] === 1) continue;
        const step = Math.min(1, (time - tile.start) / 180);
        strengths.value[i] = step * step * (3 - 2 * step);
        changing ||= step < 1;
      }
      if (changing) invalidate();
      if (timer || nearbyTile(eye) < 0) return;
      timer = setTimeout(() => {
        timer = undefined;
        const i = eye ? nearbyTile(eye) : -1;
        if (i >= 0) {
          rasterise(i);
          invalidate();
        }
      }, 10);
    },
    dispose() {
      clearTimeout(timer);
      sampler.value.dispose();
      if (sampler.value !== empty) empty.dispose();
    },
  };
}
