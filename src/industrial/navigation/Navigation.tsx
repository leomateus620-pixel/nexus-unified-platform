import { useEffect, useMemo, useRef } from "react";
import type { ComponentRef, MutableRefObject } from "react";
import { useFrame, useThree } from "@react-three/fiber";
import { OrbitControls } from "@react-three/drei";
import { Euler, MathUtils, OrthographicCamera, PerspectiveCamera, Vector3 } from "three";
import { byId, site, vec } from "../data";
import type { CameraRequest } from "../types";
import { moveWithCollisions } from "./collision";
import { diagnostics } from "../performance/metrics";
export type Movement = { forward: number; side: number; turn: number };
export function Navigation({
  request,
  reducedMotion,
  movement,
  onExitWalk,
  onPosition,
}: {
  request: CameraRequest;
  reducedMotion: boolean;
  movement: MutableRefObject<Movement>;
  onExitWalk: () => void;
  onPosition: (x: number, z: number) => void;
}) {
  const { set, get, size, gl, invalidate } = useThree();
  const controls = useRef<ComponentRef<typeof OrbitControls>>(null);
  const cameras = useMemo(
    () => ({
      perspective: new PerspectiveCamera(43, 1, 0.15, 2200),
      orthographic: new OrthographicCamera(-100, 100, 100, -100, 0.15, 900),
    }),
    [],
  );
  const transition = useRef<{
    from: Vector3;
    to: Vector3;
    targetFrom: Vector3;
    targetTo: Vector3;
    elapsed: number;
    duration: number;
    lift: number;
  } | null>(null);
  const target = useRef(new Vector3());
  const keys = useRef(new Set<string>());
  const dragging = useRef(false);
  const initialized = useRef(false);
  const yawPitch = useRef({ yaw: 0, pitch: 0 });
  const notifyAt = useRef(0);
  const walk = request.id === "walk";
  const vectors = useMemo(
    () => ({
      forward: new Vector3(),
      right: new Vector3(),
      up: new Vector3(0, 1, 0),
      euler: new Euler(0, 0, 0, "YXZ"),
    }),
    [],
  );
  useEffect(() => {
    cameras.perspective.aspect = size.width / size.height;
    cameras.perspective.updateProjectionMatrix();
    const aspect = size.width / size.height;
    const span = site.cameras.B.span;
    const halfHeight = (span / 2) * Math.max(1, 1448 / 1086 / aspect);
    cameras.orthographic.left = -halfHeight * aspect;
    cameras.orthographic.right = halfHeight * aspect;
    cameras.orthographic.top = halfHeight;
    cameras.orthographic.bottom = -halfHeight;
    cameras.orthographic.updateProjectionMatrix();
    invalidate();
  }, [cameras, size, invalidate]);
  useEffect(() => {
    const preset = request.id === "focus" ? null : site.cameras[request.id];
    const focus = request.elementId ? byId.get(request.elementId) : null;
    const from = get().camera.position.clone();
    const next = request.id === "B" ? cameras.orthographic : cameras.perspective;
    const to = new Vector3(
      ...(preset
        ? vec(preset.position)
        : focus
          ? [
              focus.position[0] + 28,
              Number(focus.geometry["bodyHeight"] ?? focus.geometry["height"] ?? 8) + 20,
              focus.position[2] + 32,
            ]
          : vec(site.cameras.overview.position)),
    );
    const toTarget = new Vector3(
      ...(preset
        ? vec(preset.target)
        : focus
          ? [
              focus.position[0],
              Number(focus.geometry["bodyHeight"] ?? focus.geometry["height"] ?? 6) * 0.5,
              focus.position[2],
            ]
          : [0, 0, 0]),
    );
    cameras.perspective.fov = preset?.fov ?? 43;
    cameras.perspective.near = walk || request.id === "D" ? 0.15 : 1.2;
    cameras.perspective.updateProjectionMatrix();
    set({ camera: next });
    if (!initialized.current || reducedMotion || request.id === "B" || walk) {
      next.position.copy(to);
      target.current.copy(toTarget);
      next.lookAt(target.current);
      transition.current = null;
    } else {
      next.position.copy(from);
      transition.current = {
        from,
        to,
        targetFrom: target.current.clone(),
        targetTo: toTarget,
        elapsed: 0,
        duration: 1.7,
        lift: Math.max(48, from.y, to.y),
      };
    }
    initialized.current = true;
    if (controls.current) {
      controls.current.target.copy(target.current);
      controls.current.update();
    }
    const dir = toTarget.clone().sub(to).normalize();
    yawPitch.current = { yaw: Math.atan2(-dir.x, -dir.z), pitch: Math.asin(dir.y) };
    keys.current.clear();
    invalidate();
  }, [request, cameras, get, set, invalidate, reducedMotion, walk]);
  useEffect(() => {
    const canvas = gl.domElement;
    const stop = () => {
      transition.current = null;
      invalidate();
    };
    const motion = () => invalidate();
    const down = (e: PointerEvent) => {
      stop();
      if (walk) {
        dragging.current = true;
        canvas.setPointerCapture(e.pointerId);
      }
    };
    const up = () => {
      dragging.current = false;
    };
    const move = (e: PointerEvent) => {
      if (!walk || (!dragging.current && document.pointerLockElement !== canvas)) return;
      yawPitch.current.yaw -= e.movementX * 0.003;
      yawPitch.current.pitch = MathUtils.clamp(
        yawPitch.current.pitch - e.movementY * 0.003,
        -1.3,
        1.3,
      );
      invalidate();
    };
    const keydown = (e: KeyboardEvent) => {
      if (document.querySelector(".industrial-help")) return;
      if (e.key === "Escape" && walk) {
        document.exitPointerLock?.();
        onExitWalk();
        return;
      }
      if (!walk || (e.target instanceof HTMLElement && e.target.closest("input,select,textarea")))
        return;
      if (
        ["w", "a", "s", "d", "arrowup", "arrowdown", "arrowleft", "arrowright"].includes(
          e.key.toLowerCase(),
        )
      ) {
        e.preventDefault();
        keys.current.add(e.key.toLowerCase());
        invalidate();
      }
    };
    const keyup = (e: KeyboardEvent) => {
      keys.current.delete(e.key.toLowerCase());
    };
    const blur = () => {
      keys.current.clear();
      dragging.current = false;
      movement.current = { forward: 0, side: 0, turn: 0 };
    };
    canvas.addEventListener("pointerdown", down);
    canvas.addEventListener("pointerup", up);
    canvas.addEventListener("pointercancel", up);
    canvas.addEventListener("pointermove", move);
    canvas.addEventListener("wheel", stop, { passive: true });
    window.addEventListener("keydown", keydown);
    window.addEventListener("keyup", keyup);
    window.addEventListener("blur", blur);
    window.addEventListener("industrial-move", motion);
    return () => {
      canvas.removeEventListener("pointerdown", down);
      canvas.removeEventListener("pointerup", up);
      canvas.removeEventListener("pointercancel", up);
      canvas.removeEventListener("pointermove", move);
      canvas.removeEventListener("wheel", stop);
      window.removeEventListener("keydown", keydown);
      window.removeEventListener("keyup", keyup);
      window.removeEventListener("blur", blur);
      window.removeEventListener("industrial-move", motion);
      if (document.pointerLockElement === canvas) document.exitPointerLock();
    };
  }, [gl, walk, onExitWalk, invalidate, movement]);
  useFrame((state, delta) => {
    const dt = Math.min(delta, 0.05),
      camera = state.camera,
      c = controls.current;
    if (c) c.enabled = !walk && !transition.current;
    const t = transition.current;
    if (t) {
      t.elapsed += dt;
      const progress = Math.min(1, t.elapsed / t.duration);
      const ease = MathUtils.smoothstep(progress, 0, 1);
      // Lift -> traverse above highest structure -> descend. Same scene and axes.
      camera.position.lerpVectors(t.from, t.to, ease);
      camera.position.y =
        progress < 0.25
          ? MathUtils.lerp(t.from.y, t.lift, MathUtils.smoothstep(progress, 0, 0.25))
          : progress > 0.75
            ? MathUtils.lerp(t.lift, t.to.y, MathUtils.smoothstep(progress, 0.75, 1))
            : t.lift;
      if (progress < 0.25) {
        camera.position.x = t.from.x;
        camera.position.z = t.from.z;
      } else if (progress > 0.75) {
        camera.position.x = t.to.x;
        camera.position.z = t.to.z;
      } else {
        const p = MathUtils.smoothstep(progress, 0.25, 0.75);
        camera.position.x = MathUtils.lerp(t.from.x, t.to.x, p);
        camera.position.z = MathUtils.lerp(t.from.z, t.to.z, p);
      }
      target.current.lerpVectors(t.targetFrom, t.targetTo, ease);
      camera.lookAt(target.current);
      c?.target.copy(target.current);
      if (progress === 1) {
        transition.current = null;
        c?.update();
      }
      invalidate();
    }
    if (walk) {
      const k = keys.current;
      let f =
        movement.current.forward +
        (k.has("w") || k.has("arrowup") ? 1 : 0) -
        (k.has("s") || k.has("arrowdown") ? 1 : 0);
      let s =
        movement.current.side +
        (k.has("d") || k.has("arrowright") ? 1 : 0) -
        (k.has("a") || k.has("arrowleft") ? 1 : 0);
      const length = Math.max(1, Math.hypot(f, s));
      f /= length;
      s /= length;
      yawPitch.current.yaw += movement.current.turn * dt;
      vectors.euler.set(yawPitch.current.pitch, yawPitch.current.yaw, 0);
      camera.quaternion.setFromEuler(vectors.euler);
      vectors.forward.set(-Math.sin(yawPitch.current.yaw), 0, -Math.cos(yawPitch.current.yaw));
      vectors.right.crossVectors(vectors.forward, vectors.up);
      const dx = (vectors.forward.x * f + vectors.right.x * s) * dt * 5,
        dz = (vectors.forward.z * f + vectors.right.z * s) * dt * 5;
      const [x, z] = moveWithCollisions([camera.position.x, camera.position.z], [dx, dz]);
      camera.position.set(x, 1.7, z);
      if (f || s || movement.current.turn) invalidate();
    } else if (c && !t) {
      c.target.x = MathUtils.clamp(c.target.x, -100, 105);
      c.target.z = MathUtils.clamp(c.target.z, -90, 90);
      c.target.y = MathUtils.clamp(c.target.y, 0, 35);
      camera.position.y = Math.max(0.5, camera.position.y);
      target.current.copy(c.target);
    }
    diagnostics.camera = camera.position.toArray();
    if (state.clock.elapsedTime - notifyAt.current > 0.35) {
      notifyAt.current = state.clock.elapsedTime;
      onPosition(camera.position.x, camera.position.z);
    }
  });
  return (
    <OrbitControls
      key={request.serial}
      camera={request.id === "B" ? cameras.orthographic : cameras.perspective}
      ref={controls}
      target={target.current}
      makeDefault
      enableDamping
      dampingFactor={0.1}
      minDistance={4}
      maxDistance={1100}
      maxPolarAngle={request.id === "B" ? 0 : Math.PI - 0.1}
      minPolarAngle={request.id === "B" ? 0 : 0.035}
      enableRotate={request.id !== "B"}
      screenSpacePanning={false}
      zoomSpeed={0.7}
      rotateSpeed={0.65}
      minZoom={0.65}
      maxZoom={8}
      enabled={!walk}
      onChange={() => invalidate()}
    />
  );
}
