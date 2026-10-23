import { spawn } from "node:child_process";
import { createServer } from "vite";
import { preparePdfAssets } from "../../src/features/projetos-engenharia/leitor/prepare-assets.mjs";

// Dedicated test server. The Vite config replaces external boundaries only in this laboratory.
const port = process.env.NEXUS_UI_PORT || "4190";
process.env.NEXUS_UI_PORT = port;
process.env.NEXUS_UI_URL = `http://127.0.0.1:${port}`;
await preparePdfAssets("node_modules/pdfjs-dist", "public/pdfjs/6.4.299");
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
  const features = {
    "--pessoas": [["pessoas-quality.mjs"], ["equipes-quality.mjs"], ["qualificacoes-quality.mjs"]],
    "--levantamentos": [["levantamentos-quality.mjs"]],
    "--estudos": [["estudos-quality.mjs"], ["acoes-vinculadas.mjs"]],
    "--almoxarifado": [["almoxarifado-quality.mjs"], ["anexos-canonicos-quality.mjs"]],
    "--pe-arquivos": [["pe-arquivos-quality.mjs"]],
    "--pe-leitor": [["pe-leitor-quality.mjs"]],
    "--disponibilidade": [["disponibilidade-quality.mjs"]],
    "--agenda": [
      ["agenda-quality.mjs"],
      ["agenda-anexos-quality.mjs"],
      ["agenda-serie-pendencias-quality.mjs"],
    ],
  };
  const selected = Object.keys(features).find((flag) => process.argv.includes(flag));
  const checks = selected
    ? features[selected]
    : [
        ...(process.argv.includes("--operacional") ? [] : legacyChecks),
        ["operational-quality.mjs"],
        ...Object.values(features).flat(),
      ];
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
