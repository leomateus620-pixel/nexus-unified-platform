import { spawnSync } from "node:child_process";
import { createRequire } from "node:module";
import { readFile, writeFile } from "node:fs/promises";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { createHash } from "node:crypto";
import { loadManifest, sqlChecksum } from "../migrations/manifest.mjs";
import {
  generationEnvironment,
  generatorVersion,
  localContext,
  postgrestContract,
  astSignature,
} from "./contract.mjs";

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "../..");
const { directory, port } = localContext(process.env, process.argv[2]);
const require = createRequire(path.join(root, "package.json"));
const ts = require("typescript");
const prettier = require("prettier");
const packageFile = path.join(directory, "node_modules/@supabase/postgres-meta/package.json");
const installed = JSON.parse(await readFile(packageFile, "utf8"));
if (installed.name !== "@supabase/postgres-meta" || installed.version !== generatorVersion)
  throw new Error("Gerador diferente da versão oficial fixada");
const provenance = JSON.parse(
  await readFile(path.join(directory, "schema-provenance.json"), "utf8"),
);
const manifest = (await loadManifest(root)).map(({ path: migrationPath, sha256, position }) => ({
  path: migrationPath,
  sha256,
  position,
}));
if (provenance.manifestHash !== sqlChecksum(JSON.stringify(manifest)))
  throw new Error("Manifesto mudou durante a geração; repita em novo cluster");
const result = spawnSync(
  process.execPath,
  [path.join(directory, "node_modules/@supabase/postgres-meta/dist/server/server.js")],
  {
    cwd: directory,
    env: generationEnvironment(process.env, port),
    encoding: "utf8",
    maxBuffer: 32 * 1024 * 1024,
    timeout: 120000,
    windowsHide: true,
  },
);
await writeFile(path.join(directory, "typegen.stderr.log"), result.stderr ?? "");
if (result.error || result.status !== 0)
  throw new Error(result.error?.message ?? `Gerador oficial falhou: ${result.stderr}`);
const raw = result.stdout;
await writeFile(path.join(directory, "database.public.raw.types.ts"), raw, "utf8");
const target = path.join(root, "src/integrations/supabase/types.ts");
const generated = await prettier.format(raw, {
  ...(await prettier.resolveConfig(target)),
  filepath: target,
  parser: "typescript",
});
const output = path.join(directory, "database.public.types.ts");
await writeFile(output, generated, "utf8");
const ast = ts.createSourceFile(output, generated, ts.ScriptTarget.Latest, true);
// Project formatting is automatic; it must not change the generated type structure.
if (astSignature(ts, raw) !== astSignature(ts, generated))
  throw new Error("A formatação alterou a estrutura TypeScript gerada");
const database = ast.statements.find(
  (node) => ts.isTypeAliasDeclaration(node) && node.name.text === "Database",
);
const keys = (node) =>
  (node?.members ?? []).map((member) => member.name.getText(ast).replace(/^"|"$/g, ""));
const property = (node, name) =>
  node?.members?.find((member) => member.name.getText(ast).replace(/^"|"$/g, "") === name)?.type;
if (
  keys(database?.type)
    .filter((key) => key !== "__InternalSupabase")
    .join() !== "public"
)
  throw new Error("Schema gerado diferente de public");
const publicSchema = property(database.type, "public");
const tables = property(publicSchema, "Tables");
const views = property(publicSchema, "Views");
const names = [...keys(tables), ...keys(views)].sort();
const equalNames = (a, b) => JSON.stringify([...a].sort()) === JSON.stringify([...b].sort());
if (
  !equalNames(
    names,
    provenance.tables.map((row) => row.name),
  )
)
  throw new Error("Tabelas divergentes do catálogo");
for (const table of names) {
  const row = property(property(tables, table) ?? property(views, table), "Row");
  const expected = provenance.columns
    .filter((column) => column.table_name === table)
    .map((column) => column.column_name);
  if (!equalNames(keys(row), expected)) throw new Error(`Colunas divergentes: ${table}`);
}
if (
  !equalNames(
    keys(property(publicSchema, "Functions")),
    provenance.functions.map((row) => row.name),
  )
)
  throw new Error("Funções divergentes do catálogo");
if (
  !equalNames(
    keys(property(publicSchema, "Enums")),
    provenance.enums.map((row) => row.name),
  )
)
  throw new Error("Enums divergentes do catálogo");
const program = ts.createProgram([output], {
  noEmit: true,
  strict: true,
  skipLibCheck: true,
  target: ts.ScriptTarget.ES2022,
  module: ts.ModuleKind.NodeNext,
  moduleResolution: ts.ModuleResolutionKind.NodeNext,
  types: [],
});
const diagnostics = ts.getPreEmitDiagnostics(program);
if (diagnostics.length)
  throw new Error(ts.formatDiagnosticsWithColorAndContext(diagnostics, ts.createCompilerHost({})));
const report = {
  method:
    "Official @supabase/postgres-meta generation mode; isolated PostgreSQL catalog introspection, no remote data",
  generator: { name: installed.name, version: installed.version },
  postgres: provenance.server_version,
  migrationCount: manifest.length,
  manifestHash: provenance.manifestHash,
  schemas: ["public"],
  postgrestContract,
  postgrestVersionSource: "existing generated client contract; not detected from a remote service",
  detectOneToOneRelationships: true,
  formatter: { name: "prettier", version: prettier.version, typescriptAstPreserved: true },
  tables: keys(tables).length,
  views: keys(views).length,
  functions: provenance.functions.length,
  enums: provenance.enums.length,
  sha256: createHash("sha256").update(generated).digest("hex"),
  rawSha256: createHash("sha256").update(raw).digest("hex"),
  bytes: Buffer.byteLength(generated),
  rawBytes: Buffer.byteLength(raw),
  standaloneTypescriptDiagnostics: diagnostics.length,
  warning: result.stderr.trim() || null,
};
await writeFile(path.join(directory, "generation.json"), JSON.stringify(report, null, 2) + "\n");
console.log(JSON.stringify(report, null, 2));
