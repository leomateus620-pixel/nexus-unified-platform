import { test } from "node:test";
import assert from "node:assert/strict";
import { generateKeyPairSync, verify } from "node:crypto";
import { createInspectionWorker } from "../../src/features/cruz-alta/inspection-sync/core.server";
import {
  DRIVE_FOLDER,
  DRIVE_PDF,
  MAX_DRIVE_PDF_BYTES,
} from "../../src/features/cruz-alta/inspection-sync/drive.server";
import { inspectionFolders } from "../../src/features/cruz-alta/inspection-sync/sources.server";
import { createDriveSetupHandler } from "../../src/features/cruz-alta/inspection-sync/setup.server";

const URL_SUPABASE = "https://yhtgijtllvgzoqtfcgal.supabase.co";
const TOKEN = "a".repeat(64);
const JOB = "c65889aa-030a-44f9-a9bd-be36627344b6";
const LEASE = "525dfaad-09bb-4846-8dc9-ba3452e194ca";
const PARENT = "parent-file-for-isolated-test";
const FILE = "file-for-isolated-test";
const NAME =
  "ADQ-3TENTOS-0326-01 - 57.1 - LAJE BARRACÃO - LVHF LAJE 20M - LAUDO TÉCNICO - REV 00.pdf";
const { privateKey, publicKey } = generateKeyPairSync("rsa", { modulusLength: 2048 });
const credentials = {
  clientEmail: "cruz-alta@test-case.iam.gserviceaccount.com",
  privateKey: privateKey.export({ type: "pkcs8", format: "pem" }).toString(),
};
const vaultCredential = {
  type: "service_account",
  client_email: credentials.clientEmail,
  private_key: credentials.privateKey,
  private_key_id: "a".repeat(40),
};

test("identifies server requests and redacts a backend permissions failure", async () => {
  const handler = createDriveSetupHandler({
    url: URL_SUPABASE,
    serviceKey: "sb_secret_isolated_fixture",
    fetch: async (_url, init) => {
      assert.equal(new Headers(init?.headers).get("user-agent"), "Nexus-Cruz-Alta-Worker/1.0");
      return Response.json({ code: "42501", details: "informe privado" }, { status: 401 });
    },
  });
  const result = await handler(
    new Request("https://nexusgestao.app/api/public/cruz-alta/inspection-drive-setup", {
      method: "POST",
      headers: { "Content-Type": "application/json", "X-Nexus-Drive-Setup-Token": TOKEN },
      body: JSON.stringify(vaultCredential),
    }),
  );
  assert.equal(result.status, 503);
  assert.deepEqual(await result.json(), { error: "backend_permissao_negada" });
});
const PDF = new TextEncoder().encode("%PDF-1.7\nDocumento de teste sintético\n%%EOF");
const HASH = Buffer.from(await crypto.subtle.digest("SHA-256", PDF)).toString("hex");
const SEAL = { value: "001234", page: 1, label: "Lacre" };
const SOURCE = {
  id: FILE,
  name: NAME,
  kind: "laudo",
  mimeType: DRIVE_PDF,
  parents: [PARENT],
  modifiedAt: "2026-11-19T13:42:01.000Z",
  version: "7400012012345678",
  size: PDF.length,
  sha256: HASH,
  resourceKey: null,
  code: "57.1",
  revision: 0,
};
const LAYOUT_SOURCE = {
  ...SOURCE,
  name: "00 - LAYOUT GERAL - LVHF 3 TENTOS CRUZ ALTA - A1.pdf",
  kind: "layout",
  parents: [inspectionFolders.layout],
  code: null,
  revision: null,
};
const LAYOUT = {
  revision: 56,
  rows: [{ code: "57.1", description: "LAJE BARRACÃO", seal: "000761" }],
};
const JOB_SCAN = {
  id: JOB,
  lease: LEASE,
  kind: "scan",
  scan: { kind: "laudo", folderId: PARENT, ancestorNames: ["57.1 - Laje Barracão"] },
};
const JOB_PROCESS = { id: JOB, lease: LEASE, kind: "process", source: SOURCE };

