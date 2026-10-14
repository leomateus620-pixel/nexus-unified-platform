import {
  BODY_AREA,
  clamp,
  dischargeAt,
  INITIAL_GRAIN_VOLUME,
  metres,
  ratio,
  seconds,
  SILO,
  smooth,
  surfaceAt,
  type CubicMetres,
  type Metres,
  type Ratio,
  type Seconds,
  type VolumeFlow,
} from "./GrainField";
import { educationalVitals, type EducationalVitals } from "./educationalVitals";

export { SILO } from "./GrainField";
export type CameraMode = "frontal" | "top" | "connected" | "victim";
export type Scenario = "comparison" | "no-connection" | "prevention";
export type PlaybackState = "idle" | "running" | "paused" | "completed";
export type LoadingState = "loading" | "ready" | "error";
export type IncidentStage =
  | "presentation"
  | "walking"
  | "discharge"
  | "loss-of-support"
  | "entrapment"
  | "ventilatory"
  | "full-engulfment"
  | "analysis"
  | "prevention";

export const STAGES: Readonly<Record<IncidentStage, string>> = Object.freeze({
  presentation: "Estrutura e identificação",
  walking: "Superfície aparentemente estável",
  discharge: "Falha de controle • descarga aberta",
  "loss-of-support": "Perda de apoio",
  entrapment: "Aprisionamento • perda de autoextração",
  ventilatory: "Possível comprometimento ventilatório",
  "full-engulfment": "Engolfamento completo",
  analysis: "Análise e prevenção",
  prevention: "Entrada impedida • controles prévios",
});

export interface Position {
  x: Metres;
  y: Metres;
  z: Metres;
}
export interface WorkerFrame {
  position: Position;
  eye: Position;
  harness: Position;
  feet: { left: FootSupport; right: FootSupport };
  depth: Metres;
  mobility: Ratio;
  walkPhase: number;
  yaw: number;
  heading: number;
  lean: number;
  connected: boolean;
  occluded: boolean;
  tension: Ratio;
}
export interface FootSupport {
  /** World sole position. A planted walking foot is stationary in this frame. */
  position: Position;
  yaw: number;
  /** Planted during walking; after support loss, fixed relative to transported body. */
  locked: boolean;
}
export interface ConnectionFrame {
  anchor: Position;
  harness: Position;
  connected: boolean;
  maxLength: Metres;
  distance: Metres;
  slack: Metres;
  tension: Ratio;
  limited: boolean;
}
export interface SiloFrame {
  time: Seconds;
  incidentTime: Seconds;
  stage: IncidentStage;
  gate: Ratio;
  flow: VolumeFlow;
  volume: CubicMetres;
  surfaceHeight: Metres;
  depression: Metres;
  workers: { A: WorkerFrame; B: WorkerFrame };
  connection: ConnectionFrame;
  entryBlocked: boolean;
  seed: number;
}
export interface IncidentEvent {
  readonly at: Seconds;
  readonly label: string;
}
export interface SimulationSnapshot {
  readonly status: PlaybackState;
  readonly loading: LoadingState;
  readonly camera: CameraMode;
  readonly scenario: Scenario;
  readonly playbackRate: number;
  readonly reason: string;
  readonly revision: number;
  readonly frame: Readonly<SiloFrame>;
  readonly vitals: EducationalVitals;
  readonly events: readonly IncidentEvent[];
  readonly elapsed: Seconds;
  readonly stage: IncidentStage;
}

const position = (x = 0, y = 0, z = 0): Position => ({
  x: metres(x),
  y: metres(y),
  z: metres(z),
});
const copyPosition = (p: Position) => Object.freeze({ ...p });
const worker = (): WorkerFrame => ({
  position: position(),
  eye: position(),
  harness: position(),
  feet: {
    left: { position: position(), yaw: 0, locked: true },
    right: { position: position(), yaw: 0, locked: true },
  },
  depth: metres(0),
  mobility: ratio(1),
  walkPhase: 0,
  yaw: 0,
  heading: 0,
  lean: 0,
  connected: false,
  occluded: false,
  tension: ratio(0),
});

const WALK_START = 3;
const WALK_END = 6;
const STEP_CYCLE = 1.5;
const STEP_STANCE = 0.9;
const STEP_SWING = STEP_CYCLE - STEP_STANCE;
/** Symmetric root trajectory before flow starts; reused for world support anchors. */
function walkingRootX(time: number, direction: number) {
  return direction * (0.95 - 0.25 * smooth((time - WALK_START) / (WALK_END - WALK_START)));
}

