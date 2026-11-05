import { useEffect } from "react";
import { useFrame, useThree } from "@react-three/fiber";
import {
  CanvasTexture,
  Color,
  EquirectangularReflectionMapping,
  Fog,
  PMREMGenerator,
  SRGBColorSpace,
} from "three";
import type { Quality } from "../types";
export function Lighting({ neutral, quality }: { neutral: boolean; quality: Quality }) {
  const { gl, scene, invalidate } = useThree();
  useFrame(({ camera }) => {
    if (scene.fog instanceof Fog) {
      const d = camera.position.length();
      scene.fog.near = Math.max(270, d + 150);
      scene.fog.far = Math.max(650, d + 470);
    }
  });
  useEffect(() => {
    const canvas = document.createElement("canvas");
    canvas.width = 512;
    canvas.height = 256;
    const c = canvas.getContext("2d")!;
    const gradient = c.createLinearGradient(0, 0, 0, 256);
    gradient.addColorStop(0, "#327dc7");
    gradient.addColorStop(0.28, "#79acdb");
    gradient.addColorStop(0.47, "#d7e1dd");
    gradient.addColorStop(0.53, "#b7b49e");
    gradient.addColorStop(1, "#575d3f");
    c.fillStyle = gradient;
    c.fillRect(0, 0, 512, 256);
    const sun = c.createRadialGradient(170, 57, 1, 170, 57, 20);
    sun.addColorStop(0, "#ffffff");
    sun.addColorStop(1, "rgba(255,250,223,0)");
    c.fillStyle = sun;
    c.fillRect(140, 27, 60, 60);
    const texture = new CanvasTexture(canvas);
    texture.mapping = EquirectangularReflectionMapping;
    texture.colorSpace = SRGBColorSpace;
    const generator = new PMREMGenerator(gl);
    const target = generator.fromEquirectangular(texture);
    scene.environment = target.texture;
    scene.background = neutral ? new Color("#d4d8d5") : texture;
    invalidate();
    return () => {
      scene.environment = null;
      scene.background = null;
      target.dispose();
      generator.dispose();
      texture.dispose();
    };
  }, [gl, scene, invalidate, neutral]);
  return (
    <>
      <fog attach="fog" args={[neutral ? "#d4d8d5" : "#b9ccd1", 280, 590]} />
      <hemisphereLight args={["#dcecf4", "#737952", neutral ? 2.3 : 1.8]} />
      <directionalLight
        position={[-70, 110, -42]}
        intensity={neutral ? 1.3 : 2.5}
        color={neutral ? "#ffffff" : "#fff2da"}
        castShadow={!neutral}
        shadow-mapSize={[
          quality === "balanced" ? 2048 : 1024,
          quality === "balanced" ? 2048 : 1024,
        ]}
        shadow-camera-left={-110}
        shadow-camera-right={110}
        shadow-camera-top={110}
        shadow-camera-bottom={-110}
        shadow-camera-near={10}
        shadow-camera-far={290}
        shadow-bias={-0.0012}
        shadow-normalBias={0.35}
      />
    </>
  );
}