type Command = Record<string, unknown>;
type FakeOptions = {
  job?: Command | null;
  authorized?: boolean;
  list?: Command;
  relistVersion?: string;
  folderReadable?: boolean;
  uploadStatus?: number;
  parseThrows?: boolean;
  parseWrongIdentity?: boolean;
  parseSeal?: boolean;
  parseLayoutThrows?: boolean;
  driveSource?: { name: string; parents: string[]; sha256: string };
  useVault?: boolean;
  vaultUnavailable?: boolean;
  folderParents?: string[];
  fileParents?: string[];
  parentLookup?: Command;
  driveFixture?: (url: URL, headers: Headers) => Response;
};

function wire(o: FakeOptions = {}) {
  const calls: string[] = [];
  const finished: Command[] = [];
  const failures: Command[] = [];
  const parsed: unknown[] = [];
  let layoutReads = 0;
  const transport: typeof fetch = async (raw, init) => {
    const url = new URL(String(raw));
    const headers = new Headers(init?.headers);
    assert.equal(init?.redirect, "manual");
    calls.push(url.href);
    if (url.origin === URL_SUPABASE) {
      assert.equal(headers.get("apikey"), "sb_secret_local_fixture");
      assert.equal(headers.get("authorization"), null);
      const body = typeof init.body === "string" ? (JSON.parse(init.body) as Command) : null;
      if (url.pathname.endsWith("/ca_inspecao_sync_claim")) {
        assert.deepEqual(body, { p_token: TOKEN });
        return Response.json({ authorized: o.authorized ?? true, job: o.job ?? null });
      }
      if (url.pathname.endsWith("/ca_pdf_trabalho")) {
        assert.deepEqual(body, {});
        return Response.json(null);
      }
      if (url.pathname.endsWith("/ca_inspecao_drive_worker_secret")) {
        assert(o.useVault);
        assert.deepEqual(body, { p_id: JOB, p_lease: LEASE });
        return Response.json(o.vaultUnavailable ? null : vaultCredential);
      }
      if (url.pathname.endsWith("/ca_inspecao_sync_finish")) {
        assert.equal(body?.["p_id"], JOB);
        assert.equal(body?.["p_lease"], LEASE);
        finished.push(body["p_result"] as Command);
        return Response.json({ state: "completed" });
      }
      if (url.pathname.endsWith("/ca_inspecao_sync_fail")) {
        failures.push(body!);
        return Response.json({ state: body?.["p_retryable"] ? "retry" : "failed" });
      }
      assert.equal(url.pathname, `/storage/v1/object/nexus-cruz-alta-laudos/${HASH}.pdf`);
      assert.equal(init.method, "POST");
      assert.equal(headers.get("x-upsert"), "false");
      assert.deepEqual(init.body, PDF);
      return new Response(null, { status: o.uploadStatus ?? 201 });
    }
    assert.equal(headers.get("apikey"), null);
    if (url.href === "https://oauth2.googleapis.com/token") {
      assert.equal(init?.method, "POST");
      const data = init?.body as URLSearchParams;
      const [head, payload, signature] = data.get("assertion")!.split(".");
      assert(
        verify(
          "RSA-SHA256",
          Buffer.from(`${head}.${payload}`),
          publicKey,
          Buffer.from(signature!, "base64url"),
        ),
      );
      const jwt = JSON.parse(Buffer.from(payload!, "base64url").toString());
      assert.equal(jwt.iss, credentials.clientEmail);
      assert.equal(jwt.scope, "https://www.googleapis.com/auth/drive.readonly");
      assert.equal(jwt.aud, url.href);
      assert.equal(jwt.exp - jwt.iat, 300);
      return Response.json({ access_token: "test-google-token" });
    }
    assert.equal(url.origin, "https://www.googleapis.com");
    assert.equal(headers.get("authorization"), "Bearer test-google-token");
    if (o.driveFixture) return o.driveFixture(url, headers);
    if (url.pathname === "/drive/v3/files") {
      const query = url.searchParams.get("q") ?? "";
      return Response.json(query.includes(" and name = ") ? o.parentLookup : o.list);
    }
    if (url.pathname === `/drive/v3/files/${PARENT}`)
      return Response.json({
        id: PARENT,
        mimeType: DRIVE_FOLDER,
        name: JOB_SCAN.scan.ancestorNames[0],
        parents: o.folderParents,
        capabilities: { canListChildren: o.folderReadable !== false },
      });
    assert.equal(url.pathname, `/drive/v3/files/${FILE}`);
    if (url.searchParams.get("alt") === "media") return new Response(PDF);
    const driveSource = o.driveSource ?? SOURCE;
    return Response.json(
      driveRecord(driveSource.name, FILE, {
        parents: o.fileParents ?? driveSource.parents,
        sha256Checksum: driveSource.sha256,
        version: o.relistVersion ?? SOURCE.version,
      }),
    );
  };
  const worker = createInspectionWorker({
    url: URL_SUPABASE,
    serviceKey: "sb_secret_local_fixture",
    ...(o.useVault ? {} : { credentials }),
    fetch: transport,
    parse: async (bytes, metadata) => {
      assert.deepEqual(bytes, PDF);
      parsed.push(metadata);
      if (o.parseThrows) throw new Error("Parser diagnostic must stay private");
      return {
        fields: { due: { value: "2027-05-06", page: 2, label: "Próxima inspeção" } },
        issues: o.parseWrongIdentity ? ["O código da capa diverge"] : [],
        restriction: null,
        pages: 2,
        ...(o.parseWrongIdentity ? { identityMismatch: true as const } : {}),
        ...(o.parseSeal ? { seal: SEAL } : {}),
      };
    },
    parseLayout: async (bytes) => {
      layoutReads += 1;
      assert.deepEqual(bytes, PDF);
      if (o.parseLayoutThrows) throw new Error("Layout parser diagnostic must stay private");
      return LAYOUT;
    },
  });
  const run = async (token = TOKEN) =>
    worker(
      new Request(`${URL_SUPABASE}/test`, {
        method: "POST",
        headers: { "X-Nexus-Job-Token": token },
        body: JSON.stringify({ url: "https://outside.test/private", count: 1000 }),
      }),
    );
  return { calls, finished, failures, parsed, layoutReads: () => layoutReads, run };
}

