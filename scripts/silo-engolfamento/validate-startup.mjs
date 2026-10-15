import { chromium } from "@playwright/test";
import assert from "node:assert/strict";
import { mkdir, writeFile } from "node:fs/promises";
import path from "node:path";
import { evidenceReplacer } from "./evidence-privacy.mjs";

const base = process.env.SILO_URL ?? "http://127.0.0.1:5185";
const output = process.env.SILO_OUTPUT ?? "docs/silo-engolfamento/evidence/upgrade/startup-state";
const filter = process.env.SILO_STARTUP_CHECKS ? new RegExp(process.env.SILO_STARTUP_CHECKS) : null;
await mkdir(output, { recursive: true });
const browser = await chromium.launch({ channel: "chrome", headless: true });
const report = {
  testedAt: new Date().toISOString(),
  browser: browser.version(),
  base,
  scopeFilter: process.env.SILO_STARTUP_CHECKS ?? null,
  condition:
    "Chrome local 1440×900 DPR1. Synthetic shader holds exercise lifecycle, not startup speed.",
  checks: [],
  failures: [],
  errors: [],
};
async function pageFor() {
  const context = await browser.newContext({ viewport: { width: 1440, height: 900 } });
  const page = await context.newPage();
  page.on("pageerror", (error) => report.errors.push(error.message));
  page.on("console", (message) => {
    if (
      /GL_INVALID_OPERATION|GL_INVALID_VALUE|GL_INVALID_ENUM|THREE.WebGLProgram: Shader Error|WebGL:\s*INVALID/.test(
        message.text(),
      )
    )
      report.errors.push(message.text());
  });
  return { context, page };
}
async function ready(page) {
  await page.waitForSelector("canvas[data-ready=true]", { timeout: 60000 });
  await page.waitForFunction(() => window.__siloMetrics?.readyMs > 0);
}
async function metrics(page) {
  return page.evaluate(() => {
    const m = window.__siloMetrics;
    return {
      startedAt: m.startedAt,
      preparationMs: m.preparationMs,
      explorationMs: m.explorationMs,
      assetReadyMs: m.assetReadyMs,
      mainCompileMs: m.mainCompileMs,
      workerCompileMs: m.workerCompileMs,
      readyMs: m.readyMs,
      renderCount: m.renderCount,
      parallelShaderCompile: m.parallelShaderCompile,
      workers: m.workerVisible,
      ropeVisible: m.ropeVisible,
      dorsalError: m.dorsalError,
      time: Number(document.querySelector("canvas")?.dataset.time ?? 0),
    };
  });
}
function holdCompilation() {
  window.__holdSiloCompilation = true;
  for (const Context of [WebGLRenderingContext, WebGL2RenderingContext]) {
    const original = Context.prototype.getProgramParameter;
    Context.prototype.getProgramParameter = function (program, parameter) {
      const extension = this.getExtension("KHR_parallel_shader_compile");
      if (
        extension &&
        parameter === extension.COMPLETION_STATUS_KHR &&
        window.__holdSiloCompilation
      )
        return false;
      return original.call(this, program, parameter);
    };
  }
}
async function check(name, run) {
  if (filter && !filter.test(name)) return;
  const start = performance.now();
  try {
    report.checks.push({
      name,
      result: "aprovado",
      evidence: await run(),
      durationMs: performance.now() - start,
    });
    console.log(`PASS ${name}`);
  } catch (error) {
    const failure = {
      name,
      result: "não atingido",
      error: String(error.stack ?? error),
      durationMs: performance.now() - start,
    };
    report.failures.push(failure);
    report.checks.push(failure);
    console.error(`FAIL ${name}: ${error.message}`);
  }
}
try {
  await check("Ready follows a visible compiled worker frame", async () => {
    const { context, page } = await pageFor();
    try {
      await page.goto(`${base}/mapas-3d/silo-engolfamento`);
      await ready(page);
      const result = await metrics(page);
      assert.ok(result.preparationMs > 0 && result.mainCompileMs > 0 && result.workerCompileMs > 0);
      assert.ok(result.readyMs >= result.explorationMs && result.readyMs >= result.assetReadyMs);
      assert.ok(result.renderCount > 0 && result.workers.A && result.workers.B);
      assert.equal(result.time, 0);
      await page.screenshot({ path: path.join(output, "1440-first-ready.png") });
      return result;
    } finally {
      await context.close();
    }
  });
  await check(
    "Exploration and cut work before rigs load without a floating individual rope",
    async () => {
      const { context, page } = await pageFor();
      let release;
      const held = new Promise((resolve) => {
        release = resolve;
      });
      try {
        await page.route("**/worker-a.glb", async (route) => {
          await held;
          await route.continue().catch(() => {});
        });
        await page.goto(`${base}/mapas-3d/silo-engolfamento`);
        await page.waitForSelector("canvas[data-exploration-ready=true]", { timeout: 60000 });
        const before = await metrics(page);
        assert.ok(before.explorationMs > 0);
        assert.equal(before.readyMs, 0);
        assert.equal(before.workers.A, false);
        assert.equal(before.ropeVisible, false);
        await page.getByRole("button", { name: "Corte", exact: true }).click();
        await page.waitForFunction(
          (count) => window.__siloMetrics.renderCount > count,
          before.renderCount,
        );
        const cut = await metrics(page);
        assert.equal(cut.readyMs, 0);
        assert.equal(cut.ropeVisible, false);
        assert.equal(cut.time, 0);
        await page.screenshot({ path: path.join(output, "1440-cut-awaiting-rigs.png") });
        release();
        await ready(page);
        const complete = await metrics(page);
        assert.ok(complete.workers.A && complete.workers.B && complete.ropeVisible);
        assert.ok(complete.dorsalError < 0.00002);
        assert.equal(complete.time, 0);
        await page.screenshot({ path: path.join(output, "1440-cut-rigs-ready.png") });
        return { before, cut, complete };
      } finally {
        release();
        await context.close();
      }
    },
  );
  await check(
    "Pending shader compilation cannot publish readiness or survive owner disposal",
    async () => {
      const { context, page } = await pageFor();
      try {
        await context.addInitScript(holdCompilation);
        await page.goto(`${base}/mapas-3d/silo-engolfamento`);
        await page.waitForFunction(() => window.__siloMetrics?.preparationMs > 0);
        await page.waitForTimeout(300);
        const pending = await metrics(page);
        assert.equal(pending.parallelShaderCompile, true);
        assert.equal(pending.readyMs, 0);
        assert.equal(pending.explorationMs, 0);
        assert.equal(pending.renderCount, 0);
        assert.equal(pending.assetReadyMs, 0);
        assert.equal(
          await page.evaluate(() =>
            performance
              .getEntriesByType("resource")
              .some((entry) => /worker-[ab]\.glb/.test(entry.name)),
          ),
          false,
        );
        await page.evaluate(() => {
          window.__heldSiloOwner = window.__siloMetrics;
        });
        await page.getByRole("link", { name: "Voltar à biblioteca", exact: true }).click();
        await page.waitForURL("**/mapas-3d/unidades");
        await page.evaluate(() => {
          window.__holdSiloCompilation = false;
        });
        await page.waitForTimeout(500);
        assert.equal(await page.locator("canvas").count(), 0);
        assert.equal(await page.evaluate(() => window.__heldSiloOwner.disposed), true);
        assert.equal(await page.evaluate(() => window.__heldSiloOwner.readyMs), 0);
        return { pending, detached: true, lateReady: false };
      } finally {
        await context.close();
      }
    },
  );
  await check(
    "Late harness binding preserves isolation, restoration and an earlier selection",
    async () => {
      const phases = [];
      for (const strategy of ["isolation", "selection"]) {
        const { context, page } = await pageFor();
        let release;
        const held = new Promise((resolve) => {
          release = resolve;
        });
        try {
          await page.route("**/worker-a.glb", async (route) => {
            await held;
            await route.continue().catch(() => {});
          });
          await page.goto(`${base}/mapas-3d/silo-engolfamento`);
          await page.waitForSelector("canvas[data-exploration-ready=true]", { timeout: 60000 });
          await page.getByRole("button", { name: "Componentes e estrutura", exact: true }).click();
          if (strategy === "isolation") {
            await page.getByRole("button", { name: "Estrutura do silo", exact: true }).click();
            await page.getByRole("button", { name: /^Fundação e plinto/ }).click();
            await page.getByRole("button", { name: "Isolar", exact: true }).click();
          } else {
            await page.getByRole("button", { name: /^Cinturão paraquedista/ }).click();
          }
          const before = await metrics(page);
          assert.equal(before.assetReadyMs, 0);
          release();
          await ready(page);
          if (strategy === "isolation") {
            assert.equal(
              await page.evaluate(() => window.__siloMetrics.isolatedId),
              "structure.foundation",
            );
            assert.equal((await metrics(page)).ropeVisible, false);
            await page.screenshot({ path: path.join(output, "1440-late-bind-isolated.png") });
            await page.getByRole("button", { name: "Restaurar conjunto", exact: true }).click();
            await page.waitForFunction(() => !window.__siloMetrics.isolatedId);
            assert.ok((await metrics(page)).workers.A);
            await page.screenshot({ path: path.join(output, "1440-late-bind-restored.png") });
          } else {
            assert.equal(
              await page.evaluate(() => window.__siloMetrics.selectedId),
              "lvhf.harness",
            );
            await page.getByRole("button", { name: "Localizar", exact: true }).click();
            await page.waitForTimeout(1400);
            assert.equal(await page.locator(".silo-selection-marker").isVisible(), true);
            assert.ok((await metrics(page)).dorsalError < 0.00002);
            await page.screenshot({ path: path.join(output, "1440-late-bind-highlighted.png") });
          }
          assert.equal((await metrics(page)).time, 0);
          phases.push({ strategy, before, complete: await metrics(page) });
        } finally {
          release();
          await context.close();
        }
      }
      return phases;
    },
  );
  await check(
    "Context loss during shader compilation restores the same owner without advancing time",
    async () => {
      const { context, page } = await pageFor();
      try {
        await context.addInitScript(holdCompilation);
        await page.goto(`${base}/mapas-3d/silo-engolfamento`);
        await page.waitForFunction(() => window.__siloMetrics?.preparationMs > 0);
        await page.waitForTimeout(300);
        await page.evaluate(() => {
          window.__heldSiloOwner = window.__siloMetrics;
          const gl = document.querySelector("canvas").getContext("webgl2");
          window.__heldSiloLoss = gl.getExtension("WEBGL_lose_context");
          window.__heldSiloLoss.loseContext();
        });
        await page.getByText("Visualização pausada", { exact: true }).waitFor();
        await page.evaluate(() => {
          window.__holdSiloCompilation = false;
        });
        await page.waitForTimeout(150);
        await page.evaluate(() => window.__heldSiloLoss.restoreContext());
        await ready(page);
        assert.equal(
          await page.evaluate(() => window.__heldSiloOwner === window.__siloMetrics),
          true,
        );
        const result = await metrics(page);
        assert.equal(result.time, 0);
        return result;
      } finally {
        await context.close();
      }
    },
  );
  await check("Missing local environment has a recoverable identified error", async () => {
    const { context, page } = await pageFor();
    try {
      await page.route("**/environment-pmrem-256.png", (route) =>
        route.fulfill({ status: 404, body: "missing test resource" }),
      );
      await page.goto(`${base}/mapas-3d/silo-engolfamento`);
      await page.getByText("Visualização indisponível", { exact: true }).waitFor();
      assert.match(await page.locator(".silo-viewer").textContent(), /Reflexos locais.*404/);
      await page.unroute("**/environment-pmrem-256.png");
      await page
        .getByRole("button", { name: "Tentar novamente em qualidade leve", exact: true })
        .click();
      await ready(page);
      return { identified: true, retry: await metrics(page) };
    } finally {
      await context.close();
    }
  });
  await check(
    "No parallel-compile extension retains the completed-frame readiness contract",
    async () => {
      const { context, page } = await pageFor();
      try {
        await context.addInitScript(() => {
          for (const Context of [WebGLRenderingContext, WebGL2RenderingContext]) {
            const original = Context.prototype.getExtension;
            Context.prototype.getExtension = function (name) {
              return name === "KHR_parallel_shader_compile" ? null : original.call(this, name);
            };
          }
        });
        await page.goto(`${base}/mapas-3d/silo-engolfamento`);
        await ready(page);
        const result = await metrics(page);
        assert.equal(result.parallelShaderCompile, false);
        assert.ok(result.readyMs >= result.assetReadyMs && result.workers.A);
        return result;
      } finally {
        await context.close();
      }
    },
  );
  await check(
    "A stalled shader compilation reaches the deadline and retries with a new owner",
    async () => {
      const { context, page } = await pageFor();
      try {
        await context.addInitScript(holdCompilation);
        await page.goto(`${base}/mapas-3d/silo-engolfamento`);
        await page
          .getByText("Visualização indisponível", { exact: true })
          .waitFor({ timeout: 35000 });
        assert.match(await page.locator(".silo-viewer").textContent(), /Tempo excedido/);
        assert.equal((await metrics(page)).readyMs, 0);
        await page.evaluate(() => {
          window.__heldSiloOwner = window.__siloMetrics;
          window.__holdSiloCompilation = false;
        });
        await page
          .getByRole("button", { name: "Tentar novamente em qualidade leve", exact: true })
          .click();
        await ready(page);
        assert.equal(
          await page.evaluate(
            () =>
              window.__heldSiloOwner.disposed && window.__heldSiloOwner !== window.__siloMetrics,
          ),
          true,
        );
        return { deadlineMs: 20000, retry: await metrics(page) };
      } finally {
        await context.close();
      }
    },
  );
  await check(
    "A hidden first-frame deadline remains an error after visibility returns until explicit retry",
    async () => {
      const { context, page } = await pageFor();
      try {
        await context.addInitScript(holdCompilation);
        await page.goto(`${base}/mapas-3d/silo-engolfamento`);
        await page.waitForFunction(() => window.__siloMetrics?.preparationMs > 0);
        await page.evaluate(() => {
          Object.defineProperty(document, "hidden", { configurable: true, value: true });
          document.dispatchEvent(new Event("visibilitychange"));
          window.__holdSiloCompilation = false;
        });
        await page
          .getByText("Visualização indisponível", { exact: true })
          .waitFor({ timeout: 35000 });
        const failed = await metrics(page);
        assert.equal(failed.explorationMs, 0);
        assert.equal(failed.readyMs, 0);
        assert.equal(failed.renderCount, 0);
        await page.evaluate(() => {
          delete document.hidden;
          document.dispatchEvent(new Event("visibilitychange"));
        });
        await page.waitForTimeout(500);
        assert.equal(
          await page.getByText("Visualização indisponível", { exact: true }).isVisible(),
          true,
        );
        assert.equal((await metrics(page)).renderCount, 0);
        await page
          .getByRole("button", { name: "Tentar novamente em qualidade leve", exact: true })
          .click();
        await ready(page);
        return { syntheticVisibility: true, failed, retry: await metrics(page) };
      } finally {
        await context.close();
      }
    },
  );
  assert.deepEqual(report.errors, [], "Unexpected JavaScript or WebGL errors");
} finally {
  await browser.close();
  await writeFile(
    path.join(output, "startup-state.json"),
    `${JSON.stringify(report, evidenceReplacer, 2)}\n`,
  );
}
if (report.failures.length || report.errors.length) process.exitCode = 1;
