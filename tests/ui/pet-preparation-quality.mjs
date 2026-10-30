import { chromium } from "@playwright/test";
import { mkdir, writeFile } from "node:fs/promises";
// Read-only visual matrix against the isolated SQL lab. Seed with tests/pet-ui/seed.mjs.
const root = process.env.NEXUS_PET_EVIDENCE || "/tmp/nexus-pet-after";
await mkdir(root, { recursive: true });
const browser = await chromium.launch({
  ...(process.env.NEXUS_UI_BROWSER_EXECUTABLE
    ? { executablePath: process.env.NEXUS_UI_BROWSER_EXECUTABLE }
    : {}),
  headless: true,
});
const errors = [],
  results = [];
const page = await browser.newPage({
  reducedMotion: "reduce",
  locale: "pt-BR",
  timezoneId: "Asia/Tokyo",
});
page.on("pageerror", (e) => errors.push(e.message));
if (!process.env.NEXUS_PET_ID) throw Error("Set NEXUS_PET_ID from the isolated seed output");
const url =
  (process.env.NEXUS_PET_SQL_URL || "http://127.0.0.1:4193") +
  "/execucao/pets/" +
  process.env.NEXUS_PET_ID;
async function capture(state, theme, width) {
  await page.evaluate(() => window.scrollTo(0, 0));
  const result = await page.locator(".pet-workspace").evaluate((root) => ({
    overflow: document.documentElement.scrollWidth > innerWidth,
    fonts:
      document.fonts.check('16px "Nexus PET Saira"') &&
      document.fonts.check('16px "Nexus PET Barlow"'),
    smallInputs: [...root.querySelectorAll("input,select,textarea")]
      .filter((e) => e.getClientRects().length && parseFloat(getComputedStyle(e).fontSize) < 16)
      .map((e) => e.outerHTML.slice(0, 100)),
    smallTargets: [...root.querySelectorAll("button,a")]
      .filter((e) => e.getClientRects().length)
      .map((e) => ({
        label: e.textContent.slice(0, 80),
        width: e.getBoundingClientRect().width,
        height: e.getBoundingClientRect().height,
      }))
      .filter((e) => e.width < 43.9 || e.height < 43.9),
  }));
  results.push({ state, theme, width, ...result });
  await page.screenshot({ path: `${root}/${state}-${theme}-${width}.png`, fullPage: true });
}
const themeChecks = [];
for (const theme of ["dark", "light"]) {
  for (const width of [360, 390, 430, 768, 1366, 1920]) {
    await page.setViewportSize({ width, height: 950 });
    await page.goto(url, { waitUntil: "networkidle" });
    await page.locator(".pet-workspace").waitFor();
    await page.evaluate(() => document.fonts.ready);
    const globalBefore = await page.evaluate(() => ({
      html: document.documentElement.className,
      rail: getComputedStyle(document.querySelector(".nx-topbar")).backgroundColor,
    }));
    if ((await page.locator(".pet-workspace").getAttribute("data-pet-theme")) !== theme)
      await page.getByRole("button", { name: /Ativar modo/ }).click();
    if (width === 360) {
      await page.reload({ waitUntil: "networkidle" });
      await page.locator(".pet-workspace").waitFor();
      await page.evaluate(() => document.fonts.ready);
      const globalAfter = await page.evaluate(() => ({
        html: document.documentElement.className,
        rail: getComputedStyle(document.querySelector(".nx-topbar")).backgroundColor,
      }));
      const persisted =
        (await page.locator(".pet-workspace").getAttribute("data-pet-theme")) === theme;
      themeChecks.push({
        theme,
        persisted,
        globalUnchanged: JSON.stringify(globalBefore) === JSON.stringify(globalAfter),
      });
    }
    await capture("contexto", theme, width);
    for (const label of ["Equipe", "Segurança", "Atmosfera e procedimentos"]) {
      await page
        .getByRole("navigation", { name: "Etapas da preparação" })
        .getByRole("button", { name: label })
        .click();
      await capture(label.split(" ")[0].toLowerCase(), theme, width);
    }
    await page
      .getByRole("navigation", { name: "Fases da PET" })
      .getByRole("button", { name: "Conferir" })
      .click();
    await capture("conferencia", theme, width);
  }
}
await writeFile(root + "/results.json", JSON.stringify({ errors, themeChecks, results }, null, 2));
console.log(
  JSON.stringify({
    errors,
    layouts: results.length,
    themeChecks,
    failures: results.filter(
      (r) => r.overflow || !r.fonts || r.smallInputs.length || r.smallTargets.length,
    ),
  }),
);
if (
  errors.length ||
  themeChecks.some((r) => !r.persisted || !r.globalUnchanged) ||
  results.some((r) => r.overflow || !r.fonts || r.smallInputs.length || r.smallTargets.length)
)
  process.exitCode = 1;
await browser.close();
