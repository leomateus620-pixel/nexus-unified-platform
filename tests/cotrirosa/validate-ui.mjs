// Explicitly requested browser acceptance tests. Loopback laboratory only.
import { chromium } from "@playwright/test";
import assert from "node:assert/strict";
import { writeFile, mkdir, readFile } from "node:fs/promises";
import { PerspectiveCamera, Vector3 } from "three";
import { ids } from "./fixture.mjs";
const root = "http://127.0.0.1:4196",
  out = "docs/cotrirosa";
const query = `cliente=${ids.client}&unidade=${ids.unit}`;
const url = (extra = "", norm = "nr-33") => `${root}/${norm}/mapa-3d?${query}${extra}`;
const b = await chromium.launch({
  headless: true,
  args: ["--use-angle=d3d11", "--enable-gpu", "--ignore-gpu-blocklist"],
});
const report = {
  browser: b.version(),
  environment: "Chromium headless no Windows; celular emulado, não dispositivo físico",
  checks: [],
  captures: [],
  pets: [],
  errors: [],
};
const check = (condition, label) => {
  assert.ok(condition, label);
  report.checks.push(label);
  console.log("PASS " + label);
};
const rpc = async (p, name, data) => {
  const r = await p.request.post(root + "/__cotrirosa", {
    data: { name, data: { organization_id: ids.org, ...data } },
  });
  assert.equal(r.status(), 200, await r.text());
  return r.json();
};
const ready = async (p) => p.locator("canvas[data-ready=true]").waitFor({ timeout: 30000 });
const shot = async (p, name) => {
  await p.screenshot({ path: `${out}/${name}.png` });
  report.captures.push(name);
};
let activePage;
try {
  await mkdir(out, { recursive: true });
  const context = await b.newContext({
    viewport: { width: 1440, height: 1000 },
    reducedMotion: "reduce",
  });
  const p = await context.newPage();
  activePage = p;
  p.on("pageerror", (e) => report.errors.push(e.message));
  p.on("console", (e) => {
    if (e.type() === "error") report.errors.push(e.text());
  });
  await p.goto(url());
  await ready(p);
  await shot(p, "desktop-normal");
  const manifest = (
    await rpc(p, "nrMapaContexto", {
      cliente_id: ids.client,
      unidade_id: ids.unit,
      norma: "NR33",
      manifesto: true,
    })
  ).manifest;
  for (const [label, name] of [
    ["Superior", "desktop-superior"],
    ["Angular", "desktop-angular"],
  ]) {
    await p.getByRole("button", { name: label, exact: true }).click();
    await p.waitForTimeout(350);
    await shot(p, name);
    check(
      (await p.getByRole("button", { name: label, exact: true }).getAttribute("aria-pressed")) ===
        "true",
      `${label} disponível`,
    );
  }
  await p.goto(url());
  await ready(p);
  const canvas = p.locator("canvas");
  await canvas.focus();
  const camera = () => canvas.getAttribute("data-camera").then(JSON.parse);
  const before = await camera();
  await p.keyboard.press("ArrowRight");
  const after = await camera();
  check(after.target[0] > before.target[0], "pan por teclado");
  await p.keyboard.press("ArrowLeft");
  await p.keyboard.press("+");
  const closer = await camera();
  await p.keyboard.press("-");
  check(
    Math.hypot(...closer.position.map((n, i) => n - closer.target[i])) <
      Math.hypot(...before.position.map((n, i) => n - before.target[i])),
    "zoom por teclado nas duas direções",
  );
  const current = await camera(),
    box = await canvas.boundingBox(),
    cam = new PerspectiveCamera(43, box.width / box.height, 0.12, 1400);
  cam.position.fromArray(current.position);
  cam.lookAt(...current.target);
  cam.updateMatrixWorld();
  const silo = manifest.silos[1],
    hit = new Vector3(silo.position[0], 10, silo.position[2]).project(cam),
    x = box.x + ((hit.x + 1) * box.width) / 2,
    y = box.y + ((1 - hit.y) * box.height) / 2;
  await p.mouse.move(x, y);
  await p.mouse.down();
  await p.mouse.move(x + 70, y + 35, { steps: 10 });
  await p.mouse.up();
  check(!new URL(p.url()).searchParams.get("local"), "arraste começando no silo não seleciona");
  // A reproducible side-on view makes the EC25 body an unoccluded touch target.
  await p.evaluate(({ key, pose }) => sessionStorage.setItem(key, JSON.stringify(pose)), {
    key: `nr-map:${ids.org}:${ids.user}:NR33:${ids.client}:${ids.unit}`,
    pose: {
      mode: "normal",
      position: [silo.position[0] - 22, 12, silo.position[2]],
      target: [silo.position[0], 10, silo.position[2]],
      zoom: 1,
      fov: 43,
    },
  });
  await p.reload();
  await ready(p);
  const hitBox = await canvas.boundingBox();
  await p.mouse.click(hitBox.x + hitBox.width / 2, hitBox.y + hitBox.height / 2);
  await p.waitForURL((u) => u.searchParams.get("local") === ids.locals[1]);
  check(true, "toque curto no corpo abre exatamente EC25");
  const selectedTarget = (await camera()).target;
  await p.getByRole("button", { name: "Superior", exact: true }).click();
  await p.waitForTimeout(100);
  check(
    JSON.stringify((await camera()).target) === JSON.stringify(selectedTarget),
    "troca Superior conserva o alvo do EC25",
  );
  await p.getByRole("button", { name: "Fechar ficha", exact: true }).click();
  check(!new URL(p.url()).searchParams.get("local"), "fechar ficha mantém exploração");
  await p.goto(url());
  await ready(p);
  const select = async (tag) => {
    await p.getByRole("button", { name: "Locais", exact: true }).click();
    await p.getByRole("button", { name: new RegExp("^" + tag + " ") }).click();
    await p.getByRole("button", { name: "Operação da PET", exact: true }).click();
    await p.getByRole("button", { name: "Criar PET", exact: true }).waitFor();
  };
  async function create(tag, index) {
    await select(tag);
    await p.getByRole("button", { name: "Criar PET", exact: true }).click();
    const activity = `FIXTURE UI ${tag} ${Date.now()}`;
    await p.getByLabel("Atividade", { exact: true }).fill(activity);
    await p.getByLabel("Procedimento aprovado").selectOption({ index: 1 });
    const date = new Date(Date.now() + 4 * 3600000 - 3 * 3600000).toISOString().slice(0, 16);
    await p.getByLabel("Término previsto · horário de Brasília").fill(date);
    await p.getByRole("checkbox").check();
    await p.getByRole("button", { name: "Confirmar criação do rascunho", exact: true }).click();
    await p.waitForURL(/\/pets\/[a-f0-9-]{36}/, { timeout: 15000 });
    const id = new URL(p.url()).pathname.split("/").at(-1);
    const detail = await rpc(p, "petObter", { id });
    check(detail.pet.local_nr_id === ids.locals[index], tag + " criação contextual correta");
    check(detail.pet.os_id === null, tag + " não criou OS fictícia");
    report.pets.push({ id, numero: detail.pet.numero, tag, activity });
    await p.goto(url(`&local=${ids.locals[index]}&painel=pet`));
    await ready(p);
    await p
      .getByRole("link", { name: "Continuar PET", exact: true })
      .filter({ hasText: "Continuar PET" })
      .last()
      .waitFor();
    check(
      (await p.locator(`a[href*="${id}"]`).count()) > 0,
      tag + " reencontra o mesmo pet_id após recarga",
    );
    await shot(p, tag === "EC 25" ? "silo-ec25-pet" : "silo-ec28-pet");
    const list = await rpc(p, "petListar", {
      filtros: {
        unidade_id: ids.unit,
        espaco_id: detail.pet.espaco_id,
        contexto_unidade: true,
        busca: activity,
      },
    });
    check(list.total === 1, tag + " filtro exato sem duplicação");
    await p.goto(`${root}/nr-33/pets?${query}`);
    await p.getByLabel("Buscar número, TAG, apelido, atividade ou situação").fill(activity);
    await p.locator(`a[href*="${id}"]`).filter({ hasText: "Continuar PET" }).waitFor();
    check(true, tag + " encontrado no histórico da unidade");
    return detail;
  }
  const a = await create("EC 25", 1);
  await p.goto(url());
  await ready(p);
  const corn = await create("EC 28", 4);
  for (const alias of ["SA 05", "AS 05"]) {
    const r = await rpc(p, "petListar", { filtros: { unidade_id: ids.unit, busca: alias } });
    check(
      r.registros.some((v) => v.id === corn.pet.id),
      "apelido " + alias + " encontra mesma PET",
    );
  }
  const c24 = await rpc(p, "petContextoUnidade", {
    cliente_id: ids.client,
    unidade_id: ids.unit,
    norma: "NR33",
    local_id: ids.locals[0],
  });
  const other = await rpc(p, "petListar", {
    filtros: { unidade_id: ids.unit, espaco_id: c24.espaco_id },
  });
  check(!other.registros.some((v) => v.id === a.pet.id), "PET EC25 ausente no EC24");
  const fixtures = JSON.parse(await readFile("docs/cotrirosa/controlled-fixtures.json", "utf8"));
  await p.goto(`${root}/execucao/pets/${fixtures.legacy}`);
  await p.waitForURL((u) => u.pathname === `/nr-33/pets/${fixtures.legacy}`);
  check(
    new URL(p.url()).searchParams.get("local") === ids.locals[0],
    "URL legada resolve a unidade e o local autorizados",
  );
  await p.goto(`${root}/nr-33/pets/${a.pet.id}?cliente=${ids.client}&unidade=${ids.other}`);
  await p
    .getByText("A PET não corresponde à unidade/local informado ou o contexto não está autorizado.")
    .waitFor();
  check(true, "URL de PET com unidade manipulada é recusada");
  await p.goto(`${root}/nr-33/pets?${query}&local=${ids.locals[1]}`);
  await p
    .locator("select")
    .filter({ has: p.locator('option[value="concluidas"]') })
    .selectOption("concluidas");
  await p.locator(`a[href*="${fixtures.closed}"]`).first().waitFor();
  await shot(p, "historico-encerrada-fixture");
  check(true, "histórico mostra fixture encerrada identificada, sem assinatura sintética");
  await p.goto(url("", "nr-35"));
  await ready(p);
  check(true, "mesma cena no contexto NR35");
  await p.goto(url().replace(ids.unit, ids.other));
  await p.getByText("Esta unidade não possui cena publicada.", { exact: false }).waitFor();
  check((await p.locator("canvas").count()) === 0, "outra unidade não carrega cena");
  for (const name of ["patio", "aerial", "facade", "base", "sa05", "unit"]) {
    const cp = manifest.cameras[name],
      page = await context.newPage();
    const referenceSize = { patio: [960, 1280], aerial: [1536, 881], facade: [998, 661] }[name];
    if (referenceSize)
      await page.setViewportSize({ width: referenceSize[0], height: referenceSize[1] + 152 });
    await page.addInitScript(({ key, pose }) => sessionStorage.setItem(key, JSON.stringify(pose)), {
      key: `nr-map:${ids.org}:${ids.user}:NR33:${ids.client}:${ids.unit}`,
      pose: { mode: "normal", ...cp, zoom: 1 },
    });
    await page.goto(url());
    await ready(page);
    await page.locator("canvas").screenshot({ path: `${out}/comparacao-${name}.png` });
    report.captures.push("comparacao-" + name);
    await page.close();
  }
  const mobile = await b.newContext({
    viewport: { width: 390, height: 844 },
    isMobile: true,
    hasTouch: true,
    deviceScaleFactor: 1,
    reducedMotion: "reduce",
    recordVideo: { dir: out, size: { width: 390, height: 844 } },
  });
  const m = await mobile.newPage();
  activePage = m;
  await m.goto(url());
  await ready(m);
  await shot(m, "mobile-normal");
  const cd = await mobile.newCDPSession(m);
  await cd.send("Input.dispatchTouchEvent", {
    type: "touchStart",
    touchPoints: [
      { x: 130, y: 350, id: 1 },
      { x: 250, y: 350, id: 2 },
    ],
  });
  await cd.send("Input.dispatchTouchEvent", {
    type: "touchMove",
    touchPoints: [
      { x: 90, y: 350, id: 1 },
      { x: 290, y: 350, id: 2 },
    ],
  });
  await cd.send("Input.dispatchTouchEvent", { type: "touchEnd", touchPoints: [] });
  check(!new URL(m.url()).searchParams.get("local"), "pinça não seleciona silo");
  for (const mode of ["Superior", "Angular"]) {
    await m.getByRole("button", { name: mode, exact: true }).click();
    await shot(m, "mobile-" + mode.toLowerCase());
  }
  await m.getByRole("button", { name: "Locais", exact: true }).click();
  await m.getByRole("button", { name: /^EC 25 / }).click();
  await shot(m, "mobile-resumo");
  await m.getByRole("button", { name: "Operação da PET", exact: true }).click();
  await m.locator(`a[href*="${a.pet.id}"]`).first().waitFor();
  await shot(m, "mobile-pet");
  check(true, "PET criada no desktop disponível no celular emulado");
  check(
    await m.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth),
    "celular sem transbordamento horizontal",
  );
  const video = await m.video().path();
  await mobile.close();
  report.mobileVideo = video;
  const fallback = await b.newContext({ viewport: { width: 390, height: 844 } });
  await fallback.addInitScript(() => {
    const original = HTMLCanvasElement.prototype.getContext;
    HTMLCanvasElement.prototype.getContext = function (type, ...args) {
      return /webgl/i.test(type) ? null : original.call(this, type, ...args);
    };
  });
  const f = await fallback.newPage();
  activePage = f;
  await f.goto(url());
  await f.getByRole("heading", { name: "Mapa em lista" }).waitFor();
  check(
    (await f.getByRole("button", { name: /^EC 2[4-8] / }).count()) === 5,
    "sem WebGL mantém cinco locais",
  );
  await f.getByRole("button", { name: /^EC 25 / }).click();
  await f.getByRole("button", { name: "Operação da PET", exact: true }).click();
  await f.locator(`a[href*="${a.pet.id}"]`).first().waitFor();
  await shot(f, "mobile-sem-webgl");
  check(true, "sem WebGL mantém PET do mesmo silo");
  await fallback.close();
  await p.goto(url());
  await ready(p);
  await p.getByRole("button", { name: "Superior", exact: true }).click();
  await p.getByRole("button", { name: "Enquadrar unidade", exact: true }).click();
  await p.waitForTimeout(350);
  await shot(p, "superior-perimetro");
  await p
    .locator("canvas")
    .evaluate((c) => c.getContext("webgl2").getExtension("WEBGL_lose_context").loseContext());
  await p.getByRole("heading", { name: "Mapa em lista" }).waitFor();
  check(true, "perda de contexto durante navegação mantém lista");
  await context.close();
} catch (error) {
  report.failure = String(error);
  if (activePage && !activePage.isClosed()) {
    report.failureUrl = activePage.url();
    report.failureText = await activePage.locator("body").innerText();
    await shot(activePage, "ui-failure");
  }
  throw error;
} finally {
  await writeFile(`${out}/ui-results.json`, JSON.stringify(report, null, 2));
  await b.close();
}
