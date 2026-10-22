import { spawn } from "node:child_process";
import { createServer } from "vite";

// Dedicated test server. The Vite config replaces external boundaries only in this laboratory.
const port = process.env.NEXUS_UI_PORT || "4190";
process.env.NEXUS_UI_PORT = port;
process.env.NEXUS_UI_URL = `http://127.0.0.1:${port}`;
const server = await createServer({ configFile: "tests/ui/vite.config.mjs" });
try {
  await server.listen();
  const legacyChecks = [
    ["capture.mjs", process.env.NEXUS_UI_CAPTURE_LABEL || "catalog-after"],
    ["accessibility.mjs"],
    ["stages-checks.mjs"],
    ["catalog-checks.mjs"],
    ["commerce-checks.mjs"],
    ["revision-checks.mjs"],
    ["dimension-checks.mjs"],
    ["workspace-visual.mjs", "after"],
    ["autosave-checks.mjs"],
  ];
  const onlyLevantamentos = process.argv.includes("--levantamentos");
  const onlyEstudos = process.argv.includes("--estudos");
  const checks =
    process.argv.includes("--operacional") || onlyLevantamentos || onlyEstudos ? [] : legacyChecks;
  if (!onlyLevantamentos && !onlyEstudos) checks.push(["operational-quality.mjs"]);
  if (!onlyEstudos) checks.push(["levantamentos-quality.mjs"]);
  if (!onlyLevantamentos) checks.push(["estudos-quality.mjs"], ["acoes-vinculadas.mjs"]);
  for (const [file, ...args] of checks) {
    await new Promise((resolve, reject) => {
      const child = spawn(process.execPath, [`tests/ui/${file}`, ...args], {
        stdio: "inherit",
        env: process.env,
      });
      child.once("error", reject);
      child.once("exit", (code) =>
        code === 0 ? resolve() : reject(new Error(`${file} exited ${code}`)),
      );
    });
  }
} finally {
  await server.close();
}
