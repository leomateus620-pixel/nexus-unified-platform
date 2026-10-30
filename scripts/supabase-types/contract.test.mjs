import test from "node:test";
import assert from "node:assert/strict";
import os from "node:os";
import path from "node:path";
import ts from "typescript";
import { astSignature, generationEnvironment, localContext } from "./contract.mjs";

const base = {
  TEMP: os.tmpdir(),
  PGTEST_EPHEMERAL: "1",
  PGTEST_HOST: "127.0.0.1",
  PGTEST_PORT: "55499",
};
const directory = path.join(os.tmpdir(), "nexus-typegen-contract");
test("generation requires an explicit ephemeral flag and a loopback port", () => {
  assert.equal(localContext(base, directory).port, 55499);
  assert.throws(() => localContext({ ...base, PGTEST_EPHEMERAL: "0" }, directory), /EPHEMERAL/);
  assert.throws(
    () => localContext({ ...base, PGTEST_HOST: "db.example.org" }, directory),
    /loopback/,
  );
  assert.throws(() => localContext({ ...base, PGTEST_PORT: "65536" }, directory), /Porta/);
  assert.throws(() => localContext(base, path.parse(os.tmpdir()).root), /TEMP/);
  assert.throws(() => localContext({ ...base, TEMP: undefined }, directory), /TEMP/);
});
test("generator receives only public metadata and cannot inherit production credentials", () => {
  const env = generationEnvironment(
    {
      ...base,
      SUPABASE_SERVICE_ROLE_KEY: "test-sentinel",
      PG_META_DB_URL: "postgres://outside.invalid/db",
      LOVABLE_DB_MIGRATION_URL: "postgres://outside.invalid/db",
    },
    55499,
  );
  assert.equal(new URL(env.PG_META_DB_URL).hostname, "127.0.0.1");
  assert.equal(env.PG_META_GENERATE_TYPES_INCLUDED_SCHEMAS, "public");
  assert.equal(env.PG_META_POSTGREST_VERSION, "14.17");
  assert.equal(env.PG_META_GENERATE_TYPES_DETECT_ONE_TO_ONE_RELATIONSHIPS, "true");
  assert.equal(env.SUPABASE_SERVICE_ROLE_KEY, undefined);
  assert.equal(env.LOVABLE_DB_MIGRATION_URL, undefined);
  assert.match(env.PG_META_DB_URL, /default_transaction_read_only/);
});
test("format verification ignores layout/trailing commas but rejects changed types and constants", () => {
  const raw =
    'export type Row={id:string;data:Json}; export const Constants={status:["draft","approved",]} as const';
  const formatted =
    'export type Row = { id: string; data: Json; };\nexport const Constants = { status: ["draft", "approved"] } as const;';
  assert.equal(astSignature(ts, raw), astSignature(ts, formatted));
  assert.notEqual(
    astSignature(ts, raw),
    astSignature(ts, formatted.replace("id: string", "id: number")),
  );
  assert.notEqual(
    astSignature(ts, raw),
    astSignature(ts, formatted.replace('"approved"', '"cancelled"')),
  );
});
