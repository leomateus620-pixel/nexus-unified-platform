import {
  createElement,
  Fragment,
  useEffect,
  useMemo,
  useRef,
  useSyncExternalStore,
  type RefObject,
} from "react";
import { Canvas, useFrame, useThree, type ThreeEvent } from "@react-three/fiber";
import { OrbitControls } from "three/examples/jsm/controls/OrbitControls.js";
import * as THREE from "three";
import { createLC02Model } from "./lc02-model";
import { createPeoplePool, type PeoplePool } from "./lc02-people";
import type { LC02Simulation } from "./lc02-simulation";
import { routeAt } from "./lc02-walkway";
import {
  ELEMENTS,
  LC02,
  PATH,
  VIEWS,
  type ElementId,
  type LayerId,
  type Point,
  type ViewId,
} from "./lc02-layout";

export type CameraCommand = {
  serial: number;
  view: ViewId;
  focus?: ElementId;
  zoom?: number;
  wide?: boolean;
};
export type SceneProps = {
  simulation: LC02Simulation;
  command: CameraCommand;
  isolated: boolean;
  layers: Record<LayerId, boolean>;
  labels: "levels" | "all" | "none";
  path: boolean;
  dimensions: boolean;
  selected: ElementId | null;
  labelContainer: RefObject<HTMLDivElement | null>;
  onStatus: (status: "loading" | "ready" | "lost") => void;
};

