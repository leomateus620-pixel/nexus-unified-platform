// Real NR components; all records and writes are isolated fixtures, never production services.
import { chromium, webkit, expect } from "@playwright/test";
import { mkdir, writeFile } from "node:fs/promises";
import { existsSync } from "node:fs";
import { evidenceRoot } from "./evidence.mjs";

const base = process.env.NEXUS_UI_URL || "http://127.0.0.1:4182";
const directory = `${evidenceRoot}/nr-details`;
await mkdir(directory, { recursive: true });
const client = "20000000-0000-4000-8000-000000000001";
const unit = "21000000-0000-4000-8000-000000000001";
const local = "33000000-0000-4000-8000-000000000001";
const survey = "33000000-0000-4000-8000-000000000008";
const document = "33000000-0000-4000-8000-000000000002";
const report = {
  method:
    "Actual components, isolated synthetic transport; all application requests stay on the local laboratory. WebKit is not a claim of Safari-device validation. The 720×450 case exercises the CSS viewport equivalent of 200% zoom at 1440×900; native browser zoom is not claimed.",
  checks: [],
  contrast: [],
  limitations: [
    "WebKit 26.6 was exercised; the Safari application and physical devices were not tested.",
    "A 720×450 CSS viewport represents 200% at 1440×900; native browser zoom was not automated.",
    "Editing and staging used synthetic in-memory fixtures; this does not certify production persistence or authorization.",
  ],
  errors: [],
};
const engines = process.env.NEXUS_UI_ENGINE
  ? [process.env.NEXUS_UI_ENGINE]
  : ["chromium", "webkit"];
