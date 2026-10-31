import { readFile, writeFile, readdir, stat } from "node:fs/promises";
import { createHash } from "node:crypto";
import path from "node:path";

const [directory] = process.argv.slice(2);
if (!directory) throw Error("Usage: reconcile-files.mjs PRIVATE_STAGING_DIRECTORY");
const root = path.resolve(directory);
if (root.startsWith(path.resolve(process.cwd()) + path.sep))
  throw Error("Private customer payloads cannot be written inside the repository");
const db = JSON.parse(await readFile(path.join(root, "source-db.json"), "utf8"));
const inventory = JSON.parse(await readFile(path.join(root, "inventory.json"), "utf8"));
const originals = new Map(),
  folders = new Map(),
  edges = [];
for (const file of await readdir(path.join(root, "originals")))
  if (file.endsWith(".json")) {
    const metadataPath = path.join(root, "originals", file);
    const record = JSON.parse(await readFile(metadataPath, "utf8"));
    if (!record.capturado_em) {
      record.capturado_em = (await stat(metadataPath)).mtime.toISOString();
      record.captura_timestamp_fonte =
        "mtime do sidecar gravado ao concluir o recebimento dos bytes; não é data de autoria";
    }
    if (record.estado === "validado") {
      const bytes = await readFile(record.path);
      const sha = createHash("sha256").update(bytes).digest("hex");
      if (bytes.length !== record.bytes || sha !== record.sha256)
        throw Error(`Staged bytes failed readback verification: ${record.id}`);
    }
    originals.set(record.id, record);
  }
