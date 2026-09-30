import assert from "node:assert/strict";
import { mkdir, writeFile } from "node:fs/promises";
import { chromium, expect } from "@playwright/test";
import { evidenceRoot } from "./evidence.mjs";

const base = process.env.NEXUS_UI_URL || "http://127.0.0.1:4182";
const output = `${evidenceRoot}/catalog-after`;
await mkdir(output, { recursive: true });
const browser = await chromium.launch({
  headless: true,
  ...(process.env.NEXUS_UI_CHROMIUM ? { executablePath: process.env.NEXUS_UI_CHROMIUM } : {}),
});
const page = await browser.newPage({ reducedMotion: "reduce", locale: "pt-BR" });
const errors = [],
  checks = [];
page.on("pageerror", (e) => errors.push(e.message));
await page.route("**/*", (route) =>
  ["127.0.0.1", "fonts.googleapis.com", "fonts.gstatic.com"].includes(
    new URL(route.request().url()).hostname,
  )
    ? route.continue()
    : route.abort(),
);
const go = async (scenario = "normal") => {
  await page.goto(`${base}/?page=dimensionamento&scenario=${scenario}&count=17`, {
    waitUntil: "networkidle",
  });
  await page.locator("h1").waitFor();
};
try {
  for (const width of [320, 390, 1024, 1366, 1920]) {
    await page.setViewportSize({ width, height: width <= 390 ? 844 : 768 });
    await go();
    assert.equal(await page.locator(".nx-system-card").count(), 17);
    assert.equal(
      await page.getByRole("button", { name: "Recalcular agora", exact: true }).count(),
      0,
    );
    assert.ok(
      await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth + 1),
      `page fits at ${width}`,
    );
    const trigger = page.getByRole("button", { name: "Editar sistema 1", exact: true });
    await trigger.focus();
    await page.keyboard.press("Enter");
    assert.equal(
      await page.getByLabel("Metragem do sistema 1", { exact: true }).count(),
      1,
      "single editable copy",
    );
    assert.ok(
      await page
        .locator("dialog.nx-editor-inspector")
        .evaluate((e) => e.contains(document.activeElement)),
    );
    const editor = page.locator("dialog.nx-editor-inspector");
    assert.ok(await editor.evaluate((e) => e.getBoundingClientRect().width <= innerWidth + 1));
    await page.keyboard.press("Escape");
    await expect(trigger).toBeFocused();
    if ([390, 1366].includes(width))
      await page.screenshot({
        path: `${output}/dimensionamento-compact-${width}.png`,
        fullPage: true,
      });
    checks.push({ width, overflow: false, singleEditor: true, keyboardReturn: true });
  }
  await page.setViewportSize({ width: 1366, height: 768 });
  await go("revision-edge");
  const first = page.locator(".nx-system-card").nth(0);
  assert.match(await first.innerText(), /#1 · system-0/);
  assert.match(await first.innerText(), /Cálculo pendente/);
  assert.match(await first.innerText(), /extensão registrada zero/);
  assert.equal(await first.getByText("Medidas calculadas", { exact: true }).count(), 0);
  assert.match(await page.locator(".nx-system-card").nth(2).innerText(), /Entrada inválida/);
  const second = page.locator(".nx-system-card").nth(1);
  assert.match(await second.innerText(), /#2 · system-1/);
  assert.match(await second.innerText(), /Medidas calculadas/);
  checks.push({
    name: "same-name systems have exact identities; zero, invalid and valid have distinct states",
    pass: true,
  });
  await page.screenshot({ path: `${output}/dimensionamento-estado-zero.png`, fullPage: true });
  await go("pending");
  assert.match(
    await page.locator(".nx-system-card").first().innerText(),
    /Resultado desatualizado/,
  );
  checks.push({ name: "stale calculation is not presented as valid", pass: true });
  await go("readonly");
  await page.getByRole("button", { name: "Consultar sistema 1", exact: true }).click();
  assert.ok(
    await page
      .locator("dialog.nx-editor-inspector input, dialog.nx-editor-inspector select")
      .evaluateAll((els) => els.length > 0 && els.every((e) => e.disabled)),
  );
  assert.equal(
    await page.getByRole("button", { name: "Adicionar sistema", exact: true }).count(),
    0,
  );
  checks.push({ name: "issued revision has disabled editor and no creation action", pass: true });
  await go("empty");
  assert.equal(await page.getByText("Nenhum sistema dimensionado", { exact: true }).count(), 1);
  assert.equal(
    await page.getByRole("button", { name: "Adicionar sistema", exact: true }).count(),
    1,
  );
  assert.deepEqual(await page.evaluate(() => window.__nexusCalls), []);
  checks.push({
    name: "empty state keeps real creation action and performs no writes",
    pass: true,
  });
  assert.deepEqual(errors, []);
} finally {
  await writeFile(
    `${output}/dimension-final-checks.json`,
    JSON.stringify(
      {
        at: new Date().toISOString(),
        checks,
        errors,
        environment: "isolated UI boundaries, no production reads or writes",
      },
      null,
      2,
    ),
  );
  await browser.close();
}
console.log(JSON.stringify(checks, null, 2));
