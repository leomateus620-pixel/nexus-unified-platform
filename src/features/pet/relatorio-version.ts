/** Appearance only. Never changes permit rules, validity or certified originals. */
export const PET_RELATORIO_RENDER_VERSAO = "2" as const;
export type PetRelatorioRenderVersao = "1" | "2";

/** V1 keeps its exact historical request key. New formats get a stable namespace
 * without the PET version: reusing a request with another version must conflict. */
export async function chaveRelatorio(
  chave: string,
  renderVersao: PetRelatorioRenderVersao,
): Promise<string> {
  if (renderVersao === "1") return chave;
  const digest = new Uint8Array(
    await crypto.subtle.digest(
      "SHA-256",
      new TextEncoder().encode(`nexus:pet:relatorio:render:${renderVersao}:${chave}`),
    ),
  );
  // A UUIDv8 identifies this application's deterministic SHA-256 namespace.
  digest[6] = (digest[6]! & 0x0f) | 0x80;
  digest[8] = (digest[8]! & 0x3f) | 0x80;
  const h = Array.from(digest.slice(0, 16), (n) => n.toString(16).padStart(2, "0")).join("");
  return `${h.slice(0, 8)}-${h.slice(8, 12)}-${h.slice(12, 16)}-${h.slice(16, 20)}-${h.slice(20)}`;
}
