export type Vec3 = [number, number, number];
export type Category = "silos" | "equipment" | "buildings" | "terrain" | "vegetation" | "fences";
export type PhotoId = "A" | "B" | "C" | "D";
export interface ElementRecord {
  id: string;
  name: string;
  category: Category;
  photos: PhotoId[];
  position: Vec3;
  rotation: Vec3;
  geometry: Record<string, number | string>;
  existence: "visible" | "inferred";
  dimensionStatus: "estimated";
  functionStatus: "visible" | "probable" | "unknown";
  description: string;
  assumptions: string[];
  pending: string[];
}
export type Quality = "balanced" | "economy";
export type ViewId = "overview" | PhotoId | "walk" | "focus";
export interface CameraRequest {
  id: ViewId;
  serial: number;
  elementId?: string;
}
export type Layers = Record<Category | "information", boolean>;
