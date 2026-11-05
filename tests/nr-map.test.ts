import { describe, it, expect } from "vitest";
import { SelectionGesture } from "../src/features/nr/mapa/gestures";
import { nrSearchSchema } from "../src/features/nr/route-state";
import { cotrirosa } from "../src/features/nr/mapa/cotrirosa.server";
describe("unit map interaction contract", () => {
  it("accepts one short tap and consumes it once", () => {
    const g = new SelectionGesture();
    g.down(1, 100, 100, 0);
    g.move(1, 104, 103);
    g.up(1, 100);
    expect(g.consume()).toBe(true);
    expect(g.consume()).toBe(false);
  });
  it("rejects dragging even when pointer returns to its starting point", () => {
    const g = new SelectionGesture();
    g.down(1, 0, 0, 0);
    g.move(1, 30, 0);
    g.move(1, 0, 0);
    g.up(1, 100);
    expect(g.consume()).toBe(false);
  });
  it("rejects pinch and its last finger, then accepts an independent tap", () => {
    const g = new SelectionGesture();
    g.down(1, 0, 0, 0);
    g.down(2, 50, 0, 10);
    g.up(1, 100);
    g.up(2, 110);
    expect(g.consume()).toBe(false);
    g.down(3, 0, 0, 200);
    g.up(3, 250);
    expect(g.consume()).toBe(true);
  });
  it("rejects cancelled and long gestures", () => {
    const g = new SelectionGesture();
    g.down(1, 0, 0, 0);
    g.cancel();
    g.up(1, 20);
    expect(g.consume()).toBe(false);
    g.down(2, 0, 0, 100);
    g.up(2, 900);
    expect(g.consume()).toBe(false);
  });
  it("does not use dimensions as external certified size or capacity", () => {
    expect(cotrirosa.units).toBe("m");
    expect(cotrirosa.silos).toHaveLength(5);
    const small = cotrirosa.silos[1]!,
      big = cotrirosa.silos[4]!;
    expect([small.diameter, small.straight, small.cone]).toEqual([6, 6.6, 3.6]);
    expect([big.diameter, big.straight, big.cone]).toEqual([9.6, 16.5, 4.11]);
    expect(big.straight).toBeGreaterThan(small.straight * 2);
    expect(big.note).toContain("pendente");
    expect(Object.keys(big)).not.toContain("capacity");
  });
  it("restores camera, panel and local without accepting arbitrary camera modes", () => {
    const s = nrSearchSchema.parse({
      camera: "superior",
      painel: "pet",
      local: "8b0ed1b7-53df-4743-8be1-6b34221e471e",
      retorno: "mapa-3d",
    });
    expect(s.camera).toBe("superior");
    expect(s.painel).toBe("pet");
    expect(nrSearchSchema.parse({ camera: "unrestricted" }).camera).toBe("normal");
  });
});