for (const engine of engines) {
  const type = engine === "webkit" ? webkit : chromium;
  const options = { headless: true };
  if (engine === "chromium" && !existsSync(type.executablePath()))
    options.executablePath = "/Applications/Google Chrome.app/Contents/MacOS/Google Chrome";
  if (engine === "webkit" && !existsSync(type.executablePath())) {
    report.limitations.push("WebKit runtime unavailable; Safari not tested.");
    continue;
  }
  const browser = await type.launch(options);
  const page = await browser.newPage({
    locale: "pt-BR",
    viewport: { width: 1440, height: 900 },
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
  const goto = async (path, extra = {}) => {
    const url = new URL(base);
    url.search = new URLSearchParams({
      page: "nr-33",
      scenario: "nr-contextual",
      nrPath: path,
      cliente: client,
      unidade: unit,
      ...extra,
    }).toString();
    await page.goto(url.href, { waitUntil: "domcontentloaded" });
    await page
      .getByRole("heading", {
        name: extra.page === "nr-35" ? "Trabalho em altura" : "Espaços confinados",
        exact: true,
      })
      .waitFor();
  };
  const check = async (name, work) => {
    await work();
    report.checks.push({ engine, name, pass: true });
  };
  const noOverflow = async () => {
    expect(
      await page.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth + 1),
    ).toBe(true);
  };
  const screenshot = async (name) => {
    await page.screenshot({ path: `${directory}/${engine}-${name}.png` });
  };
  try {
    await check(
      "Computed semantic colors meet WCAG AA text, control boundary and focus contrast",
      async () => {
        await goto("locais");
        await page.locator(".nr-context").waitFor();
        const ratios = await page.evaluate(() => {
          const styles = getComputedStyle(document.querySelector(".nx-nr-workspace"));
          const contextStyles = getComputedStyle(document.querySelector(".nr-context"));
          const canvas = document.createElement("canvas");
          canvas.width = canvas.height = 1;
          const context = canvas.getContext("2d", { willReadFrequently: true });
          const luminance = (token) => {
            context.clearRect(0, 0, 1, 1);
            const color =
              styles.getPropertyValue(token).trim() || contextStyles.getPropertyValue(token).trim();
            if (!color) throw new Error(`Missing computed color token ${token}`);
            context.fillStyle = color;
            context.fillRect(0, 0, 1, 1);
            const channels = Array.from(context.getImageData(0, 0, 1, 1).data)
              .slice(0, 3)
              .map((channel) => {
                const value = channel / 255;
                return value <= 0.04045 ? value / 12.92 : ((value + 0.055) / 1.055) ** 2.4;
              });
            return 0.2126 * channels[0] + 0.7152 * channels[1] + 0.0722 * channels[2];
          };
          return [
            ["--nr-text", "--nr-surface-card", 4.5],
            ["--nr-text", "--nr-surface-workspace", 4.5],
            ["--nr-text-subtle", "--nr-surface-card", 4.5],
            ["--nr-text-subtle", "--nr-surface-workspace", 4.5],
            ["--nr-frame-text", "--nr-frame", 4.5],
            ["--nr-frame-muted", "--nr-frame", 4.5],
            ["--nr-border-strong", "--nr-surface-field", 3],
            ["--nr-focus", "--nr-surface-field", 3],
            ["--nr-text", "--nr-selection", 4.5],
            ["--nr-warning", "--nr-surface-card", 4.5],
            ["--nr-critical", "--nr-surface-card", 4.5],
            ["--nr-text", "--nr-context-control", 4.5],
            ["--nr-text", "--nr-context-marker", 4.5],
          ].map(([foreground, background, minimum]) => {
            const first = luminance(foreground),
              second = luminance(background);
            return {
              foreground,
              background,
              minimum,
              ratio: (Math.max(first, second) + 0.05) / (Math.min(first, second) + 0.05),
            };
          });
        });
        report.contrast.push({ engine, ratios });
        for (const pair of ratios)
          expect(pair.ratio, `${pair.foreground} on ${pair.background}`).toBeGreaterThanOrEqual(
            pair.minimum,
          );
      },
    );
    await check(
      "The eight destinations keep their exact labels, order and URLs for both standards",
      async () => {
        const labels = [
          "Painel",
          "Clientes",
          "Levantamento",
          "Locais",
          "Documentos",
          "Pendências",
          "Regras e biblioteca",
          "Conferência",
        ];
        const paths = [
          "",
          "/clientes",
          "/levantamentos",
          "/locais",
          "/documentos",
          "/pendencias",
          "/biblioteca",
          "/conferencia",
        ];
        for (const nr of ["33", "35"]) {
          await goto("locais", { page: `nr-${nr}` });
          const nav = page.getByRole("navigation", { name: `Áreas NR-${nr}`, exact: true });
          await expect(nav.getByRole("link")).toHaveText(labels);
          const urls = await nav
            .getByRole("link")
            .evaluateAll((links) => links.map((link) => new URL(link.href).pathname));
          expect(urls).toEqual(paths.map((path) => `/nr-${nr}${path}`));
        }
      },
    );
    await check(
      "Filtering and pagination return to the originating local card with context, scroll and focus and no detail query per card",
      async () => {
        await goto("locais", { nrExtraLocals: "40" });
        const filter = page.getByRole("searchbox", { name: "Buscar locais", exact: true });
        await filter.fill("retorno");
        const list = page.getByRole("list", { name: "Inventário técnico da unidade", exact: true });
        await expect(list.getByRole("article")).toHaveCount(25);
        await page.getByRole("button", { name: "Próxima", exact: true }).click();
        await expect(list.getByRole("article")).toHaveCount(15);
        await expect.poll(() => new URL(page.url()).searchParams.get("pagina")).toBe("1");
        expect(
          await page.evaluate(
            () =>
              window.__nexusCalls.filter(
                (call) => call.name === "nrConsultar" && call.data?.operacao === "detalhe",
              ).length,
          ),
        ).toBe(0);
        const last = list.getByRole("article").last();
        const id = await last.getAttribute("data-record-id");
        await last.scrollIntoViewIfNeeded();
        const position = await page.evaluate(() => window.scrollY);
        expect(position).toBeGreaterThan(0);
        const navigations = await page.evaluate(() => window.__nexusNavigations.length);
        await last.getByRole("link", { name: /fotos$/ }).click();
        await expect(
          page.getByRole("heading", { name: "Fotos de campo", exact: true }),
        ).toBeVisible();
        expect(await page.evaluate(() => window.__nexusNavigations.length)).toBe(navigations + 1);
        expect(new URL(page.url()).searchParams.get("ficha")).toBe("fotos");
        await page.getByRole("link", { name: "Voltar à lista", exact: true }).click();
        await expect(list.getByRole("article")).toHaveCount(15);
        await expect(filter).toHaveValue("retorno");
        const params = new URL(page.url()).searchParams;
        expect(params.get("pagina")).toBe("1");
        expect(params.get("cliente")).toBe(client);
        expect(params.get("unidade")).toBe(unit);
        await expect(list.locator(`[data-record-id="${id}"] h3 a`)).toBeFocused();
        await expect.poll(() => page.evaluate(() => window.scrollY)).toBeCloseTo(position, 0);
        await screenshot("collection-return-page2-1440");
      },
    );
    await check(
      "Conference preserves TAG evidence, name divergence and explicit local destination",
      async () => {
        await goto("conferencia");
        await page.getByRole("textbox", { name: "TAG externa", exact: true }).fill("EC 01");
        await page
          .getByRole("textbox", { name: "Nome externo", exact: true })
          .fill("Referência divergente sintética");
        await page.getByRole("button", { name: "Conferir cadastro", exact: true }).click();
        const list = page.getByRole("list", { name: "Candidatos de correspondência", exact: true });
        await expect(list.getByRole("article")).toHaveCount(1);
        await expect(list.getByText("TAG igual nesta unidade", { exact: true })).toBeVisible();
        await expect(
          list.getByText("Nome divergente da referência externa", { exact: true }),
        ).toBeVisible();
        await expect(list.getByRole("link", { name: /^Abrir ficha de EC 01/ })).toBeVisible();
        await noOverflow();
        await screenshot("conference-1440");
      },
    );
    await check(
      "Local document links remain in context and technical history retains all seven narratives and authors",
      async () => {
        await goto(`locais/${local}`, { ficha: "documentos" });
        const related = page.getByRole("list", {
          name: "Documentos vinculados ao local",
          exact: true,
        });
        await expect(related.getByRole("article").first()).toBeVisible();
        await expect(
          related.getByRole("link", { name: /^Abrir Cadastro sintético/ }),
        ).toBeVisible();
        await screenshot("related-documents-1440");
        await page
          .getByRole("navigation", { name: "Áreas da ficha técnica" })
          .getByRole("link", { name: "Histórico", exact: true })
          .click();
        const history = page.getByRole("region", {
          name: "Histórico técnico da origem",
          exact: true,
        });
        await expect(history.getByRole("article")).toHaveCount(7);
        await expect(history.getByText(/Narrativa integral sintética 7:/)).toBeVisible();
        await expect(
          history.getByText(/Autor histórico sintético \(autoria histórica\)/).first(),
        ).toBeVisible();
        await noOverflow();
        await screenshot("technical-history-1440");
      },
    );
    await check(
      "B07 values and B16 subrecords, zero quantity and unknown source fields remain readable",
      async () => {
        await goto("levantamentos");
        const surveyCard = page.locator(".nr-card-levantamento").filter({
          has: page.getByRole("link", { name: "Levantamento sintético EC 01", exact: true }),
        });
        await expect(surveyCard.getByText("Família", { exact: true })).toBeVisible();
        await expect(surveyCard.getByText("Tanques", { exact: true })).toBeVisible();
        await surveyCard.getByRole("link", { name: "Abrir levantamento", exact: true }).click();
        const reader = page.locator(".nr-survey");
        await reader.getByRole("button", { name: /^B07 / }).click();
        await expect(
          reader.getByRole("heading", { name: "Diâmetro (m)", exact: true }),
        ).toBeVisible();
        await expect(reader.getByText("2.5", { exact: true })).toBeVisible();
        await expect(reader.locator("section:not([hidden]) > progress")).toHaveAttribute(
          "aria-label",
          /respostas registradas$/,
        );
        await screenshot("b07-reader-1440");
        await reader.getByRole("button", { name: /^B16 / }).click();
        await expect(
          reader.getByRole("article", { name: "Sistemas levantados, registro 1", exact: true }),
        ).toBeVisible();
        await expect(reader.getByText("Sistema fictício", { exact: true })).toBeVisible();
        await expect(reader.getByText("0", { exact: true })).toBeVisible();
        await reader.getByText("Outras informações preservadas", { exact: true }).first().click();
        await expect(
          reader.getByText("Propriedade desconhecida preservada", { exact: true }),
        ).toBeVisible();
        await noOverflow();
        await screenshot("b16-reader-1440");
      },
    );
    await check(
      "B16 repeated items restore focus after deletion and Cancel preserves the saved record",
      async () => {
        await page.getByRole("button", { name: "Editar registro", exact: true }).click();
        const dialog = page.getByRole("dialog", { name: "Editar levantamento", exact: true });
        await dialog
          .locator(".nr-survey-navigation")
          .getByRole("button", { name: /^B16 / })
          .click();
        await dialog.getByRole("button", { name: "Adicionar sistema", exact: true }).click();
        await dialog
          .getByRole("textbox", { name: "Descrição do sistema", exact: true })
          .nth(1)
          .fill("Alteração a descartar no laboratório");
        await dialog.getByRole("button", { name: "Remover registro 2", exact: true }).click();
        await expect(
          dialog.getByRole("button", { name: "Remover registro 1", exact: true }),
        ).toBeFocused();
        await dialog
          .getByRole("textbox", { name: "Descrição do sistema", exact: true })
          .fill("Edição não salva");
        await dialog.getByRole("button", { name: "Cancelar", exact: true }).click();
        await expect(
          dialog.getByRole("button", { name: "Continuar editando", exact: true }),
        ).toBeVisible();
        await dialog.getByRole("button", { name: "Continuar editando", exact: true }).click();
        await expect(
          dialog.getByRole("textbox", { name: "Descrição do sistema", exact: true }),
        ).toHaveValue("Edição não salva");
        await page.keyboard.press("Escape");
        await dialog.getByRole("button", { name: "Descartar alterações", exact: true }).click();
        await expect(dialog).toHaveCount(0);
        await expect(
          page.getByRole("button", { name: "Editar registro", exact: true }),
        ).toBeFocused();
        await page.getByRole("button", { name: "Editar registro", exact: true }).click();
        await dialog
          .locator(".nr-survey-navigation")
          .getByRole("button", { name: /^B16 / })
          .click();
        await expect(
          dialog.getByRole("textbox", { name: "Descrição do sistema", exact: true }),
        ).toHaveValue("Sistema fictício");
        await screenshot("b16-editor-1440");
        await dialog.getByRole("button", { name: "Cancelar", exact: true }).click();
        await expect(dialog).toHaveCount(0);
      },
    );
    await check(
      "Partial B07 save keeps B16 data and repeated clicks produce one saved version",
      async () => {
        await page.getByRole("button", { name: "Editar registro", exact: true }).click();
        const dialog = page.getByRole("dialog", { name: "Editar levantamento", exact: true });
        await dialog
          .locator(".nr-survey-navigation")
          .getByRole("button", { name: /^B07 / })
          .click();
        await dialog.getByRole("spinbutton", { name: /^Diâmetro \(m\)/ }).fill("2.6");
        await dialog
          .getByRole("button", { name: "Salvar parcialmente", exact: true })
          .evaluate((element) => {
            element.click();
            element.click();
          });
        await expect(dialog).toHaveCount(0);
        await page.getByRole("button", { name: "Editar registro", exact: true }).click();
        await expect(
          dialog.getByText("Versão 2 carregada. Uma alteração concorrente exige comparação.", {
            exact: true,
          }),
        ).toBeVisible();
        await dialog
          .locator(".nr-survey-navigation")
          .getByRole("button", { name: /^B07 / })
          .click();
        await expect(dialog.getByRole("spinbutton", { name: /^Diâmetro \(m\)/ })).toHaveValue(
          "2.6",
        );
        await dialog
          .locator(".nr-survey-navigation")
          .getByRole("button", { name: /^B16 / })
          .click();
        await expect(
          dialog.getByRole("textbox", { name: "Descrição do sistema", exact: true }),
        ).toHaveValue("Sistema fictício");
        await dialog.getByRole("button", { name: "Cancelar", exact: true }).click();
        await expect(dialog).toHaveCount(0);
      },
    );
    await check(
      "Survey form remains usable at desktop, tablet and mobile widths with no page overflow",
      async () => {
        for (const viewport of [
          { width: 1366, height: 768 },
          { width: 1920, height: 1080 },
          { width: 2560, height: 1440 },
          { width: 1024, height: 768 },
          { width: 720, height: 450 },
          { width: 390, height: 844 },
        ]) {
          await page.setViewportSize(viewport);
          await goto(`levantamentos/${survey}`);
          await page.getByRole("button", { name: "Editar registro", exact: true }).click();
          const dialog = page.getByRole("dialog", { name: "Editar levantamento", exact: true });
          if (viewport.width <= 900)
            await dialog
              .getByRole("combobox", { name: "Bloco do levantamento", exact: true })
              .selectOption("B16");
          else
            await dialog
              .locator(".nr-survey-navigation")
              .getByRole("button", { name: /^B16 / })
              .click();
          await expect(
            dialog.getByRole("textbox", { name: "Descrição do sistema", exact: true }),
          ).toBeVisible();
          await noOverflow();
          const bounds = await dialog.boundingBox();
          expect(bounds.x).toBeGreaterThanOrEqual(0);
          expect(bounds.y).toBeGreaterThanOrEqual(0);
          expect(bounds.x + bounds.width).toBeLessThanOrEqual(viewport.width + 1);
          expect(bounds.y + bounds.height).toBeLessThanOrEqual(viewport.height + 1);
          await screenshot(`b16-editor-${viewport.width}`);
          await dialog.getByRole("button", { name: "Cancelar", exact: true }).click();
          await expect(dialog).toHaveCount(0);
        }
      },
    );
    await check(
      "Editable copies remain separate cards with explicit original lineage",
      async () => {
        await page.setViewportSize({ width: 1440, height: 900 });
        await goto(`documentos/${document}`);
        const list = page.getByRole("list", {
          name: "Cópias editáveis ligadas ao original",
          exact: true,
        });
        await expect(list.getByRole("article")).toHaveCount(1);
        await expect(
          list.getByText("Cópia editável sintética do cadastro", { exact: true }),
        ).toBeVisible();
        await expect(
          list.getByRole("link", { name: "Abrir cópia editável", exact: true }),
        ).toBeVisible();
        await screenshot("document-lineage-1440");
      },
    );
    await check(
      "Historic file metadata and lazy record versions keep distinct states and focus",
      async () => {
        await page
          .getByText("Versões históricas do arquivo na origem", { exact: true })
          .first()
          .click();
        const files = page.getByRole("list", {
          name: "Versões históricas do arquivo",
          exact: true,
        });
        await expect(files.getByRole("article")).toHaveCount(1);
        await expect(
          files.getByText("Binário histórico indisponível", { exact: true }),
        ).toBeVisible();
        await expect(
          files.getByRole("button", { name: "Baixar esta versão histórica", exact: true }),
        ).toHaveCount(0);
        await screenshot("historical-file-metadata-1440");
        await page.getByText("Versões preservadas", { exact: true }).click();
        const versions = page.getByRole("list", { name: "Versões preservadas", exact: true });
        await expect(versions.getByRole("article")).toHaveCount(1);
        const opener = versions.getByRole("button", {
          name: "Abrir versão em leitura",
          exact: true,
        });
        await opener.click();
        const revision = page.getByRole("dialog", {
          name: "Revisão 1 · somente leitura",
          exact: true,
        });
        await expect(revision).toBeVisible();
        await revision.getByRole("button", { name: "Fechar revisão", exact: true }).click();
        await expect(opener).toBeFocused();
      },
    );
    await check(
      "Audit event cards preserve pagination and load complete snapshots only on demand",
      async () => {
        await page.getByText("Operações da Nexus", { exact: true }).click();
        const events = page.getByRole("list", { name: "Eventos de auditoria", exact: true });
        await expect(events.getByRole("article")).toHaveCount(25);
        expect(
          await page.evaluate(() =>
            window.__nexusCalls.some((call) => call.name === "nrHistoricoDetalhe"),
          ),
        ).toBe(false);
        await page.getByRole("button", { name: "Carregar mais eventos", exact: true }).click();
        await expect(events.getByRole("article")).toHaveCount(28);
        const opener = events.getByRole("button", { name: "Abrir evento", exact: true }).first();
        await opener.click();
        const dialog = page.getByRole("dialog", { name: "Evento de auditoria", exact: true });
        await expect(
          dialog.getByText(
            "Texto integral sintético do motivo. Este conteúdo só é carregado ao abrir o evento.",
            { exact: true },
          ),
        ).toBeVisible();
        await screenshot("audit-event-1440");
        await dialog.getByRole("button", { name: "Fechar evento", exact: true }).click();
        await expect(opener).toBeFocused();
      },
    );
    await check(
      "Administrative import cards preserve lot inspection, item evidence, staged mappings and actions",
      async () => {
        await goto("configuracoes");
        const consumption = page.getByRole("region", {
          name: "Consumo físico por unidade",
          exact: true,
        });
        await expect(consumption.getByRole("article")).toHaveCount(1);
        await expect(consumption).toContainText("Objetos");
        await expect(consumption).toContainText("MiB");
        await expect(
          page
            .getByRole("region", { name: "Consumo físico por bucket privado", exact: true })
            .getByRole("article"),
        ).toHaveCount(1);
        await page.setViewportSize({ width: 390, height: 844 });
        await consumption.scrollIntoViewIfNeeded();
        expect(
          await page.evaluate(() => document.documentElement.scrollWidth - innerWidth),
        ).toBeLessThanOrEqual(1);
        await screenshot("storage-cards-390");
        await page.setViewportSize({ width: 1440, height: 900 });
        const lots = page.getByRole("list", { name: "Lotes de importação", exact: true });
        await expect(lots.getByRole("article")).toHaveCount(1);
        await lots.getByRole("button", { name: "Inspecionar lote", exact: true }).click();
        const items = page.getByRole("list", { name: "Itens do lote de importação", exact: true });
        await expect(items.getByRole("article")).toHaveCount(3);
        const opener = items.getByRole("button", { name: "Inspecionar item", exact: true }).first();
        await opener.click();
        const dialog = page.getByRole("dialog", { name: "Rastreabilidade do item", exact: true });
        await expect(
          dialog.getByText("Motivo sintético preservado para conferência da interface.", {
            exact: true,
          }),
        ).toBeVisible();
        await screenshot("import-item-evidence-1440");
        await dialog.getByRole("button", { name: "Fechar inspeção", exact: true }).click();
        await expect(opener).toBeFocused();
        const plan = {
          format: "nexus-nr-import-plan-v1",
          organization_id: "10000000-0000-4000-8000-000000000001",
          origem: "Mapeamentos sintéticos da revisão visual",
          snapshot_inicio: "2026-10-30T12:00:00Z",
          snapshot_fim: "2026-10-30T12:00:00Z",
          manifesto: { sintetico: true },
          itens: [1, 2].map((index) => ({
            sequencia: index,
            tipo: "referencia",
            externo_id: `somente-laboratorio-${index}`,
            payload: { sintetico: true },
            destino: {
              entidade: "referencias",
              registro: { titulo: `Registro sintético ${index}` },
            },
            sha256: "a".repeat(64),
            capturado_em: "2026-10-30T12:00:00Z",
          })),
        };
        await page
          .getByLabel("Manifesto JSON de metadados (até 20 MiB)", { exact: true })
          .setInputFiles({
            name: "manifesto-somente-laboratorio.json",
            mimeType: "application/json",
            buffer: Buffer.from(JSON.stringify(plan)),
          });
        const preview = page.getByRole("list", {
          name: "Prévia dos mapeamentos declarados",
          exact: true,
        });
        await expect(preview.getByRole("article")).toHaveCount(2);
        await screenshot("import-mapping-cards-1440");
        await page
          .getByRole("button", {
            name: "Confirmar destino e enviar para staging privado",
            exact: true,
          })
          .click();
        const queue = page.getByRole("list", { name: "Itens da fila selecionada", exact: true });
        await expect(queue.getByRole("article")).toHaveCount(2);
        await expect(queue.getByText(/somente-laboratorio-1/)).toBeVisible();
        await screenshot("import-queue-cards-1440");
      },
    );
    await check(
      "A concurrent-version error keeps the user's filling and explicit discard remains available",
      async () => {
        await goto(`locais/${local}`, { scenario: "nr-conflict" });
        await page.getByRole("button", { name: "Editar registro", exact: true }).click();
        const dialog = page.getByRole("dialog", { name: "Editar local", exact: true });
        const title = dialog.getByRole("textbox", { name: /^Nome do local/ });
        await title.fill("Preenchimento retido após conflito simulado");
        await dialog.getByRole("button", { name: "Salvar registro", exact: true }).click();
        await expect(dialog.getByText("Não foi salvo.", { exact: true })).toBeVisible();
        await expect(title).toHaveValue("Preenchimento retido após conflito simulado");
        await screenshot("conflict-keeps-filling-1440");
        await page.keyboard.press("Escape");
        await dialog.getByRole("button", { name: "Continuar editando", exact: true }).click();
        await expect(title).toHaveValue("Preenchimento retido após conflito simulado");
        await dialog.getByRole("button", { name: "Cancelar", exact: true }).click();
        await dialog.getByRole("button", { name: "Descartar alterações", exact: true }).click();
        await expect(dialog).toHaveCount(0);
      },
    );
  } catch (error) {
    report.errors.push({ engine, message: String(error) });
    await screenshot("failure");
  } finally {
    await browser.close();
  }
}
report.success = report.errors.length === 0;
await writeFile(`${directory}/results.json`, JSON.stringify(report, null, 2));
if (!report.success) throw new Error(JSON.stringify(report.errors, null, 2));
console.log(
  JSON.stringify({
    checks: report.checks.length,
    limitations: report.limitations,
    success: report.success,
  }),
);