function driveRecord(name: string, id: string, override: Command = {}) {
  return {
    id,
    name,
    mimeType: DRIVE_PDF,
    parents: [PARENT],
    modifiedTime: SOURCE.modifiedAt,
    version: SOURCE.version,
    size: String(PDF.length),
    sha256Checksum: HASH,
    ...override,
  };
}

const RDO_ROOT_ID = "fixture-rdo-root-id";
const RDO_PUBLISHED_ID = "fixture-rdo-published-id";
const RDO_JOB = {
  ...JOB_SCAN,
  scan: { kind: "rdo", folderId: RDO_ROOT_ID, rdoPublishedId: RDO_PUBLISHED_ID },
};
const RDO_PUBLISHED = "LANÇADOS RDO TESTE";
const RDO_RESOURCE_KEY = "0-fixture-resource-key";

function rdoFolder(name: string, id: string, parent: string = RDO_ROOT_ID) {
  return driveRecord(name, id, { mimeType: DRIVE_FOLDER, parents: [parent] });
}

type RdoPage = { files: Command[]; nextPageToken?: string; incompleteSearch?: boolean };

function wireRdo({
  root,
  launched = { "": { files: [] } },
  launchedParent = RDO_ROOT_ID,
}: {
  root: Record<string, RdoPage>;
  launched?: Record<string, RdoPage>;
  launchedParent?: string;
}) {
  return wire({
    job: RDO_JOB,
    driveFixture: (url, headers) => {
      assert.equal(url.searchParams.has("alt"), false);
      if (url.pathname === `/drive/v3/files/${RDO_ROOT_ID}`) {
        return Response.json({
          ...rdoFolder("FOTOS MONTAGEM RDO", RDO_ROOT_ID),
          capabilities: { canListChildren: true },
        });
      }
      if (url.pathname === `/drive/v3/files/${RDO_PUBLISHED_ID}`) {
        assert.equal(
          headers.get("X-Goog-Drive-Resource-Keys"),
          `${RDO_PUBLISHED_ID}/${RDO_RESOURCE_KEY}`,
        );
        return Response.json({
          ...rdoFolder(RDO_PUBLISHED, RDO_PUBLISHED_ID, launchedParent),
          capabilities: { canListChildren: true },
        });
      }
      assert.equal(url.pathname, "/drive/v3/files", "no requests for numbered folders");
      const token = url.searchParams.get("pageToken") ?? "";
      const query = url.searchParams.get("q");
      const branch =
        query === `'${RDO_ROOT_ID}' in parents and trashed = false and mimeType = '${DRIVE_FOLDER}'`
          ? root
          : launched;
      if (branch === launched)
        assert.equal(
          query,
          `'${RDO_PUBLISHED_ID}' in parents and trashed = false and mimeType = '${DRIVE_FOLDER}'`,
        );
      const page = branch[token];
      assert(page, "requested an expected page cursor");
      // Simula a filtragem por MIME executada no Drive, inclusive para arquivos soltos.
      return Response.json({
        ...page,
        files: page.files.filter((item) => item["mimeType"] === DRIVE_FOLDER),
      });
    },
  });
}

