import * as T from "three";
/** Original daylight gradient. The floor is relative and all lights are photographic interpretation. */
export function daylight(scene: T.Scene, span: number) {
  const pixels = new Uint8Array(64 * 32 * 4),
    color = new T.Color();
  const sky = new T.Color("#7ba7c4"),
    horizon = new T.Color("#bbd0dc"),
    ground = new T.Color("#969084");
  for (let y = 0; y < 32; y++) {
    const v = (y / 31) * 2 - 1;
    color
      .copy(horizon)
      .lerp(v > 0 ? sky : ground, Math.pow(Math.min(1, Math.abs(v) * 2), 0.68))
      .convertLinearToSRGB();
    for (let x = 0; x < 64; x++) {
      const n = 4 * (64 * y + x);
      pixels[n] = Math.round(color.r * 255);
      pixels[n + 1] = Math.round(color.g * 255);
      pixels[n + 2] = Math.round(color.b * 255);
      pixels[n + 3] = 255;
    }
  }
  const texture = new T.DataTexture(pixels, 64, 32, T.RGBAFormat);
  texture.colorSpace = T.SRGBColorSpace;
  texture.mapping = T.EquirectangularReflectionMapping;
  texture.magFilter = T.LinearFilter;
  texture.needsUpdate = true;
  scene.environment = texture;
  scene.environmentIntensity = 0.34;
  scene.background = texture;
  scene.backgroundIntensity = 0.93;
  scene.fog = new T.FogExp2("#bbd0dc", 0.000062);
  const hemisphere = new T.HemisphereLight("#e2edf2", "#978c76", 1.05);
  const sun = new T.DirectionalLight("#fff4e8", 2.53);
  sun.castShadow = true;
  sun.shadow.mapSize.set(2048, 2048);
  sun.shadow.normalBias = 0.12;
  sun.shadow.bias = -0.00018;
  scene.add(hemisphere, sun, sun.target);
  let last = "";
  function shadows(
    renderer: T.WebGLRenderer,
    target: T.Vector3,
    distance: number,
    tier: string,
    force = false,
  ) {
    // Quantized shadow radius and world-space centre avoid crawling shadow texels during a slow pan.
    const radius = Math.min(span * 0.78, Math.max(36, Math.ceil((distance * 0.62) / 12) * 12));
    const scale = tier === "economico" ? 768 : tier === "equilibrado" ? 1536 : 2048,
      quantum = Math.max(1.2, radius / 50);
    const x = Math.round(target.x / quantum) * quantum,
      z = Math.round(target.z / quantum) * quantum;
    const key = [radius, x, z, scale].join("/");
    if (!force && key === last) return;
    last = key;
    sun.position.set(x - 0.64 * span, span * 1.04, z - 0.41 * span);
    sun.target.position.set(x, 0, z);
    if (sun.shadow.mapSize.x !== scale) {
      sun.shadow.map?.dispose();
      sun.shadow.map = null;
      sun.shadow.mapSize.set(scale, scale);
    }
    Object.assign(sun.shadow.camera, {
      left: -radius,
      right: radius,
      top: radius,
      bottom: -radius,
      near: 0.1,
      far: span * 2.8,
    });
    sun.shadow.camera.updateProjectionMatrix();
    renderer.shadowMap.needsUpdate = true;
  }
  function dispose() {
    texture.dispose();
    sun.shadow.dispose();
  }
  return { shadows, dispose };
}
