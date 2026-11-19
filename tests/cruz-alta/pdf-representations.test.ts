import assert from "node:assert/strict";
import { createHash } from "node:crypto";
import { test } from "node:test";
import { PDFDocument } from "pdf-lib";
import type { PDFDataRangeTransport } from "pdfjs-dist";
import { CRUZ_PDF_CHUNK_BYTES } from "../../src/features/cruz-alta/pdf-representations";
import {
  prepareNextCruzAltaPdf,
  signCruzAltaPdfRepresentations,
} from "../../src/features/cruz-alta/pdf-representations.server";
import { createPdfRangeTransport } from "../../src/features/projetos-engenharia/leitor/pdf-range.client";

const digest = (bytes: Uint8Array) => createHash("sha256").update(bytes).digest("hex");
const org = "abab473b-8baa-4781-aed2-c1243338af65";
const lease = "1d806fb0-1e1a-401f-858b-b0c29ecf0d96";

test("prepara a página de evidência a partir de um original conferido", async () => {
  const pdf = await PDFDocument.create();
  pdf.addPage([380, 640]);
  pdf.addPage([720, 480]);
  const bytes = Uint8Array.from(await pdf.save());
  const source = {
    organization_id: org,
    bucket: "nexus-cruz-alta-laudos" as const,
    caminho: digest(bytes) + ".pdf",
    sha256: digest(bytes),
    tamanho: bytes.length,
    paginas: [1, 2],
    lease,
  };
  const storage = new Map<string, Uint8Array>();
  const readbacks: string[] = [];
  const uploaded: string[] = [];
  let page2Status = 201;
  let corruptReadback = false;
  let result: unknown;
  const service = {
    async rpc(name: string, args: Record<string, unknown>) {
      if (name === "ca_pdf_trabalho") return source;
      assert.equal(name, "ca_pdf_finalizar");
      assert.equal(args["p_lease"], lease);
      result = args["p_resultado"];
      return true;
    },
    async request(path: string, request: RequestInit) {
      if (request.method === "GET") {
        if (!path.includes("/nexus-cruz-alta-pdf-previas/")) return new Response(bytes);
        readbacks.push(path);
        const data = storage.get(path.replace("/authenticated/", "/"));
        if (!data) return new Response(null, { status: 404 });
        const persisted = Uint8Array.from(data);
        if (corruptReadback && path.includes("/p2-")) persisted[10] = 77;
        return new Response(persisted, { headers: { "content-type": "application/pdf" } });
      }
      assert.equal(request.method, "POST");
      assert.equal(new Headers(request.headers).get("x-upsert"), "false");
      uploaded.push(path);
      const status = path.includes("/p2-") ? page2Status : 201;
      if (status === 503) return new Response(null, { status });
      storage.set(path, request.body as Uint8Array);
      return new Response(null, { status });
    },
  };
  assert(await prepareNextCruzAltaPdf(service, new AbortController().signal));
  assert.equal(readbacks.length, 2);
  const signed: string[] = [];
  const admin = {
    async rpc(name: string, args: Record<string, unknown>) {
      assert.equal(name, "ca_pdf_representacao");
      assert.equal(args["p_sha256"], source.sha256);
      assert.equal(args["p_tamanho"], bytes.length);
      return { data: result, error: null };
    },
    storage: {
      from(bucket: string) {
        assert.equal(bucket, "nexus-cruz-alta-pdf-previas");
        return {
          async createSignedUrl(path: string) {
            signed.push(path);
            const data = storage.get(`/storage/v1/object/${bucket}/${path}`)!;
            const decoded = await PDFDocument.load(data);
            assert.equal(decoded.getPageCount(), 1);
            assert.deepEqual(decoded.getPage(0).getSize(), { width: 720, height: 480 });
            return { data: { signedUrl: "https://example.test/authorized" }, error: null };
          },
        };
      },
    },
  } as unknown as Parameters<typeof signCruzAltaPdfRepresentations>[0];
  const prepared = await signCruzAltaPdfRepresentations(admin, org, source.bucket, source, 2);
  assert.equal(prepared?.page?.pageCount, 2);
  assert.equal(prepared?.page?.page, 2);
  assert.match(signed[0]!, /\/v1\/p2-[a-f0-9]{64}\.pdf$/);
  assert.equal(
    prepared?.page?.sha256,
    digest(storage.get(`/storage/v1/object/nexus-cruz-alta-pdf-previas/${signed[0]}`)!),
  );
  assert.deepEqual(await signCruzAltaPdfRepresentations(admin, org, source.bucket, source, 3), {
    chunks: [],
  });
  assert.equal(signed.length, 1);

  const existing = (result as { pages: { page: number }[] }).pages.filter(({ page }) => page === 1);
  const retry = {
    ...service,
    async rpc(name: string, args: Record<string, unknown>) {
      if (name === "ca_pdf_trabalho") return { ...source, paginas_conferidas: existing };
      return service.rpc(name, args);
    },
  };
  page2Status = 503;
  uploaded.length = 0;
  assert(await prepareNextCruzAltaPdf(retry, new AbortController().signal));
  assert.deepEqual(result, { chunks: [digest(bytes)], pages: existing, retryPages: true });
  assert.equal(uploaded.length, 1);
  assert(uploaded[0]?.includes("/p2-"));

  page2Status = 409;
  corruptReadback = true;
  assert(await prepareNextCruzAltaPdf(retry, new AbortController().signal));
  assert.deepEqual(result, { chunks: [digest(bytes)], pages: existing, retryPages: true });
  corruptReadback = false;
  assert(await prepareNextCruzAltaPdf(retry, new AbortController().signal));
  assert.equal((result as { pages: unknown[] }).pages.length, 2);
  assert.equal((result as { retryPages: boolean }).retryPages, false);

  const altered = Uint8Array.from(bytes);
  altered[10] = 17;
  const tampered = {
    ...service,
    async request(_path: string, request: RequestInit) {
      assert.equal(request.method, "GET");
      return new Response(altered);
    },
  };
  await assert.rejects(
    prepareNextCruzAltaPdf(tampered, new AbortController().signal),
    /integridade/,
  );
  assert.equal(result, null);
});

