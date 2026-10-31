/** Protected, resumable inventory. A blocked source is a pending result, never fabricated HTTP evidence. */
import { readFile, writeFile } from "node:fs/promises";
import path from "node:path";
import { SOURCE, digest } from "./inventory.mjs";
const [directory] = process.argv.slice(2);
if (!directory) throw Error("Usage: photo-recovery-inventory.mjs PRIVATE_STAGING_DIRECTORY");
const root = path.resolve(directory);
if (root === process.cwd() || root.startsWith(path.resolve(process.cwd()) + path.sep))
  throw Error("Customer photo inventories must remain outside the repository");
const read = async (name) => JSON.parse(await readFile(path.join(root, name), "utf8"));
const db = await read("source-db.json"),
  inventory = await read("inventory.json"),
  mappings = await read("mappings.json");
let prior = { assets: [] };
try {
  prior = await read("photo-recovery-inventory.json");
} catch (error) {
  if (error.code !== "ENOENT") throw error;
}
const existing = new Map(prior.assets.map((a) => [a.id, a]));
const ids = new Map(mappings.map((m) => [`${m.tipo}:${m.externo_id}`, m.destino_id]));
const assets = new Map(),
  occurrences = [];
for (const [localIndex, local] of db.locais.entries()) {
  for (const [order, photo] of (local.fotos ?? []).entries()) {
    const original = photo.arquivo || photo.caminho || photo.path;
    if (!original) continue;
    const assetId = digest({ source: SOURCE, original });
    if (!assets.has(assetId))
      assets.set(assetId, {
        id: assetId,
        original_reference: original,
        thumbnail_reference: photo.miniatura || null,
        original: { estado: "pendente", motivo: "Sem binário verificado da aplicação de origem" },
        thumbnail: {
          estado: "pendente",
          motivo: "Sem miniatura recuperada ou gerada de original verificado",
        },
        ...existing.get(assetId),
      });
    const sourcePointer = `/locais/${localIndex}/fotos/${order}`;
    occurrences.push({
      id: digest({ source: SOURCE, snapshot: inventory.snapshot_sha256, pointer: sourcePointer }),
      asset_id: assetId,
      ordem: order,
      source_pointer: sourcePointer,
      source_unit_id: local.unidade_id,
      source_local_id: local.id,
      local_id: ids.get(`local:${local.unidade_id}/${local.id}`) || null,
      unidade_id: ids.get(`unidade:${local.unidade_id}`) || null,
      legenda: photo.legenda || "",
      categoria: photo.categoria || photo.grupo || null,
      data: photo.data || null,
      autoria: photo.autor || null,
      evidencia:
        "Snapshot da ocorrência com ID de unidade/local e de-para preservados; nenhuma conciliação por nome ou pasta",
      arquivo_id: photo.arquivo_id || photo.nr_arquivo_id || null,
    });
  }
}
const rows = [...assets.values()];
const result = {
  format: "nexus-photo-recovery-inventory/1",
  source: SOURCE,
  snapshot_sha256: inventory.snapshot_sha256,
  generated_at: new Date().toISOString(),
  assets: rows,
  occurrences,
  summary: {
    originais_esperados: rows.length,
    miniaturas_origem_esperadas: rows.filter((a) => a.thumbnail_reference).length,
    ocorrencias_esperadas: occurrences.length,
    originais_verificados: rows.filter((a) => a.original.estado === "verificado").length,
    miniaturas_origem_verificadas: rows.filter((a) => a.thumbnail.estado === "origem_verificada")
      .length,
    miniaturas_nexus_verificadas: rows.filter((a) => a.thumbnail.estado === "nexus_verificada")
      .length,
    ocorrencias_com_arquivo_explicito: occurrences.filter((o) => o.arquivo_id).length,
    nota: "Imagens Drive/DOCX não substituem fotos próprias; caminhos e ocorrências têm contagens distintas.",
  },
};
await writeFile(path.join(root, "photo-recovery-inventory.json"), JSON.stringify(result, null, 2), {
  mode: 0o600,
});
console.log(JSON.stringify(result.summary));
