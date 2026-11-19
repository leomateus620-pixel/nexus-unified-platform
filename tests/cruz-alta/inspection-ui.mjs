import assert from "node:assert/strict";
import http from "node:http";
import { createHash, createHmac } from "node:crypto";
import { spawn } from "node:child_process";
import { mkdir, mkdtemp, writeFile } from "node:fs/promises";
import { resolve, join } from "node:path";
import { tmpdir } from "node:os";
import { fileURLToPath } from "node:url";
import { chromium } from "playwright";
import { PDFDocument } from "pdf-lib";

// App and PDFs are real code paths. This fixture owns a loopback Supabase substitute
// so a browser run never reads a private original or writes to the unit.
const workspace = fileURLToPath(new URL("../..", import.meta.url));
const folder = process.env.CA_INSPECTION_ARTIFACTS
  ? resolve(process.env.CA_INSPECTION_ARTIFACTS)
  : await mkdtemp(join(tmpdir(), "nexus-ca-inspection-ui-"));
await mkdir(folder, { recursive: true });
const fixturePort = Number(process.env.CA_INSPECTION_FIXTURE_PORT ?? 4451);
const appPort = Number(process.env.CA_INSPECTION_APP_PORT ?? 4452);
const fakeApi = "http://127.0.0.1:" + fixturePort;
const app = "http://127.0.0.1:" + appPort;
const map = app + "/mapas-3d/tres-tentos-cruz-alta";
const userId = "385d5a08-b954-4a0b-9e67-c32ee307f2f1";
const orgId = "abab473b-8baa-4781-aed2-c1243338af65";
const unitId = "a9f6603b-6497-8e9e-822a-dfc860510c1a";
const clientId = "c3d779b6-c407-8ab4-8545-6bdfd6068013";
const docId = "f618cb75-19de-4601-87d5-5fcc868af637";
const candidateId = "d4b08715-705d-4c21-a90b-e6c7a27f170a";
const orphanId = "a5259a69-5a18-4463-ae30-3bcbd42c4d74";
const photoFolders = [
  { id: "fixture-rdo-lancada-11", code: "11", name: "Pasta de teste 11", category: "lancada" },
  {
    id: "fixture-rdo-montagem-56",
    code: "56",
    name: "Pasta de teste 56",
    category: "montagem",
    resourceKey: "fixture-resource-key",
  },
  {
    id: "fixture-rdo-montagem-28_1",
    code: "28.1",
    name: "Pasta de teste 28.1",
    category: "montagem",
  },
];
const driveFolders = "https://drive.google.com/drive/folders/";
const launchedPhoto = driveFolders + photoFolders[0].id;
const montagePhoto =
  driveFolders + photoFolders[1].id + "?resourcekey=" + photoFolders[1].resourceKey;
const decimalPhoto = driveFolders + photoFolders[2].id;
const refreshedFolderId = "fixture-rdo-lancada-11-atualizada";
const refreshedPhoto = driveFolders + refreshedFolderId;
let rdoPhotoFolders = photoFolders;
const layoutDescription = "TELHADO ARMAZEM 01 - LVHF 90M - (01 UNIDADE)";
const fixtureDescription = "TELHADO ARMAZEM 01 - LVHF 91M - (01 UNIDADE)";
const fixtureSeal = "99990117";
const publicTitle = "11 · " + layoutDescription;
const privateTitle = "11 · " + fixtureDescription + " · LAC " + fixtureSeal;
const layoutOnlyTitle = "56 · TELHADO AO LADO ARMAZÉM 01 - LVHF 15M - (01 UNIDADE) · LAC 99990156";
const now = new Date();
const expires = Math.floor(now.getTime() / 1000) + 3600;
const due = new Date(now.getTime() + 10 * 24 * 3600_000).toISOString().slice(0, 10);
const toB64 = (obj) => Buffer.from(JSON.stringify(obj)).toString("base64url");
const unsigned =
  toB64({ alg: "HS256", typ: "JWT" }) +
  "." +
  toB64({
    sub: userId,
    exp: expires,
    aud: "authenticated",
    iss: fakeApi + "/auth/v1",
    iat: expires - 3600,
    role: "authenticated",
  });
const token =
  unsigned +
  "." +
  createHmac("sha256", "isolated-loopback-fixture").update(unsigned).digest("base64url");
