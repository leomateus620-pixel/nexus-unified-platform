import { chromium } from "@playwright/test";
import assert from "node:assert/strict";
import { mkdir, writeFile, readFile } from "node:fs/promises";
import path from "node:path";

const base = process.env.SILO_URL ?? "http://127.0.0.1:5185";
const output = process.env.SILO_OUTPUT ?? "docs/silo-engolfamento/evidence";
await mkdir(output, { recursive: true });
const browser = await chromium.launch({ channel: "chrome", headless: true });
const context = await browser.newContext({
  viewport: { width: 390, height: 844 },
  deviceScaleFactor: 1,
  isMobile: true,
  hasTouch: true,
});
const page = await context.newPage();
page.setDefaultTimeout(20000);
const errors = [];
page.on("pageerror", (error) => errors.push(error.message));
const report = {
  version: 1,
  testedAt: new Date().toISOString(),
  command: "node scripts/silo-engolfamento/validate-touch-commands.mjs",
  browser: browser.version(),
  environment: "Chrome headless 390×844 touch emulation; not a physical telephone.",
  benchmarksPerformed: false,
  retainedPerformanceEvidence: "ui.json — 12 samples from the unchanged 3D scene",
  checks: [],
  errors,
  failures: [],
};
const state = () =>
  page.evaluate(() => ({
    camera: document.querySelector("canvas")?.dataset.camera,
    status: document.querySelector("canvas")?.dataset.status,
    time: document.querySelector("canvas")?.dataset.time,
    dialogs: document.querySelectorAll("dialog[open]").length,
    optionsExpanded: document
      .querySelector('button[aria-label="Opções da experiência"]')
      ?.getAttribute("aria-expanded"),
    canvases: document.querySelectorAll("canvas").length,
    reason: document.querySelector(".silo-reason")?.textContent,
  }));
async function check(name, run) {
  try {
    const evidence = await run();
    report.checks.push({ name, result: "passed", evidence });
    console.log(`PASS ${name}`);
  } catch (error) {
    const failure = {
      name,
      result: "failed",
      error: String(error.stack ?? error),
      state: await state().catch(() => null),
    };
    report.checks.push(failure);
    report.failures.push(failure);
    console.error(`FAIL ${name}: ${error.message}`);
  }
}
async function drag() {
  const cdp = await context.newCDPSession(page);
  const area = await page.locator("canvas").boundingBox();
  const x = area.x + area.width * 0.5,
    y = area.y + area.height * 0.3;
  await cdp.send("Input.dispatchTouchEvent", {
    type: "touchStart",
    touchPoints: [{ x, y, id: 1 }],
  });
  await cdp.send("Input.dispatchTouchEvent", {
    type: "touchMove",
    touchPoints: [{ x: x + 32, y: y + 12, id: 1 }],
  });
  await cdp.send("Input.dispatchTouchEvent", { type: "touchEnd", touchPoints: [] });
  await cdp.detach();
}
async function seek(value) {
  await page.getByRole("slider", { name: "Instante da simulação" }).evaluate((input, time) => {
    Object.getOwnPropertyDescriptor(HTMLInputElement.prototype, "value").set.call(
      input,
      String(time),
    );
    input.dispatchEvent(new Event("input", { bubbles: true }));
    input.dispatchEvent(new Event("change", { bubbles: true }));
  }, value);
  await page.waitForFunction(
    (time) => Number(document.querySelector("canvas").dataset.time) === time,
    value,
  );
}
async function dialogClosed() {
  await page.waitForFunction(() => !document.querySelector("dialog[open]"));
  await page.waitForTimeout(200);
  assert.equal((await state()).dialogs, 0, "a compatibility click reopened the panel");
}

