import { test, expect } from "@playwright/test";
import { writeFile } from "node:fs/promises";
import { readFileSync } from "node:fs";
import { OrthographicCamera, Vector3 } from "three";
import type { ElementRecord } from "../../src/industrial/types/index.ts";
const site = JSON.parse(readFileSync("src/industrial/data/site.json", "utf8"));
const elements = site.elements as ElementRecord[];
const byId = new Map(elements.map((element) => [element.id, element]));
const ready = async (page: import("@playwright/test").Page) => {
  await page.goto("/mapas-3d");
  await page.waitForFunction(() => window.__industrialMetrics?.status === "ready");
};

test("orbital zoom, keyboard minimap, original-photo overlay and registry export", async ({
  page,
}) => {
  await ready(page);
  await page.getByRole("button", { name: "Recolher painel" }).click();
  const before = await page.evaluate(() => window.__industrialMetrics!.camera);
  await page.mouse.move(820, 350);
  await page.mouse.wheel(0, -450);
  await page.waitForTimeout(700);
  const after = await page.evaluate(() => window.__industrialMetrics!.camera);
  expect(Math.hypot(...after.map((v, i) => v - before[i]!))).toBeGreaterThan(2);
  const silo = page.getByRole("button", { name: "Selecionar Silo 01 no minimapa", exact: true });
  await silo.focus();
  await page.keyboard.press("Enter");
  await expect(page.getByText("SILO-01 · identificação técnica")).toBeVisible();
  await page.getByRole("button", { name: "Fotos", exact: true }).click();
  await page.locator(".industrial-reference-card").filter({ hasText: "Foto B" }).click();
  await expect(page.getByAltText("Sobreposição da Foto B")).toBeVisible();
  await page.getByLabel("Opacidade da fotografia").fill("0.25");
  await expect(page.getByAltText("Sobreposição da Foto B")).toHaveCSS("opacity", "0.25");
  await page.getByRole("button", { name: "Fechar comparação" }).click();
  await page.getByRole("button", { name: "Ajustes", exact: true }).click();
  const pending = page.waitForEvent("download");
  await page.getByRole("button", { name: "Exportar cadastro", exact: true }).click();
  const download = await pending;
  expect(download.suggestedFilename()).toBe("3tentos-cadastro-calibracao.json");
  const stream = await download.createReadStream();
  let json = "";
  for await (const chunk of stream!) json += chunk.toString();
  const data = JSON.parse(json);
  expect(data.elements).toHaveLength(elements.length);
  expect(data.elements.map((element: { id: string }) => element.id)).toEqual(
    expect.arrayContaining([
      "SILO-01",
      "SILO-02",
      "SILO-03",
      "SILO-04",
      "EQ-03",
      "ED-02",
      "ED-03",
      "PV-01",
      "CAD-SILO-PIT-TUNNELS",
      "CAD-WATER-TANK",
    ]),
  );
  expect(
    data.elements.find((element: { id: string }) => element.id === "SILO-01").cad
      .sourceInstancePath,
  ).toBeTruthy();
  expect(data.cadRegistration.status).toBe("local_integration");
  expect(data.cameras).toHaveProperty("D");
  expect(data.calibration).toBeTruthy();
});

