export type Vec3 = [number, number, number];
export type Category = "silos" | "equipment" | "buildings" | "terrain" | "vegetation" | "fences";
export type PhotoId = "A" | "B" | "C" | "D";
export type Bounds3 = { min: Vec3; max: Vec3 };
export type GroundCollider = {
  kind: "none" | "circle" | "polygon";
  center?: [number, number];
  radius?: number;
  points?: [number, number][];
  minY: number;
  maxY: number;
  sourceInstancePath?: string;
};
export interface CadBinding {
  sourceObjectId: number;
  sourceInstancePath: string;
  sourcePaths: string[];
  excludedPaths: string[];
  worldMatrixCadMeters: number[];
  worldMatrixNexus: number[];
  registrationId: string;
  renderOwnerId: string;
  renderPartition: string;
  associationStatus: "HIGH_CONFIDENCE" | "UNRESOLVED";
  sourceSha256: string;
  sourceName: string;
  geometryFrame: {
    dimensions: "nexus_world_axes";
    rotation: "source_occurrence_root";
    placement: "baked_in_glb";
    note: string;
  };
  legacySnapshot?: Record<string, unknown>;
}
export interface ElementRecord {
  id: string;
  name: string;
  category: Category;
  photos: PhotoId[];
  position: Vec3;
  rotation: Vec3;
  geometry: Record<string, number | string>;
  existence: "visible" | "inferred" | "cad_verified";
  dimensionStatus: "estimated" | "cad_verified" | "mixed";
  functionStatus: "visible" | "probable" | "unknown";
  description: string;
  assumptions: string[];
  pending: string[];
  parentId?: string;
  identification?: {
    cadName: string;
    technicalIdentifier: string;
    associationStatus: "HIGH_CONFIDENCE" | "UNRESOLVED";
    identityStatus: "user_confirmed";
    nameStatus: "technical_convention";
    aliases: string[];
  };
  cad?: CadBinding;
  bounds?: Bounds3;
  anchors?: { base: Vec3; center: Vec3; top: Vec3 };
  footprint?: { kind: "polygon"; points: [number, number][]; definition?: string };
  collider?: GroundCollider;
  colliders?: GroundCollider[];
}
export type Quality = "balanced" | "economy";
export type ViewId = "overview" | PhotoId | "walk" | "focus";
export interface CameraRequest {
  id: ViewId;
  serial: number;
  elementId?: string;
}
export type Layers = Record<Category | "information", boolean>;
