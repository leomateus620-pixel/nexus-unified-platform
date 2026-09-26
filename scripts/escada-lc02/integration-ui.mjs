import { chromium } from "playwright";
import assert from "node:assert/strict";
import { writeFile } from "node:fs/promises";
const browser = await chromium.launch({ headless: true, channel: "chrome" });
const page = await browser.newPage({ viewport: { width: 1440, height: 1000 } });
const base = process.env.LC02_URL ?? "http://127.0.0.1:5183";
const errors = [];
page.on("pageerror", (e) => errors.push(e.message));
const report = { routes: [], errors };
const watchdog = setTimeout(() => process.exit(1), 180000);
try {
  await page.goto(`${base}/mapas-3d`);
  await page.waitForFunction(() => window.__industrialMetrics?.status === "ready", null, {
    timeout: 90000,
  });
  assert.equal(await page.locator(".lc-app").count(), 0);
  assert.equal(await page.locator("canvas").count(), 1);
  report.routes.push({ route: "/mapas-3d", ready: true, canvases: 1 });
  await page.goto(`${base}/mapas-3d/trevisan`);
  await page.waitForSelector("canvas[data-ready=true]", { timeout: 60000 });
  assert.equal(await page.locator(".lc-app").count(), 0);
  assert.equal(await page.locator("canvas").count(), 1);
  report.routes.push({ route: "/mapas-3d/trevisan", ready: true, canvases: 1 });
  await page.goto(`${base}/mapas-3d/unidades`);
  await page.getByRole("heading", { name: "Mapas 3D das unidades", exact: true }).waitFor();
  assert.equal(await page.locator("canvas").count(), 0);
  assert.ok(await page.getByRole("link", { name: /Moega 3 e coberturas/ }).count());
  report.routes.push({ route: "/mapas-3d/unidades", ready: true, canvases: 0 });
  assert.deepEqual(errors, []);
} catch (error) {
  report.failure = String(error.stack ?? error);
  console.error(report.failure);
} finally {
  clearTimeout(watchdog);
  await writeFile(
    "docs/escada-lc02/evidence/people/integration.json",
    JSON.stringify(report, null, 2),
  );
  await Promise.race([browser.close(), new Promise((r) => setTimeout(r, 3000))]);
}
console.log(JSON.stringify(report, null, 2));
process.exit(report.failure ? 1 : 0);
