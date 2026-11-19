import * as T from "three";
import { OrbitControls } from "three/addons/controls/OrbitControls.js";
import { SelectionGesture } from "../nr/mapa/gestures";
import type { HorizonInfo } from "./regional-types";
import { daylight } from "./light";
import { buildModel } from "./model";
import { localGroundHeight, railwayAxes } from "./site-ground";
import { center, extent, partSupportOffset, type Extent, type SpatialIndex } from "./spatial";
import {
  DAYLIGHT_EXPOSURE,
  type CameraMode,
  type CruzPart,
  type CruzArea,
  type CruzLine,
  type SceneLayers,
  type GroundPoint,
} from "./scene-types";

export interface CameraState {
  x: number;
  z: number;
  targetX: number;
  targetZ: number;
  heading: number;
  bar: number;
  metres: number;
  drone: boolean;
}
export interface SceneCommand {
  mode: CameraMode;
  id?: string;
  reference?: "dji44" | "encontro" | "ferrovia";
}
export type InspectionMarker = {
  node: HTMLElement;
  cover: string;
  keys: string[];
};

type PinPlacement = { x: number; y: number; width: number; height: number };

const labelHeight = 44;
function overlapsLabel(label: PinPlacement, other: PinPlacement) {
  return (
    Math.abs(label.x - other.x) < (label.width + other.width) / 2 + 8 &&
    label.y + 12 > other.y - other.height &&
    label.y - label.height < other.y + 18
  );
}

