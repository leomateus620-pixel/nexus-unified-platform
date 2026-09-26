import { chromium } from "playwright";
import assert from "node:assert/strict";
import { writeFile } from "node:fs/promises";
const base = process.env.LC02_URL ?? "http://127.0.0.1:5183";
const browser = await chromium.launch({ headless: true, channel: "chrome" });
const page = await browser.newPage({ viewport: { width: 1200, height: 850 } });
const errors = [];
page.on("pageerror", (e) => errors.push(e.message));
const report = { checks: [], errors };
const watchdog = setTimeout(() => process.exit(1), 120000);
try {
  await page.route("**/people/worker-*.glb", (route) =>
    route.fulfill({ status: 503, body: "Asset temporarily unavailable" }),
  );
  await page.goto(`${base}/escada-lc02`);
  await page.waitForSelector("canvas[data-ready=true]", { timeout: 90000 });
  await page.getByRole("button", { name: "Iniciar teste com 5 pessoas", exact: true }).click();
  await page.getByText("Não foi possível carregar as pessoas.", { exact: true }).waitFor();
  assert.equal(await page.locator("canvas").getAttribute("data-ready"), "true");
  const snapshot = JSON.parse(await page.locator("canvas").getAttribute("data-people"));
  assert.equal(snapshot.filter((p) => p.state === "waiting").length, 5);
  await page
    .getByRole("navigation", { name: "Vistas do modelo" })
    .getByRole("button", { name: /Frontal$/ })
    .click();
  await page.unroute("**/people/worker-*.glb");
  await page.getByRole("button", { name: "Tentar novamente", exact: true }).click();
  await page.waitForFunction(
    () => JSON.parse(document.querySelector("canvas").dataset.people)[0].s > 0.5,
    null,
    { timeout: 60000 },
  );
  report.checks.push(
    "503 worker failure keeps base scene usable; retry loads models and resumes queue",
  );
  await page.getByRole("button", { name: "Controlar", exact: true }).click();
  // Native pointer capture is tested by the touch suite; keyboard blur must also release input.
  await page.keyboard.down("KeyW");
  await page.waitForTimeout(250);
  await page.evaluate(() => window.dispatchEvent(new Event("blur")));
  const first = JSON.parse(await page.locator("canvas").getAttribute("data-people"))[0].s;
  await page.waitForTimeout(300);
  const second = JSON.parse(await page.locator("canvas").getAttribute("data-people"))[0].s;
  assert.ok(Math.abs(second - first) < 0.025);
  await page.keyboard.up("KeyW");
  report.checks.push("manual input clears on window blur");
  assert.deepEqual(errors, []);
} catch (error) {
  report.failure = String(error.stack ?? error);
  console.error(report.failure);
} finally {
  clearTimeout(watchdog);
  await writeFile(
    "docs/escada-lc02/evidence/people/asset-recovery.json",
    JSON.stringify(report, null, 2),
  );
  await Promise.race([browser.close(), new Promise((r) => setTimeout(r, 3000))]);
}
console.log(JSON.stringify(report, null, 2));
process.exit(report.failure ? 1 : 0);