const user = {
  id: userId,
  email: "inspecao@example.invalid",
  app_metadata: { provider: "email" },
  user_metadata: {},
  aud: "authenticated",
  created_at: now.toISOString(),
};
const role = { role: "engenharia" };
const session = {
  access_token: token,
  refresh_token: "fixture-refresh",
  expires_at: expires,
  expires_in: 3600,
  token_type: "bearer",
  user,
};
const pdf = await PDFDocument.create();
pdf.addPage().drawText("Arquivo de teste local - pagina 1", { x: 70, y: 760, size: 17 });
pdf.addPage().drawText("Evidencia de teste local - pagina 2", { x: 70, y: 760, size: 17 });
const bytes = Buffer.from(await pdf.save());
const digest = createHash("sha256").update(bytes).digest("hex");
const trace = { ids: [], decisions: [], errors: [] };
const source = {
  id: docId,
  kind: "laudo",
  sourceName: "Fixture local - Laudo 11.pdf",
  revision: 4,
  state: "approved",
  available: true,
  pages: 2,
};
const candidate = {
  id: candidateId,
  kind: "laudo",
  sourceName: "Fixture local - candidata.pdf",
  revision: 5,
  state: "pending",
  available: true,
  pages: 2,
  fields: { due: { value: due, page: 2, label: "Próxima inspeção" } },
  restriction: { text: "Texto de candidato para teste local.", page: 2 },
  issues: ["A data exige conferência."],
};
const approval = { text: "Restrição documental de teste local.", page: 2, evidence: docId };
const fixture = {
  key: "lvhf-11",
  version: 1,
  availability: "review",
  description: fixtureDescription,
  seal: { value: fixtureSeal, page: 1, revision: 57, source: "layout" },
  fields: {
    installation: { value: "2024-05-18", page: 2, label: "Data de instalação", evidence: docId },
    rt: { value: "2024-05-19", page: 1, label: "Data RT", evidence: docId },
    inspection: {
      value: now.toISOString().slice(0, 10),
      page: 1,
      label: "Última inspeção",
      evidence: docId,
    },
    due: { value: due, page: 2, label: "Próxima inspeção", evidence: docId },
  },
  restriction: approval,
  documents: [source, candidate],
  issues: ["A data exige conferência."],
};
const layoutOnlyFixture = {
  key: "lvhf-56",
  version: 0,
  availability: "unconfirmed",
  description: "TELHADO AO LADO ARMAZÉM 01 - LVHF 15M - (01 UNIDADE)",
  seal: { value: "99990156", page: 1, revision: 57, source: "layout" },
  fields: {},
  restriction: null,
  documents: [],
  issues: [],
};
const body = async (req) =>
  JSON.parse(Buffer.concat(await Array.fromAsync(req)).toString() || "{}");
