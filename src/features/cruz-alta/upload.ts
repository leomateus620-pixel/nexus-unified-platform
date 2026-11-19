import { supabase } from "@/integrations/supabase/client";
import { sha256Nr, validarMetadataNr, NR_ARQUIVO_MIMES } from "@/features/nr/files";

export async function describeFile(file: File, originalName = file.name) {
  const ext = originalName.split(".").pop()?.toLowerCase() as keyof typeof NR_ARQUIVO_MIMES;
  const mime = NR_ARQUIVO_MIMES[ext];
  if (!mime || file.size === 0 || file.size > 50 * 1024 * 1024)
    throw new Error("Formato ou tamanho fora dos limites do acervo (50 MiB por arquivo).");
  const meta = {
    nome: originalName,
    mime,
    tamanho: file.size,
    sha256: await sha256Nr(new Uint8Array(await file.arrayBuffer())),
  };
  validarMetadataNr(meta);
  return meta;
}
export async function operationId(parts: unknown[]) {
  const bytes = new Uint8Array(
    await crypto.subtle.digest("SHA-256", new TextEncoder().encode(JSON.stringify(parts))),
  ).slice(0, 16);
  bytes[6] = ((bytes[6] ?? 0) & 15) | 0x80;
  bytes[8] = ((bytes[8] ?? 0) & 63) | 0x80;
  const hex = Array.from(bytes, (b) => b.toString(16).padStart(2, "0")).join("");
  return [
    hex.slice(0, 8),
    hex.slice(8, 12),
    hex.slice(12, 16),
    hex.slice(16, 20),
    hex.slice(20),
  ].join("-");
}
export async function transferFile(
  ticket: { bucket: string; caminho: string; token: string | null },
  file: File,
  mime: string,
) {
  if (!ticket.token) return;
  const { error } = await supabase.storage
    .from(ticket.bucket)
    .uploadToSignedUrl(ticket.caminho, ticket.token, file, { contentType: mime, upsert: false });
  if (error && !/already exists|duplicate|resource already exists/i.test(error.message))
    throw error;
}
