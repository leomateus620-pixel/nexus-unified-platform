// Real reader/canvas/PDF.js with a synthetic local PDF and isolated transport only.
// This profile does not prove connected Auth, RLS, Storage HTTP, physical devices or fidelity of arbitrary PDFs.
import { chromium, expect } from "@playwright/test";
import { createHash } from "node:crypto";
import { mkdir, readFile, writeFile } from "node:fs/promises";
import { evidenceRoot } from "./evidence.mjs";

const base = process.env.NEXUS_UI_URL || "http://127.0.0.1:4182";
const directory = `${evidenceRoot}/pe-leitor`;
const bytes = await readFile(new URL("./fixtures/nexus-original-isolado.pdf", import.meta.url));
const hash = createHash("sha256").update(bytes).digest("hex");
const project = "40000000-0000-4000-8000-000000000001";
const v1 = "41000000-0000-4000-8000-000000000001";
const v2 = "41000000-0000-4000-8000-000000000002";
const original = "a5000000-0000-4000-8000-000000000001";
const other = "a5000000-0000-4000-8000-000000000002";
const name = "original-sintetico-v2.pdf";
const otherName = "original-sintetico-v1.pdf";
const pageOneText = "Identificador: NXS-TESTE-001";
const pageTwoText = "Identificador: NXS-TESTE-002";
await mkdir(directory, { recursive: true });
const browser = await chromium.launch({ headless: true });
const page = await browser.newPage({ locale: "pt-BR", reducedMotion: "reduce" });
page.setDefaultTimeout(15_000);
const report = {
  profile: process.env.NEXUS_UI_BEHAVIORS_ONLY === "1" ? "behaviors-only" : "layouts-and-behaviors",
  method:
    "Real source reader and PDF.js canvas; synthetic two-page A4/A3 landscape PDF and local signed-URL fixture. No connected Auth, SQL/RLS, Storage HTTP or physical device proof.",
  renderingLimit:
    "Distinct nonwhite canvas pixels and extracted identifiers prove the local render path; they do not certify universal document fidelity, OCR, engineering correctness or field performance.",
  fixture: {
    file: "tests/ui/fixtures/nexus-original-isolado.pdf",
    sha256: hash,
    size: bytes.byteLength,
  },
  layouts: [],
  checks: [],
  errors: [],
  network: [],
  success: false,
};
const safeMessage = (value) =>
  String(value).replace(/https?:\/\/[^\s)"']+/g, (url) => {
    try {
      const parsed = new URL(url);
      return parsed.origin + parsed.pathname;
    } catch {
      return "[URL omitida]";
    }
  });
page.on("pageerror", (error) => report.errors.push(safeMessage(error.message)));
const pdfRequests = [],
  pdfResponses = [],
  pdfFailures = [];
const pdfPath = (url) =>
  new URL(url).pathname === "/storage/v1/object/sign/nexus-operacional/fixture-reader.pdf";
page.on("request", (request) => {
  if (pdfPath(request.url())) pdfRequests.push({ path: new URL(request.url()).pathname });
});
page.on("response", (response) => {
  if (pdfPath(response.url()))
    pdfResponses.push({ path: new URL(response.url()).pathname, status: response.status() });
});
page.on("requestfailed", (request) => {
  if (pdfPath(request.url()))
    pdfFailures.push({
      path: new URL(request.url()).pathname,
      failure: safeMessage(request.failure()?.errorText || "Request interrupted"),
    });
});
await page.route("**/*", (route) => {
  const url = new URL(route.request().url());
  if (["data:", "blob:"].includes(url.protocol) || url.origin === new URL(base).origin)
    return route.continue();
  return route.abort();
});
const reader = () => page.getByRole("dialog");
const canvas = () => reader().locator("canvas");
const stage = () =>
  reader().getByLabel("Área da página; setas esquerda e direita navegam", { exact: true });
const extract = () =>
  reader().getByRole("region", { name: "Texto extraível da página", exact: true });
const files = () =>
  page
    .getByRole("heading", { name: "Originais e referências desta versão", exact: true })
    .locator("xpath=ancestor::section[1]");
const fileRow = (fileName = name) =>
  files()
    .locator("li")
    .filter({ has: page.getByText(fileName, { exact: true }) });
const opener = (fileName = name) =>
  fileRow(fileName).getByRole("button", { name: "Ler original", exact: true });
