import { execFileSync } from "node:child_process";
import { mkdirSync, readFileSync, writeFileSync } from "node:fs";
import { validateAcceptanceException } from "./acceptance-contract.mjs";

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
const proposalPath = "src/features/propostas/propostas.functions.ts";
const declaredExceptions = [];
const changed = git("diff", "--name-only", baseline, "--", ...paths)
  .split(/\r?\n/)
  .filter(Boolean)
  .filter((path) => {
    if (path !== proposalPath) return true;
    // Integration fix authorized after reproducing partial acceptance. Every byte
    // outside this one branch remains compared with the published baseline.
    declaredExceptions.push(
      validateAcceptanceException(
        execFileSync("git", ["show", `${baseline}:${proposalPath}`], { encoding: "utf8" }),
        readFileSync(proposalPath, "utf8"),
        "7f2f1097e2ea8c683c78038a5638520fa353bb03137acfd2a98c30ffa3f61ca7",
      ),
    );
    return false;
  });
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
  declaredExceptions,
  unexpected,
  scope:
    "Git content comparison of engines, catalogue, proposal commands, 30 historical migrations, scenes and public assets. Library presentation and the reviewed acceptance RPC adapter are explicit exceptions; the rest of that source is byte-identical. Does not certify runtime FPS or physical devices.",
};
mkdirSync("docs/nexus-operacional/evidencias", { recursive: true });
writeFileSync(
  "docs/nexus-operacional/evidencias/contratos-preservados.json",
  JSON.stringify(report, null, 2),
);
console.log(JSON.stringify({ protectedFiles: count, changed, declaredExceptions, unexpected }));
if (changed.length || unexpected.length) process.exitCode = 1;
