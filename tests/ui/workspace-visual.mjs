import assert from "node:assert/strict";
import { chromium, expect } from "@playwright/test";
import { mkdir, writeFile } from "node:fs/promises";
import { evidenceRoot } from "./evidence.mjs";

const phase = process.argv[2] || "after";
const base = process.env.NEXUS_UI_URL || "http://127.0.0.1:4182";
const output = `${evidenceRoot}/workspace-${phase}`;
await mkdir(output, { recursive: true });
const browser = await chromium.launch({ headless: true });
const page = await browser.newPage({ locale: "pt-BR", reducedMotion: "reduce" });
await page.route("**/*", (route) =>
  ["127.0.0.1", "fonts.googleapis.com", "fonts.gstatic.com"].includes(
    new URL(route.request().url()).hostname,
  )
    ? route.continue()
    : route.abort(),
);
const errors = [];
page.on("pageerror", (e) => errors.push(e.message));
const screens = [
  "itens-comerciais",
  "dimensionamento",
  "orcamento",
  "compras",
  "producao",
  "resumo-executivo",
  "parametros",
  "historico",
];
const report = {
  phase,
  boundary:
    "Real components with isolated test fixtures; no production writes or authenticated/device claim",
  errors,
  views: [],
};
try {
  for (const width of [320, 390, 1366, 1920]) {
    await page.setViewportSize({ width, height: width < 500 ? 844 : 768 });
    for (const screen of screens) {
      await page.goto(`${base}/?page=${screen}&count=5`, { waitUntil: "networkidle" });
      await page.locator("h1").waitFor();
      if (phase === "after") {
        const ready = {
          "itens-comerciais": ".nx-product-card",
          dimensionamento: ".nx-system-card",
          orcamento: ".nx-budget-equation",
          compras: ".nx-planning-row",
          producao: ".nx-planning-row",
          "resumo-executivo": ".nx-document-paper",
          parametros: ".nx-parameter-category",
          historico: ".nx-save-event-card",
        };
        await page.locator(ready[screen]).first().waitFor();
      }
      await page.evaluate(() => document.fonts.ready);
      const metrics = await page.evaluate(() => ({
        overflow: document.documentElement.scrollWidth > innerWidth + 1,
        headerHeight: document.querySelector(".nx-proposal-header").getBoundingClientRect().height,
        firstCardTop: document.querySelector(".nx-object-card")?.getBoundingClientRect().top,
        firstCardHeight: document.querySelector(".nx-object-card")?.getBoundingClientRect().height,
        totalFits: [...document.querySelectorAll(".nx-context-total p")].every(
          (e) => e.scrollWidth <= e.clientWidth + 1,
        ),
        total: document.querySelector(".nx-context-total p")?.textContent,
      }));
      report.views.push({ screen, width, ...metrics });
      if (phase === "after") {
        assert.equal(metrics.overflow, false, `${screen}/${width} page overflow`);
        assert.equal(metrics.totalFits, true, `${screen}/${width} monetary fit`);
        assert.equal(await page.locator(".nx-step").count(), 8);
        assert.equal(
          await page.getByRole("button", { name: "Salvar proposta", exact: true }).count(),
          0,
        );
        if (width === 1366 && ["itens-comerciais", "dimensionamento"].includes(screen))
          assert.ok(metrics.firstCardTop < 480, `${screen}: first content visible on notebook`);
      }
      if ([390, 1366].includes(width))
        await page.screenshot({ path: `${output}/${screen}-${width}.png` });
    }
  }
  if (phase === "after") {
    for (const screen of ["compras", "producao", "historico"]) {
      await page.goto(`${base}/?page=${screen}&scenario=empty`, { waitUntil: "networkidle" });
      await page.screenshot({ path: `${output}/${screen}-empty.png` });
    }
    await page.goto(`${base}/?page=parametros`, { waitUntil: "networkidle" });
    await page.getByRole("button", { name: /Equipe e produtividade/ }).click();
    await expect(page.getByRole("button", { name: "Voltar às categorias" })).toBeVisible();
    await page.screenshot({ path: `${output}/parametros-focused.png` });
    await page.setViewportSize({ width: 390, height: 844 });
    await page.goto(`${base}/?page=resumo-executivo`, { waitUntil: "networkidle" });
    await page.getByRole("button", { name: "Editar textos", exact: true }).click();
    await expect(page.locator(".nx-document-paper")).toBeHidden();
    await page.screenshot({ path: `${output}/resumo-textos-focused-390.png` });
  }
  assert.deepEqual(errors, []);
} finally {
  await writeFile(`${output}/metrics.json`, JSON.stringify(report, null, 2));
  await browser.close();
}
console.log(
  JSON.stringify(
    {
      phase,
      views: report.views.length,
      errors,
      overflows: report.views.filter((v) => v.overflow),
    },
    null,
    2,
  ),
);
