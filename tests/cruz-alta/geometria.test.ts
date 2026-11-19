import assert from "node:assert/strict";
import test from "node:test";
import { context, geometry, objects, lifelines } from "../../src/features/cruz-alta/manifest";
import { profile, shell } from "../../src/features/cruz-alta/geometry";
import { roofFrames } from "../../src/features/cruz-alta/roof-supports";
import { center, extent, inside, spatialIndex } from "../../src/features/cruz-alta/spatial";
import { forestCanopies } from "../../src/features/cruz-alta/vegetation";
import { groundPatches, yardPatches } from "../../src/features/cruz-alta/terrain-surfaces";
import type { SceneLayers } from "../../src/features/cruz-alta/scene-types";
const find = (id: string) => geometry.find((p) => p.id === id)!;

test("O arco simplificado e o detalhado coincidem no apoio, cumeeira e contorno de seleção", () => {
  const part = find("cobertura-11"),
    surface = profile(part);
  for (const steps of [18, 72]) {
    const rendered = shell(part, steps),
      position = rendered.roof.getAttribute("position"),
      normal = rendered.roof.getAttribute("normal");
    let low = Infinity,
      high = -Infinity;
    for (let i = 0; i < position.count; i++) {
      const x = position.getX(i),
        z = position.getZ(i),
        y = position.getY(i);
      assert.ok(Math.abs(y - surface.h([x, z])) < 0.0001);
      assert.ok(normal.getY(i) > 0);
      low = Math.min(low, y);
      high = Math.max(high, y);
    }
    assert.ok(Math.abs(low - part.eave) < 0.0001);
    assert.ok(Math.abs(high - part.eave - part.rise) < 0.0001);
    assert.ok(rendered.gable);
    for (const g of Object.values(rendered)) g?.dispose();
  }
});

test("O passeio atravessa os vãos do 62, respeita os pilares e permanece no domínio da fábrica", () => {
  const index = spatialIndex(objects, geometry, lifelines),
    part = find("cobertura-62");
  const frames = roofFrames(part);
  assert.equal(frames.length, 4);
  for (const [a, b] of frames) {
    assert(index.occupied(...a));
    assert(index.occupied(...b));
  }
  const [x, z] = center(extent(part.footprint));
  assert.equal(index.occupied(x, z), false);
  const limit = index.restrict(32000, -20000);
  assert.ok(Math.hypot(...limit) < 700);
  assert(index.occupied(32000, -20000));
});

test("O costado oculta os nomes de objetos atrás do silo quando a camada de equipamentos está visível", () => {
  const part = find("silo-sul-4"),
    e = extent(part.footprint),
    [x, z] = center(e);
  const index = spatialIndex(objects, geometry, lifelines);
  const layers: SceneLayers = {
    edificacoes: false,
    equipamentos: true,
    entorno: false,
    nomes: true,
    lvhf: false,
  };
  const eye = { x: e.west - 1, y: 2, z };
  assert(index.labelOccluded(eye, e.east + 1, 2, z, "externo", layers));
  assert.equal(index.labelOccluded(eye, x, 2, z, part.id, layers), false);
  assert.equal(
    index.labelOccluded(eye, e.east + 1, 2, z, "externo", { ...layers, equipamentos: false }),
    false,
  );
});

test("As copas de Cruz Alta respeitam os corredores e os limites construídos em planta", () => {
  const hardGround = [...groundPatches, ...yardPatches]
    .filter((patch) =>
      ["asfalto", "lastro", "concreto", "concretoDique", "agua"].includes(patch.surface),
    )
    .map((patch) => patch.footprint);
  const obstacles = [
    ...context.filter((area) => area.kind !== "vegetacao").map((area) => area.footprint),
    ...geometry.map((part) => part.footprint),
    ...hardGround,
  ].map((polygon) => ({ polygon, box: extent(polygon) }));
  const forest = forestCanopies(context, geometry, hardGround);
  assert(forest.some((tree) => tree.form === "tall"));
  assert(forest.some((tree) => tree.form === "mixed"));
  assert(forest.some((tree) => tree.form === "scrub"));
  for (const { x, z, diameter } of forest) {
    const radius = diameter * 0.65;
    for (const { polygon, box } of obstacles) {
      if (
        x + radius < box.west ||
        x - radius > box.east ||
        z + radius < box.north ||
        z - radius > box.south
      )
        continue;
      assert(!inside(x, z, polygon));
      for (let step = 0; step < 24; step++) {
        const angle = (Math.PI * step) / 12;
        assert(!inside(x + radius * Math.cos(angle), z + radius * Math.sin(angle), polygon));
      }
    }
  }
});

test("Os perfis das moegas mantêm as seis extremidades LVHF sobre as faixas e o beiral comum", () => {
  for (const [code, crest] of [
    ["67", 26],
    ["68", 21.03],
    ["69", 16.6],
  ] as const) {
    const part = find("cobertura-" + code);
    const surface = profile(part);
    const line = lifelines.find(({ id }) => id === "lvhf-" + code)!;
    for (const point of line.points) {
      assert(inside(...point, part.footprint));
      assert(Math.abs(surface.h(point) - crest) < 0.5);
    }
    const model = shell(part);
    model.roof.computeBoundingBox();
    assert.equal(model.roof.boundingBox!.min.y, 6);
    assert(Math.abs(model.roof.boundingBox!.max.y - crest) < 0.001);
    for (const geo of Object.values(model)) geo?.dispose();
  }
});
