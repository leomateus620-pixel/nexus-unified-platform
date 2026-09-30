import { chromium, expect } from "@playwright/test";
import { mkdir, writeFile } from "node:fs/promises";
import { evidenceRoot } from "./evidence.mjs";
const output = `${evidenceRoot}/catalog-after`;
await mkdir(output, { recursive: true });

const browser = await chromium.launch({
  headless: true,
  ...(process.env.NEXUS_UI_CHROMIUM ? { executablePath: process.env.NEXUS_UI_CHROMIUM } : {}),
});
const page = await browser.newPage({
  viewport: { width: 390, height: 844 },
  reducedMotion: "reduce",
  locale: "pt-BR",
});
await page.route("**/*", (route) =>
  ["127.0.0.1", "fonts.googleapis.com", "fonts.gstatic.com"].includes(
    new URL(route.request().url()).hostname,
  )
    ? route.continue()
    : route.abort(),
);
const errors = [],
  dialogs = [];
page.on("pageerror", (error) => errors.push(error.message));
page.on("dialog", (dialog) => {
  dialogs.push({ type: dialog.type(), message: dialog.message() });
  dialog.dismiss();
});
const report = { date: new Date().toISOString(), errors, dialogs, checks: [] };
const base = process.env.NEXUS_UI_URL || "http://127.0.0.1:4182";
async function go(screen = "itens-comerciais", scenario = "normal") {
  await page.goto(`${base}/?page=${screen}&scenario=${scenario}`, {
    waitUntil: "networkidle",
  });
  await page.getByRole("heading", { level: 1 }).waitFor();
}
await go();
const batchItem = page.getByRole("checkbox", { name: "Selecionar COMP-001 para edição em lote" });
report.checks.push({
  name: "mobile batch selection is visible",
  pass: await batchItem.isVisible(),
});
await batchItem.check();
report.checks.push({
  name: "mobile batch selection selects only its item without changing budget inclusion",
  pass: await page
    .locator('input[type="checkbox"][aria-label^="Selecionar COMP-"]')
    .evaluateAll((els) => els.length === 21 && els.filter((e) => e.checked).length === 1),
});
await batchItem.uncheck();
expect(await page.evaluate(() => window.__nexusCalls)).toHaveLength(0);
await expect(page.getByPlaceholder("Código, descrição ou fabricante")).toHaveCount(0);
const searchTrigger = page.getByRole("button", { name: "Buscar itens", exact: true });
await searchTrigger.click();
await expect(page.getByPlaceholder("Código, descrição ou fabricante")).toBeFocused();
await page.keyboard.press("Escape");
await expect(page.getByPlaceholder("Código, descrição ou fabricante")).toHaveCount(0);
const modalityTrigger = page.getByRole("button", { name: "Filtrar modalidade", exact: true });
await modalityTrigger.click();
await expect(page.getByRole("combobox", { name: "Modalidade", exact: true })).toBeFocused();
await page.keyboard.press("Escape");
report.checks.push({
  name: "collapsed search and modality controls open explicitly and move focus",
  pass: true,
});
report.checks.push({
  name: "search and modality touch targets are at least 44px",
  pass: await page.locator(".nx-item-toolbar .nx-editor-icon").evaluateAll((els) =>
    els.every((e) => {
      const r = e.getBoundingClientRect();
      return r.width >= 44 && r.height >= 44;
    }),
  ),
});
report.contrast = await page.evaluate(() => {
  const scope = document.querySelector(".nexus-operational");
  const style = getComputedStyle(scope);
  const canvas = document.createElement("canvas");
  canvas.width = canvas.height = 1;
  const ctx = canvas.getContext("2d", { willReadFrequently: true });
  const rgb = (token) => {
    ctx.fillStyle = style.getPropertyValue(token);
    ctx.fillRect(0, 0, 1, 1);
    return [...ctx.getImageData(0, 0, 1, 1).data].slice(0, 3);
  };
  const lum = (a) =>
    a
      .map((v) => v / 255)
      .map((v) => (v <= 0.04045 ? v / 12.92 : ((v + 0.055) / 1.055) ** 2.4))
      .reduce((sum, v, i) => sum + v * [0.2126, 0.7152, 0.0722][i], 0);
  const pairs = [
    ["--foreground", "--background", 4.5],
    ["--foreground", "--card", 4.5],
    ["--foreground", "--popover", 4.5],
    ["--muted-foreground", "--background", 4.5],
    ["--muted-foreground", "--card", 4.5],
    ["--muted-foreground", "--popover", 4.5],
    ["--primary-foreground", "--primary", 4.5],
    ["--warning", "--nx-warning-surface", 4.5],
    ["--destructive", "--nx-error-surface", 4.5],
    ["--input", "--background", 3],
    ["--input", "--card", 3],
    ["--input", "--popover", 3],
    ["--ring", "--background", 3],
    ["--ring", "--card", 3],
    ["--nx-ink", "--nx-paper", 4.5],
    ["--nx-paper-muted", "--nx-paper", 4.5],
  ];
  return pairs.map(([foreground, background, minimum]) => {
    const a = rgb(foreground),
      b = rgb(background),
      la = lum(a),
      lb = lum(b);
    const ratio = (Math.max(la, lb) + 0.05) / (Math.min(la, lb) + 0.05);
    return { foreground, background, rgb: [a, b], ratio, minimum, pass: ratio >= minimum };
  });
});
const menu = page.getByRole("button", { name: "Abrir menu" });
await menu.click();
await page.keyboard.press("Tab");
report.checks.push({
  name: "mobile menu focus",
  pass: await page.locator(".nx-mobile-menu").evaluate((e) => e.contains(document.activeElement)),
  active: await page.evaluate(() => document.activeElement?.textContent),
});
await page.keyboard.press("Escape");
await expect(menu).toBeFocused();
report.checks.push({
  name: "mobile menu Escape returns focus",
  pass: await menu.evaluate((e) => e === document.activeElement),
});
const trigger = page.getByRole("button", { name: "Editar item COMP-001" });
await trigger.click();
const inspector = page.locator("dialog.nx-editor-inspector");
report.checks.push({
  name: "mobile inspector fits",
  ...(await inspector.evaluate((e) => ({
    pass:
      e.open &&
      e.getBoundingClientRect().width <= innerWidth &&
      e.getBoundingClientRect().height <= innerHeight,
    width: e.getBoundingClientRect().width,
    height: e.getBoundingClientRect().height,
    modal: e.matches(":modal"),
    activeInside: e.contains(document.activeElement),
  }))),
});
await page.screenshot({
  path: `${output}/inspector-mobile.png`,
  fullPage: true,
});
await page.keyboard.press("Tab");
await page.keyboard.press("Shift+Tab");
report.checks.push({
  name: "inspector keyboard focus retained",
  pass: await inspector.evaluate((e) => e.contains(document.activeElement)),
});
await page.keyboard.press("Escape");
await expect(trigger).toBeFocused();
report.checks.push({
  name: "inspector Escape returns focus",
  pass: await trigger.evaluate((e) => document.activeElement === e),
});
await page.setViewportSize({ width: 1920, height: 1080 });
await trigger.click();
const cost = page.getByLabel("Custo COMP-001");
await cost.fill("12999.2345");
await cost.evaluate((e) => {
  window.__draftNode = e;
});
await page.setViewportSize({ width: 390, height: 844 });
await page.waitForTimeout(100);
report.checks.push({
  name: "inspector resize preserves DOM and draft",
  ...(await cost.evaluate((e) => ({
    pass: e === window.__draftNode && e.value === "12999.2345",
    value: e.value,
    sameNode: e === window.__draftNode,
  }))),
});
await page.keyboard.press("Escape");
await go("dimensionamento");
await page
  .getByRole("button", { name: /Ver composição de/ })
  .first()
  .click();
