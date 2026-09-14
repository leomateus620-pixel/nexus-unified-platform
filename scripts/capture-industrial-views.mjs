import { chromium } from "@playwright/test";
import fs from "node:fs/promises";
const browser = await chromium.launch({ channel: "chrome", headless: true });
const page = await browser.newPage({
  viewport: { width: 1448, height: 1150 },
  deviceScaleFactor: 1,
});
await page.goto(process.env.MAP_URL ?? "http://127.0.0.1:5173/mapas-3d");
await page.waitForFunction(() => window.__industrialMetrics?.status === "ready");
await page.getByRole("button", { name: "Recolher painel" }).click();
const info = {};
for (const view of ["A", "B", "C", "D"]) {
  if (view === "D") await page.setViewportSize({ width: 941, height: 1736 });
  await page.getByRole("button", { name: `Vista da Foto ${view}`, exact: true }).click();
  await page.waitForTimeout(4000);
  const css = await page.addStyleTag({
    content: ".industrial-overlay{visibility:hidden!important}",
  });
  await page
    .locator(".industrial-canvas")
    .screenshot({ path: `docs/industrial/evidence/view-${view}.png` });
  await css.evaluate((e) => e.remove());
  info[view] = await page.evaluate(() => ({
    camera: window.__industrialMetrics.camera,
    calls: window.__industrialMetrics.calls,
    triangles: window.__industrialMetrics.triangles,
  }));
}
await fs.writeFile("docs/industrial/evidence/views.json", JSON.stringify(info, null, 2));
await browser.close();
