import { spawn } from "node:child_process";
import { setTimeout } from "node:timers/promises";
// CI owns this temporary process. Never starts a service against a remote database.
const server = spawn(
  process.execPath,
  ["node_modules/vite/bin/vite.js", "--config", "tests/cotrirosa/vite.config.mjs"],
  { stdio: "inherit", env: process.env },
);
const run = (file) =>
  new Promise((resolve, reject) => {
    const child = spawn(process.execPath, [file], { stdio: "inherit", env: process.env });
    child.on("error", reject);
    child.on("exit", (code) => (code === 0 ? resolve() : reject(Error(`${file}: exit ${code}`))));
  });
try {
  let ready = false;
  for (let i = 0; i < 60; i++) {
    if (server.exitCode !== null) throw Error("Preview process exited");
    try {
      const r = await fetch("http://127.0.0.1:4196");
      if (r.ok) {
        ready = true;
        break;
      }
    } catch {
      /* Wait only for owned local server. */
    }
    await setTimeout(1000);
  }
  if (!ready) throw Error("Preview did not start");
  await run("tests/cotrirosa/validate-demo.mjs");
  await run("tests/cotrirosa/validate-demo-resilience.mjs");
} finally {
  server.kill();
}
