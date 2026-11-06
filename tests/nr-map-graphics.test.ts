import { describe, it, expect } from "vitest";
import {
  Mesh,
  MeshBasicMaterial,
  Raycaster,
  Shape,
  ShapeGeometry,
  Vector2,
  Vector3,
  DoubleSide,
} from "three";
import {
  AutomaticQuality,
  graphicsLimits,
  initialAutomatic,
  validGraphicsChoice,
  LIGHT_STATES,
  type GraphicsCapability,
} from "../src/features/nr/mapa/graphics";
import { sa05Access, sa05Connections, SA05_REFERENCE } from "../src/features/nr/mapa/sa05-access";
import { cotrirosa } from "../src/features/nr/mapa/cotrirosa.server";
import { conformTerrain } from "../src/features/nr/mapa/terrain-mesh";
const cap: GraphicsCapability = {
  software: false,
  maxTextureSize: 16384,
  cores: 8,
  width: 1440,
  renderer: "Intel UHD",
};
describe("Cotrirosa device quality", () => {
  it("validates local preference and starts safely from capabilities, independently of width", () => {
    for (const value of [null, "ultra", {}, '"high"'])
      expect(validGraphicsChoice(value)).toBe("auto");
    expect(validGraphicsChoice("high")).toBe("high");
    expect(initialAutomatic({ ...cap, width: 390 })).toBe(initialAutomatic(cap));
    expect(initialAutomatic({ ...cap, software: true })).toBe("low");
    expect(initialAutomatic({ ...cap, maxTextureSize: 2048 })).toBe("low");
    expect(graphicsLimits("high", { ...cap, software: true }).message).toContain("software");
    expect(graphicsLimits("high", { ...cap, maxTextureSize: 1024 }).shadow).toBe(1024);
  });
  it("stages a slow interaction downgrade, commits at the end, and enforces cooldown", () => {
    const q = new AutomaticQuality("high");
    for (let t = 40; t < 1800; t += 40) q.sample(40, t, cap);
    expect(q.active).toBe("high");
    expect(q.pending).toBe("balanced");
    expect(q.finish(1800)).toBe("balanced");
    for (let t = 1840; t < 9000; t += 40) q.sample(40, t, cap);
    expect(q.finish(9000)).toBeNull();
    for (let t = 18000; t < 21000; t += 40) q.sample(40, t, cap);
    expect(q.finish(21000)).toBe("low");
  });
  it("ignores idle gaps and requires three stable fast windows to promote", () => {
    const q = new AutomaticQuality("low");
    for (let t = 1000; t < 9000; t += 1000) q.sample(1000, t, cap, false);
    expect(q.finish(9000)).toBeNull();
    for (let t = 9016; t < 12300; t += 16) q.sample(16, t, cap);
    expect(q.pending).toBeNull();
    for (let t = 12300; t < 14000; t += 16) q.sample(16, t, cap);
    expect(q.active).toBe("low");
    expect(q.finish(14000)).toBe("balanced");
  });
  it("recognizes very slow rendered interaction without confusing it with idle demand", () => {
    const q = new AutomaticQuality("balanced");
    for (let t = 500; t <= 13000; t += 500) q.sample(500, t, cap);
    expect(q.pending).toBe("low");
    expect(q.active).toBe("balanced");
  });
});
describe("SA05 physical reference", () => {
  const s = cotrirosa.silos.find((s) => s.key === "sa05")!,
    a = sa05Access(s),
    c = sa05Connections(s);
  it("crosses the front from left to right in the reference and keeps immutable hatch/identity", () => {
    const view = new Vector3(...SA05_REFERENCE.position).sub(new Vector3(...SA05_REFERENCE.target));
    view.y = 0;
    view.normalize();
    const right = new Vector3(view.z, 0, -view.x);
    expect(new Vector3(...a.lower).dot(right)).toBeLessThan(0);
    expect(new Vector3(...a.upper).dot(right)).toBeGreaterThan(0);
    expect(a.front[2]).toBeGreaterThan(s.diameter / 2);
    expect(a.hatch).toEqual([-4.859999999999999, 8.260000000000002, 0.9]);
    expect(s.aliases).toEqual(["SA 05", "AS 05"]);
  });
  it("keeps adjoining flights/platforms level and continuous through the exact roof height", () => {
    expect(a.segments.filter((s) => s.kind === "landing")).toHaveLength(3);
    for (let i = 1; i < a.segments.length; i++) {
      const p = a.segments[i - 1]!,
        next = a.segments[i]!;
      expect(next.from).toBeCloseTo(p.to, 10);
      expect(next.low).toBeCloseTo(p.high, 10);
      if (next.kind === "landing") expect(next.low).toBe(next.high);
    }
    a.point(a.segments.at(-1)!.to, a.segments.at(-1)!.high).forEach((v, i) =>
      expect(v).toBeCloseTo(a.upper[i]!, 10),
    );
    expect(a.upper[1]).toBeCloseTo(s.clearance + s.cone + s.straight + 0.08);
    expect(c.siloSocket[1]).toBeGreaterThan(a.roofLanding[1]);
    expect(c.towerSocket[1]).toBeGreaterThan(c.siloSocket[1]);
    const medium = cotrirosa.buildings.find((b) => b.key === "union-medio")!;
    expect(c.origin[2] - 0.7).toBeGreaterThan(medium.position[2] + medium.size[2] / 2);
    expect(c.origin[2] + 1.5).toBeLessThan(a.upper[2]);
  });
  it("changes the world sun direction, color and environment together, without exposure compensation", () => {
    expect(LIGHT_STATES.day.sun).not.toEqual(LIGHT_STATES.late.sun);
    expect(LIGHT_STATES.day.color).not.toEqual(LIGHT_STATES.late.color);
    expect(LIGHT_STATES.day.environment).not.toEqual(LIGHT_STATES.late.environment);
  });
});
describe("graded terrain layer regression", () => {
  it("retains four centimetres between unrelated triangulations over the curved terrace", () => {
    const mesh = (points: number[][], offset: number) => {
      const shape = new Shape(points.map(([x, z]) => new Vector2(x!, -z!)));
      const g = new ShapeGeometry(shape);
      g.rotateX(-Math.PI / 2);
      const m = new Mesh(conformTerrain(g, offset), new MeshBasicMaterial({ side: DoubleSide }));
      m.updateMatrixWorld();
      return m;
    };
    const lower = mesh(
      [
        [-80, 30],
        [80, 30],
        [80, 135],
        [-80, 135],
      ],
      0,
    );
    const upper = mesh(
      [
        [-20, 65],
        [40, 68],
        [48, 110],
        [-18, 120],
      ],
      0.04,
    );
    const ray = new Raycaster();
    let samples = 0;
    for (let z = 70.3; z < 108; z += 1.7)
      for (let x = -10; x < 35; x += 3) {
        ray.set(new Vector3(x, 50, z), new Vector3(0, -1, 0));
        const lo = ray.intersectObject(lower)[0],
          hi = ray.intersectObject(upper)[0];
        if (lo && hi) {
          expect(hi.point.y - lo.point.y).toBeCloseTo(0.04, 5);
          samples++;
        }
      }
    expect(samples).toBeGreaterThan(250);
    lower.geometry.dispose();
    upper.geometry.dispose();
  });
});
