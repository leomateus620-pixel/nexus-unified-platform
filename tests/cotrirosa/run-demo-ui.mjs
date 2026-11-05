import { spawn } from "node:child_process";
import { setTimeout as delay } from "node:timers/promises";
// CI owns this temporary process. Never starts a service against a remote database.
const server = spawn(
  process.execPath,
  ["node_modules/vite/bin/vite.js", "--config", "tests/cotrirosa/vite.config.mjs"],
  { stdio: "inherit", env: process.env },
);
const run = (file) =>
  new Promise((resolve, reject) => {
    const child = spawn(process.execPath, [file], { stdio: "inherit", env: process.env });
    const deadline = setTimeout(() => {
      child.kill("SIGKILL");
      reject(Error(`${file}: exceeded six-minute browser deadline`));
    }, 360000);
    child.on("error", (error) => {
      clearTimeout(deadline);
      reject(error);
    });
    child.on("exit", (code) => {
      clearTimeout(deadline);
      code === 0 ? resolve() : reject(Error(`${file}: exit ${code}`));
    });
  });
try {
  let ready = false;
  for (let i = 0; i < 60; i++) {
    if (server.exitCode !== null) throw Error("Preview process exited");
    try {
      const r = await fetch("http://127.0.0.1:4196", { signal: AbortSignal.timeout(3000) });
      if (r.ok) {
        ready = true;
        break;
      }
    } catch {
      /* Wait only for owned local server. */
    }
    await delay(1000);
  }
  if (!ready) throw Error("Preview did not start");
  await run("tests/cotrirosa/validate-demo.mjs");
  await run("tests/cotrirosa/validate-demo-resilience.mjs");
} finally {
  if (server.exitCode === null && server.signalCode === null) {
    const stopped = new Promise((resolve) => server.once("exit", resolve));
    server.kill();
    await Promise.race([stopped, delay(5000)]);
    if (server.exitCode === null && server.signalCode === null) {
      server.kill("SIGKILL");
      await stopped;
    }
  }
}
