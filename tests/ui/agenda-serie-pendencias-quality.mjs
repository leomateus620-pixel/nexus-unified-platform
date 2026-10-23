// Actual Agenda recurrence observability UI with synthetic DTO-only transport.
import { chromium, expect } from "@playwright/test";
import { mkdir, writeFile } from "node:fs/promises";
import { evidenceRoot } from "./evidence.mjs";
const base = process.env.NEXUS_UI_URL || "http://127.0.0.1:4209";
const directory = `${evidenceRoot}/agenda-serie-pendencias`;
await mkdir(directory, { recursive: true });
const browser = await chromium.launch({ headless: true });
const page = await browser.newPage({
  locale: "pt-BR",
  reducedMotion: "reduce",
});
page.setDefaultTimeout(10000);
page.setDefaultNavigationTimeout(60000);
const report = {
  method:
    "Actual source and synthetic DTO-only transport. Not SQL materialization, connected Auth/RLS, jobs, production persistence or physical-device evidence.",
  layouts: [],
  checks: [],
  errors: [],
  consoleErrors: [],
  success: false,
};
page.on("pageerror", (e) => report.errors.push(e.message));
page.on("console", (m) => {
  if (m.type() === "error") report.consoleErrors.push(m.text());
});
const event = "a6000000-0000-4000-8000-000000000001";
const region = page.getByRole("region", {
  name: "Ocorrências da série",
  exact: true,
});
async function go() {
  await page.goto(`${base}/?page=agenda-equipe&data=2026-11-10&vista=lista&evento=${event}`, {
    waitUntil: "networkidle",
  });
  await page.getByRole("button", { name: "Repetir compromisso", exact: true }).click();
  await page.getByRole("dialog").getByLabel("Quantidade de ocorrências", { exact: true }).fill("3");
  await page
    .getByRole("dialog")
    .getByRole("button", { name: "Repetir compromisso", exact: true })
    .click();
  await expect(page.getByRole("dialog")).toHaveCount(0);
  await expect(region.getByText("Ocorrências a conferir", { exact: true })).toBeVisible();
  await expect(region.getByRole("listitem")).toHaveCount(2);
}
async function check(name, work) {
  await work();
  report.checks.push({ name, pass: true });
  console.log("PASS: " + name);
}
async function calls(name) {
  return page.evaluate(
    (key) => window.__nexusCalls.filter((c) => c.name === key).map((c) => c.payload.data),
    name,
  );
}
try {
  for (const width of [360, 390, 768, 1024, 1366, 1440]) {
    await page.setViewportSize({ width, height: width < 768 ? 844 : 900 });
    await go();
    await expect(region.getByRole("listitem").filter({ hasText: "23P01" })).toContainText(
      "17/11/2026 · Bloqueada",
    );
    await expect(
      region.getByRole("listitem").filter({ hasText: "HORARIO_CIVIL_INEXISTENTE" }),
    ).toContainText("24/11/2026 · Pulada");
    const metrics = await page.evaluate(() => ({
      width: innerWidth,
      scrollWidth: document.documentElement.scrollWidth,
    }));
    expect(metrics.scrollWidth).toBeLessThanOrEqual(width);
    report.layouts.push(metrics);
    if ([390, 1366].includes(width)) {
      await region.scrollIntoViewIfNeeded();
      await page.screenshot({ path: `${directory}/ocorrencias-${width}.png` });
    }
  }
  await check(
    "blocked date/code/reason differs from skipped DST occurrence and series backlog",
    async () => {
      await expect(region.getByText(/Há processamento da série ainda pendente/)).toBeVisible();
      await expect(region.getByRole("listitem").filter({ hasText: "23P01" })).toContainText(
        "Conflito de período, pessoa ou ferramenta",
      );
      await expect(
        region.getByRole("listitem").filter({ hasText: "HORARIO_CIVIL_INEXISTENTE" }),
      ).toContainText("Esta ocorrência foi pulada");
      await expect(
        region.getByRole("combobox", { name: "Versão da série", exact: true }),
      ).toContainText("Atual");
    },
  );
  await check(
    "existing authorized reprocess command sends series version and refreshes observability",
    async () => {
      await page.getByRole("button", { name: "Reprocessar pendências", exact: true }).click();
      await expect
        .poll(async () => (await calls("executarAgenda")).at(-1)?.comando)
        .toBe("reprocessar_serie");
      const last = (await calls("executarAgenda")).at(-1);
      expect(last.dados.expected_version).toBe(1);
      expect(last.dados.serie_id).toBeTruthy();
      await expect
        .poll(async () => (await calls("listarPendenciasSerieAgenda")).length)
        .toBeGreaterThan(1);
      await expect(region.getByRole("listitem")).toHaveCount(2);
    },
  );
  await check(
    "current denial of series observability removes cached rows and private detail",
    async () => {
      await page.evaluate(() => {
        window.__agendaDeniedName = "listarPendenciasSerieAgenda";
        window.dispatchEvent(new Event("visibilitychange"));
      });
      await expect(
        page
          .getByRole("alert")
          .filter({
            hasText: "Atividade da agenda indisponível para seu acesso atual.",
          })
          .first(),
      ).toBeVisible();
      await expect(region).toHaveCount(0);
      await expect(
        page.getByRole("button", { name: "Editar compromisso", exact: true }),
      ).toHaveCount(0);
    },
  );
  await check("a reduced pending total on page two keeps a usable return to page one", async () => {
    await go();
    await page.evaluate(() => {
      window.__agendaSeriesMany = true;
      window.dispatchEvent(new Event("visibilitychange"));
    });
    await expect(region.getByRole("listitem")).toHaveCount(25);
    await region.getByRole("button", { name: "Próximas ocorrências", exact: true }).click();
    await expect(region.getByRole("listitem")).toHaveCount(5);
    await page.evaluate(() => {
      window.__agendaSeriesShrunk = true;
      window.dispatchEvent(new Event("visibilitychange"));
    });
    await expect(
      region.getByText("Nenhum registro nesta página; retorne à anterior.", { exact: true }),
    ).toBeVisible();
    const back = region.getByRole("button", { name: "Ocorrências anteriores", exact: true });
    await expect(back).toBeEnabled();
    await back.click();
    await expect(region.getByRole("listitem")).toHaveCount(1);
    expect((await calls("listarPendenciasSerieAgenda")).at(-1).pagina).toBe(0);
  });
  expect(report.errors).toEqual([]);
  expect(report.consoleErrors).toEqual([]);
  report.success = true;
} catch (error) {
  report.failure = String(error);
  await page.screenshot({ path: `${directory}/failure.png` });
  throw error;
} finally {
  await writeFile(`${directory}/results.json`, JSON.stringify(report, null, 2) + "\n");
  await browser.close();
}
