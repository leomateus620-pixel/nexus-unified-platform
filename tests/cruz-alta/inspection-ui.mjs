import assert from "node:assert/strict";
import http from "node:http";
import { createHash, createHmac, generateKeyPairSync } from "node:crypto";
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
const drawingId = "b99c41ea-db27-4a9a-aae5-1ccf1a6d16e2";
const drawingRevision = "b0faeab4-61e6-42db-a063-11ef9586b4c1";
const drawingFile = "e60ce8ec-0132-4b30-8dcd-d65ab41509a0";
const drawingTitle = "Prancha de montagem de teste";
const candidateId = "d4b08715-705d-4c21-a90b-e6c7a27f170a";
const orphanId = "a5259a69-5a18-4463-ae30-3bcbd42c4d74";
const galleryRoot = "fixture-rdo-root";
const galleryPublished = "fixture-rdo-published";
const photoFolders = [
  {
    id: "fixture-rdo-lancada-11",
    code: "11",
    name: "11 - Pasta de teste",
    category: "lancada",
    parentId: galleryPublished,
  },
  {
    id: "fixture-rdo-montagem-56",
    code: "56",
    name: "56 - Pasta de teste",
    category: "montagem",
    resourceKey: "fixture-resource-key",
    parentId: galleryRoot,
  },
  {
    id: "fixture-rdo-montagem-28_1",
    code: "28.1",
    name: "28.1 - Pasta de teste",
    category: "montagem",
    parentId: galleryRoot,
  },
];
const launchedPhotos = Array.from({ length: 7 }, (_, i) => `RDO de teste 11-${i + 1}.png`);
const montagePhoto = "Montagem de teste 56.png";
const decimalPhoto = "Montagem de teste 28.1.png";
const refreshedPhoto = "Nova foto de teste 11.png";
const addedPhoto = "Última foto de teste 11.png";
const photoBytes = Buffer.from(
  "iVBORw0KGgoAAAANSUhEUgAAAFAAAAA3CAIAAAAUgloYAAAAbElEQVR42u3YMQ0AIAwEwLrEAR5YsIADtOKgY5OSS3794bbPx7k7yVgzScduAAMDAwMDAwOXgf8j5V1gYGBgYGBg4DqwLQ0MDAwMDAwM7NOypYGBgYGBgYF9WrY0MDAwMDAwMLBPCxgYuF/3AX6ovwFy0dxOAAAAAElFTkSuQmCC",
  "base64",
);
const photoDigest = createHash("sha256").update(photoBytes).digest("hex");
const { privateKey: fixtureDriveKey } = generateKeyPairSync("rsa", {
  modulusLength: 2048,
  privateKeyEncoding: { format: "pem", type: "pkcs8" },
  publicKeyEncoding: { format: "pem", type: "spki" },
});
const fixtureDriveCredentials = JSON.stringify({
  type: "service_account",
  client_email: "gallery-fixture@example.iam.gserviceaccount.com",
  private_key: fixtureDriveKey,
});
let galleryRefreshed = false;
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
const trace = { ids: [], decisions: [], errors: [], rdoMedia: [], signed: [], timing: {} };
const sheetGate = Promise.withResolvers();
const listingGate = Promise.withResolvers();
const listingStarted = Promise.withResolvers();
let delayInitialPanel = false;
let delayedOriginal;
let denyDrawing = false;

async function withDeadline(promise, label) {
  let timeout;
  try {
    return await Promise.race([
      promise,
      new Promise((_, reject) => {
        timeout = setTimeout(() => reject(new Error(label)), 15_000);
      }),
    ]);
  } finally {
    clearTimeout(timeout);
  }
}

async function waitForPdfPage(page, number) {
  await page.locator(".nr-actions").getByText(`Página ${number} de 2`, { exact: true }).waitFor();
  await page.waitForFunction((number) => {
    const canvas = document.querySelector(
      `.ca-drawer canvas[aria-label^="Página ${number} do PDF"]`,
    );
    return canvas?.width > 300 && canvas?.height > 150;
  }, number);
}

