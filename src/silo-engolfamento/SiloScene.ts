import * as T from "three";
import { createSiloModel } from "./SiloModel";
import { createGrains, QUALITY, type Quality } from "./GrainRenderer";
import { createWorkers, type WorkerPool, type WorkerPose } from "./Workers";
import { createProtection } from "./ProtectionSystem";
import { CameraController } from "./CameraController";
import { createMetrics, estimateResources, AdaptiveQuality } from "./performance";
import { SILO, CONNECTION_LENGTH, type SiloSimulation } from "./simulation";

export type Highlight = "anchor" | "line" | "harness" | "gate" | null;
export type SceneOptions = { quality: Quality | "auto"; cut: boolean; highlight: Highlight };
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
  private workers: WorkerPool | null = null;
  private controller = new AbortController();
  private raf = 0;
  private last = 0;
  private disposed = false;
  private ready = false;
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
  private environment: T.WebGLRenderTarget | null = null;
  private poses: { A: WorkerPose; B: WorkerPose };
  private shadowClock = 0;
  private shadowCalls = 0;
  private shadowTriangles = 0;
  constructor(
    private host: HTMLDivElement,
    private simulation: SiloSimulation,
    private onStatus: (status: SceneStatus, detail: string) => void,
  ) {
    this.renderer = new T.WebGLRenderer({
      antialias: false,
      alpha: false,
      powerPreference: "high-performance",
    });
    // Allocate presentation resources only after a graphics context exists.
    this.model = createSiloModel();
    this.grains = createGrains();
    this.protection = createProtection(SILO.anchor, CONNECTION_LENGTH, { roofTop: SILO.roofTop });
    const gl = this.renderer;
    gl.outputColorSpace = T.SRGBColorSpace;
    gl.toneMapping = T.ACESFilmicToneMapping;
    gl.toneMappingExposure = 1.1;
    gl.localClippingEnabled = true;
    gl.shadowMap.enabled = true;
    gl.shadowMap.type = T.PCFShadowMap;
    gl.shadowMap.autoUpdate = false;
    gl.info.autoReset = false;
    gl.domElement.tabIndex = 0;
    gl.domElement.setAttribute(
      "aria-label",
      "Silo 3D interativo. Arraste para olhar; nas vistas internas use também as setas.",
    );
    host.appendChild(gl.domElement);
    this.scene.background = new T.Color("#dce6df");
    this.scene.add(this.model.root, this.grains.root, this.protection.root);
    const hemi = new T.HemisphereLight("#edf5fa", "#8f917c", 2.15);
    this.scene.add(hemi);
    this.sun = new T.DirectionalLight("#fff5dc", 2.7);
    this.sun.position.set(-8, 16, 10);
    this.sun.castShadow = true;
    this.sun.shadow.mapSize.set(1024, 1024);
    this.sun.shadow.camera.left = -9;
    this.sun.shadow.camera.right = 9;
    this.sun.shadow.camera.top = 13;
    this.sun.shadow.camera.bottom = -3;
    this.sun.shadow.camera.near = 1;
    this.sun.shadow.camera.far = 38;
    this.sun.shadow.normalBias = 0.025;
    this.sun.shadow.bias = -0.00015;
    this.sun.target.position.set(0, 5, 0);
    this.scene.add(this.sun, this.sun.target);
    const fill = new T.DirectionalLight("#eff6fa", 0.8);
    fill.position.set(3, 8, -5);
    this.scene.add(fill);
    // Neutral environment for readable rough metal; no external HDR or postprocessing.
    this.refreshEnvironment();
    const floor = new T.Mesh(
      new T.PlaneGeometry(80, 80),
      new T.MeshStandardMaterial({ color: "#d5dfd5", roughness: 1 }),
    );
    floor.rotation.x = -Math.PI / 2;
    floor.position.y = -0.005;
    floor.receiveShadow = true;
    this.scene.add(floor);
    this.owned.push(floor.geometry, floor.material);
    const grid = new T.GridHelper(40, 40, "#afbeb2", "#c5d1c6");
    grid.position.y = -0.004;
    this.scene.add(grid);
    this.owned.push(
      grid.geometry,
      ...(Array.isArray(grid.material) ? grid.material : [grid.material]),
    );
    this.camera.position.set(9, 9, 19);
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
    this.unsubscribe = simulation.subscribe(() => {
      const snap = simulation.getSnapshot();
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
    window.__siloMetrics = this.metrics;
    onStatus("loading", "Carregando os técnicos articulados…");
    void createWorkers(this.controller.signal, (id, bytes) => {
      this.metrics.assets[id] = bytes;
    })
      .then((pool) => {
        if (this.disposed) {
          pool.dispose();
          return;
        }
        this.workers = pool;
        this.scene.add(pool.root);
        this.scene.traverse((o) => {
          if (o instanceof T.Mesh) {
            o.onBeforeShadow = () => {
              this.shadowCalls++;
              this.shadowTriangles +=
                (o.geometry.index?.count ?? o.geometry.getAttribute("position").count) / 3;
            };
          }
        });
        estimateResources(this.scene, this.metrics);
        this.ready = true;
        // Resource completion cannot restore a lost graphics context.
        if (!this.lost) {
          this.metrics.readyMs = performance.now() - this.metrics.startedAt;
          simulation.setReady(true);
          onStatus("ready", "Geometria, técnicos e controlador disponíveis");
          gl.domElement.dataset["ready"] = "true";
        }
        this.invalidate();
      })
      .catch((error) => {
        if (!this.disposed) {
          const msg = error instanceof Error ? error.message : String(error);
          this.metrics.errors.push(msg);
          simulation.setReady("error", msg);
          if (!this.lost) onStatus("error", msg);
        }
      });
    this.invalidate();
  }
  private resize = () => {
    const w = Math.max(1, this.host.clientWidth),
      h = Math.max(1, this.host.clientHeight);
    this.camera.aspect = w / h;
    this.camera.updateProjectionMatrix();
    this.renderer.setSize(w, h, false);
    this.cameraController?.resize();
    this.invalidate();
  };
  invalidate = () => {
    if (!this.disposed && !this.lost && this.enabled && !this.raf)
      this.raf = requestAnimationFrame(this.tick);
  };
  setOptions(options: SceneOptions) {
    const changed = options.highlight !== this.options.highlight;
    this.options = options;
    this.model.highlight(options.highlight);
    this.protection.setHighlight(options.highlight);
    this.workers?.setHarnessHighlight(options.highlight === "harness");
    if (options.highlight && changed) {
      const f = this.simulation.getFrame();
      const p =
        options.highlight === "gate"
          ? [0, SILO.outletY, 0.1]
          : options.highlight === "anchor"
            ? SILO.anchor
            : [f.workers.A.harness.x, f.workers.A.harness.y, f.workers.A.harness.z];
      this.scratch.set(...(p as [number, number, number]));
      const rear = options.highlight === "harness" || options.highlight === "line";
      if (rear) this.workers?.getHarness("A", this.scratch);
      this.cameraController.focus(this.scratch, rear);
    }
    this.invalidate();
  }
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
    cancelAnimationFrame(this.raf);
    this.raf = 0;
    this.metrics.contextLosses++;
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
    // Render target contents are lost; recreate neutral reflections rather than
    // retaining an empty PMREM texture after a restored context.
    this.refreshEnvironment();
    const message = "Contexto restaurado. Continue quando estiver pronto.";
    if (this.ready) {
      this.simulation.setReady(true, message);
      if (!this.metrics.readyMs) this.metrics.readyMs = performance.now() - this.metrics.startedAt;
      this.renderer.domElement.dataset["ready"] = "true";
      this.onStatus("ready", message);
    } else if (this.simulation.getSnapshot().loading === "error") {
      this.onStatus("error", this.simulation.getSnapshot().reason);
    } else this.onStatus("loading", "Contexto restaurado; carregando os técnicos articulados…");
    this.invalidate();
  };
  private refreshEnvironment() {
    const environmentScene = new T.Scene();
    environmentScene.background = new T.Color("#cad8dc");
    const floor = new T.Mesh(
      new T.PlaneGeometry(100, 100),
      new T.MeshBasicMaterial({ color: "#6c7668" }),
    );
    floor.rotation.x = -Math.PI / 2;
    floor.position.y = -1;
    environmentScene.add(floor);
    const generator = new T.PMREMGenerator(this.renderer);
    const target = generator.fromScene(environmentScene, 0.15);
    this.scene.environment = target.texture;
    this.environment?.dispose();
    this.environment = target;
    generator.dispose();
    floor.geometry.dispose();
    floor.material.dispose();
  }
  private tick = (now: number) => {
    this.raf = 0;
    if (this.disposed || this.lost || !this.enabled) return;
    const delta = this.last ? Math.min(1, (now - this.last) / 1000) : 1 / 60;
    this.last = now;
    const playing = this.simulation.getSnapshot().status === "running" && this.ready;
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
    this.model.setView(this.options.cut, internal, snap.camera === "top");
    this.model.update(frame.gate);
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
    this.protection.update(this.scratch, frame.connection.tension, frame.connection.connected);
    const movingCamera = this.cameraController.update(
      delta,
      frame,
      this.workers
        ? (id, out) => {
            this.workers!.getEye(id, out);
          }
        : undefined,
    );
    this.grains.update(frame, quality, this.options.cut, internal, this.camera);
    this.shadowClock += delta;
    if (this.shadowClock > 0.12 || !playing) {
      this.renderer.shadowMap.needsUpdate = true;
      this.shadowClock = 0;
    }
    this.shadowCalls = this.shadowTriangles = 0;
    this.renderer.info.reset();
    const renderStart = performance.now();
    this.renderer.render(this.scene, this.camera);
    const cpu = performance.now() - renderStart;
    const info = this.renderer.info;
    this.metrics.calls = info.render.calls;
    this.metrics.triangles = info.render.triangles;
    this.metrics.shadowCalls = this.shadowCalls;
    this.metrics.shadowTriangles = this.shadowTriangles;
    this.metrics.geometries = info.memory.geometries;
    this.metrics.textures = info.memory.textures;
    if (playing && delta < 0.5) {
      this.metrics.frames.push({
        ms: delta * 1000,
        cpuMs: cpu,
        camera: snap.camera,
        quality,
        calls: info.render.calls,
        triangles: info.render.triangles,
        shadowCalls: this.shadowCalls,
        shadowTriangles: this.shadowTriangles,
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
    this.unsubscribe();
    this.resizeObserver.disconnect();
    const c = this.renderer.domElement;
    c.removeEventListener("webglcontextlost", this.contextLost);
    c.removeEventListener("webglcontextrestored", this.contextRestored);
    this.cameraController.dispose();
    this.workers?.dispose();
    this.protection.dispose();
    this.grains.dispose();
    this.model.dispose();
    this.owned.forEach((r) => r.dispose());
    this.environment?.dispose();
    this.sun.shadow.dispose();
    this.scene.clear();
    this.renderer.dispose();
    this.renderer.forceContextLoss();
    c.remove();
  }
}