const launchedFolder = {
  ...rdoFolder(RDO_PUBLISHED, RDO_PUBLISHED_ID),
  resourceKey: RDO_RESOURCE_KEY,
};

test("RDO publishes both terminal folder listings with exact LVHF IDs and never enters a photo folder", async () => {
  const run = wireRdo({
    root: {
      "": {
        files: [
          rdoFolder("8 - TELHADO DE TESTE", "assembly-roof-08"),
          driveRecord("avulsa.jpg", "loose-photo-file", { mimeType: "image/jpeg" }),
          rdoFolder("99 - CÓDIGO SEM CORRESPONDÊNCIA", "unknown-folder-id"),
          rdoFolder("9 - NOME COM CONTROLE\u0001", "invalid-name-folder"),
        ],
        nextPageToken: "root-last",
      },
      "root-last": {
        files: [
          rdoFolder("11 - TELHADO DE TESTE", "assembly-roof-11"),
          driveRecord("controle.xlsx", "spreadsheet-file", {
            mimeType: "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
          }),
          launchedFolder,
        ],
      },
    },
    launched: {
      "": {
        files: [rdoFolder("11 - TELHADO DE TESTE", "launched-roof-11", RDO_PUBLISHED_ID)],
        nextPageToken: "launch-last",
      },
      "launch-last": {
        files: [
          {
            ...rdoFolder("28,01 − RECORTE DE TESTE", "launched-roof-28-1", RDO_PUBLISHED_ID),
            resourceKey: RDO_RESOURCE_KEY,
          },
          rdoFolder("29.2 - ITEM HISTÓRICO", "old-roof-folder", RDO_PUBLISHED_ID),
        ],
      },
    },
  });

  assert.equal((await run.run()).status, 200);
  assert.equal(run.finished.length, 1);
  assert.deepEqual(run.finished[0], {
    kind: "scan",
    rdoFolders: [
      { id: "assembly-roof-08", code: "08", name: "8 - TELHADO DE TESTE", category: "montagem" },
      { id: "assembly-roof-11", code: "11", name: "11 - TELHADO DE TESTE", category: "montagem" },
      { id: "launched-roof-11", code: "11", name: "11 - TELHADO DE TESTE", category: "lancada" },
      {
        id: "launched-roof-28-1",
        code: "28.1",
        name: "28,01 − RECORTE DE TESTE",
        category: "lancada",
        resourceKey: RDO_RESOURCE_KEY,
      },
    ],
  });
  const listings = run.calls.filter((url) => url.includes("/drive/v3/files?"));
  assert.equal(listings.length, 4);
  assert.equal(run.parsed.length, 0);
  assert.equal(
    run.calls.some((url) => url.includes("/storage/")),
    false,
  );
});

test("RDO leaves the prior snapshot in place on an incomplete page, cursor race or changed membership", async () => {
  const folder = rdoFolder("8 - TELHADO DE TESTE", "assembly-roof-08");
  const cases: (Parameters<typeof wireRdo>[0] & { error: string })[] = [
    {
      root: { "": { files: [rdoFolder(RDO_PUBLISHED, "different-launched-folder")] } },
      error: "pasta_rdo_lancados_ausente",
    },
    {
      root: { "": { files: [folder, launchedFolder] } },
      launched: {
        "": { files: [], nextPageToken: "launch-last" },
        "launch-last": { files: [], incompleteSearch: true },
      },
      error: "listagem_drive_incompleta",
    },
    {
      root: {
        "": { files: [folder], nextPageToken: "root-last" },
        "root-last": { files: [folder, launchedFolder] },
      },
      error: "listagem_rdo_inconsistente",
    },
    {
      root: { "": { files: [launchedFolder] } },
      launchedParent: PARENT,
      error: "pasta_drive_divergente",
    },
  ];
  for (const { error, ...options } of cases) {
    const run = wireRdo(options);
    assert.equal((await run.run()).status, 200);
    assert.equal(run.finished.length, 0);
    assert.equal(run.failures[0]?.["p_error"], error);
  }
});

