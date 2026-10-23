import path from "node:path";

export const generatorVersion = "0.100.0";
export const postgrestContract = "14.5";

export function astSignature(ts, source) {
  const file = ts.createSourceFile("types.ts", source, ts.ScriptTarget.Latest, true);
  const visit = (node) => {
    if (ts.isParenthesizedTypeNode(node) || ts.isParenthesizedExpression(node))
      return visit(node.type ?? node.expression);
    const children = [];
    ts.forEachChild(node, (child) => {
      children.push(visit(child));
    });
    return [
      node.kind,
      ts.isIdentifier(node) || ts.isLiteralExpression(node) ? node.text : null,
      ts.isVariableDeclarationList(node)
        ? node.flags & (ts.NodeFlags.Const | ts.NodeFlags.Let)
        : null,
      children,
    ];
  };
  return JSON.stringify(visit(file));
}

export function localContext(env, directory) {
  if (env.PGTEST_EPHEMERAL !== "1") throw new Error("PGTEST_EPHEMERAL=1 obrigatório");
  if (env.PGTEST_HOST !== "127.0.0.1") throw new Error("Somente loopback 127.0.0.1");
  if (!/^\d{4,5}$/.test(env.PGTEST_PORT ?? "")) throw new Error("Porta local inválida");
  const port = Number(env.PGTEST_PORT);
  if (port < 1024 || port > 65535) throw new Error("Porta local inválida");
  if (!env.TEMP && !env.TMP) throw new Error("TEMP obrigatório");
  const temporaryRoot = path.resolve(env.TEMP || env.TMP);
  const resolved = path.resolve(directory);
  const relative = path.relative(temporaryRoot, resolved);
  if (!temporaryRoot || !relative || relative.startsWith("..") || path.isAbsolute(relative))
    throw new Error("Saída intermediária deve permanecer em TEMP");
  return { directory: resolved, port };
}

export function generationEnvironment(env, port) {
  return {
    SystemRoot: env.SystemRoot,
    WINDIR: env.WINDIR,
    TEMP: env.TEMP,
    TMP: env.TMP,
    PATH: env.PATH,
    PG_META_DB_URL: `postgresql://postgres@127.0.0.1:${port}/postgres?options=-c%20default_transaction_read_only%3Don`,
    PG_META_GENERATE_TYPES: "typescript",
    PG_META_GENERATE_TYPES_INCLUDED_SCHEMAS: "public",
    PG_META_GENERATE_TYPES_DEFAULT_SCHEMA: "public",
    PG_META_GENERATE_TYPES_DETECT_ONE_TO_ONE_RELATIONSHIPS: "true",
    PG_META_POSTGREST_VERSION: postgrestContract,
  };
}