test("quality and lighting cycles release renderer resources and route re-entry works", async ({
  page,
}) => {
  await ready(page);
  await page.getByRole("button", { name: "Ajustes", exact: true }).click();
  const snapshots = [];
  for (let i = 0; i < 6; i++) {
    await page.getByLabel("Perfil gráfico").selectOption("economy");
    await page.getByLabel("Iluminação neutra").check();
    await page.waitForTimeout(450);
    await page.getByLabel("Perfil gráfico").selectOption("balanced");
    await page.getByLabel("Iluminação neutra").uncheck();
    await page.waitForTimeout(1200);
    snapshots.push(
      await page.evaluate(() => {
        const m = window.__industrialMetrics!;
        return {
          geometries: m.geometries,
          textures: m.textures,
          programs: m.programs,
          losses: m.contextLosses,
        };
      }),
    );
  }
  expect(snapshots.slice(1)).toEqual(Array(5).fill(snapshots[1]));
  for (let i = 0; i < 3; i++) {
    await page.getByRole("link", { name: "Voltar ao Nexus" }).click();
    await expect(page.getByText("Dashboard Nexus")).toBeVisible();
    await page.getByRole("link", { name: "Mapas 3D das Unidades" }).click();
    await page.waitForFunction(() => window.__industrialMetrics?.status === "ready");
    expect(await page.evaluate(() => window.__industrialMetrics!.contextLosses)).toBe(0);
  }
  await writeFile(
    "docs/industrial/evidence/resource-cycles.json",
    JSON.stringify(
      {
        snapshots,
        routeReentries: 3,
        scope: "Renderer object counts; not a GPU/JS heap leak proof.",
      },
      null,
      2,
    ),
  );
});
test("selection, search, reference camera orientation, layers and inspection modes", async ({
  page,
}) => {
  const errors: string[] = [];
  page.on("pageerror", (e) => errors.push(e.message));
  await ready(page);
  await page.getByLabel("Buscar elementos").fill("SILO-03");
  await page.getByTestId("element-SILO-03").click();
  await expect(page.getByText("SILO-03 · identificação técnica")).toBeVisible();
  await page.getByRole("button", { name: "Aproximar elemento" }).click();
  await page.waitForTimeout(2300);
  expect(await page.evaluate(() => window.__industrialMetrics?.camera[1])).toBeLessThan(60);
  await page.getByRole("button", { name: "Vista da Foto B", exact: true }).click();
  await page.waitForTimeout(700);
  const b = await page.evaluate(() => window.__industrialMetrics?.camera);
  expect(b?.[0]).toBeCloseTo(site.cameras.B.position[0]!, 1);
  expect(b?.[1]).toBeCloseTo(site.cameras.B.position[1]!, 0);
  expect(b?.[2]).toBeCloseTo(site.cameras.B.position[2]!, 1);
  await page.getByRole("button", { name: "Recolher painel" }).click();
  const canvas = await page.locator("canvas").boundingBox();
  expect(canvas).toBeTruthy();
  const aspect = canvas!.width / canvas!.height;
  const halfHeight = (site.cameras.B.span / 2) * Math.max(1, 1448 / 1086 / aspect);
  const projection = new OrthographicCamera(
    -halfHeight * aspect,
    halfHeight * aspect,
    halfHeight,
    -halfHeight,
    0.15,
    900,
  );
  projection.position.fromArray(site.cameras.B.position);
  projection.lookAt(new Vector3().fromArray(site.cameras.B.target));
  projection.updateMatrixWorld();
  const siloOne = byId.get("SILO-01")!;
  const point = new Vector3(
    siloOne.position[0] + 3,
    siloOne.bounds!.max[1],
    siloOne.position[2] + 2,
  ).project(projection);
  await page.mouse.click(
    canvas!.x + ((point.x + 1) * canvas!.width) / 2,
    canvas!.y + ((1 - point.y) * canvas!.height) / 2,
  );
  await expect(page.getByText("SILO-01 · identificação técnica")).toBeVisible();
  await page.getByRole("button", { name: "Camadas", exact: true }).click();
  const calls = await page.evaluate(() => window.__industrialMetrics!.calls);
  await page.getByLabel("Vegetação", { exact: true }).uncheck();
  await page.waitForTimeout(700);
  expect(await page.evaluate(() => window.__industrialMetrics!.calls)).toBeLessThan(calls);
  await page.getByRole("button", { name: "Restaurar camadas" }).click();
  await page.getByRole("button", { name: "Ajustes", exact: true }).click();
  await page.getByLabel("Inspecionar blockout").check();
  await page.waitForFunction(() => Boolean(window.__industrialMetrics?.assets["blockout"]));
  await page.getByLabel("Inspecionar blockout").uncheck();
  await page.getByLabel("Perfil gráfico").selectOption("economy");
  await page.getByLabel("Iluminação neutra").check();
  await page.getByRole("button", { name: "Camadas", exact: true }).click();
  await page.waitForTimeout(700);
  const economyCalls = await page.evaluate(() => window.__industrialMetrics!.calls);
  await page.getByLabel("Vegetação", { exact: true }).uncheck();
  await page.waitForTimeout(700);
  // Economy already hides grass; this proves its tree prototypes are actually
  // instantiated and rendered, including preserved Blender .001 names.
  expect(await page.evaluate(() => window.__industrialMetrics!.calls)).toBeLessThan(economyCalls);
  await page.getByLabel("Vegetação", { exact: true }).check();
  await page.getByRole("button", { name: "Voltar à visão geral" }).click();
  await page.waitForTimeout(2300);
  expect(errors).toEqual([]);
});
test("walking controls, pointer drag, collision, escape and idle rendering", async ({ page }) => {
  await ready(page);
  await page.getByRole("button", { name: "Passeio", exact: true }).click();
  await page.waitForTimeout(600);
  const start = await page.evaluate(() => window.__industrialMetrics!.camera);
  await page.keyboard.down("w");
  await page.waitForTimeout(1500);
  await page.keyboard.up("w");
  const after = await page.evaluate(() => window.__industrialMetrics!.camera);
  expect(Math.hypot(after[0]! - start[0]!, after[2]! - start[2]!)).toBeGreaterThan(2);
  // This short route remains on the preserved gravel yard.
  expect(after[1]).toBeCloseTo(site.terrain.surfaceHeights.yard + 1.7, 4);
  await page.keyboard.press("Escape");
  await page.waitForTimeout(2600);
  const frames = await page.evaluate(() => window.__industrialMetrics!.renderedFrames);
  await page.waitForTimeout(2000);
  const idle = await page.evaluate(() => window.__industrialMetrics!.renderedFrames);
  expect(idle - frames).toBeLessThan(4);
});
test("CAD names and historical aliases select the same stable identity", async ({ page }) => {
  await ready(page);
  await page.getByLabel("Buscar elementos").fill("Galpão adjacente");
  await page.getByTestId("element-ED-01").click();
  await expect(
    page.getByRole("heading", { name: "Pavilhão das moegas", exact: true }),
  ).toBeVisible();
  await expect(page.getByText("ED-01 · identificação técnica")).toBeVisible();
  await expect(page.getByText("Geometria CAD verificada", { exact: true })).toBeVisible();
  await expect(page.getByText("Vínculo confirmado pelo usuário", { exact: true })).toBeVisible();
  await expect(page.getByText("Convenção técnica local", { exact: true })).toBeVisible();
  await page.getByRole("button", { name: "Todos os elementos" }).click();
  await page.getByLabel("Buscar elementos").fill("CAD-OBJ-4120");
  await page.getByTestId("element-ED-04").click();
  await expect(page.getByRole("heading", { name: "Escritório", exact: true })).toBeVisible();
  await expect(page.getByText("ED-04 · identificação técnica")).toBeVisible();
  await page
    .getByRole("button", { name: "Selecionar Elevador dos silos no minimapa", exact: true })
    .focus();
  await page.keyboard.press("Enter");
  await expect(page.getByText("EQ-01 · identificação técnica")).toBeVisible();
  await page.getByRole("button", { name: "Todos os elementos" }).click();
  await page.getByLabel("Buscar elementos").fill("EQ-03");
  await page.getByTestId("element-EQ-03").click();
  await expect(page.getByRole("heading", { name: "Elemento circular", exact: true })).toBeVisible();
  await expect(page.getByText("Estimadas", { exact: true })).toBeVisible();
});
test("failed sector can be retried and interrupted navigation remains usable", async ({ page }) => {
  await page.route("**/models/3tentos/terrain.glb", (r) =>
    r.fulfill({ status: 503, body: "Unavailable" }),
  );
  await page.goto("/mapas-3d");
  await expect(page.getByRole("alert")).toContainText("Não foi possível carregar");
  await page.unroute("**/models/3tentos/terrain.glb");
  await page.getByRole("button", { name: "Recarregar cena" }).click();
  await page.waitForFunction(() => window.__industrialMetrics?.status === "ready");
  await page.getByRole("link", { name: "Voltar ao Nexus" }).click();
  await expect(page.getByText("Dashboard Nexus")).toBeVisible();
  await page.route("**/models/3tentos/terrain.glb", async (r) => {
    await new Promise((resolve) => setTimeout(resolve, 1800));
    try {
      await r.continue();
    } catch {
      /* Navigation abort is expected. */
    }
  });
  await page.goto("/mapas-3d");
  await page.getByRole("link", { name: "Voltar ao Nexus" }).click();
  await expect(page.getByText("Dashboard Nexus")).toBeVisible();
});
test("mobile touch controls and reduced motion work without hover", async ({ browser }) => {
  const context = await browser.newContext({
    baseURL: process.env["MAP_URL"] ?? "http://127.0.0.1:5173",
    viewport: { width: 390, height: 844 },
    deviceScaleFactor: 1,
    isMobile: true,
    hasTouch: true,
    reducedMotion: "reduce",
  });
  const page = await context.newPage();
  await ready(page);
  await expect(page.getByRole("button", { name: "Abrir painel" })).toBeVisible();
  await page.getByRole("button", { name: "Abrir painel" }).tap();
  await page.getByLabel("Buscar elementos").fill("pesagem");
  await page.getByTestId("element-PV-01").tap();
  await expect(page.getByText("Interpretação provável")).toBeVisible();
  await page.getByRole("button", { name: "Ajustes", exact: true }).tap();
  await expect(page.getByLabel("Vento suave nas folhas")).toBeDisabled();
  await page.getByRole("button", { name: "Recolher painel" }).tap();
  await page.getByRole("button", { name: "Passeio", exact: true }).tap();
  await page.waitForTimeout(400);
  const x = await page.evaluate(() => window.__industrialMetrics!.camera);
  const box = await page
    .getByRole("button", { name: "Mover para a direita", exact: true })
    .boundingBox();
  expect(box).toBeTruthy();
  const cdp = await context.newCDPSession(page);
  await cdp.send("Input.dispatchTouchEvent", {
    type: "touchStart",
    touchPoints: [{ x: box!.x + 20, y: box!.y + 20 }],
  });
  await page.waitForTimeout(700);
  await cdp.send("Input.dispatchTouchEvent", { type: "touchEnd", touchPoints: [] });
  const moved = await page.evaluate(() => window.__industrialMetrics!.camera);
  expect(Math.hypot(moved[0]! - x[0]!, moved[2]! - x[2]!)).toBeGreaterThan(1);
  await page.getByRole("button", { name: "Sair do passeio", exact: true }).tap();
  const label = page.locator(".industrial-label");
  await expect(label).toBeVisible();
  const labelBounds = await label.boundingBox();
  expect(labelBounds!.x).toBeGreaterThanOrEqual(0);
  expect(labelBounds!.x + labelBounds!.width).toBeLessThanOrEqual(390);
  expect(labelBounds!.height).toBeLessThan(100);
  await page.screenshot({ path: "docs/industrial/evidence/mobile.png" });
  await context.close();
});