test("só entrega ao PDF.js intervalos com SHA-256 correspondente", async (t) => {
  const prevWindow = globalThis.window;
  Object.defineProperty(globalThis, "window", {
    configurable: true,
    value: { location: { origin: "https://mapa.example" } },
  });
  t.after(() =>
    Object.defineProperty(globalThis, "window", {
      configurable: true,
      value: prevWindow,
    }),
  );
  const bytes = new Uint8Array(2 * CRUZ_PDF_CHUNK_BYTES + 9);
  bytes.set(new TextEncoder().encode("%PDF-1.7"));
  bytes.fill(9, CRUZ_PDF_CHUNK_BYTES);
  const chunks = Array.from({ length: 3 }, (_, index) =>
    digest(bytes.subarray(index * CRUZ_PDF_CHUNK_BYTES, (index + 1) * CRUZ_PDF_CHUNK_BYTES)),
  );
  const requests: string[] = [];
  let alter: number | undefined;
  let wrongRange = false;
  let failures = 0;
  t.mock.method(globalThis, "fetch", async (_url: string, request: RequestInit) => {
    const header = new Headers(request.headers).get("Range")!;
    requests.push(header);
    if (failures > 0) {
      failures--;
      return new Response(null, { status: 403 });
    }
    const [, start, end] = /bytes=(\d+)-(\d+)/.exec(header)!;
    const part = bytes.slice(+start!, +end! + 1);
    if (alter === +start!) part[8] = 37;
    return new Response(part, {
      status: 206,
      headers: {
        "Content-Type": "application/pdf",
        "Content-Range": `bytes ${start}-${end}/${bytes.length + Number(wrongRange)}`,
      },
    });
  });
  let data: ((part: Uint8Array) => void) | undefined;
  class Transport {
    constructor(
      readonly length: number,
      readonly initial: Uint8Array,
    ) {}
    onDataRange(_offset: number, part: Uint8Array) {
      data?.(part);
    }
  }
  const target = Transport as unknown as typeof PDFDataRangeTransport;
  const authorize = async () => ({
    url: "https://cdn.example/private",
    expiresAt: new Date(Date.now() + 60_000).toISOString(),
  });
  let rejectRange!: (error: unknown) => void;
  const failed = new Promise((resolve) => (rejectRange = resolve));
  const reader = await createPdfRangeTransport(
    target,
    bytes.length,
    authorize,
    new AbortController().signal,
    rejectRange,
    chunks,
  );
  const next = new Promise<Uint8Array>((resolve) => (data = resolve));
  reader.requestDataRange(CRUZ_PDF_CHUNK_BYTES + 5, CRUZ_PDF_CHUNK_BYTES + 23);
  assert.equal((await next).length, 18);
  assert.equal(requests[1], `bytes=${CRUZ_PDF_CHUNK_BYTES}-${2 * CRUZ_PDF_CHUNK_BYTES - 1}`);
  alter = CRUZ_PDF_CHUNK_BYTES;
  data = () => assert.fail("Trecho adulterado entregue ao PDF.js");
  reader.requestDataRange(CRUZ_PDF_CHUNK_BYTES, 2 * CRUZ_PDF_CHUNK_BYTES);
  assert.equal(((await failed) as Error).message, "integrity");
  alter = 0;
  await assert.rejects(
    createPdfRangeTransport(
      target,
      bytes.length,
      authorize,
      new AbortController().signal,
      assert.fail,
      chunks,
    ),
    /integrity/,
  );
  alter = undefined;
  wrongRange = true;
  const start = (authorizeRange = authorize) =>
    createPdfRangeTransport(
      target,
      bytes.length,
      authorizeRange,
      new AbortController().signal,
      assert.fail,
      chunks,
    );
  await assert.rejects(start(), /range/);
  wrongRange = false;
  failures = 1;
  let renewed = 0;
  const valid = await start(async () => {
    renewed++;
    return { ...(await authorize()), url: `https://cdn.example/private/${renewed}` };
  });
  assert.equal(renewed, 2);
  valid.abort();
  failures = 2;
  await assert.rejects(start(), { name: "LeituraPeAccessError" });
});

