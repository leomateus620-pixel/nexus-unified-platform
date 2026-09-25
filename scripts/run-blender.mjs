import { spawnSync } from "node:child_process";
import { existsSync } from "node:fs";
const windows = "C:/Program Files/Blender Foundation/Blender 4.5/blender.exe";
const binary =
  process.env.BLENDER_BIN ||
  (process.platform === "win32" && existsSync(windows) ? windows : "blender");
const result = spawnSync(
  binary,
  [
    "--factory-startup",
    "--disable-autoexec",
    "--background",
    "--python-exit-code",
    "1",
    "--python",
    "scripts/blender/generate_unit.py",
    "--",
    ...process.argv.slice(2),
  ],
  {
    stdio: "inherit",
  },
);
if (result.error) {
  console.error(
    "Blender não encontrado. Instale Blender 4.5 LTS e configure BLENDER_BIN com o caminho do executável.",
  );
  console.error(result.error.message);
}
process.exit(result.status ?? 1);
