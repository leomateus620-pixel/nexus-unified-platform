import { chromium } from "playwright";
import { mkdir, writeFile } from "node:fs/promises";
const base = process.env.LC02_URL ?? "http://127.0.0.1:5183";
const out = "docs/escada-lc02/evidence/people";
await mkdir(out, { recursive: true });
const browser = await chromium.launch({ headless: true, channel: "chrome" });
const report = [];
const watchdog = setTimeout(() => process.exit(1), 240000);
try {
  for (const count of [1, 10]) {
    const context = await browser.newContext({
      viewport: { width: 1280, height: 900 },
      recordVideo: { dir: ".cache/lc02/videos", size: { width: 1280, height: 900 } },
    });
    const page = await context.newPage();
    const video = page.video();
    const errors = [];
    page.on("pageerror", (e) => errors.push(e.message));
    await page.goto(`${base}/escada-lc02`);
    await page.waitForSelector("canvas[data-ready=true]", { timeout: 90000 });
    await page
      .getByRole("button", {
        name: `Iniciar teste com ${count} ${count === 1 ? "pessoa" : "pessoas"}`,
        exact: true,
      })
      .click();
    await page.waitForFunction(
      () => JSON.parse(document.querySelector("canvas").dataset.people)[0].s > 2,
      null,
      { timeout: 45000 },
    );
    if (count === 1) {
      await page.getByRole("button", { name: "Controlar", exact: true }).click();
      await page.waitForTimeout(1800);
      await page.keyboard.down("KeyW");
      await page.waitForTimeout(2200);
      await page.keyboard.up("KeyW");
      await page.waitForTimeout(500);
      await page.getByRole("button", { name: "Acompanhar", exact: true }).click();
    } else {
      await page.waitForFunction(
        () => JSON.parse(document.querySelector("canvas").dataset.people)[9].state === "walking",
        null,
        { timeout: 90000 },
      );
      await page.waitForTimeout(1400);
      await page.getByRole("button", { name: "Acompanhar", exact: true }).click();
    }
    await page.waitForFunction(
      () => JSON.parse(document.querySelector("canvas").dataset.people)[0].state === "entered",
      null,
      { timeout: 90000 },
    );
    if (count === 10) await page.waitForTimeout(2000);
    else
      await page.waitForFunction(
        () => document.querySelector("canvas").dataset.simulation === "completed",
      );
    report.push({
      count,
      errors,
      final: await page.locator("canvas").evaluate((c) => ({ ...c.dataset })),
    });
    await context.close();
    await video.saveAs(`${out}/walkthrough-${count}.webm`);
    console.log("Recorded", count);
  }
} finally {
  clearTimeout(watchdog);
  await Promise.race([browser.close(), new Promise((r) => setTimeout(r, 3000))]);
  await writeFile(`${out}/videos.json`, JSON.stringify(report, null, 2));
}
process.exit(report.some((r) => r.errors.length) ? 1 : 0);