const server = http.createServer(async (req, res) => {
  const path = new URL(req.url, fakeApi).pathname;
  const json = (data, status = 200) => {
    res.writeHead(status, {
      "content-type": "application/json",
      "access-control-allow-origin": "*",
      "access-control-expose-headers": "content-range, content-type",
    });
    res.end(JSON.stringify(data));
  };
  if (req.method === "OPTIONS") {
    res.writeHead(204, {
      "access-control-allow-origin": "*",
      "access-control-allow-methods": "GET, POST, OPTIONS",
      "access-control-allow-headers": req.headers["access-control-request-headers"] || "*",
    });
    return res.end();
  }
  if (path.startsWith("/storage/v1/object/sign/")) {
    if (req.method === "POST")
      return json({
        signedURL: "/object/sign/nexus-cruz-alta-laudos/" + digest + ".pdf?token=isolated-fixture",
      });
    res.writeHead(200, {
      "content-type": "application/pdf",
      "content-length": bytes.length,
      "access-control-allow-origin": "*",
    });
    return res.end(bytes);
  }
  if (req.headers.authorization !== "Bearer " + token)
    return json({ code: "PGRST301", message: "Sessão de teste ausente." }, 401);
  if (path === "/auth/v1/user") return json(user);
  if (path === "/auth/v1/logout") {
    res.writeHead(204, { "access-control-allow-origin": "*" });
    return res.end();
  }
  if (path === "/rest/v1/memberships")
    return json([{ organization_id: orgId, organizations: { nome: "Ambiente de teste local" } }]);
  if (path === "/rest/v1/user_roles") return json([role]);
  if (path === "/rest/v1/user_capacidades") return json([]);
  if (!path.startsWith("/rest/v1/rpc/"))
    return json({ message: "Rota do fixture não registrada." }, 404);
  const rpc = path.split("/").at(-1);
  const params = await body(req);
  trace.ids.push(rpc);
  if (rpc === "ca_estado") return json({ provisionada: true, pode_provisionar: false });
  if (rpc === "ca_ficha")
    return json({
      id: docId,
      chave: params.p_chave,
      titulo: params.p_chave === "unidade" ? "Três Tentos — Cruz Alta/RS" : "LVHF 11 de teste",
      descricao: "Ficha para verificação local.",
      observacoes: "",
      version: 1,
      pode_editar: true,
      pode_publicar: true,
      cliente_id: clientId,
      unidade_id: unitId,
      atualizado_em: now.toISOString(),
      atualizado_por: userId,
      atributos: {},
      historico: [],
      documentos: [],
    });
  if (rpc === "ca_inspecao_rdo_summary") return json(rdoPhotoFolders);
  if (rpc === "ca_inspecao_summary")
    return json({
      items: [fixture, layoutOnlyFixture],
      canReview: true,
      lastCheckedAt: now.toISOString(),
      status: "idle",
      unmatched: [
        {
          id: orphanId,
          sourceName: "Fixture local - sem identificador.pdf",
          issues: ["O código LVHF não pôde ser identificado."],
        },
      ],
    });
  if (
    rpc === "ca_inspecao_preview" &&
    params.p_key === "lvhf-11" &&
    [docId, candidateId].includes(params.p_evidence)
  )
    return json({
      path: digest + ".pdf",
      sha256: digest,
      size: bytes.length,
      name: "Fixture local - Laudo 11.pdf",
    });
  if (rpc === "ca_inspecao_review") {
    trace.decisions.push(params);
    fixture.documents = [source];
    fixture.availability = "verified";
    fixture.version++;
    rdoPhotoFolders = [{ ...photoFolders[0], id: refreshedFolderId }, ...photoFolders.slice(1)];
    return json(fixture);
  }
  if (rpc === "ca_inspecao_sync_status")
    return json({ state: "verified", lastCheckedAt: now.toISOString() });
  if (rpc === "ca_inspecao_request_sync") return json({ state: "queued", queued: 3 });
  return json({ message: "RPC do fixture não registrada." }, 404);
});
await new Promise((resolve, reject) =>
  server.once("error", reject).listen(fixturePort, "127.0.0.1", resolve),
);
const vite = spawn(
  process.execPath,
  [
    "node_modules/vite/bin/vite.js",
    "dev",
    "--host",
    "127.0.0.1",
    "--port",
    String(appPort),
    "--strictPort",
  ],
  {
    cwd: workspace,
    env: {
      ...process.env,
      SUPABASE_URL: fakeApi,
      VITE_SUPABASE_URL: fakeApi,
      SUPABASE_PUBLISHABLE_KEY: "sb_publishable_test_fixture",
      VITE_SUPABASE_PUBLISHABLE_KEY: "sb_publishable_test_fixture",
      SUPABASE_SERVICE_ROLE_KEY: "sb_secret_test_fixture",
      CRUZ_ALTA_DRIVE_SERVICE_ACCOUNT_JSON: "fixture",
    },
  },
);
let log = "";
vite.stdout.on("data", (x) => (log += x.toString()));
vite.stderr.on("data", (x) => (log += x.toString()));
let browser;
try {
  for (let n = 0; n < 40; n++) {
    try {
      if ((await fetch(app)).ok) break;
    } catch {}
    await new Promise((r) => setTimeout(r, 300));
  }
  browser = await chromium.launch({
    executablePath:
      process.env.CRUZ_CHROME ||
      (process.platform === "darwin"
        ? "/Applications/Google Chrome.app/Contents/MacOS/Google Chrome"
        : undefined),
    args: process.platform === "darwin" ? ["--use-angle=metal"] : ["--enable-unsafe-swiftshader"],
  });
  const guest = await browser.newPage({
    viewport: { width: 1440, height: 900 },
    reducedMotion: "reduce",
  });
  await guest.goto(map);
  await guest.getByRole("button", { name: "Camadas", exact: true }).click();
  await guest.waitForSelector(".ca-options");
  assert.equal(await guest.getByRole("checkbox", { name: "Laudos e inspeções" }).count(), 0);
  await guest.goto(map + "?objeto=lvhf-11&aba=ficha&evidencia=" + docId + "&pagina=2");
  await guest.getByText("Acervo técnico privado", { exact: true }).waitFor();
  await guest
    .locator(".ca-drawer-head")
    .getByRole("heading", { name: publicTitle, exact: true })
    .waitFor();
  assert.equal(await guest.getByText("LAC " + fixtureSeal, { exact: false }).count(), 0);
  assert.equal(await guest.getByText(fixtureDescription, { exact: false }).count(), 0);
  assert.equal(await guest.locator(".ca-rdo-photos").count(), 0);
  assert.equal(await guest.locator(`a[href^="${driveFolders}"]`).count(), 0);
  assert.equal(trace.ids.length, 0);
  assert.equal(await guest.locator(".ca-reader-title").count(), 0);
  await guest.close();
  const context = await browser.newContext({
    viewport: { width: 1440, height: 900 },
    reducedMotion: "reduce",
  });
  await context.addInitScript(
    (session) => localStorage.setItem("sb-127-auth-token", JSON.stringify(session)),
    session,
  );
  const page = await context.newPage();
  page.on("pageerror", (e) => trace.errors.push(e.message));
  page.on("console", (msg) => {
    if (msg.type() === "error") trace.errors.push(msg.text());
  });
  page.setDefaultTimeout(30000);
  await page.goto(map + "?objeto=cobertura-11");
  await page.getByRole("button", { name: "Camadas", exact: true }).click();
  const layer = page.getByRole("checkbox", { name: "Laudos e inspeções", exact: true });
  await layer.waitFor();
  assert(await layer.isChecked());
  const badge = page
    .locator(".ca-inspection-pin")
    .filter({ has: page.getByText(privateTitle, { exact: true }) });
  await layer.uncheck();
  assert.equal(await badge.count(), 0);
  await layer.check();
  await page.getByRole("button", { name: "Fechar camadas", exact: true }).click();
  await badge.waitFor();
  await page
    .locator(".ca-inspection-marker[data-expanded=true] .ca-inspection-pin-copy")
    .getByText(privateTitle, { exact: true })
    .waitFor();
  await page.locator(".ca-inspections-related").getByText(privateTitle, { exact: true }).waitFor();
  const photos = page.getByRole("region", { name: "Fotos de montagem" });
  const launchedLink = photos.getByRole("link", { name: /Lançadas no RDO/ });
  await launchedLink.waitFor();
  await photos.getByRole("heading", { name: privateTitle, exact: true }).waitFor();
  assert.equal(await photos.getByRole("link").count(), 1);
  assert.equal(await launchedLink.getAttribute("href"), launchedPhoto);
  assert.equal(await launchedLink.getAttribute("target"), "_blank");
  assert.equal(await launchedLink.getAttribute("rel"), "noopener noreferrer");
  assert.equal(await photos.locator("img, video, iframe").count(), 0);
  await context.route("https://drive.google.com/**", (route) =>
    route.fulfill({ status: 200, body: "Pasta simulada no teste local." }),
  );
  const initialMap = page.url();
  const initialPose = await page.locator(".ca-stage canvas").getAttribute("data-camera");
  const [photoTab] = await Promise.all([context.waitForEvent("page"), launchedLink.click()]);
  await photoTab.waitForURL(launchedPhoto);
  assert.equal(await photoTab.evaluate(() => window.opener), null);
  assert.equal(page.url(), initialMap);
  assert.equal(await page.locator(".ca-stage canvas").getAttribute("data-camera"), initialPose);
  await photoTab.close();
  const search = page.getByRole("searchbox", { name: "Buscar setor, estrutura ou LVHF" });
  await search.fill("LAC " + fixtureSeal);
  await page.locator(".ca-browser").getByText(privateTitle, { exact: true }).waitFor();
  await page.keyboard.press("Escape");
  await page.getByRole("button", { name: "Limpar busca" }).click();
  await page.keyboard.press("Escape");
  await page.screenshot({ path: folder + "/01-marcador.png" });
  const camera = page.locator(".ca-stage canvas");
  const before = await camera.getAttribute("data-camera");
  await badge.click();
  await page.waitForURL(
    (url) =>
      url.searchParams.get("objeto") === "lvhf-11" && url.searchParams.get("aba") === "ficha",
  );
  await page.getByText("18/05/2024", { exact: true }).waitFor();
  assert.equal(await launchedLink.getAttribute("href"), launchedPhoto);
  await page
    .locator(".ca-drawer-head")
    .getByRole("heading", { name: privateTitle, exact: true })
    .waitFor();
  const seal = page.locator(".ca-inspection-seal");
  await seal.getByText("LAC " + fixtureSeal, { exact: true }).waitFor();
  await seal.getByText("LAYOUT GERAL · REV. 57 · P. 1", { exact: true }).waitFor();
  assert.equal(await seal.getByRole("button").count(), 0);
  assert.equal(await camera.getAttribute("data-camera"), before);
  await page.getByText("Vence em até 30 dias", { exact: true }).waitFor();
  await page.getByText("Restrição documental de teste local.", { exact: true }).waitFor();
  await page.screenshot({ path: folder + "/02-ficha.png" });
  const firstSource = page.locator(".ca-inspection-dates > div").first().getByRole("button");
  await firstSource.click();
  await page.waitForURL(
    (url) => url.searchParams.get("evidencia") === docId && url.searchParams.get("pagina") === "2",
  );
  await page.getByText("Página 2 de 2", { exact: true }).waitFor();
  await page.screenshot({ path: folder + "/03-leitor-pagina-2.png" });
  await page.keyboard.press("Escape");
  await page.waitForURL((url) => !url.searchParams.has("evidencia"));
  assert.equal(new URL(page.url()).searchParams.get("objeto"), "lvhf-11");
  assert.equal(await camera.getAttribute("data-camera"), before);
  await page.getByText("Validar a restrição e as datas", { exact: true }).click();
  const review = page.locator(".ca-inspection-review[open]");
  await review.getByLabel("Decisão sobre a restrição").selectOption("keep");
  await review.getByRole("checkbox", { name: /Próxima inspeção/ }).check();
  await review.getByRole("button", { name: "Confirmar validação" }).click();
  await review.waitFor({ state: "detached" });
  await photos.locator(`a[href="${refreshedPhoto}"]`).waitFor();
  assert.equal(await photos.locator(`a[href="${launchedPhoto}"]`).count(), 0);
  assert.deepEqual(trace.decisions[0]?.p_decisions, {
    evidence: candidateId,
    action: "approve",
    adopt: ["due"],
    restriction: { action: "keep" },
  });
  await page.goto(map + "?objeto=unidade&aba=ficha");
  await page.getByRole("button", { name: "Sincronizar agora" }).click();
  await page.getByText("Sincronização solicitada.", { exact: true }).waitFor();
  await page.getByText("Arquivos aguardando identificação (1)", { exact: true }).click();
  await page.getByText("Fixture local - sem identificador.pdf", { exact: true }).waitFor();
  assert.equal(await photos.count(), 0);
  await page.goto(map + "?objeto=cobertura-28.1");
  const decimalLink = photos.getByRole("link", { name: /Pasta de montagem/ });
  await decimalLink.waitFor();
  assert.equal(await photos.getByRole("link").count(), 1);
  assert.equal(await decimalLink.getAttribute("href"), decimalPhoto);
  await page.goto(map + "?objeto=lvhf-56&aba=ficha");
  await page
    .locator(".ca-drawer-head")
    .getByRole("heading", { name: layoutOnlyTitle, exact: true })
    .waitFor();
  await page.getByText("Nenhum laudo de inspeção vinculado.", { exact: true }).waitFor();
  assert.equal(await page.locator(".ca-inspection-dates").count(), 0);
  assert.equal(await photos.getByRole("link").count(), 1);
  assert.equal(
    await photos.getByRole("link", { name: /Pasta de montagem/ }).getAttribute("href"),
    montagePhoto,
  );
  await page.screenshot({ path: folder + "/05-identificacao-sem-laudo.png" });
  await page.goto(map + "?objeto=estrutura-armazem-01");
  const related = page
    .locator(".ca-inspections-related")
    .getByRole("button")
    .filter({ hasText: privateTitle });
  await related.waitFor();
  await photos.getByRole("heading", { name: privateTitle, exact: true }).waitFor();
  await photos.getByRole("heading", { name: layoutOnlyTitle, exact: true }).waitFor();
  assert.equal(await photos.getByRole("link").count(), 2);
  assert.equal(await photos.locator(`a[href="${decimalPhoto}"]`).count(), 0);
  const fromStructure = await camera.getAttribute("data-camera");
  await related.click();
  await page.waitForURL((url) => url.searchParams.get("objeto") === "lvhf-11");
  assert.equal(await camera.getAttribute("data-camera"), fromStructure);
  await page.locator(".ca-inspection-dates > div").first().getByRole("button").click();
  await page.getByText("Página 2 de 2", { exact: true }).waitFor();
  await page.evaluate(async () => {
    const modulePath = "/src/integrations/supabase/client.ts";
    const { supabase } = await import(modulePath);
    await supabase.auth.signOut();
  });
  await page.getByText("Acervo técnico privado", { exact: true }).waitFor();
  assert.equal(await page.locator(".ca-inspection-markers").count(), 0);
  assert.equal(await page.locator(".ca-reader-title").count(), 0);
  assert.equal(await page.getByText(fixtureSeal, { exact: false }).count(), 0);
  assert.equal(await page.locator(".ca-rdo-photos").count(), 0);
  assert.equal(await page.locator(`a[href^="${driveFolders}"]`).count(), 0);

  const mobileContext = await browser.newContext({
    viewport: { width: 390, height: 844 },
    deviceScaleFactor: 2,
    isMobile: true,
    hasTouch: true,
    reducedMotion: "reduce",
  });
  await mobileContext.addInitScript(
    (session) => localStorage.setItem("sb-127-auth-token", JSON.stringify(session)),
    session,
  );
  const mobile = await mobileContext.newPage();
  mobile.setDefaultTimeout(30000);
  await mobile.goto(map + "?objeto=lvhf-11&aba=ficha");
  await mobile.getByText("18/05/2024", { exact: true }).waitFor();
  await mobile
    .locator(".ca-drawer-head")
    .getByRole("heading", { name: privateTitle, exact: true })
    .waitFor();
  assert.equal(await mobile.evaluate(() => document.documentElement.scrollWidth), 390);
  const mobilePhoto = mobile
    .getByRole("region", { name: "Fotos de montagem" })
    .getByRole("link", { name: /Lançadas no RDO/ });
  assert.equal(await mobilePhoto.getAttribute("href"), refreshedPhoto);
  assert((await mobilePhoto.boundingBox())?.height >= 44);
  await mobile
    .locator(".ca-inspection-sheet")
    .evaluate((section) => section.scrollIntoView({ block: "start" }));
  await mobile.screenshot({ path: folder + "/04-movel.png" });
  await mobile.locator(".ca-inspection-dates > div").first().getByRole("button").tap();
  await mobile.getByText("Página 2 de 2", { exact: true }).waitFor();
  await mobile.getByRole("button", { name: "Fechar leitor" }).tap();
  await mobile.waitForURL((url) => !url.searchParams.has("evidencia"));
  trace.steps = [
    "guest-private",
    "layer-default-toggle",
    "exact-tag-layout-seal",
    "layout-without-inspection",
    "marker-camera",
    "dates-restriction",
    "reader-page-return",
    "review-command",
    "unmatched-unit",
    "authorized-sync-request",
    "related-structure",
    "rdo-private-folders-current-tag",
    "rdo-opens-new-tab-with-camera-preserved",
    "rdo-folder-refresh",
    "logout-clears-private-view",
    "mobile",
  ];
  assert.deepEqual(trace.errors, []);
  console.log("Evidências locais de teste em " + folder);
  console.log(JSON.stringify(trace, null, 2));
} finally {
  await browser?.close();
  vite.kill();
  server.closeAllConnections();
  await new Promise((resolve) => server.close(resolve));
  await writeFile(folder + "/dev.log", log);
  await writeFile(folder + "/trace.json", JSON.stringify(trace, null, 2));
}
