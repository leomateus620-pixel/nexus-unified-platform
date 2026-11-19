import "@tanstack/react-start/server-only";
import type { SupabaseClient } from "@supabase/supabase-js";
import { z } from "zod";
import { confirmedNrOriginalBytes } from "../nr/original-bytes";
import { readLimited } from "./inspection-sync/drive.server";
import type { createInspectionService } from "./inspection-sync/service.server";
import {
  CRUZ_PDF_CHUNK_BYTES,
  CRUZ_PDF_MAX_BYTES,
  CRUZ_PDF_MAX_PAGE_BYTES,
  type CruzPdfRepresentations,
} from "./pdf-representations";

const BUCKET = "nexus-cruz-alta-pdf-previas";
const MAX_PDF_PARSE_BYTES = 24 * 1024 * 1024;
const hash = z.string().regex(/^[a-f0-9]{64}$/);
const bucket = z.enum(["nexus-nr-acervo", "nexus-cruz-alta-laudos"]);
const renderedPage = z.object({
  page: z.number().int().min(1).max(5000),
  pageCount: z.number().int().min(1).max(5000),
  size: z.number().int().min(5).max(CRUZ_PDF_MAX_PAGE_BYTES),
  sha256: hash,
});
const sourceSchema = z.object({
  organization_id: z.string().uuid(),
  bucket,
  caminho: z.string().regex(/^[a-zA-Z0-9_.-]+(?:\/[a-zA-Z0-9_.-]+)*$/),
  sha256: hash,
  tamanho: z.number().int().min(5).max(CRUZ_PDF_MAX_BYTES),
  paginas: z.array(z.number().int().min(1).max(5000)).max(16),
  paginas_conferidas: z.array(renderedPage).max(16).nullish(),
  lease: z.string().uuid(),
});
const representation = z.object({
  chunks: z.array(hash).max(CRUZ_PDF_MAX_BYTES / CRUZ_PDF_CHUNK_BYTES),
  pages: z.array(renderedPage).max(16),
});
type Source = z.infer<typeof sourceSchema>;
type StoredPage = z.infer<typeof renderedPage>;

async function digest(bytes: Uint8Array<ArrayBuffer>) {
  return Array.from(new Uint8Array(await crypto.subtle.digest("SHA-256", bytes)), (byte) =>
    byte.toString(16).padStart(2, "0"),
  ).join("");
}

async function originalAndChunks(
  response: Response,
  expected: Pick<Source, "sha256" | "tamanho">,
  signal: AbortSignal,
) {
  const bytes = await confirmedNrOriginalBytes(response, expected, signal);
  if (new TextDecoder("ascii").decode(bytes.subarray(0, 5)) !== "%PDF-")
    throw new Error("Os bytes do original divergem do acervo.");
  const chunks: string[] = [];
  for (let offset = 0; offset < bytes.length; offset += CRUZ_PDF_CHUNK_BYTES) {
    signal.throwIfAborted();
    chunks.push(await digest(bytes.subarray(offset, offset + CRUZ_PDF_CHUNK_BYTES)));
  }
  return { bytes, chunks };
}

function derivativePath(org: string, original: string, page: StoredPage) {
  return `${org}/${original}/v1/p${page.page}-${page.sha256}.pdf`;
}

async function keptPage(
  service: ReturnType<typeof createInspectionService>,
  source: Source,
  page: StoredPage,
  bytes: Uint8Array<ArrayBuffer>,
  signal: AbortSignal,
) {
  const path = derivativePath(source.organization_id, source.sha256, page);
  const response = await service.request(`/storage/v1/object/${BUCKET}/${path}`, {
    method: "POST",
    headers: { "content-type": "application/pdf", "x-upsert": "false" },
    body: bytes,
    signal,
  });
  let accepted = response.ok || response.status === 409;
  if (response.status === 400) {
    try {
      const raw = await readLimited(response, 2048, "resposta_da_previa_invalida");
      const parsed = z
        .object({ statusCode: z.coerce.string(), error: z.string() })
        .parse(JSON.parse(new TextDecoder().decode(raw)));
      accepted = parsed.statusCode === "409" && parsed.error === "Duplicate";
    } catch {
      accepted = false;
    }
  } else {
    await response.body?.cancel();
  }
  if (!accepted) throw new Error("Não foi possível armazenar a prévia de PDF.");
  const stored = await service.request(`/storage/v1/object/authenticated/${BUCKET}/${path}`, {
    method: "GET",
    cache: "no-store",
    signal,
  });
  if (
    !stored.ok ||
    stored.headers.get("content-type")?.split(";")[0]?.trim() !== "application/pdf"
  ) {
    await stored.body?.cancel();
    throw new Error("Prévia de PDF indisponível no acervo.");
  }
  await confirmedNrOriginalBytes(stored, { tamanho: page.size, sha256: page.sha256 }, signal);
}

