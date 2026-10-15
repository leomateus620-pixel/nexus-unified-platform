import { chromium } from "@playwright/test";
import { mkdir, writeFile } from "node:fs/promises";

const output = "docs/silo-engolfamento/evidence/upgrade";
await mkdir(output, { recursive: true });
const browser = await chromium.launch({ channel: "chrome", headless: true });
const page = await browser.newPage({
  viewport: { width: 1440, height: 900 },
  deviceScaleFactor: 1,
});
const errors = [];
page.on("pageerror", (error) => errors.push(error.message));
await page.goto(`${process.env.SILO_URL ?? "http://127.0.0.1:5185"}/mapas-3d/silo-engolfamento`);
await page.waitForSelector("canvas[data-ready=true]", { timeout: 90000 });
await page.waitForTimeout(1800);
const evidence = [];
for (const preset of ["general", "trolley", "anchor", "manhole", "internal"]) {
  await page.getByLabel("Vista de inspeção", { exact: true }).selectOption(preset);
  await page.waitForTimeout(1800);
  const path = `${output}/model-${preset}-final.png`;
  await page.screenshot({ path });
  evidence.push({
    preset,
    screenshot: path,
    metrics: await page.evaluate(() => ({
      renderer: window.__siloMetrics.renderer,
      calls: window.__siloMetrics.calls,
      triangles: window.__siloMetrics.triangles,
      shadowTriangles: window.__siloMetrics.shadowTriangles,
      quality: window.__siloMetrics.quality,
      errors: window.__siloMetrics.errors,
    })),
  });
}
await page.getByRole("button", { name: "Componentes e estrutura", exact: true }).click();
await page.getByRole("button", { name: /Passante curva 30G · 04/ }).click();
await page.waitForTimeout(1500);
await page.screenshot({ path: `${output}/model-passant04-final.png` });
await writeFile(
  `${output}/model-visual-audit.json`,
  `${JSON.stringify({ at: new Date().toISOString(), browser: browser.version(), viewport: "1440x900", condition: "local desktop Chrome headless, hardware graphics; visual QA separate from physical-device evidence", errors, evidence }, null, 2)}\n`,
);
await browser.close();
console.log(JSON.stringify({ errors, evidence }, null, 2));
