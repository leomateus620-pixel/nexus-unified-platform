import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";
import { geometry, lifelines, objects } from "../../src/features/cruz-alta/manifest";
import {
  geoToGround,
  groundToGeo,
  groundToSheet,
  sheetToGround,
} from "../../src/features/cruz-alta/registro";
import type { GroundPoint } from "../../src/features/cruz-alta/scene-types";

const survey = JSON.parse(
  readFileSync(new URL("../../docs/cruz-alta/registro.json", import.meta.url), "utf8"),
) as {
  controls: { kind: string; sheet: GroundPoint; reference: GroundPoint }[];
  rmseIndependentM: number;
  maxIndependentM: number;
};
const distance = (a: GroundPoint, b: GroundPoint) => Math.hypot(a[0] - b[0], a[1] - b[1]);

test("folha, metros locais e WGS84 retornam ao controle com erro numérico inferior a 1 cm", () => {
  for (const control of survey.controls) {
    const model = sheetToGround(control.sheet);
    assert(distance(model, sheetToGround(groundToSheet(model))) < 0.01);
    const world = groundToGeo(control.reference);
    assert(distance(control.reference, geoToGround(world.latitude, world.longitude)) < 0.01);
  }
  const residuals = survey.controls
    .filter((c) => c.kind === "independente")
    .map((c) => distance(sheetToGround(c.sheet), c.reference));
  assert.equal(survey.controls.length - residuals.length, 4);
  assert(residuals.length >= 3);
  const rmse = Math.sqrt(residuals.reduce((sum, r) => sum + r * r, 0) / residuals.length);
  assert(Math.abs(rmse - survey.rmseIndependentM) < 0.001);
  assert(Math.abs(Math.max(...residuals) - survey.maxIndependentM) < 0.001);
});

test("revisão 56 conserva 74 registros, 73 chamadas e o histórico de 29.2", () => {
  const catalog = new Map(objects.map((o) => [o.id, o]));
  assert.equal(catalog.size, objects.length);
  assert.equal(objects.filter((o) => o.kind === "lvhf" && o.status !== "Retirada").length, 74);
  assert.equal(new Set(lifelines.map((line) => line.id)).size, 73);
  assert.equal(catalog.get("lvhf-20")?.status, "Fora do projeto");
  assert.equal(catalog.get("lvhf-29.2")?.status, "Retirada");
  assert(!lifelines.some((line) => ["lvhf-20", "lvhf-29.2"].includes(line.id)));
  assert.equal(lifelines.filter((line) => line.id === "lvhf-06").length, 4);
  for (const node of objects) if (node.parent) assert(catalog.has(node.parent), node.id);
  for (const mesh of geometry) assert(catalog.has(mesh.id), mesh.id);
  for (const line of lifelines) assert.equal(catalog.get(line.id)?.kind, "lvhf");
});

test("as coberturas mantêm a identidade durante a construção da hierarquia", () => {
  const find = (code: string) => geometry.find((part) => part.id === "cobertura-" + code)!;
  assert.equal(find("11").roof, "arc");
  assert.equal(find("56").roof, "gable");
  assert.equal(find("28.1").roof, "gable");
  assert.equal(find("28").roof, "mono");
  assert.equal(find("28.1").eave + find("28.1").rise, 12);
  assert.equal(geometry.filter((part) => part.id.startsWith("silo-sul-")).length, 4);
  const nine = find("09").axis!,
    sixtyTwo = find("62").axis!;
  assert(Math.abs(nine[0] * sixtyTwo[0] + nine[1] * sixtyTwo[1]) < 0.15);
});

import {
  elevationAt,
  sampleAxis,
  siteHeight,
  type Elevations,
  type GridBounds,
} from "../../src/features/cruz-alta/regional-grid";

test("fundo regional preserva norte/sul, altitude relativa e uma única borda do pátio", () => {
  const grid: Elevations = {
    meta: {
      bounds: [-1000, -1000, 1000, 1000],
      rows: 2,
      cols: 2,
      verticalScaleMeters: 0.5,
      altitudeOffsetMeters: 400,
      siteElevationMeters: 450,
      heights: "",
      albedo: "",
    },
    raw: Uint16Array.of(0, 100, 200, 300),
  };
  assert.equal(elevationAt(grid, -1000, -1000), -50);
  assert.equal(elevationAt(grid, 1000, 1000), 100);
  assert.equal(elevationAt(grid, 0, 0), 25);
  const pad: GridBounds = [-100, -100, 120, 130];
  for (const [x, z] of [
    [0, 0],
    [-100, 0],
    [120, 0],
    [5, 130],
  ] as GroundPoint[])
    assert.equal(siteHeight(x, z, grid, null, pad), -0.005);
  assert(Math.abs(siteHeight(-100.01, 0, grid, null, pad) + 0.005) < 1e-5);
  const detail = { ...grid, meta: { ...grid.meta, bounds: [-500, -500, 500, 500] as GridBounds } };
  assert.equal(siteHeight(-500, 0, grid, detail, pad), siteHeight(-500, 0, grid, null, pad));
  const axis = sampleAxis(-1000, 1000, 0, [-100, 120], 40);
  assert.deepEqual(
    axis,
    [...new Set(axis)].sort((a, b) => a - b),
  );
  for (const p of [-1000, -100, 0, 120, 1000]) assert(axis.includes(p));
});

import { opticalAlignment } from "../../src/features/cruz-alta/optical-alignment";

test("viés óptico do CBERS vem de quatro pontos de chão e reduz o resíduo nos seis independentes", () => {
  const registro = JSON.parse(
    readFileSync(new URL("../../docs/cruz-alta/registro-cbers.json", import.meta.url), "utf8"),
  ) as {
    points: { group: string; opticalShiftXZMetres: GroundPoint }[];
    sampleShiftXZMetres: GroundPoint;
    independentRMSEAfterMetres: number;
    independentMaximumAfterMetres: number;
  };
  const fit = registro.points.filter((p) => p.group === "ajuste"),
    held = registro.points.filter((p) => p.group === "independente");
  assert.equal(fit.length, 4);
  assert.equal(held.length, 6);
  const [dx, dz] = registro.sampleShiftXZMetres;
  assert.deepEqual([opticalAlignment.east, opticalAlignment.south], [dx, dz]);
  assert.equal(dx, fit.reduce((a, p) => a + p.opticalShiftXZMetres[0], 0) / fit.length);
  assert.equal(dz, fit.reduce((a, p) => a + p.opticalShiftXZMetres[1], 0) / fit.length);
  const residual = held.map((p) => distance(p.opticalShiftXZMetres, [dx, dz]));
  assert(
    Math.abs(
      Math.sqrt(residual.reduce((a, d) => a + d * d, 0) / held.length) -
        registro.independentRMSEAfterMetres,
    ) < 0.01,
  );
  assert(Math.abs(Math.max(...residual) - registro.independentMaximumAfterMetres) < 0.01);
  assert(opticalAlignment.fullRadius < opticalAlignment.outerRadius);
});
