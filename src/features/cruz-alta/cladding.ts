import * as T from "three";
import { palette } from "./paleta";

/** Reconstructed oxidation, not a projection of DJI 0044. Wall UVs are in installed metres. */
export function gableCladding(anisotropy: number) {
  const tile = document.createElement("canvas");
  tile.width = tile.height = 512;
  const ctx = tile.getContext("2d")!;
  ctx.fillStyle = palette.oitao11;
  ctx.fillRect(0, 0, 512, 512);
  const panels = ["#a6aeaa", "#a4977a", "#8c9ba0", "#aeb5b6", "#aab1ad", "#8e9ba0", "#b7a582"];
  for (let i = 0; i < 28; i++) {
    const x = (512 * i) / 28;
    ctx.globalAlpha = 0.56;
    ctx.fillStyle = panels[(3 * i + Math.floor(i / 6)) % panels.length]!;
    ctx.fillRect(x, 0, 512 / 28 + 0.5, 512);
    ctx.globalAlpha = 1;
    ctx.fillStyle = "rgba(39,55,60,0.26)";
    ctx.fillRect(x, 0, 1.6, 512);
    ctx.fillStyle = "rgba(206,218,213,0.37)";
    ctx.fillRect(x + 1.9, 0, 1.3, 512);
    for (let n = 0; n < 3; n++) {
      const location = 29.43 * i + 13.6 * n + 17;
      const intensity = 0.5 + 0.5 * Math.sin(location);
      if (intensity < 0.41) continue;
      const xMark = x + 3 + 10 * (0.5 + 0.5 * Math.sin(location * 5.19));
      const h = 45 + 270 * intensity;
      const y = (512 - h) * (0.5 + 0.5 * Math.cos(location * 6.29));
      const gradient = ctx.createLinearGradient(0, y, 0, y + h);
      gradient.addColorStop(0, "rgba(111,57,34,0)");
      gradient.addColorStop(0.22, "rgba(119,64,43," + 0.56 * intensity + ")");
      gradient.addColorStop(0.67, "rgba(130,72,37," + 0.35 * intensity + ")");
      gradient.addColorStop(1, "rgba(119,72,44,0)");
      ctx.fillStyle = gradient;
      ctx.fillRect(xMark, y, 1.4 + 3.3 * intensity, h);
    }
  }
  const map = new T.CanvasTexture(tile);
  map.colorSpace = T.SRGBColorSpace;
  map.wrapS = map.wrapT = T.ClampToEdgeWrapping;
  map.repeat.set(1 / 26.6, 1 / 12.7);
  map.anisotropy = anisotropy;
  return map;
}
