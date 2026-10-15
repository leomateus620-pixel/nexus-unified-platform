import * as T from "three";
import { createSiloModel } from "./SiloModel";
import { createGrains, QUALITY, type Quality } from "./GrainRenderer";
import { createWorkers, type WorkerPool, type WorkerPose } from "./Workers";
import { createProtection } from "./ProtectionSystem";
import {
  CameraController,
  type InspectionPreset as CameraPreset,
  type CameraViewSnapshot,
} from "./CameraController";
import { InspectionController } from "./InspectionController";
import { createEnvironment } from "./Environment";
import { loadEnvironmentMap, type EnvironmentMapResource } from "./EnvironmentMap";
import { getComponent } from "./ComponentRegistry";
import { releaseContextGpuResources } from "./contextResources";
import { createMetrics, estimateResources, AdaptiveQuality } from "./performance";
import { SILO, CONNECTION_LENGTH, type SiloSimulation } from "./simulation";

export type Highlight = string | null;
export type InspectionPreset = CameraPreset | "incident";
export type SceneOptions = {
  quality: Quality | "auto";
  cut: boolean;
  highlight: Highlight;
  roof?: "closed" | "revealed";
  transparent?: boolean;
  technical?: boolean;
  grains?: boolean;
  hatchOpen?: boolean;
};
export type SceneStatus = "loading" | "ready" | "error" | "lost";
/** Owns one renderer, RAF, abort controller, camera, resources and metrics session. */
export class SiloScene {
  private scene = new T.Scene();
  private camera = new T.PerspectiveCamera(42, 1, 0.1, 100);
  private renderer: T.WebGLRenderer;
  private cameraController: CameraController;
  private model: ReturnType<typeof createSiloModel>;
  private grains: ReturnType<typeof createGrains>;
  private protection: ReturnType<typeof createProtection>;
  private inspection: InspectionController;
  private yard: ReturnType<typeof createEnvironment>;
  private workers: WorkerPool | null = null;
  private controller = new AbortController();
  private raf = 0;
  private last = 0;
  private disposed = false;
  private ready = false;
  private graphicsReady = false;
  private workersCompiled = false;
  private graphicsEpoch = 0;
  private lost = false;
  private enabled = true;
  private resizeObserver: ResizeObserver;
  private unsubscribe: () => void;
  private options: SceneOptions = { quality: "auto", cut: true, highlight: null };
  private adaptive = new AdaptiveQuality();
  readonly metrics = createMetrics();
  private scratch = new T.Vector3();
  private sun: T.DirectionalLight;
  private owned: (T.Material | T.BufferGeometry | T.Texture | T.WebGLRenderTarget)[] = [];
  private environment: EnvironmentMapResource | null = null;
  private environmentLoad: Promise<EnvironmentMapResource>;
  private workerLoad: Promise<WorkerPool | null>;
  private releaseFirstDraw: (() => void) | undefined;
  private poses: { A: WorkerPose; B: WorkerPose };
  private shadowClock = 0;
  private shadowCalls = 0;
  private shadowTriangles = 0;
  private inspectorOpen = false;
  private inspectorExpanded = false;
  private explorationView: CameraViewSnapshot | undefined;
  private pointer: { x: number; y: number; id: number; multi: boolean; moved: boolean } | null =
    null;
  private interiorLight: T.PointLight;
  private hemi: T.HemisphereLight;
  private marker: HTMLDivElement;
  private markerPoint = new T.Vector3();
  private dorsalPoint = new T.Vector3();
  private markerClock = 0;
  private assetTimeout = 0;
  constructor(
    private host: HTMLDivElement,
    private simulation: SiloSimulation,
    private onStatus: (status: SceneStatus, detail: string) => void,
    private onSelect: (id: string) => void = () => {},
  ) {
    this.renderer = new T.WebGLRenderer({
      antialias: false,
      alpha: false,
      powerPreference: "high-performance",
    });
    try {
      // Allocate presentation resources only after a graphics context exists.
      this.model = createSiloModel();
      this.grains = createGrains();
      this.protection = createProtection(SILO.anchor, CONNECTION_LENGTH, { roofTop: SILO.roofTop });
      this.yard = createEnvironment();
      const bindings = new Map([...this.model.bindings, ...this.protection.bindings]);
      bindings.set("structure.grain", [this.grains.root]);
      this.inspection = new InspectionController(bindings, this.invalidate);
      const gl = this.renderer;
      gl.outputColorSpace = T.SRGBColorSpace;
      gl.toneMapping = T.ACESFilmicToneMapping;
      gl.toneMappingExposure = 1.05;
      gl.localClippingEnabled = true;
      gl.shadowMap.enabled = true;
      gl.shadowMap.type = T.PCFShadowMap;
      gl.shadowMap.autoUpdate = false;
      // Shadow samplers need one valid map before an on-demand static frame.
      gl.shadowMap.needsUpdate = true;
      gl.info.autoReset = false;
      gl.domElement.tabIndex = 0;
      gl.domElement.setAttribute(
        "aria-label",
        "Silo 3D interativo. Arraste para olhar; nas vistas internas use também as setas.",
      );
      host.appendChild(gl.domElement);
      this.marker = document.createElement("div");
      this.marker.className = "silo-selection-marker";
      this.marker.setAttribute("aria-hidden", "true");
      host.appendChild(this.marker);
      this.scene.background = new T.Color("#b9c8c9");
      this.scene.fog = new T.Fog("#b9c8c9", 100, 290);
      this.scene.add(this.model.root, this.grains.root, this.protection.root, this.yard.root);
      this.hemi = new T.HemisphereLight("#dceaf4", "#8b8167", 1.3);
      this.scene.add(this.hemi);
      this.sun = new T.DirectionalLight("#fff5dc", 2.7);
      this.sun.position.set(-32, 52, 24);
      this.sun.castShadow = true;
      this.sun.shadow.mapSize.set(1024, 1024);
      this.sun.shadow.camera.left = -23;
      this.sun.shadow.camera.right = 23;
      this.sun.shadow.camera.top = 28;
      this.sun.shadow.camera.bottom = -22;
      this.sun.shadow.camera.near = 1;
      this.sun.shadow.camera.far = 120;
      this.sun.shadow.normalBias = 0.025;
      this.sun.shadow.bias = -0.00015;
      this.sun.target.position.set(0, 12, 0);
      this.scene.add(this.sun, this.sun.target);
      const fill = new T.DirectionalLight("#eff6fa", 0.8);
      fill.position.set(3, 8, -5);
      this.scene.add(fill);
      this.interiorLight = new T.PointLight("#e4f0e5", 14, 28, 1);
      this.interiorLight.position.set(0, 26, -3);
      this.scene.add(this.interiorLight);
      this.camera.position.set(38, 27, 48);
      this.cameraController = new CameraController(this.camera, gl.domElement, this.invalidate);
      this.poses = {
        A: {
          position: [0, 0, 0],
          heading: 0,
          walkPhase: 0,
          mobility: 1,
          depth: 0,
          tension: 0,
          feet: {
            left: { position: [0, 0, 0], yaw: 0, locked: true },
            right: { position: [0, 0, 0], yaw: 0, locked: true },
          },
        },
        B: {
          position: [0, 0, 0],
          heading: 0,
          walkPhase: 0,
          mobility: 1,
          depth: 0,
          tension: 0,
          feet: {
            left: { position: [0, 0, 0], yaw: 0, locked: true },
            right: { position: [0, 0, 0], yaw: 0, locked: true },
          },
        },
      };
      this.resizeObserver = new ResizeObserver(this.resize);
      this.resizeObserver.observe(host);
      this.resize();
      gl.domElement.addEventListener("pointerdown", this.pickDown);
      gl.domElement.addEventListener("pointermove", this.pickMove);
      gl.domElement.addEventListener("pointerup", this.pickUp);
      gl.domElement.addEventListener("pointercancel", this.pickCancel);
      this.unsubscribe = simulation.subscribe(() => {
        const snap = simulation.getSnapshot();
        this.metrics.statusReason = snap.reason;
        if (snap.camera !== this.cameraController.mode) this.cameraController.setMode(snap.camera);
        this.invalidate();
      });
      gl.domElement.addEventListener("webglcontextlost", this.contextLost);
      gl.domElement.addEventListener("webglcontextrestored", this.contextRestored);
      const context = gl.getContext(),
        extension = context.getExtension("WEBGL_debug_renderer_info");
      this.metrics.renderer = extension
        ? String(context.getParameter(extension.UNMASKED_RENDERER_WEBGL))
        : "unavailable";
      this.metrics.parallelShaderCompile = !!context.getExtension("KHR_parallel_shader_compile");
      window.__siloMetrics = this.metrics;
      this.metrics.preparationMs = performance.now() - this.metrics.startedAt;
      onStatus("loading", "Preparando a visualização e os técnicos articulados…");
      // The exact neutral PMREM is baked locally, avoiding synchronous shader
      // compilation and convolution on each new graphics context. Start loads
      // only after synchronous construction can no longer leave a late promise.
      this.environmentLoad = loadEnvironmentMap(this.controller.signal).then((resource) => {
        if (this.disposed) {
          resource.dispose();
          throw new DOMException("Carregamento cancelado", "AbortError");
        }
        this.environment = resource;
        return resource;
      });
      this.assetTimeout = window.setTimeout(() => {
        this.failLoading("Tempo excedido ao carregar ou preparar os recursos 3D; tente novamente.");
      }, 20000);
      const firstDraw = new Promise<void>((resolve) => {
        this.releaseFirstDraw = resolve;
      });
      // Rig decoding and construction can monopolize the main thread even
      // while shaders compile asynchronously. Give exploration its own first
      // frame before starting the isolated worker asset pipeline.
      this.workerLoad = firstDraw
        .then(() => {
          if (this.disposed || this.controller.signal.aborted) return null;
          return createWorkers(this.controller.signal, (id, bytes) => {
            this.metrics.assets[id] = bytes;
          });
        })
        .then((pool) => {
          if (!pool) return null;
          if (this.disposed || this.controller.signal.aborted) {
            pool.dispose();
            return null;
          }
          this.workers = pool;
          pool.root.visible = false;
          this.scene.add(pool.root);
          this.inspection.bind("lvhf.harness", [pool.getTechnician("A")]);
          this.scene.traverse((o) => {
            if (o instanceof T.Mesh) {
              o.onBeforeShadow = () => {
                this.shadowCalls++;
                this.shadowTriangles +=
                  ((o.geometry.index?.count ?? o.geometry.getAttribute("position").count) / 3) *
                  (o instanceof T.InstancedMesh ? o.count : 1);
              };
            }
          });
          estimateResources(this.scene, this.metrics);
          this.metrics.assetReadyMs = performance.now() - this.metrics.startedAt;
          return pool;
        })
        .catch((error) => {
          this.failLoading(error instanceof Error ? error.message : String(error));
          return null;
        });
      void this.prepareGraphics();
    } catch (error) {
      this.dispose();
      throw error;
    }
  }
  private resize = () => {
    const w = Math.max(1, this.host.clientWidth),
      h = Math.max(1, this.host.clientHeight);
    this.camera.aspect = w / h;
    this.camera.updateProjectionMatrix();
    this.renderer.setSize(w, h, false);
    this.cameraController?.resize();
    if (this.cameraController) this.layoutCamera();
    this.invalidate();
  };
  invalidate = () => {
    if (
      !this.disposed &&
      !this.lost &&
      !this.controller.signal.aborted &&
      this.graphicsReady &&
      this.enabled &&
      !this.raf
    )
      this.raf = requestAnimationFrame(this.tick);
  };
  private failLoading(reason: string) {
    if (this.disposed || this.controller.signal.aborted) return;
    ++this.graphicsEpoch;
    this.graphicsReady = false;
    this.workersCompiled = false;
    this.ready = false;
    cancelAnimationFrame(this.raf);
    this.raf = 0;
    this.last = 0;
    this.renderer.domElement.dataset["ready"] = "false";
    window.clearTimeout(this.assetTimeout);
    this.controller.abort(reason);
    this.releaseFirstDraw?.();
    this.releaseFirstDraw = undefined;
    this.simulation.setReady("error", reason);
    this.metrics.errors.push(reason);
    if (!this.lost) this.onStatus("error", reason);
  }
  private async prepareGraphics() {
    const epoch = ++this.graphicsEpoch;
    const current = () =>
      !this.disposed &&
      !this.lost &&
      !this.controller.signal.aborted &&
      epoch === this.graphicsEpoch;
    try {
      const environment = await this.environmentLoad;
      if (!current()) return;
      environment.texture.needsUpdate = true;
      this.scene.environment = environment.texture;
      // Apply the actual clipping, lighting, quality and rig configuration before
      // compiling. A different material variant would otherwise stall first use.
      this.updatePresentation(0, false);
      const mainStarted = performance.now();
      await this.renderer.compileAsync(this.scene, this.camera);
      if (!current()) return;
      if (!this.metrics.mainCompileMs) this.metrics.mainCompileMs = performance.now() - mainStarted;
      this.graphicsReady = true;
      this.invalidate();

      const pool = await this.workerLoad;
      if (!pool || !current()) return;
      this.updatePresentation(0, false);
      const workersStarted = performance.now();
      // Use the target scene's real lights and environment for the added rigs.
      await this.renderer.compileAsync(pool.root, this.camera, this.scene);
      if (!current()) return;
      if (!this.metrics.workerCompileMs)
        this.metrics.workerCompileMs = performance.now() - workersStarted;
      pool.root.visible = true;
      this.workersCompiled = true;
      this.renderer.shadowMap.needsUpdate = true;
      this.invalidate();
    } catch (error) {
      if (current()) this.failLoading(error instanceof Error ? error.message : String(error));
    }
  }
  setOptions(options: SceneOptions) {
    this.options = options;
    this.inspection.select(options.highlight);
    this.model.setPresentation({
      roof: options.roof ?? "closed",
      transparent: options.transparent ?? false,
      hatchOpen: options.hatchOpen ?? false,
    });
    this.workers?.setHarnessHighlight(options.highlight === "lvhf.harness");
    this.marker.textContent = getComponent(options.highlight)?.name ?? "";
    this.markerClock = 1;
    this.cameraController.setInspectionMode(
      !!options.cut || options.roof === "revealed" || !!options.transparent,
    );
    this.renderer.shadowMap.needsUpdate = true;
    this.invalidate();
  }
  setInspectorOpen(open: boolean, expanded = false) {
    this.inspectorOpen = open;
    this.inspectorExpanded = expanded;
    this.layoutCamera();
  }
  saveExplorationView() {
    this.explorationView = this.cameraController.captureView();
  }
  restoreExplorationView() {
    if (this.explorationView) this.cameraController.restoreCapturedView(this.explorationView);
    else this.cameraController.frameSilo();
    this.invalidate();
  }
  private layoutCamera() {
    // A projection-only change can finish in one frame. Reproject the label
    // immediately instead of retaining the bottom-sheet's old screen point.
    this.markerClock = 1;
    const w = this.host.clientWidth,
      h = this.host.clientHeight;
    // Desktop panel is in normal flow; the canvas has already shrunk. Mobile
    // sheet overlays the canvas and its occupied CSS area becomes a view offset.
    const landscape = window.innerHeight <= 500 && window.innerWidth > window.innerHeight;
    this.cameraController.setViewportInsets(
      {
        left: 0,
        top: 0,
        right: this.inspectorOpen && landscape ? 330 : 0,
        bottom:
          this.inspectorOpen && window.innerWidth <= 800 && !landscape
            ? h * (this.inspectorExpanded ? 0.85 : 0.4)
            : 0,
      },
      w,
      h,
    );
    this.invalidate();
  }
  focusComponent(id: string) {
    if (id === "structure.manhole") {
      this.cameraController.setPreset("manhole", this.simulation.getFrame());
      this.simulation.setCamera("frontal");
      this.invalidate();
      return;
    }
    const box = this.inspection.getBounds(id),
      point = box.getCenter(new T.Vector3());
    const direction =
      id === "structure.roof"
        ? new T.Vector3(0.9, 1.6, 1.15)
        : id === "structure.extraction"
          ? new T.Vector3(0.45, 0.65, 1)
          : id.startsWith("lvhf.")
            ? new T.Vector3(-point.x, 2, -point.z).normalize()
            : undefined;
    this.cameraController.focusComponent(box, direction);
    this.simulation.setCamera("frontal");
    this.invalidate();
  }
  isolate(id: string | null) {
    this.inspection.isolate(id);
    this.renderer.shadowMap.needsUpdate = true;
    this.invalidate();
  }
  restoreView() {
    if (this.cameraController.restoreView()) this.simulation.setCamera(this.cameraController.mode);
    this.invalidate();
  }
  followTrolley(enabled: boolean) {
    this.cameraController.followTrolley(enabled);
    if (enabled) this.simulation.setCamera("frontal");
    this.invalidate();
  }
  preset(id: InspectionPreset) {
    if (id === "incident") this.cameraController.frameIncident(this.simulation.getFrame());
    else this.cameraController.setPreset(id, this.simulation.getFrame());
    this.simulation.setCamera("frontal");
    this.invalidate();
  }
  private pickDown = (event: PointerEvent) => {
    if (this.pointer) this.pointer.multi = true;
    else
      this.pointer = {
        x: event.clientX,
        y: event.clientY,
        id: event.pointerId,
        multi: false,
        moved: false,
      };
  };
  private pickMove = (event: PointerEvent) => {
    const start = this.pointer;
    if (
      start &&
      start.id === event.pointerId &&
      Math.hypot(event.clientX - start.x, event.clientY - start.y) > 7
    )
      start.moved = true;
  };
  private pickCancel = () => {
    this.pointer = null;
  };
  private get sectionCut() {
    return (
      !!this.options.cut &&
      !this.cameraController.internal &&
      this.simulation.getSnapshot().experience !== "prevention"
    );
  }
  private pickUp = (event: PointerEvent) => {
    const start = this.pointer;
    this.pointer = null;
    if (
      !start ||
      start.multi ||
      start.moved ||
      start.id !== event.pointerId ||
      Math.hypot(event.clientX - start.x, event.clientY - start.y) > 7
    )
      return;
    const now = performance.now(),
      id = this.inspection.pick(
        event.clientX,
        event.clientY,
        this.camera,
        this.renderer.domElement,
        this.sectionCut,
      );
    this.metrics.picking.push(performance.now() - now);
    if (this.metrics.picking.length > 300) this.metrics.picking.shift();
    if (id) this.onSelect(id);
  };
  reframeCamera() {
    this.cameraController.setMode(this.simulation.getSnapshot().camera);
  }
  setVisible(visible: boolean) {
    this.enabled = visible;
    this.last = 0;
    if (!visible) {
      cancelAnimationFrame(this.raf);
      this.raf = 0;
    } else this.invalidate();
  }
  private contextLost = (event: Event) => {
    event.preventDefault();
    this.lost = true;
    this.graphicsReady = false;
    this.workersCompiled = false;
    this.ready = false;
    ++this.graphicsEpoch;
    if (this.workers) this.workers.root.visible = false;
    cancelAnimationFrame(this.raf);
    this.raf = 0;
    this.metrics.contextLosses++;
    releaseContextGpuResources(this.scene, [
      ...this.owned,
      ...(this.workers?.getGpuResources() ?? []),
      ...(this.environment ? [this.environment.texture] : []),
      ...(this.sun.shadow.map ? [this.sun.shadow.map] : []),
      ...(this.sun.shadow.mapPass ? [this.sun.shadow.mapPass] : []),
    ]);
    const reason = "Contexto gráfico perdido. Recupere a visualização para continuar.";
    this.simulation.pause(reason);
    if (this.simulation.getSnapshot().loading !== "error") this.simulation.setReady(false, reason);
    this.renderer.domElement.dataset["ready"] = "false";
    this.onStatus("lost", "Contexto WebGL perdido; o relógio foi pausado.");
  };
  private contextRestored = () => {
    if (this.disposed) return;
    this.lost = false;
    this.last = 0;
    this.renderer.shadowMap.needsUpdate = true;
    if (this.simulation.getSnapshot().loading === "error") {
      this.onStatus("error", this.simulation.getSnapshot().reason);
      return;
    }
    this.onStatus("loading", "Restaurando os materiais e os técnicos articulados…");
    window.clearTimeout(this.assetTimeout);
    this.assetTimeout = window.setTimeout(() => {
      this.failLoading("Tempo excedido ao restaurar os recursos 3D; tente novamente.");
    }, 20000);
    void this.prepareGraphics();
  };
  private updatePresentation(delta: number, playing: boolean) {
    const frame = this.simulation.advance(playing ? delta : 0),
      snap = this.simulation.getSnapshot();
    const quality = this.options.quality === "auto" ? this.adaptive.quality : this.options.quality;
    if (
      this.metrics.quality !== quality ||
      this.renderer.getPixelRatio() !== Math.min(devicePixelRatio, QUALITY[quality].dpr)
    ) {
      this.metrics.quality = quality;
      this.renderer.setPixelRatio(Math.min(devicePixelRatio, QUALITY[quality].dpr));
      this.renderer.setSize(
        Math.max(1, this.host.clientWidth),
        Math.max(1, this.host.clientHeight),
        false,
      );
    }
    const internal = snap.camera === "connected" || snap.camera === "victim";
    const sectionCut = this.sectionCut;
    this.model.setView(sectionCut, internal, snap.camera === "top");
    this.inspection.setCut(sectionCut);
    this.model.update(0);
    this.grains.root.visible = this.options.grains !== false;
    this.yard.setQuality(quality);
    this.hemi.intensity = this.options.technical ? 2.1 : 1.3;
    this.interiorLight.intensity = this.options.technical ? 32 : 8;
    for (const id of ["A", "B"] as const) {
      const w = frame.workers[id],
        pose = this.poses[id],
        p = pose.position as [number, number, number];
      p[0] = w.position.x;
      p[1] = w.position.y;
      p[2] = w.position.z;
      pose.heading = w.yaw;
      pose.walkPhase = w.walkPhase;
      pose.mobility = w.mobility;
      pose.depth = w.depth;
      pose.tension = w.tension;
      pose.lean = w.lean;
      pose.connected = w.connected;
      pose.dorsal = [w.harness.x, w.harness.y, w.harness.z];
      for (const side of ["left", "right"] as const) {
        const foot = w.feet[side],
          target = pose.feet![side],
          point = target.position as [number, number, number];
        point[0] = foot.position.x;
        point[1] = foot.position.y;
        point[2] = foot.position.z;
        target.yaw = foot.yaw;
        target.locked = foot.locked;
      }
    }
    this.workers?.update(
      this.poses,
      this.camera,
      internal ? (snap.camera === "connected" ? "A" : "B") : null,
    );
    this.workers?.getHarness("A", this.scratch);
    const workersSurfaceVisible =
      frame.supportAvailable && (frame.entryBlocked || this.options.grains !== false);
    this.workers?.setSupported(workersSurfaceVisible, !this.inspection.isolation);
    this.dorsalPoint.set(
      frame.connection.harness.x,
      frame.connection.harness.y,
      frame.connection.harness.z,
    );
    this.metrics.dorsalError = this.workers ? this.scratch.distanceTo(this.dorsalPoint) : 0;
    this.protection.update(
      this.workers ? this.scratch : this.dorsalPoint,
      frame.connection.tension,
      frame.connection.connected && workersSurfaceVisible && this.workersCompiled,
      frame.connection.anchor,
      frame.trolley.distance,
    );
    this.workers?.setCut(sectionCut);
    this.inspection.sync();
    const movingCamera = this.cameraController.update(
      delta,
      frame,
      this.workers
        ? (id, out) => {
            this.workers!.getEye(id, out);
          }
        : undefined,
    );
    this.grains.update(frame, quality, sectionCut, internal, this.camera);
    return { frame, snap, quality, internal, movingCamera };
  }
  private tick = (now: number) => {
    const tickStarted = performance.now();
    this.raf = 0;
    if (
      this.disposed ||
      this.lost ||
      this.controller.signal.aborted ||
      !this.graphicsReady ||
      !this.enabled
    )
      return;
    const delta = this.last ? Math.min(1, (now - this.last) / 1000) : 1 / 60;
    this.last = now;
    const playing = this.simulation.getSnapshot().status === "running" && this.ready;
    const { frame, snap, quality, internal, movingCamera } = this.updatePresentation(
      delta,
      playing,
    );
    this.shadowClock += delta;
    if (this.shadowClock > 0.3 && playing) {
      this.renderer.shadowMap.needsUpdate = true;
      this.shadowClock = 0;
    }
    this.shadowCalls = this.shadowTriangles = 0;
    this.renderer.info.reset();
    const renderStart = performance.now();
    this.renderer.render(this.scene, this.camera);
    this.metrics.renderCount++;
    if (!this.metrics.explorationMs) {
      this.metrics.explorationMs = performance.now() - this.metrics.startedAt;
      this.renderer.domElement.dataset["explorationReady"] = "true";
      if (!this.workersCompiled)
        this.onStatus("loading", "Exploração disponível; preparando os técnicos articulados…");
    }
    this.releaseFirstDraw?.();
    this.releaseFirstDraw = undefined;
    // Loaded assets alone are insufficient: publish simulation readiness only
    // after the visible rigs and essential scene have completed an actual draw.
    if (this.workersCompiled && !this.ready) {
      this.ready = true;
      window.clearTimeout(this.assetTimeout);
      if (!this.metrics.readyMs) this.metrics.readyMs = performance.now() - this.metrics.startedAt;
      this.simulation.setReady(true);
      this.renderer.domElement.dataset["ready"] = "true";
      this.onStatus("ready", "Geometria, materiais e técnicos disponíveis");
    }
    const cpu = performance.now() - renderStart;
    const info = this.renderer.info;
    this.metrics.calls = info.render.calls;
    this.metrics.triangles = info.render.triangles;
    this.metrics.shadowCalls = this.shadowCalls;
    this.metrics.shadowTriangles = this.shadowTriangles;
    this.metrics.geometries = info.memory.geometries;
    this.metrics.textures = info.memory.textures;
    this.camera.position.toArray(this.metrics.cameraPosition);
    this.cameraController.orbit.target.toArray(this.metrics.cameraTarget);
    this.camera.quaternion.toArray(this.metrics.cameraQuaternion);
    this.metrics.projection = this.camera.projectionMatrix.toArray();
    this.metrics.cameraLens = [this.camera.near, this.camera.far, this.camera.aspect];
    this.metrics.controllerCamera = this.cameraController.mode;
    this.metrics.selectedId = this.inspection.selection;
    this.metrics.isolatedId = this.inspection.isolation;
    this.metrics.workerVisible.A =
      !!this.workers?.root.visible && this.workers.getTechnician("A").visible;
    this.metrics.workerVisible.B =
      !!this.workers?.root.visible && this.workers.getTechnician("B").visible;
    this.metrics.grainsVisible = this.grains.root.visible;
    this.metrics.ropeVisible = this.protection.bindings.get("lvhf.rope")?.[0]?.visible ?? false;
    this.markerClock += delta;
    if (this.markerClock > 0.1) {
      this.markerClock = 0;
      const selected = getComponent(this.options.highlight);
      const allowed =
        selected &&
        !internal &&
        (selected.category !== "system" ||
          this.options.cut ||
          this.options.roof === "revealed" ||
          this.options.transparent);
      this.marker.hidden = !allowed;
      if (allowed) {
        this.inspection.getBounds(selected.id).getCenter(this.markerPoint);
        this.markerPoint.project(this.camera);
        const w = this.host.clientWidth,
          h = this.host.clientHeight,
          x = (this.markerPoint.x * 0.5 + 0.5) * w,
          y = (-this.markerPoint.y * 0.5 + 0.5) * h;
        this.marker.hidden = this.markerPoint.z > 1 || x < 20 || x > w - 20 || y < 80 || y > h - 75;
        this.marker.style.left = Math.max(100, Math.min(w - 100, x)) + "px";
        this.marker.style.top = Math.max(85, y - 45) + "px";
      }
    }
    if ((playing || movingCamera) && delta < 0.5) {
      this.metrics.frames.push({
        atMs: now,
        ms: delta * 1000,
        cpuMs: cpu,
        updateCpuMs: renderStart - tickStarted,
        tickCpuMs: performance.now() - tickStarted,
        camera: snap.camera,
        quality,
        calls: info.render.calls,
        triangles: info.render.triangles,
        shadowCalls: this.shadowCalls,
        shadowTriangles: this.shadowTriangles,
        activity: playing ? "playback" : "navigation",
      });
      if (this.metrics.frames.length > 2400) this.metrics.frames.shift();
      if (this.options.quality === "auto") this.adaptive.observe(delta * 1000, now);
    }
    this.renderer.domElement.dataset["camera"] = snap.camera;
    this.renderer.domElement.dataset["status"] = snap.status;
    this.renderer.domElement.dataset["time"] = String(frame.time);
    this.renderer.domElement.dataset["calls"] = String(info.render.calls);
    this.renderer.domElement.dataset["triangles"] = String(info.render.triangles);
    this.renderer.domElement.dataset["occluded"] = String(
      internal && frame.workers[snap.camera === "connected" ? "A" : "B"].occluded,
    );
    if (snap.status === "running" || movingCamera) this.invalidate();
    else this.last = 0;
  };
  dispose() {
    if (this.disposed) return;
    this.disposed = true;
    this.metrics.disposed = true;
    cancelAnimationFrame(this.raf);
    this.controller.abort();
    this.releaseFirstDraw?.();
    this.releaseFirstDraw = undefined;
    window.clearTimeout(this.assetTimeout);
    this.unsubscribe?.();
    this.resizeObserver?.disconnect();
    const c = this.renderer.domElement;
    c.removeEventListener("webglcontextlost", this.contextLost);
    c.removeEventListener("webglcontextrestored", this.contextRestored);
    c.removeEventListener("pointerdown", this.pickDown);
    c.removeEventListener("pointermove", this.pickMove);
    c.removeEventListener("pointerup", this.pickUp);
    c.removeEventListener("pointercancel", this.pickCancel);
    this.cameraController?.dispose();
    this.workers?.dispose();
    this.protection?.dispose();
    this.inspection?.dispose();
    this.yard?.dispose();
    this.grains?.dispose();
    this.model?.dispose();
    this.owned.forEach((r) => r.dispose());
    this.environment?.dispose();
    this.sun?.shadow.dispose();
    this.scene.clear();
    this.renderer.dispose();
    this.renderer.forceContextLoss();
    this.marker?.remove();
    c.remove();
  }
}
