import * as T from "three";
import { OrbitControls } from "three/examples/jsm/controls/OrbitControls.js";
import type { CameraMode, SiloFrame } from "./simulation";

const LOOK_YAW_LIMIT = 2.2;
const LOOK_UP_LIMIT = -1.3;
const LOOK_DOWN_LIMIT = 0.9;

/** Camera-only authority. No time, domain position or grain mutation. */
export class CameraController {
  readonly orbit: OrbitControls;
  mode: CameraMode = "frontal";
  private destination = new T.Vector3();
  private target = new T.Vector3();
  private eyes = new T.Vector3();
  private look = new T.Vector3();
  private yaw = 0;
  private pitch = 0;
  private dragging = false;
  private activePointer: number | null = null;
  private lastX = 0;
  private lastY = 0;
  private transitioning = true;
  private reduced = window.matchMedia("(prefers-reduced-motion: reduce)").matches;
  private listeners: (() => void)[] = [];
  private invalid: () => void;
  constructor(
    private camera: T.PerspectiveCamera,
    private canvas: HTMLCanvasElement,
    invalidate: () => void,
  ) {
    this.invalid = invalidate;
    this.orbit = new OrbitControls(camera, canvas);
    this.orbit.enableDamping = true;
    this.orbit.dampingFactor = 0.12;
    this.orbit.enablePan = false;
    this.orbit.minDistance = 2;
    this.orbit.maxDistance = 32;
    this.orbit.maxPolarAngle = Math.PI * 0.52;
    this.orbit.minAzimuthAngle = -0.65;
    this.orbit.maxAzimuthAngle = 0.65;
    const change = () => invalidate();
    const start = () => {
      this.transitioning = false;
    };
    this.orbit.addEventListener("change", change);
    this.orbit.addEventListener("start", start);
    this.listeners.push(
      () => this.orbit.removeEventListener("change", change),
      () => this.orbit.removeEventListener("start", start),
    );
    const down = (e: PointerEvent) => {
      if (this.internal && this.activePointer === null) {
        this.dragging = true;
        this.activePointer = e.pointerId;
        this.lastX = e.clientX;
        this.lastY = e.clientY;
        canvas.setPointerCapture(e.pointerId);
      }
    };
    const move = (e: PointerEvent) => {
      if (!this.dragging || e.pointerId !== this.activePointer) return;
      this.yaw = Math.max(
        -LOOK_YAW_LIMIT,
        Math.min(LOOK_YAW_LIMIT, this.yaw - (e.clientX - this.lastX) * 0.004),
      );
      this.pitch = Math.max(
        LOOK_UP_LIMIT,
        Math.min(LOOK_DOWN_LIMIT, this.pitch + (e.clientY - this.lastY) * 0.004),
      );
      this.lastX = e.clientX;
      this.lastY = e.clientY;
      invalidate();
    };
    const up = (event: PointerEvent) => {
      if (event.pointerId === this.activePointer) this.releasePointer();
    };
    const key = (e: KeyboardEvent) => {
      if (!this.internal) return;
      const delta = 0.08;
      if (["ArrowLeft", "ArrowRight", "ArrowUp", "ArrowDown"].includes(e.key)) {
        e.preventDefault();
        this.yaw = Math.max(
          -LOOK_YAW_LIMIT,
          Math.min(
            LOOK_YAW_LIMIT,
            this.yaw + (e.key === "ArrowLeft" ? delta : e.key === "ArrowRight" ? -delta : 0),
          ),
        );
        this.pitch = Math.max(
          LOOK_UP_LIMIT,
          Math.min(
            LOOK_DOWN_LIMIT,
            this.pitch + (e.key === "ArrowUp" ? -delta : e.key === "ArrowDown" ? delta : 0),
          ),
        );
        invalidate();
      }
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
    this.setMode("frontal");
  }
  get internal() {
    return this.mode === "connected" || this.mode === "victim";
  }
  setMode(mode: CameraMode) {
    this.releasePointer();
    this.mode = mode;
    this.orbit.enabled = !this.internal;
    this.orbit.minDistance = 2;
    this.orbit.minAzimuthAngle = -0.65;
    this.orbit.maxAzimuthAngle = 0.65;
    this.dragging = false;
    this.yaw = this.pitch = 0;
    this.camera.near = this.internal ? 0.035 : 0.1;
    this.camera.far = 100;
    this.camera.fov = this.internal ? 70 : 42;
    this.camera.updateProjectionMatrix();
    if (mode === "top") {
      this.destination.set(0.02, 16.7, 0.02);
      this.target.set(0, 6.2, 0);
    } else {
      const wide = Math.max(1, 0.85 / this.camera.aspect);
      this.destination.set(7 * wide, 7.8 + wide, 15 * wide);
      this.target.set(0, 5.65, 0);
    }
    this.transitioning = !this.internal;
    this.invalid();
  }
  resize() {
    if (!this.internal) this.setMode(this.mode);
  }
  focus(point: T.Vector3, rear = false) {
    if (this.internal) this.setMode("frontal");
    this.orbit.minDistance = rear ? 0.65 : 2;
    this.orbit.minAzimuthAngle = rear ? -Infinity : -0.65;
    this.orbit.maxAzimuthAngle = rear ? Infinity : 0.65;
    this.target.copy(point);
    this.destination
      .copy(point)
      .add(rear ? new T.Vector3(0.65, 0.25, -0.95) : new T.Vector3(1.6, 1.0, 2.6));
    this.transitioning = true;
    this.invalid();
  }
  update(dt: number, frame: SiloFrame, eye?: (id: "A" | "B", out: T.Vector3) => void) {
    if (this.internal) {
      const id = this.mode === "connected" ? "A" : "B",
        w = frame.workers[id];
      if (eye) eye(id, this.eyes);
      else this.eyes.set(w.eye.x, w.eye.y, w.eye.z);
      // Use current eyes immediately on seek; only orientation is gently damped.
      this.camera.position.copy(this.eyes);
      const other = frame.workers[id === "A" ? "B" : "A"];
      const base = Math.atan2(other.position.x - w.position.x, other.position.z - w.position.z);
      this.look.set(
        Math.sin(base + this.yaw) * Math.cos(this.pitch),
        -Math.sin(this.pitch) - 0.06,
        Math.cos(base + this.yaw) * Math.cos(this.pitch),
      );
      this.target.copy(this.eyes).add(this.look);
      this.camera.lookAt(this.target);
      return false;
    }
    if (this.transitioning) {
      const k = this.reduced ? 1 : 1 - Math.exp(-dt * 7);
      this.camera.position.lerp(this.destination, k);
      this.orbit.target.lerp(this.target, k);
      if (this.camera.position.distanceTo(this.destination) < 0.015) {
        this.camera.position.copy(this.destination);
        this.orbit.target.copy(this.target);
        this.transitioning = false;
      }
    }
    const changed = this.orbit.update();
    return this.transitioning || changed;
  }
  dispose() {
    this.releasePointer();
    this.listeners.forEach((f) => f());
    this.orbit.dispose();
  }
  private releasePointer() {
    const id = this.activePointer;
    this.activePointer = null;
    this.dragging = false;
    if (id !== null && this.canvas.hasPointerCapture(id)) this.canvas.releasePointerCapture(id);
  }
}
