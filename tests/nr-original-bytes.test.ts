import { describe, expect, it } from "vitest";
import { createHash } from "node:crypto";
import { confirmedNrOriginalBytes } from "../src/features/nr/original-bytes";
const bytes = new TextEncoder().encode("%PDF-original-preservado");
const metadata = {
  tamanho: bytes.byteLength,
  sha256: createHash("sha256").update(bytes).digest("hex"),
};
describe("leitura privada do original NR", () => {
  it("entrega ao leitor somente os bytes com tamanho e hash confirmados", async () => {
    expect(
      await confirmedNrOriginalBytes(new Response(bytes), metadata, new AbortController().signal),
    ).toEqual(bytes);
  });
  it("recusa bytes de outra revisão, inclusive quando o tamanho é o mesmo", async () => {
    const changed = bytes.slice();
    changed[5] = 0;
    await expect(
      confirmedNrOriginalBytes(new Response(changed), metadata, new AbortController().signal),
    ).rejects.toThrow("integridade");
  });
  it("interrompe streams que ultrapassam o tamanho confirmado", async () => {
    let cancelled = false;
    const stream = new ReadableStream({
      start(controller) {
        controller.enqueue(bytes);
        controller.enqueue(bytes);
      },
      cancel() {
        cancelled = true;
      },
    });
    await expect(
      confirmedNrOriginalBytes(new Response(stream), metadata, new AbortController().signal),
    ).rejects.toThrow("tamanho");
    expect(cancelled).toBe(true);
  });
  it("recusa tamanho truncado, header divergente e objetos maiores que o contrato", async () => {
    await expect(
      confirmedNrOriginalBytes(
        new Response(bytes.subarray(0, 5)),
        metadata,
        new AbortController().signal,
      ),
    ).rejects.toThrow("tamanho");
    await expect(
      confirmedNrOriginalBytes(
        new Response(bytes, { headers: { "content-length": "1" } }),
        metadata,
        new AbortController().signal,
      ),
    ).rejects.toThrow("tamanho");
    await expect(
      confirmedNrOriginalBytes(
        new Response(bytes),
        { ...metadata, tamanho: 50 * 1024 * 1024 + 1 },
        new AbortController().signal,
      ),
    ).rejects.toThrow("limite");
  });
  it("cancelamento por mudança de contexto não mantém bytes disponíveis", async () => {
    const controller = new AbortController();
    controller.abort();
    await expect(
      confirmedNrOriginalBytes(new Response(bytes), metadata, controller.signal),
    ).rejects.toMatchObject({ name: "AbortError" });
  });
});
