// Responsive acceptance checks use the real workspace with an isolated synthetic transport.
import { chromium, webkit, expect } from "@playwright/test";
import { existsSync } from "node:fs";
import { mkdir, writeFile } from "node:fs/promises";
import { evidenceRoot } from "./evidence.mjs";

const base = process.env.NEXUS_UI_URL || "http://127.0.0.1:4182";
const directory = `${evidenceRoot}/nr-layout`;
await mkdir(directory, { recursive: true });
const destinations = [
  ["Painel", ""],
  ["Clientes", "clientes"],
  ["Levantamento", "levantamentos"],
  ["Locais", "locais"],
  ["Documentos", "documentos"],
  ["Pendências", "pendencias"],
  ["Regras e biblioteca", "biblioteca"],
  ["Conferência", "conferencia"],
];
const viewports = [
  { width: 1366, height: 768 },
  { width: 1440, height: 900 },
  { width: 1920, height: 1080 },
  { width: 2560, height: 1440 },
  { width: 1024, height: 768 },
  { width: 720, height: 450 },
  { width: 390, height: 844 },
];
const report = {
  method:
    "Eight existing destinations in NR33 and NR35, real components, synthetic local transport. CSS width 720 represents the layout width of 200% at 1440; it is not native zoom. Separate manual Safari evidence verifies one native 200% journey.",
  checks: [],
  browsers: [],
  limitations: [],
  screenshots: [],
  errors: [],
};
for (const [engine, type] of [
  ["chromium", chromium],
  ["webkit", webkit],
]) {
  const options = { headless: true };
  if (engine === "chromium" && !existsSync(type.executablePath()))
    options.executablePath = "/Applications/Google Chrome.app/Contents/MacOS/Google Chrome";
  if (engine === "webkit" && !existsSync(type.executablePath())) {
    report.limitations.push("WebKit runtime unavailable on this host; that engine was not tested.");
    continue;
  }
  const browser = await type.launch(options);
  report.browsers.push({ engine, version: browser.version() });
  const page = await browser.newPage({ locale: "pt-BR", reducedMotion: "reduce" });
  page.on("pageerror", (error) => report.errors.push({ engine, message: error.message }));
  await page.route("**/*", async (route) => {
    const url = new URL(route.request().url());
    if (
      url.origin === new URL(base).origin ||
      ["fonts.googleapis.com", "fonts.gstatic.com"].includes(url.hostname)
    )
      await route.continue();
    else await route.abort();
  });
  try {
    for (const viewport of viewports) {
      console.log(`${engine}: ${viewport.width}×${viewport.height}`);
      await page.setViewportSize(viewport);
      for (const norm of ["33", "35"]) {
        for (const [name, path] of destinations) {
          const url = new URL(base);
          url.search = new URLSearchParams({
            page: `nr-${norm}`,
            scenario: "nr-contextual",
            nrPath: path,
            cliente: "20000000-0000-4000-8000-000000000001",
            unidade: "21000000-0000-4000-8000-000000000001",
          }).toString();
          await page.goto(url.href, { waitUntil: "domcontentloaded" });
          await page.locator(".nx-nr-workspace").waitFor();
          // Wait for the collection transport before measuring or saving evidence.
          await expect(page.locator(".nx-nr-workspace .nx-loading")).toHaveCount(0);
          const nav = page.locator(`.nr-tabs[aria-label="Áreas NR-${norm}"]`);
          await expect(nav.locator("a")).toHaveText(destinations.map(([label]) => label));
          if (viewport.width <= 700) {
            const compact = page.getByRole("combobox", { name: "Área do módulo", exact: true });
            await expect(compact).toBeVisible();
            await expect(compact).toHaveValue(path || "visao-geral");
          }
          const selected = nav.locator('a[aria-current="page"]');
          await expect(selected).toHaveText(name);
          const metrics = await page.evaluate(() => {
            const workspace = document.querySelector(".nx-nr-workspace");
            const frame = document.querySelector(".nr-context");
            const current = document.querySelector('.nr-tabs a[aria-current="page"]');
            const cards = [...workspace.querySelectorAll(".nr-card, .nr-unit-card")];
            return {
              overflow: document.documentElement.scrollWidth - window.innerWidth,
              frameSurface: frame ? getComputedStyle(frame).backgroundColor : null,
              clientSurface: getComputedStyle(workspace.querySelector(".nr-client-combobox"))
                .backgroundColor,
              unitSurface: getComputedStyle(workspace.querySelector(".nr-context-unit select"))
                .backgroundColor,
              selectedTransform: current ? getComputedStyle(current).transform : "none",
              cardCount: cards.length,
              cardsOutside: cards.filter((card) => {
                const bounds = card.getBoundingClientRect();
                return bounds.left < -1 || bounds.right > window.innerWidth + 1;
              }).length,
              cardWidths: cards.map((card) => Math.round(card.getBoundingClientRect().width)),
            };
          });
          expect(
            metrics.overflow,
            `${engine} NR${norm} ${name} ${viewport.width}`,
          ).toBeLessThanOrEqual(1);
          expect(metrics.cardsOutside).toBe(0);
          expect(metrics.selectedTransform).toBe("none");
          expect(metrics.frameSurface).not.toBe("rgb(255, 255, 255)");
          expect(metrics.frameSurface).not.toBeNull();
          expect(metrics.clientSurface).not.toBe("rgb(255, 255, 255)");
          expect(metrics.unitSurface).toBe(metrics.clientSurface);
          report.checks.push({ engine, norm: `NR${norm}`, name, viewport, ...metrics, pass: true });
          if (
            engine === "chromium" &&
            (viewport.width === 1440 || (viewport.width === 390 && norm === "33"))
          ) {
            const file = `${engine}-nr${norm}-${path || "painel"}-${viewport.width}.png`;
            await page.screenshot({ path: `${directory}/${file}` });
            report.screenshots.push(file);
          }
        }
      }
    }
    for (const width of [1440, 390]) {
      await page.setViewportSize({ width, height: 900 });
      const longTag = new URL(base);
      longTag.search = new URLSearchParams({
        page: "nr-33",
        scenario: "nr-contextual",
        nrPath: "locais",
        nrLongTag: "1",
        cliente: "20000000-0000-4000-8000-000000000001",
        unidade: "21000000-0000-4000-8000-000000000001",
      }).toString();
      await page.goto(longTag.href, { waitUntil: "domcontentloaded" });
      const tag = "EC-" + "IDENTIFICADOR-TECNICO-".repeat(6).slice(0, 117);
      await expect(page.locator(".nr-card-tag").filter({ hasText: tag })).toHaveText(tag);
      expect(
        await page.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth + 1),
      ).toBe(true);
      report.checks.push({
        engine,
        name: "Full 120-character TAG remains readable",
        width,
        pass: true,
      });
    }
  } catch (error) {
    report.errors.push({ engine, message: error.message, url: page.url() });
    await page.screenshot({ path: `${directory}/${engine}-failure.png` });
  } finally {
    await browser.close();
  }
}
await writeFile(`${directory}/results.json`, JSON.stringify(report, null, 2));
console.log(JSON.stringify({ checks: report.checks.length, errors: report.errors }, null, 2));
if (report.errors.length) process.exitCode = 1;
