// Source UI and isolated transport only; not Auth/SQL/Storage HTTP E2E.
import { chromium, expect } from "@playwright/test";
import { mkdir, writeFile } from "node:fs/promises";
import { evidenceRoot } from "./evidence.mjs";

const base = process.env.NEXUS_UI_URL || "http://127.0.0.1:4182";
const id = "50000000-0000-4000-8000-000000000001";
const directory = `${evidenceRoot}/acoes-vinculadas`;
await mkdir(directory, { recursive: true });
const browser = await chromium.launch({ headless: true });
const page = await browser.newPage({
  locale: "pt-BR",
  reducedMotion: "reduce",
  viewport: { width: 390, height: 845 },
});
const report = {
  method: "Actual UI with test-only adapter; no connected persistence claim",
  checks: [],
  errors: [],
  success: false,
};
page.on("pageerror", (error) => report.errors.push(error.message));
async function check(name, work) {
  await work();
  report.checks.push({ name, pass: true });
}
try {
  await check("canonical action URL opens the exact record and survives reload", async () => {
    await page.goto(`${base}/?page=seguranca&acao=${id}`, { waitUntil: "networkidle" });
    const region = page.getByRole("region", { name: "Detalhe da ação selecionada" });
    await expect(
      region.getByRole("heading", {
        name: "Conferir evidência da condição observada no acesso de manutenção",
      }),
    ).toBeVisible();
    await expect(region.getByText(/Pendência de teste vinculada/)).toBeVisible();
    await page.reload({ waitUntil: "networkidle" });
    await expect(region.getByText(/Pendência de teste vinculada/)).toBeVisible();
    expect(new URL(page.url()).searchParams.get("acao")).toBe(id);
    await page.screenshot({ path: `${directory}/acao-vinculada-390.png` });
  });
  await check(
    "focus refetch cannot silently advance an open transition version; explicit reload keeps the result",
    async () => {
      await page.getByRole("button", { name: "Cancelar ação", exact: true }).click();
      const dialog = page.getByRole("dialog");
      const input = dialog.getByRole("textbox", { name: "Resultado ou justificativa" });
      await input.fill("Cancelamento do cenário isolado com justificativa preservada.");
      await page.evaluate(() => {
        window.__nexusOperational.acoes[0].version = 2;
        window.dispatchEvent(new Event("visibilitychange"));
      });
      await expect(page.getByText("Aberta · versão 2", { exact: true })).toBeVisible();
      await dialog.getByRole("button", { name: "Confirmar mudança" }).click();
      await expect(dialog.getByRole("alert")).toContainText("Outra pessoa alterou");
      await expect(input).toHaveValue(
        "Cancelamento do cenário isolado com justificativa preservada.",
      );
      const payload = await page.evaluate(
        () => window.__nexusCalls.filter((c) => c.name === "transicionarAcao").at(-1).payload.data,
      );
      expect(payload.expected_version).toBe(1);
      await page.screenshot({ path: `${directory}/conflito-transicao-390.png` });
      await dialog
        .getByRole("button", { name: "Recarregar registro mantendo justificativa" })
        .click();
      await expect(dialog.getByRole("status")).toContainText("versão 2");
      await expect(input).toHaveValue(
        "Cancelamento do cenário isolado com justificativa preservada.",
      );
      await dialog.getByRole("button", { name: "Confirmar mudança" }).click();
      await expect(dialog).toHaveCount(0);
      await expect(page.getByText("Cancelada · versão 3", { exact: true })).toBeVisible();
    },
  );
  await check("failed direct lookup hides cached detail and allows retry", async () => {
    await page.evaluate(() => {
      window.__operationalFail = true;
      window.dispatchEvent(new Event("visibilitychange"));
    });
    const region = page.getByRole("region", { name: "Detalhe da ação selecionada" });
    await expect(region.getByText(/Pendência de teste vinculada/)).toHaveCount(0);
    await expect(region.getByRole("button", { name: "Tentar novamente" })).toBeVisible();
    await page.evaluate(() => {
      window.__operationalFail = false;
    });
    await region.getByRole("button", { name: "Tentar novamente" }).click();
    await expect(region.getByText(/Pendência de teste vinculada/)).toBeVisible();
    expect(await page.evaluate(() => document.documentElement.scrollWidth)).toBeLessThanOrEqual(
      390,
    );
  });
  expect(report.errors).toEqual([]);
  report.success = true;
} finally {
  await writeFile(`${directory}/results.json`, JSON.stringify(report, null, 2));
  await browser.close();
}
