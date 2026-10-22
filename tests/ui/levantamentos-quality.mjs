// Actual source components with isolated fixtures. Not connected-backend E2E or device certification.
import { chromium, expect } from "@playwright/test";
import { mkdir, writeFile } from "node:fs/promises";
import { evidenceRoot } from "./evidence.mjs";

const base = process.env.NEXUS_UI_URL || "http://127.0.0.1:4182";
const directory = `${evidenceRoot}/levantamentos`;
await mkdir(directory, { recursive: true });
const browser = await chromium.launch({ headless: true });
const page = await browser.newPage({ locale: "pt-BR", reducedMotion: "reduce" });
page.setDefaultTimeout(10000);
const report = {
  method:
    "UI components with synthetic network adapter; no Auth/SQL/Storage HTTP or production persistence proof",
  layouts: [],
  checks: [],
  errors: [],
  success: false,
};
page.on("pageerror", (error) => report.errors.push(error.message));
const detail =
  "&levantamento=70000000-0000-4000-8000-000000000001&ponto=72000000-0000-4000-8000-000000000001";
const medicaoA = "73000000-0000-4000-8000-000000000001";
async function go(extra = "") {
  await page.goto(`${base}/?page=levantamentos${extra}`, { waitUntil: "networkidle" });
  await page.getByRole("heading", { level: 1 }).waitFor();
  await page.evaluate(() => document.fonts.ready);
}
async function check(name, work) {
  await work();
  report.checks.push({ name, pass: true });
}
async function layout(name, width) {
  const metrics = await page.evaluate(() => ({
    width: innerWidth,
    scrollWidth: document.documentElement.scrollWidth,
  }));
  const dialog = page.getByRole("dialog");
  if (await dialog.count()) {
    const bounds = await dialog.boundingBox();
    expect(bounds.x).toBeGreaterThanOrEqual(0);
    expect(bounds.y).toBeGreaterThanOrEqual(0);
    expect(bounds.x + bounds.width).toBeLessThanOrEqual(width + 1);
    expect(bounds.y + bounds.height).toBeLessThanOrEqual((width < 768 ? 844 : 900) + 1);
  }
  expect(metrics.scrollWidth, `${name} at ${width}px`).toBeLessThanOrEqual(width);
  report.layouts.push({ name, ...metrics });
  if ([390, 1366].includes(width))
    await page.screenshot({ path: `${directory}/${name}-${width}.png` });
}
async function fillCreation(label = "Levantamento do teste isolado") {
  const dialog = page.getByRole("dialog");
  await dialog
    .getByRole("combobox", { name: /^Cliente/ })
    .selectOption("20000000-0000-4000-8000-000000000001");
  await dialog
    .getByRole("combobox", { name: /^Unidade/ })
    .selectOption("21000000-0000-4000-8000-000000000001");
  await dialog.getByRole("textbox", { name: "Finalidade *", exact: true }).fill(label);
  await dialog
    .getByRole("combobox", { name: /^Responsável/ })
    .selectOption("30000000-0000-4000-8000-000000000001");
}
try {
  for (const width of [360, 390, 768, 1024, 1366, 1440]) {
    await page.setViewportSize({ width, height: width < 768 ? 844 : 900 });
    await go();
    await expect(page.getByRole("list", { name: "Levantamentos encontrados" })).toBeVisible();
    await layout("lista", width);
    await page.getByRole("button", { name: "Novo levantamento", exact: true }).click();
    await expect(
      page.getByRole("dialog", { name: "Criar levantamento", exact: true }),
    ).toBeVisible();
    await layout("cadastro", width);
    await page.keyboard.press("Escape");
    await go(detail);
    await expect(page.getByRole("heading", { name: "Pontos e áreas", exact: true })).toBeVisible();
    await layout("coleta", width);
    await page.getByRole("button", { name: "Adicionar ponto", exact: true }).click();
    await layout("ponto", width);
    await page.keyboard.press("Escape");
    await page.getByRole("button", { name: "Adicionar medida", exact: true }).click();
    await layout("medida", width);
    await page.keyboard.press("Escape");
  }
  await page.setViewportSize({ width: 390, height: 844 });
  await check(
    "invalid creation focuses the first field and Escape restores the trigger",
    async () => {
      await go();
      const trigger = page.getByRole("button", { name: "Novo levantamento", exact: true });
      await trigger.click();
      const dialog = page.getByRole("dialog");
      await dialog.getByRole("button", { name: "Criar levantamento", exact: true }).click();
      await expect(dialog.getByRole("alert")).toContainText("Confira os campos");
      await expect(dialog.getByRole("combobox", { name: /^Cliente/ })).toBeFocused();
      await expect(dialog.getByRole("combobox", { name: /^Cliente/ })).toHaveAttribute(
        "aria-invalid",
        "true",
      );
      await page.screenshot({ path: `${directory}/validacao-390.png` });
      await page.keyboard.press("Escape");
      await expect(dialog).not.toBeVisible();
      await expect(trigger).toBeFocused();
    },
  );
  await check("dirty creation preserves edits until explicit discard", async () => {
    await page.getByRole("button", { name: "Novo levantamento", exact: true }).click();
    await page
      .getByRole("textbox", { name: "Finalidade *", exact: true })
      .fill("Coleta de teste ainda não salva");
    await page.keyboard.press("Escape");
    await expect(
      page.getByRole("button", { name: "Continuar editando", exact: true }),
    ).toBeVisible();
    await page.getByRole("button", { name: "Continuar editando", exact: true }).click();
    await expect(page.getByRole("textbox", { name: "Finalidade *", exact: true })).toHaveValue(
      "Coleta de teste ainda não salva",
    );
    await page.getByRole("button", { name: "Voltar ao levantamento", exact: true }).click();
    await page.getByRole("button", { name: "Descartar alterações", exact: true }).click();
    await expect(page.getByRole("dialog")).not.toBeVisible();
  });
  await check(
    "write failure preserves completed fields and reports that the server did not confirm",
    async () => {
      await go("&scenario=write-error");
      await page.getByRole("button", { name: "Novo levantamento", exact: true }).click();
      await fillCreation("Conteúdo de teste preservado após falha");
      await page
        .getByRole("dialog")
        .getByRole("button", { name: "Criar levantamento", exact: true })
        .click();
      await expect(
        page
          .getByRole("dialog")
          .getByRole("alert")
          .filter({ hasText: /servidor não confirmou/ }),
      ).toBeVisible();
      await expect(page.getByRole("textbox", { name: "Finalidade *", exact: true })).toHaveValue(
        "Conteúdo de teste preservado após falha",
      );
      await page.screenshot({ path: `${directory}/falha-escrita-390.png` });
    },
  );
  await check(
    "a point edit conflict keeps input and allows comparing the current server version",
    async () => {
      await go(`${detail}&scenario=write-conflict`);
      await page.getByRole("button", { name: "Editar ponto", exact: true }).click();
      await page
        .getByRole("textbox", { name: "Nome do ponto ou área *", exact: true })
        .fill("Rascunho local preservado em conflito");
      await page
        .getByRole("dialog")
        .getByRole("button", { name: "Salvar ponto", exact: true })
        .click();
      await expect(
        page.getByRole("textbox", { name: "Nome do ponto ou área *", exact: true }),
      ).toHaveValue("Rascunho local preservado em conflito");
      await page
        .getByRole("button", { name: "Consultar versão atual para comparar", exact: true })
        .click();
      await expect(page.getByText(/^Servidor: revisão V/).first()).toBeVisible();
      await page.screenshot({ path: `${directory}/conflito-ponto-390.png` });
    },
  );
  await check(
    "server-saved fixture point and measurement stay in the same selected context",
    async () => {
      await go(detail);
      await page.getByRole("button", { name: "Adicionar ponto", exact: true }).click();
      await page.getByRole("textbox", { name: "Código local *", exact: true }).fill("P03");
      await page
        .getByRole("textbox", { name: "Nome do ponto ou área *", exact: true })
        .fill("Ponto da verificação isolada");
      await page
        .getByRole("dialog")
        .getByRole("button", { name: "Salvar ponto", exact: true })
        .click();
      await expect(
        page.getByRole("heading", { name: "P03 · Ponto da verificação isolada", exact: true }),
      ).toBeVisible();
      await page.getByRole("button", { name: "Adicionar medida", exact: true }).click();
      await page
        .getByRole("textbox", { name: "Identificação da medida *", exact: true })
        .fill("Comprimento da fixture");
      await page.getByRole("textbox", { name: "Valor", exact: true }).fill("3,125001");
      await page.getByRole("combobox", { name: "Unidade", exact: true }).selectOption("m");
      await page
        .getByRole("textbox", { name: "Precisão declarada (mesma unidade)", exact: true })
        .fill("0,001");
      await page
        .getByRole("textbox", { name: "Método e referência da coleta", exact: true })
        .fill("Referência de teste isolado");
      await page
        .getByRole("dialog")
        .getByRole("button", { name: "Salvar medida", exact: true })
        .click();
      await expect(page.getByText("Comprimento da fixture", { exact: true })).toBeVisible();
      await expect(page.getByText("3,125001 m", { exact: true })).toBeVisible();
    },
  );
  await check("list filters survive URL reload and return from detail", async () => {
    await go();
    await page
      .getByRole("searchbox", { name: "Buscar levantamento", exact: true })
      .fill("manutenção");
    await page.getByRole("combobox", { name: "Estado", exact: true }).selectOption("em_coleta");
    await expect(page.getByRole("list", { name: "Levantamentos encontrados" })).toBeVisible();
    await page.reload({ waitUntil: "networkidle" });
    await expect(
      page.getByRole("searchbox", { name: "Buscar levantamento", exact: true }),
    ).toHaveValue("manutenção");
    await expect(page.getByRole("combobox", { name: "Estado", exact: true })).toHaveValue(
      "em_coleta",
    );
    await page
      .getByRole("list", { name: "Levantamentos encontrados" })
      .getByRole("button")
      .first()
      .click();
    await page.getByRole("button", { name: "Voltar aos levantamentos", exact: true }).click();
    await expect(
      page.getByRole("searchbox", { name: "Buscar levantamento", exact: true }),
    ).toHaveValue("manutenção");
  });
  await check("a focus refetch cannot silently advance the editing base version", async () => {
    await go(`${detail}&scenario=version-refetch`);
    await page.getByRole("button", { name: "Editar contexto", exact: true }).click();
    const local = "Contexto local preservado enquanto outra sessão salva V2";
    await page.getByRole("textbox", { name: "Finalidade *", exact: true }).fill(local);
    // Query v5 listens to visibilitychange; use the same DOM event as returning to the tab.
    await page.evaluate(() => window.dispatchEvent(new Event("visibilitychange")));
    await expect
      .poll(async () =>
        page.evaluate(
          () => window.__nexusCalls.filter((call) => call.name === "obterLevantamento").length,
        ),
      )
      .toBeGreaterThanOrEqual(2);
    await expect(
      page.getByText("Revisão V1 · versão de concorrência 2", { exact: true }),
    ).toHaveCount(1);
    await expect(page.getByRole("textbox", { name: "Finalidade *", exact: true })).toHaveValue(
      local,
    );
    await page
      .getByRole("dialog")
      .getByRole("button", { name: "Editar contexto", exact: true })
      .click();
    await expect(
      page
        .getByRole("dialog")
        .getByRole("alert")
        .filter({ hasText: /Outra pessoa alterou/ }),
    ).toBeVisible();
    const submitted = await page.evaluate(
      () =>
        window.__nexusCalls.filter((call) => call.name === "executarLevantamento").at(-1)?.payload
          .data,
    );
    expect(submitted.comando).toBe("contexto");
    expect(submitted.expected_version).toBe(1);
    await expect(page.getByRole("textbox", { name: "Finalidade *", exact: true })).toHaveValue(
      local,
    );
    await page.screenshot({ path: `${directory}/refetch-versao-conflito-390.png` });
  });
  await check(
    "pending file failure can be rechecked, cancelled and retried as a new intent",
    async () => {
      await go(`${detail}&scenario=upload-error`);
      const file = {
        name: "foto-da-fixture.png",
        mimeType: "image/png",
        buffer: Buffer.from(
          "iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mP8/x8AAwMCAO+aIOsAAAAASUVORK5CYII=",
          "base64",
        ),
      };
      await page.getByLabel("Adicionar foto", { exact: true }).setInputFiles(file);
      await expect(
        page
          .getByRole("alert")
          .filter({ hasText: /Armazenamento não confirmado no cenário isolado/ }),
      ).toBeVisible();
      await expect(page.getByText("foto-da-fixture.png", { exact: true })).toBeVisible();
      await page.getByRole("button", { name: "Reverificar armazenamento", exact: true }).click();
      await expect(
        page.getByRole("button", { name: "Cancelar envio pendente", exact: true }),
      ).toBeVisible();
      await page.getByRole("button", { name: "Cancelar envio pendente", exact: true }).click();
      await page
        .getByRole("textbox", { name: "Motivo do cancelamento", exact: true })
        .fill("Cancelamento da intenção de teste");
      await page.getByRole("button", { name: "Confirmar cancelamento", exact: true }).click();
      await expect(page.getByText("foto-da-fixture.png", { exact: true })).toHaveCount(0);
      await page.getByLabel("Adicionar foto", { exact: true }).setInputFiles(file);
      // Reusing the cancelled receipt would fail as unavailable instead of reaching confirmation.
      await expect(
        page
          .getByRole("alert")
          .filter({ hasText: /Armazenamento não confirmado no cenário isolado/ }),
      ).toBeVisible();
      await expect(page.getByText("foto-da-fixture.png", { exact: true })).toBeVisible();
      await expect(
        page.getByRole("button", { name: "Reverificar armazenamento", exact: true }),
      ).toHaveCount(1);
      await page.screenshot({ path: `${directory}/arquivo-falha-retry-390.png` });
    },
  );
  await check("empty query and failed query have different recoverable states", async () => {
    await go("&scenario=empty");
    await expect(page.getByText("Nenhum levantamento cadastrado", { exact: true })).toBeVisible();
    await go("&scenario=error");
    await expect(
      page.getByRole("button", { name: "Tentar novamente", exact: true }).first(),
    ).toBeVisible();
    await expect(page.getByText("Nenhum levantamento cadastrado", { exact: true })).toHaveCount(0);
  });
  await check(
    "approved measurement requires a comparison before adoption and opens its destination",
    async () => {
      await go(`${detail}&scenario=approved`);
      await page.getByRole("tab", { name: "Histórico e adoções", exact: true }).click();
      await page
        .getByRole("combobox", { name: "Medida aprovada", exact: true })
        .selectOption(medicaoA);
      await page
        .getByRole("combobox", { name: "Sistema em proposta rascunho", exact: true })
        .selectOption("75000000-0000-4000-8000-000000000001");
      await expect(
        page.getByRole("button", { name: "Adotar medida no rascunho", exact: true }),
      ).toHaveCount(0);
      await page.getByRole("button", { name: "Comparar antes de adotar", exact: true }).click();
      await expect(
        page.getByRole("region", { name: "Comparação de valores para adoção", exact: true }),
      ).toBeVisible();
      await page.getByRole("button", { name: "Adotar medida no rascunho", exact: true }).click();
      await expect(
        page.getByRole("link", { name: "Abrir dimensionamento de destino", exact: true }),
      ).toHaveAttribute("href", /78000000-0000-4000-8000-000000000001/);
      await page.screenshot({ path: `${directory}/adocao-390.png` });
    },
  );
  expect(report.errors).toEqual([]);
  report.success = true;
} catch (error) {
  report.failure = String(error);
  await page.screenshot({ path: `${directory}/failure.png` });
  throw error;
} finally {
  await writeFile(`${directory}/results.json`, `${JSON.stringify(report, null, 2)}\n`);
  await browser.close();
}
