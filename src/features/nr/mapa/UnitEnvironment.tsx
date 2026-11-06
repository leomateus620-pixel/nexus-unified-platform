import { useLayoutEffect } from "react";
import { useThree } from "@react-three/fiber";
import * as T from "three";
import { LIGHT_STATES, type LightState } from "./graphics";

/** Original procedural HDR sky and rural horizon in world coordinates.
 * One PMREM per light state per renderer. Orbit never generates a map. */
export function UnitEnvironment({ light }: { light: LightState }) {
  const { gl, scene, invalidate } = useThree();
  useLayoutEffect(() => {
    const generator = new T.PMREMGenerator(gl);
    const cache = new Map<LightState, { source: T.DataTexture; target: T.WebGLRenderTarget }>();
    let generation = 0;
    const apply = (state: LightState) => {
      let entry = cache.get(state);
      if (!entry) {
        const width = 512,
          height = 256,
          data = new Uint16Array(width * height * 4),
          late = state === "late";
        const sun = new T.Vector3(...LIGHT_STATES[state].sun)
          .sub(new T.Vector3(5, 0, 0))
          .normalize();
        const sky = new T.Color(late ? "#527fad" : "#4c9be1"),
          horizon = new T.Color(late ? "#f2bd8d" : "#c4e2ef");
        const ground = new T.Color(late ? "#5c5436" : "#67714b"),
          warm = new T.Color(late ? "#ffd4a0" : "#ffeed0");
        for (let y = 0; y < height; y++)
          for (let x = 0; x < width; x++) {
            const altitude = ((y + 0.5) / height - 0.5) * Math.PI,
              azimuth = ((x + 0.5) / width - 0.5) * Math.PI * 2;
            const dir = new T.Vector3(
              Math.cos(altitude) * Math.cos(azimuth),
              Math.sin(altitude),
              Math.cos(altitude) * Math.sin(azimuth),
            );
            const c =
              altitude > 0
                ? horizon.clone().lerp(sky, Math.pow(Math.sin(altitude), 0.45))
                : horizon.clone().lerp(ground, Math.min(1, -Math.sin(altitude) * 5));
            const dot = dir.dot(sun),
              broad = Math.pow(Math.max(0, dot), 10) * (late ? 0.45 : 0.8),
              disk = Math.exp((dot - 1) * 1700) * (late ? 13 : 20);
            c.multiplyScalar(late ? 0.72 : 1.05);
            c.r += warm.r * (broad + disk);
            c.g += warm.g * (broad + disk);
            c.b += warm.b * (broad + disk);
            const i = (y * width + x) * 4;
            data[i] = T.DataUtils.toHalfFloat(c.r);
            data[i + 1] = T.DataUtils.toHalfFloat(c.g);
            data[i + 2] = T.DataUtils.toHalfFloat(c.b);
            data[i + 3] = T.DataUtils.toHalfFloat(1);
          }
        const source = new T.DataTexture(data, width, height, T.RGBAFormat, T.HalfFloatType);
        source.mapping = T.EquirectangularReflectionMapping;
        source.minFilter = source.magFilter = T.LinearFilter;
        source.needsUpdate = true;
        entry = { source, target: generator.fromEquirectangular(source) };
        cache.set(state, entry);
        generation++;
      }
      scene.environment = entry.target.texture;
      scene.background = entry.source;
      scene.environmentIntensity = LIGHT_STATES[state].environment;
      scene.backgroundIntensity = LIGHT_STATES[state].background;
      gl.domElement.dataset["environmentGenerations"] = String(generation);
      gl.domElement.dataset["environmentState"] = state;
      gl.shadowMap.needsUpdate = true;
      invalidate();
    };
    const canvas = gl.domElement;
    const change = (event: Event) => apply((event as CustomEvent<LightState>).detail);
    const restore = () => {
      cache.forEach((e) => {
        e.target.dispose();
        e.source.dispose();
      });
      cache.clear();
      apply(canvas.dataset["light"] === "late" ? "late" : "day");
    };
    canvas.addEventListener("unit-light", change);
    canvas.addEventListener("webglcontextrestored", restore);
    apply(canvas.dataset["light"] === "late" ? "late" : "day");
    return () => {
      canvas.removeEventListener("unit-light", change);
      canvas.removeEventListener("webglcontextrestored", restore);
      scene.environment = null;
      scene.background = null;
      cache.forEach((e) => {
        e.target.dispose();
        e.source.dispose();
      });
      cache.clear();
      generator.dispose();
    };
  }, [gl, scene, invalidate]);
  useLayoutEffect(() => {
    gl.domElement.dataset["light"] = light;
    gl.domElement.dispatchEvent(new CustomEvent("unit-light", { detail: light }));
  }, [gl, light]);
  return null;
}
