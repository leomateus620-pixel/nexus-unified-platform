import * as T from "three";

const sunward = new T.Vector3(-0.64, 1.04, -0.41).normalize();
const lightRight = new T.Vector3(0, 1, 0).cross(sunward).normalize();
const lightUp = new T.Vector3().crossVectors(sunward, lightRight);
const horizonColor = "#bdcfd8";

/** Relative daylight. Three prefilters the equirectangular sky for material reflections. */
function skyTexture() {
  const width = 64,
    height = 32;
  const pixels = new Uint8Array(width * height * 4);
  const color = new T.Color(),
    direction = new T.Vector3();
  const blue = new T.Color("#779fbe"),
    horizon = new T.Color(horizonColor);
  const bounce = new T.Color("#9e9381"),
    warm = new T.Color("#f2e2c9");
  for (let y = 0; y < height; y++) {
    const latitude = ((y + 0.5) / height - 0.5) * Math.PI;
    const vertical = Math.sin(latitude),
      ring = Math.cos(latitude);
    const blend = Math.pow(Math.min(1, Math.abs(vertical) * 1.65), 0.62);
    for (let x = 0; x < width; x++) {
      const longitude = ((x + 0.5) / width - 0.5) * 2 * Math.PI;
      direction.set(ring * Math.cos(longitude), vertical, ring * Math.sin(longitude));
      const glow = 0.3 * Math.pow(Math.max(0, direction.dot(sunward)), 20);
      color
        .copy(horizon)
        .lerp(vertical > 0 ? blue : bounce, blend)
        .lerp(warm, glow);
      color.convertLinearToSRGB();
      const offset = 4 * (width * y + x);
      pixels[offset] = Math.round(color.r * 255);
      pixels[offset + 1] = Math.round(color.g * 255);
      pixels[offset + 2] = Math.round(color.b * 255);
      pixels[offset + 3] = 255;
    }
  }
  const texture = new T.DataTexture(pixels, width, height, T.RGBAFormat);
  texture.colorSpace = T.SRGBColorSpace;
  texture.mapping = T.EquirectangularReflectionMapping;
  texture.magFilter = T.LinearFilter;
  texture.minFilter = T.LinearFilter;
  texture.needsUpdate = true;
  return texture;
}

export function daylight(scene: T.Scene, span: number) {
  const sky = skyTexture();
  scene.environment = sky;
  scene.environmentIntensity = 0.42;
  scene.background = sky;
  scene.backgroundIntensity = 0.95;
  scene.fog = new T.FogExp2(horizonColor, 0.000077);
  const hemisphere = new T.HemisphereLight("#e4eef5", "#a49a87", 0.87);
  const sun = new T.DirectionalLight("#fff3e3", 2.42);
  sun.castShadow = true;
  sun.shadow.intensity = 0.96;
  scene.add(hemisphere, sun, sun.target);
  let radius = 0,
    snappedRight = Infinity,
    snappedUp = Infinity;
  const lightCenter = new T.Vector3();

  function shadows(renderer: T.WebGLRenderer, target: T.Vector3, distance: number, tier: string) {
    const needed = Math.min(span * 0.78, Math.max(36, distance * 0.64));
    const scale = tier === "economico" ? 768 : tier === "equilibrado" ? 1536 : 2048;
    const desired = Math.min(span * 0.81, Math.ceil((needed * 1.08) / 12) * 12);
    const resize = desired !== radius && (needed > radius || needed < radius * 0.76);
    if (resize) radius = desired;
    const changeMap = sun.shadow.mapSize.x !== scale;
    const texel = (2 * radius) / scale;
    const quantum = texel * 8;
    // Stabilize in the projection axes. Each move is an integral number of shadow texels.
    // A dead band keeps small camera reversals from switching the map back and forth.
    lightCenter.set(target.x, 0, target.z);
    const x = lightCenter.dot(lightRight),
      y = lightCenter.dot(lightUp);
    if (
      !resize &&
      !changeMap &&
      Math.abs(x - snappedRight) <= quantum * 0.8 &&
      Math.abs(y - snappedUp) <= quantum * 0.8
    )
      return;
    snappedRight = Math.round(x / quantum) * quantum;
    snappedUp = Math.round(y / quantum) * quantum;
    sun.target.position
      .copy(lightRight)
      .multiplyScalar(snappedRight)
      .addScaledVector(lightUp, snappedUp);
    sun.position.copy(sun.target.position).addScaledVector(sunward, span * 1.32);
    if (changeMap) {
      sun.shadow.map?.dispose();
      sun.shadow.map = null;
      sun.shadow.mapSize.set(scale, scale);
    }
    sun.shadow.normalBias = T.MathUtils.clamp(texel * 0.55, 0.025, 0.12);
    sun.shadow.bias = -0.00007;
    sun.shadow.radius = T.MathUtils.clamp(0.19 / texel, 1.1, 2.35);
    Object.assign(sun.shadow.camera, {
      left: -radius,
      right: radius,
      top: radius,
      bottom: -radius,
      near: span * 0.57,
      far: span * 2.08,
    });
    sun.shadow.camera.updateProjectionMatrix();
    renderer.shadowMap.needsUpdate = true;
  }

  return {
    shadows,
    dispose() {
      sky.dispose();
      sun.shadow.dispose();
    },
  };
}
