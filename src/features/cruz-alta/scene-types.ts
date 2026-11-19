/** Local metric frame: +X east, +Z south, +Y up. IDs are independent of labels and LOD. */
export type GroundPoint = [number, number];
export interface CruzObject {
  id: string;
  name: string;
  kind: "setor" | "estrutura" | "componente" | "lvhf";
  parent?: string;
  code?: string;
  aliases?: string[];
  status?: string;
  note?: string;
  related?: string[];
}
export interface CruzPart {
  id: string;
  footprint: GroundPoint[];
  /** Absolute visual eave level and roof rise in metres. */
  eave: number;
  rise: number;
  base?: number;
  roof: "flat" | "gable" | "arc" | "mono" | "silo" | "tank";
  /** Optional piecewise section across a roof, from low to high profile coordinate t. */
  roofSection?: readonly (readonly [t: number, y: number])[];
  /** Ridge / longitudinal unit vector in the XZ plane. */
  axis?: GroundPoint;
  layer?: "equipamentos" | "edificacoes";
  bracing?: "gallery" | "tower";
  parapet?: { height: number; color?: string };
}
export interface CruzLine {
  id: string;
  points: GroundPoint[];
  status: "montada" | "montada-aditivo" | "a-montar" | "fora";
  y?: number;
}
export interface CruzArea {
  /** Silhueta observada do entorno. O vínculo patrimonial continua pendente. */
  mass?: { roof: "arc" | "gable" | "mono" | "flat"; eave: number; rise: number };
  /** Fisionomia aparente nas tomadas aéreas. Espécies e alturas individuais não cadastradas. */
  vegetation?: "talhao" | "bosque";
  kind: "via" | "ferrovia" | "vegetacao" | "agua" | "patio" | "vizinhanca";
  footprint: GroundPoint[];
}
export type SceneLayer = "edificacoes" | "equipamentos" | "entorno" | "nomes" | "lvhf";
export type SceneLayers = Record<SceneLayer, boolean>;
export type CameraMode = "angular" | "planta" | "patio";
export const DAYLIGHT_EXPOSURE = 1.0;