const folderMime = "application/vnd.google-apps.folder";
const launchedSubfolder = {
  id: "fixture-rdo-subfolder-11",
  name: "Dia de teste",
  mimeType: folderMime,
  modifiedTime: now.toISOString(),
  version: "1",
  parents: [photoFolders[0].id],
  capabilities: { canListChildren: true },
};
const fixtureFolders = [
  ...photoFolders,
  { id: galleryPublished, name: "LANÇADAS NO RDO", parentId: galleryRoot },
  { id: galleryRoot, name: "RAIZ DE TESTE" },
].map(({ id, name, parentId, resourceKey }) => ({
  id,
  name,
  parents: parentId ? [parentId] : [],
  mimeType: folderMime,
  modifiedTime: now.toISOString(),
  version: "1",
  resourceKey,
  capabilities: { canListChildren: true },
}));

function drivePhotos() {
  const launched = launchedPhotos.map((name, i) => [
    `fixture-rdo-foto-11-${i + 1}`,
    galleryRefreshed && i === 0 ? refreshedPhoto : name,
    launchedSubfolder.id,
  ]);
  if (galleryRefreshed)
    launched.splice(-1, 1, ["fixture-rdo-foto-11-8", addedPhoto, launchedSubfolder.id]);
  const records = [
    ...launched,
    ["fixture-rdo-foto-56", montagePhoto, photoFolders[1].id],
    ["fixture-rdo-foto-28_1", decimalPhoto, photoFolders[2].id],
  ];
  return records.map(([id, name, parent]) => ({
    id,
    name,
    parents: [parent],
    mimeType: "image/png",
    modifiedTime: now.toISOString(),
    version: name === refreshedPhoto ? "2" : "1",
    size: String(photoBytes.length),
    sha256Checksum: photoDigest,
  }));
}
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
  const url = new URL(req.url, fakeApi);
  const { pathname: path } = url;
  const json = (data, status = 200) => {
    res.writeHead(status, {
      "content-type": "application/json",
      "access-control-allow-origin": "*",
      "access-control-expose-headers": "content-range, content-type",
    });
    res.end(JSON.stringify(data));
  };
  if (path === "/fixture-drive/token")
    return json({ access_token: "fixture-only", expires_in: 3600 });
  const driveFiles = "/fixture-drive/drive/v3/files";
  if (path.startsWith(driveFiles)) {
    const records = drivePhotos();
    if (path === driveFiles) {
      const parent = /^'([^']+)' in parents/.exec(url.searchParams.get("q") ?? "")?.[1];
      return json({
        files: [...records, ...fixtureFolders, launchedSubfolder].filter(
          (record) => record.parents[0] === parent,
        ),
      });
    }
    const id = path.split("/").at(-1);
    const folder = fixtureFolders.find((entry) => entry.id === id);
    if (folder) return json(folder);
    if (id === launchedSubfolder.id) return json(launchedSubfolder);
    const photo = records.find((record) => record.id === id);
    if (!photo) return json({}, 404);
    if (url.searchParams.get("alt") !== "media") return json(photo);
    trace.rdoMedia.push(id);
    if (delayedOriginal?.id === id) {
      const pending = delayedOriginal;
      delayedOriginal = undefined;
      pending.started.resolve();
      await pending.gate.promise;
    }
    res.writeHead(200, { "content-type": "image/png", "content-length": photoBytes.length });
    return res.end(photoBytes);
  }
  if (req.method === "OPTIONS") {
    res.writeHead(204, {
      "access-control-allow-origin": "*",
      "access-control-allow-methods": "GET, POST, OPTIONS",
      "access-control-allow-headers": req.headers["access-control-request-headers"] || "*",
    });
    return res.end();
  }
  if (path.startsWith("/storage/v1/object/sign/")) {
    if (req.method === "POST") {
      trace.signed.push(path);
      return json({ signedURL: path.replace("/storage/v1", "") + "?token=isolated-fixture" });
    }
    res.writeHead(200, {
      "content-type": "application/pdf",
      "content-length": bytes.length,
      "access-control-allow-origin": "*",
    });
    return res.end(bytes);
  }
  if (path === "/rest/v1/rpc/ca_inspecao_rdo_origem") {
    const params = await body(req);
    const sources = photoFolders.filter((folder) => params.p_pastas.includes(folder.id));
    return req.headers.apikey === "sb_secret_test_fixture"
      ? json({
          credential: fixtureDriveCredentials,
          folders: sources.map(({ id, parentId }) => ({ id, parentId, rootId: galleryRoot })),
        })
      : json({ code: "42501" }, 403);
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
  if (rpc === "ca_ficha") {
    if (delayInitialPanel && params.p_chave === "cobertura-11") await sheetGate.promise;
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
      documentos:
        params.p_chave === "cobertura-11"
          ? [
              {
                id: drawingId,
                titulo: drawingTitle,
                escopo: "individual",
                objeto: "cobertura-11",
                version: 1,
                descricao: "Prancha privada do fixture local.",
                pode_corrigir: true,
                vigente_id: drawingRevision,
                revisoes: [
                  {
                    id: drawingRevision,
                    rotulo: "03",
                    data: "2026-11-12",
                    arquivo_id: drawingFile,
                    mime: "application/pdf",
                  },
                ],
              },
            ]
          : [],
    });
  }
  if (
    rpc === "ca_previa" &&
    params.p_chave === "cobertura-11" &&
    params.p_doc === drawingId &&
    params.p_rev === drawingRevision
  ) {
    if (denyDrawing) return json({ code: "42501", message: "Acesso revogado." }, 403);
    return json({
      arquivo_id: drawingFile,
      caminho: digest + ".pdf",
      mime: "application/pdf",
      sha256: digest,
      tamanho: bytes.length,
    });
  }
  if (rpc === "ca_inspecao_rdo_summary") {
    if (delayInitialPanel && params.p_chave === "cobertura-11") {
      listingStarted.resolve();
      await listingGate.promise;
    }
    return json(
      photoFolders.filter(
        ({ code }) =>
          params.p_chave === `lvhf-${code}` ||
          params.p_chave === `cobertura-${code}` ||
          (params.p_chave === "estrutura-armazem-01" && ["11", "56"].includes(code)),
      ),
    );
  }
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
// Redirect only the app server's Google calls to loopback. Leave the real server functions,
// authorization middleware, hierarchy checks, and media/Blob response protocol enabled.
const drivePreloader = join(folder, "fixture-drive-preloader.mjs");
await writeFile(
  drivePreloader,
  `
const fetchNative = globalThis.fetch;
globalThis.fetch = (input, options) => {
  const address = input instanceof Request ? input.url : input;
  if (!URL.canParse(address)) return fetchNative(input, options);
  const url = new URL(address);
  if (url.origin === "https://oauth2.googleapis.com" || url.origin === "https://www.googleapis.com") {
    return fetchNative(${JSON.stringify(fakeApi)} + "/fixture-drive" + url.pathname + url.search, options);
  }
  return fetchNative(input, options);
};
`,
);
const vite = spawn(
  process.execPath,
  [
    "--import",
    drivePreloader,
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
  const mapCanvas = guest.locator("canvas[data-camera]");
  await mapCanvas.waitFor();
  const marker = guest.locator(".ca-labels button[data-label]:visible").first();
  await marker.waitFor();
  const markerId = await marker.getAttribute("data-label");
  assert.equal(
    await marker.getAttribute("title"),
    (await marker.locator(".ca-map-marker-title").textContent()).trim(),
  );
  assert.equal(await marker.locator("img").count(), 1);
  await guest.screenshot({ path: folder + "/08-legendas.png" });
  const markerControl = guest.locator(`.ca-labels button[data-label="${markerId}"]`);
  await markerControl.press("Enter");
  await guest.waitForURL((url) => url.searchParams.get("objeto") === markerId);
  const guestClose = guest.getByRole("button", { name: "Fechar ficha" });
  assert(await guestClose.evaluate((button) => document.activeElement === button));
  await guest.keyboard.press("Escape");
  await guest.waitForURL((url) => !url.searchParams.has("objeto"));
  await guest.waitForFunction(
    (id) =>
      document.activeElement?.getAttribute("data-label") === id ||
      document.activeElement?.matches(".ca-search input"),
    markerId,
  );
  const fullscreenButton = guest.getByRole("button", { name: "Tela cheia da unidade" });
  const initialCanvas = await mapCanvas.elementHandle();
  const beforeFullscreen = await mapCanvas.getAttribute("data-camera");
  await fullscreenButton.click();
  const exitUnit = guest.getByRole("button", { name: "Sair da tela cheia da unidade" });
  await exitUnit.waitFor();
  await guest.waitForFunction(() => document.fullscreenElement?.matches(".ca-workspace"));
  assert(await mapCanvas.evaluate((canvas, original) => canvas === original, initialCanvas));
  assert.equal(await mapCanvas.getAttribute("data-camera"), beforeFullscreen);
  await exitUnit.click();
  await fullscreenButton.waitFor();
  assert.equal(await guest.evaluate(() => document.fullscreenElement), null);
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
  assert.equal(trace.ids.length, 0);
  assert.equal(trace.rdoMedia.length, 0);
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
  await context.addInitScript(() => {
    const revokeObjectURL = URL.revokeObjectURL.bind(URL);
    window.fixtureRevokedUrls = new Set();
    URL.revokeObjectURL = (url) => {
      window.fixtureRevokedUrls.add(url);
      revokeObjectURL(url);
    };
  });
  const page = await context.newPage();
  await page.clock.install();
  page.on("pageerror", (e) => trace.errors.push(e.message));
  page.on("console", (msg) => {
    if (msg.type() === "error") trace.errors.push(msg.text());
  });
  page.setDefaultTimeout(30000);
  delayInitialPanel = true;
  const selectedAt = performance.now();
  await page.goto(map + "?objeto=cobertura-11");
  await withDeadline(listingStarted.promise, "A galeria esperou pela resposta da ficha.");
  trace.timing.listingStartedMs = Math.round(performance.now() - selectedAt);
  sheetGate.resolve();
  const drawing = page.getByRole("button", { name: /Revisão 03/ });
  await drawing.waitFor();
  trace.timing.documentReadyMs = Math.round(performance.now() - selectedAt);
  assert.equal(await page.getByRole("button", { name: /Abrir foto/ }).count(), 0);
  listingGate.resolve();
  delayInitialPanel = false;
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
  const launch = photos.getByRole("button", { name: `Abrir foto ${launchedPhotos[0]}` });
  await launch.waitFor();
  await photos.getByText(privateTitle, { exact: true }).waitFor();
  await photos.getByText(/Lançadas no RDO/).waitFor();
  const sheet = page.getByRole("complementary", { name: "Ficha do objeto" });
  await sheet
    .getByRole("group", { name: "Ir para uma seção" })
    .getByRole("button", { name: "Fotos de montagem" })
    .click();
  assert(
    await sheet
      .getByRole("group", { name: "Galeria de montagem" })
      .evaluate((section) => document.activeElement === section),
  );
  assert.equal(await photos.getByRole("button", { name: /Abrir foto/ }).count(), 6);
  assert.equal(await photos.getByRole("link").count(), 0);
  await launch.scrollIntoViewIfNeeded();
  await launch.locator("img[src^='blob:']").waitFor();
  trace.timing.firstThumbnailMs = Math.round(performance.now() - selectedAt);
  assert(!trace.rdoMedia.includes("fixture-rdo-foto-11-7"));
  const firstThumbnailRequests = trace.rdoMedia.filter(
    (id) => id === "fixture-rdo-foto-11-1",
  ).length;
  const previousPage = photos.getByRole("button", { name: "Página anterior de fotos" });
  const nextPage = photos.getByRole("button", { name: "Próxima página de fotos" });
  await nextPage.click();
  await photos.getByRole("button", { name: `Abrir foto ${launchedPhotos[6]}` }).waitFor();
  assert.equal(await photos.getByRole("button", { name: /Abrir foto/ }).count(), 1);
  await previousPage.click();
  await launch.locator("img[src^='blob:']").waitFor();
  assert.equal(
    trace.rdoMedia.filter((id) => id === "fixture-rdo-foto-11-1").length,
    firstThumbnailRequests,
  );
  const initialMap = page.url();
  const initialPose = await page.locator(".ca-stage canvas").getAttribute("data-camera");
  const heldPhoto = {
    id: "fixture-rdo-foto-11-1",
    started: Promise.withResolvers(),
    gate: Promise.withResolvers(),
  };
  delayedOriginal = heldPhoto;
  await launch.click();
  const viewer = photos.getByRole("group", { name: "Visualizador de fotos" });
  await withDeadline(heldPhoto.started.promise, "O original da foto não foi solicitado.");
  const preview = viewer.locator(".ca-rdo-placeholder");
  await preview.waitFor();
  await preview.evaluate((image) => image.decode());
  heldPhoto.gate.resolve();
  const displayed = viewer.getByRole("img", { name: launchedPhotos[0] });
  await displayed.waitFor();
  await displayed.evaluate((image) => image.decode());
  assert.equal(await preview.count(), 0);
  const firstPhotoUrl = await displayed.getAttribute("src");
  assert(firstPhotoUrl?.startsWith("blob:"));
  assert(await viewer.getByRole("button", { name: "Foto anterior" }).isDisabled());
  await page.screenshot({ path: folder + "/06-galeria-rdo.png" });
  await sheet.getByRole("button", { name: "Tela cheia da ficha" }).click();
  assert.equal(await displayed.getAttribute("src"), firstPhotoUrl);
  await page.screenshot({ path: folder + "/13-foto-tela-cheia.png" });
  await sheet.getByRole("button", { name: "Sair da tela cheia da ficha" }).click();
  await viewer.getByRole("button", { name: "Próxima foto" }).focus();
  await page.keyboard.press("ArrowRight");
  await viewer.getByRole("img", { name: launchedPhotos[1] }).waitFor();
  assert(await page.evaluate((url) => window.fixtureRevokedUrls.has(url), firstPhotoUrl));
  await page.keyboard.press("Escape");
  await viewer.waitFor({ state: "detached" });
  assert(await launch.evaluate((button) => document.activeElement === button));
  assert.equal(page.url(), initialMap);
  assert.equal(await page.locator(".ca-stage canvas").getAttribute("data-camera"), initialPose);
  assert.equal(context.pages().length, 1);

  const drawer = page.getByRole("complementary", { name: "Ficha do objeto" });
  const standardWidth = (await drawer.boundingBox()).width;
  const canvas = page.locator(".ca-stage canvas");
  const retainedCanvas = await canvas.elementHandle();
  await drawer.getByRole("button", { name: "Expandir ficha" }).click();
  await drawer.getByRole("button", { name: "Reduzir ficha" }).waitFor();
  assert((await drawer.boundingBox()).width > standardWidth + 170);
  assert(await canvas.isVisible());
  await drawer.locator(".ca-drawer-body").evaluate((element) => (element.scrollTop = 0));
  await page.screenshot({ path: folder + "/09-ficha-expandida.png" });
  await drawer.getByRole("button", { name: "Tela cheia da ficha" }).click();
  await drawer.getByRole("button", { name: "Sair da tela cheia da ficha" }).waitFor();
  assert.equal((await drawer.boundingBox()).width, 1440);
  assert.equal(await page.locator(".ca-viewport-wrap").getAttribute("inert"), "");
  assert(await canvas.evaluate((element, original) => element === original, retainedCanvas));
  assert.equal(await canvas.getAttribute("data-camera"), initialPose);
  assert.equal(page.url(), initialMap);
  await page.screenshot({ path: folder + "/10-ficha-tela-cheia.png" });
  const signedBeforeDrawing = trace.signed.length;
  const drawingStartedAt = performance.now();
  await drawing.click();
  await waitForPdfPage(page, 1);
  trace.timing.drawingFirstPageMs = Math.round(performance.now() - drawingStartedAt);
  assert.equal(trace.signed.length - signedBeforeDrawing, 1);
  assert.equal(await page.locator(".ca-drawer").evaluate((element) => element.offsetWidth), 1440);
  await page.screenshot({ path: folder + "/11-documento-tela-cheia.png" });
  denyDrawing = true;
  await page.clock.fastForward(31_000);
  await page.getByText(/O acesso ao original mudou/).waitFor();
  denyDrawing = false;
  await page.keyboard.press("Escape");
  await drawer.getByRole("button", { name: "Sair da tela cheia da ficha" }).waitFor();
  assert(await drawing.evaluate((element) => element === document.activeElement));
  await page.keyboard.press("Escape");
  await drawer.getByRole("button", { name: "Reduzir ficha" }).waitFor();
  await drawer.getByRole("button", { name: "Reduzir ficha" }).click();
  assert.equal((await drawer.boundingBox()).width, standardWidth);
  assert.equal(await canvas.getAttribute("data-camera"), initialPose);

  await drawer.getByRole("button", { name: "Ficha técnica", exact: true }).click();
  await drawer.getByRole("button", { name: "Editar", exact: true }).click();
  await drawer.getByRole("button", { name: "Editar ficha", exact: true }).click();
  const description = drawer.getByRole("textbox", { name: "Descrição", exact: true });
  await description.fill("Alteração local ainda em edição.");
  await drawer.getByRole("button", { name: "Expandir ficha" }).click();
  await drawer.getByRole("button", { name: "Tela cheia da ficha" }).click();
  assert.equal(await description.inputValue(), "Alteração local ainda em edição.");
  await drawer.getByRole("button", { name: "Sair da tela cheia da ficha" }).click();
  await drawer.getByRole("button", { name: "Reduzir ficha" }).click();
  await drawer.getByRole("button", { name: "Cancelar", exact: true }).click();
  await drawer.getByRole("button", { name: "Consulta", exact: true }).click();
  await drawer.getByRole("button", { name: "Documentos", exact: true }).click();

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
  await launch.waitFor();
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
  const signedBeforeEvidence = trace.signed.length;
  await firstSource.click();
  await page.waitForURL(
    (url) => url.searchParams.get("evidencia") === docId && url.searchParams.get("pagina") === "2",
  );
  await waitForPdfPage(page, 2);
  assert.equal(trace.signed.length - signedBeforeEvidence, 1);
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
  galleryRefreshed = true;
  await page.clock.fastForward(61_000);
  await photos.getByRole("button", { name: `Abrir foto ${refreshedPhoto}` }).waitFor();
  assert.equal(await launch.count(), 0);
  await nextPage.click();
  await photos.getByRole("button", { name: `Abrir foto ${addedPhoto}` }).waitFor();
  assert.equal(
    await photos.getByRole("button", { name: `Abrir foto ${launchedPhotos[6]}` }).count(),
    0,
  );
  await previousPage.click();
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
  const decimalCard = photos.getByRole("button", { name: `Abrir foto ${decimalPhoto}` });
  await decimalCard.waitFor();
  assert.equal(await photos.getByRole("button", { name: /Abrir foto/ }).count(), 1);
  await page.goto(map + "?objeto=lvhf-56&aba=ficha");
  await page
    .locator(".ca-drawer-head")
    .getByRole("heading", { name: layoutOnlyTitle, exact: true })
    .waitFor();
  await page.getByText("Nenhum laudo de inspeção vinculado.", { exact: true }).waitFor();
  assert.equal(await page.locator(".ca-inspection-dates").count(), 0);
  const montageCard = photos.getByRole("button", { name: `Abrir foto ${montagePhoto}` });
  await montageCard.waitFor();
  assert.equal(await photos.getByRole("button", { name: /Abrir foto/ }).count(), 1);
  await page.screenshot({ path: folder + "/05-identificacao-sem-laudo.png" });
  await page.goto(map + "?objeto=estrutura-armazem-01");
  const related = page
    .locator(".ca-inspections-related")
    .getByRole("button")
    .filter({ hasText: privateTitle });
  await related.waitFor();
  await photos.getByText(privateTitle, { exact: true }).waitFor();
  await nextPage.click();
  await photos.getByText(layoutOnlyTitle, { exact: true }).waitFor();
  await montageCard.waitFor();
  assert.equal(await decimalCard.count(), 0);
  const fromStructure = await camera.getAttribute("data-camera");
  await related.click();
  await page.waitForURL((url) => url.searchParams.get("objeto") === "lvhf-11");
  assert.equal(await camera.getAttribute("data-camera"), fromStructure);
  await page.locator(".ca-inspection-dates > div").first().getByRole("button").click();
  await waitForPdfPage(page, 2);
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
  await mobileContext.addInitScript(() => {
    Object.defineProperty(document, "fullscreenEnabled", { value: false });
  });
  const mobile = await mobileContext.newPage();
  mobile.setDefaultTimeout(30000);
  await mobile.goto(map + "?objeto=lvhf-11&aba=ficha");
  await mobile.getByText("18/05/2024", { exact: true }).waitFor();
  await mobile
    .locator(".ca-drawer-head")
    .getByRole("heading", { name: privateTitle, exact: true })
    .waitFor();
  assert.equal(await mobile.evaluate(() => document.documentElement.scrollWidth), 390);
  await mobile.getByRole("button", { name: "Tela cheia da unidade" }).tap();
  await mobile.locator(".ca-workspace.ca-window-fullscreen").waitFor();
  assert.equal(await mobile.evaluate(() => document.fullscreenElement), null);
  await mobile.getByRole("button", { name: "Sair da tela cheia da unidade" }).tap();
  assert.equal(await mobile.locator(".ca-workspace.ca-window-fullscreen").count(), 0);
  await mobile.getByRole("button", { name: "Recolher ao resumo" }).tap();
  assert(!(await mobile.locator(".ca-drawer-body").isVisible()));
  await mobile.getByRole("button", { name: "Abrir meia ficha" }).tap();
  const halfHeight = (await mobile.locator(".ca-drawer").boundingBox()).height;
  await mobile.getByRole("button", { name: "Expandir ficha" }).tap();
  assert((await mobile.locator(".ca-drawer").boundingBox()).height > halfHeight + 180);
  await mobile.getByRole("button", { name: "Tela cheia da ficha" }).tap();
  assert.equal((await mobile.locator(".ca-drawer").boundingBox()).height, 844);
  assert.equal(await mobile.evaluate(() => document.documentElement.scrollWidth), 390);
  await mobile.screenshot({ path: folder + "/12-ficha-tela-cheia-movel.png" });
  await mobile.getByRole("button", { name: "Sair da tela cheia da ficha" }).tap();
  await mobile.getByRole("button", { name: "Reduzir ficha" }).tap();
  const mobilePhoto = mobile.getByRole("button", { name: `Abrir foto ${refreshedPhoto}` });
  await mobilePhoto.waitFor();
  assert((await mobilePhoto.boundingBox())?.height >= 44);
  await mobilePhoto.tap();
  const mobileViewer = mobile.getByRole("group", { name: "Visualizador de fotos" });
  await mobileViewer.getByRole("img", { name: refreshedPhoto }).waitFor();
  await mobile.screenshot({ path: folder + "/07-galeria-rdo-movel.png" });
  await mobileViewer.getByRole("button", { name: "Fechar foto" }).tap();
  await mobile
    .locator(".ca-inspection-sheet")
    .evaluate((section) => section.scrollIntoView({ block: "start" }));
  await mobile.screenshot({ path: folder + "/04-movel.png" });
  await mobile.locator(".ca-inspection-dates > div").first().getByRole("button").tap();
  await waitForPdfPage(mobile, 2);
  await mobile.getByRole("button", { name: "Fechar leitor" }).tap();
  await mobile.waitForURL((url) => !url.searchParams.has("evidencia"));
  trace.steps = [
    "interactive-structure-labels-keyboard-focus",
    "native-and-fallback-workspace-fullscreen",
    "wide-and-full-panel-keeps-camera-url-and-form",
    "parallel-photo-listing-and-document-shelf",
    "single-initial-document-and-evidence-authorization",
    "document-permission-change-clears-reader",
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
    "rdo-private-photos-current-tag",
    "rdo-lazy-gallery-pagination",
    "rdo-reuses-preview-and-shows-it-while-original-loads",
    "rdo-photo-keyboard-viewer-with-camera-preserved",
    "rdo-revokes-photo-blob",
    "rdo-gallery-automatic-refresh-added-replaced-deleted",
    "logout-clears-private-view",
    "mobile",
  ];
  assert.deepEqual(trace.errors, []);
  console.log("Evidências locais de teste em " + folder);
  console.log(JSON.stringify(trace, null, 2));
} finally {
  sheetGate.resolve();
  listingGate.resolve();
  await browser?.close();
  vite.kill();
  server.closeAllConnections();
  await new Promise((resolve) => server.close(resolve));
  await writeFile(folder + "/dev.log", log);
  await writeFile(folder + "/trace.json", JSON.stringify(trace, null, 2));
}
