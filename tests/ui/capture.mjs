import { chromium } from "@playwright/test";
import { mkdir, readFile, writeFile } from "node:fs/promises";
import path from "node:path";
import os from "node:os";
import { evidenceRoot } from "./evidence.mjs";

const label = process.argv[2] || "after";
const catalog = label.startsWith("catalog-") || label.startsWith("revision-");
const base = process.env.NEXUS_UI_URL || `http://127.0.0.1:${label === "before" ? 4181 : 4182}`;
const output = path.resolve(`${evidenceRoot}/${label}`);
await mkdir(output, { recursive: true });
const phase = process.env.NEXUS_UI_PHASE || "all";
const previous =
  phase === "all" ? {} : JSON.parse(await readFile(path.join(output, "results.json"), "utf8"));
const browser = await chromium.launch({
  headless: true,
  ...(process.env.NEXUS_UI_CHROMIUM ? { executablePath: process.env.NEXUS_UI_CHROMIUM } : {}),
});
const context = await browser.newContext({
  viewport: { width: 1366, height: 768 },
  locale: "pt-BR",
  reducedMotion: "reduce",
});
// Fail closed: only the local harness and the application's existing font hosts can load.
const blocked = [];
await context.route("**/*", async (route) => {
  const url = new URL(route.request().url());
  if (["127.0.0.1", "fonts.googleapis.com", "fonts.gstatic.com"].includes(url.hostname))
    await route.continue();
  else {
    blocked.push(`${url.origin}${url.pathname}`);
    await route.abort();
  }
});
const page = await context.newPage();
const errors = [];
page.on("pageerror", (error) => errors.push(error.message));
page.on("dialog", (dialog) => dialog.dismiss());
const report = {
  ...previous,
  failure: undefined,
  label,
  base,
  date: new Date().toISOString(),
  browser: browser.version(),
  machine: {
    platform: os.platform(),
    release: os.release(),
    cpus: os.cpus()[0]?.model,
    logicalCpus: os.cpus().length,
  },
  methodology:
    "Synthetic presentation-only fixtures; actual source components/hooks/handlers. Browser events to second requestAnimationFrame (conservative local paint proxy, not server time). No CPU throttle. Five observations including the first interaction per count/action, 1366×768. Physical keyboard/zoom/mobile device unavailable. No production backend reachable.",
  blocked,
  errors,
  viewports: phase === "performance" ? previous.viewports : [],
  scenarios: phase === "performance" ? previous.scenarios : [],
  performance: phase === "visual" ? previous.performance : [],
  systemPerformance: phase === "visual" ? previous.systemPerformance : [],
  passes: [...(previous.passes || []), { phase, at: new Date().toISOString() }],
};
process.on("uncaughtException", async (error) => {
  report.failure = error.message;
  await writeFile(path.join(output, "results.json"), JSON.stringify(report, null, 2));
  console.error(error);
  await browser.close();
  process.exit(1);
});
async function go(screen, scenario = "normal", count = 17) {
  await page.goto(`${base}/?page=${screen}&scenario=${scenario}&count=${count}`, {
    waitUntil: "networkidle",
  });
  await page.waitForFunction(() => document.body.innerText.trim().length > 0, { timeout: 15000 });
  await page.evaluate(() => document.fonts.ready);
  await page.waitForTimeout(150);
  await page.evaluate(() => {
    window.__uiLayoutShifts = [];
    const observer = new PerformanceObserver((list) => {
      window.__uiLayoutShifts.push(
        ...list.getEntries().map((entry) => ({
          value: entry.value,
          startTime: entry.startTime,
          hadRecentInput: entry.hadRecentInput,
        })),
      );
    });
    observer.observe({ type: "layout-shift", buffered: false });
  });
  const text = await page.locator("body").innerText();
  if (!text.trim()) throw new Error(`Empty render: ${screen}/${scenario}: ${errors.join("; ")}`);
  return text;
}
async function metrics() {
  return page.evaluate(() => ({
    viewport: innerWidth,
    pageWidth: document.documentElement.scrollWidth,
    overflow: document.documentElement.scrollWidth > innerWidth + 1,
    headings: [...document.querySelectorAll("h1,h2")].map((e) => e.textContent),
    rows: document.querySelectorAll("tbody tr").length,
    firstObjectTop:
      document.querySelector(".nx-object-card, .nx-commercial-row")?.getBoundingClientRect().top ??
      null,
    objectCount: document.querySelectorAll(".nx-object-card, .nx-commercial-row").length,
    unnamedInputs: [...document.querySelectorAll("input,textarea,select")]
      .filter(
        (e) =>
          !e.getAttribute("aria-label") &&
          !e.getAttribute("aria-labelledby") &&
          !e.closest("label") &&
          !(e.id && document.querySelector(`label[for="${e.id}"]`)),
      )
      .map((e) => ({ tag: e.tagName, type: e.type, placeholder: e.getAttribute("placeholder") })),
    opaqueHeader: [...document.querySelectorAll("header")].map((e) => ({
      background: getComputedStyle(e).backgroundColor,
      backdrop: getComputedStyle(e).backdropFilter,
    })),
  }));
}
const screens = [
  "list",
  "dimensionamento",
  "itens-comerciais",
  "orcamento",
  "compras",
  "producao",
  "resumo-executivo",
  "parametros",
  "historico",
  "oc",
  "op",
];
if (phase !== "performance") {
  for (const width of [320, 360, 390, 768, 1024, 1366, 1440, 1920]) {
    await page.setViewportSize({ width, height: width <= 390 ? 844 : 768 });
    for (const screen of screens) {
      await go(screen);
      report.viewports.push({ screen, width, ...(await metrics()) });
      if (
        [390, 1366].includes(width) &&
        [
          "list",
          "dimensionamento",
          "itens-comerciais",
          "orcamento",
          "resumo-executivo",
          "compras",
          "producao",
          "parametros",
          "historico",
          "oc",
          "op",
        ].includes(screen)
      ) {
        await page.screenshot({
          path: path.join(output, `${screen}-${width}.png`),
          fullPage: true,
        });
        await page.screenshot({
          path: path.join(output, `${screen}-${width}-viewport.png`),
          fullPage: false,
        });
      }
    }
    await writeFile(path.join(output, "results.json"), JSON.stringify(report, null, 2));
    console.log(`${label}: ${width}px checked across ${screens.length} screens`);
  }
  await page.setViewportSize({ width: 1366, height: 768 });
  const states = [
    ["dimensionamento", "pending"],
    ["dimensionamento", "empty"],
    ["dimensionamento", "readonly"],
    ["dimensionamento", "error"],
    ["dimensionamento", "conflict"],
    ["itens-comerciais", "restricted"],
    ["itens-comerciais", "readonly"],
    ["itens-comerciais", "empty"],
    ["orcamento", "pending"],
    ["orcamento", "unavailable"],
    ["oc", "issued"],
    ["op", "issued"],
  ];
  for (const [screen, scenario] of states) {
    const text = await go(screen, scenario);
    report.scenarios.push({ screen, scenario, text, ...(await metrics()) });
    await page.screenshot({ path: path.join(output, `${screen}-${scenario}.png`), fullPage: true });
  }
  for (const width of [390, 1366]) {
    await page.setViewportSize({ width, height: 768 });
    await go("dimensionamento");
    await page
      .getByRole("button", { name: /composição/i })
      .first()
      .click();
    await page.screenshot({
      path: path.join(output, `dimensionamento-composition-${width}.png`),
      fullPage: true,
    });
    await go("itens-comerciais");
    await page
      .getByRole("button", { name: /COMP-001/ })
      .first()
      .click();
    await page.screenshot({
      path: path.join(output, `itens-selected-${width}.png`),
      fullPage: true,
    });
  }
}
await page.setViewportSize({ width: 1366, height: 768 });
async function eventTiming(action) {
  return page.evaluate(async (action) => {
    const start = performance.now();
    if (action === "input") {
      const input =
        document.querySelector(
          'input[aria-label="Buscar"],input[aria-label="Buscar componentes"]',
        ) ||
        [...document.querySelectorAll("input")].find((e) =>
          e.closest("label")?.textContent.includes("Buscar item"),
        );
      if (!input) throw new Error("Search input missing");
      const next = input.value === "COMP" ? "" : "COMP";
      Object.getOwnPropertyDescriptor(HTMLInputElement.prototype, "value").set.call(input, next);
      input.dispatchEvent(new Event("input", { bubbles: true }));
    } else if (action === "selection") {
      document.querySelector('input[aria-label^="Selecionar COMP-"]').click();
    } else if (action === "panel") {
      [...document.querySelectorAll("button")]
        .find((e) => (e.getAttribute("aria-label") || e.textContent).includes("COMP-001"))
        .click();
    } else if (action === "scroll") {
      const region = [...document.querySelectorAll("div")].find(
        (e) => e.scrollHeight > e.clientHeight + 50 && getComputedStyle(e).overflowY === "auto",
      );
      if (region) region.scrollTop = region.scrollTop === 0 ? 500 : 0;
      else window.scrollTo(0, window.scrollY === 0 ? 500 : 0);
    }
    await new Promise((resolve) => requestAnimationFrame(() => requestAnimationFrame(resolve)));
    return {
      ms: performance.now() - start,
      nodes: document.querySelectorAll("*").length,
      width: document.documentElement.scrollWidth,
      layoutShiftIncludingRecentInput: window.__uiLayoutShifts
        .filter((entry) => entry.startTime >= start)
        .reduce((sum, entry) => sum + entry.value, 0),
    };
  }, action);
}
if (phase !== "visual") {
  for (const count of [17, 100, 500]) {
    for (const action of ["input", "selection", "panel", "scroll"]) {
      await go("itens-comerciais", "normal", count);
      const samples = [];
      for (let i = 0; i < 5; i++) {
        if (action === "panel" && i > 0) {
          const close = page.getByRole("button", {
            name: /Fechar.*(inspetor|detalhe|painel|item comercial)/i,
          });
          if (await close.count()) await close.first().click();
          else
            await page
              .getByRole("button", { name: /COMP-002/ })
              .first()
              .click();
        }
        samples.push(await eventTiming(action));
      }
      const times = samples.map((s) => s.ms).sort((a, b) => a - b);
      report.performance.push({
        count,
        componentCount: count === 17 ? 21 : count,
        action,
        medianMs: times[2],
        maxMs: times[4],
        samples,
      });
    }
    console.log(`${label}: local interaction timings ${count} records`);
  }
  for (const count of [17, 100, 500]) {
    for (const action of ["typing", "composition", "scroll"]) {
      await go("dimensionamento", "normal", count);
      if (catalog && action === "typing")
        await page.getByRole("button", { name: "Editar sistema 1", exact: true }).click();
      const samples = [];
      for (let i = 0; i < 5; i++) {
        if (action === "composition" && i > 0)
          await page
            .getByRole("button", { name: /Fechar.*(inspetor|detalhe|painel|composição)/i })
            .first()
            .click();
        samples.push(
          await page.evaluate(async (action) => {
            const start = performance.now();
            if (action === "typing") {
              const input = document.querySelector(
                'input[aria-label="Identificação do sistema 1"]',
              );
              Object.getOwnPropertyDescriptor(HTMLInputElement.prototype, "value").set.call(
                input,
                input.value + "a",
              );
              input.dispatchEvent(new Event("input", { bubbles: true }));
            } else if (action === "composition")
              [...document.querySelectorAll("button")]
                .find((e) => /composição/i.test(e.textContent))
                .click();
            else window.scrollTo(0, window.scrollY === 0 ? 500 : 0);
            await new Promise((resolve) =>
              requestAnimationFrame(() => requestAnimationFrame(resolve)),
            );
            return { ms: performance.now() - start, nodes: document.querySelectorAll("*").length };
          }, action),
        );
      }
      const times = samples.map((s) => s.ms).sort((a, b) => a - b);
      report.systemPerformance.push({
        count,
        action,
        medianMs: times[2],
        maxMs: times[4],
        samples,
      });
    }
  }
}
if (phase !== "performance") {
  await go("dimensionamento");
  if (catalog) await page.getByRole("button", { name: "Editar sistema 1", exact: true }).click();
  await page
    .getByLabel("Identificação do sistema 1", { exact: true })
    .first()
    .fill("Identificação editada no teste");
  await page
    .getByLabel(/^Metragem/)
    .first()
    .click();
  await page.waitForTimeout(800);
  report.editPayload = await page.evaluate(() => window.__nexusCalls);
  await page.keyboard.press("Escape");
  await page.locator("summary").filter({ hasText: "Colar sistemas" }).click();
  await page.locator("textarea").fill("Setor colado\tOVERHEAD\t120\t4");
  if (catalog) {
    await page.getByRole("button", { name: "Preparar prévia" }).click();
    await page.getByRole("button", { name: "Confirmar inserção" }).click();
  } else await page.getByRole("button", { name: "Validar e inserir" }).click();
  await page.waitForTimeout(800);
  report.pastePayload = await page.evaluate(() => window.__nexusCalls);
  await go("resumo-executivo");
  const internal = page.getByRole("button", { name: "Ver visão interna" });
  if (await internal.count()) {
    await internal.click();
    report.internalSummary = await page.locator("body").innerText();
    await page.screenshot({ path: path.join(output, "resumo-interno.png"), fullPage: true });
  }
  await go("itens-comerciais");
  await page.keyboard.press("Tab");
  report.keyboardFirstFocus = await page.evaluate(() => ({
    tag: document.activeElement.tagName,
    text: document.activeElement.textContent,
    label: document.activeElement.getAttribute("aria-label"),
    outline: getComputedStyle(document.activeElement).outline,
  }));
  // A 2× text zoom via CSS is not a claim of physical browser/device zoom.
  await page.evaluate(() => {
    document.documentElement.style.zoom = "2";
  });
  report.zoom200 = await metrics();
  await page.screenshot({ path: path.join(output, "itens-zoom200.png"), fullPage: true });
  await page.evaluate(() => {
    document.documentElement.style.zoom = "";
  });
  await page.setViewportSize({ width: 390, height: 420 });
  await go("dimensionamento");
  if (catalog) await page.getByRole("button", { name: "Editar sistema 1", exact: true }).click();
  await page.getByLabel("Identificação do sistema 1", { exact: true }).first().focus();
  report.keyboardViewportProxy = await metrics();
  await page.screenshot({
    path: path.join(output, "dimensionamento-keyboard-viewport.png"),
    fullPage: true,
  });
}
report.assertions = {
  viewportMatrixComplete: report.viewports.length === 88,
  scenariosComplete: report.scenarios.length === 12,
  noBrowserErrors: errors.length === 0,
  noExternalApplicationRequests: blocked.every((url) =>
    /^(gc|me)\.kis\.v2\.scr\.kaspersky-labs\.com$/.test(new URL(url).hostname),
  ),
  noPageOverflow: report.viewports.every((v) => !v.overflow),
  editUsesOriginalPatch: report.editPayload.some(
    (call) =>
      call.table === "sistemas_dimensionados" &&
      call.mutation === "update" &&
      call.payload.identificacao === "Identificação editada no teste",
  ),
  pasteUsesOriginalInsert: report.pastePayload.some(
    (call) =>
      call.table === "sistemas_dimensionados" &&
      ["insert", "upsert"].includes(call.mutation) &&
      call.payload[0]?.identificacao === "Setor colado" &&
      call.payload[0]?.metragem === 120 &&
      call.payload[0]?.trechos === 4,
  ),
};
await writeFile(path.join(output, "results.json"), JSON.stringify(report, null, 2));
await browser.close();
if (label.endsWith("-after") && Object.values(report.assertions).some((pass) => !pass))
  process.exitCode = 1;
console.log(
  JSON.stringify(
    {
      label,
      errors,
      overflowCount: report.viewports.filter((v) => v.overflow).length,
      performance: report.performance.map(({ count, action, medianMs, maxMs }) => ({
        count,
        action,
        medianMs,
        maxMs,
      })),
    },
    null,
    2,
  ),
);
