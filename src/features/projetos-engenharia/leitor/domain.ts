export const PDFJS_VERSION = "6.4.299";
export const MAX_ORIGINAL_BYTES = 20 * 1024 * 1024;
export const ACCESS_INTERVAL_MS = 30_000;
export const MOBILE_PIXEL_BUDGET = 4_000_000;
export const DESKTOP_PIXEL_BUDGET = 8_000_000;
export type OriginalMime = "application/pdf" | "image/png" | "image/jpeg" | "image/webp";
export type OriginalPe = {
  id: string;
  nome: string;
  sha256: string;
  tamanho: number;
  mime: OriginalMime;
};
export type ReaderFailureKind =
  "access" | "network" | "integrity" | "invalid" | "password" | "worker" | "resource";
export class LeituraPeAccessError extends Error {
  readonly kind = "access" as const;
  constructor() {
    super("O original não está disponível para seu acesso atual.");
    this.name = "LeituraPeAccessError";
  }
}
export class LeituraPeError extends Error {
  constructor(readonly kind: Exclude<ReaderFailureKind, "access">) {
    super(kind);
    this.name = "LeituraPeError";
  }
}
export function failureKind(error: unknown): ReaderFailureKind {
  if (error instanceof LeituraPeAccessError) return "access";
  if (error instanceof LeituraPeError) return error.kind;
  const name = error instanceof Error ? error.name : "";
  if (name === "PasswordException") return "password";
  if (name === "InvalidPDFException") return "invalid";
  return "network";
}
export const failureText: Record<ReaderFailureKind, string> = {
  access: "O original não está disponível para seu acesso atual. A visualização foi encerrada.",
  network: "Não foi possível confirmar o acesso ou carregar o original. Tente novamente.",
  integrity: "Os bytes recebidos não correspondem ao original confirmado. Tente novamente.",
  invalid:
    "Não foi possível interpretar este original. O PDF pode estar inválido ou usar um recurso incompatível.",
  password:
    "Este PDF exige uma senha. A prévia não solicita nem envia senhas; utilize o download autorizado.",
  worker:
    "O renderizador não pôde iniciar ou foi interrompido. Tente novamente ou utilize o download autorizado.",
  resource:
    "Esta página excede os limites da prévia neste dispositivo. Tente um zoom menor ou utilize o download autorizado.",
};
export function validateOriginal(arquivo: OriginalPe) {
  if (
    !Number.isSafeInteger(arquivo.tamanho) ||
    arquivo.tamanho < 1 ||
    arquivo.tamanho > MAX_ORIGINAL_BYTES ||
    !/^[a-f0-9]{64}$/.test(arquivo.sha256) ||
    !["application/pdf", "image/png", "image/jpeg", "image/webp"].includes(arquivo.mime)
  )
    throw new LeituraPeError("integrity");
}
export function abortError(): DOMException {
  return new DOMException("Leitura cancelada.", "AbortError");
}
export function isCancelled(error: unknown) {
  return (
    error instanceof Error &&
    ["AbortError", "AbortException", "RenderingCancelledException"].includes(error.name)
  );
}
/** Canvas allocation is bounded independently of CSS zoom and physical DPR. */
export function canvasBudget(input: {
  width: number;
  height: number;
  availableWidth: number;
  availableHeight: number;
  zoom: number;
  dpr: number;
  mobile: boolean;
  fit: "width" | "page";
}) {
  const { width, height } = input;
  if (
    ![width, height, input.availableWidth, input.availableHeight, input.zoom].every(
      (v) => Number.isFinite(v) && v > 0,
    )
  )
    throw new LeituraPeError("resource");
  const fit = Math.min(
    input.availableWidth / width,
    input.fit === "page" ? input.availableHeight / height : Infinity,
  );
  const scale = fit * Math.min(4, Math.max(0.25, input.zoom));
  const cssWidth = width * scale;
  const cssHeight = height * scale;
  if (Math.max(cssWidth, cssHeight) > 32768) throw new LeituraPeError("resource");
  const pixels = input.mobile ? MOBILE_PIXEL_BUDGET : DESKTOP_PIXEL_BUDGET;
  const dpr = Number.isFinite(input.dpr) ? Math.min(2, Math.max(1, input.dpr)) : 1;
  const ratio = Math.min(dpr, Math.sqrt(pixels / (cssWidth * cssHeight)));
  const backingWidth = Math.max(1, Math.floor(cssWidth * ratio));
  const backingHeight = Math.max(1, Math.floor(cssHeight * ratio));
  if (backingWidth * backingHeight > pixels) throw new LeituraPeError("resource");
  return {
    cssWidth,
    cssHeight,
    backingWidth,
    backingHeight,
    scale,
    ratio,
    limited: ratio + 0.001 < dpr,
  };
}
export function pageInput(value: string, total: number): number | null {
  if (!/^\d+$/.test(value.trim())) return null;
  const n = Number(value.trim());
  return Number.isSafeInteger(n) && n >= 1 && n <= total ? n : null;
}
/** Preallocate exactly the registered size; oversized/truncated downloads cannot reach the parser. */
export async function readOriginalBytes(response: Response, expected: number, signal: AbortSignal) {
  if (!response.ok) {
    if ([401, 403].includes(response.status)) throw new LeituraPeAccessError();
    throw new LeituraPeError("network");
  }
  if (
    !Number.isSafeInteger(expected) ||
    expected < 1 ||
    expected > MAX_ORIGINAL_BYTES ||
    !response.body
  )
    throw new LeituraPeError("integrity");
  const bytes = new Uint8Array(expected);
  const reader = response.body.getReader();
  const cancel = () => {
    void reader.cancel().catch(() => undefined);
  };
  signal.addEventListener("abort", cancel, { once: true });
  let offset = 0;
  try {
    signal.throwIfAborted();
    while (true) {
      const result = await reader.read();
      signal.throwIfAborted();
      if (result.done) break;
      if (offset + result.value.byteLength > expected) throw new LeituraPeError("integrity");
      bytes.set(result.value, offset);
      offset += result.value.byteLength;
    }
    if (offset !== expected) throw new LeituraPeError("integrity");
    return bytes;
  } catch (error) {
    bytes.fill(0);
    await reader.cancel().catch(() => undefined);
    throw error;
  } finally {
    signal.removeEventListener("abort", cancel);
    reader.releaseLock();
  }
}
export async function verifyOriginalBytes(bytes: Uint8Array, arquivo: OriginalPe) {
  const starts = (...prefix: number[]) => prefix.every((v, i) => bytes[i] === v);
  const ascii = (a: number, b: number) => String.fromCharCode(...bytes.subarray(a, b));
  const actual = starts(0x25, 0x50, 0x44, 0x46, 0x2d)
    ? "application/pdf"
    : starts(0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a)
      ? "image/png"
      : starts(0xff, 0xd8, 0xff)
        ? "image/jpeg"
        : ascii(0, 4) === "RIFF" && ascii(8, 12) === "WEBP"
          ? "image/webp"
          : null;
  if (bytes.byteLength !== arquivo.tamanho || actual !== arquivo.mime)
    throw new LeituraPeError("integrity");
  // No Uint8Array.from / base64 copy. WebCrypto's internal allocation remains browser-dependent.
  const digest = new Uint8Array(await crypto.subtle.digest("SHA-256", bytes as BufferSource));
  const hash = Array.from(digest, (v) => v.toString(16).padStart(2, "0")).join("");
  if (hash !== arquivo.sha256) throw new LeituraPeError("integrity");
}
export function imageDimensions(bytes: Uint8Array, mime: OriginalMime) {
  const d = new DataView(bytes.buffer, bytes.byteOffset, bytes.byteLength);
  if (
    mime === "image/png" &&
    bytes.length >= 24 &&
    d.getUint32(8) === 13 &&
    String.fromCharCode(...bytes.subarray(12, 16)) === "IHDR"
  )
    return { width: d.getUint32(16), height: d.getUint32(20) };
  if (mime === "image/jpeg") {
    let offset = 2;
    while (offset + 4 < bytes.length) {
      if (bytes[offset++] !== 0xff) break;
      while (bytes[offset] === 0xff) offset++;
      const marker = bytes[offset++];
      if (marker === undefined || marker === 0xd9 || marker === 0xda) break;
      if (marker === 0x01 || (marker >= 0xd0 && marker <= 0xd8)) continue;
      const length = d.getUint16(offset);
      if (length < 2 || offset + length > bytes.length) break;
      if (marker >= 0xc0 && marker <= 0xcf && ![0xc4, 0xc8, 0xcc].includes(marker) && length >= 7)
        return { width: d.getUint16(offset + 5), height: d.getUint16(offset + 3) };
      offset += length;
    }
  }
  if (mime === "image/webp" && bytes.length >= 30) {
    const kind = String.fromCharCode(...bytes.subarray(12, 16));
    const le24 = (n: number) =>
      (bytes[n] ?? 0) | ((bytes[n + 1] ?? 0) << 8) | ((bytes[n + 2] ?? 0) << 16);
    if (kind === "VP8X") return { width: 1 + le24(24), height: 1 + le24(27) };
    if (kind === "VP8 ")
      return { width: d.getUint16(26, true) & 0x3fff, height: d.getUint16(28, true) & 0x3fff };
    if (kind === "VP8L")
      return {
        width: 1 + ((bytes[21] ?? 0) | (((bytes[22] ?? 0) & 0x3f) << 8)),
        height:
          1 +
          (((bytes[22] ?? 0) >> 6) | ((bytes[23] ?? 0) << 2) | (((bytes[24] ?? 0) & 0xf) << 10)),
      };
  }
  throw new LeituraPeError("invalid");
}
