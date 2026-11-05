import { useEffect } from "react";
import { useThree } from "@react-three/fiber";
import {
  CanvasTexture,
  EquirectangularReflectionMapping,
  PMREMGenerator,
  SRGBColorSpace,
} from "three";

/** Same daylight reflection convention as the industrial viewer, isolated because
 * the published industrial scene has a protected geometry/lighting contract. */
export function UnitEnvironment() {
  const { gl, scene, invalidate } = useThree();
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
    invalidate();
    return () => {
      scene.environment = null;
      target.dispose();
      generator.dispose();
      texture.dispose();
    };
  }, [gl, scene, invalidate]);
  return null;
}