for (const file of await readdir(path.join(root, "folders")))
  if (file.endsWith(".json")) {
    const folder = JSON.parse(await readFile(path.join(root, "folders", file), "utf8"));
    const ref = inventory.references.find((r) => r.external_id === folder.id && r.tipo === "pasta");
    const locals = new Map();
    for (const association of ref?.associacoes ?? []) {
      const match = association.caminho_json.match(/^\/locais\/(\d+)\//);
      const local = match ? db.locais[Number(match[1])] : null;
      if (local)
        locals.set(`${local.unidade_id}/${local.id}`, {
          unidade_id: local.unidade_id,
          local_id: local.id,
          evidencia: association.caminho_json,
        });
    }
    folders.set(folder.id, {
      id: folder.id,
      nome: folder.metadata?.title,
      captured_at: folder.captured_at,
      children: folder.listing?.files ?? [],
      erro: folder.error,
      contextos_locais: [...locals.values()],
    });
    for (const child of folder.listing?.files ?? [])
      edges.push({
        parent_id: folder.id,
        child_id: child.id,
        nome: child.title,
        mime: child.mime_type,
        capturado_em: folder.captured_at,
        evidencia: "Resposta Drive list_folder",
        contextos_locais: [...locals.values()],
      });
  }
const photoMappings = [];
for (const ref of inventory.references.filter((r) => r.tipo === "foto")) {
  const name = path.posix.basename(ref.caminho_original ?? "");
  for (const association of ref.associacoes) {
    const match = association.caminho_json.match(/^\/locais\/(\d+)\//),
      local = match ? db.locais[Number(match[1])] : null;
    if (!local) continue;
    const localFolders = [...folders.values()].filter((f) =>
      f.contextos_locais.some((c) => c.unidade_id === local.unidade_id && c.local_id === local.id),
    );
    const children = localFolders.flatMap((f) =>
      f.children.map((c) => ({ ...c, folder_id: f.id })),
    );
    const exact = children.filter((c) => c.title === name);
    const jpegAlias = exact.length
      ? []
      : children.filter(
          (c) =>
            /\.jpe?g$/i.test(name) &&
            /\.jpe?g$/i.test(c.title ?? "") &&
            name.replace(/\.jpe?g$/i, "") === c.title.replace(/\.jpe?g$/i, ""),
        );
    photoMappings.push({
      referencia_id: ref.id,
      source_path: ref.caminho_original,
      source_field: association.caminho_json,
      reference_kind: ref.caminho_original?.includes("/thumb/")
        ? "miniatura"
        : "imagem_original_referenciada",
      unidade_id: local.unidade_id,
      local_id: local.id,
      estado:
        exact.length === 1
          ? "candidata_nome_em_pasta"
          : exact.length > 1
            ? "ambiguo"
            : jpegAlias.length
              ? "candidata_extensao_jpeg"
              : "sem_correspondencia",
      files: (exact.length ? exact : jpegAlias).map((c) => ({
        id: c.id,
        folder_id: c.folder_id,
        nome: c.title,
        bytes_verificados: originals.get(c.id)?.estado === "validado",
        sha256: originals.get(c.id)?.sha256,
      })),
      justificativa: exact.length
        ? "Nome exato em pasta vinculada é apenas candidato: não comprova que a fotografia pertence ao local. Exige identidade do ativo e ocorrência ou decisão profissional documentada."
        : jpegAlias.length
          ? "Mesmo basename em pasta explicitamente vinculada; .jpg/.jpeg diferem. Candidato preservado para decisão, sem afirmar igualdade com a imagem referida."
          : "Nenhum nome exato nas pastas explicitamente vinculadas ao ID do local. TAG não foi usada como identidade.",
    });
  }
}
const expected = new Map(
  inventory.references
    .filter((r) => r.external_id && r.tipo !== "pasta")
    .map((r) => [
      r.external_id,
      { id: r.external_id, tipo: "referencia_direta", source_reference: r.id },
    ]),
);
for (const e of edges)
  if (e.mime !== "application/vnd.google-apps.folder" && !expected.has(e.child_id))
    expected.set(e.child_id, { id: e.child_id, tipo: "arquivo_em_pasta", parent_id: e.parent_id });
const files = [...expected.values()].map((e) => ({
  ...e,
  ...(originals.get(e.id) ?? { estado: "nao_obtido" }),
}));
const issued = db.documentos
  .filter((d) => d.estado === "emitido")
  .flatMap((d) => d.arquivos ?? [])
  .map((a) => a.url.match(/\/d\/([^/]+)/)?.[1])
  .filter(Boolean);
const summary = {
  format: "nexus-nr-files-reconciliation-v1",
  capturado_em: new Date().toISOString(),
  files_identified: expected.size,
  head_files_validated: files.filter((f) => f.estado === "validado").length,
  bytes_validated: files
    .filter((f) => f.estado === "validado")
    .reduce((sum, f) => sum + f.bytes, 0),
  known_issued_links: issued.length,
  known_issued_bytes_validated: issued.filter((id) => originals.get(id)?.estado === "validado")
    .length,
  source_direct_files: inventory.references.filter((r) => r.external_id && r.tipo !== "pasta")
    .length,
  folders: folders.size,
  folder_children: edges.length,
  empty_folders: [...folders.values()].filter((f) => !f.children.length && !f.erro).length,
  folder_cycles: edges.filter((e) => e.parent_id === e.child_id).length,
  child_folders: edges.filter((e) => e.mime === "application/vnd.google-apps.folder").length,
  formats: files
    .filter((f) => f.estado === "validado")
    .reduce((out, f) => ((out[f.mime_detectado] = (out[f.mime_detectado] ?? 0) + 1), out), {}),
  photo_mapping: photoMappings.reduce(
    (out, m) => ((out[m.estado] = (out[m.estado] ?? 0) + 1), out),
    {},
  ),
  pending_source_image_paths: inventory.references.filter((r) => r.tipo === "foto").length,
  limitations: [
    "Drive parent_ids were not exposed; only confirmed list_folder edges are asserted.",
    "Folder names alone never prove parentage.",
    "Current head bytes are distinct from Drive historical revision bytes.",
    "A .jpg/.jpeg candidate is not an automatic decision or proof that a source image was preserved.",
  ],
};
const captureDates = files
  .map((f) => f.capturado_em)
  .filter(Boolean)
  .sort();
summary.byte_capture_window = {
  inicio: captureDates[0],
  fim: captureDates.at(-1),
  fonte:
    "mtime dos sidecars de recebimento; autoria histórica e modificação no Drive permanecem separadas",
};
summary.unique_physical_hashes = new Set(
  files.filter((f) => f.estado === "validado").map((f) => f.sha256),
).size;
summary.photo_mapping_count_unit = "associações de campo da origem, não arquivos ou locais";
summary.source_image_paths = {
  originals: inventory.references.filter(
    (r) => r.tipo === "foto" && !r.caminho_original?.includes("/thumb/"),
  ).length,
  thumbnails: inventory.references.filter(
    (r) => r.tipo === "foto" && r.caminho_original?.includes("/thumb/"),
  ).length,
};
summary.photo_mapping_unique_paths = Object.fromEntries(
  [...new Set(photoMappings.map((m) => m.estado))].map((state) => [
    state,
    new Set(photoMappings.filter((m) => m.estado === state).map((m) => m.source_path)).size,
  ]),
);
summary.candidate_drive_photo_files = new Set(
  photoMappings.flatMap((m) => m.files.map((f) => f.id)),
).size;
await writeFile(path.join(root, "folder-edges.json"), JSON.stringify(edges, null, 2), {
  mode: 0o600,
});
await writeFile(path.join(root, "photo-mappings.json"), JSON.stringify(photoMappings, null, 2), {
  mode: 0o600,
});
await writeFile(
  path.join(root, "files-reconciliation.json"),
  JSON.stringify({ summary, files, folders: [...folders.values()] }, null, 2),
  { mode: 0o600 },
);
await writeFile(path.join(root, "files-summary.json"), JSON.stringify(summary, null, 2), {
  mode: 0o600,
});
console.log(JSON.stringify(summary));
