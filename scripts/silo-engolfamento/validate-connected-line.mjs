import { chromium } from "@playwright/test";
import assert from "node:assert/strict";
import { mkdir, readFile, writeFile } from "node:fs/promises";
import path from "node:path";

const base = process.env.SILO_URL ?? "http://127.0.0.1:5185";
const route = `${base.replace(/\/$/, "")}/mapas-3d/silo-engolfamento`;
const output = process.env.SILO_OUTPUT ?? "docs/silo-engolfamento/evidence";
await mkdir(output, { recursive: true });
const browser = await chromium.launch({ channel: "chrome", headless: true });
const page = await browser.newPage({
  viewport: { width: 1440, height: 1000 },
  deviceScaleFactor: 1,
});
const errors = [];
page.on("pageerror", (error) => errors.push(String(error)));
const report = {
  testedAt: new Date().toISOString(),
  command: "node scripts/silo-engolfamento/validate-connected-line.mjs",
  route,
  browser: browser.version(),
  benchmarkPerformed: false,
  method: "Paused t=9; connected first person; 19 ArrowLeft + 16 ArrowUp from default view",
  screenshot: "desktop-connected-line.png",
  requiresVisualReview: true,
};
try {
  await page.goto(route, { waitUntil: "domcontentloaded" });
  await page.waitForFunction(
    () => document.querySelector("canvas")?.dataset.ready === "true",
    null,
    { timeout: 120000 },
  );
  await page.getByRole("slider", { name: "Instante da simulação" }).evaluate((input) => {
    Object.getOwnPropertyDescriptor(HTMLInputElement.prototype, "value").set.call(input, "9");
    input.dispatchEvent(new Event("input", { bubbles: true }));
    input.dispatchEvent(new Event("change", { bubbles: true }));
  });
  await page.waitForFunction(() => document.querySelector("canvas")?.dataset.time === "9");
  const before = await page.locator("canvas").evaluate((canvas) => ({ ...canvas.dataset }));
  const quantities = await page.locator(".silo-data-pair").textContent();
  await page.getByRole("button", { name: "Técnico A — primeira pessoa", exact: true }).click();
  await page.locator("canvas").focus();
  for (let i = 0; i < 19; i++) await page.keyboard.press("ArrowLeft");
  for (let i = 0; i < 16; i++) await page.keyboard.press("ArrowUp");
  await page.waitForTimeout(400);
  const after = await page.locator("canvas").evaluate((canvas) => ({ ...canvas.dataset }));
  assert.equal(after.camera, "connected");
  assert.equal(after.time, before.time);
  assert.equal(after.status, "paused");
  assert.equal(await page.locator(".silo-data-pair").textContent(), quantities);
  assert.ok(
    await page.getByRole("button", { name: "Sair da primeira pessoa", exact: true }).isVisible(),
  );
  assert.deepEqual(errors, []);
  await page.screenshot({ path: path.join(output, report.screenshot) });
  report.result = "passed";
  report.domainUnchanged = true;
  report.snapshot = after;
  report.errors = errors;
  const validationPath = path.join(output, "validation.md");
  const validation = await readFile(validationPath, "utf8");
  const note =
    "\n\n## Inspeção interna da linha de A\n\nO script `validate-connected-line.mjs` confirma em t=9 pausado que olhar para trás e acima mantém domínio, HUD e saída acessível. A captura adicional [desktop-connected-line.png](./desktop-connected-line.png) preserva também a captura interna padrão do relatório principal. Esta verificação não mede desempenho; a visibilidade da linha/dispositivo requer inspeção visual da imagem.\n";
  await writeFile(validationPath, validation.trimEnd() + note);
  console.log(
    "PASS Connected first-person over-shoulder inspection preserves paused domain and controls",
  );
} catch (error) {
  report.result = "failed";
  report.error = String(error.stack ?? error);
  process.exitCode = 1;
} finally {
  await writeFile(path.join(output, "camera-inspection.json"), JSON.stringify(report, null, 2));
  await browser.close();
}
