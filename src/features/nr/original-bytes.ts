/** Bound memory by the confirmed object size, and verify identity before rendering an original. */
export async function confirmedNrOriginalBytes(
  response: Response,
  expected: { tamanho: number; sha256: string },
  signal: AbortSignal,
): Promise<Uint8Array> {
  signal.throwIfAborted();
  if (!response.ok) throw new Error("Original indisponível para este acesso.");
  if (
    !Number.isSafeInteger(expected.tamanho) ||
    expected.tamanho < 1 ||
    expected.tamanho > 50 * 1024 * 1024
  )
    throw new Error("O original excede o limite da prévia. Utilize abrir ou baixar.");
  if (!/^[a-f0-9]{64}$/.test(expected.sha256))
    throw new Error("A integridade do original não pôde ser confirmada.");
  const declared = response.headers.get("content-length");
  if (declared && Number(declared) !== expected.tamanho)
    throw new Error("O tamanho recebido difere do original confirmado.");
  const reader = response.body?.getReader();
  if (!reader) throw new Error("O original não contém bytes disponíveis.");
  const bytes = new Uint8Array(expected.tamanho);
  let offset = 0;
  const cancel = () => {
    void reader.cancel().catch(() => undefined);
  };
  signal.addEventListener("abort", cancel, { once: true });
  try {
    while (true) {
      const result = await reader.read();
      signal.throwIfAborted();
      if (result.done) break;
      if (offset + result.value.byteLength > expected.tamanho)
        throw new Error("O tamanho recebido difere do original confirmado.");
      bytes.set(result.value, offset);
      offset += result.value.byteLength;
    }
    if (offset !== expected.tamanho)
      throw new Error("O tamanho recebido difere do original confirmado.");
    const hash = Array.from(new Uint8Array(await crypto.subtle.digest("SHA-256", bytes)))
      .map((byte) => byte.toString(16).padStart(2, "0"))
      .join("");
    signal.throwIfAborted();
    if (hash !== expected.sha256)
      throw new Error("A integridade do original não pôde ser confirmada.");
    return bytes;
  } finally {
    signal.removeEventListener("abort", cancel);
    cancel();
    reader.releaseLock();
  }
}
