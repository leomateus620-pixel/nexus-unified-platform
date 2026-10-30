#!/usr/bin/env node
/** Packs verified originals for an authorized private Storage transfer. Never contacts a network. */
import { createHash, randomUUID } from "node:crypto";
import { createReadStream } from "node:fs";
import { closeSync, fsyncSync, openSync, writeSync } from "node:fs";
import { mkdir, readFile, realpath, rename, rm, stat, writeFile } from "node:fs/promises";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { Zip, ZipPassThrough } from "fflate";

const MIB = 1024 * 1024;
const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
const MIME_EXT = {
  "application/pdf": "pdf",
  "image/jpeg": "jpg",
  "image/png": "png",
  "image/webp": "webp",
  "application/vnd.openxmlformats-officedocument.wordprocessingml.document": "docx",
  "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet": "xlsx",
};
const README = `NEXUS — PRIVATE STORAGE TRANSFER PACKAGE

This archive was authored by the Nexus migration packer. It contains preserved original bytes and an explicit manifest.json. It contains no credentials and requires no code from the source application to run.

1. Use manifest.json, never filenames or TAG similarity, to identify each existing Nexus file ID and authorized private Storage target.
2. Verify the archive SHA-256 against the private package-index.json delivered with this archive. For each objects/* entry, verify its exact byte size, MIME and SHA-256 against the manifest before transfer.
3. Use the authorized Nexus/Supabase Storage API to upload unchanged bytes only to each declared bucket and caminho. Keep the bucket private. Do not treat an HTTP preview, link, login page or metadata row as a completed file transfer.
4. One byte object can have multiple explicitly prepared targets. Upload that same byte object only to the listed targets; do not infer additional associations or permissions.
5. Confirm each existing nr_arquivos row through the authorized Nexus verification pipeline. A packaged or uploaded object is not a confirmed, emitted, approved or signed document.
6. Resume using package_id, part and each file ID/chave. Record an explicit terminal result per target; retries must not create a second logical record. Do not overwrite an existing object whose bytes differ.
7. Originals, immutable revisions and the source identities remain preserved. No source executable is included or required. Historical Google Drive versions marked unavailable because keepForever=false remain pending; this archive makes no claim to contain those versions.

The package manifest and storage paths are private migration records. Do not publish this archive, the private indexes, customer files or temporary download URLs in Git or chat.
`;
const sha = (value) => createHash("sha256").update(value).digest("hex");
const json = (value) => Buffer.from(JSON.stringify(value, null, 2) + "\n");
const inside = (parent, child) => child === parent || child.startsWith(parent + path.sep);
async function digestFile(filename) {
  const hash = createHash("sha256");
  let bytes = 0;
  for await (const chunk of createReadStream(filename)) {
    hash.update(chunk);
    bytes += chunk.length;
  }
  return { sha256: hash.digest("hex"), bytes };
}
async function canonicalOutputPath(filename) {
  const suffix = [];
  let existing = filename;
  while (true) {
    try {
      return path.join(await realpath(existing), ...suffix);
    } catch (error) {
      if (error.code !== "ENOENT") throw error;
      const parent = path.dirname(existing);
      if (parent === existing) throw error;
      suffix.unshift(path.basename(existing));
      existing = parent;
    }
  }
}
function parseArgs(argv) {
  const args = {};
  for (let i = 0; i < argv.length; i++) {
    const key = argv[i];
    if (key === "--help") {
      args.help = true;
      continue;
    }
    if (!key?.startsWith("--") || !argv[i + 1] || argv[i + 1].startsWith("--"))
      throw new Error(`Invalid option: ${key}`);
    args[key.slice(2)] = argv[++i];
  }
  return args;
}
function rows(value) {
  if (Array.isArray(value)) return value;
  for (const key of ["rows", "files", "prepared"])
    if (Array.isArray(value?.[key])) return value[key];
  throw new Error("Prepared input must contain an array of nr_arquivos rows.");
}
function preparedRow(value) {
  return value?.arquivo ?? value?.row ?? value;
}
function safePath(value) {
  return (
    typeof value === "string" &&
    value.length > 0 &&
    value.length <= 1500 &&
    !value.startsWith("/") &&
    !value.includes("\\") &&
    !value.split("/").some((part) => !part || part === "." || part === "..") &&
    /^[a-z0-9_./-]+$/i.test(value)
  );
}
function extension(name, mime) {
  const ext = String(name ?? "")
    .split(".")
    .pop()
    ?.toLowerCase();
  if (
    ext &&
    /^[a-z0-9]{2,8}$/.test(ext) &&
    ["pdf", "jpg", "jpeg", "png", "webp", "docx", "xlsx"].includes(ext)
  )
    return ext;
  if (MIME_EXT[mime]) return MIME_EXT[mime];
  throw new Error("Original extension/MIME is not supported by the private acervo.");
}
function manifestFor(packageId, part, objects, historical) {
  return {
    format: "nexus-private-storage-part/1",
    package_id: packageId,
    part: String(part).padStart(4, "0"),
    compression: "stored-original-bytes",
    objects: objects.map(({ entry, mime, tamanho, sha256 }) => ({ entry, mime, tamanho, sha256 })),
    files: objects.flatMap((object) =>
      object.targets.map((target) => ({
        ...target,
        entry: object.entry,
        mime: object.mime,
        tamanho: object.tamanho,
        sha256: object.sha256,
        resultado: "bytes_verificados_para_transferencia",
      })),
    ),
    historical_versions: historical,
  };
}
function zipEstimate(packageId, part, objects, historical) {
  const manifest = json(manifestFor(packageId, part, objects, historical));
  const entries = [
    { name: "manifest.json", bytes: manifest.length },
    { name: "README.txt", bytes: Buffer.byteLength(README) },
    ...objects.map((object) => ({ name: object.entry, bytes: object.tamanho })),
  ];
  return (
    22 +
    entries.reduce((sum, entry) => sum + entry.bytes + 92 + 2 * Buffer.byteLength(entry.name), 0)
  );
}
function partition(packageId, objects, limit, historical) {
  const parts = [];
  let current = [];
  for (const object of objects) {
    if (
      current.length &&
      zipEstimate(packageId, parts.length + 1, [...current, object], historical) + 4096 > limit
    ) {
      parts.push(current);
      current = [];
    }
    current.push(object);
    if (
      current.length === 1 &&
      zipEstimate(packageId, parts.length + 1, current, historical) + 4096 > limit
    ) {
      parts.push(current);
      current = [];
    }
  }
  if (current.length) parts.push(current);
  return parts;
}
async function atomicJson(filename, value) {
  const temp = filename + ".tmp-" + randomUUID();
  await writeFile(temp, json(value), { mode: 0o600 });
  await rename(temp, filename);
}
async function writePart(filename, manifest, objects) {
  const temporary = filename + ".tmp-" + randomUUID();
  let fd = openSync(temporary, "wx", 0o600);
  let finalSeen = false;
  let zipError;
  const zip = new Zip((error, chunk, final) => {
    if (error) {
      zipError = error;
      return;
    }
    let offset = 0;
    while (offset < chunk.length) {
      const written = writeSync(fd, chunk, offset, chunk.length - offset);
      if (written <= 0) throw new Error("ZIP write did not advance.");
      offset += written;
    }
    if (final) finalSeen = true;
  });
  const entry = (name) => {
    const stream = new ZipPassThrough(name);
    stream.mtime = new Date("2000-01-01T00:00:00.000Z");
    zip.add(stream);
    return stream;
  };
  try {
    entry("manifest.json").push(json(manifest), true);
    entry("README.txt").push(Buffer.from(README), true);
    for (const object of objects) {
      const stream = entry(object.entry);
      const hash = createHash("sha256");
      let bytes = 0;
      for await (const chunk of createReadStream(object.localPath)) {
        hash.update(chunk);
        bytes += chunk.length;
        stream.push(chunk, false);
        if (zipError) throw zipError;
      }
      if (bytes !== object.tamanho || hash.digest("hex") !== object.sha256)
        throw new Error(`Original changed during packaging: ${object.entry}`);
      stream.push(new Uint8Array(), true);
    }
    zip.end();
    if (zipError) throw zipError;
    if (!finalSeen) throw new Error("ZIP did not finalize.");
    fsyncSync(fd);
    closeSync(fd);
    fd = undefined;
    const result = await digestFile(temporary);
    await rename(temporary, filename);
    return result;
  } catch (error) {
    try {
      zip.terminate();
    } catch {}
    if (fd !== undefined) closeSync(fd);
    await rm(temporary, { force: true });
    throw error;
  }
}
export async function packageStorage(options) {
  const repoRoot = await realpath(
    path.resolve(path.dirname(fileURLToPath(import.meta.url)), "../.."),
  );
  if (!options.privateDir || !path.isAbsolute(options.privateDir))
    throw new Error("--private-dir must be an absolute private directory outside the repository.");
  const privateRoot = await realpath(options.privateDir);
  if (inside(repoRoot, privateRoot))
    throw new Error("Customer inputs must remain outside the repository.");
  const preparedPath = path.resolve(
    options.prepared ?? path.join(privateRoot, "storage-prepared.json"),
  );
  const destinationsPath = path.resolve(
    options.destinations ?? path.join(privateRoot, "file-destinations.json"),
  );
  for (const input of [preparedPath, destinationsPath])
    if (!inside(privateRoot, await realpath(input)))
      throw new Error("Input manifests must belong to the private migration directory.");
  const output = await canonicalOutputPath(
    path.resolve(options.output ?? path.join(privateRoot, "storage-packages")),
  );
  if (inside(repoRoot, output) || !inside(privateRoot, output))
    throw new Error("Package output must remain private and outside Git.");
  await mkdir(output, { recursive: true, mode: 0o700 });
  const actualOutput = await realpath(output);
  if (inside(repoRoot, actualOutput) || !inside(privateRoot, actualOutput))
    throw new Error(
      "Package output must remain inside the private migration directory and outside Git.",
    );
  const limit = options.partMaxBytes === undefined ? 20 * MIB : Number(options.partMaxBytes);
  if (!Number.isSafeInteger(limit) || limit < 64 * 1024 || limit > 20 * MIB)
    throw new Error("Part limit must be between 64 KiB and 20 MiB.");
  const preparedBytes = await readFile(preparedPath),
    destinationBytes = await readFile(destinationsPath);
  const prepared = rows(JSON.parse(preparedBytes)).map(preparedRow);
  const destinations = JSON.parse(destinationBytes).files;
  if (!Array.isArray(destinations)) throw new Error("Destinations input must contain files[].");
  const byKey = new Map();
  for (const row of prepared) {
    if (!row || typeof row !== "object" || !UUID.test(row.chave ?? ""))
      throw new Error("Prepared row is missing a stable UUID chave.");
    if (byKey.has(row.chave) && JSON.stringify(byKey.get(row.chave)) !== JSON.stringify(row))
      throw new Error("Conflicting prepared rows share the same chave.");
    byKey.set(row.chave, row);
  }
  let historical = {
    included: false,
    identified: null,
    binary_downloads: null,
    blocked_by_retention: null,
    result: "nao_incluido_neste_pacote",
    note: "Only prepared head originals explicitly listed here are included. Missing historical versions are not reconstructed.",
  };
  try {
    const summaryPath = await realpath(path.join(privateRoot, "revisions-summary.json"));
    if (!inside(privateRoot, summaryPath))
      throw new Error("Historical summary must remain private.");
    const bytes = await readFile(summaryPath);
    const summary = JSON.parse(bytes);
    historical = {
      ...historical,
      identified: Number.isInteger(summary.historical_revisions)
        ? summary.historical_revisions
        : null,
      binary_downloads: Number.isInteger(summary.historical_binary_downloads)
        ? summary.historical_binary_downloads
        : null,
      blocked_by_retention: Number.isInteger(summary.states?.bloqueado_api_retencao)
        ? summary.states.bloqueado_api_retencao
        : null,
      result:
        summary.states?.bloqueado_api_retencao > 0
          ? "pendente_api_retencao_keepForever_false"
          : "nao_incluido_neste_pacote",
      source_summary_sha256: sha(bytes),
    };
  } catch (error) {
    if (error.code !== "ENOENT") throw error;
  }
  const records = [],
    targetPaths = new Map(),
    usedPrepared = new Set();
  for (const source of destinations) {
    const reference = {
      source_id: String(source.source_id ?? ""),
      chave: String(source.chave ?? ""),
    };
    try {
      const row = byKey.get(source.chave);
      if (!row) {
        records.push({
          ...reference,
          resultado: "sem_preparacao",
          motivo: "No authorized prepared nr_arquivos row matches this chave.",
        });
        continue;
      }
      usedPrepared.add(row.chave);
      const metadata = source.metadata ?? {};
      if (!UUID.test(row.id ?? "") || !safePath(row.caminho) || !UUID.test(row.chave ?? ""))
        throw new Error("Prepared ID/key/storage path is invalid.");
      if (
        !Number.isSafeInteger(row.tamanho) ||
        row.tamanho <= 0 ||
        row.tamanho >= 50 * MIB ||
        !/^[a-f0-9]{64}$/.test(row.sha256 ?? "")
      )
        throw new Error("Prepared original exceeds the supported size or lacks an integrity hash.");
      if (
        row.mime !== metadata.mime ||
        row.tamanho !== metadata.tamanho ||
        row.sha256 !== metadata.sha256
      )
        throw new Error("Prepared metadata differs from the source validation manifest.");
      if (typeof source.local_path !== "string" || !path.isAbsolute(source.local_path))
        throw new Error("Original path must be absolute.");
      const original = await realpath(source.local_path);
      if (!inside(privateRoot, original))
        throw new Error("Original is outside the private migration directory.");
      const info = await stat(original);
      if (!info.isFile()) throw new Error("Original is not a regular file.");
      const measured = await digestFile(original);
      if (measured.bytes !== row.tamanho || measured.sha256 !== row.sha256)
        throw new Error("Actual original bytes differ from the prepared hash or size.");
      const bucket = row.bucket_id ?? row.bucket ?? "nexus-nr-acervo";
      if (bucket !== "nexus-nr-acervo")
        throw new Error("Prepared target is not the private NR acervo bucket.");
      const identity = bucket + "/" + row.caminho;
      const previous = targetPaths.get(identity);
      if (previous) {
        if (
          previous.id !== row.id ||
          previous.sha256 !== row.sha256 ||
          previous.mime !== row.mime ||
          previous.tamanho !== row.tamanho
        )
          throw new Error("Conflicting identities or bytes target the same physical Storage path.");
        previous.source_ids = [...new Set([...previous.source_ids, reference.source_id])].sort();
        records.push({
          ...reference,
          arquivo_id: row.id,
          caminho: row.caminho,
          resultado: "duplicado_fisico_legitimo",
          target_identity: identity,
        });
        continue;
      }
      const target = {
        arquivo_id: row.id,
        chave: row.chave,
        bucket,
        caminho: row.caminho,
        nome_original: row.nome ?? metadata.nome,
        source_ids: [reference.source_id],
      };
      targetPaths.set(identity, {
        ...target,
        id: row.id,
        mime: row.mime,
        tamanho: row.tamanho,
        sha256: row.sha256,
        localPath: original,
        extension: extension(row.nome ?? metadata.nome, row.mime),
      });
      records.push({
        ...reference,
        arquivo_id: row.id,
        caminho: row.caminho,
        resultado: "validado",
        target_identity: identity,
      });
    } catch (error) {
      records.push({ ...reference, resultado: "erro", motivo: error.message });
    }
  }
  const grouped = new Map();
  for (const target of [...targetPaths.values()].sort((a, b) => a.id.localeCompare(b.id))) {
    const key = target.sha256 + ":" + target.tamanho;
    const targetRecord = {
      arquivo_id: target.id,
      chave: target.chave,
      bucket: target.bucket,
      caminho: target.caminho,
      nome_original: target.nome_original,
      source_ids: target.source_ids,
    };
    const existing = grouped.get(key);
    if (existing) {
      if (existing.mime !== target.mime)
        throw new Error(
          "Equal byte hashes declare different MIME types; reconcile before shipping.",
        );
      existing.targets.push(targetRecord);
    } else
      grouped.set(key, {
        entry: `objects/${target.id}.${target.extension}`,
        mime: target.mime,
        tamanho: target.tamanho,
        sha256: target.sha256,
        localPath: target.localPath,
        targets: [targetRecord],
      });
  }
  const objects = [...grouped.values()].sort((a, b) => a.entry.localeCompare(b.entry));
  const fingerprint = sha(
    json({
      format: 1,
      part_max_bytes: limit,
      prepared_sha256: sha(preparedBytes),
      destinations_sha256: sha(destinationBytes),
      historical_versions: historical,
      objects: objects.map(({ localPath, ...object }) => object),
    }),
  );
  const packageId = fingerprint.slice(0, 24);
  const plan = partition(packageId, objects, limit, historical);
  const results = [];
  for (let i = 0; i < plan.length; i++) {
    const part = String(i + 1).padStart(4, "0"),
      partObjects = plan[i],
      manifest = manifestFor(packageId, i + 1, partObjects, historical),
      manifestHash = sha(json(manifest));
    const name = `nexus-nr-storage-${packageId}-part-${part}.zip`,
      filename = path.join(output, name),
      sidecar = filename + ".json";
    try {
      let result;
      let reused = false;
      try {
        const old = JSON.parse(await readFile(sidecar, "utf8"));
        if (old.manifest_sha256 === manifestHash) {
          const current = await digestFile(filename);
          if (current.sha256 === old.sha256 && current.bytes === old.bytes) {
            result = current;
            reused = true;
          }
        }
      } catch {}
      if (!result) result = await writePart(filename, manifest, partObjects);
      const oversized = result.bytes > limit;
      if (oversized && partObjects.length !== 1) {
        await rm(filename, { force: true });
        throw new Error("Part exceeds the transport limit with multiple byte objects.");
      }
      const entry = {
        part,
        archive: name,
        sha256: result.sha256,
        bytes: result.bytes,
        manifest_sha256: manifestHash,
        unique_byte_objects: partObjects.length,
        target_paths: manifest.files.length,
        oversized_single_original: oversized,
        resultado: "empacotado",
        reused,
      };
      await atomicJson(sidecar, entry);
      results.push(entry);
      for (const record of records) {
        if (
          record.target_identity &&
          manifest.files.some((file) => file.bucket + "/" + file.caminho === record.target_identity)
        ) {
          record.resultado =
            record.resultado === "duplicado_fisico_legitimo"
              ? "duplicado_fisico_empacotado"
              : "empacotado";
          record.part = part;
          record.archive = name;
        }
      }
    } catch (error) {
      results.push({ part, archive: name, resultado: "erro", motivo: error.message });
      for (const record of records)
        if (
          partObjects.some((object) =>
            object.targets.some(
              (target) => target.bucket + "/" + target.caminho === record.target_identity,
            ),
          )
        )
          Object.assign(record, { resultado: "erro", motivo: error.message, part });
    }
    await atomicJson(path.join(output, "checkpoint.json"), {
      format: "nexus-storage-package-checkpoint/1",
      package_id: packageId,
      fingerprint,
      parts: results,
      records,
    });
  }
  const unusedPrepared = prepared
    .filter((row) => !usedPrepared.has(row.chave))
    .map((row) => ({
      arquivo_id: row.id,
      chave: row.chave,
      resultado: "sem_correspondencia",
      motivo: "Prepared row has no source destination entry.",
    }));
  const complete =
    records.every((row) => ["empacotado", "duplicado_fisico_empacotado"].includes(row.resultado)) &&
    unusedPrepared.length === 0 &&
    results.every((row) => row.resultado === "empacotado");
  const report = {
    format: "nexus-private-storage-package/1",
    package_id: packageId,
    fingerprint,
    generated_at: new Date().toISOString(),
    part_max_bytes: limit,
    prepared_sha256: sha(preparedBytes),
    destinations_sha256: sha(destinationBytes),
    complete,
    summary: {
      source_rows: destinations.length,
      prepared_rows: prepared.length,
      unique_target_paths: targetPaths.size,
      unique_byte_objects: objects.length,
      unique_original_bytes: objects.reduce((sum, row) => sum + row.tamanho, 0),
      target_original_bytes: [...targetPaths.values()].reduce((sum, row) => sum + row.tamanho, 0),
      archives: results.length,
      archive_bytes: results.reduce((sum, row) => sum + (row.bytes ?? 0), 0),
      errors: records.filter((row) => row.resultado === "erro").length,
      unprepared: records.filter((row) => row.resultado === "sem_preparacao").length,
      unmatched_prepared: unusedPrepared.length,
    },
    parts: results,
    records,
    unmatched_prepared: unusedPrepared,
    historical_versions: historical,
  };
  await atomicJson(path.join(output, "package-index.json"), report);
  await writeFile(path.join(output, "README.txt"), README, { mode: 0o600 });
  return report;
}
if (process.argv[1] && path.resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  try {
    const args = parseArgs(process.argv.slice(2));
    if (args.help) {
      process.stdout.write(
        "node scripts/nr/package-storage.mjs --private-dir ABS_PRIVATE_DIR [--prepared FILE] [--destinations FILE] [--output PRIVATE_DIR] [--part-max-bytes 20971520]\n",
      );
    } else {
      const report = await packageStorage({
        privateDir: args["private-dir"],
        prepared: args.prepared,
        destinations: args.destinations,
        output: args.output,
        partMaxBytes: args["part-max-bytes"],
      });
      process.stdout.write(
        JSON.stringify({
          package_id: report.package_id,
          complete: report.complete,
          ...report.summary,
        }) + "\n",
      );
      if (!report.complete) process.exitCode = 1;
    }
  } catch (error) {
    process.stderr.write(`Private Storage packaging failed: ${error.message}\n`);
    process.exitCode = 1;
  }
}