function evaluateFeet(time: number, id: "A" | "B", person: WorkerFrame, frame: SiloFrame) {
  const direction = id === "A" ? -1 : 1;
  for (const side of ["left", "right"] as const) {
    const foot = person.feet[side];
    const lateral = (side === "left" ? 1 : -1) * 0.12;
    // Before discharge, heading is +/-90 degrees and lateral spacing lies on Z.
    const sideZ = lateral * direction;
    foot.yaw = person.yaw;
    if (frame.entryBlocked) {
      foot.position.x = person.position.x;
      foot.position.z = metres(person.position.z + sideZ);
      foot.position.y = person.position.y;
      foot.locked = true;
      continue;
    }
    const offset = side === "left" ? 0 : STEP_CYCLE / 2;
    const walkingTime = clamp(time, WALK_START, WALK_END);
    const cycleStart =
      WALK_START +
      Math.floor((walkingTime - WALK_START + offset) / STEP_CYCLE) * STEP_CYCLE -
      offset;
    const elapsed = walkingTime - cycleStart;
    // The initial stance is the actual initial foot location, not a future anchor.
    const anchorTime = cycleStart <= WALK_START ? WALK_START : cycleStart + STEP_STANCE / 2;
    const anchorX = walkingRootX(anchorTime, direction);
    let x = anchorX;
    let lift = 0;
    foot.locked = elapsed <= STEP_STANCE || time <= WALK_START || time >= WALK_END;
    if (elapsed > STEP_STANCE) {
      const progress = (elapsed - STEP_STANCE) / STEP_SWING;
      const nextX = walkingRootX(cycleStart + STEP_CYCLE + STEP_STANCE / 2, direction);
      x += (nextX - anchorX) * smooth(progress);
      lift = 0.065 * Math.sin(Math.PI * progress);
    }
    if (time >= WALK_END) {
      // Preserve the final footprint relative to the body, then transport it with
      // the same constrained/engulfed root. No independent hidden walking cycle.
      foot.position.x = metres(x + person.position.x - walkingRootX(WALK_END, direction));
      foot.position.z = metres(person.position.z + sideZ);
      foot.position.y = person.position.y;
    } else {
      foot.position.x = metres(x);
      foot.position.z = metres(0.3 + sideZ);
      foot.position.y = metres(surfaceAt(x, foot.position.z, frame) + lift);
    }
  }
}

export const CONNECTION_LENGTH = metres(
  Math.hypot(
    -0.95 - SILO.anchor[0],
    SILO.initialSurface + SILO.dorsalHeight - SILO.anchor[1],
    0.16,
  ) + 0.45,
);

export function createFrame(): SiloFrame {
  const A = worker();
  return {
    time: seconds(0),
    incidentTime: seconds(0),
    stage: "presentation",
    gate: ratio(0),
    flow: 0 as VolumeFlow,
    volume: INITIAL_GRAIN_VOLUME,
    surfaceHeight: SILO.initialSurface,
    depression: metres(0),
    workers: { A, B: worker() },
    connection: {
      anchor: position(...SILO.anchor),
      harness: A.harness,
      connected: true,
      maxLength: CONNECTION_LENGTH,
      distance: metres(0),
      slack: CONNECTION_LENGTH,
      tension: ratio(0),
      limited: false,
    },
    entryBlocked: false,
    seed: SILO.seed,
  };
}

/**
 * Direct evaluation permits exact reverse seeking without future-state residues.
 * The incident is a kinematic training configuration: volume obeys the gate
 * integral; a symmetric radial trajectory and support-depth schedule model loss
 * of support. These times and dimensions are illustrative, not OSHA calibration
 * or a material-specific physical prediction. Quality and cameras never enter it.
 */
