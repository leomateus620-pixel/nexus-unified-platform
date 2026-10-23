// Source components with isolated transport. SQL persistence/RLS have their own integration tests.
import { chromium, expect } from "@playwright/test";
import { mkdir, writeFile } from "node:fs/promises";
import { evidenceRoot } from "./evidence.mjs";
const directory = `${evidenceRoot}/disponibilidade`;
await mkdir(directory, { recursive: true });
const browser = await chromium.launch({ headless: true });
const page = await browser.newPage({ locale: "pt-BR", reducedMotion: "reduce" });
page.setDefaultTimeout(10000);
const base = process.env.NEXUS_UI_URL || "http://127.0.0.1:4182";
const person = "30000000-0000-4000-8000-000000000001";
const form = page.getByRole("dialog");
const region = page.getByRole("region", { name: /^Disponibilidade de / });
const report = {
  method:
    "Source UI with local synthetic transport; not connected Auth/SQL/Storage or physical device evidence",
  layouts: [],
  checks: [],
  errors: [],
  success: false,
};
page.on("pageerror", (e) => report.errors.push(e.message));
async function go(extra = "") {
  await page.goto(`${base}/?page=equipe&pessoa=${person}${extra}`, { waitUntil: "networkidle" });
  await expect(region).toBeVisible();
}
async function open() {
  await region.getByRole("button", { name: "Registrar indisponibilidade", exact: true }).click();
}
async function fill() {
  await form.getByLabel("Início *", { exact: true }).fill("2026-11-02T09:00");
  await form.getByLabel("Fim *", { exact: true }).fill("2026-11-02T12:00");
  await form
    .getByLabel("Motivo operacional *", { exact: true })
    .fill("Atividade externa planejada");
}
async function submit() {
  await form.getByRole("button", { name: "Registrar indisponibilidade", exact: true }).click();
}
async function close() {
  await form.getByRole("button", { name: "Fechar formulário" }).click();
  const discard = form.getByRole("button", { name: "Descartar alterações" });
  if (await discard.count()) await discard.click();
  await expect(form).toHaveCount(0);
}
async function check(name, fn) {
  await fn();
  report.checks.push({ name, pass: true });
}
try {
  for (const width of [360, 390, 768, 1024, 1366, 1440]) {
    await page.setViewportSize({ width, height: width < 768 ? 844 : 900 });
    await go();
    await open();
    await fill();
    const box = await form.boundingBox();
    expect(box.x).toBeGreaterThanOrEqual(0);
    expect(box.x + box.width).toBeLessThanOrEqual(width + 1);
    expect(await page.evaluate(() => document.documentElement.scrollWidth)).toBeLessThanOrEqual(
      width,
    );
    report.layouts.push({ width, state: "formulario", fits: true });
    if ([390, 1366].includes(width))
      await page.screenshot({ path: `${directory}/formulario-${width}.png` });
    await close();
  }
  await check(
    "network failure preserves civil dates/reason and retries one operation",
    async () => {
      await go();
      await open();
      await fill();
      await page.evaluate(() => {
        window.__disponibilidadeFail = true;
      });
      await submit();
      await expect(form.getByRole("alert")).toContainText("preenchimento foi preservado");
      await expect(form.getByLabel("Motivo operacional *", { exact: true })).toHaveValue(
        "Atividade externa planejada",
      );
      await page.evaluate(() => {
        window.__disponibilidadeFail = false;
      });
      await submit();
      await expect(form).toHaveCount(0);
      await expect(region.getByText("Atividade externa planejada", { exact: true })).toBeVisible();
      const calls = await page.evaluate(() =>
        window.__nexusCalls.filter((c) => c.name === "executarIndisponibilidade"),
      );
      expect(calls).toHaveLength(2);
      expect(calls[0].payload.data.chave).toBe(calls[1].payload.data.chave);
      expect(await page.evaluate(() => window.__nexusDisponibilidade.length)).toBe(1);
    },
  );
  await check(
    "cancellation requires a reason and preserves original record and history",
    async () => {
      await region.getByRole("button", { name: "Cancelar bloqueio", exact: true }).click();
      await form.getByRole("button", { name: "Confirmar cancelamento" }).click();
      await expect(form.getByRole("alert")).toContainText("5 a 1000");
      await form
        .getByLabel("Motivo do cancelamento *", { exact: true })
        .fill("Atividade reprogramada pela coordenação");
      await form.getByRole("button", { name: "Confirmar cancelamento" }).click();
      await expect(form).toHaveCount(0);
      await expect(region.getByText("Cancelada · versão 2", { exact: true })).toBeVisible();
      await expect(region.getByText("Atividade externa planejada", { exact: true })).toBeVisible();
      expect(await page.evaluate(() => window.__nexusDisponibilidade.length)).toBe(1);
    },
  );
  await check("confirmed reservation conflict keeps draft without announcing success", async () => {
    await go();
    await open();
    await fill();
    await page.evaluate(() => {
      window.__disponibilidadeConflict = true;
    });
    await submit();
    await expect(form.getByRole("alert")).toContainText("Reprograme a visita");
    await expect(form.getByLabel("Fim *", { exact: true })).toHaveValue("2026-11-02T12:00");
    expect(await page.evaluate(() => window.__nexusDisponibilidade.length)).toBe(0);
    await close();
  });
  await check("Escape guards dirty fields and returns focus to the opener", async () => {
    await go();
    await open();
    await fill();
    await form.press("Escape");
    await expect(form.getByRole("alert")).toContainText("alterações não salvas");
    await form.getByRole("button", { name: "Continuar editando" }).click();
    await expect(form.getByLabel("Motivo operacional *", { exact: true })).toHaveValue(
      "Atividade externa planejada",
    );
    await close();
    await expect(
      region.getByRole("button", { name: "Registrar indisponibilidade", exact: true }),
    ).toBeFocused();
  });
  await check(
    "permission denial closes private editor and removes availability content",
    async () => {
      await go();
      await open();
      await fill();
      await page.evaluate(() => {
        window.__disponibilidadeDenied = true;
      });
      await submit();
      await expect(form).toHaveCount(0);
      await expect(region.getByRole("alert")).toContainText("acesso atual");
      await expect(
        region.getByRole("button", { name: "Registrar indisponibilidade", exact: true }),
      ).toHaveCount(0);
    },
  );
  await check(
    "availability read failure is recoverable and leaves person details visible",
    async () => {
      await go();
      await page.evaluate(() => {
        window.__disponibilidadeReadFail = true;
        window.dispatchEvent(new Event("visibilitychange"));
      });
      await expect(region.getByRole("alert")).toContainText("Falha de rede na disponibilidade.");
      await expect(page.getByRole("button", { name: "Editar cadastro e situação" })).toBeVisible();
      await page.evaluate(() => {
        window.__disponibilidadeReadFail = false;
      });
      await region.getByRole("button", { name: /Tentar/ }).click();
      await expect(region.getByText("Nenhum bloqueio cadastrado", { exact: true })).toBeVisible();
    },
  );
  await check(
    "unsupported legacy timezone preserves original instants and disables civil creation",
    async () => {
      await go();
      await page.evaluate(() => {
        window.__disponibilidadeTimezone = "Unsupported/Legacy";
        window.__nexusDisponibilidade.push({
          id: "f7000000-0000-4000-8000-000000000010",
          organization_id: "10000000-0000-4000-8000-000000000001",
          pessoa_id: "30000000-0000-4000-8000-000000000001",
          inicio: "2026-11-02T09:00:00Z",
          fim: "2026-11-02T10:00:00Z",
          motivo_operacional: "Bloqueio legado preservado",
          version: 1,
          cancelada_em: null,
          motivo_cancelamento: null,
        });
        window.dispatchEvent(new Event("visibilitychange"));
      });
      await expect(region.getByRole("alert")).toContainText(
        "não interpreta o fuso Unsupported/Legacy",
      );
      await expect(
        region.getByRole("button", { name: "Registrar indisponibilidade", exact: true }),
      ).toHaveCount(0);
      await expect(region.getByText(/2026-11-02T09:00:00Z.*instante original/)).toBeVisible();
    },
  );
  report.success = report.errors.length === 0;
  expect(report.success).toBe(true);
} finally {
  await writeFile(`${directory}/results.json`, JSON.stringify(report, null, 2));
  await browser.close();
}
