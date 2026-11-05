import type { Norma } from "../domain";
export type Vec3 = [number, number, number];
export type Vec2 = [number, number];
export type CameraMode = "normal" | "superior" | "angular";
export type SceneObject = {
  chave: string;
  local_id: string;
  tag: string;
  titulo: string;
  aliases: string[];
  posicao_confirmada: boolean;
};
export type SiloPlacement = {
  key: string;
  position: Vec3;
  diameter: number;
  straight: number;
  cone: number;
  clearance: number;
  roof: number;
  aliases: string[];
  source: string;
  note: string;
};
export type BuildingPlacement = {
  key: string;
  name: string;
  position: Vec3;
  size: Vec3;
  rotationY?: number;
  kind: "union" | "distribution" | "warehouse" | "shed" | "green-shed" | "canopy" | "support";
  note: string;
};
export type SceneManifest = {
  key: string;
  version: number;
  unit: string;
  units: "m";
  bounds: { min: Vec3; max: Vec3 };
  site: {
    outline: Vec2[];
    surfaces: {
      key: string;
      kind: "blocks" | "concrete" | "grass" | "soil" | "asphalt" | "field";
      outline: Vec2[];
    }[];
    roads: { key: string; width: number; points: Vec2[]; public?: boolean }[];
    junction: {
      center: Vec2;
      radius: number;
      islandRadius: number;
      highwayHalfWidth: number;
      bearing: number;
    };
    landmarkTrees: { position: Vec2; height: number }[];
    fences: Vec2[][];
    vegetation: Vec2[][];
    gate: Vec2;
  };
  silos: SiloPlacement[];
  buildings: BuildingPlacement[];
  cameras: Record<
    | "normal"
    | "unit"
    | "angular"
    | "patio"
    | "aerial"
    | "facade"
    | "base"
    | "sa05"
    | "junction"
    | "arrival",
    { position: Vec3; target: Vec3; fov: number }
  >;
  provenance: string[];
};
export type MapContext = {
  cena: string | null;
  versao?: number;
  objetos: SceneObject[];
  manifest?: SceneManifest;
};
export type UnitScope = {
  organization_id: string;
  cliente_id: string;
  unidade_id: string;
  norma: Norma;
};