type SceneOptions = {
  host: HTMLDivElement;
  labels: HTMLDivElement;
  index: SpatialIndex;
  parts: CruzPart[];
  areas: CruzArea[];
  lines: CruzLine[];
  layers: SceneLayers;
  selected: string | null;
  quality: "auto" | "economico" | "detalhado";
  onPick: (id: string) => void;
  onCamera: (state: CameraState) => void;
  onHorizon: (info: HorizonInfo | null) => void;
  onLost: () => void;
};
const up = new T.Vector3(0, 1, 0);
const eyeHeight = 1.7;
export function openScene(options: SceneOptions) {
  const { host, index } = options;
  const canvas = document.createElement("canvas");
  canvas.setAttribute(
    "aria-label",
    "Implantação 3D. As setas deslocam a câmera. Mais e menos ajustam a aproximação.",
  );
  canvas.tabIndex = 0;
  const renderer = new T.WebGLRenderer({
    canvas,
    antialias: true,
    alpha: false,
    powerPreference: "high-performance",
  });
  host.prepend(canvas);
  renderer.setPixelRatio(Math.min(devicePixelRatio, 1.6));
  const gl = renderer.getContext(),
    debug = gl.getExtension("WEBGL_debug_renderer_info");
  const gpu = String(gl.getParameter(debug ? debug.UNMASKED_RENDERER_WEBGL : gl.RENDERER));
  const limited = /swiftshader|llvmpipe|software/i.test(gpu) || navigator.hardwareConcurrency <= 4;
  let tier = options.quality === "auto" ? (limited ? "economico" : "equilibrado") : options.quality,
    economy = tier === "economico",
    frames = 0;
  const ratio = () => Math.min(devicePixelRatio, economy ? 1 : tier === "equilibrado" ? 1.5 : 2);
  canvas.dataset["gpu"] = gpu;
  canvas.dataset["antialias"] = String(gl.getContextAttributes()?.antialias ?? false);
  canvas.dataset["quality"] = tier;
  renderer.setPixelRatio(ratio());
  renderer.info.autoReset = false;
  renderer.shadowMap.autoUpdate = false;
  renderer.shadowMap.enabled = true;
  renderer.shadowMap.type = T.PCFShadowMap;
  renderer.toneMapping = T.ACESFilmicToneMapping;
  renderer.toneMappingExposure = DAYLIGHT_EXPOSURE;
  const scene = new T.Scene();
  scene.background = new T.Color("#e3e8e0");
  const bounds = index.unit;
  const [cx, cz] = center(bounds);
  const span = Math.max(bounds.east - bounds.west, bounds.south - bounds.north, 60);
  scene.fog = new T.FogExp2("#e3e8e0", 0.14 / span);
  const far = 110000,
    perspective = new T.PerspectiveCamera(43, 1, 0.15, far),
    ortho = new T.OrthographicCamera(-100, 100, 100, -100, 0.15, far);
  let camera: T.PerspectiveCamera | T.OrthographicCamera = perspective;
  const controls = new OrbitControls<T.PerspectiveCamera | T.OrthographicCamera>(camera, host);
  controls.enableDamping = false;
  controls.enableZoom = false;
  controls.maxPolarAngle = Math.PI * 0.485;
  controls.minDistance = 1.15;
  controls.maxDistance = span * 8;
  controls.minZoom = 0.15;
  controls.maxZoom = 180;
  controls.screenSpacePanning = false;
  let frame = 0,
    closed = false,
    mode: CameraMode = "angular",
    selected = options.selected,
    layers = options.layers;
  let width = 1,
    height = 1,
    tooltipWidth = 0,
    last = performance.now(),
    forcedWalk: string | null = null;
  let walkYaw = 0,
    walkPitch = 0,
    drag: number | null = null,
    initial = true;
  let motion: {
    eye: T.Vector3;
    target: T.Vector3;
    from: T.Vector3;
    start: T.Vector3;
    elapsed: number;
  } | null = null;
  let drone = false;
  const pressed = new Set<string>(),
    gesture = new SelectionGesture();
  const request = () => {
    if (!closed && !frame) frame = requestAnimationFrame(render);
  };
  const illumination = daylight(scene, span);
  const model = buildModel(
    options.parts,
    options.lines,
    options.areas,
    index,
    request,
    renderer.capabilities.getMaxAnisotropy(),
  );
  scene.add(model.root);
  const labelNodes = new Map(
    [...options.labels.querySelectorAll<HTMLButtonElement>("[data-label]")].map((node) => [
      node.dataset["label"]!,
      node,
    ]),
  );
  const direction = new T.Vector3(),
    right = new T.Vector3(),
    temp = new T.Vector3(),
    point = new T.Vector2();
  const ray = new T.Raycaster(),
    plane = new T.Plane(up, 0),
    aGround = new T.Vector3(),
    bGround = new T.Vector3();
  const abort = new AbortController(),
    signal = abort.signal;
  function groundIntersection(result: T.Vector3) {
    plane.constant = 0;
    if (!ray.ray.intersectPlane(plane, result)) return null;
    // Start at the local datum and resample only when the pointer reaches a profiled surface.
    for (let i = 0; i < 3; i++) {
      const floor = localGroundHeight(result.x, result.z);
      if (Math.abs(result.y - floor) < 0.005) return result;
      plane.constant = -floor;
      if (!ray.ray.intersectPlane(plane, result)) return null;
    }
    return result;
  }
  function visible(id: string) {
    const kind = index.byId.get(id)?.kind;
    if (kind === "lvhf") return layers.lvhf;
    const children = options.parts.filter((p) => index.chains.get(p.id)?.includes(id));
    return children.some(
      (p) =>
        layers[
          p.roof === "silo" || p.roof === "tank" ? "equipamentos" : (p.layer ?? "edificacoes")
        ],
    );
  }
  const visibility = new Map<string, boolean>();
  function cacheVisibility() {
    for (const id of labelNodes.keys()) visibility.set(id, visible(id));
  }
  function labelsAt(distance: number, pins: PinPlacement[]) {
    const local = mode === "patio" || distance < span * 0.55;
    const detailed = mode === "patio" || distance < span * 0.27;
    const ancestors = selected ? (index.chains.get(selected) ?? []) : [];
    const compact = width < 520;
    const limit = Math.max(2, (compact ? 4 : width < 940 ? 7 : 10) - Math.floor(pins.length / 2));
    const top = Math.min(65, height * 0.18);
    const bottom = height - Math.min(mode === "patio" ? 119 : 78, height * 0.26);
    const candidates = [];
    for (const [id, node] of labelNodes) {
      const object = index.byId.get(id)!;
      const bounds = layers.nomes && visibility.get(id) ? index.focus(id) : undefined;
      const inSelectedStructure = object.parent && ancestors.includes(object.parent);
      const component =
        object.kind === "componente" && (detailed || (local && inSelectedStructure));
      const level = local ? "estrutura" : "setor";
      if (!bounds || (id !== selected && !component && object.kind !== level)) continue;

      const [x, z] = center(bounds);
      const elevation = bounds.top + 1.3;
      temp.set(x, elevation, z).project(camera);
      const px = (0.5 + 0.5 * temp.x) * width;
      const py = (0.5 - 0.5 * temp.y) * height - 9;
      const labelWidth = Math.min(compact ? 142 : 180, Math.max(77, node.title.length * 8 + 48));
      const left = px - labelWidth / 2,
        right = px + labelWidth / 2;
      if (
        temp.z < -1 ||
        temp.z > 1 ||
        left <= 6 ||
        right >= width - 6 ||
        py - labelHeight <= top ||
        py >= bottom ||
        (left < (width <= 650 ? 68 : 134) && py + 6 > height - (width <= 650 ? 76 : 125)) ||
        (right >= width - 66 && py - labelHeight < height / 2 + 72 && py + 6 > height / 2 - 72)
      )
        continue;
      const priority = id === selected ? 0 : component ? (inSelectedStructure ? 1 : 3) : 2;
      const rank = Math.hypot(px - width / 2, py - height / 2);
      const box = { x: px, y: py, width: labelWidth, height: labelHeight };
      candidates.push({ id, node, x, z, elevation, box, left, priority, rank });
    }
    const shown = new Set<HTMLButtonElement>();
    const placed = [...pins];
    for (const candidate of candidates.sort((a, b) => a.priority - b.priority || a.rank - b.rank)) {
      if (shown.size === limit) break;
      const { id, node, x, z, elevation, box, left } = candidate;
      if (placed.some((other) => overlapsLabel(box, other))) continue;
      if (mode !== "planta" && index.labelOccluded(camera.position, x, elevation, z, id, layers))
        continue;
      shown.add(node);
      placed.push(box);
      const tooltipLeft = Math.max(6, Math.min(box.x - tooltipWidth / 2, width - tooltipWidth - 6));
      node.style.width = `${box.width}px`;
      node.style.transform = `translate3d(${left}px, ${box.y - box.height}px, 0)`;
      node.style.setProperty("--ca-marker-tooltip-left", `${tooltipLeft - left}px`);
      node.dataset["selected"] = String(id === selected);
    }
    for (const node of labelNodes.values()) node.hidden = !shown.has(node);
  }
  const inspectionPoint = new T.Vector3();
  let inspectionMarkers: InspectionMarker[] = [];
  function positionInspections() {
    const placements: PinPlacement[] = [];
    if (!inspectionMarkers.length) return placements;
    const selectedChain = selected ? (index.chains.get(selected) ?? []) : [];
    const ranked = inspectionMarkers
      .map((marker) => {
        const selectedAnchor =
          selected && marker.keys.includes(selected) ? model.lineAnchor(selected) : undefined;
        const anchor = selectedAnchor ?? marker.keys.map(model.lineAnchor).find(Boolean);
        const focused =
          !!selected &&
          (marker.cover === selected ||
            marker.keys.includes(selected) ||
            (index.chains.get(marker.cover)?.includes(selected) && selectedChain.length > 1));
        return {
          marker,
          anchor,
          focused,
          distance: anchor?.distanceTo(camera.position) ?? Infinity,
        };
      })
      .sort((a, b) => Number(b.focused) - Number(a.focused) || a.distance - b.distance);
    const markerLimit = width < 520 ? 4 : 8;
    let expandedPlaced: boolean = false;
    for (const { marker, anchor, focused, distance } of ranked) {
      const node = marker.node;
      let visible = false;
      if (
        anchor &&
        placements.length < markerLimit &&
        (focused || distance < (mode === "patio" ? 65 : 165))
      ) {
        const projectedY = anchor.y + 1.2;
        inspectionPoint.set(anchor.x, projectedY, anchor.z).project(camera);
        const x = (0.5 + 0.5 * inspectionPoint.x) * width;
        const y = (0.5 - 0.5 * inspectionPoint.y) * height;
        const expanded: boolean = width >= 650 && !expandedPlaced && x > 156 && x < width - 156;
        const pinWidth = expanded ? 280 : 54;
        const pinHeight = expanded ? 68 : 44;
        visible =
          inspectionPoint.z >= -1 &&
          inspectionPoint.z <= 1 &&
          x > pinWidth / 2 + 4 &&
          x < width - pinWidth / 2 - 4 &&
          y > Math.min(100, height * 0.29) &&
          y < height - Math.min(96, height * 0.27) &&
          placements.every(
            (p) =>
              Math.abs(x - p.x) > (pinWidth + p.width) / 2 + 7 ||
              Math.abs(y - p.y) > Math.max(pinHeight, p.height) + 8,
          ) &&
          !index.labelOccluded(
            camera.position,
            anchor.x,
            projectedY,
            anchor.z,
            marker.cover,
            layers,
          );
        if (visible) {
          placements.push({ x, y, width: pinWidth, height: pinHeight });
          expandedPlaced ||= expanded;
          node.dataset["expanded"] = String(expanded);
          node.style.transform = `translate(${x}px, ${y}px)`;
          node.dataset["edge"] = x < 145 ? "start" : x > width - 145 ? "end" : "center";
        }
      }
      node.hidden = !visible;
    }
    return placements;
  }
  function updateHud(distance: number) {
    ray.setFromCamera(new T.Vector2(-0.06, -0.63), camera);
    const left = groundIntersection(aGround);
    ray.setFromCamera(new T.Vector2(0.06, -0.63), camera);
    const rightPoint = groundIntersection(bGround);
    let metres = 0,
      bar = 0;
    if (left && rightPoint) {
      const pixelsPerMetre = (0.06 * width) / Math.max(0.01, left.distanceTo(rightPoint));
      const v = 80 / pixelsPerMetre,
        exponent = Math.pow(10, Math.floor(Math.log10(v)));
      metres = (v / exponent >= 5 ? 5 : v / exponent >= 2 ? 2 : 1) * exponent;
      bar = metres * pixelsPerMetre;
    }
    camera.getWorldDirection(direction);
    const target =
      mode === "patio"
        ? temp.copy(camera.position).addScaledVector(direction, 10)
        : controls.target;
    let heading = (Math.atan2(direction.x, -direction.z) * 180) / Math.PI;
    if (camera === ortho) heading = 0;
    options.onCamera({
      x: camera.position.x,
      z: camera.position.z,
      targetX: target.x,
      targetZ: target.z,
      heading,
      bar,
      metres,
      drone,
    });
    labelsAt(distance, positionInspections());
  }
  function walk(dt: number) {
    const horizontal =
      Number(pressed.has("d") || pressed.has("arrowright") || forcedWalk === "right") -
      Number(pressed.has("a") || pressed.has("arrowleft") || forcedWalk === "left");
    const forward =
      Number(pressed.has("w") || pressed.has("arrowup") || forcedWalk === "forward") -
      Number(pressed.has("s") || pressed.has("arrowdown") || forcedWalk === "back");
    if (!horizontal && !forward) return;
    const speed =
      ((pressed.has("shift") ? 5 : 2.4) * dt) / Math.max(1, Math.hypot(horizontal, forward));
    const x =
      camera.position.x + speed * (-Math.sin(walkYaw) * forward + Math.cos(walkYaw) * horizontal);
    const z =
      camera.position.z + speed * (-Math.cos(walkYaw) * forward - Math.sin(walkYaw) * horizontal);
    const eye = camera.position;
    const reachable = (x: number, z: number) =>
      !index.occupied(x, z) && Math.abs(localGroundHeight(x, z) - (eye.y - eyeHeight)) <= 0.23;
    if (reachable(x, z)) eye.set(x, localGroundHeight(x, z) + eyeHeight, z);
    else if (reachable(x, eye.z)) eye.set(x, localGroundHeight(x, eye.z) + eyeHeight, eye.z);
    else if (reachable(eye.x, z)) eye.set(eye.x, localGroundHeight(eye.x, z) + eyeHeight, z);
    request();
  }
  let overlay: T.Mesh<T.BufferGeometry, T.MeshBasicMaterial> | null = null;
  function removeOverlay() {
    if (!overlay) return;
    scene.remove(overlay);
    overlay.geometry.dispose();
    overlay.material.map?.dispose();
    overlay.material.dispose();
    overlay = null;
  }
  function compare(image: HTMLCanvasElement, corners: GroundPoint[], opacity: number) {
    removeOverlay();
    const geom = new T.BufferGeometry();
    geom.setAttribute(
      "position",
      new T.Float32BufferAttribute(
        corners.flatMap(([x, z]) => [x, localGroundHeight(x, z), z]),
        3,
      ),
    );
    geom.setAttribute("uv", new T.Float32BufferAttribute([0, 1, 1, 1, 1, 0, 0, 0], 2));
    geom.setIndex([0, 2, 1, 0, 3, 2]);
    const texture = new T.CanvasTexture(image);
    texture.colorSpace = T.SRGBColorSpace;
    texture.anisotropy = 4;
    overlay = new T.Mesh(
      geom,
      new T.MeshBasicMaterial({
        map: texture,
        opacity,
        transparent: true,
        side: T.DoubleSide,
        depthTest: false,
        depthWrite: false,
        toneMapped: false,
      }),
    );
    overlay.renderOrder = 50;
    scene.add(overlay);
    request();
  }
  let showHorizon = true,
    horizonRequested = false,
    horizonState = "";
  function render(now: number) {
    frame = 0;
    if (closed) return;
    const dt = Math.min(0.07, Math.max(0.001, (now - last) / 1000));
    last = now;
    if (mode !== "patio" && !motion) {
      const [x, z] = index.restrict(controls.target.x, controls.target.z);
      const correction = new T.Vector3(x - controls.target.x, 0, z - controls.target.z);
      controls.target.add(correction);
      camera.position.add(correction);
    }
    if (mode === "patio") walk(dt);
    if (motion) {
      motion.elapsed += dt;
      const t = Math.min(1, motion.elapsed / 0.32),
        k = t * t * (3 - 2 * t);
      camera.position.lerpVectors(motion.from, motion.eye, k);
      controls.target.lerpVectors(motion.start, motion.target, k);
      controls.update();
      if (t === 1) motion = null;
      else request();
    }
    const distance =
      camera === ortho ? span / ortho.zoom : camera.position.distanceTo(controls.target);
    if (overlay) overlay.visible = mode === "planta";
    if (camera === perspective) {
      perspective.near = mode === "patio" ? 0.11 : Math.max(0.12, distance * 0.004);
      perspective.updateProjectionMatrix();
    }
    const lod = model.updateLod(camera, height, tier);
    const shadowCenter = mode === "patio" ? camera.position : controls.target;
    illumination.shadows(renderer, shadowCenter, mode === "patio" ? 50 : distance, tier);
    model.regionFrame(camera.position, economy);
    if (showHorizon && frames) {
      if (!horizonRequested) {
        horizonRequested = true;
        model.showHorizon(true);
      }
      const info = model.horizonInfo(),
        state = info?.state ?? "loading";
      if (state !== horizonState) {
        horizonState = state;
        canvas.dataset["horizon"] = state;
        if (state === "ready") renderer.shadowMap.needsUpdate = true;
        options.onHorizon(info ? { ...info } : null);
      }
    }
    renderer.info.reset();
    const tick = performance.now();
    renderer.render(scene, camera);
    if (!frames) request();
    else if (model.loadDetails()) renderer.shadowMap.needsUpdate = true;
    canvas.dataset["cpuMs"] = (performance.now() - tick).toFixed(2);
    canvas.dataset["frames"] = String(++frames);
    canvas.dataset["geometries"] = String(renderer.info.memory.geometries);
    canvas.dataset["textures"] = String(renderer.info.memory.textures);
    canvas.dataset["lodNear"] = String(lod.near);
    canvas.dataset["lodDistant"] = String(lod.distant);
    updateHud(distance);
    canvas.dataset["camera"] = camera.position
      .toArray()
      .map((v) => v.toFixed(3))
      .join(",");
    canvas.dataset["target"] = controls.target
      .toArray()
      .map((v) => v.toFixed(3))
      .join(",");
    canvas.dataset["fov"] = camera === perspective ? String(perspective.fov) : "orthographic";
    canvas.dataset["zoom"] = String(camera.zoom);
    canvas.dataset["mode"] = mode;
    if (mode === "patio")
      canvas.dataset["floor"] = localGroundHeight(camera.position.x, camera.position.z).toFixed(3);
    else delete canvas.dataset["floor"];
    canvas.dataset["calls"] = String(renderer.info.render.calls);
    canvas.dataset["triangles"] = String(renderer.info.render.triangles);
  }
  function resize() {
    const rect = host.getBoundingClientRect();
    width = Math.max(1, rect.width);
    height = Math.max(1, rect.height);
    tooltipWidth = Math.max(0, Math.min(256, width - 12));
    options.labels.style.setProperty("--ca-marker-tooltip-width", `${tooltipWidth}px`);
    renderer.setSize(width, height, false);
    canvas.dataset["dpr"] = String(renderer.getPixelRatio());
    perspective.aspect = width / height;
    perspective.updateProjectionMatrix();
    ortho.top = span / 2;
    ortho.bottom = -span / 2;
    ortho.left = (-span * width) / height / 2;
    ortho.right = -ortho.left;
    ortho.updateProjectionMatrix();
    const overview = frameDistance(
      bounds,
      new T.Vector3(cx, bounds.top * 0.34, cz),
      new T.Vector3(-1, 0.92, 0.69).normalize(),
    );
    controls.maxDistance = overview * 1.12;
    controls.minZoom =
      span /
      (1.27 *
        Math.max(bounds.south - bounds.north, (bounds.east - bounds.west) / perspective.aspect));
    request();
  }
  function frameDistance(e: Extent, target: T.Vector3, dir: T.Vector3, id?: string) {
    right.crossVectors(up, dir).normalize();
    const vertical = new T.Vector3().crossVectors(dir, right);
    const tan = Math.tan(T.MathUtils.degToRad(perspective.fov) / 2);
    let d = 10;
    const physical = options.parts.filter(
      (p) => !id || index.chains.get(p.id)?.includes(id) || index.byId.get(id)?.parent === p.id,
    );
    const points = physical.length
      ? physical.flatMap((p) => {
          const height = partSupportOffset(p);
          return p.footprint.flatMap(([x, z]) => [
            new T.Vector3(x, (p.base ?? 0) + height, z),
            new T.Vector3(x, p.eave + p.rise + height, z),
          ]);
        })
      : [
          new T.Vector3(e.east, e.top, e.south),
          new T.Vector3(e.west, e.top, e.north),
          new T.Vector3(e.east, 0, e.north),
          new T.Vector3(e.west, 0, e.south),
        ];
    for (const point of points) {
      const v = point.sub(target),
        depth = v.dot(dir);
      d = Math.max(
        d,
        depth + Math.abs(right.dot(v)) / (tan * perspective.aspect),
        depth + Math.abs(vertical.dot(v)) / tan,
      );
    }
    return d * 1.12;
  }
  function moveTo(command: SceneCommand) {
    const selectedPath = command.id ? index.chains.get(command.id) : undefined;
    const detail = selectedPath?.find((id) => index.byId.get(id)?.kind === "componente");
    // The first focus includes the adjacent documented roof levels, retaining the exact component pick.
    const frameId =
      detail &&
      ["cobertura-28.1", "cobertura-28", "cobertura-27", "cobertura-27.1", "cobertura-56"].includes(
        detail,
      )
        ? index.byId.get(detail)?.parent
        : command.id;
    const e = frameId ? index.focus(frameId) : bounds;
    if (!e) return;
    const [x, z] = center(e),
      target = new T.Vector3(x, e.top * 0.34, z);
    const dir = new T.Vector3(-1, 0.92, 0.69).normalize();
    drone = command.reference === "dji44";
    const previous = mode,
      previousHeading = camera.getWorldDirection(new T.Vector3());
    previousHeading.y = 0;
    previousHeading.normalize();
    mode = command.mode;
    motion = null;
    pressed.clear();
    forcedWalk = null;
    camera = mode === "planta" ? ortho : perspective;
    controls.object = camera;
    controls.enabled = mode !== "patio";
    controls.enableRotate = mode === "angular";
    controls.touches.ONE = mode === "planta" ? T.TOUCH.PAN : T.TOUCH.ROTATE;
    controls.mouseButtons.LEFT = mode === "planta" ? T.MOUSE.PAN : T.MOUSE.ROTATE;
    const eye = new T.Vector3();
    if (mode === "patio") {
      perspective.fov = 52;
      perspective.updateProjectionMatrix();
      const d = Math.max(8, Math.hypot(e.east - e.west, e.south - e.north) * 0.64);
      eye.set(x - d * 0.65, eyeHeight, z + d * 0.66);
      const track = command.reference === "ferrovia" ? railwayAxes[0] : undefined;
      if (track) {
        const [railX, railZ] = track.point(0.132, 1.65);
        eye.set(railX, eyeHeight, railZ);
      } else if (
        !command.id &&
        previous === "angular" &&
        !initial &&
        perspective.position.distanceTo(controls.target) < span * 0.2 &&
        !index.occupied(perspective.position.x, perspective.position.z)
      ) {
        eye.x = perspective.position.x;
        eye.z = perspective.position.z;
      } else if (!command.id) {
        // The two maneuvering yards are surveyed on the A1. Select a clear apron along the inherited bearing.
        const heading =
          previous === "angular" ? previousHeading : target.clone().sub(eye).setY(0).normalize();
        const yards = options.areas
          .filter((a) => a.kind === "patio")
          .map((a) => {
            const [px, pz] = center(extent(a.footprint)),
              point = new T.Vector3(px, eyeHeight, pz);
            const clear = [0, 4, 10, 18].every(
              (d) => !index.occupied(px + d * heading.x, pz + d * heading.z),
            );
            return {
              point,
              clear,
              score: heading.dot(target.clone().sub(point).setY(0).normalize()),
            };
          })
          .filter((y) => y.clear)
          .sort((a, b) => b.score - a.score);
        if (yards[0]) eye.copy(yards[0].point);
      }
      if (index.occupied(eye.x, eye.z)) {
        let found = false;
        for (let radius = 1; radius < span && !found; radius += 2)
          for (let n = 0; n < 24 && !found; n++) {
            const px = eye.x + radius * Math.cos((n * Math.PI) / 12),
              pz = eye.z + radius * Math.sin((n * Math.PI) / 12);
            if (!index.occupied(px, pz)) {
              eye.set(px, eyeHeight, pz);
              found = true;
            }
          }
      }
      eye.y = localGroundHeight(eye.x, eye.z) + eyeHeight;
      if (track) {
        const [railX, railZ] = track.point(0.22, 4);
        target.set(railX, eye.y - 0.45, railZ);
      } else if (previous === "angular" && !initial)
        target.set(eye.x + previousHeading.x * 25, eye.y + 1.15, eye.z + previousHeading.z * 25);
      perspective.position.copy(eye);
      perspective.lookAt(target);
      const angles = new T.Euler().setFromQuaternion(perspective.quaternion, "YXZ");
      walkYaw = angles.y;
      walkPitch = angles.x;
      controls.target.copy(target);
      canvas.focus({ preventScroll: true });
    } else if (mode === "planta") {
      const h = Math.max(
        8,
        (e.south - e.north) * 1.14,
        ((e.east - e.west) * 1.14) / (width / height),
      );
      ortho.zoom = span / h;
      ortho.updateProjectionMatrix();
      eye.set(x, span * 1.5 + e.top, z + 0.001);
      camera.position.copy(eye);
      controls.target.set(x, 0, z);
      controls.update();
    } else {
      perspective.fov = 43;
      eye.copy(target).addScaledVector(dir, frameDistance(e, target, dir, frameId));
      if (command.reference) {
        const roof = options.parts.find((p) => p.id === "cobertura-11");
        if (roof && roof.footprint.length === 4) {
          const corners = roof.footprint.map(
            ([x, z]) => new T.Vector3(x, roof.eave + roof.rise, z),
          );
          const near = corners[0]!.clone().lerp(corners[3]!, 0.5),
            farEnd = corners[1]!.clone().lerp(corners[2]!, 0.5),
            axis = farEnd.clone().sub(near);
          if (command.reference === "dji44") {
            // DJI_0044: horizon and the two roof apexes on the 1200 × 675 inspection copy.
            // Equivalent 24 mm (36 mm image width); nominal optical centre. Camera pose is interpreted.
            const focal = (1200 * 24) / 36,
              tilt = Math.atan((337.5 - 57) / focal);
            const slope = (v: number) => Math.tan(tilt + Math.atan((v - 337.5) / focal));
            const distance = (axis.length() * slope(117)) / (slope(258) - slope(117));
            const forward = axis.normalize(),
              across = new T.Vector3().crossVectors(forward, up);
            eye
              .copy(near)
              .addScaledVector(forward, -distance)
              .addScaledVector(across, (-distance * (633 - 600)) / focal);
            eye.y = near.y + distance * slope(258);
            target.copy(eye).addScaledVector(forward, distance);
            target.y -= distance * Math.tan(tilt);
            const nominal = Math.atan(337.5 / focal);
            perspective.fov = T.MathUtils.radToDeg(
              2 * Math.atan(Math.tan(nominal) * Math.max(1, 16 / 9 / perspective.aspect)),
            );
          } else {
            const forward = axis.normalize(),
              side = new T.Vector3().crossVectors(forward, up);
            target.copy(near);
            target.y = roof.eave;
            eye.copy(near).addScaledVector(forward, -23).addScaledVector(side, 33);
            eye.y = 9.5;
          }
        }
      }
      perspective.updateProjectionMatrix();
      if (initial || previous !== mode || matchMedia("(prefers-reduced-motion: reduce)").matches) {
        camera.position.copy(eye);
        controls.target.copy(target);
        controls.update();
      } else
        motion = {
          from: camera.position.clone(),
          start: controls.target.clone(),
          eye,
          target,
          elapsed: 0,
        };
    }
    initial = false;
    request();
  }
  const pointerCache = new Map<number, T.Vector2>();
  const markerPointers = new Map<number, HTMLButtonElement>();
  function markerAt(target: EventTarget | null) {
    return target instanceof Element
      ? target.closest<HTMLButtonElement>("button[data-label]")
      : null;
  }
  function zoom(factor: number, clientX?: number, clientY?: number) {
    if (mode === "patio") return;
    drone = false;
    motion = null;
    const rect = canvas.getBoundingClientRect();
    const ndc = new T.Vector2(
      clientX === undefined ? 0 : ((clientX - rect.left) * 2) / rect.width - 1,
      clientY === undefined ? 0 : 1 - ((clientY - rect.top) * 2) / rect.height,
    );
    ray.setFromCamera(ndc, camera);
    const hit = model.nearest(ray),
      anchor = hit?.point.clone() ?? groundIntersection(new T.Vector3()) ?? controls.target.clone();
    if (camera === ortho) {
      const before = ortho.zoom;
      ortho.zoom = T.MathUtils.clamp(before / factor, controls.minZoom, 180);
      ortho.updateProjectionMatrix();
      const shift = anchor
        .clone()
        .sub(controls.target)
        .multiplyScalar(1 - before / ortho.zoom);
      shift.y = 0;
      ortho.position.add(shift);
      controls.target.add(shift);
    } else {
      const eye = perspective.position,
        distance = eye.distanceTo(anchor);
      if (distance < 0.001) return;
      const scaled = T.MathUtils.clamp(
        factor,
        Math.min(1, 1.2 / distance),
        Math.max(1, controls.maxDistance / distance),
      );
      const next = eye.clone().sub(anchor).multiplyScalar(scaled).add(anchor);
      // A nearer wall outside the pointer ray may intercept a receding, oblique dolly.
      const step = next.clone().sub(eye),
        len = step.length();
      if (len > 0.01) {
        ray.set(eye, step.normalize());
        const obstacle = model.nearest(ray);
        if (obstacle && obstacle.distance <= len + 1.05)
          next.copy(eye).addScaledVector(step, Math.max(0, obstacle.distance - 1.05));
      }
      const minimum = localGroundHeight(next.x, next.z) + 1.2;
      if (next.y < minimum)
        next.lerp(
          eye,
          T.MathUtils.clamp((minimum - next.y) / Math.max(0.01, eye.y - next.y), 0, 1),
        );
      const actual = next.distanceTo(anchor) / distance;
      controls.target.sub(anchor).multiplyScalar(actual).add(anchor);
      eye.copy(next);
    }
    controls.update();
    request();
  }
  const pinchSpread = () => {
    const pair = [...pointerCache.values()];
    return pair.length === 2 ? pair[0]!.distanceTo(pair[1]!) : 0;
  };
  controls.addEventListener("start", () => {
    drone = false;
    request();
    motion = null;
  });
  controls.addEventListener("change", request);
  host.addEventListener(
    "pointerdown",
    (e) => {
      motion = null;
      if (e.pointerType === "touch")
        pointerCache.set(e.pointerId, new T.Vector2(e.clientX, e.clientY));
      const marker = markerAt(e.target);
      if (marker) {
        markerPointers.set(e.pointerId, marker);
        e.preventDefault();
      }
      canvas.focus({ preventScroll: true });
      gesture.down(e.pointerId, e.clientX, e.clientY, performance.now());
      if (mode === "patio") {
        drag = e.pointerId;
        host.setPointerCapture(e.pointerId);
      }
    },
    { signal, capture: true },
  );
  host.addEventListener(
    "wheel",
    (e) => {
      if (mode === "patio") return;
      e.preventDefault();
      e.stopImmediatePropagation();
      const lines = e.deltaMode === 1 ? 16 : e.deltaMode === 2 ? height : 1;
      zoom(
        Math.exp(T.MathUtils.clamp(e.deltaY * lines * 0.0013, -0.48, 0.48)),
        e.clientX,
        e.clientY,
      );
    },
    { signal, capture: true, passive: false },
  );
  host.addEventListener(
    "pointermove",
    (e) => {
      const old = pinchSpread();
      pointerCache.get(e.pointerId)?.set(e.clientX, e.clientY);
      const next = pinchSpread();
      if (old > 0 && next > 0 && mode !== "patio") {
        const pair = [...pointerCache.values()],
          mid = pair[0]!.clone().lerp(pair[1]!, 0.5);
        zoom(T.MathUtils.clamp(old / next, 0.73, 1.38), mid.x, mid.y);
      }
      gesture.move(e.pointerId, e.clientX, e.clientY);
      if (mode === "patio" && drag === e.pointerId) {
        walkYaw -= e.movementX * 0.005;
        walkPitch = T.MathUtils.clamp(walkPitch - e.movementY * 0.004, -1.1, 1.25);
        camera.rotation.set(walkPitch, walkYaw, 0, "YXZ");
        request();
      }
    },
    { signal },
  );
  host.addEventListener(
    "pointerup",
    (e) => {
      pointerCache.delete(e.pointerId);
      const marker = markerPointers.get(e.pointerId);
      markerPointers.delete(e.pointerId);
      if (drag === e.pointerId) drag = null;
      gesture.up(e.pointerId, performance.now());
      if (!gesture.consume() || e.button !== 0) return;
      if (marker) {
        // OrbitControls captures the pointer, so only a completed tap activates the button.
        if (markerAt(document.elementFromPoint(e.clientX, e.clientY)) === marker) marker.click();
        return;
      }
      const rect = canvas.getBoundingClientRect();
      point.set(
        (2 * (e.clientX - rect.left)) / rect.width - 1,
        1 - (2 * (e.clientY - rect.top)) / rect.height,
      );
      ray.setFromCamera(point, camera);
      const id = model.pick(ray);
      if (id) options.onPick(id);
    },
    { signal },
  );
  host.addEventListener(
    "pointercancel",
    () => {
      pointerCache.clear();
      markerPointers.clear();
      gesture.cancel();
      drag = null;
    },
    { signal },
  );
  canvas.addEventListener(
    "blur",
    () => {
      pressed.clear();
      drag = null;
      pointerCache.clear();
      markerPointers.clear();
      gesture.cancel();
    },
    { signal },
  );
  canvas.addEventListener(
    "keydown",
    (e) => {
      const k = e.key.toLowerCase();
      if (
        ![
          "arrowleft",
          "arrowright",
          "arrowup",
          "arrowdown",
          "w",
          "a",
          "s",
          "d",
          "shift",
          "+",
          "=",
          "-",
        ].includes(k)
      )
        return;
      e.preventDefault();
      drone = false;
      motion = null;
      if (mode === "patio") {
        pressed.add(k);
        request();
        return;
      }
      if (["-", "=", "+"].includes(k)) {
        zoom(k === "-" ? 1.18 : 1 / 1.18);
        return;
      }
      if (!k.startsWith("arrow")) return;
      right.set(1, 0, 0).applyQuaternion(camera.quaternion);
      right.y = 0;
      right.normalize();
      direction.crossVectors(up, right).normalize();
      const step = Math.max(
        0.5,
        (camera === ortho ? span / ortho.zoom : camera.position.distanceTo(controls.target)) *
          0.045,
      );
      const delta =
        k === "arrowleft" || k === "arrowright"
          ? right.multiplyScalar(k === "arrowleft" ? -step : step)
          : direction.multiplyScalar(k === "arrowup" ? step : -step);
      camera.position.add(delta);
      controls.target.add(delta);
      controls.update();
      request();
    },
    { signal },
  );
  canvas.addEventListener("keyup", (e) => pressed.delete(e.key.toLowerCase()), { signal });
  canvas.addEventListener(
    "webglcontextlost",
    (e) => {
      e.preventDefault();
      options.onLost();
    },
    { signal },
  );
  const observer = new ResizeObserver(resize);
  observer.observe(host);
  resize();
  cacheVisibility();
  model.setLayers(layers);
  model.highlight(selected, layers);
  moveTo(
    selected && index.focus(selected) ? { mode: "angular", id: selected } : { mode: "angular" },
  );
  return {
    compare,
    compareOpacity: (opacity: number) => {
      if (overlay) {
        overlay.material.opacity = opacity;
        request();
      }
    },
    removeOverlay: () => {
      removeOverlay();
      request();
    },
    moveTo,
    zoom,
    inspectionMarkers: (markers: InspectionMarker[]) => {
      inspectionMarkers = markers;
      request();
    },
    walk: (value: string | null) => {
      forcedWalk = value;
      request();
    },
    select: (id: string | null) => {
      selected = id;
      model.highlight(id, layers);
      request();
    },
    horizon: (enabled: boolean) => {
      showHorizon = enabled;
      if (horizonRequested) {
        model.showHorizon(enabled);
        renderer.shadowMap.needsUpdate = true;
      }
      request();
    },
    matte: (enabled: boolean) => {
      model.matte(enabled);
      request();
    },
    quality: (setting: "auto" | "economico" | "detalhado") => {
      tier = setting === "auto" ? (limited ? "economico" : "equilibrado") : setting;
      economy = tier === "economico";
      renderer.setPixelRatio(ratio());
      canvas.dataset["quality"] = tier;
      resize();
    },
    layers: (value: SceneLayers) => {
      renderer.shadowMap.needsUpdate = true;
      layers = value;
      cacheVisibility();
      model.setLayers(value);
      request();
    },
    exposure: (value: number) => {
      renderer.toneMappingExposure = value;
      request();
    },
    dispose: () => {
      closed = true;
      abort.abort();
      observer.disconnect();
      cancelAnimationFrame(frame);
      controls.dispose();
      removeOverlay();
      model.dispose();
      illumination.dispose();
      renderer.dispose();
      renderer.forceContextLoss();
      canvas.remove();
    },
  };
}
export type CruzScene = ReturnType<typeof openScene>;
