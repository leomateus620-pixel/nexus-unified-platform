import { clamp, DOOR_CROSSED_S, DOOR_WAIT_S, routeAt, WALK_LENGTH } from "./lc02-walkway";

export type ScenarioCount = 1 | 5 | 10;
export type PeopleCamera = "wide" | "follow" | "manual";
export type Person = {
  id: number;
  s: number;
  state: "waiting" | "walking" | "entered";
  moving: number;
};
export type SimulationSnapshot = {
  count: ScenarioCount | 0;
  status: "idle" | "running" | "paused" | "completed";
  asset: "loading" | "ready" | "error";
  mode: PeopleCamera;
  selected: number;
  waiting: number;
  walking: number;
  entered: number;
  activeIds: number[];
  reason: string;
  elapsed: number;
  revision: number;
  retry: number;
};
export const PERSON_GAP = 0.9;
/** Kinematic circulation only. Speeds and spacing are presentation assumptions. */
export class LC02Simulation {
  people: Person[] = [];
  door = 0;
  drive = 0;
  private time = 0;
  private publishTime = 0;
  private listeners = new Set<() => void>();
  private snapshot: SimulationSnapshot = {
    count: 0,
    status: "idle",
    asset: "loading",
    mode: "wide",
    selected: 0,
    waiting: 0,
    walking: 0,
    entered: 0,
    activeIds: [],
    reason: "",
    elapsed: 0,
    revision: 0,
    retry: 0,
  };
  getSnapshot = () => this.snapshot;
  subscribe = (listener: () => void) => {
    this.listeners.add(listener);
    return () => {
      this.listeners.delete(listener);
    };
  };
  private publish(change: Partial<SimulationSnapshot> = {}) {
    this.snapshot = {
      ...this.snapshot,
      ...change,
      waiting: this.people.filter((p) => p.state === "waiting").length,
      walking: this.people.filter((p) => p.state === "walking").length,
      entered: this.people.filter((p) => p.state === "entered").length,
      activeIds: this.people.filter((p) => p.state === "walking").map((p) => p.id),
      elapsed: this.time,
    };
    this.listeners.forEach((listener) => listener());
  }
  setAsset(asset: SimulationSnapshot["asset"]) {
    this.publish({ asset });
  }
  retry() {
    this.publish({ asset: "loading", retry: this.snapshot.retry + 1 });
  }
  start(count: ScenarioCount) {
    this.people = Array.from({ length: count }, (_, id) => ({
      id,
      s: 0,
      state: "waiting",
      moving: 0,
    }));
    this.time = this.publishTime = this.door = this.drive = 0;
    this.publish({
      count,
      status: "running",
      mode: "wide",
      selected: 0,
      reason: "",
      revision: this.snapshot.revision + 1,
    });
  }
  stop() {
    this.people = [];
    this.time = this.door = this.drive = 0;
    this.publish({
      count: 0,
      status: "idle",
      mode: "wide",
      reason: "",
      revision: this.snapshot.revision + 1,
    });
  }
  pause(reason = "") {
    this.drive = 0;
    if (this.snapshot.status === "running") this.publish({ status: "paused", reason });
  }
  resume() {
    if (this.snapshot.status === "paused") this.publish({ status: "running", reason: "" });
  }
  select(id: number) {
    if (this.people[id]?.state === "walking") {
      this.drive = 0;
      this.publish({ selected: id });
    }
  }
  mode(mode: PeopleCamera) {
    if (mode !== "wide" && this.people[this.snapshot.selected]?.state !== "walking") return;
    this.drive = 0;
    this.publish({ mode });
  }
  tick(dt: number) {
    if (this.snapshot.status !== "running" || this.snapshot.asset !== "ready") return;
    // Cap suspended-frame debt; callers split live frames into <= 1/60 s steps.
    dt = clamp(dt, 0, 0.1);
    this.time += dt;
    let changed = false;
    const wantsDoor = this.people.some(
      (p) => p.state === "walking" && p.s > DOOR_WAIT_S - 0.65 && p.s < DOOR_CROSSED_S + 0.4,
    );
    this.door = clamp(this.door + (wantsDoor ? 1 : -1) * dt * 1.7, 0, 1);
    for (const p of this.people) {
      const ahead = this.people[p.id - 1];
      if (p.state === "waiting" && (!ahead || ahead.state === "entered" || ahead.s >= PERSON_GAP)) {
        p.state = "walking";
        changed = true;
      }
      if (p.state !== "walking") continue;
      const manual = this.snapshot.mode === "manual" && p.id === this.snapshot.selected;
      const direction = manual ? this.drive : 1;
      const speed = routeAt(p.s).stair ? 0.42 : 0.9;
      const behind = this.people[p.id + 1];
      const lower = behind?.state === "walking" ? behind.s + PERSON_GAP : 0;
      let upper = ahead?.state === "walking" ? ahead.s - PERSON_GAP : WALK_LENGTH;
      if (this.door < 0.98 && p.s <= DOOR_WAIT_S) upper = Math.min(upper, DOOR_WAIT_S);
      const next = clamp(p.s + direction * speed * dt, lower, Math.max(lower, upper));
      p.moving = dt > 0 ? (next - p.s) / dt : 0;
      p.s = next;
      if (p.s >= WALK_LENGTH - 1e-6) {
        p.state = "entered";
        p.moving = 0;
        changed = true;
        if (p.id === this.snapshot.selected)
          this.publish({ mode: "wide", revision: this.snapshot.revision + 1 });
      }
    }
    const completed =
      this.people.length > 0 && this.people.every((p) => p.state === "entered") && this.door === 0;
    if (changed || completed || this.time - this.publishTime >= 0.12) {
      this.publishTime = this.time;
      this.publish(completed ? { status: "completed", mode: "wide" } : {});
    }
  }
}
