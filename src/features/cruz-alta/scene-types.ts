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
  /** Ridge / longitudinal unit vector in the XZ plane. */
  axis?: GroundPoint;
  layer?: "equipamentos" | "edificacoes";
  bracing?: "gallery" | "tower";
  parapet?: { height: number; color?: string };
}
export interface CruzLine {
  id: string;
  points: GroundPoint[];
  status: "montada" | "a-montar" | "fora";
  y?: number;
}
export interface CruzArea {
  kind: "via" | "ferrovia" | "vegetacao" | "agua" | "patio" | "vizinhanca";
  footprint: GroundPoint[];
}
export type SceneLayer = "edificacoes" | "equipamentos" | "entorno" | "nomes" | "lvhf";
export type SceneLayers = Record<SceneLayer, boolean>;
export type CameraMode = "angular" | "planta" | "patio";
