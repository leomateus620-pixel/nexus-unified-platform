import {
  clamp,
  dischargeAt,
  grainVolume,
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
import { INCIDENT_ANGLES, SILO_CONFIG } from "./SiloConfig";
import { createTrolleyFrame, evaluateTrolley, TAU, type TrolleyFrame } from "./LifeLinePath";

export { SILO } from "./GrainField";
export type CameraMode = "frontal" | "top" | "connected" | "victim";
export type Scenario = "comparison" | "no-connection" | "prevention";
export type PlaybackState = "idle" | "running" | "paused" | "completed";
export type LoadingState = "loading" | "ready" | "error";
export type ExperienceMode = "explore" | "lvhf" | "incident" | "prevention";
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
  discharge: "Falha de controle • colapso localizado",
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
  /** True bearing point of the trolley eye. */
  anchor: Position;
  /** Lower tangent of the vertical rigid connector, where the rope begins. */
  ropeAnchor: Position;
  connectorReach: Metres;
  harness: Position;
  connected: boolean;
  maxLength: Metres;
  distance: Metres;
  ropeDistance: Metres;
  totalDistance: Metres;
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
  trolley: TrolleyFrame;
  /** False means workers remain outside the mass; never walk in unsupported air. */
  supportAvailable: boolean;
  entryBlocked: boolean;
  seed: number;
}
export interface IncidentEvent {
  readonly at: Seconds;
  readonly label: string;
}
export interface SimulationSnapshot {
  readonly experience: ExperienceMode;
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
/** Mirrored exposure patches. Both walk 0.609 m along the same perimeter radius. */
function walkingAngle(time: number, id: "A" | "B") {
  const direction = id === "A" ? 1 : -1;
  return (
    INCIDENT_ANGLES[id] +
    direction * 0.06 * (1 - smooth((time - WALK_START) / (WALK_END - WALK_START)))
  );
}

function evaluateFeet(time: number, id: "A" | "B", person: WorkerFrame, frame: SiloFrame) {
  for (const side of ["left", "right"] as const) {
    const foot = person.feet[side];
    const lateral = (side === "left" ? 1 : -1) * 0.12;
    foot.yaw = person.yaw;
    if (frame.entryBlocked) {
      foot.position.x = metres(person.position.x + lateral);
      foot.position.z = person.position.z;
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
    const angle = walkingAngle(anchorTime, id);
    const anchorYaw = angle + (id === "A" ? -Math.PI / 2 : Math.PI / 2);
    foot.yaw = anchorYaw;
    let x = Math.sin(angle) * SILO.workerRadius + lateral * Math.cos(anchorYaw);
    let z = Math.cos(angle) * SILO.workerRadius - lateral * Math.sin(anchorYaw);
    let lift = 0;
    foot.locked = elapsed <= STEP_STANCE || time <= WALK_START || time >= WALK_END;
    if (elapsed > STEP_STANCE) {
      const progress = (elapsed - STEP_STANCE) / STEP_SWING;
      const next = walkingAngle(cycleStart + STEP_CYCLE + STEP_STANCE / 2, id);
      const nextYaw = next + (id === "A" ? -Math.PI / 2 : Math.PI / 2);
      foot.yaw += (nextYaw - anchorYaw) * smooth(progress);
      x +=
        (Math.sin(next) * SILO.workerRadius + lateral * Math.cos(nextYaw) - x) * smooth(progress);
      z +=
        (Math.cos(next) * SILO.workerRadius - lateral * Math.sin(nextYaw) - z) * smooth(progress);
      lift = 0.065 * Math.sin(Math.PI * progress);
    }
    if (time >= WALK_END) {
      // Preserve the final footprint relative to the body, then transport it with
      // the same constrained/engulfed root. No independent hidden walking cycle.
      foot.position.x = metres(
        x + person.position.x - Math.sin(INCIDENT_ANGLES[id]) * SILO.workerRadius,
      );
      foot.position.z = metres(
        z + person.position.z - Math.cos(INCIDENT_ANGLES[id]) * SILO.workerRadius,
      );
      foot.position.y = person.position.y;
    } else {
      foot.position.x = metres(x);
      foot.position.z = metres(z);
      foot.position.y = metres(surfaceAt(x, foot.position.z, frame) + lift);
    }
  }
}

export const CONNECTION_LENGTH = metres(SILO_CONFIG.connectionLength.value);
export const CONNECTOR_REACH = metres(SILO_CONFIG.connectorReach.value);

function updateConnectionDistances(connection: ConnectionFrame) {
  connection.distance = metres(
    Math.hypot(
      connection.anchor.x - connection.harness.x,
      connection.anchor.y - connection.harness.y,
      connection.anchor.z - connection.harness.z,
    ),
  );
  connection.ropeDistance = metres(
    Math.hypot(
      connection.ropeAnchor.x - connection.harness.x,
      connection.ropeAnchor.y - connection.harness.y,
      connection.ropeAnchor.z - connection.harness.z,
    ),
  );
  connection.totalDistance = metres(connection.connectorReach + connection.ropeDistance);
  connection.slack = metres(Math.max(0, connection.maxLength - connection.totalDistance));
}

function updateConnectionAnchor(connection: ConnectionFrame, eye: TrolleyFrame["eye"]) {
  Object.assign(connection.anchor, eye);
  connection.ropeAnchor.x = connection.anchor.x;
  connection.ropeAnchor.y = metres(connection.anchor.y - connection.connectorReach);
  connection.ropeAnchor.z = connection.anchor.z;
}

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
      ropeAnchor: position(SILO.anchor[0], SILO.anchor[1] - CONNECTOR_REACH, SILO.anchor[2]),
      connectorReach: CONNECTOR_REACH,
      harness: A.harness,
      connected: true,
      maxLength: CONNECTION_LENGTH,
      distance: metres(0),
      ropeDistance: metres(0),
      totalDistance: CONNECTOR_REACH,
      slack: CONNECTION_LENGTH,
      tension: ratio(0),
      limited: false,
    },
    trolley: createTrolleyFrame(),
    supportAvailable: true,
    entryBlocked: false,
    seed: SILO.seed,
  };
}

