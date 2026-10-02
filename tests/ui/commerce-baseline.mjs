import { chromium } from "@playwright/test";
import { mkdir, writeFile } from "node:fs/promises";
import { evidenceRoot } from "./evidence.mjs";
const output = `${evidenceRoot}/commerce-refinement`;
await mkdir(output, { recursive: true });
const browser = await chromium.launch({ headless: true });
const metrics = [];
try {
  for (const width of [1440, 390]) {
    const page = await browser.newPage({ viewport: { width, height: 950 }, locale: "pt-BR" });
    const errors = [];
    page.on("pageerror", (e) => errors.push(e.message));
    for (const screen of ["produtos", "itens-comerciais"]) {
      await page.goto(
        `${process.env.NEXUS_UI_BASELINE_URL || "http://127.0.0.1:4183"}/?page=${screen}&commerce=1`,
        { waitUntil: "networkidle" },
      );
      const row =
        screen === "produtos"
          ? page.getByText("Montagem de ancoragem industrial", { exact: true })
          : page.getByRole("button", { name: "Editar item COMP-001", exact: true });
      metrics.push({
        screen,
        width,
        errors: [...errors],
        firstRowY: Math.round((await row.boundingBox()).y),
        overflow: await page.evaluate(() => document.documentElement.scrollWidth > innerWidth),
      });
      await page.screenshot({ path: `${output}/before-${screen}-${width}.png` });
    }
    await page.close();
  }
  await writeFile(
    `${output}/baseline.json`,
    JSON.stringify(
      {
        baseCommit: "fe81267",
        boundary: "Same isolated test data; original source from git archive",
        metrics,
      },
      null,
      2,
    ),
  );
  console.log(JSON.stringify(metrics));
} finally {
  await browser.close();
}
