import ts from "typescript";
import { execFileSync } from "node:child_process";
import { readFileSync, mkdirSync, writeFileSync, existsSync } from "node:fs";
import { createHash } from "node:crypto";

const base = process.argv[2] || "5286881c4133c3d123812226b20081d67bc61c07";
// Explicitly scoped save/history exception requested for this delivery. Existing
// transition/document/order functions and all pre-existing migrations remain protected.
const saveFiles = new Set([
  "src/features/propostas/hooks.ts",
  "src/features/propostas/propostas.functions.ts",
  "src/features/propostas/Dimensionamento.tsx",
  "src/features/propostas/ItensComerciais.tsx",
  "src/features/propostas/Etapas.tsx",
  "src/routes/_authenticated/comercial.propostas.$propostaId.revisoes.$revisaoId.tsx",
]);
const git = (...args) =>
  execFileSync("git", args, { encoding: "utf8", maxBuffer: 10 * 1024 * 1024 }).trim();
const changed = git("diff", "--name-only", base).split(/\r?\n/).filter(Boolean);
const protectedPattern =
  /^(supabase\/|src\/features\/calculo\/|src\/integrations\/|src\/features\/org\/|src\/features\/propostas\/(hooks|lista|propostas\.functions)\.|src\/routes\/(_authenticated\/route\.tsx|__root\.tsx|mapas-3d)|src\/routeTree\.gen\.ts|src\/(trevisan|industrial)\/)/;
const protectedFiles = git("ls-tree", "-r", "--name-only", base)
  .split(/\r?\n/)
  .filter((f) => protectedPattern.test(f) && !saveFiles.has(f));
const hash = (s) => createHash("sha256").update(s.replace(/\r\n/g, "\n")).digest("hex");
const protectedHashes = protectedFiles.map((file) => ({
  file,
  before: hash(git("show", `${base}:${file}`)),
  after: hash(readFileSync(file, "utf8").trim()),
}));
const transitions = (s) =>
  s
    .slice(s.indexOf("// ---------- Transições ----------"))
    .split("/** Cost protected including counts")[0]
    .trim();
const functionFile = "src/features/propostas/propostas.functions.ts";
const transitionsUnchanged =
  transitions(git("show", `${base}:${functionFile}`)) ===
  transitions(readFileSync(functionFile, "utf8").replace(/\r\n/g, "\n")).trim();
const printer = ts.createPrinter({ removeComments: true });
function extract(source, name) {
  const file = ts.createSourceFile(name, source, ts.ScriptTarget.Latest, true, ts.ScriptKind.TSX);
  const output = { routes: [], requests: [], hooks: [], primaryHandlers: [] };
  const text = (node) =>
    printer.printNode(ts.EmitHint.Unspecified, node, file).replace(/\s+/g, " ").trim();
  function walk(node) {
    if (
      ts.isFunctionDeclaration(node) &&
      node.name &&
      [
        "salvar",
        "inserir",
        "remover",
        "aplicarColagem",
        "ajustar",
        "atualizar",
        "alterarCusto",
      ].includes(node.name.text)
    )
      output.primaryHandlers.push(text(node));
    if (ts.isVariableDeclaration(node) && ts.isIdentifier(node.name) && node.name.text === "Route")
      output.routes.push(text(node.initializer));
    if (ts.isCallExpression(node)) {
      const expression = node.expression;
      const method = ts.isPropertyAccessExpression(expression) ? expression.name.text : "";
      if (
        [
          "from",
          "select",
          "update",
          "insert",
          "delete",
          "upsert",
          "eq",
          "in",
          "order",
          "single",
          "invalidateQueries",
          "mutate",
        ].includes(method) &&
        !(method === "delete" && node.arguments.length > 0)
      )
        output.requests.push(`${method}(${node.arguments.map(text).join(", ")})`);
      if (
        ts.isIdentifier(expression) &&
        ["useQuery", "useMutation", "useServerFn", "useBlocker"].includes(expression.text)
      )
        output.hooks.push(text(node));
    }
    ts.forEachChild(node, walk);
  }
  walk(file);
  for (const key of Object.keys(output)) output[key].sort();
  return output;
}
const contracts = changed
  .filter((f) => /^src\//.test(f) && /\.(ts|tsx)$/.test(f))
  .map((file) => {
    let before;
    try {
      before = git("show", `${base}:${file}`);
    } catch {
      return { file, newFile: true };
    }
    const a = extract(before, file),
      b = extract(existsSync(file) ? readFileSync(file, "utf8") : "", file);
    return {
      file,
      routesEqual: JSON.stringify(a.routes) === JSON.stringify(b.routes),
      requestsEqual: JSON.stringify(a.requests) === JSON.stringify(b.requests),
      hooksEqual: JSON.stringify(a.hooks) === JSON.stringify(b.hooks),
      primaryHandlersEqual: JSON.stringify(a.primaryHandlers) === JSON.stringify(b.primaryHandlers),
      primaryHandlersCount: a.primaryHandlers.length,
      ...Object.fromEntries(
        Object.keys(a)
          .filter((k) => JSON.stringify(a[k]) !== JSON.stringify(b[k]))
          .map((k) => [k, { before: a[k], after: b[k] }]),
      ),
    };
  });
const report = {
  baseline: git("rev-parse", base),
  currentHead: git("rev-parse", "HEAD"),
  generatedAt: new Date().toISOString(),
  protectedHashes,
  protectedChanged: protectedHashes.filter((p) => p.before !== p.after),
  contracts,
  saveCoordinationException: [...saveFiles],
  transitionsUnchanged,
  scope:
    "AST comparison covers route declarations, query/mutation/server hooks, database-call arguments and invalidation/mutate arguments. Presentation state and dialogs require separate manual/behavioral review. No claim of authenticated or database E2E verification.",
};
mkdirSync("docs/ui/evidence", { recursive: true });
writeFileSync("docs/ui/evidence/catalog-contracts.json", JSON.stringify(report, null, 2));
console.log(
  JSON.stringify(
    {
      protectedFiles: protectedHashes.length,
      protectedChanged: report.protectedChanged.map((p) => p.file),
      contracts: contracts.map(({ file, routesEqual, requestsEqual, hooksEqual }) => ({
        file,
        routesEqual,
        requestsEqual,
        hooksEqual,
      })),
    },
    null,
    2,
  ),
);
if (
  report.protectedChanged.length ||
  !transitionsUnchanged ||
  contracts.some(
    (c) =>
      c.routesEqual === false ||
      (!saveFiles.has(c.file) &&
        (c.hooksEqual === false || c.requestsEqual === false || c.primaryHandlersEqual === false)),
  )
)
  process.exitCode = 1;
