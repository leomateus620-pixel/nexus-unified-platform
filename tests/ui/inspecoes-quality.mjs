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
  contextoLongo: null,
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
async function headerMetrics(page) {
  return page.evaluate(() => {
    const header = document.querySelector(".insp-hero");
    const nav = document.querySelector(".insp-nav");
    const controls = [...header.querySelectorAll(".nr-client-combobox, #insp-atribuicao")];
    return {
      headerHeight: header.getBoundingClientRect().height,
      navHeight: nav.getBoundingClientRect().height,
      navigationRows: new Set([...nav.querySelectorAll("a")].map((link) => link.offsetTop)).size,
      minControlHeight: Math.min(
        ...controls.map((control) => control.getBoundingClientRect().height),
      ),
      horizontalOverflowControls: controls.filter(
        (control) => control.scrollWidth > control.clientWidth + 1,
      ).length,
    };
  });
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
    const header = await headerMetrics(page);
    expect(header.headerHeight).toBeLessThanOrEqual(width >= 1280 ? 90 : 165);
    expect(header.minControlHeight).toBeGreaterThanOrEqual(40);
    expect(header.horizontalOverflowControls).toBe(0);
    expect(header.navigationRows).toBe(width >= 1280 ? 1 : 2);
    expect(metrics.active).toEqual(["Laudos"]);
    const filename = `laudos-${width}.png`;
    await page.screenshot({ path: `${output}/${filename}` });
    report.layouts.push({ width, height, ...metrics, ...header, screenshot: filename });
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
      const openPdf = detail.getByRole("button", { name: "Visualizar PDF" });
      await openPdf.click();
      const reader = page.getByRole("dialog").last();
      await expect(reader.getByRole("heading", { name: "laudo-de-validacao.pdf" })).toBeVisible();
      const canvas = reader.getByRole("img", { name: "Página 1 de 2 do original" });
      await expect(canvas).toBeVisible();
      expect(await canvas.evaluate((element) => element.width)).toBeGreaterThan(1);
      await reader.getByRole("button", { name: "Aumentar zoom" }).click();
      await expect(reader.getByLabel("Zoom relativo ao ajuste")).toHaveText("125%");
      await reader.getByRole("button", { name: "Próxima página" }).click();
      await expect(reader.getByRole("img", { name: "Página 2 de 2 do original" })).toBeVisible();
      await reader.getByRole("button", { name: "Texto da página" }).click();
      await expect(reader.getByRole("region", { name: "Texto extraível da página" })).toContainText(
        "Identificador: NXS-TESTE-002",
      );
      await page.screenshot({ path: `${output}/pdf-1440.png` });
      const [originalDownload] = await Promise.all([
        page.waitForEvent("download"),
        reader.getByRole("button", { name: "Baixar original" }).click(),
      ]);
      expect(originalDownload.suggestedFilename()).toBe("laudo-de-validacao.pdf");
      const saved = await readFile(await originalDownload.path());
      const fixture = await readFile(
        new URL("./fixtures/nexus-original-isolado.pdf", import.meta.url),
      );
      expect(saved.equals(fixture)).toBe(true);
      await page.evaluate(() => {
        document.body.setAttribute("data-insp-revoked", "");
        window.dispatchEvent(new Event("focus"));
      });
      await expect(reader.getByRole("alert")).toContainText("A visualização foi encerrada");
      await expect(reader.locator("canvas")).toBeHidden();
      await page.evaluate(() => document.body.removeAttribute("data-insp-revoked"));
      await page.keyboard.press("Escape");
      await expect(page.getByRole("dialog")).toHaveCount(1);
      await expect(openPdf).toBeFocused();
      await detail.getByRole("button", { name: "Ampliar foto 1 de 6" }).click();
      const photo = page.getByRole("dialog").last();
      await expect(photo.getByRole("heading", { name: "Foto 1 de 6" })).toBeVisible();
      await page.keyboard.press("ArrowRight");
      await expect(photo.getByRole("heading", { name: "Foto 2 de 6" })).toBeVisible();
      await expect(
        photo.getByRole("img", { name: "Teste de carga com dinamômetro." }),
      ).toBeVisible();
      await photo.getByRole("button", { name: "Aumentar zoom" }).click();
      await expect(photo.getByText("125%", { exact: true })).toBeVisible();
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
        "PDF.js renderiza duas páginas, extrai texto e baixa os bytes originais. Revogar o acesso limpa a prévia. Escape devolve o foco ao acionador.",
        "Documento → fotos com teclado → ativo → planta com 149 pontos e SVG A3 → mesmo ativo → devolução EST → consulta com contexto, seleção e foco preservados.",
      );
    }
    await page.close();
  }

  const narrow = await pageFor(360, 800);
  await narrow.goto(
    lab({
      scenario: "insp-long-context",
      menu: "laudos",
      area: "documentos",
      cliente: clientId,
      unidade: unitId,
    }),
    { waitUntil: "domcontentloaded", timeout: 90_000 },
  );
  await expect(
    narrow.getByRole("combobox", {
      name: "Cliente: Indústria de Sistemas de Proteção e Manutenção",
    }),
  ).toBeVisible();
  await expect(
    narrow.getByRole("combobox", {
      name: "Unidade: Unidade Operacional Santa Rosa — Linha de Vida",
    }),
  ).toBeVisible();
  await expect(narrow.locator(".insp-assignment-value")).toHaveText(
    "EST · Responsável Técnica de Inspeções e Proteção contra Quedas",
  );
  const longHeader = await headerMetrics(narrow);
  expect(longHeader.headerHeight).toBeLessThanOrEqual(175);
  expect(longHeader.horizontalOverflowControls).toBe(0);
  expect(longHeader.minControlHeight).toBeGreaterThanOrEqual(40);
  await narrow.screenshot({ path: `${output}/cabecalho-360-nomes-longos.png` });
  report.contextoLongo = {
    width: 360,
    height: 800,
    ...longHeader,
    screenshot: "cabecalho-360-nomes-longos.png",
  };
  await expect(narrow.locator(".insp-content .insp-context-note").first()).toHaveText(
    "Indústria de Sistemas de Proteção e Manutenção · Unidade Operacional Santa Rosa — Linha de Vida",
  );
  const clientSelector = narrow.getByRole("combobox", {
    name: "Cliente: Indústria de Sistemas de Proteção e Manutenção",
  });
  await clientSelector.focus();
  await narrow.keyboard.press("Enter");
  await expect(
    narrow.getByRole("option", { name: /Indústria de Sistemas de Proteção e Manutenção/ }),
  ).toBeVisible();
  await narrow.keyboard.press("Escape");
  await expect(clientSelector).toBeFocused();
  await narrow.close();

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

  const large = await pageFor(390, 844);
  const requests = [];
  large.on("request", (request) => {
    if (new URL(request.url()).pathname.endsWith("/fixture-grande.pdf"))
      requests.push(request.headers()["range"]);
  });
  await large.goto(
    lab({ menu: "laudos", area: "documentos", cliente: clientId, unidade: unitId }),
    { waitUntil: "domcontentloaded", timeout: 90_000 },
  );
  await large.getByRole("button", { name: "Relatório de ensaio de linha de vida" }).click();
  await large.getByRole("button", { name: "Arquivos e fotos" }).click();
  const previewLarge = large.getByRole("button", { name: "Visualizar PDF" });
  await previewLarge.click();
  const largeReader = large.getByRole("dialog").last();
  await expect(largeReader.getByRole("img", { name: "Página 1 de 2 do original" })).toBeVisible();
  await largeReader.getByRole("button", { name: "Próxima página" }).click();
  await expect(largeReader.getByRole("img", { name: "Página 2 de 2 do original" })).toBeVisible();
  await largeReader.getByRole("button", { name: "Texto da página" }).click();
  await expect(
    largeReader.getByRole("region", { name: "Texto extraível da página" }),
  ).toContainText("Identificador: NXS-TESTE-002");
  expect(requests.length).toBeGreaterThan(1);
  const bytesTransferred = requests.reduce((bytes, header) => {
    const match = header?.match(/^bytes=(\d+)-(\d+)$/);
    expect(match).not.toBeNull();
    return bytes + Number(match[2]) - Number(match[1]) + 1;
  }, 0);
  expect(bytesTransferred).toBeLessThan(2 * 1024 * 1024);
  await large.keyboard.press("Escape");
  await expect(previewLarge).toBeFocused();
  await large.evaluate(() => document.body.setAttribute("data-insp-ignore-range", ""));
  await previewLarge.click();
  await expect(largeReader.getByRole("alert")).toContainText("O servidor não entregou os trechos");
  await expect(largeReader.getByRole("button", { name: "Baixar original" })).toBeEnabled();
  await large.evaluate(() => document.body.removeAttribute("data-insp-ignore-range"));
  await largeReader.getByRole("button", { name: "Tentar novamente" }).click();
  await expect(largeReader.getByRole("img", { name: "Página 1 de 2 do original" })).toBeVisible();
  await large.close();
  report.jornadas.push(
    `PDF de 91 MiB em 390 px. Duas páginas renderizadas com ${bytesTransferred} bytes por intervalos. Resposta sem 206 preserva download e permite nova tentativa.`,
  );

  const admin = await pageFor(390, 844);
  await admin.goto(
    lab({ scenario: "insp-admin", menu: "clientes", cliente: clientId, unidade: unitId }),
    { waitUntil: "domcontentloaded", timeout: 90_000 },
  );
  const atuacao = admin.getByRole("combobox", { name: "Atuação" });
  await expect(atuacao).toHaveValue("est");
  await expect(admin.getByText("Sem atribuição de Inspeções")).toHaveCount(0);
  await admin.getByRole("button", { name: "Acessos de Inspeções" }).click();
  await expect(admin.getByRole("heading", { name: "Administrador de Validação" })).toBeVisible();
  await atuacao.selectOption("tst");
  await expect(atuacao).toHaveValue("tst");
  await expect(admin.getByRole("button", { name: "Acessos de Inspeções" })).toHaveCount(0);
  await expect(
    admin.getByText("Consulta da visualização TST. A coleta exige atribuição TST válida."),
  ).toBeVisible();
  expect(new URL(admin.url()).searchParams.get("menu")).toBe("clientes");
  expect(new URL(admin.url()).searchParams.get("unidade")).toBe(unitId);
  await atuacao.selectOption("est");
  await expect(admin.getByRole("button", { name: "Acessos de Inspeções" })).toBeVisible();
  report.jornadas.push(
    "Admin sem atribuição técnica alterna EST administrativo e consulta TST no mesmo contexto e mantém o acesso ao acervo.",
  );
  await admin.close();

  const editing = await pageFor(1440, 900);
  await editing.goto(lab({ scenario: "insp-maintenance", menu: "clientes" }), {
    waitUntil: "domcontentloaded",
    timeout: 90_000,
  });
  await editing.getByRole("button", { name: "Novo cliente", exact: true }).click();
  const clientForm = editing.getByRole("dialog", { name: "Novo cadastro de cliente" });
  await clientForm.getByLabel("Razão social").fill("Indústria do Laboratório de Inspeções");
  await clientForm.getByLabel("Nome de exibição").fill("Indústria de Validação");
  await clientForm.getByRole("button", { name: "Salvar cadastro" }).click();
  await expect(editing.getByText("Indústria de Validação cadastrado na Nexus.")).toBeVisible();
  await editing.getByRole("button", { name: "Criar unidade para este cliente" }).click();
  const unitForm = editing.getByRole("dialog", { name: "Novo cadastro de unidade" });
  await unitForm.getByLabel("Nome").fill("Unidade Nova de Validação");
  await unitForm.getByRole("button", { name: "Salvar cadastro" }).click();
  await expect(
    editing.getByRole("button", { name: "Unidade Nova de Validação", exact: true }),
  ).toHaveCount(0);
  await editing.getByRole("button", { name: "Incluir esta unidade" }).click();
  const activation = editing.getByRole("dialog", { name: "Incluir unidade em Inspeções" });
  await activation.getByLabel("Segmento").selectOption("IN");
  await activation.getByLabel("Motivo").fill("Incluir unidade para inspeções de validação.");
  await activation.getByRole("button", { name: "Incluir unidade" }).click();
  await expect(activation).toBeHidden();
  await editing.getByRole("button", { name: "Unidade Nova de Validação", exact: true }).click();
  await expect(
    editing.getByText("Indústria de Validação · Unidade Nova de Validação", { exact: true }),
  ).toBeVisible();
  await editing.getByText("Arquivos e histórico da unidade", { exact: true }).click();
  await expect(
    editing.getByRole("heading", { name: "Unidade incluída em Inspeções" }),
  ).toBeVisible();
  await expect(editing.getByText("Incluir unidade para inspeções de validação.")).toBeVisible();
  report.jornadas.push(
    "Administrador cadastra cliente e unidade no cadastro Nexus, inclui a unidade em Inspeções e confere a inclusão no histórico.",
  );

  await editing.getByRole("button", { name: "Novo contrato", exact: true }).click();
  await editing
    .getByLabel("Título do contrato", { exact: true })
    .fill("Contrato de validação da unidade");
  await editing.getByLabel("Referência documental do contrato").fill("CTR-VALIDAÇÃO-001");
  await editing.getByRole("button", { name: "Salvar contrato", exact: true }).click();
  await expect(editing.getByRole("status").filter({ hasText: "Contrato salvo." })).toBeVisible();
  const contract = editing.locator(".insp-record").filter({
    has: editing.getByRole("heading", { name: "Contrato de validação da unidade", exact: true }),
  });
  await expect(contract.getByText("Rascunho", { exact: true })).toBeVisible();
  await expect(editing.getByRole("button", { name: "Registrar vigência" })).toHaveCount(0);
  await editing.getByText("Arquivos e histórico do contrato", { exact: true }).click();
  await expect(
    editing.getByRole("heading", { name: "Contrato criado", exact: true }),
  ).toBeVisible();
  report.jornadas.push(
    "Administrador salva contrato em rascunho na unidade nova e consulta o evento de criação.",
  );
  await editing.close();

  const correction = await pageFor(1440, 900);
  await correction.goto(
    lab({
      scenario: "insp-maintenance",
      menu: "laudos",
      area: "documentos",
      cliente: clientId,
      unidade: unitId,
    }),
    { waitUntil: "domcontentloaded", timeout: 90_000 },
  );
  await correction
    .getByRole("button", { name: "Laudo de pontos de ancoragem da Unidade Norte" })
    .click();
  const corregir = correction.getByRole("button", { name: "Corrigir ficha", exact: true });
  await corregir.click();
  const correctionForm = correction.getByRole("dialog", {
    name: "Corrigir identificação da ficha",
  });
  const title = "Laudo de pontos de ancoragem — identificação revisada";
  await correctionForm.getByLabel("Título", { exact: true }).fill(title);
  await correctionForm.getByLabel("Nota de cadastro").fill("Correção apenas cadastral.");
  await correctionForm.getByLabel("Motivo").fill("Padronizar o título da ficha.");
  await correction.keyboard.press("Escape");
  await expect(correctionForm.getByRole("alert")).toContainText("Descartar as alterações");
  await correctionForm.getByRole("button", { name: "Continuar editando" }).click();
  await expect(correctionForm.getByLabel("Título", { exact: true })).toHaveValue(title);
  await correctionForm.getByRole("button", { name: "Salvar correção" }).click();
  await expect(correctionForm.getByRole("alert")).toContainText("Falha simulada");
  await expect(correctionForm.getByLabel("Nota de cadastro")).toHaveValue(
    "Correção apenas cadastral.",
  );
  await correctionForm.getByRole("button", { name: "Salvar correção" }).click();
  await expect(correctionForm).toBeHidden();
  await expect(correction.getByRole("heading", { name: title, exact: true })).toBeVisible();
  await correction.getByRole("button", { name: "Histórico e origem" }).click();
  await expect(
    correction.getByRole("heading", { name: "Ficha corrigida", exact: true }),
  ).toHaveCount(1);
  await expect(correction.getByText("Padronizar o título da ficha.")).toBeVisible();
  await correction.getByText("Conferir alteração", { exact: true }).click();
  await expect(
    correction.getByRole("dialog").getByText("Laudo de pontos de ancoragem da Unidade Norte", {
      exact: true,
    }),
  ).toBeVisible();
  await expect(correction.getByRole("heading", { name: "Histórico na origem" })).toBeVisible();
  const submittedKeys = await correction.locator("body").getAttribute("data-insp-correction-keys");
  const [firstKey, retryKey, extraKey] = submittedKeys.split(",");
  expect(firstKey).toBeTruthy();
  expect(retryKey).toBe(firstKey);
  expect(extraKey).toBeUndefined();
  await correction.close();
  report.jornadas.push(
    "Correção mantém o rascunho ao cancelar a saída e ao falhar o salvamento. A nova tentativa reutiliza a chave e a ficha apresenta um evento com a versão e o motivo.",
  );

  expect(report.errors).toEqual([]);
} finally {
  await browser.close();
  await writeFile(`${output}/validacao.json`, JSON.stringify(report, null, 2) + "\n");
}
console.log(
  `Inspeções: ${report.layouts.length} larguras e ${report.jornadas.length} jornadas verificadas.`,
);
