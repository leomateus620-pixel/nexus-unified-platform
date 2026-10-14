import assert from "node:assert/strict";
import { test } from "node:test";
import {
  calculateHypotheticalPrevention,
  INCIDENT_STATISTICS,
  INCIDENT_TOTALS,
  parseHypotheticalPercent,
} from "../src/silo-engolfamento/incidentStatistics";
import { SILO_SOURCES, SOURCE_REVIEW_DATE } from "../src/silo-engolfamento/sources";

test("grain-case totals reconcile and every annual row retains primary provenance", () => {
  assert.deepEqual(INCIDENT_TOTALS, { total: 124, fatal: 51, nonFatal: 73 });
  assert.deepEqual(
    INCIDENT_STATISTICS.map((row) => row.year),
    [2022, 2023, 2024, 2025],
  );
  for (const row of INCIDENT_STATISTICS) {
    assert.equal(row.fatal + row.nonFatal, row.total);
    const source = SILO_SOURCES.find((entry) => entry.id === row.sourceId);
    assert.ok(source);
    assert.equal(new URL(source.url).hostname, "www.purdue.edu");
    assert.equal(source.accessedOn, SOURCE_REVIEW_DATE);
    assert.ok(source.locator.includes("figura"));
    assert.ok(row.evidence.length > 0);
    assert.ok(Object.isFrozen(row));
  }
  assert.ok(Object.isFrozen(INCIDENT_TOTALS));
});

test("the documented annual percentages resolve to the reported integer fatal cases", () => {
  const percentages = [35.7, 59.3, 41.2, 28.6];
  INCIDENT_STATISTICS.forEach((row, index) => {
    assert.equal(Math.round((row.total * percentages[index]!) / 100), row.fatal);
  });
});

test("a prevention hypothesis is absent until explicitly entered, including valid zero", () => {
  assert.equal(parseHypotheticalPercent(""), null);
  assert.equal(parseHypotheticalPercent("  "), null);
  assert.equal(parseHypotheticalPercent("25,5"), 25.5);
  assert.equal(parseHypotheticalPercent("0"), 0);
  assert.equal(parseHypotheticalPercent("100"), 100);
  for (const input of ["-1", "101", "25%", "1e2", "NaN", "4,5,6"]) {
    assert.equal(parseHypotheticalPercent(input), null);
  }
});

test("hypothetical arithmetic rejects out-of-range inputs and rounds transparently", () => {
  assert.equal(calculateHypotheticalPrevention(Number.NaN), null);
  assert.equal(calculateHypotheticalPrevention(Number.POSITIVE_INFINITY), null);
  assert.equal(calculateHypotheticalPrevention(-1), null);
  assert.equal(calculateHypotheticalPrevention(101), null);
  assert.deepEqual(calculateHypotheticalPrevention(50), {
    percent: 50,
    proportion: 0.5,
    documentedFatalCases: 51,
    exactCases: 25.5,
    roundedCases: 26,
  });
  assert.equal(calculateHypotheticalPrevention(0)?.roundedCases, 0);
  assert.equal(calculateHypotheticalPrevention(100)?.roundedCases, 51);
});
