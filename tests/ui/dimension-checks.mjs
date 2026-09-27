// Focused recapture after a Dimensionamento-only presentation fix; retains unrelated evidence.
import assert from "node:assert/strict";
import { readFile, writeFile } from "node:fs/promises";
import { chromium } from "@playwright/test";
const base = process.env.NEXUS_UI_URL || "http://127.0.0.1:4182";
const output = "docs/ui/evidence/after";
const report = JSON.parse(await readFile(`${output}/results.json`, "utf8"));
const browser = await chromium.launch({
  headless: true,
  ...(process.env.NEXUS_UI_CHROMIUM ? { executablePath: process.env.NEXUS_UI_CHROMIUM } : {}),
});
const page = await browser.newPage({ reducedMotion: "reduce", locale: "pt-BR" });
const errors = [];
page.on("pageerror", (e) => errors.push(e.message));
await page.route("**/*", (route) =>
  ["127.0.0.1", "fonts.googleapis.com", "fonts.gstatic.com"].includes(
    new URL(route.request().url()).hostname,
  )
    ? route.continue()
    : route.abort(),
);
const at = new Date().toISOString();
const checks = [];
try {
  for (const width of [360, 390, 768, 1024, 1366, 1440, 1920]) {
    await page.setViewportSize({ width, height: width <= 390 ? 844 : 768 });
    await page.goto(`${base}/?page=dimensionamento&count=17`, { waitUntil: "networkidle" });
    await page.evaluate(() => document.fonts.ready);
    const result = await page.evaluate(() => ({
      pageWidth: document.documentElement.scrollWidth,
      overflow: document.documentElement.scrollWidth > innerWidth + 1,
      tableTop: document.querySelector("table").getBoundingClientRect().top,
    }));
    checks.push({ width, ...result });
    Object.assign(
      report.viewports.find((row) => row.screen === "dimensionamento" && row.width === width),
      result,
      { recheckedAt: at },
    );
    assert.equal(result.overflow, false, `Dimensionamento overflow at ${width}`);
    if ([390, 1366].includes(width)) {
      await page.screenshot({ path: `${output}/dimensionamento-${width}.png`, fullPage: true });
      await page.screenshot({ path: `${output}/dimensionamento-${width}-viewport.png` });
    }
  }
  await page.setViewportSize({ width: 1366, height: 768 });
  for (const scenario of ["pending", "error", "conflict", "readonly", "empty"]) {
    await page.goto(`${base}/?page=dimensionamento&scenario=${scenario}&count=17`, {
      waitUntil: "networkidle",
    });
    await page.evaluate(() => document.fonts.ready);
    const result = await page.evaluate(() => ({
      pageWidth: document.documentElement.scrollWidth,
      overflow: document.documentElement.scrollWidth > innerWidth + 1,
      text: document.body.innerText,
    }));
    Object.assign(
      report.scenarios.find((row) => row.screen === "dimensionamento" && row.scenario === scenario),
      result,
      { recheckedAt: at },
    );
    assert.equal(result.overflow, false, `Dimensionamento overflow in ${scenario}`);
    await page.screenshot({ path: `${output}/dimensionamento-${scenario}.png`, fullPage: true });
    await page.screenshot({ path: `${output}/dimensionamento-${scenario}-viewport.png` });
  }
  assert.deepEqual(errors, []);
  report.passes.push({ phase: "dimensionamento-recheck", at });
  report.assertions.noPageOverflow = report.viewports.every((row) => !row.overflow);
  await writeFile(`${output}/results.json`, JSON.stringify(report, null, 2));
  await writeFile(
    `${output}/dimension-final-checks.json`,
    JSON.stringify({ at, checks, errors }, null, 2),
  );
  console.log(JSON.stringify(checks, null, 2));
} finally {
  await browser.close();
}
