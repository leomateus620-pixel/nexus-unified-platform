import { chromium } from "@playwright/test";
import { ids } from "./fixture.mjs";
const b = await chromium.launch({
  args: ["--use-angle=d3d11", "--enable-gpu", "--ignore-gpu-blocklist"],
});
let p = await b.newPage({ viewport: { width: 1440, height: 1000 }, reducedMotion: "reduce" });
const url = `http://127.0.0.1:4196/nr-33/mapa-3d?cliente=${ids.client}&unidade=${ids.unit}`;
await p.goto(url);
await p.locator("canvas[data-ready=true]").waitFor();
const resp = await p.request.post("http://127.0.0.1:4196/__cotrirosa", {
  data: {
    name: "nrMapaContexto",
    data: {
      organization_id: ids.org,
      cliente_id: ids.client,
      unidade_id: ids.unit,
      norma: "NR33",
      manifesto: true,
    },
  },
});
const { manifest } = await resp.json();
for (const view of ["junction", "arrival"]) {
  await p.close();
  p = await b.newPage({ viewport: { width: 1440, height: 1000 }, reducedMotion: "reduce" });
  await p.addInitScript(({ key, pose }) => sessionStorage.setItem(key, JSON.stringify(pose)), {
    key: `nr-map:${ids.org}:${ids.user}:NR33:${ids.client}:${ids.unit}`,
    pose: { mode: "normal", ...manifest.cameras[view], zoom: 1 },
  });
  await p.goto(url);
  await p.locator("canvas[data-ready=true]").waitFor();
  await p.waitForTimeout(900);
  await p.screenshot({ path: `docs/cotrirosa/${view}-after.png` });
  if (view === "junction") {
    await p.getByRole("button", { name: "Superior", exact: true }).click();
    await p.waitForTimeout(400);
    await p.screenshot({ path: "docs/cotrirosa/junction-top-after.png" });
  }
}
await b.close();
