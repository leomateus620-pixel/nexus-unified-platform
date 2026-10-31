import assert from "node:assert/strict";
import {
  createImageWorker,
  MAX_PROCESS_BYTES,
  NEXUS_STORAGE_ORIGIN,
  PROCESSOR,
  sha256,
} from "./core.ts";
import { imageInfo } from "./image-info.ts";
import { fixtures } from "./fixtures.test.ts";

const ORG = "10000000-0000-4000-8000-000000000001";
const FILE = "20000000-0000-4000-8000-000000000001";
const TOKEN = "a".repeat(64); // Test-only value; never a project credential.
// All network is injected and Deno grants no network access in these tests.
const ORIGIN = NEXUS_STORAGE_ORIGIN;
Deno.test("misconfigured backend hosts fail before any credential can be transmitted", () => {
  for (const url of [
    "https://outside.test",
    "http://yhtgijtllvgzoqtfcgal.supabase.co",
    `${ORIGIN}/unexpected`,
  ]) {
    assert.throws(
      () =>
        createImageWorker({ url, serviceKey: "local-test-placeholder", inspectImage: imageInfo }),
      /Invalid private worker origin/,
    );
  }
});
type Binary = Uint8Array<ArrayBuffer>;
type Options = {
  original?: Binary;
  preview?: Binary;
  persisted?: Binary;
  sourceMime?: string;
  transformMime?: string;
  authorized?: boolean;
  jobs?: boolean;
  uploadStatus?: number;
  key?: string;
  job?: Record<string, unknown>;
  originalResponse?: () => Response;
  failCompletion?: boolean;
};
async function harness(options: Options = {}) {
  const original = options.original ?? fixtures.landscape;
  const preview = options.preview ?? fixtures.preview;
  const originalMime = options.sourceMime ?? "image/jpeg";
  const job = {
    id: "30000000-0000-4000-8000-000000000001",
    lease: "40000000-0000-4000-8000-000000000001",
    organization_id: ORG,
    arquivo_id: FILE,
    original_sha256: await sha256(original),
    original_caminho: `${ORG}/originais/preserved.jpg`,
    original_mime: originalMime,
    original_tamanho: original.length,
    processador: PROCESSOR,
    variante: "miniatura_384",
    caminho: "",
    ...options.job,
  };
  if (!options.job?.caminho)
    job.caminho = `${ORG}/representacoes/${FILE}/${job.original_sha256}/${PROCESSOR}/miniatura_384.webp`;
  const calls: { url: URL; init: RequestInit; body: Record<string, unknown> | null }[] = [];
  const completed: Record<string, unknown>[] = [];
  const key = options.key ?? "sb_secret_local-test-placeholder";
  const transport: typeof fetch = (input, init = {}) => {
    const url = new URL(String(input));
    const body = typeof init.body === "string" ? JSON.parse(init.body) : null;
    calls.push({ url, init, body });
    const reply = (value: unknown) => Promise.resolve(Response.json(value));
    if (url.pathname.endsWith("/nr_imagem_worker_validar"))
      return reply(options.authorized !== false);
    if (url.pathname.endsWith("/nr_imagem_trabalho_obter"))
      return reply(options.jobs === false ? [] : [job]);
    if (url.pathname.endsWith("/nr_imagem_trabalho_concluir")) {
      const result = body!.p_resultado as Record<string, unknown>;
      completed.push(result);
      if (options.failCompletion && result.estado === "disponivel")
        return Promise.resolve(new Response("unavailable", { status: 503 }));
      return reply(null);
    }
    if (url.pathname === "/functions/v1/nr-image-worker")
      return Promise.resolve(new Response(null, { status: 204 }));
    if (url.pathname.includes("/render/image/"))
      return Promise.resolve(
        new Response(preview, {
          headers: { "content-type": options.transformMime ?? "image/webp" },
        }),
      );
    if (url.pathname.includes("/object/authenticated/") && url.pathname.includes("/originais/"))
      return Promise.resolve(
        options.originalResponse?.() ??
          new Response(original, { headers: { "content-type": originalMime } }),
      );
    if (
      url.pathname.includes("/object/authenticated/") &&
      url.pathname.includes("/representacoes/")
    )
      return Promise.resolve(
        new Response(options.persisted ?? preview, { headers: { "content-type": "image/webp" } }),
      );
    if (url.pathname.includes("/object/") && init.method === "POST")
      return Promise.resolve(new Response("{}", { status: options.uploadStatus ?? 200 }));
    throw Error("Unexpected request in isolated worker test");
  };
  const handler = createImageWorker({
    url: ORIGIN,
    serviceKey: key,
    fetch: transport,
    inspectImage: imageInfo,
  });
  const run = async (
    request = new Request(ORIGIN, {
      method: "POST",
      headers: { "X-Nexus-Job-Token": TOKEN },
      body: JSON.stringify({
        organization_id: "ignored",
        path: "https://outside.test/private",
        p_limite: 999,
      }),
    }),
  ) => {
    const response = await handler(request);
    return { status: response.status, headers: response.headers, result: await response.json() };
  };
  return { run, calls, completed, job, original, preview, key };
}