async function revalidate() {
  await page.evaluate(() => {
    window.dispatchEvent(new Event("focus"));
    document.dispatchEvent(new Event("visibilitychange"));
    window.dispatchEvent(new Event("visibilitychange"));
  });
}
async function go() {
  await page.goto(`${base}/?page=projetos-engenharia&projeto=${project}`, {
    waitUntil: "domcontentloaded",
    timeout: 30_000,
  });
  await expect(
    files().getByText("Nenhum arquivo vinculado a esta versão.", { exact: true }),
  ).toBeVisible();
  await page.evaluate(
    ({ project, v1, v2, original, other, name, otherName, hash, size }) => {
      window.__peReaderMode = true;
      const common = {
        organization_id: "10000000-0000-4000-8000-000000000001",
        projeto_id: project,
        mime: "application/pdf",
        tamanho: size,
        caminho: "fixture-reader.pdf",
        sha256: hash,
        estado: "vinculado",
        created_by: "00000000-0000-4000-8000-000000000001",
        created_at: "2026-10-22T12:00:00Z",
        confirmado_em: "2026-10-22T12:00:01Z",
      };
      window.__nexusPeArquivos.push(
        { ...common, id: original, versao_id: v2, nome: name },
        { ...common, id: other, versao_id: v1, nome: otherName },
      );
    },
    { project, v1, v2, original, other, name, otherName, hash, size: bytes.byteLength },
  );
  await revalidate();
  await expect(opener()).toBeVisible();
}
async function pixels() {
  return canvas().evaluate((node) => {
    const context = node.getContext("2d");
    if (
      !context ||
      node.width < 1 ||
      node.height < 1 ||
      getComputedStyle(node).visibility !== "visible"
    )
      return {
        width: node.width,
        height: node.height,
        colors: 0,
        nonwhite: 0,
        cssWidth: 0,
        cssHeight: 0,
      };
    const data = context.getImageData(0, 0, node.width, node.height).data;
    const colors = new Set();
    let nonwhite = 0;
    const stride = Math.max(4, Math.floor(data.length / 200_000 / 4) * 4);
    for (let i = 0; i < data.length; i += stride) {
      if (data[i + 3] > 0 && Math.min(data[i], data[i + 1], data[i + 2]) < 245) nonwhite++;
      if (colors.size < 512) colors.add((data[i] << 16) | (data[i + 1] << 8) | data[i + 2]);
    }
    const box = node.getBoundingClientRect();
    return {
      width: node.width,
      height: node.height,
      cssWidth: box.width,
      cssHeight: box.height,
      colors: colors.size,
      nonwhite,
    };
  });
}
async function rendered(number) {
  await expect(reader().getByLabel("Ir à página", { exact: true })).toHaveValue(String(number));
  await expect(canvas()).toHaveAttribute("aria-label", `Página ${number} de 2 do original`);
  await page.evaluate(
    () => new Promise((resolve) => requestAnimationFrame(() => requestAnimationFrame(resolve))),
  );
  await expect(canvas()).toBeVisible();
  await expect
    .poll(
      async () => {
        const p = await pixels();
        return p.colors > 8 && p.nonwhite > 30;
      },
      { timeout: 20_000 },
    )
    .toBe(true);
  await expect(
    reader()
      .getByRole("status")
      .filter({ hasText: /Renderizando página/ }),
  ).toHaveCount(0);
  return pixels();
}
async function open() {
  await opener().click();
  await expect(reader()).toBeVisible();
  return rendered(1);
}
async function text(expected) {
  await reader().getByRole("button", { name: "Texto da página", exact: true }).click();
  await expect(extract()).toContainText(expected);
  await expect(extract()).toContainText(
    "Texto extraível; imagens e disposição visual permanecem na página.",
  );
}
async function erased() {
  await expect(extract()).toHaveCount(0);
  await expect
    .poll(() =>
      canvas().evaluate(
        (node) =>
          node.width === 0 && node.height === 0 && getComputedStyle(node).visibility === "hidden",
      ),
    )
    .toBe(true);
  await expect(
    reader().getByRole("button", { name: "Texto da página", exact: true }),
  ).toBeDisabled();
}
async function check(name, action) {
  await action();
  report.checks.push({ name, pass: true });
}
async function layout(width) {
  const height = width < 768 ? 844 : 900;
  await page.setViewportSize({ width, height });
  await go();
  const first = await open();
  const availableWidth = await stage().evaluate((node) => node.clientWidth - 32);
  await expect
    .poll(async () => Math.abs((await pixels()).cssWidth - availableWidth))
    .toBeLessThan(2);
  expect(availableWidth).toBeGreaterThan(width - 80);
  await text(pageOneText);
  await reader().getByRole("button", { name: "Próxima página", exact: true }).click();
  const second = await rendered(2);
  expect(second.cssWidth / second.cssHeight).toBeGreaterThan(1.2);
  await text(pageTwoText);
  const box = await reader().boundingBox();
  expect(box).not.toBeNull();
  expect(box.x).toBeGreaterThanOrEqual(0);
  expect(box.y).toBeGreaterThanOrEqual(0);
  expect(box.x + box.width).toBeLessThanOrEqual(width + 1);
  expect(box.y + box.height).toBeLessThanOrEqual(height + 1);
  expect(await page.evaluate(() => document.documentElement.scrollWidth)).toBeLessThanOrEqual(
    width + 1,
  );
  report.layouts.push({
    width,
    height,
    first,
    availableWidth,
    second,
    textIdentifiers: [pageOneText, pageTwoText],
    overflow: false,
  });
  if ([390, 1366].includes(width))
    await page.screenshot({ path: `${directory}/reader-p2-${width}.png` });
  await reader().getByRole("button", { name: "Fechar leitor", exact: true }).click();
  await expect(opener()).toBeFocused();
}
try {
  if (process.env.NEXUS_UI_BEHAVIORS_ONLY !== "1")
    for (const width of [360, 390, 768, 1024, 1366, 1440]) await layout(width);
  await page.setViewportSize({ width: 1366, height: 900 });
  await check(
    "real two-page render, extracted identifiers, page bounds, zoom, rotation and keyboard navigation",
    async () => {
      await go();
      const first = await open();
      await text(pageOneText);
      await reader().getByRole("button", { name: "Ocultar texto", exact: true }).click();
      await reader().getByRole("button", { name: "Aumentar zoom", exact: true }).click();
      await expect(reader().getByLabel("Zoom relativo ao ajuste", { exact: true })).toHaveText(
        "125%",
      );
      await rendered(1);
      await expect
        .poll(async () => (await pixels()).cssWidth)
        .toBeGreaterThan(first.cssWidth * 1.2);
      await reader().getByRole("button", { name: "Girar página 90 graus", exact: true }).click();
      await rendered(1);
      await expect
        .poll(async () => {
          const p = await pixels();
          return p.cssWidth / p.cssHeight;
        })
        .toBeGreaterThan(1.2);
      await stage().focus();
      await page.keyboard.press("ArrowRight");
      await rendered(2);
      await text(pageTwoText);
      await stage().focus();
      await page.keyboard.press("ArrowLeft");
      await rendered(1);
      await reader().getByLabel("Ir à página", { exact: true }).fill("3");
      await page.keyboard.press("Enter");
      await expect(reader().getByRole("alert")).toContainText("Informe uma página de 1 a 2.");
      await reader().getByLabel("Ir à página", { exact: true }).fill("2");
      await page.keyboard.press("Enter");
      await rendered(2);
      await expect(reader().getByLabel("Ir à página", { exact: true })).toHaveAccessibleName(
        "Ir à página",
      );
      await page.keyboard.press("Tab");
      expect(await reader().evaluate((node) => node.contains(document.activeElement))).toBe(true);
      await page.keyboard.press("Escape");
      await expect(reader()).toHaveCount(0);
      await expect(opener()).toBeFocused();
    },
  );
  await check(
    "current metadata denial on focus erases canvas and extracted text, then permits safe retry",
    async () => {
      await go();
      await open();
      await text(pageOneText);
      await page.evaluate((id) => {
        window.__peReaderDenied = id;
      }, original);
      await revalidate();
      await expect(reader().getByRole("alert")).toContainText(
        "O original não está disponível para seu acesso atual.",
      );
      await erased();
      await expect(reader().getByRole("heading", { name, exact: true })).toHaveCount(0);
      await page.evaluate(() => {
        window.__peReaderDenied = false;
      });
      await reader().getByRole("button", { name: "Tentar novamente", exact: true }).click();
      await rendered(1);
    },
  );
  await check(
    "transient metadata failure also erases the preview and recovers without changing the original",
    async () => {
      await go();
      await open();
      await text(pageOneText);
      await page.evaluate(() => {
        window.__peReaderNetwork = true;
      });
      await revalidate();
      await expect(reader().getByRole("alert")).toContainText(
        "Não foi possível confirmar o acesso ou carregar o original.",
      );
      await erased();
      await page.evaluate(() => {
        window.__peReaderNetwork = false;
      });
      await reader().getByRole("button", { name: "Tentar novamente", exact: true }).click();
      await rendered(1);
      expect(
        await page.evaluate(
          (id) => window.__nexusPeArquivos.find((a) => a.id === id).sha256,
          original,
        ),
      ).toBe(hash);
    },
  );
  await check(
    "metadata denial before loading keeps the original filename and pixels out of the reader",
    async () => {
      await go();
      await page.evaluate((id) => {
        window.__peReaderDenied = id;
      }, original);
      await opener().click();
      await expect(reader().getByRole("alert")).toContainText(
        "O original não está disponível para seu acesso atual.",
      );
      await erased();
      await expect(
        reader().getByRole("heading", { name: "Ler original", exact: true }),
      ).toBeVisible();
    },
  );
  await check(
    "same-size corrupt bytes fail SHA-256 verification before render and recover with canonical metadata unchanged",
    async () => {
      await go();
      await page.evaluate(() => {
        window.__peReaderCorrupt = true;
      });
      await opener().click();
      await expect(reader().getByRole("alert")).toContainText(
        "Os bytes recebidos não correspondem ao original confirmado.",
      );
      await erased();
      await page.evaluate(() => {
        window.__peReaderCorrupt = false;
      });
      await reader().getByRole("button", { name: "Tentar novamente", exact: true }).click();
      await rendered(1);
      expect(
        await page.evaluate(
          (id) => window.__nexusPeArquivos.find((a) => a.id === id).sha256,
          original,
        ),
      ).toBe(hash);
    },
  );
  await check("one expired signed URL is reauthorized once after a metadata check", async () => {
    await go();
    const start = pdfResponses.length;
    await page.evaluate(() => {
      window.__peReaderExpiredOnce = true;
    });
    await open();
    expect(pdfResponses.slice(start).map((r) => r.status)).toEqual([403, 200]);
    expect(
      await page.evaluate(
        () => window.__nexusCalls.filter((c) => c.name === "baixarArquivoPe").length,
      ),
    ).toBe(2);
  });
  await check(
    "closing a pending download aborts it, restores focus and never reopens a late preview",
    async () => {
      await go();
      const start = pdfRequests.length,
        failureStart = pdfFailures.length;
      await page.evaluate(() => {
        window.__peReaderSlow = true;
      });
      await opener().click();
      await expect.poll(() => pdfRequests.length).toBeGreaterThan(start);
      await reader().getByRole("button", { name: "Fechar leitor", exact: true }).click();
      await expect(reader()).toHaveCount(0);
      await expect(opener()).toBeFocused();
      await expect.poll(() => pdfFailures.length).toBeGreaterThan(failureStart);
      await page.waitForTimeout(2300); // The isolated endpoint waits 2s; observe late-result disposal after that boundary.
      await expect(reader()).toHaveCount(0);
      await expect(
        page.getByRole("region", { name: "Texto extraível da página", exact: true }),
      ).toHaveCount(0);
    },
  );
  await check(
    "switching versions after close does not reuse the former text, zoom, page or original identity",
    async () => {
      await go();
      await open();
      await reader().getByRole("button", { name: "Próxima página", exact: true }).click();
      await rendered(2);
      await text(pageTwoText);
      await page.keyboard.press("Escape");
      await expect(reader()).toHaveCount(0);
      await page.getByRole("button", { name: /^V1 · congelada/ }).click();
      await expect(fileRow(otherName)).toBeVisible();
      await expect(fileRow(name)).toHaveCount(0);
      await opener(otherName).click();
      await rendered(1);
      await expect(reader().getByRole("heading", { name: otherName, exact: true })).toBeVisible();
      await expect(extract()).toHaveCount(0);
      await expect(reader().getByLabel("Zoom relativo ao ajuste", { exact: true })).toHaveText(
        "100%",
      );
      const calls = await page.evaluate(() =>
        window.__nexusCalls
          .filter((c) => c.name === "obterArquivoPe" || c.name === "baixarArquivoPe")
          .map((c) => ({ name: c.name, id: c.payload.data.id })),
      );
      expect(calls.some((c) => c.id === other)).toBe(true);
      await page.keyboard.press("Escape");
      await expect(opener(otherName)).toBeFocused();
    },
  );
  expect(report.errors).toEqual([]);
  report.success = true;
} catch (error) {
  report.failure = safeMessage(error);
  await page.screenshot({ path: `${directory}/failure.png` });
  throw error;
} finally {
  report.network = {
    requests: pdfRequests.length,
    responses: pdfResponses,
    interruptions: pdfFailures,
  };
  await writeFile(`${directory}/results.json`, JSON.stringify(report, null, 2) + "\n");
  await browser.close();
}
