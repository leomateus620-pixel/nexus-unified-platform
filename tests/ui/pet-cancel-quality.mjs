// Actual draft cancellation component with presentation-only records and access transport.
import { chromium, expect } from "@playwright/test";
import { mkdir, writeFile } from "node:fs/promises";
const root = process.env.NEXUS_PET_EVIDENCE || "/tmp/nexus-pet-experience-stateqa";
const base = process.env.NEXUS_PET_PRESENTATION_URL || "http://127.0.0.1:4194";
await mkdir(root, { recursive: true });
const browser = await chromium.launch({
  headless: true,
  ...(process.env.NEXUS_UI_BROWSER_EXECUTABLE
    ? { executablePath: process.env.NEXUS_UI_BROWSER_EXECUTABLE }
    : {}),
});
const page = await browser.newPage({ locale: "pt-BR", reducedMotion: "reduce" });
const report = {
  method:
    "Actual PET-only cancellation dialog with synthetic draft/access transport. No database mutation or operational certification.",
  checks: [],
  errors: [],
};
page.on("pageerror", (error) => report.errors.push(error.message));
async function go(state = "draft", theme = "dark", extra = "") {
  await page.goto(`${base}/experience.html?state=${state}&theme=${theme}${extra}`, {
    waitUntil: "networkidle",
  });
  await page.locator(".pet-workspace").waitFor();
  await page.getByRole("button", { name: "Detalhes e opções da PET", exact: true }).click();
  if ((await page.locator(".pet-workspace").getAttribute("data-pet-theme")) !== theme)
    await page.getByRole("button", { name: /Ativar modo/ }).click();
  await page.evaluate(() => document.fonts.ready);
}
async function check(name, work) {
  await work();
  report.checks.push(name);
  console.log(`PASS ${name}`);
}
try {
  await check(
    "draft cancellation is reachable with manage access and no PET operating permission",
    async () => {
      await page.setViewportSize({ width: 390, height: 844 });
      await go();
      await expect(
        page.getByRole("button", { name: "Cancelar rascunho", exact: true }),
      ).toBeVisible();
      await page.getByRole("button", { name: "Cancelar rascunho", exact: true }).click();
      const dialog = page.getByRole("dialog", { name: "Cancelar rascunho da PET", exact: true });
      await expect(dialog).toBeVisible();
      expect(await page.evaluate(() => window.__petCommands.length)).toBe(0);
      await expect(
        dialog.getByRole("button", { name: "Confirmar cancelamento do rascunho", exact: true }),
      ).toBeDisabled();
      await dialog
        .getByLabel("Motivo do cancelamento", { exact: true })
        .fill("Preparação cancelada por alteração do serviço.");
      await expect(dialog.locator("form")).toHaveAttribute("data-dirty", "true");
      await expect(
        dialog.getByRole("button", { name: "Confirmar cancelamento do rascunho", exact: true }),
      ).toBeDisabled();
      await dialog
        .getByLabel("Confirmo o cancelamento deste rascunho da PET.", { exact: true })
        .check();
      await expect(
        dialog.getByRole("button", { name: "Confirmar cancelamento do rascunho", exact: true }),
      ).toBeEnabled();
      await page.screenshot({ path: `${root}/cancel-draft-dark-390.png` });
      await dialog
        .getByRole("button", { name: "Confirmar cancelamento do rascunho", exact: true })
        .click();
      await expect(
        page.getByRole("heading", { name: "Permissão cancelada", exact: true }),
      ).toBeVisible();
      await expect(
        page.getByRole("button", { name: "Cancelar rascunho", exact: true }),
      ).toHaveCount(0);
      await expect(
        page.getByRole("heading", { name: "Permissão encerrada", exact: true }),
      ).toHaveCount(0);
      const command = await page.evaluate(() => window.__petCommands[0]);
      expect(command.comando).toBe("cancelar");
      expect(command.dados.expected_version).toBe(8);
    },
  );
  await check(
    "network failure preserves motive and explicit confirmation in the light portal",
    async () => {
      await page.setViewportSize({ width: 1366, height: 1000 });
      await go("draft", "light", "&failure=1");
      await page.getByRole("button", { name: "Cancelar rascunho", exact: true }).click();
      const dialog = page.getByRole("dialog", { name: "Cancelar rascunho da PET", exact: true });
      await expect(dialog.locator("form")).toHaveAttribute("data-pet-theme", "light");
      await dialog
        .getByLabel("Motivo do cancelamento", { exact: true })
        .fill("Serviço reagendado, rascunho preservado no histórico.");
      await dialog
        .getByLabel("Confirmo o cancelamento deste rascunho da PET.", { exact: true })
        .check();
      await dialog
        .getByRole("button", { name: "Confirmar cancelamento do rascunho", exact: true })
        .click();
      await expect(dialog.getByLabel("Motivo do cancelamento", { exact: true })).toHaveValue(
        "Serviço reagendado, rascunho preservado no histórico.",
      );
      await expect(
        dialog.getByLabel("Confirmo o cancelamento deste rascunho da PET.", { exact: true }),
      ).toBeChecked();
      await expect(dialog.getByRole("alert")).toContainText("Falha de rede");
      await page.screenshot({ path: `${root}/cancel-draft-failure-light-1366.png` });
    },
  );
  await check(
    "cancellation stays unavailable for non-managers, issued PETs and cancelled records",
    async () => {
      for (const [state, extra] of [
        ["draft", "&manage=0"],
        ["emitted", ""],
        ["cancelled", ""],
      ]) {
        await go(state, "dark", extra);
        await expect(
          page.getByRole("button", { name: "Cancelar rascunho", exact: true }),
        ).toHaveCount(0);
      }
    },
  );
  await check(
    "concurrent finalization preserves local closing text until explicit discard",
    async () => {
      await page.setViewportSize({ width: 390, height: 844 });
      await go("closing-preparation", "light");
      await page
        .getByLabel("Condição final do espaço e término do trabalho", { exact: true })
        .fill("Condição final local ainda não enviada.");
      await page
        .getByLabel("Justificativa e observações", { exact: true })
        .fill("Conferência local preservada para comparação.");
      await page
        .getByRole("navigation", { name: "Fases da PET", exact: true })
        .getByRole("button", { name: "Operar", exact: false })
        .click();
      await page
        .getByRole("navigation", { name: "Fases da PET", exact: true })
        .getByRole("button", { name: "Encerrar", exact: false })
        .click();
      await expect(
        page.getByLabel("Condição final do espaço e término do trabalho", { exact: true }),
      ).toHaveValue("Condição final local ainda não enviada.");
      await page.evaluate(() => window.__petSetState("closed"));
      await expect(
        page.getByRole("heading", { name: "Permissão encerrada", exact: true }),
      ).toBeVisible();
      await expect(
        page.getByText(
          "A PET foi finalizada em outra atualização. Seu preenchimento local de encerramento não foi enviado.",
          { exact: true },
        ),
      ).toBeVisible();
      expect(await page.evaluate(() => window.__petCommands.length)).toBe(0);
      await page.getByRole("button", { name: "Comparar preenchimento local", exact: true }).click();
      await expect(
        page.getByLabel("Condição final do espaço e término do trabalho", { exact: true }),
      ).toHaveValue("Condição final local ainda não enviada.");
      await expect(
        page.getByLabel("Condição final do espaço e término do trabalho", { exact: true }),
      ).toHaveAttribute("readonly", "");
      await expect(
        page.getByRole("button", { name: "Registrar término e pendências", exact: true }),
      ).toHaveCount(0);
      await page.evaluate(() => scrollTo(0, 0));
      await page.screenshot({
        path: `${root}/concurrent-closing-comparison-light-390.png`,
        fullPage: true,
      });
      await page
        .getByRole("button", { name: "Descartar preenchimento local", exact: true })
        .click();
      await expect(
        page.getByLabel("Condição final do espaço e término do trabalho", { exact: true }),
      ).toHaveCount(0);
      await expect(
        page.getByRole("heading", { name: "Permissão encerrada", exact: true }),
      ).toBeVisible();
    },
  );
  expect(report.errors).toEqual([]);
} finally {
  await writeFile(`${root}/cancel-ui-results.json`, JSON.stringify(report, null, 2));
  await browser.close();
}
console.log(JSON.stringify(report));
