import assert from "node:assert/strict";
import test from "node:test";
import { objects, geometry, lifelines } from "../../src/features/cruz-alta/manifest";
import { spatialIndex } from "../../src/features/cruz-alta/spatial";
import { cruzAlta, isCruzAlta } from "../../src/features/cruz-alta/context";
import {
  geoToGround,
  groundToGeo,
  sheetToGround,
  groundToSheet,
} from "../../src/features/cruz-alta/registro";
import registro from "../../docs/cruz-alta/registro.json";

test("Cada malha e cada segmento resolvem uma chave única na hierarquia", () => {
  const map = spatialIndex(objects, geometry, lifelines);
  assert.equal(map.byId.size, objects.length);
  for (const part of [...geometry, ...lifelines]) assert.ok(map.byId.has(part.id), part.id);
  assert.equal(map.byId.get("lvhf-28.1")?.parent, "cobertura-28.1");
  assert.equal(map.byId.get("cobertura-28.1")?.parent, "estrutura-preparacao");
  assert.equal(map.search("preparacao")[0]?.id, "setor-preparacao");
  assert.equal(map.search("Armazem 01")[0]?.id, "estrutura-armazem-01");
  assert.ok(map.search("28.1").some((x) => x.id === "cobertura-28.1"));
  assert.ok(map.byId.get("lvhf-29.2")?.status?.includes("Retirada"));
  assert.equal(new Set(lifelines.map((l) => l.id)).size, 73);
  assert.ok(!lifelines.some((l) => l.id === "lvhf-20" || l.id === "lvhf-29.2"));
});
test("Coordenadas de controle fazem ida e volta com erro numérico inferior a um centímetro", () => {
  for (const c of registro.controls) {
    const ground = sheetToGround([c.sheet[0]!, c.sheet[1]!]);
    const geo = groundToGeo(ground);
    const round = geoToGround(geo.latitude, geo.longitude);
    const pixel = groundToSheet(round);
    assert.ok(Math.hypot(round[0] - ground[0], round[1] - ground[1]) < 0.01);
    assert.ok(
      Math.hypot(pixel[0] - c.sheet[0]!, pixel[1] - c.sheet[1]!) * registro.scaleFit < 0.01,
    );
  }
});
test("Um cadastro de outra unidade nunca cai no mapa de Cruz Alta", () => {
  assert.equal(isCruzAlta(cruzAlta.org, cruzAlta.cliente, cruzAlta.unidade), true);
  assert.equal(
    isCruzAlta(cruzAlta.org, cruzAlta.cliente, "6a454dcc-82b2-4506-aca3-410a3cc820f2"),
    false,
  );
});
