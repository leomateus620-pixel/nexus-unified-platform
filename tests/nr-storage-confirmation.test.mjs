import assert from "node:assert/strict";
import { spawnSync } from "node:child_process";
import { createHash } from "node:crypto";
import { mkdtemp, readFile, rm, writeFile } from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import test from "node:test";
import { fileURLToPath } from "node:url";

const script = fileURLToPath(
  new URL("../scripts/nr/prepare-storage-confirmation.mjs", import.meta.url),
);
const org = "00000000-0000-4000-8000-000000000001";
const targets = [2, 3].map((n) => ({
  id: `00000000-0000-4000-8000-${String(n).padStart(12, "0")}`,
  caminho: `${org}/acervo/00000000-0000-4000-8000-${String(n).padStart(12, "0")}.pdf`,
  mime: "application/pdf",
  tamanho: n * 10,
  sha256: String(n).repeat(64),
}));
function receipt(rows) {
  const canonical = rows
    .map((row) => ({
      arquivo_id: row.id,
      caminho: row.caminho,
      mime: row.mime,
      tamanho: Number(row.tamanho),
      sha256: row.sha256,
    }))
    .sort((a, b) => a.arquivo_id.localeCompare(b.arquivo_id));
  return {
    format: "nexus-storage-readback-receipt-v1",
    project_ref: "yhtgijtllvgzoqtfcgal",
    bucket: "nexus-nr-acervo",
    canonical_sha256: createHash("sha256").update(JSON.stringify(canonical)).digest("hex"),
    verified: rows.length,
    bytes: rows.reduce((sum, row) => sum + Number(row.tamanho), 0),
    errors: 0,
    manifest_mismatches: 0,
    unfinished: 0,
    source_message_id: "synthetic-readback-receipt",
  };
}
async function scenario({ rows = targets, proof = receipt(rows) } = {}) {
  const directory = await mkdtemp(path.join(os.tmpdir(), "nexus-storage-confirm-test-"));
  try {
    await writeFile(path.join(directory, "storage-prepared.json"), JSON.stringify(rows));
    await writeFile(path.join(directory, "storage-proof.json"), JSON.stringify(proof));
    const process = spawnSync(globalThis.process.execPath, [script, directory, org], {
      encoding: "utf8",
      env: {},
      timeout: 10000,
    });
    if (process.error) throw process.error;
    const plan = JSON.parse(
      await readFile(path.join(directory, "plans/storage-confirmar.json"), "utf8").catch(
        () => "null",
      ),
    );
    return { status: process.status, stderr: process.stderr, plan };
  } finally {
    await rm(directory, { recursive: true, force: true });
  }
}

test("an exact readback receipt produces only a private confirmation plan", async () => {
  const result = await scenario();
  assert.equal(result.status, 0, result.stderr);
  assert.equal(result.plan.count, 2);
  assert.equal(result.plan.bytes, 50);
  assert.equal(result.plan.batches.length, 1);
  assert.match(result.plan.preflight, /storage\.objects/);
  assert.match(result.plan.batches[0], /nr_arquivo_importar_confirmar/);
  assert.match(result.plan.readback, /group by a\.estado/);
});

test("mismatched hashes, counts, bytes and incomplete/error receipts produce no plan", async () => {
  for (const patch of [
    { canonical_sha256: "f".repeat(64) },
    { verified: 1 },
    { bytes: 49 },
    { errors: 1 },
    { manifest_mismatches: 1 },
    { unfinished: 1 },
    { format: "upload-url-is-not-readback" },
  ]) {
    const result = await scenario({ proof: { ...receipt(targets), ...patch } });
    assert.notEqual(result.status, 0);
    assert.equal(result.plan, null);
  }
});

test("duplicate targets and foreign-context paths reject even with matching receipt aggregates", async () => {
  for (const rows of [
    [targets[0], targets[0]],
    [targets[0], { ...targets[1], caminho: targets[0].caminho }],
    [
      {
        ...targets[0],
        caminho: `00000000-0000-4000-8000-000000000099/acervo/${targets[0].id}.pdf`,
      },
    ],
  ]) {
    const result = await scenario({ rows });
    assert.notEqual(result.status, 0);
    assert.equal(result.plan, null);
  }
});

test("invalid integrity metadata cannot become a confirmation command", async () => {
  for (const patch of [
    { sha256: "invalid" },
    { tamanho: 0 },
    { tamanho: 52428801 },
    { tamanho: 1.5 },
    { id: "invalid" },
  ]) {
    const result = await scenario({ rows: [{ ...targets[0], ...patch }] });
    assert.notEqual(result.status, 0);
    assert.equal(result.plan, null);
  }
});