test("only a complete RDO root-and-child claim can start a photo-folder scan", async () => {
  for (const scan of [
    { kind: "rdo", folderId: RDO_ROOT_ID },
    { ...RDO_JOB.scan, rdoPublishedId: RDO_ROOT_ID },
    { ...RDO_JOB.scan, ancestorNames: ["fora-do-escopo"] },
    { ...RDO_JOB.scan, pageToken: "mid-scan" },
    { ...RDO_JOB.scan, parentFolderId: PARENT },
  ]) {
    const run = wire({ job: { ...RDO_JOB, scan } });
    assert.equal((await run.run()).status, 200);
    assert.equal(run.finished.length, 0);
    assert.equal(run.failures[0]?.["p_error"], "pasta_da_varredura_invalida");
    assert(run.calls.every((url) => url.startsWith(URL_SUPABASE)));
  }
});

test("only a valid queue claim allows a Drive call, and a caller cannot supply scope", async () => {
  const run = wire({ authorized: false });
  assert.equal((await run.run("malformed")).status, 403);
  assert.equal(run.calls.length, 0);
  assert.equal((await run.run()).status, 403);
  assert.equal(run.calls.length, 1);

  const outside = wire({ job: { ...JOB_SCAN, scan: { kind: "laudo", folderId: PARENT } } });
  assert.equal((await outside.run()).status, 200);
  assert.equal(outside.failures[0]?.["p_error"], "pasta_da_varredura_invalida");
  assert(outside.calls.every((url) => url.startsWith(URL_SUPABASE)));
});

test("the worker resolves a Vault secret only for a strictly validated active lease", async () => {
  const idle = wire({ job: null, useVault: true });
  assert.equal((await idle.run()).status, 200);
  assert.deepEqual(
    idle.calls.map((url) => url.split("/").at(-1)),
    ["ca_inspecao_sync_claim", "ca_pdf_trabalho"],
  );
  const invalid = wire({ job: { ...JOB_PROCESS, lease: "malformed" }, useVault: true });
  await invalid.run();
  assert(invalid.calls.every((url) => url.endsWith("ca_inspecao_sync_claim")));
  const denied = wire({ job: JOB_PROCESS, useVault: true, authorized: false });
  assert.equal((await denied.run()).status, 403);
  assert.equal(denied.calls.length, 1);

  const leased = wire({ job: JOB_PROCESS, useVault: true });
  assert.equal((await leased.run()).status, 200);
  assert(leased.calls[0]?.endsWith("ca_inspecao_sync_claim"));
  assert(leased.calls[1]?.endsWith("ca_inspecao_drive_worker_secret"));
  assert.equal(leased.calls[2], "https://oauth2.googleapis.com/token");

  const absent = wire({ job: JOB_PROCESS, useVault: true, vaultUnavailable: true });
  assert.equal((await absent.run()).status, 200);
  assert.equal(absent.failures[0]?.["p_error"], "integracao_nao_configurada");
  assert(absent.calls.every((url) => url.startsWith(URL_SUPABASE)));
});

test("the setup endpoint requires HTTPS, a header ticket and a bounded valid Google credential", async () => {
  let attempts = 0;
  const setup = createDriveSetupHandler({
    url: URL_SUPABASE,
    serviceKey: "sb_secret_local_fixture",
    fetch: async () => {
      attempts += 1;
      throw new Error("invalid setup requests never reach the RPC");
    },
  });
  const defaultHeaders = { "Content-Type": "application/json", "X-Nexus-Drive-Setup-Token": TOKEN };
  const path = "/api/public/cruz-alta/inspection-drive-setup";
  const url = `https://nexus.fixture.test${path}`;
  const body = JSON.stringify(vaultCredential);
  const checks: [Request, number][] = [
    [new Request(url), 405],
    [
      new Request(`http://nexus.fixture.test${path}`, {
        method: "POST",
        headers: defaultHeaders,
        body,
      }),
      403,
    ],
    [
      new Request(`${url}?token=${TOKEN}`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body,
      }),
      403,
    ],
    [
      new Request(url, {
        method: "POST",
        headers: { ...defaultHeaders, "Content-Type": "text/plain" },
        body,
      }),
      415,
    ],
    [new Request(url, { method: "POST", headers: defaultHeaders, body: " ".repeat(16_385) }), 413],
    [
      new Request(url, {
        method: "POST",
        headers: defaultHeaders,
        body: JSON.stringify({ ...vaultCredential, private_key: "fixture-invalid" }),
      }),
      400,
    ],
  ];
  for (const [request, status] of checks) {
    const response = await setup(request);
    assert.equal(response.status, status);
    assert.equal(response.headers.get("cache-control"), "no-store");
  }
  assert.equal(attempts, 0);
});

