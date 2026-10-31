// Real components, synthetic records and intercepted transport; never writes production data.
import { chromium, webkit, expect } from "@playwright/test";
import { mkdir, writeFile } from "node:fs/promises";
import { existsSync } from "node:fs";
import { evidenceRoot } from "./evidence.mjs";

const base = process.env.NEXUS_UI_URL || "http://127.0.0.1:4182";
const directory = `${evidenceRoot}/nr-client-brands`;
await mkdir(directory, { recursive: true });
const client = "20000000-0000-4000-8000-000000000001";
const unit = "21000000-0000-4000-8000-000000000001";
const report = {
  method:
    "Real NR/client-editor components with isolated fixtures. No production writes. WebKit is not Safari-device certification.",
  checks: [],
  limitations: [],
  errors: [],
};
for (const engine of ["chromium", "webkit"]) {
  const type = engine === "chromium" ? chromium : webkit;
  const options = { headless: true };
  if (engine === "chromium" && !existsSync(type.executablePath()))
    options.executablePath = "/Applications/Google Chrome.app/Contents/MacOS/Google Chrome";
  if (engine === "webkit" && !existsSync(type.executablePath())) {
    report.limitations.push("WebKit runtime unavailable; Safari not tested.");
    continue;
  }
  const browser = await type.launch(options);
  const page = await browser.newPage({
    viewport: { width: 1440, height: 900 },
    locale: "pt-BR",
    reducedMotion: "reduce",
  });
  page.on("pageerror", (error) => report.errors.push({ engine, message: error.message }));
  await page.route("**/*", async (route) => {
    const url = new URL(route.request().url());
    if (
      url.origin === new URL(base).origin ||
      ["fonts.googleapis.com", "fonts.gstatic.com"].includes(url.hostname)
    )
      await route.continue();
    else await route.abort();
  });
  const goto = async () => {
    const url = new URL(base);
    url.search = new URLSearchParams({
      page: "nr-33",
      scenario: "nr-brand",
      nrPath: "clientes",
      cliente: client,
      unidade: unit,
    }).toString();
    await page.goto(url.href, { waitUntil: "domcontentloaded" });
    await page.getByRole("heading", { name: "Clientes e unidades", exact: true }).waitFor();
  };
  const check = async (name, work) => {
    await work();
    report.checks.push({ engine, name, pass: true });
  };
  try {
    await goto();
    await check(
      "Official assets retain proportions and the white Cotrirosa lettering receives a dark surface",
      async () => {
        const media = page.locator(".nr-context-client .nr-brand-media");
        await expect(media).toHaveAttribute("data-surface", "escura");
        const img = media.locator("img");
        await expect(img).toHaveJSProperty("naturalWidth", 211);
        expect(await img.evaluate((node) => getComputedStyle(node).objectFit)).toBe("contain");
        await page.screenshot({ path: `${directory}/${engine}-clients-1440.png` });
      },
    );
    await check("Opening, searching and Escape preserve context and restore focus", async () => {
      const combo = page.getByRole("combobox", { name: /^Cliente:/ });
      const oldUrl = page.url();
      await combo.focus();
      await page.keyboard.press("Enter");
      await expect(
        page.getByRole("combobox", { name: "Buscar cliente", exact: true }),
      ).toBeFocused();
      await expect(
        page.getByRole("option", { name: /Cliente Alfa.*Cliente atual/ }),
      ).toHaveAttribute("aria-selected", "true");
      await page
        .getByRole("combobox", { name: "Buscar cliente", exact: true })
        .fill("Cliente Z 27");
      await expect(page.getByRole("option", { name: /Cliente Z 27/ })).toBeVisible();
      expect(page.url()).toBe(oldUrl);
      await page.keyboard.press("Escape");
      await expect(combo).toBeFocused();
      expect(page.url()).toBe(oldUrl);
    });
    await check(
      "Search reaches a client beyond 25 options, Enter selects its canonical ID and never chooses a unit",
      async () => {
        await page.getByRole("combobox", { name: /^Cliente:/ }).click();
        await page
          .getByRole("combobox", { name: "Buscar cliente", exact: true })
          .fill("Cliente Z 27");
        await page.keyboard.press("Enter");
        await expect(page.getByRole("combobox", { name: /^Cliente: Cliente Z 27/ })).toBeVisible();
        await expect(page.getByRole("combobox", { name: /^Cliente: Cliente Z 27/ })).toBeFocused();
        await expect(page.locator(".nr-context-unit select")).toHaveValue("");
        expect(new URL(page.url()).searchParams.get("cliente")).toBe(
          "20000000-0000-4000-8000-000000000027",
        );
      },
    );
    await goto();
    await check(
      "Client identity expands its existing group without navigation and exposes all unit actions",
      async () => {
        const identity = page.getByRole("button", { name: /Cliente Alfa.*laboratório isolado/ });
        const url = page.url();
        await identity.click();
        await expect(identity).toHaveAttribute("aria-expanded", "false");
        expect(page.url()).toBe(url);
        await identity.click();
        await expect(identity).toHaveAttribute("aria-expanded", "true");
        const card = page.locator(`[data-record-id="${unit}"]`);
        await expect(card.getByRole("link", { name: "Abrir unidade", exact: true })).toBeVisible();
        await expect(card.getByRole("link", { name: "Documentos", exact: true })).toBeVisible();
        await expect(card.getByRole("link", { name: /^Pendências/ })).toBeVisible();
      },
    );
    await check(
      "Image failure shows a monogram while the name remains available and selectable",
      async () => {
        await page.route("**/brands/cotrirosa.png", (route) => route.abort());
        await goto();
        await expect(page.locator(".nr-context-client .nr-brand-monogram")).toHaveText("CA");
        await expect(page.getByRole("combobox", { name: /^Cliente: Cliente Alfa/ })).toBeVisible();
        await page.unroute("**/brands/cotrirosa.png");
      },
    );
    await check(
      "Choosing a replacement brand remains local; Cancel requires explicit discard and preserves the saved record",
      async () => {
        await goto();
        const group = page
          .locator(".nr-client-group")
          .filter({ has: page.getByRole("button", { name: /Cliente Alfa.*laboratório isolado/ }) });
        await group.getByRole("button", { name: "Editar cliente", exact: true }).click();
        const dialog = page.getByRole("dialog", { name: "Editar cliente", exact: true });
        await dialog
          .getByLabel("Marca do cliente", { exact: true })
          .setInputFiles("public/brands/cotrirosa.png");
        await expect(dialog.getByText(/Nova marca selecionada: cotrirosa.png/)).toBeVisible();
        await dialog.getByRole("button", { name: "Remover marca", exact: true }).click();
        await expect(dialog.getByLabel("Marca do cliente", { exact: true })).toHaveValue("");
        await expect(dialog.getByLabel("Marca do cliente", { exact: true })).toBeFocused();
        await dialog
          .getByLabel("Marca do cliente", { exact: true })
          .setInputFiles("public/brands/cotrirosa.png");
        await expect(dialog.getByText(/Nova marca selecionada: cotrirosa.png/)).toBeVisible();
        await dialog.getByRole("radio", { name: "Escura", exact: true }).check();
        await expect(dialog.locator(".nx-client-brand-preview")).toHaveAttribute(
          "data-surface",
          "escura",
        );
        expect(
          await page.evaluate(
            () =>
              window.__nexusCalls.filter((call) =>
                /salvarclientes|prepararUpload|confirmarUpload/.test(call.name),
              ).length,
          ),
        ).toBe(0);
        await dialog.getByRole("button", { name: "Cancelar", exact: true }).click();
        const discard = page.getByRole("alertdialog", {
          name: "Descartar alterações não salvas?",
          exact: true,
        });
        await discard.getByRole("button", { name: "Continuar editando", exact: true }).click();
        await expect(dialog.getByText(/Nova marca selecionada: cotrirosa.png/)).toBeVisible();
        await dialog.getByRole("button", { name: "Cancelar", exact: true }).click();
        await page
          .getByRole("alertdialog")
          .getByRole("button", { name: "Descartar e sair", exact: true })
          .click();
        await expect(dialog).toHaveCount(0);
        expect(
          await page.evaluate(
            () =>
              window.__nexusCalls.filter((call) =>
                /salvarclientes|prepararUpload|confirmarUpload/.test(call.name),
              ).length,
          ),
        ).toBe(0);
      },
    );
    await check(
      "390 px context, popup and complete client/unit cards remain within the viewport",
      async () => {
        await page.setViewportSize({ width: 390, height: 844 });
        await goto();
        expect(
          await page.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth + 1),
        ).toBe(true);
        await page.getByRole("combobox", { name: /^Cliente:/ }).click();
        await expect
          .poll(() =>
            page.locator(".nr-brand-options").evaluate((node) => getComputedStyle(node).opacity),
          )
          .toBe("1");
        const rect = await page.locator(".nr-brand-options").boundingBox();
        expect(rect.x).toBeGreaterThanOrEqual(0);
        expect(rect.x + rect.width).toBeLessThanOrEqual(391);
        await page.screenshot({ path: `${directory}/${engine}-selector-390.png` });
        await page.keyboard.press("Escape");
      },
    );
  } catch (error) {
    report.errors.push({ engine, message: error.stack || error.message });
  }
  await browser.close();
}
await writeFile(`${directory}/report.json`, `${JSON.stringify(report, null, 2)}\n`);
console.log(JSON.stringify(report, null, 2));
if (report.errors.length) process.exitCode = 1;
