import { useEffect, useMemo, useRef } from "react";
import { Canvas, useFrame, useThree, type ThreeEvent } from "@react-three/fiber";
import { Html, OrbitControls } from "@react-three/drei";
import type { OrbitControls as OrbitControlsImpl } from "three-stdlib";
import * as THREE from "three";
import { buildTrevisanModel } from "./model";
import { SECTORS, VIEWS, type GroupId, type LayerId, type Sector, type View } from "./data";

export type CameraCommand = { serial: number; view?: View; zoom?: number };
export interface SceneProps {
  groups: Record<GroupId, boolean>;
  layers: Record<LayerId, boolean>;
  selected: Sector;
  isolated: boolean;
  labels: boolean;
  quality: "standard" | "economy";
  command: CameraCommand;
  onSelect: (id: string) => void;
  onContext: (lost: boolean) => void;
  onReady: () => void;
}

function CameraRig({ command }: { command: CameraCommand }) {
  const control = useRef<OrbitControlsImpl>(null);
  const { camera, invalidate, size } = useThree();
  const motion = useRef<{ eye: THREE.Vector3; target: THREE.Vector3 } | null>(null);
  useEffect(() => {
    if (!control.current) return;
    if (command.view) {
      const target = new THREE.Vector3(...command.view.target),
        eye = new THREE.Vector3(...command.view.eye);
      const fit = Math.max(1, 1.1 / (size.width / size.height));
      eye.sub(target).multiplyScalar(fit).clampLength(5, 650).add(target);
      motion.current = { eye, target };
    } else if (command.zoom) {
      const target = control.current.target.clone(),
        offset = camera.position.clone().sub(target);
      offset.multiplyScalar(command.zoom).clampLength(5, 650);
      motion.current = { eye: target.clone().add(offset), target };
    }
    if (window.matchMedia("(prefers-reduced-motion: reduce)").matches && motion.current) {
      camera.position.copy(motion.current.eye);
      control.current.target.copy(motion.current.target);
      motion.current = null;
      control.current.update();
    }
    invalidate();
  }, [command, camera, invalidate, size.width, size.height]);
  useFrame((_, dt) => {
    if (!motion.current || !control.current) return;
    const { eye, target } = motion.current,
      alpha = 1 - Math.exp(-Math.min(dt, 0.06) * 7);
    camera.position.lerp(eye, alpha);
    control.current.target.lerp(target, alpha);
    control.current.update();
    if (
      camera.position.distanceTo(eye) < 0.015 &&
      control.current.target.distanceTo(target) < 0.015
    ) {
      camera.position.copy(eye);
      control.current.target.copy(target);
      control.current.update();
      motion.current = null;
    }
    invalidate();
  });
  return (
    <OrbitControls
      ref={control}
      makeDefault
      target={VIEWS[0]!.target}
      enableDamping
      dampingFactor={0.12}
      minDistance={5}
      maxDistance={650}
      maxPolarAngle={Math.PI * 0.49}
      onStart={() => {
        motion.current = null;
      }}
    />
  );
}

function Runtime({ onContext, onReady }: Pick<SceneProps, "onContext" | "onReady">) {
  const { gl, invalidate } = useThree();
  const frames = useRef(0);
  useEffect(() => {
    const canvas = gl.domElement;
    const lost = (e: Event) => {
      e.preventDefault();
      frames.current = 0;
      canvas.dataset["ready"] = "false";
      onContext(true);
    };
    const restored = () => {
      onContext(false);
      frames.current = 0;
      invalidate();
    };
    canvas.addEventListener("webglcontextlost", lost);
    canvas.addEventListener("webglcontextrestored", restored);
    canvas.dataset["model"] = "trevisan";
    return () => {
      canvas.removeEventListener("webglcontextlost", lost);
      canvas.removeEventListener("webglcontextrestored", restored);
    };
  }, [gl, invalidate, onContext]);
  useFrame(({ camera }) => {
    if (gl.getContext().isContextLost()) return;
    frames.current++;
    gl.domElement.dataset["frames"] = String(frames.current);
    if (frames.current <= 4) {
      invalidate();
      if (frames.current === 4) {
        gl.domElement.dataset["ready"] = "true";
        onReady();
      }
    }
    gl.domElement.dataset["calls"] = String(gl.info.render.calls);
    gl.domElement.dataset["triangles"] = String(gl.info.render.triangles);
    gl.domElement.dataset["geometries"] = String(gl.info.memory.geometries);
    gl.domElement.dataset["textures"] = String(gl.info.memory.textures);
    gl.domElement.dataset["camera"] = camera.position
      .toArray()
      .map((v) => v.toFixed(3))
      .join(",");
  });
  return null;
}

