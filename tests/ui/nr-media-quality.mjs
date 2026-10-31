// Deterministic PNG fixtures and synthetic authorization; never client photos or production writes.
import { chromium, webkit, expect } from "@playwright/test";
import { mkdir, writeFile } from "node:fs/promises";
import { existsSync } from "node:fs";
import { evidenceRoot } from "./evidence.mjs";
const base = process.env.NEXUS_UI_URL || "http://127.0.0.1:4182";
const directory = `${evidenceRoot}/nr-media`;
await mkdir(directory, { recursive: true });
const report = {
  method:
    "Real NR gallery/media components with deterministic synthetic PNGs, local-only transport and intercepted HTTP failures. No customer media or production authorization/storage claim.",
  checks: [],
  errors: [],
  limitations: ["WebKit is not the Safari application; physical devices were not exercised."],
};
const id = (index) => `33300000-0000-4000-8000-${String(index).padStart(12, "0")}`;
for (const engine of process.env.NEXUS_UI_ENGINE
  ? [process.env.NEXUS_UI_ENGINE]
  : ["chromium", "webkit"]) {
  const type = engine === "webkit" ? webkit : chromium;
  const options = { headless: true };
  if (engine === "chromium" && !existsSync(type.executablePath()))
    options.executablePath = "/Applications/Google Chrome.app/Contents/MacOS/Google Chrome";
  if (engine === "webkit" && !existsSync(type.executablePath())) {
    report.limitations.push("WebKit unavailable.");
    continue;
  }
  const browser = await type.launch(options);
  const context = await browser.newContext({
    locale: "pt-BR",
    reducedMotion: "reduce",
    viewport: { width: 1440, height: 900 },
    acceptDownloads: true,
  });
  const intercept = async (route) => {
    const url = new URL(route.request().url());
    if (url.pathname.startsWith("/fixtures/nr-photo-") && url.searchParams.get("error") === "403")
      return route.fulfill({
        status: 403,
        contentType: "text/plain",
        body: "Synthetic expired or forbidden image",
      });
    if (
      url.origin === new URL(base).origin ||
      ["fonts.googleapis.com", "fonts.gstatic.com"].includes(url.hostname)
    )
      return route.continue();
    return route.abort();
  };
  await context.route("**/*", intercept);
  const page = await context.newPage();
  page.on("pageerror", (error) => report.errors.push({ engine, message: error.message }));
  page.on("console", (message) => {
    if (message.type() === "error" && /same key|unique.*key/i.test(message.text()))
      report.errors.push({ engine, message: message.text() });
  });
  const check = async (name, work) => {
    await work();
    report.checks.push({ engine, name, pass: true });
  };
  const count = (file, variant) =>
    page.evaluate(
      ({ file, variant }) =>
        window.__nexusCalls.filter(
          (call) =>
            call.name === "nrArquivoImagem" &&
            call.data.id === file &&
            (!variant || call.data.variante === variant),
        ).length,
      { file, variant },
    );
  const capture = (name) => page.screenshot({ path: `${directory}/${engine}-${name}.png` });
  const loaded = (locator) =>
    expect
      .poll(() => locator.evaluate((element) => element.complete && element.naturalWidth > 0))
      .toBe(true);
  try {
    await page.goto(
      `${base}/?page=nr-33&scenario=nr-media&nrPath=locais/33000000-0000-4000-8000-000000000001&cliente=20000000-0000-4000-8000-000000000001&unidade=21000000-0000-4000-8000-000000000001&ficha=fotos`,
      { waitUntil: "domcontentloaded" },
    );
    await page.getByRole("heading", { name: "Espaços confinados", exact: true }).waitFor();
    const gallery = page.locator(".nr-photo-grid");
    const cards = gallery.locator(".nr-photo-card");
    await check(
      "Recognizable thumbnails load with lateral captions, preserved repeated occurrences and no full originals requested",
      async () => {
        await expect(cards).toHaveCount(8);
        await loaded(cards.nth(0).getByRole("img"));
        await loaded(cards.nth(1).getByRole("img"));
        const image = await cards.nth(0).locator(".nr-photo-open").boundingBox();
        const caption = await cards.nth(0).locator("figcaption").boundingBox();
        expect(caption.x).toBeGreaterThanOrEqual(image.x + image.width - 1);
        expect(Math.abs(caption.y - image.y)).toBeLessThan(2);
        await expect(
          cards.last().getByText("Mesma imagem sintética com uma segunda legenda preservada", {
            exact: true,
          }),
        ).toBeVisible();
        expect(await count(id(1), "original")).toBe(0);
        expect(await count(id(1), "miniatura_384")).toBe(1);
        expect(await count(id(1), "previa_768")).toBe(0);
        // Both links exist on this occurrence; the source thumbnail must not hide the Nexus image.
        expect(await count(id(9))).toBe(0);
        await expect(
          cards.nth(0).getByText("Original confirmado no acervo", { exact: true }),
        ).toHaveCount(0);
        await capture("gallery-desktop");
      },
    );
    await check(
      "An expired signed image renews once; persistent HTTP403 and authorization failures remain distinct without loops",
      async () => {
        await cards.nth(2).scrollIntoViewIfNeeded();
        await loaded(cards.nth(2).getByRole("img"));
        expect(await count(id(3), "miniatura_384")).toBe(2);
        await expect(
          cards.nth(3).getByText("Acesso não autorizado", { exact: true }),
        ).toBeVisible();
        await cards.nth(4).scrollIntoViewIfNeeded();
        await expect(
          cards.nth(4).getByText("Falha ao carregar a imagem", { exact: true }),
        ).toBeVisible();
        expect(await count(id(5), "miniatura_384")).toBe(2);
        await page.waitForTimeout(700);
        expect(await count(id(5), "miniatura_384")).toBe(2);
        await expect(gallery.getByText(/original preservado|Original disponível/)).toHaveCount(0);
        await capture("failure-states");
      },
    );
    await check(
      "Processing and failed derivatives keep their real status without declaring recovered originals",
      async () => {
        await cards.nth(5).scrollIntoViewIfNeeded();
        await expect(
          cards.nth(5).getByText("Miniatura em processamento", { exact: true }),
        ).toBeVisible();
        await cards.nth(6).scrollIntoViewIfNeeded();
        await expect(
          cards.nth(6).getByText("Falha ao processar a miniatura", { exact: true }),
        ).toBeVisible();
        expect(await count(id(6), "original")).toBe(0);
        await capture("processing-states");
      },
    );
    await check(
      "A preview with no recovered original enlarges and navigates without offering an original download",
      async () => {
        await cards.nth(1).getByRole("button").click();
        const dialog = page.getByRole("dialog", {
          name: "Prévia vertical sintética sem original recuperado",
          exact: true,
        });
        await loaded(dialog.getByRole("img"));
        await expect(
          dialog.getByText("Prévia da origem. O original permanece pendente de recuperação.", {
            exact: true,
          }),
        ).toBeVisible();
        await expect(
          dialog.getByRole("button", { name: "Baixar original", exact: true }),
        ).toHaveCount(0);
        await dialog.getByRole("button", { name: "Ampliar imagem", exact: true }).click();
        await expect(dialog.getByText("150%", { exact: true })).toBeVisible();
        await page.keyboard.press("ArrowRight");
        await expect(
          page.getByRole("dialog", {
            name: "Assinatura expirada sintética recuperada uma vez",
            exact: true,
          }),
        ).toBeVisible();
        await expect(page.getByRole("dialog").getByText("100%", { exact: true })).toBeVisible();
        await page.keyboard.press("ArrowLeft");
        await expect(dialog).toBeVisible();
        await capture("preview-only-expanded");
        await page.keyboard.press("Escape");
        await expect(page.getByRole("dialog")).toHaveCount(0);
        await expect(cards.nth(1).getByRole("button")).toBeFocused();
      },
    );
    await check(
      "Original download is authorized at click time and repeated clicks create one fresh request",
      async () => {
        await cards.nth(0).getByRole("button").click();
        const dialog = page.getByRole("dialog", {
          name: "Imagem horizontal sintética para conferir legenda lateral",
          exact: true,
        });
        await loaded(dialog.getByRole("img"));
        const download = dialog.getByRole("button", { name: "Baixar original", exact: true });
        await expect(download).toBeVisible();
        expect(
          await page.evaluate(
            () => window.__nexusCalls.filter((call) => call.name === "nrArquivoBaixar").length,
          ),
        ).toBe(0);
        await download.evaluate((element) => {
          element.click();
          element.click();
        });
        await expect
          .poll(() =>
            page.evaluate(
              () => window.__nexusCalls.filter((call) => call.name === "nrArquivoBaixar").length,
            ),
          )
          .toBe(1);
        await expect(download).toBeEnabled();
        await capture("original-expanded");
        await page.keyboard.press("Escape");
        await expect(page.getByRole("dialog")).toHaveCount(0);
        await expect(cards.nth(0).getByRole("button")).toBeFocused();
      },
    );
    await check(
      "A denied full image cannot advertise a confirmed original or offer its download",
      async () => {
        await cards.nth(3).getByRole("button").click();
        const dialog = page.getByRole("dialog", {
          name: "Imagem sintética sem autorização",
          exact: true,
        });
        await expect(dialog.getByText("Acesso não autorizado", { exact: true })).toBeVisible();
        await expect(
          dialog.getByRole("button", { name: "Baixar original", exact: true }),
        ).toHaveCount(0);
        await expect(
          dialog.getByText("A disponibilidade do original ainda não foi confirmada neste acesso.", {
            exact: true,
          }),
        ).toBeVisible();
        await page.keyboard.press("Escape");
      },
    );
    await check(
      "The existing file grid distinguishes an unconfirmed upload from a preserved image",
      async () => {
        const panel = page.getByRole("heading", { name: "Arquivos e representações", exact: true });
        await panel.scrollIntoViewIfNeeded();
        const pending = page.locator("li").filter({
          has: page.getByText("Imagem sintética com envio pendente.png", { exact: true }),
        });
        await expect(
          pending.getByText("Transferência não confirmada", { exact: true }),
        ).toBeVisible();
        await expect(pending.getByText("Original preservado", { exact: true })).toHaveCount(0);
        await expect(pending.locator(".nr-file-thumbnail")).toBeDisabled();
        await loaded(
          page
            .locator(".nr-file-card")
            .filter({ has: page.getByText("Imagem sintética vinculada.png", { exact: true }) })
            .getByRole("img"),
        );
        const source = page
          .locator(".nr-file-card")
          .filter({ has: page.getByText("Miniatura sintética da origem.png", { exact: true }) });
        await loaded(source.getByRole("img"));
        await expect(
          source.getByText(
            "Miniatura da origem verificada · original não comprovado por este arquivo",
            { exact: true },
          ),
        ).toBeVisible();
        await capture("file-grid-upload-state");
        const opener = source.getByRole("button", { name: "Abrir prévia da origem", exact: true });
        await opener.click();
        const preview = page.locator(".nr-file-preview");
        await loaded(preview.getByRole("img"));
        await expect(
          preview.getByRole("button", { name: "Baixar prévia da origem", exact: true }),
        ).toBeVisible();
        await expect(
          preview.getByRole("button", { name: "Baixar imagem original", exact: true }),
        ).toHaveCount(0);
        await preview.scrollIntoViewIfNeeded();
        await capture("file-grid-source-preview");
        await preview.getByRole("button", { name: "Fechar prévia", exact: true }).click();
        await expect(opener).toBeFocused();
      },
    );
    await check(
      "At390px captions stack below uncropped images and gallery enlargement keeps all controls reachable",
      async () => {
        await page.setViewportSize({ width: 390, height: 844 });
        await cards.nth(0).scrollIntoViewIfNeeded();
        const image = await cards.nth(0).locator(".nr-photo-open").boundingBox();
        const caption = await cards.nth(0).locator("figcaption").boundingBox();
        expect(caption.y).toBeGreaterThanOrEqual(image.y + image.height - 1);
        expect(await page.evaluate(() => document.documentElement.scrollWidth)).toBeLessThanOrEqual(
          391,
        );
        await capture("gallery-mobile");
        await cards.nth(0).getByRole("button").click();
        const dialog = page.getByRole("dialog");
        await loaded(dialog.getByRole("img"));
        await expect(dialog.getByRole("button", { name: "Próxima", exact: true })).toBeVisible();
        await capture("expanded-mobile");
        await page.keyboard.press("Escape");
        await expect(page.getByRole("dialog")).toHaveCount(0);
      },
    );
    await check(
      "At DPR2 photo and file grids sign only768 when visible; source previews and full originals retain their variants",
      async () => {
        const denseContext = await browser.newContext({
          locale: "pt-BR",
          reducedMotion: "reduce",
          viewport: { width: 1440, height: 900 },
          deviceScaleFactor: 2,
        });
        await denseContext.route("**/*", intercept);
        const densePage = await denseContext.newPage();
        densePage.on("pageerror", (error) =>
          report.errors.push({ engine, message: error.message }),
        );
        try {
          await densePage.goto(
            `${base}/?page=nr-33&scenario=nr-media&nrPath=locais/33000000-0000-4000-8000-000000000001&cliente=20000000-0000-4000-8000-000000000001&unidade=21000000-0000-4000-8000-000000000001&ficha=fotos`,
            { waitUntil: "domcontentloaded" },
          );
          const denseCards = densePage.locator(".nr-photo-grid .nr-photo-card");
          await expect(denseCards).toHaveCount(8);
          await loaded(denseCards.first().getByRole("img"));
          await loaded(denseCards.nth(1).getByRole("img"));
          expect(await densePage.evaluate(() => window.devicePixelRatio)).toBe(2);
          const variants = (file) =>
            densePage.evaluate(
              (file) =>
                window.__nexusCalls
                  .filter((call) => call.name === "nrArquivoImagem" && call.data.id === file)
                  .map((call) => call.data.variante),
              file,
            );
          expect(await variants(id(1))).toEqual(["previa_768"]);
          expect(await variants(id(9))).toEqual([]);
          expect(await variants(id(2))).toEqual(["original"]);
          await densePage.screenshot({ path: `${directory}/${engine}-gallery-dpr2.png` });
          const denseFile = densePage.locator(".nr-file-card").filter({
            has: densePage.getByText("Imagem sintética vinculada.png", { exact: true }),
          });
          expect(await variants(id(10))).toEqual([]);
          await denseFile.scrollIntoViewIfNeeded();
          await loaded(denseFile.getByRole("img"));
          expect(await variants(id(10))).toEqual(["previa_768"]);
          await densePage.screenshot({ path: `${directory}/${engine}-file-grid-dpr2.png` });
          await denseCards.first().getByRole("button").click();
          await loaded(densePage.getByRole("dialog").getByRole("img"));
          expect(await variants(id(1))).toEqual(["previa_768", "original"]);
          await densePage.keyboard.press("Escape");
          await expect(denseCards.first().getByRole("button")).toBeFocused();
        } finally {
          await denseContext.close();
        }
      },
    );
    await check(
      "Authorized pending derivatives show a labeled source preview until Nexus is ready; authorization errors never fall back and source HTTP errors renew only once",
      async () => {
        const fallbackContext = await browser.newContext({
          locale: "pt-BR",
          reducedMotion: "reduce",
          viewport: { width: 1440, height: 900 },
        });
        await fallbackContext.route("**/*", intercept);
        const fallbackPage = await fallbackContext.newPage();
        fallbackPage.on("pageerror", (error) =>
          report.errors.push({ engine, message: error.message }),
        );
        const variants = (file) =>
          fallbackPage.evaluate(
            (file) =>
              window.__nexusCalls
                .filter((call) => call.name === "nrArquivoImagem" && call.data.id === file)
                .map((call) => call.data.variante),
            file,
          );
        try {
          await fallbackPage.goto(
            `${base}/?page=nr-33&scenario=nr-media&nrMediaFallback=1&nrPath=locais/33000000-0000-4000-8000-000000000001&cliente=20000000-0000-4000-8000-000000000001&unidade=21000000-0000-4000-8000-000000000001&ficha=fotos`,
            { waitUntil: "domcontentloaded" },
          );
          const fallbackCards = fallbackPage.locator(".nr-photo-grid .nr-photo-card");
          await expect(fallbackCards).toHaveCount(8);
          const denied = fallbackCards.nth(3);
          await denied.scrollIntoViewIfNeeded();
          await expect(denied.getByText("Acesso não autorizado", { exact: true })).toBeVisible();
          expect(await variants(id(14))).toEqual([]);
          const notGenerated = fallbackCards.nth(2);
          await loaded(notGenerated.getByRole("img"));
          await expect(
            notGenerated.getByText("Prévia da origem · Miniatura ainda não gerada", {
              exact: true,
            }),
          ).toBeVisible();
          expect(await variants(id(3))).toEqual(["miniatura_384"]);
          expect(await variants(id(13))).toEqual(["original"]);
          const pending = fallbackCards.nth(5);
          await pending.scrollIntoViewIfNeeded();
          await loaded(pending.getByRole("img"));
          await expect(
            pending.getByText("Prévia da origem · Miniatura em processamento", { exact: true }),
          ).toBeVisible();
          const pendingRequests = await variants(id(6));
          expect(pendingRequests.length).toBeGreaterThan(0);
          expect(pendingRequests.every((variant) => variant === "miniatura_384")).toBe(true);
          expect(await variants(id(16))).toEqual(["original", "original"]);
          await expect(pending.getByRole("img")).toHaveAttribute("src", /id=16&/);
          await fallbackPage.screenshot({ path: `${directory}/${engine}-source-fallback.png` });
          await fallbackPage.evaluate(() => sessionStorage.setItem("nrMediaDerivativesReady", "1"));
          await expect
            .poll(async () => (await variants(id(6))).length, { timeout: 10000 })
            .toBeGreaterThan(pendingRequests.length);
          await loaded(pending.getByRole("img"));
          await expect(pending.getByRole("img")).toHaveAttribute("src", /id=6&/);
          await expect(pending.locator('[data-nr-media-source="origem"]')).toHaveCount(0);
          expect(await variants(id(16))).toEqual(["original", "original"]);
          expect((await variants(id(6))).length).toBeLessThanOrEqual(7);
          const failed = fallbackCards.nth(6);
          await failed.scrollIntoViewIfNeeded();
          await expect(
            failed.getByText("Prévia da origem · Falha ao processar a miniatura", { exact: true }),
          ).toBeVisible();
          await expect(
            failed.getByText("Falha ao carregar a imagem", { exact: true }),
          ).toBeVisible();
          expect(await variants(id(17))).toEqual(["original", "original"]);
          await fallbackPage.waitForTimeout(700);
          expect(await variants(id(17))).toEqual(["original", "original"]);
          expect(await variants(id(6))).not.toContain("original");
          await fallbackPage.screenshot({
            path: `${directory}/${engine}-source-fallback-ready.png`,
          });
        } finally {
          await fallbackContext.close();
        }
      },
    );
  } catch (error) {
    report.errors.push({ engine, message: String(error) });
    await capture("failure");
  } finally {
    await browser.close();
  }
}
report.success = report.errors.length === 0;
await writeFile(`${directory}/results.json`, JSON.stringify(report, null, 2));
if (!report.success) throw Error(JSON.stringify(report.errors, null, 2));
console.log(JSON.stringify({ success: true, checks: report.checks.length }));
