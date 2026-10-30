import assert from "node:assert/strict";
import { createHash } from "node:crypto";
import { mkdtemp, readFile, rm, writeFile } from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import { spawnSync } from "node:child_process";
import test from "node:test";
import { strToU8, zipSync } from "fflate";

const root = process.cwd();
const org = "abab473b-8baa-4781-aed2-c1243338af65";
const file = "00000000-0000-4000-8000-000000000001";
const bytes = Buffer.from("Transport test fixture; file validation is a separate pipeline.");
const sha = (value) => createHash("sha256").update(value).digest("hex");

async function scenario(options = {}) {
  const directory = await mkdtemp(path.join(os.tmpdir(), "nexus-transfer-test-"));
  try {
    const entry = "objects/synthetic.pdf";
    const object = { entry, tamanho: bytes.length, sha256: sha(bytes), mime: "application/pdf" };
    const target = {
      ...object,
      arquivo_id: file,
      bucket: "nexus-nr-acervo",
      caminho: `${org}/acervo/${file}.pdf`,
      ...options.target,
    };
    const manifest = {
      format: "nexus-private-storage-part/1",
      package_id: "synthetic-transport-test",
      part: "0001",
      objects: [object],
      files: options.duplicate ? [target, target] : [target],
    };
    const raw = zipSync({ "manifest.json": strToU8(JSON.stringify(manifest)), [entry]: bytes });
    const archive = path.join(directory, "private-test.zip");
    const report = path.join(directory, "report.json");
    const counter = path.join(directory, "requests.json");
    const preload = path.join(directory, "mock-fetch.mjs");
    await writeFile(archive, raw, { mode: 0o600 });
    if (options.foreignCheckpoint)
      await writeFile(report, JSON.stringify({ archive_sha256: "f".repeat(64) }));
    // All HTTP is replaced inside the subprocess, including negative cases.
    // A test failure cannot accidentally contact production or reveal a real key.
    await writeFile(
      preload,
      `import {writeFileSync}from'node:fs';
const calls=[];let posts=0;
globalThis.fetch=async(input,init)=>{
 const url=new URL(input);if(url.origin!=='https://yhtgijtllvgzoqtfcgal.supabase.co')throw Error('Unexpected HTTP origin');
 if(init.headers.apikey!=='synthetic-key-only')throw Error('Unexpected credential');
 calls.push({method:init.method,upsert:init.headers['x-upsert']??null});writeFileSync(${JSON.stringify(counter)},JSON.stringify(calls));
 if(init.method==='POST'){posts++;if(${!!options.transient}&&posts===1)return new Response('retry',{status:503});
 if(${!!options.duplicateResponse})return new Response('The resource already exists',{status:400});
 return new Response('{}',{status:200});}
 const content=Buffer.from(${JSON.stringify(bytes.toString("base64"))},'base64');
 if(${!!options.corruptReadback})content[0]^=1;
 return new Response(content,{status:200,headers:{'content-type':${JSON.stringify(options.wrongMime ? "text/html" : "application/pdf")}}});
};`,
      { mode: 0o600 },
    );
    const result = spawnSync(
      process.execPath,
      [
        "--import",
        preload,
        path.join(root, "scripts/nr/storage-transfer.mjs"),
        archive,
        options.badArchiveHash ? "0".repeat(64) : sha(raw),
        report,
      ],
      {
        cwd: root,
        encoding: "utf8",
        timeout: 15000,
        env: {
          PATH: process.env.PATH,
          SUPABASE_URL: options.foreignHost
            ? "https://example.invalid"
            : "https://yhtgijtllvgzoqtfcgal.supabase.co",
          SUPABASE_SERVICE_ROLE_KEY: "synthetic-key-only",
        },
      },
    );
    if (result.error) throw result.error;
    assert.ok(!result.stdout.includes("synthetic-key-only"));
    assert.ok(!result.stderr.includes("synthetic-key-only"));
    return {
      status: result.status,
      report: JSON.parse(await readFile(report, "utf8").catch(() => "null")),
      calls: JSON.parse(await readFile(counter, "utf8").catch(() => "[]")),
    };
  } finally {
    await rm(directory, { recursive: true, force: true });
  }
}

test("private transfer uploads without overwrite and validates exact readback", async () => {
  const result = await scenario();
  assert.equal(result.status, 0);
  assert.deepEqual(result.calls, [
    { method: "POST", upsert: "false" },
    { method: "GET", upsert: null },
  ]);
  assert.equal(result.report.summary.verified, 1);
  assert.equal(result.report.summary.bytes, bytes.length);
  assert.equal(result.report.summary.database_confirmation, false);
});
test("lost upload response can resume through duplicate plus readback", async () => {
  const result = await scenario({ duplicateResponse: true });
  assert.equal(result.status, 0);
  assert.equal(result.report.summary.verified, 1);
});
test("transient status retries once and preserves immutable upload", async () => {
  const result = await scenario({ transient: true });
  assert.equal(result.status, 0);
  assert.deepEqual(
    result.calls.map((c) => c.method),
    ["POST", "POST", "GET"],
  );
  assert.ok(result.calls.filter((c) => c.method === "POST").every((c) => c.upsert === "false"));
});
test("different readback bytes remain an error, never database confirmation", async () => {
  const result = await scenario({ corruptReadback: true });
  assert.equal(result.status, 2);
  assert.equal(result.report.summary.verified, 0);
  assert.equal(result.report.summary.errors, 1);
  assert.equal(result.report.summary.database_confirmation, false);
});
test("HTML MIME after upload remains an error", async () => {
  const result = await scenario({ wrongMime: true });
  assert.equal(result.status, 2);
  assert.equal(result.report.summary.verified, 0);
});
test("foreign bucket/context/path and duplicate paths cannot request HTTP", async () => {
  for (const target of [
    { bucket: "public" },
    { caminho: `00000000-0000-4000-8000-000000000099/acervo/${file}.pdf` },
    { caminho: `${org}/acervo/../${file}.pdf` },
  ]) {
    const result = await scenario({ target });
    assert.equal(result.status, 1);
    assert.equal(result.calls.length, 0);
  }
  const duplicate = await scenario({ duplicate: true });
  assert.equal(duplicate.status, 1);
  assert.equal(duplicate.calls.length, 0);
});
test("wrong project, archive hash and checkpoint reject before HTTP", async () => {
  for (const options of [
    { foreignHost: true },
    { badArchiveHash: true },
    { foreignCheckpoint: true },
  ]) {
    const result = await scenario(options);
    assert.equal(result.status, 1);
    assert.equal(result.calls.length, 0);
  }
});
