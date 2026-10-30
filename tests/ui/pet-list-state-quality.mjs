// Actual list/detail components with intercepted list reads in the disposable
// PET UI lab. No permit write, provider integration or production URL is used.
import assert from "node:assert/strict";
import { chromium, expect } from "@playwright/test";
import { mkdir, writeFile } from "node:fs/promises";
const base = process.env.NEXUS_PET_LIST_URL || "http://127.0.0.1:4193";
if (!/^http:\/\/127\.0\.0\.1:\d{4,5}$/.test(base))
  throw Error("Use only the disposable loopback PET lab");
const output = process.env.NEXUS_PET_EVIDENCE || "/tmp/nexus-pet-list-state-ui";
await mkdir(output, { recursive: true });
const browser = await chromium.launch({
  headless: true,
  ...(process.env.NEXUS_UI_BROWSER_EXECUTABLE
    ? { executablePath: process.env.NEXUS_UI_BROWSER_EXECUTABLE }
    : {}),
});
const page = await browser.newPage({
  viewport: { width: 1280, height: 800 },
  locale: "pt-BR",
  reducedMotion: "reduce",
});
const org = "a0300000-0000-4000-8000-000000000001",
  user = "a0300000-0000-4000-8000-000000000002";
const report = {
  method:
    "Actual components; controlled paginated read responses in the disposable local UI lab. No writes or certified operations.",
  checks: [],
  errors: [],
};
page.on("pageerror", (error) => report.errors.push(error.message));
try {
  const read = async (name, data) => {
    const response = await page.request.post(base + "/__pet_lab", {
      data: { name, data: { organization_id: org, ...data } },
    });
    assert.equal(response.ok(), true, "Disposable UI lab must be running");
    return response.json();
  };
  const initial = await read("pet_listar", {});
  const seed = initial.registros[0];
  assert.ok(seed && initial.ordens.length, "Local lab requires its existing controlled seed");
  const detail = await read("pet_obter", { id: seed.id });
  const os = initial.ordens.find((order) => order.id === seed.os_id);
  const records = Array.from({ length: 64 }, (_, i) => ({
    ...seed,
    id: `b0370000-0000-4000-8000-${String(i).padStart(12, "0")}`,
    numero: `PET-LISTA-${String(i).padStart(3, "0")}`,
    atividade: `Controle de teste de navegação ${i}`,
  }));
  const requestedPages = [];
  await page.route("**/__pet_lab", async (route) => {
    const { name, data } = route.request().postDataJSON();
    if (name === "pet_listar") {
      const filters = data.filtros || {};
      const search = (filters.busca || "").trim().toLowerCase();
      const filtered = records.filter(
        (pet) =>
          (!filters.os_id || pet.os_id === filters.os_id) &&
          `${pet.numero} ${pet.atividade} ${pet.espaco_nome || ""}`.toLowerCase().includes(search),
      );
      const page = filters.pagina || 0,
        limit = filters.limite || 50;
      requestedPages.push(page);
      return route.fulfill({
        json: {
          registros: filtered.slice(page * limit, (page + 1) * limit),
          ordens: [os],
          total: filtered.length,
          pagina: page,
          limite: limit,
        },
      });
    }
    if (name === "pet_obter" && records.some((pet) => pet.id === data.id)) {
      const pet = records.find((item) => item.id === data.id);
      return route.fulfill({ json: { ...detail, pet: { ...detail.pet, ...pet } } });
    }
    if (["pet_executar", "pet_retificar", "pdf", "pacote"].includes(name))
      throw Error("This navigation check must not submit permit operations");
    return route.continue();
  });
  const osUrl = base + "/execucao/ordens/" + os.id;
  await page.goto(osUrl, { waitUntil: "networkidle" });
  await page.getByRole("searchbox", { name: "Buscar PET ou espaço" }).fill("Controle");
  await expect(page.getByText("64 permissões · Página 1 de 4", { exact: true })).toBeVisible();
  await page.getByRole("button", { name: "Próxima", exact: true }).click();
  await expect(page.getByText("64 permissões · Página 2 de 4", { exact: true })).toBeVisible();
  await page.getByRole("button", { name: "Próxima", exact: true }).click();
  await expect(page.getByText("64 permissões · Página 3 de 4", { exact: true })).toBeVisible();
  await expect(page.getByText("PET-LISTA-040", { exact: true })).toBeVisible();
  await page.evaluate(() => document.fonts.ready);
  const open = page.getByRole("link", { name: "Abrir PET", exact: true }).nth(5);
  await open.scrollIntoViewIfNeeded();
  const position = await page.evaluate(() => scrollY);
  assert.ok(position > 500, "Capture must exercise a scrolled list");
  await open.click();
  await page.waitForURL(/\/execucao\/pets\//);
  await page.getByRole("link", { name: /Voltar à OS/ }).click();
  await page.waitForURL(osUrl);
  await expect(page.getByRole("searchbox", { name: "Buscar PET ou espaço" })).toHaveValue(
    "Controle",
  );
  await expect(page.getByText("64 permissões · Página 3 de 4", { exact: true })).toBeVisible();
  await expect(page.getByText("PET-LISTA-040", { exact: true })).toBeVisible();
  await expect.poll(() => page.evaluate(() => scrollY)).toBeGreaterThan(position - 5);
  await expect.poll(() => page.evaluate(() => scrollY)).toBeLessThan(position + 5);
  report.checks.push("OS → PET → OS restores search, page, matching rows and captured scroll");
  await page.screenshot({ path: output + "/list-return-position.png" });
  await page.getByRole("searchbox", { name: "Buscar PET ou espaço" }).fill("Controle de teste");
  await expect(page.getByText("64 permissões · Página 1 de 4", { exact: true })).toBeVisible();
  report.checks.push("changing search resets the zero-based page");
  const key = `nexus.pet.list.v1:${org}:${user}:${os.id}`;
  await page.evaluate(
    ({ key }) =>
      sessionStorage.setItem(
        key,
        JSON.stringify({ formato: 1, search: "Controle", tab: "pets", page: 99, scrollY: 0 }),
      ),
    { key },
  );
  await page.reload({ waitUntil: "networkidle" });
  await expect(page.getByText("64 permissões · Página 4 de 4", { exact: true })).toBeVisible();
  await expect(page.getByText("PET-LISTA-060", { exact: true })).toBeVisible();
  assert.ok(requestedPages.includes(99) && requestedPages.includes(3));
  report.checks.push(
    "an obsolete restored page waits for its actual response, then clamps to the current last page",
  );
  assert.deepEqual(report.errors, []);
  console.log(JSON.stringify(report, null, 2));
} finally {
  await writeFile(
    output + "/pet-list-state-ui-results.json",
    JSON.stringify(report, null, 2) + "\n",
  );
  await browser.close();
}