/** Root-local dorsal/eye reference, rotated with the same yaw and spine lean as rig.
 * Rig reconciliation additionally measures the actual skeleton point each update. */
function bodyPoint(person: WorkerFrame, height: number, back: number, out: Position) {
  const spinePivot = 1.2;
  const y =
    spinePivot + (height - spinePivot) * Math.cos(person.lean) - back * Math.sin(person.lean);
  const z = (height - spinePivot) * Math.sin(person.lean) + back * Math.cos(person.lean);
  out.x = metres(person.position.x + z * Math.sin(person.yaw));
  out.y = metres(person.position.y + y);
  out.z = metres(person.position.z + z * Math.cos(person.yaw));
}

/** Pure direct evaluation: identical replay forward or backwards, at every FPS.
 * One local crust collapse per technician, with equivalent exposure and seed.
 * The surface redistributes volume locally; there is no hidden hopper or outlet.
 * Support-depth timing is cinematic, not calibrated material/rescue physics. */
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
  out.volume = INITIAL_GRAIN_VOLUME;
  out.surfaceHeight = SILO.initialSurface;
  // Every local depression has its own integrated annular redistribution ridge.
  out.depression = metres(
    SILO.maximumDepression * smooth(incident / 4) * (1 - 0.4 * smooth((t - 22) / 6)),
  );
  out.entryBlocked = prevention;
  out.supportAvailable = true;
  const unconstrainedDepth = prevention
    ? 0
    : SILO_CONFIG.entrapmentDepth.value *
      smooth((discharge.mobilised / SILO.nominalRedistribution - 0.75) / 12.2);
  const connection = out.connection;
  evaluateTrolley(walkingAngle(t, "A") * SILO.ringRadius, out.trolley);
  out.trolley.travelledDistance = Math.abs(
    (walkingAngle(t, "A") - walkingAngle(0, "A")) * SILO.ringRadius,
  );
  out.trolley.wheelRotation =
    ((walkingAngle(t, "A") - walkingAngle(0, "A")) * SILO.ringRadius) /
    (SILO_CONFIG.wheelDiameter.value / 2);
  updateConnectionAnchor(connection, out.trolley.eye);
  connection.connected = scenario === "comparison";
  connection.limited = false;
  connection.tension = ratio(0);
  connection.slack = CONNECTION_LENGTH;
  for (const id of ["A", "B"] as const) {
    const person = out.workers[id];
    const angle = walkingAngle(t, id);
    person.position.x = metres(
      prevention ? (id === "A" ? -12.5 : 12.5) : Math.sin(angle) * SILO.workerRadius,
    );
    person.position.z = metres(prevention ? 1.5 : Math.cos(angle) * SILO.workerRadius);
    person.yaw = person.heading = angle + (id === "A" ? -Math.PI / 2 : Math.PI / 2);
    const surface = surfaceAt(person.position.x, person.position.z, out);
    const naturalY = surface - unconstrainedDepth;
    person.position.y = metres(prevention ? SILO_CONFIG.groundY.value : naturalY);
    person.connected = id === "A" && connection.connected;
    // Evaluate the endpoint and inextensible constraint before representation.
    // Iteration couples modest spine lean to actual final support depth.
    for (let iteration = 0; iteration < 5; iteration++) {
      person.depth = metres(prevention ? 0 : Math.max(0, surface - person.position.y));
      person.mobility = ratio(1 - smooth((person.depth - 0.1) / 0.65));
      person.lean = prevention ? 0 : 0.13 * smooth(incident / 4) + 0.19 * (1 - person.mobility);
      bodyPoint(person, id === "A" ? 1.42 : 1.35, id === "A" ? -0.14 : -0.1, person.harness);
      if (person.connected) {
        const hx = person.harness.x - connection.ropeAnchor.x;
        const hz = person.harness.z - connection.ropeAnchor.z;
        const ropeLength = connection.maxLength - connection.connectorReach;
        const verticalLimit = Math.sqrt(Math.max(0, ropeLength ** 2 - hx * hx - hz * hz));
        const dorsalY = person.harness.y - person.position.y;
        const lowestFoot = connection.ropeAnchor.y - verticalLimit - dorsalY;
        person.position.y = metres(Math.max(naturalY, lowestFoot));
        connection.limited = naturalY < lowestFoot;
      }
    }
    // Walking stops at loss of support. Frozen feet remain caught, rather than
    // continuing a walking cycle beneath the grain surface.
    const walkTime = clamp(t - 3, 0, 3);
    person.walkPhase = walkTime * 4.3;
    connection.tension = ratio(connection.limited ? 1 : 0);
    person.tension = person.connected ? connection.tension : ratio(0);
    bodyPoint(person, id === "A" ? 1.66 : 1.61, 0.1, person.eye);
    bodyPoint(person, id === "A" ? 1.42 : 1.35, id === "A" ? -0.14 : -0.1, person.harness);
    person.occluded = !prevention && person.eye.y <= surfaceAt(person.eye.x, person.eye.z, out);
    evaluateFeet(t, id, person, out);
  }
  updateConnectionDistances(connection);
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

