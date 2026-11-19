import { test } from "node:test";
import assert from "node:assert/strict";
import { createHash, generateKeyPairSync } from "node:crypto";
import { fixtures } from "../fixtures/nr-image-worker";
import { DRIVE_FOLDER } from "../../src/features/cruz-alta/inspection-sync/drive.server";
import {
  assetPath,
  rdoBucket,
  rdoVariants,
} from "../../src/features/cruz-alta/inspection-sync/rdo-storage.server";
import { createRdoWorker } from "../../src/features/cruz-alta/inspection-sync/rdo-worker.server";

const origin = "https://yhtgijtllvgzoqtfcgal.supabase.co";
const drive = "https://www.googleapis.com";
const googleAuth = "https://oauth2.googleapis.com";
const token = "2".repeat(64);
const serviceKey = "sb_secret_local-rdo-worker-placeholder";
const job = {
  id: "489ab48e-23e5-42a9-be95-868fcf94fbc9",
  lease: "bbc940b1-68e4-4e21-8a18-458c20373af8",
  organization: "e579b078-4aff-41f6-b144-5af77c77e9cb",
  unit: "b18f1efb-beec-4e87-9840-f7ba8889c5df",
  folderId: "fixture-rdo-worker-folder",
  code: "11",
  resourceKey: null,
  foto: {
    id: "fixture-rdo-worker-image",
    folderId: "fixture-rdo-worker-folder",
    version: "2",
    path: [],
  },
  kind: "midia",
};
const archiveRoot = "fixture-rdo-worker-root";
const timestamp = "2026-11-19T15:00:00Z";
const { privateKey } = generateKeyPairSync("rsa", { modulusLength: 2048 });
const credential = JSON.stringify({
  type: "service_account",
  client_email: "rdo@test-worker.iam.gserviceaccount.com",
  private_key: privateKey.export({ type: "pkcs8", format: "pem" }),
});
const sha = (bytes: Uint8Array) => createHash("sha256").update(bytes).digest("hex");

function harness({
  kind = job.kind,
  stale = false,
  corrupt = false,
  allowed = true,
  duplicate = false,
}: {
  kind?: string;
  stale?: boolean;
  corrupt?: boolean;
  allowed?: boolean;
  duplicate?: boolean;
} = {}) {
  const calls: URL[] = [];
  const results: Record<string, unknown>[] = [];
  const originals = new Map<string, { body: Uint8Array<ArrayBuffer>; mime: string }>();
  const image = {
    id: job.foto.id,
    name: "Foto de teste.jpg",
    parents: [job.folderId],
    mimeType: "image/jpeg",
    modifiedTime: timestamp,
    version: stale ? "3" : "2",
    size: String(fixtures.small.length),
    sha256Checksum: sha(fixtures.small),
  };
  const fetcher: typeof fetch = async (raw, options) => {
    const url = new URL(String(raw));
    const headers = new Headers(options?.headers);
    calls.push(url);
    assert.equal(options?.redirect, "manual");
    if (url.origin === googleAuth)
      return Response.json({ access_token: "fixture-token", expires_in: 3600 });
    if (url.origin === drive) {
      assert.equal(headers.get("apikey"), null);
      assert.equal(headers.get("authorization"), "Bearer fixture-token");
      const suffix = url.pathname.split("/").at(-1);
      if (suffix === job.folderId)
        return Response.json({
          id: suffix,
          name: "11 - Pasta",
          parents: [archiveRoot],
          mimeType: DRIVE_FOLDER,
          capabilities: { canListChildren: true },
        });
      if (suffix === "files") return Response.json({ files: [image] });
      assert.equal(suffix, job.foto.id);
      return url.searchParams.get("alt") === "media"
        ? new Response(fixtures.small, { headers: { "content-type": "image/jpeg" } })
        : Response.json(image);
    }
    assert.equal(url.origin, origin);
    assert.equal(headers.get("apikey"), serviceKey);
    assert.equal(headers.get("authorization"), null);
    const suffix = url.pathname.split("/").at(-1);
    if (suffix === "ca_rdo_claim")
      return Response.json({ authorized: allowed, job: allowed ? { ...job, kind } : null });
    if (suffix === "ca_inspecao_rdo_origem")
      return Response.json({
        credential,
        folders: [{ id: job.folderId, parentId: archiveRoot, rootId: archiveRoot }],
      });
    if (suffix === "ca_rdo_finish" || suffix === "ca_rdo_fail") {
      results.push(JSON.parse(String(options?.body)) as Record<string, unknown>);
      return Response.json(suffix === "ca_rdo_finish" ? "concluido" : "falhou");
    }
    if (url.pathname.includes("/render/image/")) {
      assert.equal(headers.get("accept"), "image/webp");
      assert.equal(url.searchParams.get("resize"), "contain");
      return new Response(fixtures.smallPreview, { headers: { "content-type": "image/webp" } });
    }
    if (options?.method === "DELETE") {
      assert(url.pathname.endsWith(`/${rdoBucket}`));
      assert.deepEqual(JSON.parse(String(options.body)), {
        prefixes: rdoVariants.map((variant) =>
          assetPath(job.organization, job.unit, job.foto, variant),
        ),
      });
      return Response.json([]);
    }
    if (options?.method === "POST") {
      assert.equal(headers.get("x-upsert"), "false");
      assert.ok(options.body instanceof Uint8Array);
      originals.set(suffix!, {
        body: options.body as Uint8Array<ArrayBuffer>,
        mime: headers.get("content-type")!,
      });
      return Response.json({}, { status: duplicate ? 409 : 200 });
    }
    const stored = originals.get(suffix!)!;
    assert(url.pathname.includes(`/object/authenticated/${rdoBucket}/`));
    const body = stored.body.slice();
    if (corrupt && suffix === "original") body[body.length - 1]! ^= 1;
    return new Response(body, { headers: { "content-type": stored.mime } });
  };
  const handler = createRdoWorker({ url: origin, serviceKey, fetch: fetcher });
  const run = () =>
    handler(
      new Request(origin, {
        method: "POST",
        headers: { "X-Nexus-Job-Token": token },
        body: '{"folderId":"ignored"}',
      }),
    );
  return { calls, results, originals, run };
}