test("setup forwards only normalized credential fields and lets the private RPC consume its ticket", async () => {
  let consumed = false;
  const setup = createDriveSetupHandler({
    url: URL_SUPABASE,
    serviceKey: "sb_secret_local_fixture",
    fetch: async (raw, init) => {
      assert.equal(String(raw), `${URL_SUPABASE}/rest/v1/rpc/ca_inspecao_drive_setup_concluir`);
      const headers = new Headers(init?.headers);
      assert.equal(headers.get("apikey"), "sb_secret_local_fixture");
      assert.equal(headers.get("X-Nexus-Drive-Setup-Token"), null);
      assert.equal(init?.redirect, "manual");
      assert.deepEqual(JSON.parse(String(init?.body)), {
        p_token: TOKEN,
        p_credential: vaultCredential,
      });
      const firstUse = !consumed;
      consumed = true;
      return Response.json(firstUse);
    },
  });
  const request = () =>
    new Request("https://nexus.fixture.test/api/public/cruz-alta/inspection-drive-setup", {
      method: "POST",
      headers: {
        "Content-Type": "application/json; charset=UTF-8",
        "X-Nexus-Drive-Setup-Token": TOKEN,
      },
      body: JSON.stringify({
        ...vaultCredential,
        token_uri: "https://untrusted.fixture.test",
        tag: "omit",
      }),
    });
  const accepted = await setup(request());
  assert.equal(accepted.status, 204);
  assert.equal(await accepted.text(), "");
  const replay = await setup(request());
  assert.equal(replay.status, 403);
  assert.deepEqual(await replay.json(), { error: "acesso_negado" });
});

test("a Drive page keeps decimal codes exact and presents a conflicting filename for review", async () => {
  const run = wire({
    job: { ...JOB_SCAN, scan: { ...JOB_SCAN.scan, pageToken: "page-before" } },
    list: {
      files: [
        driveRecord(NAME, `${FILE}-matched`),
        driveRecord(NAME.replace("57.1", "57"), `${FILE}-different`),
        driveRecord(NAME.replace("LAUDO TÉCNICO", "PLACA DE IDENTIFICAÇÃO"), `${FILE}-plaque`),
        driveRecord(NAME.replace("LAUDO TÉCNICO", "PRANCHA"), `${FILE}-ignored`),
      ],
      nextPageToken: "page-after",
    },
  });
  assert.equal((await run.run()).status, 200);
  const scan = run.finished[0]!;
  assert.equal(scan["nextPageToken"], "page-after");
  const children = scan["children"] as Command[];
  assert.deepEqual(
    children.map(({ code, kind, revision }) => ({ code, kind, revision })),
    [
      { code: "57.1", kind: "laudo", revision: 0 },
      { code: null, kind: "laudo", revision: 0 },
      { code: "57.1", kind: "placa", revision: 0 },
    ],
  );
  const list = new URL(run.calls.find((url) => url.includes("/drive/v3/files?"))!);
  assert.equal(list.searchParams.get("pageToken"), "page-before");
  assert(list.searchParams.get("q")?.includes(`'${PARENT}' in parents`));
});

test("incomplete list pages preserve the prior acervo and request retry", async () => {
  const run = wire({ job: JOB_SCAN, list: { files: [], incompleteSearch: true } });
  assert.equal((await run.run()).status, 200);
  assert.equal(run.finished.length, 0);
  assert.equal(run.failures[0]?.["p_error"], "listagem_drive_incompleta");
  assert.equal(run.failures[0]?.["p_retryable"], true);
});

test("a folder missing list permissions is never interpreted as an empty complete inventory", async () => {
  const run = wire({ job: JOB_SCAN, folderReadable: false, list: { files: [] } });
  assert.equal((await run.run()).status, 200);
  assert.equal(run.finished.length, 0);
  assert.equal(run.failures[0]?.["p_error"], "pasta_drive_sem_acesso");
  assert.equal(
    run.calls.some((url) => url.includes("/drive/v3/files?")),
    false,
  );
});