await page.screenshot({
  path: `${output}/composition-mobile.png`,
  fullPage: true,
});
await page.setViewportSize({ width: 1920, height: 1080 });
await page.waitForTimeout(100);
await page.screenshot({
  path: `${output}/composition-desktop-1920.png`,
  fullPage: true,
});
report.checks.push({
  name: "wide inspector inline",
  pass: await inspector.evaluate((e) => e.open && !e.matches(":modal")),
});
await go("itens-comerciais", "restricted");
await page.getByRole("button", { name: "Editar item COMP-001" }).click();
report.checks.push({
  name: "restricted profile has no cost input",
  pass: (await page.getByLabel("Custo COMP-001").count()) === 0,
});
await go("itens-comerciais", "readonly");
await page.getByRole("button", { name: "Consultar item COMP-001" }).click();
report.checks.push({
  name: "readonly controls disabled",
  pass: await page
    .locator("dialog input, dialog select")
    .evaluateAll((els) => els.length > 0 && els.every((e) => e.disabled)),
});
report.reducedMotion = await page.evaluate(() => ({
  matches: matchMedia("(prefers-reduced-motion: reduce)").matches,
  animated: [...document.querySelectorAll("*")].filter(
    (e) =>
      getComputedStyle(e).animationName !== "none" &&
      parseFloat(getComputedStyle(e).animationDuration) > 0,
  ).length,
  transitionDurations: [
    ...new Set(
      [...document.querySelectorAll("button")].map((e) => getComputedStyle(e).transitionDuration),
    ),
  ],
}));
await page.setViewportSize({ width: 1920, height: 1080 });
await go("historico");
await page.setViewportSize({ width: 390, height: 844 });
await page.waitForTimeout(100);
report.checks.push({
  name: "current step remains visible after resize",
  ...(await page.locator('.nx-step-ruler a[aria-current="page"]').evaluate((e) => {
    const item = e.getBoundingClientRect(),
      rail = e.closest("nav").getBoundingClientRect();
    return {
      pass: item.left >= rail.left - 1 && item.right <= rail.right + 1,
      item: { left: item.left, right: item.right },
      rail: { left: rail.left, right: rail.right },
    };
  })),
});
await writeFile(`${output}/accessibility.json`, JSON.stringify(report, null, 2));
console.log(JSON.stringify(report, null, 2));
await browser.close();
if (
  report.errors.length ||
  report.checks.some((check) => check.pass === false) ||
  report.contrast.some((pair) => !pair.pass)
)
  process.exitCode = 1;
