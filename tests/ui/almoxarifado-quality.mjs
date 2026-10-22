// Source UI exercised with synthetic transport only. SQL tests prove the ledger and isolation.
import { chromium, expect } from "@playwright/test";
import { mkdir, writeFile } from "node:fs/promises";
import { evidenceRoot } from "./evidence.mjs";

const base = process.env.NEXUS_UI_URL || "http://127.0.0.1:4182";
const directory = `${evidenceRoot}/almoxarifado`;
await mkdir(directory, { recursive: true });
const browser = await chromium.launch({ headless: true });
const page = await browser.newPage({ locale: "pt-BR", reducedMotion: "reduce" });
page.setDefaultTimeout(10000);
const report = {
  method:
    "Actual source UI with isolated transport fixtures, not real Auth, SQL/RLS, concurrent reservations, Storage HTTP, operational persistence or physical-device proof",
  layouts: [],
  checks: [],
  errors: [],
  success: false,
};
page.on("pageerror", (error) => report.errors.push(error.message));
const ids = {
  materiais: "90000000-0000-4000-8000-000000000001",
  locais: "91000000-0000-4000-8000-000000000001",
  conferencias: "92000000-0000-4000-8000-000000000001",
  ferramentas: "93000000-0000-4000-8000-000000000001",
  reservas: "94000000-0000-4000-8000-000000000001",
  politicas_calibracao: "96000000-0000-4000-8000-000000000001",
  inventarios: "97000000-0000-4000-8000-000000000001",
  movimentos: "9a000000-0000-4000-8000-000000000001",
};
const person = "30000000-0000-4000-8000-000000000001";
const project = "99000000-0000-4000-8000-000000000001";
const titles = {
  salvar_local: "Salvar local de estoque",
  configurar_produto: "Configurar rastreabilidade do material",
  conferir_evento: "Conferir material recebido ou produzido",
  reclassificar_quarentena: "Conferir material em quarentena",
  transferir: "Transferir material entre locais",
  reservar: "Reservar material para execução",
  retirar: "Registrar retirada de material",
  consumir: "Registrar material consumido",
  devolver: "Devolver sobra de material",
  cancelar_reserva: "Cancelar saldo da reserva",
  estornar_evento: "Estornar recebimento ou produção",
  salvar_ferramenta: "Salvar ferramenta individual",
  alterar_condicao: "Alterar condição da ferramenta",
  reservar_ferramenta: "Reservar ferramenta para uma pessoa",
  retirar_ferramenta: "Retirar ferramenta reservada",
  devolver_ferramenta: "Conferir devolução da ferramenta",
  cancelar_custodia: "Cancelar reserva da ferramenta",
  publicar_politica_calibracao: "Publicar política de calibração",
  registrar_calibracao: "Registrar evidência de calibração",
  conferir_calibracao: "Conferir evidência de calibração",
  criar_inventario: "Registrar contagem de inventário",
  aprovar_inventario: "Aprovar ajuste da contagem",
  cancelar_inventario: "Cancelar contagem de inventário",
};
const form = page.getByRole("dialog");
async function go(extra = "") {
  await page.goto(`${base}/?page=almoxarifado${extra}`, { waitUntil: "networkidle" });
  await page.getByRole("heading", { name: "Almoxarifado e Ferramentas", exact: true }).waitFor();
  await page.evaluate(() => document.fonts.ready);
}
async function detail(tipo) {
  await go(
    `&aba=${tipo === "politicas_calibracao" ? "ferramentas" : tipo}&detalhe=${tipo}&registro=${ids[tipo]}`,
  );
  await page.getByRole("heading", { name: "Histórico da operação", exact: true }).waitFor();
}
async function check(name, work) {
  await work();
  report.checks.push({ name, pass: true });
}
async function refetch(values = {}) {
  await page.evaluate((patch) => {
    Object.assign(window, patch);
    window.dispatchEvent(new Event("visibilitychange"));
  }, values);
}
async function layout(name, width) {
  const metrics = await page.evaluate(() => ({
    width: innerWidth,
    scrollWidth: document.documentElement.scrollWidth,
  }));
  expect(metrics.scrollWidth, `${name} at ${width}px`).toBeLessThanOrEqual(width);
  if (await form.count()) {
    const box = await form.boundingBox();
    expect(box.x).toBeGreaterThanOrEqual(0);
    expect(box.y).toBeGreaterThanOrEqual(0);
    expect(box.x + box.width).toBeLessThanOrEqual(width + 1);
    expect(box.y + box.height).toBeLessThanOrEqual((width < 768 ? 844 : 900) + 1);
  }
  report.layouts.push({ name, ...metrics });
  if (
    [390, 1366].includes(width) &&
    ["lista-materiais", "ficha-ferramentas", "form-conferir_evento", "form-reservar"].includes(name)
  )
    await page.screenshot({ path: `${directory}/${name}-${width}.png` });
}
async function open(command) {
  await page.getByRole("button", { name: titles[command], exact: true }).first().click();
  await expect(form).toBeVisible();
}
async function close() {
  await page.keyboard.press("Escape");
  if (await form.getByRole("button", { name: "Descartar alterações", exact: true }).count())
    await form.getByRole("button", { name: "Descartar alterações", exact: true }).click();
  await expect(form).toHaveCount(0);
}
async function submit(command) {
  await form.getByRole("button", { name: titles[command], exact: true }).click();
}
async function seedReservation() {
  await page.evaluate(() => {
    const row = window.__nexusStock.reservas[0];
    row.estado = "retirada";
    Object.assign(row.quantidades, {
      quantidade: "8",
      reservada: "2",
      retirada: "6",
      consumida: "0",
      devolvida: "0",
      em_poder: "6",
      pendente_retirada: "2",
    });
    window.dispatchEvent(new Event("visibilitychange"));
  });
  await expect(page.getByRole("button", { name: titles.retirar, exact: true })).toBeVisible();
}
async function seedCustodies() {
  await page.evaluate(() => {
    const common = {
      ferramenta_id: window.__nexusStock.ferramentas[0].id,
      pessoa_id: "30000000-0000-4000-8000-000000000001",
      pessoa_nome: "Pessoa de teste com custódia",
      inicio: "2026-10-22T12:00:00Z",
      fim: "2026-10-22T18:00:00Z",
      timezone: "America/Sao_Paulo",
      retirada_em: null,
      devolvida_em: null,
      condicao_devolucao: null,
      motivo: null,
      version: 1,
    };
    window.__nexusStock.custodias.push(
      { ...common, id: crypto.randomUUID(), estado: "reservada" },
      {
        ...common,
        id: crypto.randomUUID(),
        estado: "retirada",
        retirada_em: "2026-10-22T12:00:00Z",
      },
    );
    window.dispatchEvent(new Event("visibilitychange"));
  });
  await expect(
    page.getByRole("button", { name: titles.retirar_ferramenta, exact: true }),
  ).toBeVisible();
}
async function quantity(value) {
  await form.getByRole("textbox", { name: /^Quantidade \(/ }).fill(value);
}
async function reason(value = "Conferência registrada no cenário isolado") {
  await form.getByRole("textbox", { name: /^Motivo e conferência/ }).fill(value);
}
async function reservationFields() {
  await form.getByRole("combobox", { name: /^Pessoa responsável/ }).selectOption(person);
  await form.getByRole("combobox", { name: /^Projeto operacional/ }).selectOption(project);
  await form.getByLabel(/^Validade/).fill("2026-12-20T17:00");
}
try {
  for (const width of process.env.NEXUS_UI_BEHAVIORS_ONLY === "1"
    ? []
    : [360, 390, 768, 1024, 1366, 1440]) {
    await page.setViewportSize({ width, height: width < 768 ? 844 : 900 });
    for (const tipo of [
      "materiais",
      "ferramentas",
      "movimentos",
      "conferencias",
      "reservas",
      "inventarios",
      "locais",
    ]) {
      await go(`&aba=${tipo}`);
      await expect(
        page.getByRole("status").filter({ hasText: /registros? · página/ }),
      ).toBeVisible();
      await layout(`lista-${tipo}`, width);
      if (tipo === "conferencias") {
        await open("conferir_evento");
        await layout("form-conferir_evento", width);
        await close();
      }
    }
    for (const [tipo, commands] of [
      ["materiais", ["configurar_produto", "reservar", "transferir", "criar_inventario"]],
      ["conferencias", ["reclassificar_quarentena", "estornar_evento"]],
      ["reservas", ["retirar", "consumir", "devolver", "cancelar_reserva"]],
      [
        "ferramentas",
        [
          "salvar_ferramenta",
          "alterar_condicao",
          "reservar_ferramenta",
          "registrar_calibracao",
          "publicar_politica_calibracao",
          "conferir_calibracao",
          "retirar_ferramenta",
          "devolver_ferramenta",
          "cancelar_custodia",
        ],
      ],
      ["inventarios", ["aprovar_inventario", "cancelar_inventario"]],
      ["locais", ["salvar_local"]],
      ["movimentos", []],
      ["politicas_calibracao", []],
    ]) {
      await detail(tipo);
      if (tipo === "reservas") await seedReservation();
      if (tipo === "ferramentas") await seedCustodies();
      await layout(`ficha-${tipo}`, width);
      for (const command of commands) {
        await open(command);
        await layout(`form-${command}`, width);
        await close();
      }
    }
  }
  await page.setViewportSize({ width: 390, height: 844 });
  await check(
    "required errors focus fields and dirty close offers explicit discard with focus return",
    async () => {
      await go("&aba=locais");
      const trigger = page.getByRole("button", { name: titles.salvar_local, exact: true });
      await trigger.click();
      await submit("salvar_local");
      const name = form.getByRole("textbox", { name: /^Nome/ });
      await expect(name).toBeFocused();
      await expect(name).toHaveAttribute("aria-invalid", "true");
      await name.fill("Local ainda não salvo");
      await page.keyboard.press("Escape");
      await expect(
        form.getByRole("alert").filter({ hasText: "Há alterações não salvas" }),
      ).toBeVisible();
      await form.getByRole("button", { name: "Continuar editando", exact: true }).click();
      await expect(name).toHaveValue("Local ainda não salvo");
      await close();
      await expect(trigger).toBeFocused();
    },
  );
  await check("save failure preserves values and repeats the same operation key", async () => {
    await go("&aba=locais");
    await open("salvar_local");
    await form.getByRole("textbox", { name: /^Nome/ }).fill("Local confirmado depois da falha");
    await page.evaluate(() => {
      window.__stockFailWrite = true;
    });
    await submit("salvar_local");
    await expect(form.getByRole("alert")).toContainText("Falha de rede simulada");
    await expect(form.getByRole("textbox", { name: /^Nome/ })).toHaveValue(
      "Local confirmado depois da falha",
    );
    await submit("salvar_local");
    await expect(form).toHaveCount(0);
    const calls = await page.evaluate(() =>
      window.__nexusCalls
        .filter((call) => call.name === "executarAlmoxarifado")
        .map((call) => call.payload.data),
    );
    expect(calls).toHaveLength(2);
    expect(calls[0].chave).toBe(calls[1].chave);
    await expect(
      page.getByRole("heading", { name: "Local confirmado depois da falha", exact: true }),
    ).toBeVisible();
  });
  await check("focus polling keeps opened version until explicit comparison adoption", async () => {
    await detail("locais");
    await open("salvar_local");
    await form
      .getByRole("textbox", { name: /^Nome/ })
      .fill("Nome local preservado durante conflito");
    await refetch({ __stockAdvanceVersion: true });
    await expect.poll(() => page.evaluate(() => window.__nexusStock.locais[0].version)).toBe(2);
    await submit("salvar_local");
    await expect(form.getByRole("alert")).toContainText("disponibilidade mudou");
    expect(
      await page.evaluate(
        () =>
          window.__nexusCalls.filter((call) => call.name === "executarAlmoxarifado").at(-1).payload
            .data.expected_version,
      ),
    ).toBe(1);
    await form.getByText("Comparar com a ficha atual", { exact: true }).click();
    await form.getByRole("button", { name: "Consultar versão atual", exact: true }).click();
    await expect(
      form.getByText("Versão aberta: 1. Versão atual: 2.", { exact: true }),
    ).toBeVisible();
    await form
      .getByRole("button", { name: "Usar versão atual e manter preenchimento", exact: true })
      .click();
    await expect(form.getByRole("textbox", { name: /^Nome/ })).toHaveValue(
      "Nome local preservado durante conflito",
    );
    await submit("salvar_local");
    await expect(form).toHaveCount(0);
    expect(await page.evaluate(() => window.__nexusStock.locais[0].version)).toBe(3);
  });
  await check(
    "material workflow presents ten received, eight reserved/withdrawn, six consumed and two returned",
    async () => {
      await detail("materiais");
      await open("reservar");
      await quantity("8");
      await reservationFields();
      await submit("reservar");
      await expect(form).toHaveCount(0);
      await open("retirar");
      await quantity("8");
      await submit("retirar");
      await expect(form).toHaveCount(0);
      await open("consumir");
      await quantity("6");
      await submit("consumir");
      await expect(form).toHaveCount(0);
      await open("devolver");
      await quantity("2");
      await submit("devolver");
      await expect(form).toHaveCount(0);
      const state = await page.evaluate(() => ({
        saldo: window.__nexusStock.materiais[0].saldo,
        reserva: window.__nexusStock.reservas.at(-1),
      }));
      expect(state.saldo).toMatchObject({
        aceito: "4",
        fisico: "4",
        disponivel: "4",
        reservado: "0",
        em_poder: "0",
        consumido: "6",
      });
      expect(state.reserva).toMatchObject({
        estado: "concluida",
        quantidades: { retirada: "8", consumida: "6", devolvida: "2", em_poder: "0" },
      });
      await page.screenshot({ path: `${directory}/jornada-material-390.png` });
    },
  );
  await check(
    "receipt classification is explicit and rejected material stays outside availability",
    async () => {
      await go("&aba=conferencias");
      await open("conferir_evento");
      await form
        .getByRole("combobox", { name: /^Recebimento de OC/ })
        .selectOption("98000000-0000-4000-8000-000000000002");
      await form.getByRole("combobox", { name: /^Local de estoque/ }).selectOption(ids.locais);
      await form.getByRole("textbox", { name: /^Quantidade conferida/ }).fill("4");
      await form.getByRole("textbox", { name: /^Quantidade aceita/ }).fill("1");
      await form.getByRole("textbox", { name: /^Quantidade em quarentena/ }).fill("2");
      await form.getByRole("textbox", { name: /^Quantidade rejeitada/ }).fill("1");
      await submit("conferir_evento");
      await expect(form).toHaveCount(0);
      expect(await page.evaluate(() => window.__nexusStock.materiais[0].saldo)).toMatchObject({
        disponivel: "11",
        quarentena: "2",
        rejeitado: "1",
      });
    },
  );
  await check(
    "serialized tool detects overlap, records custody and prevents allocation after damaged return",
    async () => {
      await detail("ferramentas");
      await open("reservar_ferramenta");
      await form.getByRole("combobox", { name: /^Pessoa responsável/ }).selectOption(person);
      await form.getByLabel(/^Início previsto/).fill("2026-12-20T08:00");
      await form.getByLabel(/^Fim previsto/).fill("2026-12-20T18:00");
      await submit("reservar_ferramenta");
      await expect(form).toHaveCount(0);
      await open("reservar_ferramenta");
      await form.getByRole("combobox", { name: /^Pessoa responsável/ }).selectOption(person);
      await form.getByLabel(/^Início previsto/).fill("2026-12-20T09:00");
      await form.getByLabel(/^Fim previsto/).fill("2026-12-20T10:00");
      await submit("reservar_ferramenta");
      await expect(form.getByRole("alert")).toContainText("já reservada");
      await close();
      await open("retirar_ferramenta");
      await submit("retirar_ferramenta");
      await expect(form).toHaveCount(0);
      await open("devolver_ferramenta");
      await form
        .getByRole("combobox", { name: "Condição conferida", exact: true })
        .selectOption("avariada");
      await reason();
      await submit("devolver_ferramenta");
      await expect(form).toHaveCount(0);
      expect(await page.evaluate(() => window.__nexusStock.ferramentas[0])).toMatchObject({
        condicao: "avariada",
        disponibilidade: "impedida",
      });
      await open("reservar_ferramenta");
      await form.getByRole("combobox", { name: /^Pessoa responsável/ }).selectOption(person);
      await form.getByLabel(/^Início previsto/).fill("2026-12-21T09:00");
      await form.getByLabel(/^Fim previsto/).fill("2026-12-21T10:00");
      await submit("reservar_ferramenta");
      await expect(form.getByRole("alert")).toContainText("impedida");
      await close();
    },
  );
  await check(
    "calibration validation requires confirmed certificate rather than a reference string",
    async () => {
      await detail("ferramentas");
      await open("conferir_calibracao");
      await form
        .getByRole("combobox", { name: "Decisão da conferência", exact: true })
        .selectOption("validada");
      await submit("conferir_calibracao");
      await expect(form.getByRole("alert")).toContainText("Confirme um arquivo");
      await close();
      const evidence = page.getByRole("region", { name: "Arquivos privados", exact: true }).first();
      await evidence
        .getByLabel("Adicionar PDF ou imagem (até 20 MB)", { exact: true })
        .setInputFiles({
          name: "certificado-fixture.png",
          mimeType: "image/png",
          buffer: Buffer.from(
            "iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mP8/x8AAwMCAO+aIOsAAAAASUVORK5CYII=",
            "base64",
          ),
        });
      await expect(evidence.getByText(/Armazenamento confirmado/)).toBeVisible();
      await open("conferir_calibracao");
      await form
        .getByRole("combobox", { name: "Decisão da conferência", exact: true })
        .selectOption("validada");
      await submit("conferir_calibracao");
      await expect(form).toHaveCount(0);
      expect(await page.evaluate(() => window.__nexusStock.calibracoes[0].estado)).toBe("validada");
      await expect(
        evidence.getByLabel("Adicionar PDF ou imagem (até 20 MB)", { exact: true }),
      ).toHaveCount(0);
    },
  );
  await check("URL keeps list filters across detail, reload and return", async () => {
    await go("&aba=ferramentas&busca=PAT-TESTE&estado=disponivel");
    await page.getByRole("button", { name: /PAT-TESTE-001/ }).click();
    await expect(page).toHaveURL(/registro=93000000/);
    await page.goBack();
    await expect(page.getByRole("searchbox", { name: "Buscar registro", exact: true })).toHaveValue(
      "PAT-TESTE",
    );
    await expect(page.getByRole("combobox", { name: "Situação", exact: true })).toHaveValue(
      "disponivel",
    );
    await page.getByRole("button", { name: /PAT-TESTE-001/ }).click();
    await page.reload({ waitUntil: "networkidle" });
    await expect(
      page.getByRole("heading", { name: "Histórico da operação", exact: true }),
    ).toBeVisible();
    await page.getByRole("button", { name: "Voltar à lista", exact: true }).click();
    await expect(page.getByRole("searchbox", { name: "Buscar registro", exact: true })).toHaveValue(
      "PAT-TESTE",
    );
    await expect(page.getByRole("combobox", { name: "Situação", exact: true })).toHaveValue(
      "disponivel",
    );
  });
  await check("clearing a debounced search does not restore the previous URL recut", async () => {
    await go("&aba=ferramentas");
    const search = page.getByRole("searchbox", { name: "Buscar registro", exact: true });
    await search.fill("PAT-TESTE");
    await expect(page).toHaveURL(/busca=PAT-TESTE/);
    await page.getByRole("button", { name: "Limpar filtros", exact: true }).click();
    await expect(search).toHaveValue("");
    await page.waitForTimeout(600);
    await expect(search).toHaveValue("");
    expect(new URL(page.url()).searchParams.get("busca") || "").toBe("");
  });
  await check(
    "reservation with fixed product focuses an enabled field and Escape restores its trigger",
    async () => {
      await detail("materiais");
      const trigger = page.getByRole("button", { name: titles.reservar, exact: true });
      await trigger.click();
      expect(
        await page.evaluate(() => {
          const active = document.activeElement;
          return (
            active instanceof HTMLElement &&
            !!active.closest('[role="dialog"]') &&
            !active.matches(":disabled")
          );
        }),
      ).toBe(true);
      await page.keyboard.press("Escape");
      await expect(form).toHaveCount(0);
      await expect(trigger).toBeFocused();
    },
  );
  await check(
    "read-only permissions hide commands and access revocation closes private draft",
    async () => {
      await go(
        `&scenario=readonly&aba=ferramentas&detalhe=ferramentas&registro=${ids.ferramentas}`,
      );
      await expect(
        page.getByRole("button", { name: titles.salvar_ferramenta, exact: true }),
      ).toHaveCount(0);
      await expect(
        page.getByRole("button", { name: titles.reservar_ferramenta, exact: true }),
      ).toHaveCount(0);
      await detail("locais");
      await open("salvar_local");
      await form.getByRole("textbox", { name: /^Nome/ }).fill("Rascunho privado local");
      await refetch({ __stockQueryError: true });
      await expect(form.getByRole("textbox", { name: /^Nome/ })).toHaveValue(
        "Rascunho privado local",
      );
      await refetch({ __stockQueryError: false, __stockAccessDenied: true });
      await expect(form).toHaveCount(0);
      await expect(page.getByRole("alert")).toContainText("Registro de almoxarifado indisponível");
      await expect(page.getByText("Rascunho privado local", { exact: true })).toHaveCount(0);
    },
  );
  await check(
    "new local draft survives network failure but closes and focuses an explicit list denial",
    async () => {
      await go("&aba=locais");
      await open("salvar_local");
      await form.getByRole("textbox", { name: /^Nome/ }).fill("Novo local privado ainda não salvo");
      await refetch({ __stockQueryError: true });
      await expect(form.getByRole("textbox", { name: /^Nome/ })).toHaveValue(
        "Novo local privado ainda não salvo",
      );
      await refetch({ __stockQueryError: false, __stockAccessDenied: true });
      await expect(form).toHaveCount(0);
      const alert = page
        .getByRole("alert")
        .filter({ hasText: "Registro de almoxarifado indisponível" });
      await expect(alert).toBeVisible();
      await expect(alert).toBeFocused();
      expect(
        await page
          .locator("input")
          .evaluateAll((inputs) =>
            inputs.some((input) => input.value === "Novo local privado ainda não salvo"),
          ),
      ).toBe(false);
    },
  );
  await check(
    "catalog policy selected without a detail loads and freezes its current version before editing",
    async () => {
      await go("&aba=materiais");
      await page.getByText("Rastreabilidade do catálogo", { exact: true }).click();
      await page
        .getByRole("button", { name: "Configurar material existente", exact: true })
        .click();
      await form
        .getByRole("combobox", { name: /^Produto do catálogo/ })
        .selectOption(ids.materiais);
      await expect(form.getByText("Política atual · versão 1", { exact: true })).toBeVisible();
      await form.getByRole("textbox", { name: /^Estoque mínimo/ }).fill("3");
      await page.evaluate(() => {
        window.__nexusStock.materiais[0].politica.version = 2;
        window.dispatchEvent(new Event("visibilitychange"));
      });
      await submit("configurar_produto");
      await expect(form.getByRole("alert")).toContainText("Seu preenchimento foi preservado");
      await expect(form.getByRole("textbox", { name: /^Estoque mínimo/ })).toHaveValue("3");
      expect(
        await page.evaluate(
          () =>
            window.__nexusCalls.filter((call) => call.name === "executarAlmoxarifado").at(-1)
              .payload.data.expected_version,
        ),
      ).toBe(1);
      await form.getByText("Comparar com a ficha atual", { exact: true }).click();
      await form.getByRole("button", { name: "Consultar versão atual", exact: true }).click();
      await form
        .getByRole("button", { name: "Usar versão atual e manter preenchimento", exact: true })
        .click();
      await expect(form.getByRole("textbox", { name: /^Estoque mínimo/ })).toHaveValue("3");
      await submit("configurar_produto");
      await expect(form).toHaveCount(0);
      expect(
        await page.evaluate(
          () =>
            window.__nexusCalls.filter((call) => call.name === "executarAlmoxarifado").at(-1)
              .payload.data.expected_version,
        ),
      ).toBe(2);
    },
  );
  await check(
    "policy lookup failure preserves the selected product and explicit access denial closes the draft",
    async () => {
      await go("&aba=materiais");
      await page.getByText("Rastreabilidade do catálogo", { exact: true }).click();
      await page
        .getByRole("button", { name: "Configurar material existente", exact: true })
        .click();
      const picker = form.getByRole("combobox", { name: /^Produto do catálogo/ });
      await expect(picker.locator("option[value='" + ids.materiais + "']")).toHaveCount(1);
      await page.evaluate(() => {
        window.__stockQueryError = true;
      });
      await picker.selectOption(ids.materiais);
      await expect(form.getByRole("alert").first()).toContainText(
        "Consulta de estoque indisponível",
      );
      await expect(picker).toHaveValue(ids.materiais);
      await expect(form.getByRole("textbox", { name: /^Estoque mínimo/ })).toHaveCount(0);
      await page.evaluate(() => {
        window.__stockQueryError = false;
      });
      await form
        .getByRole("button", { name: "Consultar política do material", exact: true })
        .click();
      await expect(form.getByText("Política atual · versão 1", { exact: true })).toBeVisible();
      await form.getByRole("textbox", { name: /^Estoque mínimo/ }).fill("2");
      await form.getByText("Comparar com a ficha atual", { exact: true }).click();
      await page.evaluate(() => {
        window.__stockAccessDenied = true;
      });
      await form.getByRole("button", { name: "Consultar versão atual", exact: true }).click();
      await expect(form).toHaveCount(0);
      await expect(page.getByRole("alert")).toContainText("Registro de almoxarifado indisponível");
    },
  );
  await check(
    "denial returned only by mutation or comparison hides the cached private record",
    async () => {
      for (const boundary of ["mutation", "comparison"]) {
        await detail("locais");
        await open("salvar_local");
        await form.getByRole("textbox", { name: /^Nome/ }).fill(`Texto privado ${boundary}`);
        await page.evaluate(() => {
          window.__stockAccessDenied = true;
        });
        if (boundary === "mutation") await submit("salvar_local");
        else {
          await form.getByText("Comparar com a ficha atual", { exact: true }).click();
          await form.getByRole("button", { name: "Consultar versão atual", exact: true }).click();
        }
        await expect(form).toHaveCount(0);
        await expect(page.getByRole("alert")).toContainText(
          "Registro de almoxarifado indisponível",
        );
        await expect(
          page.getByRole("heading", {
            name: "Almoxarifado central do ambiente isolado",
            exact: true,
          }),
        ).toHaveCount(0);
      }
    },
  );
  await check(
    "server pagination preserves the recut and stock fixture omits internal costs",
    async () => {
      await go("&aba=locais");
      await page.evaluate(() => {
        const template = window.__nexusStock.locais[0];
        for (let index = 0; index < 28; index++)
          window.__nexusStock.locais.push({
            ...template,
            id: crypto.randomUUID(),
            nome: `Local de teste ${index}`,
          });
        window.dispatchEvent(new Event("visibilitychange"));
      });
      await expect(
        page.getByRole("status").filter({ hasText: "30 registros · página 1" }),
      ).toBeVisible();
      await page.getByRole("button", { name: "Próxima", exact: true }).click();
      await expect(
        page.getByRole("status").filter({ hasText: "30 registros · página 2" }),
      ).toBeVisible();
      const payloads = await page.evaluate(() =>
        window.__nexusCalls
          .filter((call) => call.name === "listarAlmoxarifado")
          .map((call) => call.payload.data),
      );
      expect(payloads.at(-1)).toMatchObject({ tipo: "locais", pagina: 1 });
      const fields = await page.evaluate(() => {
        const keys = [];
        function collect(value) {
          if (value && typeof value === "object")
            for (const [key, child] of Object.entries(value)) {
              keys.push(key);
              collect(child);
            }
        }
        collect(window.__nexusStock);
        return keys;
      });
      expect(
        fields.filter((key) =>
          /^(?:custo(?:_|$)|preco(?:_|$)|margem(?:_|$)|parcelas(?:_|$)|valor_pago(?:_|$)|remuneracao(?:_|$))/.test(
            key,
          ),
        ),
      ).toEqual([]);
    },
  );
  await check(
    "zero quantity, no records and query error have distinct recoverable representations",
    async () => {
      await go("&scenario=zero");
      await expect(page.getByRole("list", { name: "Materiais", exact: true })).toBeVisible();
      await expect(page.getByRole("definition").filter({ hasText: /^0 un$/ })).toBeVisible();
      await go("&scenario=empty");
      await expect(page.getByText("Nenhum registro cadastrado", { exact: true })).toBeVisible();
      await go("&scenario=error");
      await expect(
        page.getByRole("button", { name: "Tentar novamente", exact: true }),
      ).toBeVisible();
      await expect(page.getByText("Nenhum registro cadastrado", { exact: true })).toHaveCount(0);
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
