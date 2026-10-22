import { execFileSync } from "node:child_process";
import { mkdirSync, writeFileSync } from "node:fs";

const baseline = "820c79d60055a25e2d56bf60a091f032c5e7a8bf";
const paths = [
  "src/industrial",
  "src/trevisan",
  "src/escada",
  "src/silo-engolfamento",
  "public/models",
  "public/textures",
  "public/references",
  "public/draco",
  "src/routes/mapas-3d.tsx",
  "src/routes/mapas-3d_.trevisan.tsx",
  "src/routes/mapas-3d_.silo-engolfamento.tsx",
  "src/routes/escada-lc02.tsx",
  "src/features/calculo",
  "src/features/custos/domain.ts",
  "src/features/catalogo",
  "src/features/propostas/propostas.functions.ts",
  "supabase/migrations",
];
const git = (...args) =>
  execFileSync("git", args, { encoding: "utf8", maxBuffer: 1024 * 1024 }).trim();
const historicalDrizzle = git("ls-tree", "-r", "--name-only", baseline, "--", "drizzle/migrations")
  .split(/\r?\n/)
  .filter((p) => p.endsWith(".sql"));
paths.push(...historicalDrizzle);
const changed = git("diff", "--name-only", baseline, "--", ...paths)
  .split(/\r?\n/)
  .filter(Boolean);
const unexpected = git("ls-files", "--others", "--exclude-standard", "--", ...paths)
  .split(/\r?\n/)
  .filter(Boolean);
const count = git("ls-tree", "-r", "--name-only", baseline, "--", ...paths)
  .split(/\r?\n/)
  .filter(Boolean).length;
const report = {
  baseline,
  currentHead: git("rev-parse", "HEAD"),
  protectedFiles: count,
  changed,
  unexpected,
  scope:
    "Git content comparison of existing engines, catalogue, transactional proposal commands, 30 historical migrations, scene code and public assets. Library presentation is the explicit exception. Does not certify runtime FPS or physical devices.",
};
mkdirSync("docs/nexus-operacional/evidencias", { recursive: true });
writeFileSync(
  "docs/nexus-operacional/evidencias/contratos-preservados.json",
  JSON.stringify(report, null, 2),
);
console.log(JSON.stringify({ protectedFiles: count, changed, unexpected }));
if (changed.length || unexpected.length) process.exitCode = 1;