test("Drive metadata with omitted parents is accepted only if a scoped listing confirms the exact item", async () => {
  const folder = wire({
    job: { ...JOB_SCAN, scan: { ...JOB_SCAN.scan, parentFolderId: inspectionFolders.laudo } },
    parentLookup: {
      files: [{ id: PARENT, name: JOB_SCAN.scan.ancestorNames[0], mimeType: DRIVE_FOLDER }],
    },
    list: { files: [] },
  });
  assert.equal((await folder.run()).status, 200);
  assert.equal(folder.finished[0]?.["kind"], "scan");
  const folderQueries = folder.calls
    .filter((url) => url.includes("/drive/v3/files?"))
    .map((url) => new URL(url).searchParams.get("q"));
  assert.equal(
    folderQueries[0],
    `'${inspectionFolders.laudo}' in parents and trashed = false and name = '${JOB_SCAN.scan.ancestorNames[0]}' and mimeType = '${DRIVE_FOLDER}'`,
  );

  const file = wire({
    job: JOB_PROCESS,
    fileParents: [],
    parentLookup: { files: [{ id: FILE, name: NAME, mimeType: DRIVE_PDF, parents: [PARENT] }] },
  });
  assert.equal((await file.run()).status, 200);
  assert.equal(file.finished[0]?.["sha256"], HASH);
  const fileQuery = new URL(file.calls.find((url) => url.includes("/drive/v3/files?"))!);
  assert.equal(
    fileQuery.searchParams.get("q"),
    `'${PARENT}' in parents and trashed = false and name = '${NAME}' and mimeType = '${DRIVE_PDF}'`,
  );
});

test("contradictory direct parents or same-name siblings cannot authorize a binary read", async () => {
  for (const fileParents of [["wrong-explicit-parent-id"], []]) {
    const run = wire({
      job: JOB_PROCESS,
      fileParents,
      parentLookup: { files: [{ id: `${FILE}-same-name`, name: NAME, mimeType: DRIVE_PDF }] },
    });
    assert.equal((await run.run()).status, 200);
    assert.equal(run.failures[0]?.["p_error"], "pasta_drive_divergente");
    assert.equal(
      run.calls.some((url) => url.includes("alt=media")),
      false,
    );
    assert.equal(
      run.calls.some((url) => url.includes("/drive/v3/files?")),
      fileParents.length === 0,
    );
  }
});

test("document bytes are verified and stored once by hash before publishing parser evidence", async () => {
  const run = wire({ job: JOB_PROCESS, uploadStatus: 409 });
  assert.equal((await run.run()).status, 200);
  assert.deepEqual(run.parsed, [{ kind: "laudo", code: "57.1", revision: 0 }]);
  assert.equal(run.finished[0]?.["sha256"], HASH);
  assert.deepEqual(run.finished[0]?.["itemKeys"], ["lvhf-57.1"]);
  assert.equal(run.finished[0]?.["status"], "verified");
  assert(
    run.calls.findIndex((url) => url.includes("/storage/")) <
      run.calls.findIndex((url) => url.includes("_finish")),
  );
});

test("parser faults retain the original for review without presenting unverified dates", async () => {
  const run = wire({ job: JOB_PROCESS, parseThrows: true });
  assert.equal((await run.run()).status, 200);
  assert.equal(run.finished[0]?.["status"], "review");
  assert.equal(run.finished[0]?.["sha256"], HASH);
  assert.deepEqual(run.finished[0]?.["fields"], {});
  assert.deepEqual(run.finished[0]?.["issues"], ["extracao_documental_indisponivel"]);
});

test("an explicit cover identity conflict is kept out of the rooftop and line links", async () => {
  const run = wire({ job: JOB_PROCESS, parseWrongIdentity: true, parseSeal: true });
  assert.equal((await run.run()).status, 200);
  assert.equal(run.finished[0]?.["status"], "review");
  assert.equal(run.finished[0]?.["sha256"], HASH);
  assert.deepEqual(run.finished[0]?.["fields"], {});
  assert.deepEqual(run.finished[0]?.["itemKeys"], []);
  assert.deepEqual(run.finished[0]?.["issues"], ["O código da capa diverge"]);
  assert.equal("identityMismatch" in run.finished[0]!, false);
  assert.equal("seal" in run.finished[0]!, false);
});

