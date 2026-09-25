import { spawnSync } from "node:child_process";
import { existsSync } from "node:fs";
import { homedir } from "node:os";
import path from "node:path";
import { fileURLToPath } from "node:url";

const repository = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const bundledPython = path.join(
  homedir(),
  ".cache",
  "codex-runtimes",
  "codex-primary-runtime",
  "dependencies",
  "python",
  "python.exe",
);
const candidates = process.env.CAD_PYTHON
  ? [process.env.CAD_PYTHON]
  : [
      ...(process.platform === "win32" && existsSync(bundledPython)
        ? [bundledPython]
        : []),
      "python3",
      "python",
    ];

const binary = candidates.find((candidate) => {
  const probe = spawnSync(candidate, ["-c", "import numpy; import lxml.etree"], {
    cwd: repository,
    encoding: "utf8",
    timeout: 15000,
    windowsHide: true,
  });
  return !probe.error && probe.status === 0;
});

if (!binary) {
  console.error(
    "Python com numpy e lxml não encontrado. Configure CAD_PYTHON com o caminho do executável Python que contém essas dependências.",
  );
  process.exit(1);
}

const result = spawnSync(
  binary,
  [path.join(repository, "scripts", "cad", "extract_model.py"), ...process.argv.slice(2)],
  {
    cwd: repository,
    stdio: "inherit",
    windowsHide: true,
    env: { ...process.env, PYTHONIOENCODING: "utf-8" },
  },
);
if (result.error) console.error(result.error.message);
process.exit(result.status ?? 1);