/** Explicit illustrative perimeter circulation; closed circuit is 80 seconds. */
export function evaluateDemonstrationFrame(time: number, out = createFrame()): SiloFrame {
  const t = clamp(Number.isFinite(time) ? time : 0, 0, SILO_CONFIG.demonstrationDuration.value);
  evaluateFrame(0, "comparison", out);
  out.time = seconds(t);
  out.stage = "walking";
  const baseAngle = Math.PI + 0.2;
  const angleAt = (at: number, id: "A" | "B") => {
    const duration = SILO_CONFIG.demonstrationDuration.value;
    const elapsed = clamp(at, 0, duration);
    const rampIntegral = (p: number) => p ** 3 - p ** 4 / 2;
    const travelled =
      elapsed < 1
        ? rampIntegral(elapsed)
        : elapsed > duration - 1
          ? duration - 1 - rampIntegral(duration - elapsed)
          : elapsed - 0.5;
    return baseAngle + (TAU * travelled) / (duration - 1) + (id === "A" ? 0 : -0.23);
  };
  evaluateTrolley(angleAt(t, "A") * SILO.ringRadius, out.trolley);
  out.trolley.travelledDistance = (angleAt(t, "A") - angleAt(0, "A")) * SILO.ringRadius;
  out.trolley.wheelRotation = out.trolley.travelledDistance / (SILO_CONFIG.wheelDiameter.value / 2);
  updateConnectionAnchor(out.connection, out.trolley.eye);
  for (const id of ["A", "B"] as const) {
    const person = out.workers[id];
    const angle = angleAt(t, id);
    person.position.x = metres(Math.sin(angle) * SILO.workerRadius);
    person.position.z = metres(Math.cos(angle) * SILO.workerRadius);
    // A small knee flex keeps both real rigs inside their measured leg reach;
    // the explicit sole goals remain on the grain surface, without skating.
    person.position.y = metres(SILO.initialSurface - 0.025);
    person.yaw = person.heading = angle + Math.PI / 2;
    person.walkPhase = (t * TAU) / 0.9;
    person.lean = 0;
    bodyPoint(person, id === "A" ? 1.42 : 1.35, id === "A" ? -0.14 : -0.1, person.harness);
    bodyPoint(person, id === "A" ? 1.66 : 1.61, 0.1, person.eye);
    for (const side of ["left", "right"] as const) {
      const foot = person.feet[side];
      const offset = side === "left" ? 0 : 0.45;
      const start = Math.floor((t + offset) / 0.9) * 0.9 - offset;
      const elapsed = t - start;
      const anchor = Math.max(0, start <= 0 ? 0 : start + 0.27);
      let supportAngle = angleAt(anchor, id);
      let lift = 0;
      foot.locked = elapsed <= 0.54;
      if (!foot.locked) {
        const p = (elapsed - 0.54) / 0.36;
        supportAngle += (angleAt(start + 1.17, id) - supportAngle) * smooth(p);
        lift = Math.sin(Math.PI * p) * 0.065;
      }
      const lateral = side === "left" ? 0.12 : -0.12;
      const heading = supportAngle + Math.PI / 2;
      foot.position.x = metres(
        Math.sin(supportAngle) * SILO.workerRadius + lateral * Math.cos(heading),
      );
      foot.position.z = metres(
        Math.cos(supportAngle) * SILO.workerRadius - lateral * Math.sin(heading),
      );
      foot.position.y = metres(SILO.initialSurface + lift);
      foot.yaw = heading;
    }
  }
  updateConnectionDistances(out.connection);
  return out;
}

