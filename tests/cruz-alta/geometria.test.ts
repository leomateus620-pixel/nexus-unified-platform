import assert from "node:assert/strict";
import test from "node:test";
import { geometry, objects, lifelines } from "../../src/features/cruz-alta/manifest";
import { profile, shell } from "../../src/features/cruz-alta/geometry";
import { roofFrames } from "../../src/features/cruz-alta/roof-supports";
import { center, extent, spatialIndex } from "../../src/features/cruz-alta/spatial";
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