try {
  await page.goto(`${base}/mapas-3d/silo-engolfamento`, { waitUntil: "domcontentloaded" });
  await page.bringToFront();
  await page.waitForSelector("canvas[data-ready=true]", { timeout: 90000 });
  await page.waitForFunction(
    () =>
      !document.querySelector(".silo-load") && !document.querySelector(".silo-primary").disabled,
  );
  await seek(6);
  await page.getByLabel("Velocidade de reprodução", { exact: true }).selectOption(".25");
  await page.getByRole("button", { name: "Técnico A — primeira pessoa", exact: true }).tap();
  await page.waitForFunction(() => document.querySelector("canvas").dataset.camera === "connected");

  await check(
    "Canvas drag then sources-header touch opens one modal; close touch closes once",
    async () => {
      await drag();
      await page.getByRole("button", { name: "Fontes e critérios", exact: true }).tap();
      await page
        .getByRole("dialog", { name: "Fontes e critérios", exact: true })
        .waitFor({ state: "visible" });
      await page.waitForTimeout(200);
      assert.equal((await state()).dialogs, 1);
      const openState = await state();
      await page.getByRole("button", { name: "Fechar painel", exact: true }).tap();
      await dialogClosed();
      return { afterOpen: openState, afterClose: await state() };
    },
  );

  await check(
    "Options touch toggles once each way; immediate keyboard Enter remains usable",
    async () => {
      const options = page.getByRole("button", { name: "Opções da experiência", exact: true });
      await drag();
      await options.tap();
      await page.waitForFunction(
        () =>
          document
            .querySelector('button[aria-label="Opções da experiência"]')
            .getAttribute("aria-expanded") === "true",
      );
      await page.waitForTimeout(200);
      assert.equal((await state()).optionsExpanded, "true");
      await options.tap();
      await page.waitForFunction(
        () =>
          document
            .querySelector('button[aria-label="Opções da experiência"]')
            .getAttribute("aria-expanded") === "false",
      );
      await options.focus();
      await page.keyboard.press("Enter");
      await page.waitForFunction(
        () =>
          document
            .querySelector('button[aria-label="Opções da experiência"]')
            .getAttribute("aria-expanded") === "true",
      );
      await page.keyboard.press("Enter");
      await page.waitForFunction(
        () =>
          document
            .querySelector('button[aria-label="Opções da experiência"]')
            .getAttribute("aria-expanded") === "false",
      );
      return state();
    },
  );

  await check("Sources and modal-close keyboard Enter execute after recent touch", async () => {
    await page.getByRole("button", { name: "Fontes e critérios", exact: true }).focus();
    await page.keyboard.press("Enter");
    await page
      .getByRole("dialog", { name: "Fontes e critérios", exact: true })
      .waitFor({ state: "visible" });
    assert.equal((await state()).dialogs, 1);
    await page.getByRole("button", { name: "Fechar painel", exact: true }).focus();
    await page.keyboard.press("Enter");
    await dialogClosed();
    return state();
  });

  await check(
    "Sidebar inspection, annotation close and analysis commands work by touch",
    async () => {
      await page.getByRole("button", { name: "Opções da experiência", exact: true }).tap();
      await page.getByRole("button", { name: "Ancoragem", exact: true }).tap();
      await page.locator(".silo-annotation").waitFor({ state: "visible" });
      assert.ok(
        (await page.locator(".silo-annotation").textContent()).includes("Suporte e dispositivo"),
      );
      await page.getByRole("button", { name: "Fechar destaque técnico", exact: true }).tap();
      await page.locator(".silo-annotation").waitFor({ state: "hidden" });
      await page.getByRole("button", { name: /Análise, prevenção e dados/ }).tap();
      await page
        .getByRole("dialog", { name: "Análise do incidente e prevenção", exact: true })
        .waitFor({ state: "visible" });
      assert.equal((await state()).dialogs, 1);
      await page.getByRole("button", { name: "Fechar painel", exact: true }).tap();
      await dialogClosed();
      await page.getByRole("button", { name: "Opções da experiência", exact: true }).tap();
      assert.equal((await state()).optionsExpanded, "false");
      return state();
    },
  );

  await check("After canvas drag, transport touch resumes once then pauses once", async () => {
    await seek(6);
    await page.getByRole("button", { name: "Técnico A — primeira pessoa", exact: true }).tap();
    await page.waitForFunction(
      () => document.querySelector("canvas").dataset.camera === "connected",
    );
    await drag();
    await page.getByRole("button", { name: "Continuar", exact: true }).tap();
    await page.waitForFunction(() => document.querySelector("canvas").dataset.status === "running");
    await page.waitForTimeout(200);
    assert.equal((await state()).status, "running");
    const running = await state();
    await page.getByRole("button", { name: "Pausar", exact: true }).tap();
    await page.waitForFunction(() => document.querySelector("canvas").dataset.status === "paused");
    const paused = await state();
    await page.waitForTimeout(200);
    assert.equal((await state()).time, paused.time);
    assert.equal((await state()).status, "paused");
    assert.equal(paused.reason, "Pausado");
    return { running, paused };
  });

  await check(
    "Transport keyboard Enter resumes/pauses once during touch-click deduplication window",
    async () => {
      await page.locator(".silo-primary").focus();
      await page.keyboard.press("Enter");
      await page.waitForFunction(
        () => document.querySelector("canvas").dataset.status === "running",
      );
      await page.keyboard.press("Enter");
      await page.waitForFunction(
        () => document.querySelector("canvas").dataset.status === "paused",
      );
      assert.equal((await state()).reason, "Pausado");
      assert.equal((await state()).canvases, 1);
      return state();
    },
  );

  await check("Touch reset returns to zero with one canvas and no page errors", async () => {
    await page.getByRole("button", { name: "Reiniciar simulação", exact: true }).tap();
    await page.waitForFunction(
      () =>
        document.querySelector("canvas").dataset.status === "idle" &&
        Number(document.querySelector("canvas").dataset.time) === 0,
    );
    assert.equal((await state()).canvases, 1);
    assert.deepEqual(errors, []);
    return state();
  });
} catch (error) {
  report.failures.push({ name: "focused test setup", error: String(error.stack ?? error) });
} finally {
  report.completedAt = new Date().toISOString();
  await writeFile(path.join(output, "touch-commands.json"), JSON.stringify(report, null, 2));
  const note = [
    "",
    "## Verificação adicional dos comandos por toque",
    "",
    `Execução de ${report.testedAt}: ${report.checks.filter((check) => check.result === "passed").length}/${report.checks.length} verificações passaram; ${report.failures.length} falhas.`,
    "",
    "Comando: `node scripts/silo-engolfamento/validate-touch-commands.mjs`. Após arrastar o canvas: fontes, fechamento de modal, opções, comandos laterais, continuar/pausar e reiniciar foram verificados por toque, incluindo Enter logo após toque. Esta rodada cobre a ampliação de CommandButton; não repete benchmarks nem substitui a identificação de emulação de celular.",
    "",
    "Dados completos: [touch-commands.json](./touch-commands.json). A cena e o orçamento 3D permanecem os da medição principal em ui.json.",
  ].join("\n");
  const validationPath = path.join(output, "validation.md");
  const previous = await readFile(validationPath, "utf8").catch(
    () => "# Verificação dos comandos\n",
  );
  const cutoff = previous.indexOf("\n## Verificação adicional dos comandos por toque");
  await writeFile(
    validationPath,
    (cutoff < 0 ? previous : previous.slice(0, cutoff)).trimEnd() + "\n" + note,
  );
  await browser.close();
}
console.log(
  JSON.stringify({
    checks: report.checks.length,
    passed: report.checks.filter((check) => check.result === "passed").length,
    failures: report.failures.length,
    benchmarksPerformed: false,
  }),
);
process.exitCode = report.failures.length ? 1 : 0;