export function evaluateFrame(
  time: number,
  scenario: Scenario = "comparison",
  out = createFrame(),
): SiloFrame {
  const t = clamp(Number.isFinite(time) ? time : 0, 0, SILO.duration);
  const prevention = scenario === "prevention";
  const incident = prevention ? 0 : Math.max(0, t - SILO.incidentStart);
  const discharge = dischargeAt(prevention ? 0 : t);
  out.time = seconds(t);
  out.incidentTime = seconds(incident);
  out.gate = discharge.gate;
  out.flow = (discharge.gate * SILO.nominalDischarge) as VolumeFlow;
  out.volume = Math.max(0, INITIAL_GRAIN_VOLUME - discharge.discharged) as CubicMetres;
  out.surfaceHeight = metres(SILO.initialSurface - discharge.discharged / BODY_AREA);
  // The depression relaxes slowly after isolation, without adding any volume.
  out.depression = metres(
    SILO.maximumDepression * smooth(incident / 4) * (1 - 0.4 * smooth((t - 22) / 6)),
  );
  out.entryBlocked = prevention;
  const walk = smooth((t - 3) / 3);
  const advection = 0.24 * smooth(incident / 11);
  const x = 0.95 - 0.25 * walk - advection;
  const z = 0.3 - 0.06 * smooth(incident / 11);
  // Normalize the integrated discharge, not an independent animation timer.
  // The chosen kinematic response is still illustrative, not a material law.
  const unconstrainedDepth = prevention
    ? 0
    : 2.02 * smooth((discharge.discharged / SILO.nominalDischarge - 0.75) / 12.2);
  const connection = out.connection;
  connection.connected = scenario === "comparison";
  connection.limited = false;
  connection.tension = ratio(0);
  connection.slack = CONNECTION_LENGTH;
  for (const id of ["A", "B"] as const) {
    const person = out.workers[id];
    person.position.x = metres(prevention ? (id === "A" ? -4 : 4) : id === "A" ? -x : x);
    person.position.z = metres(prevention ? 1.5 : z);
    const surface = surfaceAt(person.position.x, person.position.z, out);
    const naturalY = surface - unconstrainedDepth;
    let y = prevention ? 0 : naturalY;
    person.connected = id === "A" && connection.connected;
    if (person.connected) {
      // Inextensible line, early retention. No spring, payout, lift or rescue.
      const hx = person.position.x - connection.anchor.x;
      const hz = person.position.z + SILO.dorsalBack - connection.anchor.z;
      const verticalLimit = Math.sqrt(Math.max(0, CONNECTION_LENGTH ** 2 - hx * hx - hz * hz));
      const lowestFoot = connection.anchor.y - verticalLimit - SILO.dorsalHeight;
      if (y < lowestFoot) {
        y = lowestFoot;
        connection.limited = true;
        connection.tension = ratio(1);
      }
    }
    person.position.y = metres(y);
    person.depth = metres(prevention ? 0 : Math.max(0, surface - y));
    person.mobility = ratio(1 - smooth((person.depth - 0.1) / 0.65));
    // Walking stops at loss of support. Frozen feet remain caught, rather than
    // continuing a walking cycle beneath the grain surface.
    const walkTime = clamp(t - 3, 0, 3);
    person.walkPhase = walkTime * 4.3;
    const facing = id === "A" ? 1 : -1;
    person.yaw = person.heading =
      facing * (Math.PI / 2 + (Math.PI / 7 - Math.PI / 2) * smooth(t - WALK_END));
    person.lean = prevention ? 0 : 0.13 * smooth(incident / 4) + 0.19 * (1 - person.mobility);
    person.tension = person.connected ? connection.tension : ratio(0);
    person.eye.x = person.position.x;
    person.eye.y = metres(y + SILO.eyeHeight - person.lean * 0.14);
    person.eye.z = metres(person.position.z + person.lean * 0.15);
    person.harness.x = person.position.x;
    person.harness.y = metres(y + SILO.dorsalHeight);
    person.harness.z = metres(person.position.z + SILO.dorsalBack);
    person.occluded = !prevention && person.eye.y <= surfaceAt(person.eye.x, person.eye.z, out);
    evaluateFeet(t, id, person, out);
  }
  connection.distance = metres(
    Math.hypot(
      connection.anchor.x - connection.harness.x,
      connection.anchor.y - connection.harness.y,
      connection.anchor.z - connection.harness.z,
    ),
  );
  if (connection.connected)
    connection.slack = metres(Math.max(0, connection.maxLength - connection.distance));
  const depth = out.workers.B.depth;
  out.stage = prevention
    ? t >= 25
      ? "analysis"
      : "prevention"
    : t >= 25
      ? "analysis"
      : t < 3
        ? "presentation"
        : t < 6
          ? "walking"
          : depth >= 1.8
            ? "full-engulfment"
            : depth >= 1.15
              ? "ventilatory"
              : depth >= 0.45
                ? "entrapment"
                : depth > 0.02
                  ? "loss-of-support"
                  : "discharge";
  return out;
}

