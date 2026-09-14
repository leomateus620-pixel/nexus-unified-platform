import { chromium } from "@playwright/test";
import fs from "node:fs/promises";
await fs.mkdir("docs/industrial/evidence", { recursive: true });
const browser = await chromium.launch({ channel: "chrome", headless: true });
const page = await browser.newPage({
  viewport: { width: 1448, height: 1000 },
  deviceScaleFactor: 1,
});
const errors = [];
page.on("pageerror", (e) => errors.push(e.message));
page.on("console", (m) => {
  if (m.type() === "error") errors.push(m.text());
});
await page.goto(process.env.MAP_URL ?? "http://127.0.0.1:5173/mapas-3d");
try {
  await page.waitForFunction(
    () => window.__industrialMetrics?.status === "ready",
    {},
    { timeout: 60000 },
  );
} catch (e) {
  console.log("READY TIMEOUT", await page.locator("body").innerText());
}
await page.waitForTimeout(2500);
await page.screenshot({ path: "docs/industrial/evidence/overview-initial.png" });
console.log(
  JSON.stringify(
    {
      errors,
      metrics: await page.evaluate(() => window.__industrialMetrics),
      text: (await page.locator("body").innerText()).slice(-1500),
    },
    null,
    2,
  ),
);
await browser.close();
