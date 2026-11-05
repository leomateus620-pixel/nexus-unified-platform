import { useEffect, useMemo, useRef, useState, type ComponentRef } from "react";
import { Canvas, useFrame, useThree, type ThreeEvent } from "@react-three/fiber";
import { OrbitControls, Html } from "@react-three/drei";
import * as T from "three";
import type { CameraMode, SceneManifest, SceneObject, Vec3 } from "./types";
import { createUnitModel, disposeUnitModel } from "./model";
import { SelectionGesture } from "./gestures";
import { UnitEnvironment } from "./UnitEnvironment";
import { visualGroundHeight } from "./terrain";

export type CameraRequest = {
  mode: CameraMode;
  serial: number;
  focus?: string;
  view?: keyof SceneManifest["cameras"];
};
export type CameraSnapshot = {
  mode: CameraMode;
  position: Vec3;
  target: Vec3;
  zoom: number;
  fov?: number;
};
type Props = {
  manifest: SceneManifest;
  objects: SceneObject[];
  selected: string;
  request: CameraRequest;
  onSelect: (key: string) => void;
  onFail: () => void;
  onCamera?: (value: CameraSnapshot) => void;
  initialCamera?: CameraSnapshot | undefined;
  economy?: boolean;
  interactive?: boolean;
};
function Navigation({
  manifest,
  request,
  onCamera,
  initialCamera,
  interactive = true,
}: Pick<Props, "manifest" | "request" | "onCamera" | "initialCamera" | "interactive">) {
  const { get, set, size, invalidate, gl } = useThree();
  const controls = useRef<ComponentRef<typeof OrbitControls>>(null);
  // Drei recreates controls when the active camera changes. Keep its target
  // outside that instance so the first gesture cannot jump back to world zero.
  const navigationTarget = useRef(new T.Vector3(...manifest.cameras.normal.target));
  const cameras = useMemo(
    () => ({
      perspective: new T.PerspectiveCamera(43, 1, 0.12, 1400),
      orthographic: new T.OrthographicCamera(-100, 100, 100, -100, 0.12, 1400),
    }),
    [],
  );
  const initialized = useRef(false),
    lastMode = useRef(request.mode),
    transition = useRef<{
      from: T.Vector3;
      to: T.Vector3;
      targetFrom: T.Vector3;
      targetTo: T.Vector3;
      time: number;
    } | null>(null);
  useEffect(() => {
    cameras.perspective.aspect = size.width / size.height;
    cameras.perspective.updateProjectionMatrix();
    const half = 100;
    cameras.orthographic.left = (-half * size.width) / size.height;
    cameras.orthographic.right = (half * size.width) / size.height;
    cameras.orthographic.top = half;
    cameras.orthographic.bottom = -half;
    cameras.orthographic.updateProjectionMatrix();
    invalidate();
  }, [cameras, size, invalidate]);
  useEffect(() => {
    const current = get().camera,
      orbit = controls.current;
    const next = request.mode === "superior" ? cameras.orthographic : cameras.perspective;
    const target = orbit?.target.clone() ?? new T.Vector3(...manifest.cameras.normal.target);
    const toTarget = target.clone(),
      to = current.position.clone();
    const changedMode = lastMode.current !== request.mode;
    const distance =
      current instanceof T.OrthographicCamera
        ? 200 / current.zoom / (2 * Math.tan(T.MathUtils.degToRad(43) / 2))
        : current.position.distanceTo(target);
    if (!initialized.current && initialCamera) {
      to.set(...initialCamera.position);
      toTarget.set(...initialCamera.target);
      next.zoom = initialCamera.zoom;
      if (initialCamera.fov && Number.isFinite(initialCamera.fov))
        cameras.perspective.fov = T.MathUtils.clamp(initialCamera.fov, 25, 80);
    } else if (!initialized.current || (!changedMode && !request.focus) || request.view) {
      const preset =
        manifest.cameras[request.view ?? (request.mode === "angular" ? "angular" : "normal")];
      to.set(...preset.position);
      toTarget.set(...preset.target);
      cameras.perspective.fov = preset.fov;
      if (!request.view || request.view === "unit")
        to.sub(toTarget)
          .multiplyScalar(Math.max(1, 0.9 / (size.width / size.height)))
          .add(toTarget);
    } else if (request.focus) {
      const silo = manifest.silos.find((s) => s.key === request.focus);
      if (silo) {
        const height = silo.clearance + silo.cone + silo.straight + silo.roof;
        toTarget.set(silo.position[0], height / 2, silo.position[2]);
        const distance = height * (size.width < size.height ? 2 : 1.35);
        to.copy(toTarget).add(new T.Vector3(-0.8, 0.4, 0.8).normalize().multiplyScalar(distance));
      }
    }
    if (request.mode === "superior") {
      const d = initialized.current && changedMode ? distance : to.distanceTo(toTarget);
      next.zoom = Math.max(0.3, 200 / (2 * d * Math.tan(T.MathUtils.degToRad(43) / 2)));
      to.copy(toTarget).add(new T.Vector3(0, 250, 0.001));
    } else if (changedMode) {
      const direction = current.position.clone().sub(target);
      const azimuth = orbit?.getAzimuthalAngle() ?? -0.6;
      const polar =
        request.mode === "angular"
          ? 0.85
          : Math.max(0.45, Math.min(1.3, new T.Spherical().setFromVector3(direction).phi));
      to.copy(toTarget).add(new T.Vector3().setFromSphericalCoords(distance, polar, azimuth));
      next.zoom = 1;
    }
    next.updateProjectionMatrix();
    navigationTarget.current.copy(toTarget);
    set({ camera: next });
    const reduced = window.matchMedia("(prefers-reduced-motion: reduce)").matches;
    if (!initialized.current || reduced || changedMode) {
      next.position.copy(to);
      next.lookAt(toTarget);
      orbit?.target.copy(toTarget);
      transition.current = null;
    } else
      transition.current = {
        from: current.position.clone(),
        to,
        targetFrom: target,
        targetTo: toTarget,
        time: 0,
      };
    initialized.current = true;
    lastMode.current = request.mode;
    orbit?.update();
    invalidate();
  }, [request, manifest, cameras, get, set, invalidate, initialCamera, size.width, size.height]);
  useFrame((_, delta) => {
    if (transition.current) {
      const t = transition.current;
      t.time += delta;
      const a = Math.min(1, t.time / 0.28),
        smooth = a * a * (3 - 2 * a);
      get().camera.position.lerpVectors(t.from, t.to, smooth);
      controls.current?.target.lerpVectors(t.targetFrom, t.targetTo, smooth);
      controls.current?.update();
      if (a === 1) transition.current = null;
      invalidate();
    }
  });
  useEffect(() => {
    const canvas = gl.domElement;
    canvas.tabIndex = 0;
    canvas.setAttribute(
      "aria-label",
      "Mapa 3D da unidade. Setas deslocam, mais e menos aproximam. Use a lista para selecionar um local.",
    );
    const key = (event: KeyboardEvent) => {
      const c = controls.current;
      if (
        !interactive ||
        !c ||
        !["ArrowLeft", "ArrowRight", "ArrowUp", "ArrowDown", "+", "-", "="].includes(event.key)
      )
        return;
      event.preventDefault();
      transition.current = null;
      if (["+", "=", "-"].includes(event.key)) {
        const k = event.key === "-" ? 1.15 : 1 / 1.15,
          cam = get().camera;
        if (cam instanceof T.OrthographicCamera) {
          cam.zoom = T.MathUtils.clamp(cam.zoom / k, 0.3, 80);
          cam.updateProjectionMatrix();
        } else cam.position.sub(c.target).multiplyScalar(k).add(c.target);
      } else {
        const shift = new T.Vector3(
          event.key === "ArrowLeft" ? -2 : event.key === "ArrowRight" ? 2 : 0,
          0,
          event.key === "ArrowUp" ? -2 : event.key === "ArrowDown" ? 2 : 0,
        );
        c.target.add(shift);
        get().camera.position.add(shift);
      }
      c.update();
      invalidate();
    };
    canvas.addEventListener("keydown", key);
    return () => canvas.removeEventListener("keydown", key);
  }, [get, gl, invalidate, interactive]);
  return (
    <OrbitControls
      ref={controls}
      enabled={interactive}
      target={navigationTarget.current}
      makeDefault
      enableDamping
      dampingFactor={0.14}
      minDistance={1.4}
      maxDistance={
        Math.hypot(
          manifest.bounds.max[0] - manifest.bounds.min[0],
          manifest.bounds.max[2] - manifest.bounds.min[2],
        ) * 2.3
      }
      minZoom={0.3}
      maxZoom={80}
      minPolarAngle={
        request.mode === "superior" ? 0.00001 : request.mode === "angular" ? 0.45 : 0.04
      }
      maxPolarAngle={
        request.mode === "superior" ? 0.00001 : request.mode === "angular" ? 1.22 : Math.PI * 0.78
      }
      screenSpacePanning={false}
      zoomToCursor
      onStart={() => {
        transition.current = null;
      }}
      onChange={() => {
        const camera = get().camera,
          c = controls.current;
        if (!c) return;
        c.target.x = T.MathUtils.clamp(
          c.target.x,
          manifest.bounds.min[0] - 45,
          manifest.bounds.max[0] + 45,
        );
        c.target.z = T.MathUtils.clamp(
          c.target.z,
          manifest.bounds.min[2] - 45,
          manifest.bounds.max[2] + 45,
        );
        c.target.y = T.MathUtils.clamp(c.target.y, 0.5, 32);
        navigationTarget.current.copy(c.target);
        camera.position.y = Math.max(
          visualGroundHeight(camera.position.x, camera.position.z) + 0.75,
          camera.position.y,
        );
        gl.domElement.dataset["camera"] = JSON.stringify({
          mode: request.mode,
          position: camera.position.toArray(),
          target: c.target.toArray(),
          zoom: camera.zoom,
        });
        invalidate();
      }}
      onEnd={() => {
        if (controls.current)
          onCamera?.({
            mode: request.mode,
            position: get().camera.position.toArray() as Vec3,
            target: controls.current.target.toArray() as Vec3,
            zoom: get().camera.zoom,
            ...(get().camera instanceof T.PerspectiveCamera
              ? { fov: (get().camera as T.PerspectiveCamera).fov }
              : {}),
          });
      }}
    />
  );
}
function Atmosphere() {
  const { scene, invalidate } = useThree();
  useEffect(() => {
    const c = document.createElement("canvas");
    c.width = 32;
    c.height = 512;
    const ctx = c.getContext("2d")!,
      g = ctx.createLinearGradient(0, 0, 0, 512);
    for (const [stop, color] of [
      [0, "#3679b7"],
      [0.3, "#68a4d3"],
      [0.46, "#b4d0e2"],
      [0.5, "#e1eaf0"],
      [1, "#e1eaf0"],
    ] as const)
      g.addColorStop(stop, color);
    ctx.fillStyle = g;
    ctx.fillRect(0, 0, 32, 512);
    const t = new T.CanvasTexture(c);
    t.colorSpace = T.SRGBColorSpace;
    t.mapping = T.EquirectangularReflectionMapping;
    scene.background = t;
    invalidate();
    return () => {
      if (scene.background === t) scene.background = null;
      t.dispose();
    };
  }, [scene, invalidate]);
  return null;
}
function Content(props: Props) {
  const { manifest, objects, selected, onSelect, onFail } = props;
  const { gl, invalidate } = useThree();
  const sunTarget = useMemo(() => {
    const target = new T.Object3D();
    target.position.set(32, 0, -15);
    return target;
  }, []);
  const model = useMemo(
    () => createUnitModel(manifest, !!props.economy),
    [manifest, props.economy],
  );
  const gesture = useRef(new SelectionGesture());
  const [highlight, setHighlight] = useState(false);
  useEffect(() => {
    setHighlight(!!selected);
    const timer = setTimeout(() => setHighlight(false), 3000);
    return () => clearTimeout(timer);
  }, [selected]);
  useEffect(() => () => disposeUnitModel(model), [model]);
  useEffect(() => {
    const canvas = gl.domElement;
    const down = (e: PointerEvent) =>
      gesture.current.down(e.pointerId, e.clientX, e.clientY, performance.now());
    const move = (e: PointerEvent) => gesture.current.move(e.pointerId, e.clientX, e.clientY);
    const up = (e: PointerEvent) => gesture.current.up(e.pointerId, performance.now());
    const cancel = () => gesture.current.cancel();
    const lost = (event: Event) => {
      event.preventDefault();
      onFail();
    };
    canvas.addEventListener("pointerdown", down, true);
    canvas.addEventListener("pointermove", move, true);
    canvas.addEventListener("pointerup", up, true);
    canvas.addEventListener("pointercancel", cancel);
    canvas.addEventListener("webglcontextlost", lost);
    canvas.dataset["ready"] = "true";
    invalidate();
    return () => {
      canvas.removeEventListener("pointerdown", down, true);
      canvas.removeEventListener("pointermove", move, true);
      canvas.removeEventListener("pointerup", up, true);
      canvas.removeEventListener("pointercancel", cancel);
      canvas.removeEventListener("webglcontextlost", lost);
    };
  }, [gl, onFail, invalidate]);
  useFrame(() => {
    gl.domElement.dataset["frameTime"] = performance.now().toFixed(3);
    gl.domElement.dataset["metrics"] = JSON.stringify({
      calls: gl.info.render.calls,
      triangles: gl.info.render.triangles,
      geometries: gl.info.memory.geometries,
      textures: gl.info.memory.textures,
    });
  });
  const pick = (e: ThreeEvent<MouseEvent>) => {
    if (props.interactive === false) return;
    let object: T.Object3D | null = e.object;
    while (object && !object.userData["sceneKey"]) object = object.parent;
    if (object?.userData["sceneKey"]) {
      if (!gesture.current.consume()) return;
      e.stopPropagation();
      onSelect(String(object.userData["sceneKey"]));
    }
  };
  const silo = manifest.silos.find((s) => s.key === selected),
    identity = objects.find((o) => o.chave === selected);
  return (
    <>
      <UnitEnvironment />
      <fog attach="fog" args={["#e1eaf0", 600, 1100]} />
      <hemisphereLight args={["#cce3ff", "#666443", 1.05]} />
      <primitive object={sunTarget} />
      <directionalLight
        position={[-85, 140, 55]}
        target={sunTarget}
        intensity={3.1}
        color="#fff5e6"
        castShadow
        shadow-mapSize={[props.economy ? 1024 : 2048, props.economy ? 1024 : 2048]}
        shadow-camera-left={-100}
        shadow-camera-right={100}
        shadow-camera-top={100}
        shadow-camera-bottom={-100}
        shadow-camera-near={5}
        shadow-camera-far={380}
        shadow-bias={-0.00025}
        shadow-normalBias={0.07}
      />
      <Atmosphere />
      <primitive object={model} onClick={pick} dispose={null} />
      {silo && identity && (
        <group position={silo.position}>
          {highlight && (
            <mesh position={[0, 0.52, 0]} rotation={[-Math.PI / 2, 0, 0]}>
              <ringGeometry args={[silo.diameter / 2 + 0.7, silo.diameter / 2 + 0.78, 64]} />
              <meshBasicMaterial color="#f4e4a3" side={T.DoubleSide} depthWrite={false} />
            </mesh>
          )}
          <Html
            center
            position={[0, silo.clearance + silo.cone + silo.straight + 3, 0]}
            zIndexRange={[10, 0]}
          >
            <span className="unit-map-label">
              {identity.tag} · {silo.aliases[0]}
            </span>
          </Html>
        </group>
      )}
      <Navigation {...props} />
    </>
  );
}
export default function UnitScene(props: Props) {
  const { onFail } = props;
  const [supported, setSupported] = useState(false);
  const [software, setSoftware] = useState(false);
  useEffect(() => {
    // R3F's configure() rejection does not reach a React error boundary.
    // Release this short-lived capability probe before allocating the scene.
    const canvas = document.createElement("canvas");
    const context = canvas.getContext("webgl2");
    if (!context) {
      onFail();
      return;
    }
    context.getExtension("WEBGL_lose_context")?.loseContext();
    setSupported(true);
  }, [onFail]);
  if (!supported) return null;
  return (
    <Canvas
      shadows={!software}
      dpr={software ? 0.7 : [1, props.economy ? 1 : 1.5]}
      frameloop="demand"
      gl={{ antialias: !props.economy, powerPreference: "default", alpha: false }}
      camera={{ position: props.manifest.cameras.normal.position, fov: 43, near: 0.12, far: 1400 }}
      onCreated={({ gl }) => {
        gl.toneMapping = T.ACESFilmicToneMapping;
        gl.toneMappingExposure = 0.9;
        const context = gl.getContext(),
          extension = context.getExtension("WEBGL_debug_renderer_info");
        if (
          extension &&
          /swiftshader|llvmpipe|software/i.test(
            String(context.getParameter(extension.UNMASKED_RENDERER_WEBGL)),
          )
        )
          setSoftware(true);
      }}
      fallback={<button onClick={props.onFail}>Abrir lista de locais</button>}
    >
      <Content {...props} economy={props.economy || software} />
    </Canvas>
  );
}
