import type { PDFDataRangeTransport } from "pdfjs-dist";
import { LeituraPeAccessError, LeituraPeError, MAX_PDF_RANGE_BYTES } from "./domain";

export const PDF_RANGE_CHUNK = 256 * 1024;
const MAX_REQUEST_BYTES = 16 * 1024 * 1024;
const MAX_SESSION_BYTES = 64 * 1024 * 1024;
const MAX_ACTIVE_REQUESTS = 4;
const MAX_PENDING_REQUESTS = 64;

type AuthorizeRange = (
  signal: AbortSignal,
) => Promise<{ url: string; expiresAt?: string | undefined }>;

export async function createPdfRangeTransport(
  Base: typeof PDFDataRangeTransport,
  size: number,
  authorize: AuthorizeRange,
  signal: AbortSignal,
  onFailure: (error: unknown) => void,
) {
  if (!Number.isSafeInteger(size) || size < PDF_RANGE_CHUNK || size > MAX_PDF_RANGE_BYTES)
    throw new LeituraPeError("resource");
  const abort = new AbortController();
  const sessionSignal = AbortSignal.any([signal, abort.signal]);
  let authorization: Awaited<ReturnType<AuthorizeRange>> | undefined;
  let pendingAuthorization: ReturnType<AuthorizeRange> | undefined;
  let scheduledBytes = PDF_RANGE_CHUNK;
  let active = 0;
  const pending: { begin: number; end: number }[] = [];

  async function signedUrl() {
    if (authorization && Date.parse(authorization.expiresAt ?? "") > Date.now() + 5_000)
      return authorization.url;
    if (!pendingAuthorization) {
      pendingAuthorization = authorize(sessionSignal)
        .then((result) => {
          const url = new URL(result.url, window.location.origin);
          if (
            !["http:", "https:"].includes(url.protocol) ||
            url.username ||
            url.password ||
            url.hash
          )
            throw new LeituraPeError("network");
          authorization = { ...result, url: url.href };
          return authorization;
        })
        .finally(() => {
          pendingAuthorization = undefined;
        });
    }
    return (await pendingAuthorization).url;
  }

  async function read(begin: number, end: number) {
    const expectedLength = end - begin;
    const requestSignal = AbortSignal.any([sessionSignal, AbortSignal.timeout(25_000)]);
    for (let attempt = 0; attempt < 2; attempt++) {
      const url = await signedUrl();
      requestSignal.throwIfAborted();
      const response = await fetch(url, {
        headers: { Range: `bytes=${begin}-${end - 1}` },
        cache: "no-store",
        credentials: "omit",
        redirect: "error",
        referrerPolicy: "no-referrer",
        signal: requestSignal,
      });
      if (response.status === 401 || response.status === 403) {
        await response.body?.cancel();
        if (authorization?.url === url) authorization = undefined;
        continue;
      }
      const encoding = response.headers.get("content-encoding");
      const mime = response.headers.get("content-type")?.split(";")[0]?.trim().toLowerCase();
      const length = response.headers.get("content-length");
      if (
        response.status !== 206 ||
        response.headers.get("content-range") !== `bytes ${begin}-${end - 1}/${size}` ||
        (encoding && encoding !== "identity") ||
        (length && Number(length) !== expectedLength) ||
        (mime !== "application/pdf" && mime !== "application/octet-stream") ||
        !response.body
      ) {
        await response.body?.cancel();
        throw new LeituraPeError("range");
      }
      const reader = response.body.getReader();
      const bytes = new Uint8Array(expectedLength);
      let offset = 0;
      try {
        while (true) {
          const chunk = await reader.read();
          requestSignal.throwIfAborted();
          if (chunk.done) break;
          if (offset + chunk.value.byteLength > expectedLength) throw new LeituraPeError("range");
          bytes.set(chunk.value, offset);
          offset += chunk.value.byteLength;
        }
        if (offset !== expectedLength) throw new LeituraPeError("range");
        return bytes;
      } finally {
        await reader.cancel().catch(() => undefined);
        reader.releaseLock();
      }
    }
    throw new LeituraPeAccessError();
  }

  const initial = await read(0, PDF_RANGE_CHUNK);
  if (new TextDecoder("ascii").decode(initial.subarray(0, 5)) !== "%PDF-")
    throw new LeituraPeError("invalid");

  class Transport extends Base {
    override requestDataRange(begin: number, end: number) {
      if (sessionSignal.aborted) return;
      if (
        !Number.isSafeInteger(begin) ||
        !Number.isSafeInteger(end) ||
        begin < 0 ||
        begin >= end ||
        end > size ||
        end - begin > MAX_REQUEST_BYTES ||
        scheduledBytes + end - begin > MAX_SESSION_BYTES ||
        pending.length >= MAX_PENDING_REQUESTS
      ) {
        this.fail(new LeituraPeError("resource"));
        return;
      }
      scheduledBytes += end - begin;
      pending.push({ begin, end });
      this.drain();
    }

    override abort() {
      abort.abort();
      pending.length = 0;
    }

    private fail(error: unknown) {
      if (sessionSignal.aborted) return;
      this.abort();
      onFailure(error);
    }

    private drain() {
      while (!sessionSignal.aborted && active < MAX_ACTIVE_REQUESTS && pending.length > 0) {
        const range = pending.shift()!;
        active++;
        void read(range.begin, range.end)
          .then((chunk) => {
            if (!sessionSignal.aborted) this.onDataRange(range.begin, chunk);
          })
          .catch((error: unknown) => this.fail(error))
          .finally(() => {
            active--;
            this.drain();
          });
      }
    }
  }
  return new Transport(size, initial, true);
}