/** Levels are exploration-only. Unsupported geometry takes workers out of mass. */
export function evaluateExplorationFrame(level: number, out = createFrame()): SiloFrame {
  evaluateFrame(0, "comparison", out);
  out.surfaceHeight = metres(
    clamp(Number.isFinite(level) ? level : SILO.initialSurface, SILO.floorY, SILO.bodyTop - 0.25),
  );
  out.volume = grainVolume(out.surfaceHeight);
  out.supportAvailable = Math.abs(out.surfaceHeight - SILO.initialSurface) <= 0.08;
  if (!out.supportAvailable) {
    out.connection.connected = false;
    for (const [index, person] of Object.values(out.workers).entries()) {
      person.position.x = metres(index === 0 ? -12.5 : 12.5);
      person.position.y = metres(SILO_CONFIG.groundY.value);
      person.position.z = metres(1.5);
      person.connected = false;
      person.eye.x = person.position.x;
      person.eye.y = metres(SILO_CONFIG.groundY.value + 1.66);
      person.eye.z = person.position.z;
      person.harness.x = person.position.x;
      person.harness.y = metres(SILO_CONFIG.groundY.value + 1.42);
      person.harness.z = person.position.z;
      for (const foot of Object.values(person.feet)) {
        Object.assign(foot.position, person.position);
        foot.locked = true;
      }
    }
  } else {
    const delta = out.surfaceHeight - SILO.initialSurface;
    for (const person of Object.values(out.workers)) {
      person.position.y = metres(person.position.y + delta);
      person.harness.y = metres(person.harness.y + delta);
      person.eye.y = metres(person.eye.y + delta);
      for (const foot of Object.values(person.feet))
        foot.position.y = metres(foot.position.y + delta);
    }
  }
  updateConnectionDistances(out.connection);
  return out;
}

