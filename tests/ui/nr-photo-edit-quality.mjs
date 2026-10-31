// Isolated fixtures only. No customer media, browser session, production data or network writes.
import { chromium, webkit, expect } from "@playwright/test";
import { existsSync } from "node:fs";
import { mkdir, writeFile } from "node:fs/promises";
import { evidenceRoot } from "./evidence.mjs";
const base = process.env.NEXUS_UI_URL || "http://127.0.0.1:4190";
const directory = `${evidenceRoot}/nr-photo-edit`;
await mkdir(directory, { recursive: true });
const report = {
  method: "Actual editors with isolated synthetic transport; no production writes.",
  checks: [],
  errors: [],
};
for (const [engine, type] of [
  ["chromium", chromium],
  ["webkit", webkit],
]) {
  const browser = await type.launch({
    headless: true,
    ...(engine === "chromium" && !existsSync(type.executablePath())
      ? { executablePath: "/Applications/Google Chrome.app/Contents/MacOS/Google Chrome" }
      : {}),
  });
  const page = await browser.newPage({
    viewport: { width: 1440, height: 900 },
    locale: "pt-BR",
    reducedMotion: "reduce",
  });
  page.on("pageerror", (error) => report.errors.push({ engine, error: error.message }));
  await page.route("**/*", (route) =>
    new URL(route.request().url()).origin === new URL(base).origin
      ? route.continue()
      : route.abort(),
  );
  const check = async (name, action) => {
    await action();
    report.checks.push({ engine, name, pass: true });
  };
  try {
    await page.goto(
      `${base}/?page=nr-33&scenario=nr-media&nrPath=locais/33000000-0000-4000-8000-000000000001&cliente=20000000-0000-4000-8000-000000000001&unidade=21000000-0000-4000-8000-000000000001&ficha=fotos`,
      { waitUntil: "domcontentloaded" },
    );
    const dialog = page.getByRole("dialog", { name: "Editar local", exact: true });
    const open = () => page.getByRole("button", { name: "Editar registro", exact: true }).click();
    const group = dialog.getByRole("group", { name: "Legendas e ordem das fotos", exact: true });
    await check(
      "Editing and reordering preserve occurrence identity, focus, saved value and explicit discard",
      async () => {
        const original = await page.locator(".nr-photo-card .nr-photo-legend").first().innerText();
        await open();
        const first = group.locator("[data-photo-occurrence]").first();
        const identity = await first.getAttribute("data-photo-occurrence");
        await group.getByLabel("Legenda da foto 1", { exact: true }).fill("Legenda atual de teste");
        await group.getByLabel("Categoria da foto 1", { exact: true }).fill("Categoria atual");
        await group.getByRole("button", { name: "Mover foto 1 para baixo", exact: true }).click();
        const moved = group.locator(`[data-photo-occurrence="${identity}"]`);
        await expect(moved.getByLabel("Legenda da foto 2", { exact: true })).toHaveValue(
          "Legenda atual de teste",
        );
        await expect(
          moved.getByRole("button", { name: "Mover foto 2 para baixo", exact: true }),
        ).toBeFocused();
        await moved.getByRole("button", { name: "Mover foto 2 para cima", exact: true }).click();
        await expect(
          moved.getByRole("button", { name: "Mover foto 1 para baixo", exact: true }),
        ).toBeFocused();
        await moved.getByRole("button", { name: "Mover foto 1 para baixo", exact: true }).click();
        await dialog.getByRole("button", { name: "Cancelar", exact: true }).click();
        await dialog.getByRole("button", { name: "Continuar editando", exact: true }).click();
        await expect(moved.getByLabel("Legenda da foto 2", { exact: true })).toHaveValue(
          "Legenda atual de teste",
        );
        await dialog.getByRole("button", { name: "Cancelar", exact: true }).click();
        await dialog.getByRole("button", { name: "Descartar alterações", exact: true }).click();
        await expect(dialog).not.toBeVisible();
        await expect(page.locator(".nr-photo-card .nr-photo-legend").first()).toHaveText(original);
      },
    );
    await check(
      "Save persists empty caption, category and order without replacing source aliases; reopen reads current override",
      async () => {
        await open();
        await group.getByLabel("Legenda da foto 1", { exact: true }).fill("");
        await group.getByLabel("Categoria da foto 1", { exact: true }).fill("Inspeção atual");
        await group.getByRole("button", { name: "Mover foto 1 para baixo", exact: true }).click();
        await dialog.getByRole("button", { name: "Salvar registro", exact: true }).click();
        await expect(dialog).not.toBeVisible();
        await expect(
          page
            .locator(".nr-photo-card")
            .nth(1)
            .getByText("Foto 2 · legenda não informada", { exact: true }),
        ).toBeVisible();
        await open();
        await expect(group.getByLabel("Legenda da foto 2", { exact: true })).toHaveValue("");
        await expect(group.getByLabel("Categoria da foto 2", { exact: true })).toHaveValue(
          "Inspeção atual",
        );
        const command = await page.evaluate(
          () => window.__nexusCalls.filter((call) => call.name === "nrExecutar").at(-1).data,
        );
        expect(command.expected_version).toBeGreaterThan(0);
        expect(command.dados.dados.fotos[0].legenda).not.toBe("");
        expect(command.dados.dados.fotos[0].edicao_foto_nexus.legenda).toBe("");
        expect(command.dados.dados.fotos[0].edicao_foto_nexus.ordem_origem).toBe(0);
        await group.locator("[data-photo-occurrence]").first().scrollIntoViewIfNeeded();
        await page.screenshot({ path: `${directory}/${engine}-photo-editor.png` });
        await dialog.getByRole("button", { name: "Cancelar", exact: true }).click();
      },
    );
    await check(
      "Photo fields remain usable at390x844 and720x450 CSS equivalent of200percent without overflow",
      async () => {
        await open();
        await group
          .getByLabel("Legenda da foto 1", { exact: true })
          .fill("Legenda contextual extensa para conferir o campo em uso. ".repeat(20));
        for (const [width, height] of [
          [390, 844],
          [720, 450],
        ]) {
          await page.setViewportSize({ width, height });
          const field = group.getByLabel("Legenda da foto 1", { exact: true });
          await field.scrollIntoViewIfNeeded();
          await expect(field).toBeVisible();
          const inputBox = await field.boundingBox(),
            dialogBox = await dialog.boundingBox();
          expect(inputBox.width).toBeGreaterThan(100);
          expect(inputBox.x).toBeGreaterThanOrEqual(dialogBox.x);
          expect(inputBox.x + inputBox.width).toBeLessThanOrEqual(
            dialogBox.x + dialogBox.width + 1,
          );
          const footerBox = await dialog.locator(".nr-form-footer").boundingBox();
          expect(inputBox.y + inputBox.height).toBeLessThanOrEqual(footerBox.y + 1);
          expect(
            await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth),
          ).toBe(true);
          for (const control of [
            group.getByLabel("Categoria da foto 1", { exact: true }),
            group.getByRole("button", { name: "Mover foto 1 para baixo", exact: true }),
          ]) {
            await control.scrollIntoViewIfNeeded();
            const box = await control.boundingBox();
            const pane = await dialog.locator(".nr-editor-scroll").boundingBox();
            expect(box.x).toBeGreaterThanOrEqual(dialogBox.x);
            expect(box.x + box.width).toBeLessThanOrEqual(dialogBox.x + dialogBox.width + 1);
            expect(box.y).toBeGreaterThanOrEqual(pane.y - 1);
            expect(box.y + box.height).toBeLessThanOrEqual(pane.y + pane.height + 1);
          }
          await field.scrollIntoViewIfNeeded();
          await expect(
            dialog.getByRole("button", { name: "Salvar registro", exact: true }),
          ).toBeVisible();
          await page.screenshot({ path: `${directory}/${engine}-photo-editor-${width}.png` });
        }
        await page.setViewportSize({ width: 1440, height: 900 });
        await dialog.getByRole("button", { name: "Cancelar", exact: true }).click();
        await dialog.getByRole("button", { name: "Descartar alterações", exact: true }).click();
      },
    );
    await check(
      "Concurrent-save failure retains caption and ordering until explicit discard",
      async () => {
        await open();
        await group
          .getByLabel("Legenda da foto 2", { exact: true })
          .fill("Preenchimento mantido após conflito");
        await page.evaluate(() => sessionStorage.setItem("nr-photo-conflict", "1"));
        await dialog.getByRole("button", { name: "Salvar registro", exact: true }).click();
        await expect(dialog.getByRole("alert")).toContainText("Conflito sintético");
        await expect(group.getByLabel("Legenda da foto 2", { exact: true })).toHaveValue(
          "Preenchimento mantido após conflito",
        );
        await dialog.getByRole("button", { name: "Cancelar", exact: true }).click();
        await dialog.getByRole("button", { name: "Descartar alterações", exact: true }).click();
        await page.evaluate(() => sessionStorage.removeItem("nr-photo-conflict"));
        await open();
        await expect(group.getByLabel("Legenda da foto 2", { exact: true })).toHaveValue("");
        await dialog.getByRole("button", { name: "Cancelar", exact: true }).click();
      },
    );
    await check(
      "Survey photo metadata uses the existing answer/save flow and preserves repeated occurrences",
      async () => {
        await page.goto(
          `${base}/?page=nr-33&scenario=nr-media&nrPhotoEdit=1&nrPath=levantamentos/33000000-0000-4000-8000-000000000008&cliente=20000000-0000-4000-8000-000000000001&unidade=21000000-0000-4000-8000-000000000001`,
          { waitUntil: "domcontentloaded" },
        );
        await open();
        const surveyDialog = page.getByRole("dialog", { name: "Editar levantamento", exact: true });
        await surveyDialog
          .locator(".nr-survey-navigation")
          .getByRole("button", { name: /^B04 / })
          .click();
        const metadata = surveyDialog.getByRole("group", {
          name: "Legendas e ordem das fotos",
          exact: true,
        });
        await metadata
          .getByLabel("Legenda da foto 2", { exact: true })
          .fill("Legenda contextual do levantamento");
        await metadata.getByRole("button", { name: "Mover foto 2 para cima", exact: true }).click();
        await expect(
          metadata.getByRole("button", { name: "Mover foto 1 para baixo", exact: true }),
        ).toBeFocused();
        await surveyDialog
          .getByRole("button", { name: "Salvar parcialmente", exact: true })
          .click();
        await expect(surveyDialog).not.toBeVisible();
        await open();
        await surveyDialog
          .locator(".nr-survey-navigation")
          .getByRole("button", { name: /^B04 / })
          .click();
        await expect(metadata.getByLabel("Legenda da foto 1", { exact: true })).toHaveValue(
          "Legenda contextual do levantamento",
        );
        const command = await page.evaluate(
          () => window.__nexusCalls.filter((call) => call.name === "nrExecutar").at(-1).data,
        );
        expect(command.recurso).toBe("levantamentos");
        expect(command.dados.respostas["B04.fotos"]).toHaveLength(2);
        expect(command.dados.respostas["B04.fotos"][0].arquivo).toBe(
          command.dados.respostas["B04.fotos"][1].arquivo,
        );
        expect(command.dados.respostas["B04.fotos"][0].edicao_foto_nexus.ocorrencia_id).not.toBe(
          command.dados.respostas["B04.fotos"][1].edicao_foto_nexus.ocorrencia_id,
        );
        await surveyDialog.getByRole("button", { name: "Cancelar", exact: true }).click();
      },
    );
  } catch (error) {
    await page.screenshot({ path: `${directory}/${engine}-failure.png` });
    throw error;
  } finally {
    await browser.close();
  }
}
await writeFile(`${directory}/report.json`, `${JSON.stringify(report, null, 2)}\n`);
expect(report.errors).toEqual([]);
console.log(
  JSON.stringify({
    checks: report.checks.length,
    engines: ["chromium", "webkit"],
    errors: report.errors.length,
  }),
);