function SceneContent(props: SceneProps) {
  const { onStatus } = props;
  const { camera, gl, invalidate, size } = useThree();
  const model = useMemo(createLC02Model, []);
  const { simulation } = props;
  const sim = useSyncExternalStore(
    simulation.subscribe,
    simulation.getSnapshot,
    simulation.getSnapshot,
  );
  const pool = useRef<PeoplePool | null>(null);
  const peopleGroup = useMemo(() => new THREE.Group(), []);
  const cameraRay = useMemo(() => new THREE.Raycaster(), []);
  const cameraTarget = useMemo(() => new THREE.Vector3(), []);
  const cameraPosition = useMemo(() => new THREE.Vector3(), []);
  const lastSimCamera = useRef({ revision: 0, mode: "wide" });
  const shadowClock = useRef(0);
  const lastDoor = useRef(0);
  const projectionOffset = useRef("");
  const controls = useRef<OrbitControls | null>(null);
  const destination = useRef<{
    position: THREE.Vector3;
    target: THREE.Vector3;
    fromPosition: THREE.Vector3;
    fromTarget: THREE.Vector3;
    started: number;
  } | null>(null);
  const frames = useRef(0);
  const active = useRef(true);
  const reducedMotion = useRef(false);
  const labelElements = useRef(new Map<string, HTMLDivElement>());
  const scratch = useMemo(() => new THREE.Vector3(), []);
  const pathLine = useMemo(() => {
    const geometry = new THREE.BufferGeometry().setFromPoints(
      PATH.map((p) => new THREE.Vector3(p[0], p[1] + 0.07, p[2])),
    );
    const material = new THREE.LineDashedMaterial({
      color: "#007d83",
      dashSize: 0.22,
      gapSize: 0.12,
      depthTest: false,
    });
    const line = new THREE.Line(geometry, material);
    line.computeLineDistances();
    line.renderOrder = 5;
    return line;
  }, []);
  const dimensions = useMemo(() => {
    const y = LC02.ground + 0.03,
      z = 2.55;
    const pts: Point[] = [];
    for (const [x0, x1] of [
      [0, 3],
      [3, 8],
    ]) {
      pts.push([x0!, y, z], [x1!, y, z]);
    }
    for (const x of [0, 3, 8])
      pts.push([x, y, z - 0.2], [x, y, z + 0.2], [x, y, 1.6], [x, y, z + 0.35]);
    pts.push([10.35, 0, 1.3], [10.35, 6, 1.3]);
    for (const h of [0, 3, 6]) pts.push([10.15, h, 1.3], [10.55, h, 1.3]);
    return new THREE.LineSegments(
      new THREE.BufferGeometry().setFromPoints(pts.map((p) => new THREE.Vector3(...p))),
      new THREE.LineBasicMaterial({ color: "#568c90" }),
    );
  }, []);
  const grid = useMemo(() => {
    const g = new THREE.GridHelper(30, 30, "#c4cfca", "#dce2dd");
    g.position.set(4, LC02.ground - 0.03, -1);
    return g;
  }, []);

  useEffect(() => {
    const ctl = new OrbitControls(camera, gl.domElement);
    ctl.target.set(...VIEWS[0].target);
    ctl.enableDamping = true;
    ctl.dampingFactor = 0.09;
    ctl.minDistance = 2.8;
    ctl.maxDistance = 65;
    ctl.maxPolarAngle = Math.PI * 0.495;
    ctl.screenSpacePanning = true;
    const change = () => invalidate();
    const start = () => {
      destination.current = null;
    };
    ctl.addEventListener("change", change);
    ctl.addEventListener("start", start);
    controls.current = ctl;
    ctl.update();
    reducedMotion.current = window.matchMedia("(prefers-reduced-motion: reduce)").matches;
    return () => {
      ctl.removeEventListener("change", change);
      ctl.removeEventListener("start", start);
      ctl.dispose();
      controls.current = null;
    };
  }, [camera, gl, invalidate]);
  const hasPeople = sim.count > 0;
  useEffect(() => {
    if (!hasPeople || pool.current) return;
    let cancelled = false;
    void createPeoplePool()
      .then((loaded) => {
        if (cancelled) {
          loaded.dispose();
          return;
        }
        pool.current = loaded;
        peopleGroup.add(loaded.root);
        simulation.setAsset("ready");
        invalidate();
      })
      .catch(() => {
        if (!cancelled) {
          simulation.setAsset("error");
          invalidate();
        }
      });
    return () => {
      cancelled = true;
    };
  }, [hasPeople, sim.retry, simulation, peopleGroup, invalidate]);
  useEffect(() => simulation.subscribe(() => invalidate()), [simulation, invalidate]);
  useEffect(
    () => () => {
      pool.current?.dispose();
      pool.current = null;
      peopleGroup.clear();
    },
    [peopleGroup],
  );
  useEffect(() => {
    const previous = lastSimCamera.current;
    lastSimCamera.current = { revision: sim.revision, mode: sim.mode };
    const ctl = controls.current;
    if (!ctl) return;
    ctl.enabled = sim.mode === "wide";
    if (sim.mode !== "wide") destination.current = null;
    else if (sim.revision !== previous.revision || previous.mode !== "wide") {
      const target = new THREE.Vector3(4, 3.5, -1);
      const position = new THREE.Vector3(-11, 11.5, 17);
      const aspect = camera instanceof THREE.PerspectiveCamera ? camera.aspect : 1;
      position
        .sub(target)
        .multiplyScalar(Math.max(1, 0.95 / aspect))
        .add(target);
      destination.current = {
        target,
        position,
        fromPosition: camera.position.clone(),
        fromTarget: ctl.target.clone(),
        started: performance.now(),
      };
    }
    invalidate();
  }, [sim.revision, sim.mode, camera, invalidate]);
  useEffect(() => {
    const ctl = controls.current;
    if (!ctl) return;
    const preset = VIEWS.find((v) => v.id === props.command.view) ?? VIEWS[0];
    const target = new THREE.Vector3(...preset.target),
      position = new THREE.Vector3(...preset.position);
    if (props.command.wide) {
      position.set(-11, 11.5, 17);
      target.set(4, 3.5, -1);
    }
    if (props.command.zoom) {
      target.copy(ctl.target);
      position.copy(camera.position).sub(target).multiplyScalar(props.command.zoom).add(target);
    } else if (props.command.focus) {
      const item = ELEMENTS.find((e) => e.id === props.command.focus)!;
      target.set(...item.position);
      target.y += 0.45;
      position
        .copy(camera.position)
        .sub(ctl.target)
        .normalize()
        .multiplyScalar(item.id === "building" ? 19 : 8.5)
        .add(target);
    } else {
      // Fit the same model on narrow screens without cropping it.
      position
        .sub(target)
        .multiplyScalar(
          Math.max(1, 0.95 / (camera instanceof THREE.PerspectiveCamera ? camera.aspect : 1)),
        )
        .add(target);
    }
    destination.current = {
      position,
      target,
      fromPosition: camera.position.clone(),
      fromTarget: ctl.target.clone(),
      started: performance.now(),
    };
    invalidate();
  }, [props.command, camera, invalidate]);
  useEffect(() => {
    for (const [id, group] of Object.entries(model.layers))
      group.visible = props.layers[id as LayerId];
    // Keep existing platform and doorway readable; ghost only the building envelope.
    for (const id of ["cladding", "roof"] as const) {
      const m = model.materials[id];
      m.transparent = props.isolated;
      m.opacity = props.isolated ? 0.12 : 1;
      m.depthWrite = !props.isolated;
      m.needsUpdate = true;
    }
    gl.shadowMap.needsUpdate = true;
    invalidate();
  }, [model, props.layers, props.isolated, gl, invalidate]);
  useEffect(() => {
    const canvas = gl.domElement;
    const lost = (event: Event) => {
      event.preventDefault();
      active.current = false;
      frames.current = 0;
      canvas.dataset["ready"] = "false";
      onStatus("lost");
      simulation.pause("WebGL recuperado. Continue para retomar a circulação.");
    };
    const restored = () => {
      active.current = true;
      frames.current = 0;
      gl.shadowMap.needsUpdate = true;
      onStatus("loading");
      invalidate();
    };
    canvas.addEventListener("webglcontextlost", lost);
    canvas.addEventListener("webglcontextrestored", restored);
    return () => {
      canvas.removeEventListener("webglcontextlost", lost);
      canvas.removeEventListener("webglcontextrestored", restored);
    };
  }, [gl, invalidate, onStatus, simulation]);
  useEffect(() => {
    const container = props.labelContainer.current;
    if (!container) return;
    const elements = labelElements.current;
    container.replaceChildren();
    elements.clear();
    const labels: { id: string; text: string; position: Point; priority: number }[] = [];
    if (props.labels !== "none") {
      for (const e of ELEMENTS) {
        const primary = ["new", "intermediate", "door"].includes(e.id);
        if (
          !props.layers[e.layer] ||
          (!primary && props.labels !== "all" && props.selected !== e.id)
        )
          continue;
        labels.push({
          id: e.id,
          text: e.id === "new" && props.labels === "levels" ? "Saída ±0,00 m" : e.short,
          position: [e.position[0], e.position[1] + 0.28, e.position[2]],
          priority: props.selected === e.id ? 0 : primary ? 1 : 2,
        });
      }
    }
    if (props.dimensions)
      labels.push(
        { id: "dim3", text: "3,00 m", position: [1.5, LC02.ground, 2.65], priority: 1 },
        {
          id: "dim5",
          text: "5,00 m entre P1 e P2",
          position: [5.5, LC02.ground, 2.65],
          priority: 1,
        },
        { id: "dim6", text: "6,00 m", position: [10.5, 3, 1.3], priority: 1 },
        { id: "width", text: "Útil 1,20 m", position: [0.6, 1.2, -3.1], priority: 2 },
      );
    for (const l of labels.sort((a, b) => a.priority - b.priority)) {
      const el = document.createElement("div");
      el.className = `lc-label${l.priority === 0 ? " is-selected" : ""}${l.id.startsWith("dim") || l.id === "width" ? " is-dimension" : ""}`;
      el.textContent = l.text;
      el.dataset["point"] = JSON.stringify(l.position);
      el.style.visibility = "hidden";
      container.appendChild(el);
      elements.set(l.id, el);
    }
    invalidate();
    return () => {
      container.replaceChildren();
      elements.clear();
    };
  }, [
    props.labelContainer,
    props.labels,
    props.layers,
    props.selected,
    props.dimensions,
    invalidate,
  ]);
  useEffect(
    () => () => {
      model.dispose();
      pathLine.geometry.dispose();
      pathLine.material.dispose();
      dimensions.geometry.dispose();
      dimensions.material.dispose();
      grid.geometry.dispose();
      const mats = Array.isArray(grid.material) ? grid.material : [grid.material];
      mats.forEach((m) => m.dispose());
    },
    [model, pathLine, dimensions, grid],
  );
  useFrame((_, delta) => {
    if (!active.current) return;
    const dt = Math.min(delta, 0.1);
    const state = simulation.getSnapshot();
    const panel =
      gl.domElement.parentElement?.parentElement?.querySelector<HTMLElement>(".lc-people");
    const narrow = size.width < 700;
    const offset = narrow ? -Math.max(0, ((panel?.offsetHeight ?? 90) + 16 - 70) / 2) : 0;
    const projectionKey = `${offset},${size.width},${size.height}`;
    if (camera instanceof THREE.PerspectiveCamera && projectionOffset.current !== projectionKey) {
      projectionOffset.current = projectionKey;
      if (offset) camera.setViewOffset(size.width, size.height, 0, offset, size.width, size.height);
      else camera.clearViewOffset();
    }
    if (state.status === "running" && state.asset === "ready") {
      let remaining = dt;
      while (remaining > 1e-8) {
        const step = Math.min(remaining, 1 / 60);
        simulation.tick(step);
        remaining -= step;
      }
      invalidate();
    }
    model.doorPivot.rotation.y = (simulation.door * Math.PI) / 2;
    shadowClock.current += dt;
    if (
      Math.abs(lastDoor.current - simulation.door) > 0.001 &&
      (shadowClock.current > 0.1 || simulation.door === 0 || simulation.door === 1)
    ) {
      lastDoor.current = simulation.door;
      shadowClock.current = 0;
      gl.shadowMap.needsUpdate = true;
    }
    pool.current?.update(simulation.people, state.selected, camera);
    const ctl = controls.current,
      dest = destination.current;
    if (ctl && dest) {
      const t = reducedMotion.current ? 1 : Math.min(1, (performance.now() - dest.started) / 900);
      const eased = t * t * (3 - 2 * t);
      camera.position.lerpVectors(dest.fromPosition, dest.position, eased);
      ctl.target.lerpVectors(dest.fromTarget, dest.target, eased);
      if (t === 1) destination.current = null;
      invalidate();
    }
    const followed = simulation.people[state.selected];
    if (ctl && state.mode !== "wide" && followed?.state === "walking") {
      const p = routeAt(followed.s);
      cameraTarget.set(p.p[0], p.p[1] + 0.95, p.p[2]);
      const side = -1;
      cameraPosition.set(
        p.p[0] - Math.sin(p.heading) * 3.5 + Math.cos(p.heading) * side * 0.85,
        p.p[1] + 2.2,
        p.p[2] - Math.cos(p.heading) * 3.5 - Math.sin(p.heading) * side * 0.85,
      );
      if (narrow) cameraPosition.sub(cameraTarget).multiplyScalar(1.35).add(cameraTarget);
      scratch.copy(cameraPosition).sub(cameraTarget);
      cameraRay.set(cameraTarget, scratch.clone().normalize());
      cameraRay.far = scratch.length();
      const obstruction = cameraRay.intersectObjects(
        [model.layers.existing, model.layers.rails, model.doorPivot],
        true,
      )[0];
      if (obstruction)
        cameraPosition
          .copy(cameraTarget)
          .addScaledVector(cameraRay.ray.direction, Math.max(0.45, obstruction.distance - 0.2));
      const smoothing = reducedMotion.current ? 1 : 1 - Math.exp(-Math.max(dt, 1 / 120) * 7);
      camera.position.lerp(cameraPosition, smoothing);
      ctl.target.lerp(cameraTarget, smoothing);
      if (
        camera.position.distanceTo(cameraPosition) > 0.003 ||
        ctl.target.distanceTo(cameraTarget) > 0.003
      )
        invalidate();
    }
    if (ctl) {
      ctl.enableDamping = state.mode === "wide";
      ctl.update();
    }
    const occupied: { x: number; y: number; w: number; h: number }[] = [];
    const viewport = gl.domElement.closest(".lc-viewport");
    const frame = gl.domElement.getBoundingClientRect();
    viewport
      ?.querySelectorAll<HTMLElement>(
        ".lc-people,.lc-person-drive,.lc-tools,.lc-context,.lc-mobile-explore",
      )
      .forEach((overlay) => {
        if (!overlay.offsetWidth || getComputedStyle(overlay).visibility === "hidden") return;
        const r = overlay.getBoundingClientRect();
        occupied.push({ x: r.left - frame.left, y: r.top - frame.top, w: r.width, h: r.height });
      });
    if (state.mode !== "wide" && followed?.state === "walking") {
      const p = routeAt(followed.s).p;
      const top = new THREE.Vector3(p[0], p[1] + 1.85, p[2]).project(camera);
      const bottom = new THREE.Vector3(...p).project(camera);
      const x = (top.x * 0.5 + 0.5) * size.width;
      const y = (-top.y * 0.5 + 0.5) * size.height;
      occupied.push({
        x: x - 55,
        y,
        w: 110,
        h: Math.max(0, (-bottom.y * 0.5 + 0.5) * size.height - y),
      });
    }
    for (const el of labelElements.current.values()) {
      scratch.fromArray(JSON.parse(el.dataset["point"]!)).project(camera);
      const x = (scratch.x * 0.5 + 0.5) * size.width,
        y = (-scratch.y * 0.5 + 0.5) * size.height;
      const w = el.offsetWidth,
        h = el.offsetHeight;
      let placed = false;
      if (
        scratch.z > -1 &&
        scratch.z < 1 &&
        x > 4 &&
        x < size.width - 4 &&
        y > 4 &&
        y < size.height - 4
      ) {
        for (const [dx, dy] of [
          [10, -30],
          [10, 8],
          [-w - 10, -30],
          [-w - 10, 8],
          [10, -62],
        ]) {
          const r = { x: x + dx!, y: y + dy!, w, h };
          if (
            r.x < 8 ||
            r.y < 8 ||
            r.x + w > size.width - 8 ||
            r.y + h > size.height - 8 ||
            occupied.some(
              (o) =>
                r.x < o.x + o.w + 5 &&
                r.x + w + 5 > o.x &&
                r.y < o.y + o.h + 5 &&
                r.y + h + 5 > o.y,
            )
          )
            continue;
          el.style.transform = `translate(${r.x}px,${r.y}px)`;
          occupied.push(r);
          placed = true;
          break;
        }
      }
      el.style.visibility = placed ? "visible" : "hidden";
    }
    const canvas = gl.domElement;
    canvas.dataset["simulation"] = state.status;
    canvas.dataset["people"] = JSON.stringify(
      simulation.people.map((p) => ({ id: p.id, s: +p.s.toFixed(3), state: p.state })),
    );
    canvas.dataset["door"] = simulation.door.toFixed(3);
    canvas.dataset["peopleCamera"] = state.mode;
    canvas.dataset["selectedPerson"] = String(state.selected);
    canvas.dataset["peopleMeshes"] = String(
      pool.current?.workers.reduce((sum, worker) => sum + worker.visibleMeshes, 0) ?? 0,
    );
    canvas.dataset["footError"] = Math.max(
      0,
      ...(pool.current?.workers.map((w) => w.lastFootError) ?? []),
    ).toFixed(4);
    canvas.dataset["camera"] = camera.position
      .toArray()
      .map((v) => v.toFixed(3))
      .join(",");
    canvas.dataset["calls"] = String(gl.info.render.calls);
    canvas.dataset["triangles"] = String(gl.info.render.triangles);
    canvas.dataset["geometries"] = String(gl.info.memory.geometries);
    canvas.dataset["textures"] = String(gl.info.memory.textures);
    if (frames.current < 3) {
      frames.current++;
      invalidate();
      if (frames.current === 3) {
        canvas.dataset["ready"] = "true";
        props.onStatus("ready");
      }
    }
  });
  const selected = ELEMENTS.find((e) => e.id === props.selected);
  // These are Three objects, not DOM nodes. createElement deliberately keeps the
  // development source tagger from injecting data-* attributes into R3F objects.
  return createElement(
    Fragment,
    null,
    createElement("color", { attach: "background", args: ["#e9eee9"] }),
    createElement("ambientLight", { intensity: 0.8 }),
    createElement("hemisphereLight", { args: ["#eaf6ff", "#a1a38e", 1.6] }),
    createElement("directionalLight", {
      position: [-5, 16, 10],
      intensity: 3.3,
      castShadow: true,
      "shadow-mapSize": [2048, 2048],
      "shadow-camera-left": -16,
      "shadow-camera-right": 16,
      "shadow-camera-top": 16,
      "shadow-camera-bottom": -16,
      "shadow-normalBias": 0.035,
      "shadow-bias": -0.0001,
    }),
    createElement("directionalLight", { position: [10, 8, -8], intensity: 1.1 }),
    createElement("primitive", { object: model.root, dispose: null }),
    createElement("primitive", {
      object: peopleGroup,
      dispose: null,
      onClick: (event: ThreeEvent<MouseEvent>) => {
        let object: THREE.Object3D | null = event.object;
        while (object) {
          if (typeof object.userData["personId"] === "number") {
            simulation.select(object.userData["personId"]);
            event.stopPropagation();
            break;
          }
          object = object.parent;
        }
      },
    }),
    createElement(
      "mesh",
      {
        rotation: [-Math.PI / 2, 0, 0],
        position: [4, LC02.ground - 0.05, -1],
        receiveShadow: true,
      },
      createElement("planeGeometry", { args: [200, 200] }),
      createElement("meshStandardMaterial", { color: "#e1e7e0", roughness: 1 }),
    ),
    createElement("primitive", { object: grid, dispose: null }),
    props.path && createElement("primitive", { object: pathLine, dispose: null }),
    props.dimensions && createElement("primitive", { object: dimensions, dispose: null }),
    selected &&
      props.layers[selected.layer] &&
      createElement(
        "mesh",
        {
          position: [selected.position[0], selected.position[1] + 0.12, selected.position[2]],
          rotation: [-Math.PI / 2, 0, 0],
          renderOrder: 6,
        },
        createElement("ringGeometry", { args: [0.15, 0.22, 32] }),
        createElement("meshBasicMaterial", {
          color: "#00888a",
          depthTest: false,
          transparent: true,
          opacity: 0.85,
        }),
      ),
  );
}

export default function EscadaScene(props: SceneProps) {
  return (
    <Canvas
      shadows={{ type: THREE.PCFShadowMap }}
      frameloop="demand"
      dpr={[1, 1.65]}
      camera={{ position: VIEWS[0].position, fov: 43, near: 0.1, far: 150 }}
      gl={{ antialias: true, alpha: false, powerPreference: "default" }}
      onCreated={({ gl }) => {
        // The structure and sun are static. Camera movement does not require
        // rendering the shadow map again; layers and recovery refresh it explicitly.
        gl.shadowMap.autoUpdate = false;
        gl.shadowMap.needsUpdate = true;
        gl.domElement.setAttribute("aria-label", "Modelo 3D navegável da escada LC-02");
        gl.domElement.setAttribute("role", "img");
      }}
    >
      <SceneContent {...props} />
    </Canvas>
  );
}