const INCIDENT_EVENTS: readonly IncidentEvent[] = Object.freeze([
  Object.freeze({ at: seconds(0), label: "Dois técnicos na mesma condição local de exposição" }),
  Object.freeze({
    at: seconds(3),
    label: "Caminhada curta sobre superfície aparentemente estável",
  }),
  Object.freeze({
    at: seconds(6),
    label: "Colapso localizado de crosta: roteiro ilustrativo, sem descarga externa",
  }),
  Object.freeze({ at: seconds(9), label: "Perda progressiva de apoio e mobilidade" }),
  Object.freeze({ at: seconds(12), label: "Retenção precoce ilustrativa; emergência permanece" }),
  Object.freeze({
    at: seconds(18),
    label: "Vítima encoberta; nenhuma estimativa de sobrevivência",
  }),
  Object.freeze({
    at: seconds(22),
    label: "Movimentação cessa; retirada depende de resgate planejado",
  }),
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
const LVHF_EVENTS: readonly IncidentEvent[] = Object.freeze([
  Object.freeze({
    at: seconds(0),
    label: "Demonstração cinemática: percurso contínuo, sem validar procedimento de entrada",
  }),
  Object.freeze({ at: seconds(20), label: "Trole e conexão acompanham o técnico pelo anel" }),
  Object.freeze({
    at: seconds(80),
    label: "Volta completa; compatibilidade mecânica depende dos desenhos e do fabricante",
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
      ropeAnchor: copyPosition(frame.connection.ropeAnchor),
      harness: copyPosition(frame.connection.harness),
    }),
    trolley: Object.freeze({
      ...frame.trolley,
      position: copyPosition(frame.trolley.position as Position),
      eye: copyPosition(frame.trolley.eye as Position),
      tangent: Object.freeze({ ...frame.trolley.tangent }),
    }),
  });
}

/** One domain clock; bounded, fixed-step advancement, independent of React/DOM. */
export class SiloSimulation {
  readonly frame = createFrame();
  private experience: ExperienceMode = "incident";
  private incidentScenario: Exclude<Scenario, "prevention"> = "comparison";
  private savedIncidentTime = 0;
  private savedDemonstrationTime = 0;
  private explorationLevel: number = SILO.initialSurface;
  private ticks = 0;
  private origin = 0;
  private accumulator = 0;
  private publicationElapsed = 0;
  private listeners = new Set<() => void>();
  private snapshot: SimulationSnapshot;

  constructor() {
    evaluateFrame(0, "comparison", this.frame);
    this.snapshot = Object.freeze({
      experience: "incident",
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
  getDuration = () =>
    this.experience === "lvhf" ? SILO_CONFIG.demonstrationDuration.value : SILO.duration;
  subscribe = (listener: () => void) => {
    this.listeners.add(listener);
    return () => {
      this.listeners.delete(listener);
    };
  };

  private publish(change: Partial<SimulationSnapshot> = {}) {
    const scenario: Scenario =
      this.experience === "prevention" ? "prevention" : this.incidentScenario;
    const events =
      this.experience === "lvhf"
        ? LVHF_EVENTS
        : scenario === "prevention"
          ? PREVENTION_EVENTS
          : scenario === "no-connection"
            ? NO_CONNECTION_EVENTS
            : INCIDENT_EVENTS;
    this.snapshot = Object.freeze({
      ...this.snapshot,
      ...change,
      scenario,
      experience: this.experience,
      frame: immutableFrame(this.frame),
      elapsed: this.frame.time,
      stage: this.frame.stage,
      vitals: educationalVitals(
        this.experience === "incident" || this.experience === "prevention" ? this.frame.time : 0,
        this.frame.workers.B.depth,
        scenario === "prevention",
      ),
      events: Object.freeze(events.filter((event) => event.at <= this.frame.time)),
    });
    this.listeners.forEach((listener) => listener());
  }

  private evaluateAt(time: number) {
    if (this.experience === "explore")
      return evaluateExplorationFrame(this.explorationLevel, this.frame);
    if (this.experience === "lvhf") return evaluateDemonstrationFrame(time, this.frame);
    return evaluateFrame(
      time,
      this.experience === "prevention" ? "prevention" : this.incidentScenario,
      this.frame,
    );
  }
  setExperience(experience: ExperienceMode) {
    if (
      !["explore", "lvhf", "incident", "prevention"].includes(experience) ||
      experience === this.experience
    )
      return;
    this.pause("Mudança de modo: reprodução pausada");
    if (this.experience === "incident") this.savedIncidentTime = this.frame.time;
    if (this.experience === "lvhf") this.savedDemonstrationTime = this.frame.time;
    this.experience = experience;
    this.origin =
      experience === "incident"
        ? this.savedIncidentTime
        : experience === "lvhf"
          ? this.savedDemonstrationTime
          : 0;
    this.ticks = this.accumulator = this.publicationElapsed = 0;
    this.evaluateAt(this.origin);
    this.publish({
      status: this.origin > 0 ? "paused" : "idle",
      reason: "Reprodução somente por comando",
      revision: this.snapshot.revision + 1,
    });
  }
  setExplorationLevel(level: number) {
    if (this.experience !== "explore" || !Number.isFinite(level)) return false;
    this.explorationLevel = clamp(level, SILO.floorY, SILO.bodyTop - 0.25);
    this.evaluateAt(0);
    this.publish({
      reason: this.frame.supportAvailable
        ? "Nível de exploração"
        : "Técnicos fora da massa: configuração de conexão incompatível",
      revision: this.snapshot.revision + 1,
    });
    return true;
  }

  setReady(state: boolean | LoadingState, reason = "") {
    const loading = typeof state === "boolean" ? (state ? "ready" : "loading") : state;
    if (loading !== "ready" && this.snapshot.status === "running")
      this.pause(reason || "Recursos indisponíveis");
    this.publish({ loading, reason });
  }
  start() {
    if (this.snapshot.loading !== "ready" || this.experience === "explore") return false;
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
    if (
      this.snapshot.status !== "paused" ||
      this.snapshot.loading !== "ready" ||
      this.experience === "explore"
    )
      return false;
    this.publish({ status: "running", reason: "" });
    return true;
  }
  reset() {
    this.ticks = this.origin = this.accumulator = this.publicationElapsed = 0;
    this.evaluateAt(0);
    this.publish({ status: "idle", reason: "", revision: this.snapshot.revision + 1 });
  }
  seek(time: number) {
    this.origin = clamp(Number.isFinite(time) ? time : 0, 0, this.getDuration());
    this.ticks = this.accumulator = 0;
    this.publicationElapsed = 0;
    this.evaluateAt(this.origin);
    this.publish({
      status: this.origin >= this.getDuration() ? "completed" : "paused",
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
    this.pause("Cenário alterado: reprodução pausada no mesmo instante");
    if (scenario === "prevention") {
      this.setExperience("prevention");
      return;
    }
    this.incidentScenario = scenario;
    if (this.experience === "prevention") this.setExperience("incident");
    // Same seed, elapsed time and trajectories; only the connection/entry condition
    // changes. This is an explicit controlled comparison, not a quality side effect.
    if (this.experience === "incident")
      evaluateFrame(this.frame.time, this.incidentScenario, this.frame);
    else this.evaluateAt(this.frame.time);
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
    const presentedTime = Math.min(this.getDuration(), simulationTime + this.accumulator);
    this.evaluateAt(presentedTime);
    if (presentedTime >= this.getDuration()) {
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