test("PDF acima de 24 MiB mantém manifesto sem repetir extração de página", async () => {
  const doc = await PDFDocument.create();
  doc.addPage([380, 640]);
  doc.context.register(doc.context.stream(new Uint8Array(25 * 1024 * 1024)));
  const bytes = Uint8Array.from(await doc.save({ useObjectStreams: false }));
  const sha256 = digest(bytes);
  const source = {
    organization_id: org,
    bucket: "nexus-nr-acervo",
    caminho: `originals/${sha256}.pdf`,
    sha256,
    tamanho: bytes.length,
    paginas: [1],
    lease,
  };
  let originalReads = 0;
  let result: unknown;
  await prepareNextCruzAltaPdf(
    {
      async rpc(name: string, args: Record<string, unknown>) {
        if (name === "ca_pdf_trabalho") return source;
        assert.equal(name, "ca_pdf_finalizar");
        result = args["p_resultado"];
        return true;
      },
      async request(path, request) {
        assert.match(path, /\/object\/authenticated\/nexus-nr-acervo\//);
        assert.equal(request.method, "GET");
        originalReads++;
        return new Response(bytes);
      },
    },
    new AbortController().signal,
  );
  assert.equal(originalReads, 1);
  const chunks = [];
  for (let offset = 0; offset < bytes.length; offset += CRUZ_PDF_CHUNK_BYTES)
    chunks.push(digest(bytes.subarray(offset, offset + CRUZ_PDF_CHUNK_BYTES)));
  assert.deepEqual(result, { chunks, pages: [], retryPages: false });
});
