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
    assert.equal(init?.redirect, "error");
    calls.push(url.href);
    if (url.origin === URL_SUPABASE) {
      assert.equal(headers.get("apikey"), "sb_secret_local_fixture");
      assert.equal(headers.get("authorization"), null);
      const body = typeof init.body === "string" ? (JSON.parse(init.body) as Command) : null;
      if (url.pathname.endsWith("/ca_inspecao_sync_claim")) {
        assert.deepEqual(body, { p_token: TOKEN });
        return Response.json({ authorized: o.authorized ?? true, job: o.job ?? null });
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
    if (url.pathname === "/drive/v3/files") return Response.json(o.list);
    if (url.pathname === `/drive/v3/files/${PARENT}`)
      return Response.json({
        id: PARENT,
        mimeType: DRIVE_FOLDER,
        name: JOB_SCAN.scan.ancestorNames[0],
        capabilities: { canListChildren: o.folderReadable !== false },
      });
    assert.equal(url.pathname, `/drive/v3/files/${FILE}`);
    if (url.searchParams.get("alt") === "media") return new Response(PDF);
    const driveSource = o.driveSource ?? SOURCE;
    return Response.json(
      driveRecord(driveSource.name, FILE, {
        parents: driveSource.parents,
        sha256Checksum: driveSource.sha256,
        version: o.relistVersion ?? SOURCE.version,
      }),
    );
  };
  const worker = createInspectionWorker({
    url: URL_SUPABASE,
    serviceKey: "sb_secret_local_fixture",
    credentials,
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
