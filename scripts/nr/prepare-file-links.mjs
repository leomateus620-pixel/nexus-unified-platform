import { readFile, writeFile } from "node:fs/promises";
import path from "node:path";
import { SOURCE, digest } from "./inventory.mjs";
const [directory, org] = process.argv.slice(2);
if (!directory || !/^[a-f0-9-]{36}$/.test(org ?? ""))
  throw Error("Usage: prepare-file-links.mjs PRIVATE_DIRECTORY ORGANIZATION_UUID");
const read = async (name) => JSON.parse(await readFile(path.join(directory, name), "utf8"));
const files = (await read("file-destinations.json")).files,
  prepared = await read("storage-prepared.json"),
  maps = await read("mappings.json"),
  docs = await read("document-revisions.json");
const ids = new Map(maps.map((m) => [`${m.tipo}:${m.externo_id}`, m.destino_id])),
  rows = new Map(prepared.map((f) => [f.chave, f])),
  revisions = new Map(docs.map((d) => [d.id, d.revisao_atual_id]));
const q = (v) => `'${String(v).replaceAll("'", "''")}'`,
  j = (v) => `${q(JSON.stringify(v))}::jsonb`;
const statements = [],
  pending = [];
let links = 0,
  documentLinks = 0;
for (const file of files) {
  const target = rows.get(file.chave);
  if (!target) throw Error("File has no prepared target");
  for (const binding of file.bindings) {
    const dest = {};
    // Old staging plans may predate the photo rule: never fan a folder's photographs out to locals/documents.
    const folderOnlyPhoto =
      file.metadata.mime.startsWith("image/") &&
      (binding.vinculo_fotografico === "somente_pasta" ||
        binding.evidencia?.includes("→ Drive list_folder"));
    if (binding.local_externo && !folderOnlyPhoto) {
      const id = ids.get(`local:${binding.local_externo}`);
      if (!id) {
        pending.push({ source_id: file.source_id, binding, reason: "local dependency unresolved" });
        continue;
      }
      dest.local_id = id;
    }
    if (binding.pasta_externa) {
      const id = ids.get(`pasta_origem:${binding.pasta_externa}`);
      if (!id) {
        pending.push({
          source_id: file.source_id,
          binding,
          reason: "folder dependency unresolved",
        });
        continue;
      }
      dest.pasta_id = id;
    }
    if (binding.doc_externo && !folderOnlyPhoto) {
      const id = ids.get(`registro_documental:${binding.doc_externo}`),
        rev = revisions.get(id);
      if (!id || !rev) {
        pending.push({
          source_id: file.source_id,
          binding,
          reason: "document/revision dependency unresolved",
        });
        continue;
      }
      dest.documento_id = id;
      dest.revisao_id = rev;
      documentLinks++;
    }
    if (!Object.keys(dest).length) {
      pending.push({ source_id: file.source_id, binding, reason: "no explicit parent" });
      continue;
    }
    const evidence = {
      sistema: SOURCE,
      source_id: file.source_id,
      caminho_capturado: binding.evidencia,
      sha256: file.metadata.sha256,
      decisao: folderOnlyPhoto
        ? "Pertencimento à pasta; nenhum vínculo fotográfico com local/documento foi inferido."
        : "Relação explícita na origem, com UUIDs do de-para; não inferida por TAG ou nome",
    };
    const key = digest({ source_id: file.source_id, dest, evidence });
    statements.push(
      `select public.nr_arquivo_importar_vinculo(${q(org)}::uuid,${q(target.id)}::uuid,${q(key)},${j(dest)},${j(evidence)})as vinculo_id;`,
    );
    links++;
  }
}
const batches = [];
let current = "";
for (const s of statements) {
  if (current.length + s.length > 350000 && current) {
    batches.push(current);
    current = "";
  }
  current += s + "\n";
}
if (current) batches.push(current);
await writeFile(
  path.join(directory, "plans", "arquivos-vincular.json"),
  JSON.stringify({ count: links, document_links: documentLinks, pending, batches }),
  { mode: 0o600 },
);
console.log(
  JSON.stringify({
    links,
    document_links: documentLinks,
    pending: pending.length,
    batches: batches.length,
  }),
);
