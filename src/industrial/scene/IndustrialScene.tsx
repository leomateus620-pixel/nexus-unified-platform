import { Component, memo, useCallback, useEffect, useMemo, useRef, useState } from "react";
import type { MutableRefObject, ReactNode } from "react";
import { Canvas, useFrame, useThree } from "@react-three/fiber";
import type { ThreeEvent } from "@react-three/fiber";
import { Html } from "@react-three/drei";
import {
  ACESFilmicToneMapping,
  Group,
  Mesh,
  MeshStandardMaterial,
  PCFSoftShadowMap,
  SRGBColorSpace,
} from "three";
import type { Material } from "three";
import { byId, vec } from "../data";
import { Lighting } from "../lighting/Lighting";
import { Navigation } from "../navigation/Navigation";
import type { Movement } from "../navigation/Navigation";
import { captureFrame, diagnostics, estimateResources, resetMetrics } from "../performance/metrics";
import type { CameraRequest, Category, Layers, Quality } from "../types";
import { Vegetation } from "../vegetation/Vegetation";
import { useAsset } from "./assets";

interface Props {
  request: CameraRequest;
  quality: Quality;
  neutral: boolean;
  blockout: boolean;
  wind: boolean;
  reducedMotion: boolean;
  layers: Layers;
  selected: string | null;
  movement: MutableRefObject<Movement>;
  onSelect: (id: string) => void;
  onExitWalk: () => void;
  onPosition: (x: number, z: number) => void;
  onReady: (name: string) => void;
  onError: (message: string) => void;
}

class SceneBoundary extends Component<
  { children: ReactNode; onError: (message: string) => void },
  { error: Error | null }