function Complex(props: SceneProps) {
  const { groups, layers, selected, isolated, labels, onSelect } = props;
  const model = useMemo(() => buildTrevisanModel(), []);
  const { invalidate, gl, size } = useThree();
  useEffect(() => () => model.dispose(), [model]);
  useEffect(() => {
    for (const entity of model.entities.values()) {
      const group = entity.userData["group"] as GroupId;
      entity.visible = groups[group] && (!isolated || selected.group === group);
      entity.children.forEach((child) => {
        child.visible = layers[child.userData["layer"] as LayerId];
      });
    }
    gl.domElement.dataset["instances"] = String(model.stats.instances);
    invalidate();
  }, [model, groups, layers, selected.group, isolated, invalidate, gl]);
  const hit = (event: ThreeEvent<MouseEvent>) => {
    // Three.js raycasts hidden descendants too; hidden layers must not intercept selection.
    for (let ancestor: THREE.Object3D | null = event.object; ancestor; ancestor = ancestor.parent) {
      if (!ancestor.visible) return;
    }
    let object: THREE.Object3D | null = event.object;
    while (object && !object.userData["entity"]) object = object.parent;
    if (object?.userData["entity"]) {
      event.stopPropagation();
      onSelect(String(object.userData["entity"]));
    }
  };
  const ids = isolated
    ? SECTORS.filter(
        (s) =>
          s.group === selected.group &&
          [
            "moega",
            "nave-1",
            "nave-2",
            "nave-3",
            "bloco",
            "silo",
            "anexo",
            "leste",
            "norte",
            "sul",
            "torre",
            "galeria",
          ].includes(s.id),
      ).map((s) => s.id)
    : size.width < 600
      ? ["moega", "silo", "norte"]
      : ["moega", "principal", "bloco", "silo", "norte"];
  const labelSectors = SECTORS.filter(
    (s) =>
      (ids.includes(s.id) || s.id === selected.id) &&
      groups[s.group] &&
      (!model.entities.has(s.id) ||
        model.entities
          .get(s.id)!
          .children.some((child) => layers[child.userData["layer"] as LayerId])) &&
      (!isolated || s.group === selected.group),
  );
  const top = (s: Sector) =>
    s.id === "moega" ? 8 : s.id === "principal" ? 11 : s.id === "bloco" ? 14 : s.point[1] + 2;
  return (
    <>
      <primitive object={model.root} onClick={hit} dispose={null} />
      {groups[selected.group] && (
        <mesh
          position={[selected.point[0], 0.11, selected.point[2]]}
          rotation={[-Math.PI / 2, 0, 0]}
        >
          <ringGeometry args={[1.8, 1.9, 48]} />
          <meshBasicMaterial color="#d19442" transparent opacity={0.85} depthWrite={false} />
        </mesh>
      )}
      {labels &&
        labelSectors.map((s) => (
          <Html key={s.id} position={[s.point[0], top(s), s.point[2]]} center zIndexRange={[12, 0]}>
            <button
              className={`tr-label ${s.id === selected.id ? "is-selected" : ""} ${s.evidence === "sem-cota" ? "is-reference" : ""}`}
              onClick={() => onSelect(s.id)}
            >
              <span />
              {s.name}
              {s.evidence === "sem-cota" && <small>sem cota vertical</small>}
            </button>
          </Html>
        ))}
    </>
  );
}

export default function TrevisanScene(props: SceneProps) {
  const shadows = props.quality === "standard";
  return (
    <Canvas
      className="tr-canvas"
      frameloop="demand"
      shadows={shadows}
      dpr={props.quality === "economy" ? 1 : [1, 1.5]}
      camera={{ position: VIEWS[0]!.eye, fov: 42, near: 0.2, far: 1200 }}
      gl={{ antialias: true, alpha: false, powerPreference: "high-performance" }}
      fallback={
        <div className="tr-fallback">
          WebGL indisponível. Consulte a ficha dos setores e as oito pranchas do levantamento.
        </div>
      }
    >
      <color attach="background" args={["#e1e5e3"]} />
      <hemisphereLight args={["#f3f6fa", "#b6b5a2", 2.1]} />
      <directionalLight
        position={[-45, 95, -55]}
        intensity={2.8}
        castShadow={shadows}
        shadow-mapSize={[2048, 2048]}
        shadow-camera-left={-100}
        shadow-camera-right={100}
        shadow-camera-top={115}
        shadow-camera-bottom={-115}
        shadow-camera-near={1}
        shadow-camera-far={270}
        shadow-bias={-0.0002}
        shadow-normalBias={0.06}
      />
      <directionalLight position={[80, 35, 55]} intensity={0.6} />
      <mesh rotation={[-Math.PI / 2, 0, 0]} position={[38, -0.19, -15]} receiveShadow>
        <planeGeometry args={[340, 340]} />
        <meshStandardMaterial color="#d3d6cd" roughness={1} />
      </mesh>
      <gridHelper args={[220, 44, "#acb5b2", "#c1c9c5"]} position={[35, -0.175, -15]} />
      <Complex {...props} />
      <CameraRig command={props.command} />
      <Runtime onContext={props.onContext} onReady={props.onReady} />
    </Canvas>
  );
}