test("snapshot worker preserves identical private originals and verifies both stored WebP renditions", async () => {
  const state = harness();
  const response = await state.run();
  assert.equal(response.status, 200);
  assert.deepEqual(state.originals.get("original")?.body, fixtures.small);
  assert.deepEqual(state.originals.get("preview.webp")?.body, fixtures.smallPreview);
  assert.deepEqual(state.originals.get("thumbnail.webp")?.body, fixtures.smallPreview);
  const result = state.results[0]?.p_result as {
    variants: Record<string, { sha256: string }>;
    retry: boolean;
  };
  assert.equal(result.variants.original?.sha256, sha(fixtures.small));
  assert.equal(result.variants.preview?.sha256, sha(fixtures.smallPreview));
  assert.equal(result.retry, false);
});

test("denies invalid claims and stale source versions before preserving any bytes", async () => {
  const denied = harness({ allowed: false });
  assert.equal((await denied.run()).status, 403);
  assert.equal(denied.calls.length, 1);
  const stale = harness({ stale: true });
  await stale.run();
  assert.equal(stale.originals.size, 0);
  assert.equal(stale.results[0]?.p_error, "versao_foto_rdo_alterada");
});

test("does not publish a replica whose persisted bytes differ and routes cleanup to exactly that version", async () => {
  const corrupt = harness({ corrupt: true, duplicate: true });
  await corrupt.run();
  assert.equal(corrupt.results[0]?.p_error, "arquivo_rdo_persistido_divergente");
  assert.equal(corrupt.originals.has("thumbnail.webp"), false);
  const cleanup = harness({ kind: "limpeza" });
  await cleanup.run();
  assert(cleanup.calls.every((url) => url.origin === origin));
  assert.deepEqual(cleanup.results[0]?.p_result, {});
});

test("an upload conflict is resumable only after the exact prior bytes are read and verified", async () => {
  const state = harness({ duplicate: true });
  await state.run();
  const result = state.results[0]?.p_result as { variants: Record<string, { sha256: string }> };
  assert.equal(result.variants.original?.sha256, sha(fixtures.small));
  assert.equal(result.variants.thumbnail?.sha256, sha(fixtures.smallPreview));
  assert.equal(result.variants.preview?.sha256, sha(fixtures.smallPreview));
});
