// User-requested browser acceptance checks, isolated synthetic laboratory only.
import { chromium, expect } from "@playwright/test";
import assert from "node:assert/strict";
import { writeFile } from "node:fs/promises";
import { ids } from "./fixture.mjs";
const base = "http://127.0.0.1:4196",
  query = `cliente=${ids.client}&unidade=${ids.unit}`;
const url = (local = "", extra = "", norm = "nr-33") =>
  `${base}/${norm}/mapa-3d?${query}&local=${local}${extra}`;
const browser = await chromium.launch({
  headless: true,
  args: [
    process.platform === "win32" ? "--use-angle=d3d11" : "--use-angle=swiftshader",
    "--enable-unsafe-swiftshader",
    "--enable-gpu",
    "--ignore-gpu-blocklist",
  ],
});
const report = {
  browser: browser.version(),
  environment: "Windows Chromium; responsive/touch emulation, not a physical phone",
  checks: [],
  screenshots: [],
  consoleErrors: [],
};
const check = (label) => {
  report.checks.push(label);
  console.log("PASS " + label);
};
const shot = async (p, name) => {
  await p.screenshot({ path: `docs/cotrirosa/${name}.png` });
  report.screenshots.push(name);
};
const rpc = async (p, name, data) => {
  const r = await p.request.post(base + "/__cotrirosa", {
    data: {
      name,
      data: {
        organization_id: ids.org,
        cliente_id: ids.client,
        unidade_id: ids.unit,
        norma: "NR33",
        ...data,
      },
    },
  });
  assert.equal(r.status(), 200, await r.text());
  return r.json();
};
let p;
try {
  const desktop = await browser.newContext({
    viewport: { width: 1440, height: 1000 },
    reducedMotion: "reduce",
  });
  p = await desktop.newPage();
  p.on("pageerror", (e) => report.consoleErrors.push(e.message));
  await p.goto(url());
  await p.locator('canvas[data-ready="true"]').waitFor();
  await p.getByRole("button", { name: "Locais", exact: true }).click();
  await p.getByRole("button", { name: /EC 25.*Silo/ }).click();
  const mainAction = p.getByRole("button", { name: /^(Iniciar PET|Continuar PET)$/ });
  await expect(mainAction).toBeVisible();
  await shot(p, "demo-desktop-compact");
  check("Silo selection exposes Iniciar PET without scrolling");
  const canvas = await p.locator("canvas").elementHandle();
  const before = await rpc(p, "petDemoListar", { local_id: ids.locals[1] });
  if (await p.getByRole("button", { name: "Iniciar outra", exact: true }).count())
    await p.getByRole("button", { name: "Iniciar outra", exact: true }).click();
  else await mainAction.click();
  await expect(p.getByLabel("Atividade", { exact: true })).toHaveValue("");
  await expect(p.getByLabel("Início previsto", { exact: true })).toHaveValue("");
  assert.equal((await rpc(p, "petDemoListar", { local_id: ids.locals[1] })).total, before.total);
  await shot(p, "demo-desktop-empty");
  check("Open starts empty and creates no record");
  await p.getByLabel("Atividade", { exact: true }).fill("Demonstração UI — EC25");
  await p.getByLabel("Início previsto", { exact: true }).fill("2026-11-05T10:00");
  await p.getByLabel("Término previsto", { exact: true }).fill("2026-11-05T11:00");
  await p.getByRole("button", { name: "Minimizar ficha", exact: true }).click();
  await expect(p.getByLabel("Atividade", { exact: true })).toHaveValue("Demonstração UI — EC25");
  await p.getByRole("button", { name: "Expandir ficha", exact: true }).click();
  await p.getByRole("button", { name: "Acervo", exact: true }).click();
  await p.getByRole("button", { name: "PET", exact: true }).click();
  await expect(p.getByLabel("Atividade", { exact: true })).toHaveValue("Demonstração UI — EC25");
  assert.ok(await canvas.evaluate((node) => node.isConnected));
  assert.equal(await p.locator("canvas").count(), 1);
  check("Expand/minimize/tab preserve unsaved form and one mounted Canvas");
  await p.getByLabel("Atividade", { exact: true }).press("Escape");
  await expect(p.getByRole("button", { name: "Expandir ficha", exact: true })).toBeFocused();
  await p.getByRole("button", { name: "Expandir ficha", exact: true }).click();
  check("Escape minimizes and restores focus");
  await p.getByRole("button", { name: "Salvar e continuar", exact: true }).dblclick();
  await expect(p.getByRole("heading", { name: "Equipe", exact: true })).toBeVisible();
  const id = new URL(p.url()).searchParams.get("petDemo"),
    saved = await rpc(p, "petDemoObter", { id });
  report.id = id;
  report.number = saved.sessao.numero;
  assert.equal(
    (await rpc(p, "petDemoListar", { local_id: ids.locals[1] })).total,
    before.total + 1,
  );
  check("Double click saves exactly one numbered draft");
  for (const [name, role] of [
    ["Pessoa de teste UI", "trabalhador"],
    ["Vigia de teste UI", "vigia"],
  ]) {
    await p.getByLabel("Nome do participante", { exact: true }).fill(name);
    await p.getByLabel("Função", { exact: true }).selectOption(role);
    await p.getByRole("button", { name: "Adicionar participante", exact: true }).click();
  }
  await p.getByRole("button", { name: "Salvar e continuar", exact: true }).click();
  await p
    .getByLabel("Perigos identificados", { exact: true })
    .fill("Observações inseridas manualmente para demonstração.");
  await p
    .getByLabel("Medidas de prevenção", { exact: true })
    .fill("Medidas da demonstração, sem validade operacional.");
  await p.getByRole("button", { name: "Salvar e continuar", exact: true }).click();
  await p.getByLabel("Agente", { exact: true }).fill("O2");
  await p.getByLabel("Valor", { exact: true }).fill("20.9");
  await p.getByLabel("Unidade", { exact: true }).fill("%");
  await p.getByRole("button", { name: "Adicionar leitura", exact: true }).click();
  await p
    .getByLabel("Procedimentos e observações", { exact: true })
    .fill("Informações manuais da demonstração.");
  await p.getByRole("button", { name: "Salvar e continuar", exact: true }).click();
  await expect(p.getByRole("heading", { name: "Conferência", exact: true })).toBeVisible();
  await shot(p, "demo-desktop-review");
  await p.getByRole("button", { name: "Iniciar acompanhamento", exact: true }).click();
  await p.getByLabel("Trabalhador", { exact: true }).selectOption({ label: "Pessoa de teste UI" });
  await p.getByRole("button", { name: "Registrar entrada", exact: true }).click();
  await expect(p.getByRole("button", { name: "Registrar saída", exact: true })).toBeVisible();
  await p.getByRole("button", { name: "Ir para encerramento", exact: true }).click();
  await p
    .getByLabel("Observações de encerramento", { exact: true })
    .fill("Encerramento UI confirmado.");
  await expect(
    p.getByRole("button", { name: "Encerrar demonstração", exact: true }),
  ).toBeDisabled();
  await p.getByRole("button", { name: "6 Acompanhamento", exact: true }).click();
  await p.getByRole("button", { name: "Registrar saída", exact: true }).click();
  await p.getByRole("button", { name: "Ir para encerramento", exact: true }).click();
  await p.getByRole("button", { name: "Encerrar demonstração", exact: true }).click();
  await expect(p.getByRole("heading", { name: "Consulta final", exact: true })).toBeVisible();
  check(
    "Eight-step journey: manual team/readings, start, entry, closure block, exit and explicit closure",
  );
  await shot(p, "demo-desktop-closed");
  await p.reload();
  await expect(p.getByRole("heading", { name: "Consulta final", exact: true })).toBeVisible();
  assert.equal(new URL(p.url()).searchParams.get("petDemo"), id);
  check("Reload restores final step and same demonstration");
  await p.getByRole("link", { name: "NR-35", exact: true }).click();
  await expect(p.getByRole("heading", { name: "Consulta final", exact: true })).toBeVisible();
  check("NR35 switch preserves same demonstration");
  const body = await p.locator(".unit-map-panel").innerText();
  assert.ok(!/certificad|procedimento aprovado|contratação/i.test(body));
  check("Demonstration has no certification or approved-procedure warnings");
  for (const [width, height, label] of [
    [1280, 560, "low-window"],
    [820, 1180, "tablet"],
    [390, 844, "mobile"],
  ]) {
    await p.setViewportSize({ width, height });
    const bounds = await p.locator(".unit-map-panel").boundingBox();
    assert.ok(bounds.y + bounds.height <= height + 2, JSON.stringify(bounds));
    assert.ok(bounds.x >= 0);
    await shot(p, `demo-${label}`);
    check(`${label}: expanded sheet fits viewport`);
  }
  await desktop.close();
  const mobile = await browser.newContext({
    viewport: { width: 390, height: 844 },
    isMobile: true,
    hasTouch: true,
    deviceScaleFactor: 1,
    recordVideo: { dir: "docs/cotrirosa/demo-video", size: { width: 390, height: 844 } },
    reducedMotion: "reduce",
  });
  p = await mobile.newPage();
  await p.goto(url(ids.locals[4]));
  await p.locator('canvas[data-ready="true"]').waitFor();
  await expect(p.getByRole("button", { name: /^(Iniciar PET|Continuar PET)$/ })).toBeVisible();
  await shot(p, "demo-mobile-compact");
  if (await p.getByRole("button", { name: "Iniciar outra", exact: true }).count())
    await p.getByRole("button", { name: "Iniciar outra", exact: true }).tap();
  else await p.getByRole("button", { name: "Iniciar PET", exact: true }).tap();
  await expect(p.getByLabel("Atividade", { exact: true })).toHaveValue("");
  await p.getByLabel("Atividade", { exact: true }).fill("Demonstração móvel SA 05 / AS 05");
  await p.getByLabel("Início previsto", { exact: true }).fill("2026-11-05T12:00");
  await p.getByLabel("Término previsto", { exact: true }).fill("2026-11-05T13:00");
  await shot(p, "demo-mobile-form");
  await p.getByRole("button", { name: "Salvar e continuar", exact: true }).tap();
  await expect(p.getByRole("heading", { name: "Equipe", exact: true })).toBeVisible();
  const mobileId = new URL(p.url()).searchParams.get("petDemo");
  await p.getByRole("button", { name: "Minimizar ficha", exact: true }).tap();
  await p.getByRole("button", { name: "Fechar ficha", exact: true }).tap();
  await p.getByRole("button", { name: "Locais", exact: true }).tap();
  await p.getByRole("button", { name: /EC 28.*Silo/ }).tap();
  await p.getByRole("button", { name: "Continuar PET", exact: true }).tap();
  if (new URL(p.url()).searchParams.get("petDemo") !== mobileId) {
    const latest = await rpc(p, "petDemoObter", { id: mobileId });
    await p.getByRole("button", { name: new RegExp(latest.sessao.numero) }).tap();
  }
  assert.equal(new URL(p.url()).searchParams.get("petDemo"), mobileId);
  check("Mobile touch: start EC28, save, close map panel and continue same demo");
  await p.getByRole("button", { name: "1 Contexto", exact: true }).tap();
  await expect(p.getByLabel("Atividade", { exact: true })).toHaveValue(
    "Demonstração móvel SA 05 / AS 05",
  );
  await p.setViewportSize({ width: 390, height: 480 });
  const footer = await p.locator(".pet-demo-footer").boundingBox();
  assert.ok(footer.y + footer.height <= 482);
  check("Reduced mobile viewport keeps save controls above emulated keyboard");
  await p.setViewportSize({ width: 390, height: 844 });
  await shot(p, "demo-mobile-restored");
  const video = p.video();
  await mobile.close();
  report.video = await video.path();
  assert.equal(report.consoleErrors.length, 0);
  check("No uncaught browser errors");
  await writeFile("docs/cotrirosa/demo-ui-report.json", JSON.stringify(report, null, 2));
} catch (e) {
  if (p && !p.isClosed()) {
    await shot(p, "demo-failure");
    await writeFile("docs/cotrirosa/demo-failure.txt", await p.locator("body").innerText());
  }
  throw e;
} finally {
  await browser.close();
}
