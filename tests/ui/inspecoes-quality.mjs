import { chromium, expect as baseExpect } from "@playwright/test";
import { existsSync } from "node:fs";
import { mkdir, readFile, writeFile } from "node:fs/promises";
import { evidenceRoot } from "./evidence.mjs";

const base = process.env.NEXUS_UI_URL || "http://127.0.0.1:4182";
const output = `${evidenceRoot}/inspecoes`;
await mkdir(output, { recursive: true });
const localChrome = [
  "C:/Program Files/Google/Chrome/Application/chrome.exe",
  "C:/Program Files/Microsoft/Edge/Application/msedge.exe",
  "/Applications/Google Chrome.app/Contents/MacOS/Google Chrome",
  "/usr/bin/google-chrome",
].find((path) => existsSync(path));
const browser = await chromium.launch({
  args: ["--no-proxy-server"],
  ...(existsSync(chromium.executablePath()) ? {} : { executablePath: localChrome }),
});
const report = {
  method:
    "Componentes reais, dados sintéticos e transporte isolado. Tela móvel emulada. Nenhum acesso à base operacional.",
  browser: browser.version(),
  layouts: [],
  jornadas: [],
  errors: [],
};
const expect = baseExpect.configure({ timeout: 25_000 });
const menus = [
  "Painel",
  "Clientes",
  "Catálogo",
  "Laudos",
  "Avisos",
  "Regras e biblioteca",
  "Próximas fases",
];
const clientId = "41000000-0000-4000-8000-000000000002";
const unitId = "41000000-0000-4000-8000-000000000003";
const assetId = "41000000-0000-4000-8000-000000000100";
function lab(params = {}) {
  const url = new URL(base);
  url.search = new URLSearchParams({ page: "inspecoes", ...params }).toString();
  return url.href;
}
async function pageFor(width, height) {
  const page = await browser.newPage({
    viewport: { width, height },
    locale: "pt-BR",
    reducedMotion: "reduce",
  });
  page.on("pageerror", (error) => report.errors.push(error.message));
  await page.route("**/*", async (route) => {
    const url = new URL(route.request().url());
    if (url.origin === new URL(base).origin) await route.continue();
    else await route.abort();
  });
  return page;
}
try {
  for (const [width, height] of [
    [1280, 800],
    [1440, 900],
    [1920, 1080],
    [390, 844],
    [360, 800],
  ]) {
    const page = await pageFor(width, height);
    await page.goto(
      lab({ menu: "laudos", area: "documentos", cliente: clientId, unidade: unitId }),
      { waitUntil: "domcontentloaded", timeout: 90_000 },
    );
    const destinations = page.getByRole("navigation", { name: "Áreas de Inspeções" });
    await expect(destinations.getByRole("link")).toHaveText(menus);
    await expect(page.locator(".insp-content .insp-context-note").first()).toHaveText(
      "Cliente de Validação · Unidade Norte",
    );
    await expect(
      page.getByRole("button", { name: "Laudo de pontos de ancoragem da Unidade Norte" }),
    ).toBeVisible();
    const metrics = await page.evaluate(() => ({
      overflow: document.documentElement.scrollWidth - window.innerWidth,
      cardWidth: document.querySelector(".insp-record")?.getBoundingClientRect().width,
      active: Array.from(
        document.querySelectorAll('.insp-nav [aria-current="page"]'),
        (item) => item.textContent,
      ),
    }));
    expect(metrics.overflow).toBeLessThanOrEqual(1);
    expect(metrics.active).toEqual(["Laudos"]);
    const filename = `laudos-${width}.png`;
    if (width !== 360) await page.screenshot({ path: `${output}/${filename}` });
    report.layouts.push({ width, height, ...metrics, screenshot: width !== 360 ? filename : null });
    if (width === 1440) {
      const doc = page.getByRole("button", {
        name: "Laudo de pontos de ancoragem da Unidade Norte",
      });
      await doc.focus();
      await page.keyboard.press("Enter");
      let detail = page.getByRole("dialog");
      await expect(
        detail.getByRole("heading", {
          name: "Laudo de pontos de ancoragem da Unidade Norte",
          exact: true,
        }),
      ).toBeFocused();
      await detail.getByRole("button", { name: "Arquivos e fotos" }).click();
      await expect(detail.locator(".insp-photo img")).toHaveCount(6);
      await expect(detail.locator(".insp-photo img").first()).toBeVisible();
      await detail.locator(".insp-photo").first().scrollIntoViewIfNeeded();
      await page.screenshot({ path: `${output}/fotos-1440.png` });
      await detail.getByRole("button", { name: "Visualizar PDF" }).click();
      await expect(page.getByRole("dialog").last().locator("iframe")).toHaveAttribute(
        "src",
        /#page=1&zoom=100$/,
      );
      await page.keyboard.press("Escape");
      await expect(page.getByRole("dialog")).toHaveCount(1);
      await detail.getByRole("button", { name: "Ampliar foto 1 de 6" }).click();
      const photo = page.getByRole("dialog").last();
      await expect(photo.getByRole("heading", { name: "Foto 1 de 6" })).toBeVisible();
      await page.keyboard.press("ArrowRight");
      await expect(photo.getByRole("heading", { name: "Foto 2 de 6" })).toBeVisible();
      await page.keyboard.press("Escape");
      await expect(page.getByRole("dialog")).toHaveCount(1);
      detail = page.getByRole("dialog");
      await detail.getByRole("button", { name: "Resumo", exact: true }).click();
      await detail.getByRole("button", { name: /Ponto de ancoragem PAC-001/ }).click();
      await expect(
        detail.getByRole("heading", { name: "Ponto de ancoragem PAC-001", exact: true }),
      ).toBeVisible();
      await detail.getByRole("button", { name: /Planta de pontos de ancoragem/ }).click();
      await expect(detail.locator("[data-point]")).toHaveCount(149);
      await expect(detail.getByText("PAC (104)", { exact: true })).toBeVisible();
      await expect(detail.getByText("PAL (45)", { exact: true })).toBeVisible();
      await detail.getByRole("searchbox", { name: "Buscar TAG" }).fill("PAC-001");
      await detail.getByLabel("Ponto", { exact: true }).selectOption(assetId);
      await expect(
        detail.getByText("A zona calculada diverge da zona registrada. Requer conferência."),
      ).toBeVisible();
      await page.screenshot({ path: `${output}/planta-1440.png` });
      const [download] = await Promise.all([
        page.waitForEvent("download"),
        detail.getByRole("button", { name: "Exportar SVG" }).click(),
      ]);
      expect(download.suggestedFilename()).toBe("PL-01.svg");
      const svg = await readFile(await download.path(), "utf8");
      expect(svg).toContain('width="420mm"');
      expect(svg).toContain('height="297mm"');
      expect(svg).not.toMatch(/<script|onclick=/i);
      await detail.getByRole("button", { name: "Abrir ficha do ativo" }).click();
      await expect(
        detail.getByRole("heading", { name: "Ponto de ancoragem PAC-001", exact: true }),
      ).toBeVisible();
      await detail
        .getByRole("button", { name: /Levantamento|NX-2026-02/ })
        .filter({ hasText: "Em revisão" })
        .click();
      await expect(detail.getByRole("button", { name: "Aprovar" })).toBeDisabled();
      await expect(
        detail.getByText("Homologue o protocolo desta família e tipo com o checklist aplicável."),
      ).toBeVisible();
      await detail.getByLabel("Justificativa da decisão").fill("Conferir restrição informada.");
      await detail.getByRole("button", { name: "Devolver para correção" }).click();
      await expect(
        detail.getByText("Levantamento devolvido para correção.", { exact: true }),
      ).toBeVisible();
      await page.screenshot({ path: `${output}/levantamento-devolvido-1440.png` });
      await detail.getByRole("button", { name: "Voltar à ficha anterior" }).click();
      await expect(detail.locator("[data-point]")).toHaveCount(149);
      await expect(detail.getByLabel("Ponto", { exact: true })).toHaveValue(assetId);
      await expect(detail.getByRole("searchbox", { name: "Buscar TAG" })).toHaveValue("PAC-001");
      await detail.getByRole("button", { name: "Voltar à ficha anterior" }).click();
      await expect(
        detail.getByRole("heading", { name: "Ponto de ancoragem PAC-001", exact: true }),
      ).toBeVisible();
      await detail.getByRole("button", { name: "Voltar à ficha anterior" }).click();
      await expect(
        detail.getByRole("heading", {
          name: "Laudo de pontos de ancoragem da Unidade Norte",
          exact: true,
        }),
      ).toBeVisible();
      await detail.getByRole("button", { name: "Voltar à consulta" }).click();
      await expect(doc).toBeFocused();
      expect(new URL(page.url()).searchParams.get("unidade")).toBe(unitId);
      report.jornadas.push(
        "Documento → PDF e fotos com teclado → ativo → planta com 149 pontos e SVG A3 → mesmo ativo → devolução EST → consulta com contexto, seleção e foco preservados.",
      );
    }
    await page.close();
  }

  const tst = await pageFor(390, 844);
  await tst.goto(
    lab({
      scenario: "insp-tst",
      menu: "laudos",
      area: "ativos",
      cliente: clientId,
      unidade: unitId,
      busca: "PAC-001",
      trilha: JSON.stringify([{ recurso: "ativos", id: assetId }]),
    }),
    { waitUntil: "domcontentloaded", timeout: 90_000 },
  );
  const work = tst.getByRole("dialog");
  await work.getByRole("button", { name: /NX-2026-02/ }).click();
  await expect(work.getByRole("button", { name: "Aprovar" })).toHaveCount(0);
  await expect(work.getByRole("button", { name: "Novo levantamento" })).toHaveCount(0);
  await expect(work.getByRole("button", { name: "Submeter ao EST" })).toBeEnabled();
  await work.getByRole("button", { name: "Submeter ao EST" }).click();
  await expect(work.getByText("Levantamento submetido ao EST.")).toBeVisible();
  await expect(work.getByRole("button", { name: "Aprovar" })).toHaveCount(0);
  await tst.screenshot({ path: `${output}/levantamento-tst-390.png` });
  report.jornadas.push(
    "TST em 390 px consulta e submete levantamento atribuído. Ações de aprovação, devolução e emissão permanecem indisponíveis.",
  );
  await tst.close();
  expect(report.errors).toEqual([]);
} finally {
  await browser.close();
  await writeFile(`${output}/validacao.json`, JSON.stringify(report, null, 2) + "\n");
}
console.log(
  `Inspeções: ${report.layouts.length} larguras e ${report.jornadas.length} jornadas verificadas.`,
);
