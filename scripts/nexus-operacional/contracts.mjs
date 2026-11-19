import { execFileSync } from "node:child_process";
import { mkdirSync, readFileSync, writeFileSync } from "node:fs";
import { validateAcceptanceException } from "./acceptance-contract.mjs";

const baseline = "820c79d60055a25e2d56bf60a091f032c5e7a8bf";
// Cruz Alta assets were reviewed and merged in PR #28. Protect those paths at its exact tree.
const reviewedCruzAlta = "f783538a74c8df5289ad7635ff7f5e4d232ceb5f";
const reviewedAssetPaths = ["public/models/cruz-alta", "public/models/mapas-3d/icons"];
const isReviewedAsset = (path) =>
  reviewedAssetPaths.some((folder) => path.startsWith(folder + "/"));
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
    if (isReviewedAsset(path)) return false;
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
changed.push(
  ...git("diff", "--name-only", reviewedCruzAlta, "--", ...reviewedAssetPaths)
    .split(/\r?\n/)
    .filter(Boolean),
);
const unexpected = git("ls-files", "--others", "--exclude-standard", "--", ...paths)
  .split(/\r?\n/)
  .filter(Boolean);
const count =
  git("ls-tree", "-r", "--name-only", baseline, "--", ...paths)
    .split(/\r?\n/)
    .filter((path) => path && !isReviewedAsset(path)).length +
  git("ls-tree", "-r", "--name-only", reviewedCruzAlta, "--", ...reviewedAssetPaths)
    .split(/\r?\n/)
    .filter(Boolean).length;
const report = {
  baseline,
  reviewedCruzAlta,
  currentHead: git("rev-parse", "HEAD"),
  protectedFiles: count,
  changed,
  declaredExceptions,
  unexpected,
  scope:
    "Git content comparison of engines, catalogue, proposal commands, historical migrations, scenes and public assets. Cruz Alta's reviewed assets are protected at the PR #28 merge commit. Library presentation and the reviewed acceptance RPC adapter are explicit exceptions. Does not certify runtime FPS or physical devices.",
};
mkdirSync("docs/nexus-operacional/evidencias", { recursive: true });
writeFileSync(
  "docs/nexus-operacional/evidencias/contratos-preservados.json",
  JSON.stringify(report, null, 2),
);
console.log(JSON.stringify({ protectedFiles: count, changed, declaredExceptions, unexpected }));
if (changed.length || unexpected.length) process.exitCode = 1;
