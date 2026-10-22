export async function sha256(bytes: Uint8Array): Promise<string> {
  return [...new Uint8Array(await crypto.subtle.digest("SHA-256", Uint8Array.from(bytes).buffer))]
    .map((b) => b.toString(16).padStart(2, "0"))
    .join("");
}
export function mimeDetectado(b: Uint8Array): string | null {
  if (b[0] === 0x25 && b[1] === 0x50 && b[2] === 0x44 && b[3] === 0x46 && b[4] === 0x2d)
    return "application/pdf";
  if ([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a].every((x, i) => b[i] === x))
    return "image/png";
  if (b[0] === 0xff && b[1] === 0xd8 && b[2] === 0xff) return "image/jpeg";
  const ascii = (start: number, end: number) => String.fromCharCode(...b.slice(start, end));
  if (ascii(0, 4) === "RIFF" && ascii(8, 12) === "WEBP") return "image/webp";
  return null;
}
export async function validarBinario(
  bytes: Uint8Array,
  meta: { tamanho: number; mime: string; sha256: string },
): Promise<void> {
  if (bytes.byteLength !== meta.tamanho || bytes.byteLength > 20 * 1024 * 1024)
    throw new Error("O tamanho do arquivo armazenado diverge do envio.");
  if (mimeDetectado(bytes) !== meta.mime)
    throw new Error("O conteúdo não corresponde ao tipo de arquivo informado.");
  if ((await sha256(bytes)) !== meta.sha256)
    throw new Error("O arquivo armazenado não corresponde ao hash informado. Repita o envio.");
}