Deno.test(
  "narrow authentication rejects unauthenticated calls before any queue or Storage access",
  async () => {
    const state = await harness();
    assert.equal((await state.run(new Request(ORIGIN, { method: "POST" }))).status, 403);
    assert.equal((await state.run(new Request(ORIGIN))).status, 405);
    assert.equal(state.calls.length, 0);
    const unknown = await harness({ authorized: false });
    const response = await unknown.run();
    assert.equal(response.status, 403);
    assert.equal(unknown.calls.length, 1);
    assert.equal(response.headers.get("access-control-allow-origin"), null);
    assert.deepEqual(response.result, { error: "acesso_negado" });
  },
);

Deno.test(
  "an empty queue terminates without recursive invocation or accepting caller identities",
  async () => {
    const state = await harness({ jobs: false });
    const response = await state.run();
    assert.equal(response.result.processed, 0);
    const claim = state.calls.find((entry) => entry.url.pathname.endsWith("trabalho_obter"));
    assert.deepEqual(claim!.body, { p_limite: 1, p_processador: PROCESSOR });
    assert.equal(state.calls.length, 2);
  },
);

Deno.test(
  "a representation becomes available only after immutable upload and complete private GET/hash",
  async () => {
    const state = await harness();
    const before = await sha256(state.original);
    const response = await state.run();
    assert.equal(response.result.ready, 1);
    assert.equal(response.result.failed, 0);
    assert.equal(await sha256(state.original), before);
    assert.equal(state.completed.length, 1);
    assert.equal(state.completed[0]!.sha256, await sha256(state.preview));
    assert.deepEqual([state.completed[0]!.largura, state.completed[0]!.altura], [384, 288]);
    const upload = state.calls.find(
      (entry) => entry.url.pathname.includes("/object/") && entry.init.method === "POST",
    )!;
    assert.equal(new Headers(upload.init.headers).get("x-upsert"), "false");
    assert.equal(
      state.calls.some(
        (entry) => entry.init.method === "POST" && entry.url.pathname.includes("/originais/"),
      ),
      false,
    );
    assert(state.calls.every((entry) => entry.url.origin === ORIGIN));
    const transform = state.calls.find((entry) => entry.url.pathname.includes("/render/image/"))!;
    assert.equal(transform.url.searchParams.get("resize"), "contain");
    assert.equal(new Headers(transform.init.headers).get("accept"), "image/webp");
    assert.equal(
      state.calls.some((entry) => entry.url.pathname === "/functions/v1/nr-image-worker"),
      false,
    );
    assert.equal(JSON.stringify(response.result).includes(TOKEN), false);
    assert.equal(JSON.stringify(response.result).includes(state.key), false);
    assert.equal(JSON.stringify(response.result).includes(ORG), false);
  },
);

Deno.test("modern secret keys use apikey only while legacy JWTs retain Authorization", async () => {
  for (const key of ["sb_secret_local-test-placeholder", "legacy-local-test-placeholder"]) {
    const state = await harness({ key, jobs: false });
    await state.run();
    const headers = new Headers(state.calls[0]!.init.headers);
    assert.equal(headers.get("apikey"), key);
    assert.equal(headers.get("authorization"), key.startsWith("sb_") ? null : `Bearer ${key}`);
  }
});

Deno.test("small photos are never enlarged", async () => {
  const state = await harness({ original: fixtures.small, preview: fixtures.smallPreview });
  const response = await state.run();
  assert.equal(response.result.ready, 1);
  const transform = state.calls.find((entry) => entry.url.pathname.includes("/render/image/"))!;
  assert.equal(transform.url.searchParams.get("width"), "100");
  assert.equal(transform.url.searchParams.get("height"), "100");
  assert.deepEqual([state.completed[0]!.largura, state.completed[0]!.altura], [100, 70]);
});

Deno.test(
  "EXIF rotation is applied only in the representation and incorrect orientation is rejected",
  async () => {
    assert.equal(imageInfo(fixtures.exif).orientation, 6);
    const state = await harness({ original: fixtures.exif, preview: fixtures.exifPreview });
    const originalHash = await sha256(state.original);
    assert.equal((await state.run()).result.ready, 1);
    assert.deepEqual([state.completed[0]!.largura, state.completed[0]!.altura], [20, 40]);
    assert.equal(await sha256(state.original), originalHash);
    const wrong = await harness({ original: fixtures.exif, preview: fixtures.wrongExif });
    assert.equal((await wrong.run()).result.ready, 0);
    assert.equal(wrong.completed[0]!.erro, "orientacao_da_representacao_divergente");
  },
);

