import * as T from "three";
import { palette } from "./paleta";

/** Authored tile of corrugated wall panels. Longitudinal rust streaks are visible on the 11/56 gable in DJI 0044. */
export function gableCladding(anisotropy: number) {
  const tile = document.createElement("canvas");
  tile.width = 512;
  tile.height = 512;
  const c = tile.getContext("2d")!;
  c.fillStyle = palette.oitao11;
  c.fillRect(0, 0, 512, 512);
  const panels = [
    "#a2a99f",
    "#b6a77e",
    "#91a4a3",
    "#adad97",
    "#b3b8ad",
    "#8c9792",
    "#b9aa84",
    "#aebbb6",
  ];
  for (let i = 0; i < 8; i++) {
    c.globalAlpha = 0.55;
    c.fillStyle = panels[i]!;
    c.fillRect(i * 64, 0, 64, 512);
    c.globalAlpha = 1;
    for (let n = 0; n < 8; n++) {
      const w = 1.5 + 2.8 * (0.5 + 0.5 * Math.sin(i * 19 + n * 3));
      const x = i * 64 + n * 8,
        base = Math.sin(231 + i * 34 + n * 13);
      c.fillStyle = "#5d6665";
      c.fillRect(x, 0, 1.4, 512);
      c.fillStyle = "#e3dfce";
      c.fillRect(x + 2, 0, 1.2, 512);
      if (base > -0.45) {
        const v = c.createLinearGradient(0, 0, 0, 512);
        v.addColorStop(0, "rgba(115,64,41,.32)");
        v.addColorStop(0.45, "rgba(132,74,49," + (base * 0.15 + 0.21) + ")");
        v.addColorStop(1, "rgba(115,64,41,.32)");
        c.fillStyle = v;
        c.fillRect(x + 3, 0, w, 512);
      }
    }
  }
  const map = new T.CanvasTexture(tile);
  map.colorSpace = T.SRGBColorSpace;
  map.wrapS = map.wrapT = T.RepeatWrapping;
  map.repeat.set(1 / 7.2, 1 / 7);
  map.anisotropy = anisotropy;
  return map;
}
