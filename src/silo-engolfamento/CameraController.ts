import * as T from "three";
import { OrbitControls } from "three/examples/jsm/controls/OrbitControls.js";
import type { CameraMode, SiloFrame } from "./simulation";
import { INCIDENT_CENTRES, SILO_CONFIG } from "./SiloConfig";
import {
  constrainExterior,
  fitBoxDistance,
  NO_INSETS,
  trolleyCameraOffset,
  type ViewportInsets,
} from "./cameraGeometry";

export type InspectionPreset =
  "general" | "internal" | "ring" | "trolley" | "anchor" | "dorsal" | "manhole";
export interface CameraViewSnapshot {
  position: T.Vector3;
  target: T.Vector3;
  mode: CameraMode;
  fov: number;
  near: number;
  far: number;
  inspection: boolean;
  minDistance: number;
  maxDistance: number;
  rotateSpeed: number;
  panSpeed: number;
}
const LOOK_YAW_LIMIT = 2.6;
const LOOK_UP_LIMIT = -1.42;
const LOOK_DOWN_LIMIT = 1.15;
export const INCIDENT_VIEW_DIRECTION = [0.35, 0.22, 1] as const;

/** One camera authority. Inspection and layout never mutate the simulation. */
export class CameraController {
  readonly orbit: OrbitControls;
  mode: CameraMode = "frontal";
  private destination = new T.Vector3();
  private target = new T.Vector3();
  private eyes = new T.Vector3();
  private look = new T.Vector3();
  private scratch = new T.Vector3();
  private followingOffset = new T.Vector3(0.65, 0.3, 0.9);
  private yaw = 0;
  private pitch = 0;
  private dragging = false;
  private activePointer: number | null = null;
  private lastX = 0;
  private lastY = 0;
  private transitioning = true;
  private inspection = false;
  private following = false;
  private reduced = window.matchMedia("(prefers-reduced-motion: reduce)").matches;
  private listeners: (() => void)[] = [];
  private previous: CameraViewSnapshot | undefined;
  private lastFrame: SiloFrame | undefined;
  private focusBox: T.Box3 | undefined;
  private focusDirection = new T.Vector3(0.8, 0.3, 1);
  private insets: ViewportInsets = { ...NO_INSETS };
  private width = 1;
  private height = 1;
  constructor(
    private camera: T.PerspectiveCamera,
    private canvas: HTMLCanvasElement,
    private invalid: () => void,
  ) {
    this.orbit = new OrbitControls(camera, canvas);
    this.orbit.enableDamping = true;
    this.orbit.dampingFactor = 0.13;
    this.orbit.enablePan = true;
    this.orbit.screenSpacePanning = true;
    this.orbit.minDistance = 0.08;
    this.orbit.maxDistance = 160;
    this.orbit.minPolarAngle = 0.02;
    this.orbit.maxPolarAngle = Math.PI * 0.52;
    this.orbit.minAzimuthAngle = -Infinity;
    this.orbit.maxAzimuthAngle = Infinity;
    this.orbit.rotateSpeed = 0.55;
    this.orbit.zoomSpeed = 0.7;
    this.orbit.panSpeed = 0.55;
    const change = () => this.invalid();
    const start = () => {
      this.transitioning = false;
      this.following = false;
      this.focusBox = undefined;
    };
    this.orbit.addEventListener("change", change);
    this.orbit.addEventListener("start", start);
    this.listeners.push(
      () => this.orbit.removeEventListener("change", change),
      () => this.orbit.removeEventListener("start", start),
    );
    const down = (e: PointerEvent) => {
      if (!this.internal || this.activePointer !== null) return;
      this.dragging = true;
      this.activePointer = e.pointerId;
      this.lastX = e.clientX;
      this.lastY = e.clientY;
      canvas.setPointerCapture(e.pointerId);
    };
    const move = (e: PointerEvent) => {
      if (!this.dragging || e.pointerId !== this.activePointer) return;
      this.yaw = T.MathUtils.clamp(
        this.yaw - (e.clientX - this.lastX) * 0.004,
        -LOOK_YAW_LIMIT,
        LOOK_YAW_LIMIT,
      );
      this.pitch = T.MathUtils.clamp(
        this.pitch + (e.clientY - this.lastY) * 0.004,
        LOOK_UP_LIMIT,
        LOOK_DOWN_LIMIT,
      );
      this.lastX = e.clientX;
      this.lastY = e.clientY;
      this.invalid();
    };
    const up = (e: PointerEvent) => {
      if (e.pointerId === this.activePointer) this.releasePointer();
    };
    const key = (e: KeyboardEvent) => {
      if (!this.internal || !["ArrowLeft", "ArrowRight", "ArrowUp", "ArrowDown"].includes(e.key))
        return;
      e.preventDefault();
      this.yaw = T.MathUtils.clamp(
        this.yaw + (e.key === "ArrowLeft" ? 0.08 : e.key === "ArrowRight" ? -0.08 : 0),
        -LOOK_YAW_LIMIT,
        LOOK_YAW_LIMIT,
      );
      this.pitch = T.MathUtils.clamp(
        this.pitch + (e.key === "ArrowUp" ? -0.08 : e.key === "ArrowDown" ? 0.08 : 0),
        LOOK_UP_LIMIT,
        LOOK_DOWN_LIMIT,
      );
      this.invalid();
    };
    for (const [name, fn] of [
      ["pointerdown", down],
      ["pointermove", move],
      ["pointerup", up],
      ["pointercancel", up],
      ["lostpointercapture", up],
      ["keydown", key],
    ] as const) {
      canvas.addEventListener(name, fn as EventListener);
      this.listeners.push(() => canvas.removeEventListener(name, fn as EventListener));
    }
    this.resize();
    this.frameSilo(false);
  }
  get internal() {
    return this.mode === "connected" || this.mode === "victim";
  }
  get hasPreviousView() {
    return !!this.previous;
  }
  setInspectionMode(enabled: boolean) {
    this.inspection = enabled;
    this.invalid();
  }
  setViewportInsets(
    insets: Partial<ViewportInsets>,
    width = this.canvas.clientWidth,
    height = this.canvas.clientHeight,
  ) {
    this.insets = { ...NO_INSETS, ...insets };
    this.width = Math.max(1, width);
    this.height = Math.max(1, height);
    this.updateProjection();
    if (this.focusBox && !this.internal) this.fitCurrentBox();
    this.invalid();
  }
  private updateProjection() {
    if (Object.values(this.insets).some((value) => value > 0))
      this.camera.setViewOffset(
        this.width,
        this.height,
        (this.insets.right - this.insets.left) / 2,
        (this.insets.bottom - this.insets.top) / 2,
        this.width,
        this.height,
      );
    else this.camera.clearViewOffset();
    this.camera.updateProjectionMatrix();
  }
  resize() {
    this.setViewportInsets(this.insets);
  }
  private remember() {
    this.previous = this.captureView();
  }
  captureView(): CameraViewSnapshot {
    return {
      position: this.camera.position.clone(),
      target: this.orbit.target.clone(),
      mode: this.mode,
      fov: this.camera.fov,
      near: this.camera.near,
      far: this.camera.far,
      inspection: this.inspection,
      minDistance: this.orbit.minDistance,
      maxDistance: this.orbit.maxDistance,
      rotateSpeed: this.orbit.rotateSpeed,
      panSpeed: this.orbit.panSpeed,
    };
  }
  restoreView() {
    const previous = this.previous;
    if (!previous) return false;
    this.previous = undefined;
    this.restoreCapturedView(previous);
    return true;
  }
  restoreCapturedView(view: CameraViewSnapshot) {
    this.releasePointer();
    this.mode = view.mode;
    this.inspection = view.inspection;
    this.following = false;
    this.focusBox = undefined;
    this.orbit.enabled = !this.internal;
    this.camera.fov = view.fov;
    this.camera.near = view.near;
    this.camera.far = view.far;
    this.orbit.minDistance = view.minDistance;
    this.orbit.maxDistance = view.maxDistance;
    this.orbit.rotateSpeed = view.rotateSpeed;
    this.orbit.panSpeed = view.panSpeed;
    this.destination.copy(view.position);
    this.target.copy(view.target);
    this.transitioning = !this.internal;
    this.updateProjection();
    this.invalid();
  }
  setMode(mode: CameraMode) {
    this.releasePointer();
    this.mode = mode;
    this.orbit.enabled = !this.internal;
    this.following = false;
    this.dragging = false;
    this.yaw = this.pitch = 0;
    this.camera.near = this.internal ? 0.025 : 0.08;
    this.camera.far = 500;
    this.camera.fov = this.internal ? 70 : 42;
    this.updateProjection();
    if (this.internal) {
      this.transitioning = false;
      this.focusBox = undefined;
      this.invalid();
    } else if (mode === "top") {
      this.setPreset("ring", this.lastFrame, false);
      this.mode = "top";
    } else this.frameIncident(this.lastFrame, false);
  }
  focusComponent(box: T.Box3, direction?: T.Vector3, remember = true) {
    if (box.isEmpty()) return;
    if (remember) this.remember();
    this.releasePointer();
    this.mode = "frontal";
    this.orbit.enabled = true;
    this.following = false;
    this.inspection = true;
    this.camera.fov = 42;
    this.focusBox = box.clone();
    this.focusDirection.copy(direction ?? this.camera.position.clone().sub(this.orbit.target));
    if (this.focusDirection.lengthSq() < 0.001) this.focusDirection.set(0.8, 0.3, 1);
    this.focusDirection.normalize();
    this.fitCurrentBox();
    this.invalid();
  }
  private fitCurrentBox() {
    if (!this.focusBox) return;
    this.focusBox.getCenter(this.target);
    const distance = fitBoxDistance(
      this.focusBox,
      this.focusDirection,
      this.camera.fov,
      this.camera.aspect,
      this.width,
      this.height,
      this.insets,
    );
    this.destination.copy(this.target).addScaledVector(this.focusDirection, distance);
    this.camera.near = T.MathUtils.clamp(distance / 500, 0.002, 0.12);
    this.camera.far = Math.max(150, distance * 5);
    this.orbit.minDistance = Math.max(0.035, distance * 0.12);
    this.orbit.maxDistance = Math.max(80, distance * 3);
    this.orbit.rotateSpeed = distance < 2 ? 0.36 : 0.55;
    this.orbit.panSpeed = distance < 2 ? 0.4 : 0.55;
    this.transitioning = true;
    this.updateProjection();
  }
  frameSilo(remember = true) {
    const r = SILO_CONFIG.externalEnvelope.value + 1;
    this.focusComponent(
      new T.Box3(new T.Vector3(-r, 0, -r), new T.Vector3(r, SILO_CONFIG.roofTop.value + 0.6, r)),
      new T.Vector3(0.9, 0.35, 1.15),
      remember,
    );
    this.inspection = false;
  }
  frameIncident(frame = this.lastFrame, remember = true) {
    const center = frame
      ? new T.Vector3(
          (frame.workers.A.position.x + frame.workers.B.position.x) / 2,
          frame.surfaceHeight,
          (frame.workers.A.position.z + frame.workers.B.position.z) / 2,
        )
      : new T.Vector3(0, SILO_CONFIG.initialSurface.value, INCIDENT_CENTRES[0]!.z);
    this.focusComponent(
      new T.Box3(
        center.clone().add(new T.Vector3(-2, -0.9, -1)),
        center.clone().add(new T.Vector3(2, 2.3, 1.2)),
      ),
      // The technical section removes the +Z half. Look toward the incident
      // from that opening, rather than through the intact rear (-Z) wall.
      new T.Vector3().fromArray(INCIDENT_VIEW_DIRECTION),
      remember,
    );
  }
  setPreset(preset: InspectionPreset, frame = this.lastFrame, remember = true) {
    if (preset === "general") {
      this.frameSilo(remember);
      return;
    }
    if (preset === "internal" || preset === "ring") {
      const r = SILO_CONFIG.radius.value;
      this.focusComponent(
        new T.Box3(
          new T.Vector3(-r, SILO_CONFIG.initialSurface.value - 0.5, -r),
          new T.Vector3(r, SILO_CONFIG.ringY.value + 0.7, r),
        ),
        preset === "ring" ? new T.Vector3(0.001, 1, 0.001) : new T.Vector3(0.7, 0.6, 1),
        remember,
      );
      return;
    }
    const point =
      preset === "manhole"
        ? new T.Vector3(
            SILO_CONFIG.manholeX.value,
            SILO_CONFIG.manholeY.value,
            SILO_CONFIG.manholeZ.value,
          )
        : preset === "anchor"
          ? new T.Vector3(0.65, SILO_CONFIG.ringY.value, SILO_CONFIG.ringRadius.value)
          : preset === "dorsal" && frame
            ? new T.Vector3(
                frame.workers.A.harness.x,
                frame.workers.A.harness.y,
                frame.workers.A.harness.z,
              )
            : frame
              ? new T.Vector3(
                  frame.connection.anchor.x,
                  frame.connection.anchor.y,
                  frame.connection.anchor.z,
                )
              : new T.Vector3(0, SILO_CONFIG.ringY.value - 0.09, SILO_CONFIG.ringRadius.value);
    const halfSize =
      preset === "trolley" ? 0.23 : preset === "anchor" ? 1.15 : preset === "dorsal" ? 0.7 : 1.65;
    const radial = new T.Vector3(point.x, 0, point.z).normalize().multiplyScalar(-1);
    if (preset === "manhole") {
      // Look down from the outer access side, above the roof's slope. A low
      // inside view lets the cone hide the real opening beneath its open lid.
      radial.set(point.x, 0, point.z).normalize();
      const tangent = new T.Vector3(radial.z, 0, -radial.x);
      radial.addScaledVector(tangent, 0.45);
      radial.y = 1.6;
    } else radial.y = 0.35;
    this.focusComponent(
      new T.Box3(point.clone().addScalar(-halfSize), point.clone().addScalar(halfSize)),
      radial,
      remember,
    );
  }
  /** Legacy point focus, now scale-aware and unrestricted around the selected assembly. */
  focus(point: T.Vector3, rear = false) {
    const extent = rear ? 0.7 : 1;
    this.focusComponent(
      new T.Box3(point.clone().addScalar(-extent), point.clone().addScalar(extent)),
      rear ? new T.Vector3(0.65, 0.25, -0.95) : undefined,
    );
  }
  followTrolley(enabled: boolean) {
    this.following = enabled;
    if (enabled) {
      this.remember();
      this.mode = "frontal";
      this.orbit.enabled = true;
      this.inspection = true;
      this.focusBox = undefined;
      this.orbit.minDistance = 0.035;
      this.orbit.maxDistance = Math.max(15, this.camera.position.distanceTo(this.orbit.target));
      this.orbit.rotateSpeed = 0.36;
      this.orbit.panSpeed = 0.4;
      this.camera.near = 0.002;
      this.updateProjection();
    }
    this.invalid();
  }
  update(dt: number, frame: SiloFrame, eye?: (id: "A" | "B", out: T.Vector3) => void) {
    this.lastFrame = frame;
    if (this.internal) {
      const id = this.mode === "connected" ? "A" : "B",
        worker = frame.workers[id];
      if (eye) eye(id, this.eyes);
      else this.eyes.set(worker.eye.x, worker.eye.y, worker.eye.z);
      this.camera.position.copy(this.eyes);
      const other = frame.workers[id === "A" ? "B" : "A"];
      const base = Math.atan2(
        other.position.x - worker.position.x,
        other.position.z - worker.position.z,
      );
      this.look.set(
        Math.sin(base + this.yaw) * Math.cos(this.pitch),
        -Math.sin(this.pitch) - 0.06,
        Math.cos(base + this.yaw) * Math.cos(this.pitch),
      );
      this.target.copy(this.eyes).add(this.look);
      this.camera.lookAt(this.target);
      return false;
    }
    if (this.following) {
      // Let the damped transition approach from the previous general view;
      // applying the close-up limit immediately teleports a distant camera.
      this.orbit.maxDistance = Math.max(15, this.camera.position.distanceTo(this.orbit.target));
      this.target.set(
        frame.connection.anchor.x,
        frame.connection.anchor.y,
        frame.connection.anchor.z,
      );
      trolleyCameraOffset(this.target, this.followingOffset);
      this.destination.copy(this.target).add(this.followingOffset);
      this.transitioning = true;
    }
    if (this.transitioning) {
      const k = this.reduced ? 1 : 1 - Math.exp(-Math.min(dt, 0.1) * 7);
      this.camera.position.lerp(this.destination, k);
      this.orbit.target.lerp(this.target, k);
      if (
        this.camera.position.distanceTo(this.destination) < 0.002 &&
        this.orbit.target.distanceTo(this.target) < 0.002
      ) {
        this.camera.position.copy(this.destination);
        this.orbit.target.copy(this.target);
        this.transitioning = false;
      }
    }
    const changed = this.orbit.update();
    if (!this.inspection) {
      this.scratch.copy(this.camera.position);
      constrainExterior(
        this.camera.position,
        SILO_CONFIG.externalEnvelope.value,
        SILO_CONFIG.bodyTop.value,
        SILO_CONFIG.roofTop.value,
        SILO_CONFIG.collarRadius.value,
      );
      if (!this.scratch.equals(this.camera.position)) this.camera.lookAt(this.orbit.target);
    }
    return this.transitioning || changed;
  }
  dispose() {
    this.releasePointer();
    this.listeners.forEach((remove) => remove());
    this.orbit.dispose();
  }
  private releasePointer() {
    const id = this.activePointer;
    this.activePointer = null;
    this.dragging = false;
    if (id !== null && this.canvas.hasPointerCapture(id)) this.canvas.releasePointerCapture(id);
  }
}