const INCIDENT_EVENTS: readonly IncidentEvent[] = Object.freeze([
  Object.freeze({ at: seconds(0), label: "Dois técnicos na mesma condição local de exposição" }),
  Object.freeze({
    at: seconds(3),
    label: "Caminhada curta sobre superfície aparentemente estável",
  }),
  Object.freeze({ at: seconds(6), label: "Falha de controle e abertura do registro" }),
  Object.freeze({ at: seconds(9), label: "Perda progressiva de apoio e mobilidade" }),
  Object.freeze({ at: seconds(12), label: "Retenção precoce ilustrativa; emergência permanece" }),
  Object.freeze({
    at: seconds(18),
    label: "Vítima encoberta; nenhuma estimativa de sobrevivência",
  }),
  Object.freeze({ at: seconds(22), label: "Fluxo isolado; retirada depende de resgate planejado" }),
  Object.freeze({ at: seconds(25), label: "Comparação, fontes e controles preventivos" }),
]);
const NO_CONNECTION_EVENTS: readonly IncidentEvent[] = Object.freeze(
  INCIDENT_EVENTS.map((event) =>
    event.at === 12
      ? Object.freeze({
          at: event.at,
          label: "Mesma trajetória sem conexão; deslocamento sem limite da linha",
        })
      : event,
  ),
);
const PREVENTION_EVENTS: readonly IncidentEvent[] = Object.freeze([
  Object.freeze({
    at: seconds(0),
    label: "Entrada impedida enquanto os controles não forem confirmados",
  }),
  Object.freeze({
    at: seconds(3),
    label: "Isolamento e bloqueio de movimentação e energias perigosas",
  }),
  Object.freeze({
    at: seconds(6),
    label: "Avaliação de riscos, PET e vigia externo conforme aplicabilidade",
  }),
  Object.freeze({
    at: seconds(9),
    label: "Avaliação e monitoramento atmosférico independente do pulso",
  }),
  Object.freeze({
    at: seconds(12),
    label: "Proteção e meios de resgate definidos antes da entrada",
  }),
  Object.freeze({
    at: seconds(25),
    label: "Sem condição controlada, a entrada permanece impedida",
  }),
]);

function immutableFrame(frame: SiloFrame): Readonly<SiloFrame> {
  const immutableWorker = (w: WorkerFrame) =>
    Object.freeze({
      ...w,
      position: copyPosition(w.position),
      eye: copyPosition(w.eye),
      harness: copyPosition(w.harness),
      feet: Object.freeze({
        left: Object.freeze({ ...w.feet.left, position: copyPosition(w.feet.left.position) }),
        right: Object.freeze({ ...w.feet.right, position: copyPosition(w.feet.right.position) }),
      }),
    });
  return Object.freeze({
    ...frame,
    workers: Object.freeze({
      A: immutableWorker(frame.workers.A),
      B: immutableWorker(frame.workers.B),
    }),
    connection: Object.freeze({
      ...frame.connection,
      anchor: copyPosition(frame.connection.anchor),
      harness: copyPosition(frame.connection.harness),
    }),
  });
}

/** One domain clock; bounded, fixed-step advancement, independent of React/DOM. */
export class SiloSimulation {
  readonly frame = createFrame();
  private ticks = 0;
  private origin = 0;
  private accumulator = 0;
  private publicationElapsed = 0;
  private listeners = new Set<() => void>();
  private snapshot: SimulationSnapshot;

  constructor() {
    evaluateFrame(0, "comparison", this.frame);
    this.snapshot = Object.freeze({
      status: "idle",
      loading: "loading",
      camera: "frontal",
      scenario: "comparison",
      playbackRate: 1,
      reason: "",
      revision: 0,
      frame: immutableFrame(this.frame),
      vitals: educationalVitals(0, 0),
      events: Object.freeze(INCIDENT_EVENTS.filter((event) => event.at === 0)),
      elapsed: seconds(0),
      stage: this.frame.stage,
    });
  }

  getSnapshot = () => this.snapshot;
  getFrame = () => this.frame;
  subscribe = (listener: () => void) => {
    this.listeners.add(listener);
    return () => {
      this.listeners.delete(listener);
    };
  };