async function buildPages(
  service: ReturnType<typeof createInspectionService>,
  source: Source,
  bytes: Uint8Array<ArrayBuffer>,
  signal: AbortSignal,
) {
  const pages = (source.paginas_conferidas ?? []).filter(({ page }) =>
    source.paginas.includes(page),
  );
  if (bytes.length > MAX_PDF_PARSE_BYTES) return { pages, retryPages: false };
  const library = await import("pdf-lib").catch(() => undefined);
  if (!library) return { pages, retryPages: true };
  const { PDFDocument } = library;
  const input = await PDFDocument.load(bytes, { updateMetadata: false })
    .then((document) => ({ document, pageCount: document.getPageCount() }))
    .catch(() => undefined);
  if (!input) return { pages, retryPages: false };
  const { document, pageCount } = input;
  if (pageCount < 1 || pageCount > 5000) return { pages, retryPages: false };
  let retryPages = false;
  for (const page of source.paginas) {
    if (page > pageCount) break;
    if (pages.some((item) => item.page === page)) continue;
    if (signal.aborted) return { pages, retryPages: true };
    let data: Uint8Array<ArrayBuffer>;
    try {
      const output = await PDFDocument.create({ updateMetadata: false });
      const [copied] = await output.copyPages(document, [page - 1]);
      output.addPage(copied!);
      data = Uint8Array.from(await output.save({ useObjectStreams: true }));
    } catch {
      continue;
    }
    if (data.length > CRUZ_PDF_MAX_PAGE_BYTES) continue;
    try {
      signal.throwIfAborted();
      const entry = { page, pageCount, size: data.length, sha256: await digest(data) };
      await keptPage(service, source, entry, data, signal);
      pages.push(entry);
    } catch {
      retryPages = true;
    }
  }
  return { pages, retryPages };
}

export async function prepareNextCruzAltaPdf(
  service: ReturnType<typeof createInspectionService>,
  signal: AbortSignal,
) {
  const job = await service.rpc("ca_pdf_trabalho", {}, signal);
  if (!job) return false;
  const source = sourceSchema.parse(job);
  let result: (z.infer<typeof representation> & { retryPages: boolean }) | null = null;
  let completed: unknown;
  try {
    if (source.caminho.split("/").some((part) => part === "." || part === ".."))
      throw new Error("Caminho privado de PDF inválido.");
    const path = source.caminho.split("/").map(encodeURIComponent).join("/");
    const response = await service.request(
      `/storage/v1/object/authenticated/${source.bucket}/${path}`,
      { method: "GET", cache: "no-store", signal },
    );
    if (!response.ok) {
      await response.body?.cancel();
      throw new Error("Original privado indisponível.");
    }
    const { bytes, chunks } = await originalAndChunks(response, source, signal);
    const pageSignal = AbortSignal.any([signal, AbortSignal.timeout(15_000)]);
    result = { chunks, ...(await buildPages(service, source, bytes, pageSignal)) };
  } finally {
    signal.throwIfAborted();
    completed = await service.rpc(
      "ca_pdf_finalizar",
      { p_lease: source.lease, p_resultado: result },
      signal,
    );
  }
  if (completed !== true) throw new Error("A reserva da representação de PDF expirou.");
  return true;
}

/** Call only after the exact scene/evidence authorization resolves the original. */
export async function signCruzAltaPdfRepresentations(
  admin: SupabaseClient,
  org: string,
  bucket: Source["bucket"],
  file: { caminho: string; sha256: string; tamanho: number },
  wantedPage: number,
  signal?: AbortSignal,
): Promise<CruzPdfRepresentations | undefined> {
  try {
    const query = admin.rpc("ca_pdf_representacao", {
      p_org: org,
      p_bucket: bucket,
      p_caminho: file.caminho,
      p_sha256: file.sha256,
      p_tamanho: file.tamanho,
    });
    const result = await (signal ? query.abortSignal(signal) : query);
    const parsed = representation.safeParse(result.data);
    if (result.error || !parsed.success) return;
    const count = Math.ceil(file.tamanho / CRUZ_PDF_CHUNK_BYTES);
    if (parsed.data.chunks.length !== count) return;
    const chunks = count > 1 ? parsed.data.chunks : [];
    const entry = parsed.data.pages.find(
      ({ page, pageCount }) => page === wantedPage && page <= pageCount,
    );
    if (!entry) return { chunks };
    const signed = await admin.storage
      .from(BUCKET)
      .createSignedUrl(derivativePath(org, file.sha256, entry), 60);
    if (signed.error || !signed.data) return { chunks };
    return { chunks, page: { ...entry, url: signed.data.signedUrl } };
  } catch {
    return undefined;
  }
}
