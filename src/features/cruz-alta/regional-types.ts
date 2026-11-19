import type { Vector3 } from "three";
import type { Extent } from "./spatial";
export interface HorizonInfo {
  state: "idle" | "loading" | "ready" | "failed";
  bounds: Extent;
  labels: { name: string; point: [number, number, number] }[];
  attribution: string;
}
export interface HorizonControls {
  setRegion(active: boolean): void;
  regionInfo(): HorizonInfo | null;
  updateRegion(eye: Vector3): void;
}
