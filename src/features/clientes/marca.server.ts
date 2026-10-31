import type { SupabaseClient } from "@supabase/supabase-js";
import { clienteMarcaSchema } from "./schemas";
import { CLIENTE_MARCA_BUCKET } from "./marca";

/** Uma assinatura em lote por coleção. Falhas de mídia preservam a identificação textual. */
export async function assinarMarcas<T extends { marca?: unknown }>(db: SupabaseClient, rows: T[]) {
  const parsed = rows.map((row) => clienteMarcaSchema.safeParse(row.marca));
  const paths = [
    ...new Set(
      parsed.flatMap((result) =>
        result.success && !result.data.caminho.startsWith("/") ? [result.data.caminho] : [],
      ),
    ),
  ];
  const urls = new Map<string, string>();
  if (paths.length) {
    try {
      const { data } = await db.storage.from(CLIENTE_MARCA_BUCKET).createSignedUrls(paths, 3600);
      for (const item of data ?? [])
        if (item.path && item.signedUrl && !item.error) urls.set(item.path, item.signedUrl);
    } catch {
      // A mídia é opcional: uma indisponibilidade não impede reconhecer/selecionar o cliente.
    }
  }
  return rows.map((row, index) => {
    const result = parsed[index];
    return {
      ...row,
      marca: result?.success ? { ...result.data, url: urls.get(result.data.caminho) } : null,
    };
  });
}