> {
  override state: { error: Error | null } = { error: null };
  static getDerivedStateFromError(error: Error) {
    return { error };
  }
  override componentDidCatch(error: Error) {
    this.props.onError(error.message);
  }
  override render() {
    return this.state.error ? null : this.props.children;
  }
}
function Sector({
  file,
  visible,
  blockout,
  onSelect,
  onReady,
  layers,
}: {
  file: string;
  visible: boolean;
  blockout: boolean;
  onSelect: (id: string) => void;
  onReady: (name: string) => void;
  layers?: Layers;
}) {
  const asset = useAsset(file);
  const { invalidate } = useThree();
  const originals = useMemo(() => {
    const result = new Map<Mesh, Material | Material[]>();
    asset?.traverse((o) => {
      if (o instanceof Mesh) result.set(o, o.material);
    });
    return result;
  }, [asset]);
  const neutral = useMemo(() => new MeshStandardMaterial({ color: "#b6bbb7", roughness: 1 }), []);
  useEffect(() => () => neutral.dispose(), [neutral]);
  useEffect(() => {
    originals.forEach((m, o) => {
      o.material = blockout ? neutral : m;
    });
    invalidate();
    return () => {
      originals.forEach((m, o) => {
        o.material = m;
      });
    };
  }, [originals, blockout, neutral, invalidate]);
  useEffect(() => {
    if (asset) {
      onReady(file);
      invalidate();
    }
  }, [asset, file, onReady, invalidate]);
  useEffect(() => {
    if (asset && layers) {
      asset.traverse((o) => {
        const element = byId.get(o.userData["elementId"] as string);
        if (element) o.visible = layers[element.category];
      });
      invalidate();
    }
  }, [asset, layers, invalidate]);
  const click = (event: ThreeEvent<MouseEvent>) => {
    if (event.delta > 5) return;
    for (
      let ancestor: import("three").Object3D | null = event.object;
      ancestor;
      ancestor = ancestor.parent
    )
      if (!ancestor.visible) return;
    let o = event.object;
    while (o) {
      const id = o.userData["elementId"] as string | undefined;
      if (id && byId.has(id)) {
        event.stopPropagation();
        onSelect(id);
        return;
      }
      if (!o.parent) break;
      o = o.parent;
    }
  };
  return asset ? (
    <group visible={visible}>
      <primitive object={asset} onClick={click} dispose={null} />
    </group>
  ) : null;
}
function SiloLevels({ props }: { props: Props }) {
  const near = useRef<Group>(null),
    far = useRef<Group>(null);
  const [detail, setDetail] = useState(false);
  const detailActive = useRef(false);
  useFrame(({ camera }) => {
    const distance = Math.hypot(camera.position.x, camera.position.y - 10, camera.position.z);
    if (!detail && props.quality === "balanced" && distance < 115) setDetail(true);
    if (distance < 100) detailActive.current = true;
    else if (distance > 125) detailActive.current = false;
    const useHigh =
      detail &&
      detailActive.current &&
      props.quality === "balanced" &&
      Boolean(diagnostics.assets["silos-high"]);
    if (near.current) near.current.visible = props.layers.silos && useHigh && !props.blockout;
    if (far.current) far.current.visible = props.layers.silos && !useHigh && !props.blockout;
  });
  return (
    <>
      <group ref={far}>
        <Sector
          file="silos-low"
          visible
          blockout={props.blockout}
          onSelect={props.onSelect}
          onReady={props.onReady}
        />
      </group>
      <group ref={near} visible={false}>
        {detail && (
          <Sector
            file="silos-high"
            visible
            blockout={props.blockout}
            onSelect={props.onSelect}
            onReady={props.onReady}
          />
        )}
      </group>
    </>
  );
}
function Selection({
  id,
  layers,
  onSelect,
}: {
  id: string | null;
  layers: Layers;
  onSelect: (id: string) => void;
}) {
  const element = id ? byId.get(id) : null;
  if (!element || !layers[element.category]) return null;
  const height = Number(element.geometry["bodyHeight"] ?? element.geometry["height"] ?? 5);
  const radius = Number(
    element.geometry["radius"] ??
      Math.max(Number(element.geometry["width"] ?? 5), Number(element.geometry["depth"] ?? 5)) *
        0.6,
  );
  return (
    <group position={element.position}>
      <mesh rotation={[-Math.PI / 2, 0, 0]} position={[0, 0.27, 0]}>
        <ringGeometry args={[radius + 0.6, radius + 0.82, 72]} />
        <meshBasicMaterial color="#f4b562" transparent opacity={0.9} depthWrite={false} />
      </mesh>
      {layers.information && (
        <Html position={[0, height + 5, 0]} center occlude zIndexRange={[20, 0]}>
          <button className="industrial-label" onClick={() => onSelect(element.id)}>
            {element.name}
            <span>ID provisório · {element.id}</span>
          </button>
        </Html>
      )}
    </group>
  );
}
function Runtime({
  wind,
  quality,
  onError,
}: {
  wind: boolean;
  quality: Quality;
  onError: (message: string) => void;
}) {
  const { gl, setDpr, invalidate, setFrameloop } = useThree();
  const last = useRef(0);
  const instrumented = useRef(new WeakSet<Mesh>());
  const passes = useRef({ mainStarted: false, shadowCalls: 0, shadowTriangles: 0 });
  const activeSamples = useRef<number[]>([]);
  const lastAdapt = useRef(0);
  const scale = useRef(1);
  useEffect(() => {
    gl.info.autoReset = false;
    gl.shadowMap.type = PCFSoftShadowMap;
    const ctx = gl.getContext();
    const ext = ctx.getExtension("WEBGL_debug_renderer_info");
    diagnostics.renderer = ext
      ? String(ctx.getParameter(ext.UNMASKED_RENDERER_WEBGL))
      : String(ctx.getParameter(ctx.RENDERER));
  }, [gl]);
  useEffect(() => {
    scale.current = quality === "economy" ? 0.85 : Math.min(window.devicePixelRatio, 1.5);
    setDpr(scale.current);
    diagnostics.quality = quality;
  }, [quality, setDpr]);
  useEffect(() => {
    const visibility = () => {
      setFrameloop(document.hidden ? "never" : "demand");
      if (!document.hidden) invalidate();
    };
    const lost = (e: Event) => {
      e.preventDefault();
      diagnostics.contextLosses++;
      diagnostics.status = "context-lost";
      onError("O contexto gráfico foi interrompido. Recarregue a cena para recuperar o mapa.");
    };
    document.addEventListener("visibilitychange", visibility);
    gl.domElement.addEventListener("webglcontextlost", lost);
    let raf = 0;
    const tick = () => {
      if (wind && !document.hidden) invalidate();
      raf = requestAnimationFrame(tick);
    };
    if (wind) raf = requestAnimationFrame(tick);
    return () => {
      document.removeEventListener("visibilitychange", visibility);
      gl.domElement.removeEventListener("webglcontextlost", lost);
      cancelAnimationFrame(raf);
    };
  }, [wind, gl, setFrameloop, invalidate, onError]);
  useFrame((state) => {
    const now = performance.now();
    const ms = now - last.current;
    passes.current = { mainStarted: false, shadowCalls: 0, shadowTriangles: 0 };
    state.scene.traverse((o) => {
      if (!(o instanceof Mesh) || instrumented.current.has(o)) return;
      instrumented.current.add(o);
      const original = o.onBeforeRender;
      o.onBeforeRender = (...args) => {
        if (!passes.current.mainStarted) {
          passes.current.mainStarted = true;
          passes.current.shadowCalls = gl.info.render.calls;
          passes.current.shadowTriangles = gl.info.render.triangles;
        }
        original.apply(o, args);
      };
    });
    gl.info.reset();
    const cpuStart = performance.now();
    gl.render(state.scene, state.camera);
    const cpuRenderMs = performance.now() - cpuStart;
    diagnostics.shadowCalls = passes.current.shadowCalls;
    diagnostics.shadowTriangles = passes.current.shadowTriangles;
    diagnostics.mainCalls = gl.info.render.calls - diagnostics.shadowCalls;
    diagnostics.mainTriangles = gl.info.render.triangles - diagnostics.shadowTriangles;
    if (last.current && gl.info.render.calls > 0) {
      captureFrame(gl, ms, cpuRenderMs);
      if (ms < 250) activeSamples.current.push(ms);
    }
    last.current = now;
    // Only resolution adapts, with an eight-second cooldown and bounded range.
    // Essential silhouettes, positions and geometric detail remain user-controlled.
    if (now - lastAdapt.current > 8000 && activeSamples.current.length >= 90) {
      const samples = activeSamples.current.sort((a, b) => a - b);
      const median = samples[Math.floor(samples.length / 2)] ?? 16;
      const min = quality === "economy" ? 0.65 : 0.85,
        max = quality === "economy" ? 1 : Math.min(window.devicePixelRatio, 1.5);
      if (median > (quality === "economy" ? 39 : 25))
        scale.current = Math.max(min, scale.current - 0.15);
      else if (median < 15) scale.current = Math.min(max, scale.current + 0.1);
      setDpr(scale.current);
      estimateResources(state.scene);
      activeSamples.current = [];
      lastAdapt.current = now;
    }
  }, 1);
  return null;
}
function Contents(props: Props) {
  const [secondary, setSecondary] = useState(false);
  const { onReady } = props;
  const ready = useCallback(
    (name: string) => {
      onReady(name);
      if (name === "terrain") setSecondary(true);
    },
    [onReady],
  );
  const sectors: [string, Category][] = [
    ["terrain", "terrain"],
    ["grain-handling", "equipment"],
    ["buildings", "buildings"],
  ];
  return (
    <>
      <Lighting neutral={props.neutral || props.blockout} quality={props.quality} />
      {sectors.map(([file, category]) => (
        <Sector
          key={file}
          file={file}
          visible={props.layers[category] && (!props.blockout || category === "terrain")}
          blockout={props.blockout}
          onSelect={props.onSelect}
          onReady={ready}
        />
      ))}
      {props.blockout && (
        <Sector
          file="blockout"
          visible
          blockout
          layers={props.layers}
          onSelect={props.onSelect}
          onReady={ready}
        />
      )}
      <SiloLevels props={props} />
      {secondary && (
        <>
          <Sector
            file="fences"
            visible={props.layers.fences}
            blockout={props.blockout}
            onSelect={props.onSelect}
            onReady={ready}
          />
          <Vegetation
            wind={props.wind && !props.reducedMotion}
            quality={props.quality}
            visible={props.layers.vegetation}
            onReady={ready}
            onSelect={props.onSelect}
          />
          <Sector
            file="grass"
            visible={props.layers.vegetation && props.quality === "balanced" && !props.blockout}
            blockout={false}
            onSelect={props.onSelect}
            onReady={ready}
          />
        </>
      )}
      <Navigation
        request={props.request}
        reducedMotion={props.reducedMotion}
        movement={props.movement}
        onExitWalk={props.onExitWalk}
        onPosition={props.onPosition}
      />
      <Selection id={props.selected} layers={props.layers} onSelect={props.onSelect} />
      <Runtime
        wind={
          props.wind &&
          !props.reducedMotion &&
          props.quality === "balanced" &&
          props.layers.vegetation
        }
        quality={props.quality}
        onError={props.onError}
      />
    </>
  );
}
function IndustrialScene(props: Props) {
  useEffect(() => {
    resetMetrics();
    window.__industrialMetrics = diagnostics;
    return () => {
      diagnostics.status = "unmounted";
    };
  }, []);
  return (
    <SceneBoundary onError={props.onError}>
      <Canvas
        shadows
        frameloop="demand"
        camera={{ position: vec([133, 124, 182]), fov: 43, near: 0.15, far: 900 }}
        dpr={[0.85, 1.5]}
        gl={{
          antialias: true,
          alpha: false,
          powerPreference: "high-performance",
          toneMapping: ACESFilmicToneMapping,
          outputColorSpace: SRGBColorSpace,
        }}
        onCreated={({ gl }) => {
          gl.toneMappingExposure = 1.05;
        }}
        fallback={<p>WebGL2 não está disponível neste navegador.</p>}
      >
        <SceneBoundary onError={props.onError}>
          <Contents {...props} />
        </SceneBoundary>
      </Canvas>
    </SceneBoundary>
  );
}
export default memo(IndustrialScene);