  private publish(change: Partial<SimulationSnapshot> = {}) {
    const scenario = change.scenario ?? this.snapshot.scenario;
    const events =
      scenario === "prevention"
        ? PREVENTION_EVENTS
        : scenario === "no-connection"
          ? NO_CONNECTION_EVENTS
          : INCIDENT_EVENTS;
    this.snapshot = Object.freeze({
      ...this.snapshot,
      ...change,
      frame: immutableFrame(this.frame),
      elapsed: this.frame.time,
      stage: this.frame.stage,
      vitals: educationalVitals(
        this.frame.time,
        this.frame.workers.B.depth,
        scenario === "prevention",
      ),
      events: Object.freeze(events.filter((event) => event.at <= this.frame.time)),
    });
    this.listeners.forEach((listener) => listener());
  }

  setReady(state: boolean | LoadingState, reason = "") {
    const loading = typeof state === "boolean" ? (state ? "ready" : "loading") : state;
    if (loading !== "ready" && this.snapshot.status === "running")
      this.pause(reason || "Recursos indisponíveis");
    this.publish({ loading, reason });
  }
  start() {
    if (this.snapshot.loading !== "ready") return false;
    this.reset();
    this.publish({ status: "running", reason: "" });
    return true;
  }
  pause(reason = "Pausado") {
    if (this.snapshot.status !== "running") return;
    // Interpolated remainder becomes the exact restart origin; no rewind on pause.
    this.origin = this.frame.time;
    this.ticks = 0;
    this.accumulator = 0;
    this.publicationElapsed = 0;
    this.publish({ status: "paused", reason });
  }
  resume() {
    if (this.snapshot.status !== "paused" || this.snapshot.loading !== "ready") return false;
    this.publish({ status: "running", reason: "" });
    return true;
  }
  reset() {
    this.ticks = this.origin = this.accumulator = this.publicationElapsed = 0;
    evaluateFrame(0, this.snapshot.scenario, this.frame);
    this.publish({ status: "idle", reason: "", revision: this.snapshot.revision + 1 });
  }
  seek(time: number) {
    this.origin = clamp(Number.isFinite(time) ? time : 0, 0, SILO.duration);
    this.ticks = this.accumulator = 0;
    this.publicationElapsed = 0;
    evaluateFrame(this.origin, this.snapshot.scenario, this.frame);
    this.publish({
      status: this.origin >= SILO.duration ? "completed" : "paused",
      reason: "Instante selecionado",
    });
  }
  setPlaybackRate(rate: number) {
    if (!Number.isFinite(rate)) return;
    this.publish({ playbackRate: clamp(rate, 0.25, 1) });
  }
  setCamera(camera: CameraMode) {
    if (!["frontal", "top", "connected", "victim"].includes(camera)) return;
    this.publish({ camera });
  }
  setScenario(scenario: Scenario) {
    if (!["comparison", "no-connection", "prevention"].includes(scenario)) return;
    // Same seed, elapsed time and trajectories; only the connection/entry condition
    // changes. This is an explicit controlled comparison, not a quality side effect.
    evaluateFrame(this.frame.time, scenario, this.frame);
    this.publish({ scenario, revision: this.snapshot.revision + 1 });
  }

  advance(realDelta: number): SiloFrame {
    if (this.snapshot.status !== "running" || this.snapshot.loading !== "ready") return this.frame;
    if (!Number.isFinite(realDelta) || realDelta < 0) return this.frame;
    const debt = this.accumulator + realDelta * this.snapshot.playbackRate;
    const steps = Math.floor((debt + 1e-10) / SILO.fixedStep);
    if (steps > SILO.maxSubsteps) {
      // No catch-up burst, silent skip or accident acceleration. The pending frame
      // is not consumed: pause at the last presented instant and require resume.
      this.pause("Carga elevada: tempo suspenso. Reduza a qualidade e continue.");
      return this.frame;
    }
    this.ticks += steps;
    this.accumulator = Math.max(0, debt - steps * SILO.fixedStep);
    this.publicationElapsed += realDelta;
    const simulationTime = this.origin + this.ticks * SILO.fixedStep;
    const presentedTime = Math.min(SILO.duration, simulationTime + this.accumulator);
    evaluateFrame(presentedTime, this.snapshot.scenario, this.frame);
    if (presentedTime >= SILO.duration) {
      this.accumulator = 0;
      this.publish({ status: "completed", reason: "Ciclo didático encerrado" });
    } else if (this.publicationElapsed + 1e-9 >= 0.1) {
      // HUD cadence is real-time 10Hz even at 0.25×. This separate publication
      // counter never advances the domain clock; rendering consumes its buffer.
      this.publicationElapsed = Math.max(0, this.publicationElapsed - 0.1) % 0.1;
      this.publish();
    }
    return this.frame;
  }
}
