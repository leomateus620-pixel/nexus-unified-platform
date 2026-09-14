import source from "./site.json";
import photoSource from "./references.json";
import type { ElementRecord, PhotoId, Vec3 } from "../types";
export const site = source;
export const elements = source.elements as unknown as ElementRecord[];
export const byId = new Map(elements.map((e) => [e.id, e]));
export const references = photoSource as {
  id: PhotoId;
  originalName: string;
  url: string;
  sha256: string;
  rights: string;
}[];
export const categoryNames = {
  silos: "Silos",
  equipment: "Equipamentos",
  buildings: "Edificações",
  terrain: "Terreno e vias",
  vegetation: "Vegetação",
  fences: "Cercamentos",
  information: "Informações",
};
export const vec = (p: number[]): Vec3 => [p[0] ?? 0, p[1] ?? 0, p[2] ?? 0];
