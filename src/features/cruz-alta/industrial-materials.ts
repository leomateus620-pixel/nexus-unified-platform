import * as T from "three";

export function industrialMaterial(color: T.ColorRepresentation, roughness: number, metalness = 0) {
  return new T.MeshStandardMaterial({ color, roughness, metalness, side: T.DoubleSide });
}

type Sheet = "roof" | "wall" | "weathered" | "concrete" | "silo-wall" | "silo-cap" | "tank";
type FinishSpec = {
  ribs: number;
  fold: number;
  grain: number;
  stains: number;
  roughness: number;
  horizontal?: boolean;
};

const finishes: Record<Sheet, FinishSpec> = {
  roof: { ribs: 8, fold: 0.056, grain: 0.05, stains: 0.025, roughness: 0.52 },
  weathered: { ribs: 8, fold: 0.05, grain: 0.07, stains: 0.12, roughness: 0.72 },
  wall: { ribs: 8, fold: 0.048, grain: 0.045, stains: 0.035, roughness: 0.59 },
  concrete: { ribs: 0, fold: 0, grain: 0.12, stains: 0.07, roughness: 0.87 },
  "silo-wall": {
    ribs: 32,
    fold: 0.029,
    grain: 0.04,
    stains: 0.022,
    roughness: 0.47,
    horizontal: true,
  },
  tank: { ribs: 4, fold: 0.021, grain: 0.026, stains: 0.02, roughness: 0.54, horizontal: true },
  "silo-cap": { ribs: 16, fold: 0.032, grain: 0.05, stains: 0.07, roughness: 0.54 },
};

const TAU = Math.PI * 2;

export function finishLibrary(anisotropy: number) {
  const materials: T.MeshStandardMaterial[] = [];
  const textures: T.Texture[] = [];
  const tileSize = 128;
  const remember = (material: T.MeshStandardMaterial) => {
    materials.push(material);
    return material;
  };
  const solid = (...args: Parameters<typeof industrialMaterial>) =>
    remember(industrialMaterial(...args));
  const clone = (material: T.MeshStandardMaterial, color: T.ColorRepresentation) => {
    const copy = remember(material.clone());
    copy.color.set(color);
    return copy;
  };
  function sheet(
    name: Sheet,
    color: T.ColorRepresentation,
    metalness: number,
    repeat: [number, number],
  ) {
    const spec = finishes[name];
    const material = solid(color, 1, metalness);
    const albedo = new Uint8Array(tileSize * tileSize * 4);
    const normal = new Uint8Array(albedo.length);
    const rough = new Uint8Array(albedo.length);
    const height = new Float32Array(tileSize * tileSize);
    const channel = (values: Uint8Array, i: number, x: number, y = x, z = x) => {
      const offset = 4 * i;
      values[offset] = x;
      values[offset + 1] = y;
      values[offset + 2] = z;
      values[offset + 3] = 255;
    };
    let seed = 91237;
    const noise = () => {
      seed = (Math.imul(1664525, seed) + 1013904223) >>> 0;
      return seed / 4294967296 - 0.5;
    };
    for (let j = 0; j < tileSize; j++)
      for (let i = 0; i < tileSize; i++) {
        const index = j * tileSize + i;
        const u = i / tileSize;
        const v = j / tileSize;
        const direction = spec.horizontal ? v : u;
        const roll = spec.ribs ? Math.pow((1 + Math.cos(TAU * direction * spec.ribs)) / 2, 4) : 0;
        const stiffener = name === "silo-wall";
        const sheetSeam = ["silo-cap", "concrete", "tank"].includes(name)
          ? 0
          : Math.pow((1 + Math.cos(TAU * u * 4)) / 2, stiffener ? 12 : 22);
        const cloud = 0.5 + 0.15 * Math.sin(TAU * (u + v)) + 0.1 * Math.sin(TAU * (u - 2 * v));
        const stainContrast = name === "weathered" || name === "roof" ? 0.32 : 1;
        const fleck = noise();
        height[index] =
          spec.fold * roll + (stiffener ? 0.048 : 0.009) * sheetSeam + spec.grain * 0.095 * fleck;
        const value =
          255 *
          (0.985 -
            spec.stains * cloud * stainContrast -
            (stiffener ? 0.065 : 0.034) * roll -
            (stiffener ? 0.2 : 0.014) * sheetSeam +
            spec.grain * fleck);
        channel(albedo, index, Math.round(T.MathUtils.clamp(value, 0, 255)));
        channel(
          rough,
          index,
          Math.round(255 * Math.min(1, spec.roughness + 0.1 * cloud + 0.08 * fleck)),
        );
      }
    const slope = new T.Vector3();
    const at = (i: number, j: number) =>
      height[((j + tileSize) % tileSize) * tileSize + ((i + tileSize) % tileSize)]!;
    for (let j = 0; j < tileSize; j++)
      for (let i = 0; i < tileSize; i++) {
        slope
          .set(5 * (at(i - 1, j) - at(i + 1, j)), 5 * (at(i, j - 1) - at(i, j + 1)), 1)
          .normalize();
        channel(
          normal,
          j * tileSize + i,
          Math.round(127.5 * (1 + slope.x)),
          Math.round(127.5 * (1 + slope.y)),
          Math.round(127.5 * (1 + slope.z)),
        );
      }
    const texture = (data: Uint8Array, colorSpace: T.ColorSpace = T.NoColorSpace) => {
      const map = new T.DataTexture(data, tileSize, tileSize);
      map.colorSpace = colorSpace;
      map.wrapS = map.wrapT = T.RepeatWrapping;
      map.repeat.set(...repeat);
      map.generateMipmaps = true;
      map.minFilter = T.LinearMipmapLinearFilter;
      map.magFilter = T.LinearFilter;
      map.anisotropy = anisotropy;
      map.needsUpdate = true;
      textures.push(map);
      return map;
    };
    material.map = texture(albedo, T.SRGBColorSpace);
    material.normalMap = texture(normal);
    material.roughnessMap = texture(rough);
    return material;
  }
  return { materials, textures, solid, clone, sheet };
}