Deno.test(
  "transparent PNG remains a real WebP representation rather than a JPEG fallback",
  async () => {
    const state = await harness({
      original: fixtures.transparent,
      preview: fixtures.transparentPreview,
      sourceMime: "image/png",
    });
    assert.equal((await state.run()).result.ready, 1);
    assert.equal(state.completed[0]!.mime, "image/webp");
    assert.equal(imageInfo(state.preview).mime, "image/webp");
    assert.equal(await sha256(state.original), await sha256(fixtures.transparent));
  },
);

Deno.test(
  "hash mismatch, HTML and MIME fallback never publish a recovered representation",
  async () => {
    for (const options of [
      { job: { original_sha256: "0".repeat(64) } },
      { original: new TextEncoder().encode("<html>not an image</html>") },
      { transformMime: "image/jpeg" },
    ]) {
      const state = await harness(options);
      assert.equal((await state.run()).result.ready, 0);
      assert(state.completed.every((result) => result.estado !== "disponivel"));
      assert.equal(
        state.calls.some(
          (entry) => entry.init.method === "POST" && entry.url.pathname.includes("/object/"),
        ),
        false,
      );
    }
  },
);

Deno.test("25MB automatic cap preserves the original without attempting processing", async () => {
  const state = await harness({ job: { original_tamanho: MAX_PROCESS_BYTES + 1 } });
  const response = await state.run();
  assert.equal(response.result.ready, 0);
  assert.equal(response.result.error, "original_preservado_limite_automatico_25mb");
  assert.equal(
    state.calls.some((entry) => entry.url.pathname.includes("/storage/")),
    false,
  );
});

Deno.test("pixel bombs are rejected before the native transform request", async () => {
  const bytes = new Uint8Array(fixtures.landscape);
  for (let i = 0; i < bytes.length - 10; i++) {
    if (bytes[i] === 255 && bytes[i + 1] === 192) {
      bytes[i + 5] = 4001 >> 8;
      bytes[i + 6] = 4001 & 255;
      bytes[i + 7] = 6000 >> 8;
      bytes[i + 8] = 6000 & 255;
      break;
    }
  }
  const state = await harness({ original: bytes });
  assert.equal((await state.run()).result.error, "original_preservado_limite_automatico_24mp");
  assert.equal(
    state.calls.some((entry) => entry.url.pathname.includes("/render/image/")),
    false,
  );
});

Deno.test("an oversized stream is cancelled even when Content-Length is absent", async () => {
  let cancelled = false;
  const state = await harness({
    originalResponse: () =>
      new Response(
        new ReadableStream({
          start(controller) {
            controller.enqueue(new Uint8Array(13_000_000));
            controller.enqueue(new Uint8Array(13_000_000));
          },
          cancel() {
            cancelled = true;
          },
        }),
        { headers: { "content-type": "image/jpeg" } },
      ),
  });
  assert.equal((await state.run()).result.error, "limite_de_bytes");
  assert.equal(cancelled, true);
});

Deno.test("a crop, corrupt RIFF or divergent private object cannot pass confirmation", async () => {
  const corrupt = new Uint8Array(fixtures.preview);
  corrupt[4] = (corrupt[4]! + 1) % 256;
  for (const options of [
    { preview: fixtures.wrongRatio },
    { preview: corrupt },
    { persisted: fixtures.smallPreview },
  ]) {
    const state = await harness(options);
    const response = await state.run();
    assert.equal(response.result.ready, 0);
    assert(state.completed.every((result) => result.estado !== "disponivel"));
  }
});

Deno.test(
  "an identical existing object is idempotent; a path or processor mismatch is rejected",
  async () => {
    const duplicate = await harness({ uploadStatus: 409 });
    assert.equal((await duplicate.run()).result.ready, 1);
    for (const job of [
      { caminho: `${ORG}/arbitrary.webp` },
      { processador: "nexus-pillow-v1" },
      { original_caminho: "another-organization/private.jpg" },
    ]) {
      const state = await harness({ job });
      assert.equal((await state.run()).result.ready, 0);
      assert.equal(
        state.calls.some((entry) => entry.url.pathname.includes("/storage/")),
        false,
      );
    }
  },
);

Deno.test("a failed database conclusion never reports the image as ready", async () => {
  const state = await harness({ failCompletion: true });
  const response = await state.run();
  assert.equal(response.result.ready, 0);
  assert.equal(response.result.failed, 1);
  assert.equal(
    state.calls.some((entry) => entry.url.pathname === "/functions/v1/nr-image-worker"),
    false,
  );
});
