import * as T from "three";
import { OrbitControls } from "three/addons/controls/OrbitControls.js";
import { SelectionGesture } from "../nr/mapa/gestures";
import type { HorizonInfo } from "./regional-types";
import { daylight } from "./light";
import { buildModel } from "./model";
import { center, extent, type Extent, type SpatialIndex } from "./spatial";
import type {
  CameraMode,
  CruzPart,
  CruzArea,
  CruzLine,
  SceneLayers,
  GroundPoint,
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
  reference?: "dji44" | "encontro";
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
  renderer.toneMappingExposure = 1.1;
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
  const controls = new OrbitControls<T.PerspectiveCamera | T.OrthographicCamera>(camera, canvas);
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
    [...options.labels.querySelectorAll<HTMLSpanElement>("[data-label]")].map((node) => [
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
  function labelsAt(distance: number) {
    const chosen = selected ? index.byId.get(selected) : null;
    const priority = (id: string) =>
      id === selected ? 0 : chosen && index.chains.get(chosen.id)?.includes(id) ? 1 : 2;
    const placed: { x: number; y: number; w: number }[] = [];
    const localKind = mode === "patio" || distance < span * 0.55 ? "estrutura" : "setor";
    for (const [id, node] of [...labelNodes].sort(([a], [b]) => priority(a) - priority(b))) {
      const object = index.byId.get(id)!,
        e = index.focus(id);
      let shown = false;
      if (
        e &&
        layers.nomes &&
        visibility.get(id) &&
        (id === selected || object.kind === localKind)
      ) {
        const [x, z] = center(e);
        temp.set(x, e.top + 1.3, z).project(camera);
        const px = (0.5 + 0.5 * temp.x) * width,
          py = (0.5 - 0.5 * temp.y) * height;
        const w = Math.min(180, node.textContent!.length * 6 + 18);
        if (
          temp.z >= -1 &&
          temp.z <= 1 &&
          px > w / 2 &&
          px < width - w / 2 &&
          py > 20 &&
          py < height - 26 &&
          placed.every((o) => Math.abs(o.y - py) > 24 || Math.abs(o.x - px) > (o.w + w) / 2 + 5) &&
          (mode === "planta" ||
            !index.labelOccluded(camera.position, x, e.top + 1.3, z, id, layers))
        ) {
          placed.push({ x: px, y: py, w });
          shown = true;
          node.style.left = px + "px";
          node.style.top = py + "px";
          node.dataset["selected"] = id === selected ? "true" : "false";
        }
      }
      node.hidden = !shown;
    }
  }
  function updateHud(distance: number) {
    ray.setFromCamera(new T.Vector2(-0.06, -0.63), camera);
    const left = ray.ray.intersectPlane(plane, aGround);
    ray.setFromCamera(new T.Vector2(0.06, -0.63), camera);
    const rightPoint = ray.ray.intersectPlane(plane, bGround);
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
    labelsAt(distance);
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
    if (!index.occupied(x, camera.position.z)) camera.position.x = x;
    if (!index.occupied(camera.position.x, z)) camera.position.z = z;
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
        corners.flatMap(([x, z]) => [x, 0, z]),
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
    model.regionFrame(camera.position);
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
        options.onHorizon(info ? { ...info } : null);
      }
    }
    renderer.info.reset();
    const tick = performance.now();
    renderer.render(scene, camera);
    if (!frames) request();
    else model.loadDetails();
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
    canvas.dataset["calls"] = String(renderer.info.render.calls);
    canvas.dataset["triangles"] = String(renderer.info.render.triangles);
  }
  function resize() {
    const rect = host.getBoundingClientRect();
    width = Math.max(1, rect.width);
    height = Math.max(1, rect.height);
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
      ? physical.flatMap((p) =>
          p.footprint.flatMap(([x, z]) => [
            new T.Vector3(x, p.base ?? 0, z),
            new T.Vector3(x, p.eave + p.rise, z),
          ]),
        )
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
      eye.set(x - d * 0.65, 1.7, z + d * 0.66);
      if (!command.id) {
        // The two maneuvering yards are surveyed on the A1. Select a clear apron along the inherited bearing.
        const heading =
          previous === "angular" ? previousHeading : target.clone().sub(eye).setY(0).normalize();
        const yards = options.areas
          .filter((a) => a.kind === "patio")
          .map((a) => {
            const [px, pz] = center(extent(a.footprint)),
              point = new T.Vector3(px, 1.7, pz);
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
              eye.set(px, 1.7, pz);
              found = true;
            }
          }
      }
      if (previous === "angular" && !initial)
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
      anchor =
        hit?.point.clone() ??
        ray.ray.intersectPlane(plane, new T.Vector3()) ??
        controls.target.clone();
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
      if (next.y < 1.2) next.lerp(eye, (1.2 - next.y) / Math.max(0.01, eye.y - next.y));
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
  canvas.addEventListener(
    "pointerdown",
    (e) => {
      motion = null;
      if (e.pointerType === "touch")
        pointerCache.set(e.pointerId, new T.Vector2(e.clientX, e.clientY));
      canvas.focus({ preventScroll: true });
      gesture.down(e.pointerId, e.clientX, e.clientY, performance.now());
      if (mode === "patio") {
        drag = e.pointerId;
        canvas.setPointerCapture(e.pointerId);
      }
    },
    { signal, capture: true },
  );
  canvas.addEventListener(
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
  canvas.addEventListener(
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
  canvas.addEventListener(
    "pointerup",
    (e) => {
      pointerCache.delete(e.pointerId);
      if (drag === e.pointerId) drag = null;
      gesture.up(e.pointerId, performance.now());
      if (!gesture.consume() || e.button !== 0) return;
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
  canvas.addEventListener(
    "pointercancel",
    () => {
      pointerCache.clear();
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
      if (horizonRequested) model.showHorizon(enabled);
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
