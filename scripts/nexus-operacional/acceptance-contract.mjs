import ts from "typescript";
import { createHash } from "node:crypto";

const hash = (value) => createHash("sha256").update(value).digest("hex");
function acceptance(source) {
  const normalized = source.replace(/\r\n/g, "\n");
  const file = ts.createSourceFile(
    "propostas.functions.ts",
    normalized,
    ts.ScriptTarget.Latest,
    true,
    ts.ScriptKind.TS,
  );
  if (file.parseDiagnostics.length) throw new Error("Invalid proposal source.");
  const matches = [];
  function visit(node) {
    if (ts.isIfStatement(node) && ts.isBinaryExpression(node.expression)) {
      const condition = node.expression;
      if (
        condition.operatorToken.kind === ts.SyntaxKind.EqualsEqualsEqualsToken &&
        ts.isPropertyAccessExpression(condition.left) &&
        condition.left.expression.getText(file) === "data" &&
        condition.left.name.text === "acao" &&
        ts.isStringLiteral(condition.right) &&
        condition.right.text === "aceitar"
      )
        matches.push(node.thenStatement);
    }
    ts.forEachChild(node, visit);
  }
  visit(file);
  if (matches.length !== 1 || !ts.isBlock(matches[0]))
    throw new Error("Expected exactly one acceptance branch.");
  const block = matches[0];
  const canonical = ts
    .createPrinter({ removeComments: true })
    .printNode(ts.EmitHint.Unspecified, block, file);
  return {
    rest:
      normalized.slice(0, block.getStart(file)) +
      "{ ACCEPTANCE_BRANCH }" +
      normalized.slice(block.end),
    hash: hash(canonical),
  };
}
export function acceptanceFingerprint(source) {
  return acceptance(source).hash;
}
export function validateAcceptanceException(before, after, expectedHash) {
  const original = acceptance(before),
    current = acceptance(after);
  if (original.rest !== current.rest)
    throw new Error("Proposal source changed outside the authorized acceptance branch.");
  if (current.hash !== expectedHash)
    throw new Error("Acceptance branch differs from the reviewed atomic RPC adapter.");
  return {
    path: "src/features/propostas/propostas.functions.ts",
    scope: "acceptance branch only",
    sha256: current.hash,
    restUnchanged: true,
  };
}
