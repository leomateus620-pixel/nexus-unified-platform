import { describe, expect, it } from "vitest";
import {
  DESKTOP_PIXEL_BUDGET,
  MOBILE_PIXEL_BUDGET,
  MAX_ORIGINAL_BYTES,
  LeituraPeAccessError,
  LeituraPeError,
  canvasBudget,
  failureKind,
  failureText,
  imageDimensions,
  pageInput,
  readOriginalBytes,
  verifyOriginalBytes,
} from "./domain";
import { ReaderLifetime } from "./lifetime";

describe("orçamento e original privado", () => {
  it("mantém orçamento físico em zoom, proporção e DPR diferentes, sem impor largura de página", () => {
    for (const mobile of [true, false])
      for (const width of [100, 841.89, 1190.551, 5000])
        for (const height of [200, 841.89, 1190.551, 5000])
          for (const zoom of [0.25, 1, 2, 4]) {
            const result = canvasBudget({
              width,
              height,
              availableWidth: mobile ? 328 : 1300,
              availableHeight: 600,
              zoom,
              dpr: 3,
              mobile,
              fit: "page",
            });
            expect(result.backingWidth * result.backingHeight).toBeLessThanOrEqual(
              mobile ? MOBILE_PIXEL_BUDGET : DESKTOP_PIXEL_BUDGET,
            );
            expect(result.backingWidth).toBeGreaterThan(0);
            expect(result.backingHeight).toBeGreaterThan(0);
            expect(result.ratio).toBeLessThanOrEqual(2);
          }
  });
  it("limita raster sem reduzir o zoom CSS e rejeita dimensão patológica", () => {
    const result = canvasBudget({
      width: 1190,
      height: 842,
      availableWidth: 1300,
      availableHeight: 600,
      zoom: 4,
      dpr: 3,
      mobile: true,
      fit: "width",
    });
    expect(result.cssWidth).toBeCloseTo(5200, 6);
    expect(result.limited).toBe(true);
    expect(() =>
      canvasBudget({
        width: 1,
        height: 1e9,
        availableWidth: 328,
        availableHeight: 600,
        zoom: 1,
        dpr: 1,
        mobile: true,
        fit: "width",
      }),
    ).toThrow(LeituraPeError);
  });
  it("página exige inteiro do documento, sem clamp silencioso", () => {
    expect(pageInput(" 2 ", 4)).toBe(2);
    for (const value of ["0", "5", "1.5", "1e2", "-1", "NaN", ""])
      expect(pageInput(value, 4)).toBeNull();
  });
  it("recebe exatamente o tamanho registrado sem concatenar buffers deslimitados", async () => {
    const body = new ReadableStream<Uint8Array>({
      start(c) {
        c.enqueue(new Uint8Array([1, 2]));
        c.enqueue(new Uint8Array([3]));
        c.close();
      },
    });
    expect(await readOriginalBytes(new Response(body), 3, new AbortController().signal)).toEqual(
      new Uint8Array([1, 2, 3]),
    );
    await expect(
      readOriginalBytes(new Response(new Uint8Array([1, 2])), 1, new AbortController().signal),
    ).rejects.toMatchObject({ kind: "integrity" });
    await expect(
      readOriginalBytes(new Response(new Uint8Array([1])), 2, new AbortController().signal),
    ).rejects.toMatchObject({ kind: "integrity" });
    await expect(
      readOriginalBytes(
        new Response(new Uint8Array([1])),
        MAX_ORIGINAL_BYTES + 1,
        new AbortController().signal,
      ),
    ).rejects.toMatchObject({ kind: "integrity" });
  });
  it("cancela a leitura pendente quando a sessão perde validade", async () => {
    let cancelled = false;
    const body = new ReadableStream<Uint8Array>({
      start(c) {
        c.enqueue(new Uint8Array([1]));
      },
      cancel() {
        cancelled = true;
      },
    });
    const controller = new AbortController();
    const result = readOriginalBytes(new Response(body), 2, controller.signal);
    controller.abort();
    await expect(result).rejects.toMatchObject({ name: "AbortError" });
    expect(cancelled).toBe(true);
  });
  it("confronta hash e magic bytes antes de permitir renderização", async () => {
    const bytes = new TextEncoder().encode("%PDF-1.7\nlocal synthetic fixture");
    const digest = new Uint8Array(await crypto.subtle.digest("SHA-256", bytes));
    const sha256 = Array.from(digest, (v) => v.toString(16).padStart(2, "0")).join("");
    const file = {
      id: "local",
      nome: "local.pdf",
      tamanho: bytes.byteLength,
      mime: "application/pdf" as const,
      sha256,
    };
    await expect(verifyOriginalBytes(bytes, file)).resolves.toBeUndefined();
    await expect(
      verifyOriginalBytes(bytes, { ...file, sha256: "0".repeat(64) }),
    ).rejects.toMatchObject({ kind: "integrity" });
    await expect(verifyOriginalBytes(bytes, { ...file, mime: "image/png" })).rejects.toMatchObject({
      kind: "integrity",
    });
  });
  it("interpreta dimensão raster antes do decode, incluindo PNG e WebP sem perdas", () => {
    const png = new Uint8Array(24);
    const d = new DataView(png.buffer);
    d.setUint32(8, 13);
    png.set(new TextEncoder().encode("IHDR"), 12);
    d.setUint32(16, 1000);
    d.setUint32(20, 2000);
    expect(imageDimensions(png, "image/png")).toEqual({ width: 1000, height: 2000 });
    const webp = new Uint8Array(30);
    webp.set(new TextEncoder().encode("VP8L"), 12);
    webp[21] = 99;
    webp[23] = 49;
    expect(imageDimensions(webp, "image/webp")).toEqual({ width: 100, height: 197 });
    expect(() => imageDimensions(new Uint8Array(2), "image/jpeg")).toThrow(LeituraPeError);
  });
  it("não transforma diagnóstico de rede com token em mensagem pública", () => {
    const internal = new Error("GET https://private.invalid/path?token=private-value failed");
    expect(failureKind(internal)).toBe("network");
    expect(failureText[failureKind(internal)]).not.toContain("private-value");
    expect(failureKind(new LeituraPeAccessError())).toBe("access");
    const encrypted = new Error("private filename");
    encrypted.name = "PasswordException";
    expect(failureKind(encrypted)).toBe("password");
  });
});
describe("ciclo de vida de bytes e recursos privados", () => {
  it("não ressuscita documento cuja criação terminou depois da negação", async () => {
    const session = new ReaderLifetime();
    let finish!: (value: { id: string }) => void;
    const disposed: string[] = [];
    const pending = session.acquire(
      new Promise<{ id: string }>((resolve) => {
        finish = resolve;
      }),
      (value) => {
        disposed.push(value.id);
      },
    );
    await session.close();
    finish({ id: "old-file" });
    await expect(pending).rejects.toMatchObject({ name: "AbortError" });
    expect(disposed).toEqual(["old-file"]);
    expect(session.active).toBe(false);
  });
  it("descarte é idempotente e falha de um recurso não retém os demais", async () => {
    const session = new ReaderLifetime();
    let released = 0;
    session.register(() => {
      throw new Error("worker already stopped");
    });
    session.register(() => {
      released++;
    });
    await Promise.all([session.close(), session.close()]);
    expect(released).toBe(1);
    expect(session.controller.signal.aborted).toBe(true);
    expect(() => session.assertActive()).toThrow();
  });
});