test("a seal travels with the source page and preserves the exact printed number", async () => {
  const run = wire({ job: JOB_PROCESS, parseSeal: true });
  assert.equal((await run.run()).status, 200);
  assert.equal(run.finished[0]?.["sha256"], HASH);
  assert.deepEqual(run.finished[0]?.["itemKeys"], ["lvhf-57.1"]);
  assert.deepEqual(run.finished[0]?.["seal"], SEAL);
});

test("layout rows retain their revision, digest and exact transcription from the pinned folder", async () => {
  const run = wire({
    job: { ...JOB_PROCESS, source: LAYOUT_SOURCE },
    driveSource: LAYOUT_SOURCE,
  });
  assert.equal((await run.run()).status, 200);
  assert.equal(run.layoutReads(), 1);
  assert.equal(run.parsed.length, 0);
  assert.deepEqual(run.finished[0]?.["layout"], { ...LAYOUT, sha256: HASH });
  assert.deepEqual(run.finished[0]?.["itemKeys"], ["unidade"]);
  assert.equal(run.finished[0]?.["sha256"], null);
  assert.equal(
    run.calls.some((url) => url.includes("/storage/")),
    false,
  );
});

test("an unparseable or contradictory layout leaves only an issue for the reviewer", async () => {
  const failed = wire({
    job: { ...JOB_PROCESS, source: LAYOUT_SOURCE },
    driveSource: LAYOUT_SOURCE,
    parseLayoutThrows: true,
  });
  assert.equal((await failed.run()).status, 200);
  assert.equal(failed.finished[0]?.["status"], "review");
  assert.deepEqual(failed.finished[0]?.["issues"], ["extracao_do_layout_indisponivel"]);
  assert.equal("layout" in failed.finished[0]!, false);

  const contradictory = wire({
    job: { ...JOB_PROCESS, source: { ...LAYOUT_SOURCE, revision: 54 } },
    driveSource: LAYOUT_SOURCE,
  });
  assert.equal((await contradictory.run()).status, 200);
  assert.deepEqual(contradictory.finished[0]?.["issues"], ["revisao_do_layout_divergente"]);
  assert.equal("layout" in contradictory.finished[0]!, false);
});

test("layout jobs outside the pinned folder or with a digest mismatch never reach the parser", async () => {
  const outside = wire({
    job: { ...JOB_PROCESS, source: { ...LAYOUT_SOURCE, parents: [PARENT] } },
  });
  assert.equal((await outside.run()).status, 200);
  assert.equal(outside.failures[0]?.["p_error"], "pasta_do_layout_invalida");
  assert(outside.calls.every((url) => url.startsWith(URL_SUPABASE)));

  const source = { ...LAYOUT_SOURCE, sha256: "b".repeat(64) };
  const corrupted = wire({ job: { ...JOB_PROCESS, source }, driveSource: source });
  assert.equal((await corrupted.run()).status, 200);
  assert.equal(corrupted.failures[0]?.["p_error"], "hash_drive_divergente");
  assert.equal(corrupted.layoutReads(), 0);
  assert.equal(corrupted.finished.length, 0);
});

test("a changed version, an oversized PDF, and a mounted-only reference avoid binary reads", async () => {
  const changed = wire({ job: JOB_PROCESS, relistVersion: "43" });
  assert.equal((await changed.run()).status, 200);
  assert.equal(changed.failures[0]?.["p_error"], "versao_drive_atualizada");
  assert.equal(
    changed.calls.some((url) => url.includes("alt=media")),
    false,
  );
  const large = wire({
    job: { ...JOB_PROCESS, source: { ...SOURCE, size: MAX_DRIVE_PDF_BYTES + 1 } },
  });
  assert.equal((await large.run()).status, 200);
  assert.equal(large.finished[0]?.["status"], "review");
  assert(large.calls.every((url) => url.startsWith(URL_SUPABASE)));
  const mounted = wire({
    job: {
      ...JOB_PROCESS,
      source: { ...SOURCE, kind: "montada", parents: [inspectionFolders.montada] },
    },
  });
  assert.equal((await mounted.run()).status, 200);
  assert.equal(mounted.finished[0]?.["status"], "ready");
  assert(mounted.calls.every((url) => url.startsWith(URL_SUPABASE)));
});
