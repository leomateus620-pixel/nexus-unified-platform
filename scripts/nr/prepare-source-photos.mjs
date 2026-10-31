/** Prepare recovered source photographs/thumbnail bytes using observed references and the existing de-para.
 * Originals and thumbnails remain distinct. Files, manifests and SQL stay outside Git.
 * This planner never uploads, confirms Storage or changes an existing occurrence.
 */
import { readFile, readdir, realpath, mkdir, writeFile } from "node:fs/promises";
import { createReadStream } from "node:fs";
import { createHash } from "node:crypto";
import { spawnSync } from "node:child_process";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { digest, SOURCE } from "./inventory.mjs";

const [directory, org, mode = "thumbnails"] = process.argv.slice(2);
if (
  !directory ||
  !/^[a-f0-9-]{36}$/.test(org || "") ||
  !["thumbnails", "originals", "all"].includes(mode)
)
  throw Error(
    "Usage: prepare-source-photos.mjs PRIVATE_STAGING ORGANIZATION_UUID [thumbnails|originals|all]",
  );
const root = await realpath(directory),
  repo = await realpath(path.resolve(path.dirname(fileURLToPath(import.meta.url)), "../.."));
const inside = (value) => value.startsWith(root + path.sep);
if (root === repo || root.startsWith(repo + path.sep))
  throw Error("Photo staging must remain outside Git");
const read = async (name) => JSON.parse(await readFile(path.join(root, name), "utf8"));
const db = await read("source-db.json"),
  inventory = await read("photo-recovery-inventory.json"),
  mappings = await read("mappings.json");
if (inventory.source !== SOURCE || !/^[a-f0-9]{64}$/.test(inventory.snapshot_sha256))
  throw Error("Unknown source inventory");
if (
  createHash("sha256")
    .update(await readFile(path.join(root, "source-db.json")))
    .digest("hex") !== inventory.snapshot_sha256
)
  throw Error("Source snapshot differs from the inventoried bytes");
const ids = new Map(mappings.map((row) => [`${row.tipo}:${row.externo_id}`, row.destino_id]));
const units = new Map(
  db.clientes.flatMap((client) =>
    client.unidades.map((unit) => [
      unit.id,
      { cliente: ids.get(`cliente:${client.id}`), unidade: ids.get(`unidade:${unit.id}`) },
    ]),
  ),
);
const byAsset = new Map(inventory.assets.map((row) => [row.id, row]));
let confirmed = [];
try {
  confirmed = (await read("source-photo-recovery/confirmed-files.json")).files;
} catch (error) {
  if (error.code !== "ENOENT") throw error;
}
if (!Array.isArray(confirmed)) throw Error("Invalid private confirmation ledger");
const archiveHashes = new Map(),
  found = new Map(),
  skipped = [];
const configs = [
  {
    kind: "thumbnail",
    folder: "source-thumbnails",
    reference: "thumbnail_reference",
    type: "miniatura_origem",
    slot: "miniatura_arquivo_id",
  },
  {
    kind: "original",
    folder: "source-originals",
    reference: "original_reference",
    type: "original_origem",
    slot: "arquivo_id",
  },
].filter((config) => mode === "all" || (mode === "originals") === (config.kind === "original"));
async function archiveProof(observation, source) {
  const proof = [
    "Perplexity owner project ZIP exact entry",
    "Authorized project export ZIP exact entry",
  ].includes(observation.method)
    ? observation
    : observation.additional_archive_proof;
  if (!proof) return null;
  const entry = proof.project_path ?? proof.archive_entry;
  if (
    !/^[a-f0-9]{64}$/.test(proof.archive_sha256 || "") ||
    typeof entry !== "string" ||
    !(entry === source || entry === `public/${source}` || entry.endsWith(`/public/${source}`))
  )
    throw Error("Archive proof does not identify the exact source entry");
  let archive;
  try {
    archive = await realpath(path.resolve(root, proof.archive_file));
  } catch (error) {
    if (error.code !== "ENOENT" || path.basename(proof.archive_file) !== proof.archive_file)
      throw error;
    archive = await realpath(path.join(root, "owner-artifacts", proof.archive_file));
  }
  if (!inside(archive)) throw Error("Archive escaped private staging");
  if (!archiveHashes.has(archive)) {
    const hash = createHash("sha256");
    for await (const chunk of createReadStream(archive)) hash.update(chunk);
    archiveHashes.set(archive, hash.digest("hex"));
  }
  if (archiveHashes.get(archive) !== proof.archive_sha256)
    throw Error("Owner archive changed after acquisition");
  return { archive, entry, sha256: proof.archive_sha256 };
}
const python =
  "import sys,json,hashlib,zipfile,warnings;from pathlib import Path;from PIL import Image;Image.MAX_IMAGE_PIXELS=24000000;warnings.simplefilter('error',Image.DecompressionBombWarning);p=sys.argv[1];data=Path(p).read_bytes();\nif len(sys.argv)>3:\n with zipfile.ZipFile(sys.argv[2]) as z:\n  entry=z.read(sys.argv[3]);assert entry==data,'Exact archive entry differs from downloaded image'\nim=Image.open(p);fmt=im.format;im.verify();im=Image.open(p);im.load();print(json.dumps({'mime':Image.MIME[fmt],'largura':im.width,'altura':im.height}))";
for (const config of configs) {
  let observations;
  try {
    observations = await read(`${config.folder}/observations.json`);
  } catch (error) {
    if (mode === "all" && error.code === "ENOENT") continue;
    throw error;
  }
  if (!Array.isArray(observations.records)) throw Error("Native image observations are required");
  const observedByFile = new Map(observations.records.map((record) => [record.file, record]));
  const inputDir = path.join(root, config.folder);
  for (const filename of (await readdir(inputDir)).sort()) {
    if (!/\.jpe?g$/i.test(filename)) continue;
    if (!filename.includes("__")) {
      skipped.push({ filename, reason: "No unambiguous full source reference" });
      continue;
    }
    const observation = observedByFile.get(filename);
    const nativeImage = observation?.method === "Chrome Save image as observed img.src";
    const ownerFile = /^Perplexity owner project file download in Chrome /.test(
      observation?.method || "",
    );
    const ownerArchive = [
      "Perplexity owner project ZIP exact entry",
      "Authorized project export ZIP exact entry",
    ].includes(observation?.method);
    if (
      !observation ||
      !observation.observation_basis ||
      !(ownerFile || ownerArchive || (config.kind === "thumbnail" && nativeImage))
    )
      throw Error(
        "A native rendered-image observation or owner-source file proof is required for each download",
      );
    const source = observation.source_reference;
    if (source !== "fotos/" + filename.replaceAll("__", "/"))
      throw Error("Downloaded filename differs from its observed source reference");
    if (!inventory.assets.some((asset) => asset[config.reference] === source))
      throw Error("Downloaded image is absent from the preserved inventory");
    if (
      ownerFile &&
      (typeof observation.project_path !== "string" ||
        !observation.project_path.endsWith(`/public/${source}`))
    )
      throw Error("Owner file breadcrumb does not identify the exact source reference");
    const archive = await archiveProof(observation, source);
    const file = await realpath(path.join(inputDir, filename));
    if (!inside(file)) throw Error("Image escaped private staging");
    const bytes = await readFile(file),
      hash = createHash("sha256").update(bytes).digest("hex");
    const probe = spawnSync(
      process.env.NEXUS_IMAGE_PYTHON || "python3",
      ["-c", python, file, ...(archive ? [archive.archive, archive.entry] : [])],
      { encoding: "utf8", maxBuffer: 10000 },
    );
    if (probe.status !== 0)
      throw Error(
        "Recovered image could not be fully decoded or matched to its exact archive entry",
      );
    const image = JSON.parse(probe.stdout);
    if (
      image.mime !== "image/jpeg" ||
      image.largura < 1 ||
      image.altura < 1 ||
      bytes.length > 52428800
    )
      throw Error("Unexpected source-image bytes");
    if (
      observation.sha256 !== hash ||
      observation.size !== bytes.length ||
      observation.natural_width !== image.largura ||
      observation.natural_height !== image.altura ||
      Number.isNaN(Date.parse(observation.captured_at))
    )
      throw Error("Native observation differs from the decoded downloaded bytes");
    const occurrences = inventory.occurrences.filter(
      (occurrence) => byAsset.get(occurrence.asset_id)?.[config.reference] === source,
    );
    for (const occurrence of occurrences) {
      if (
        occurrence.id !==
        digest({
          source: SOURCE,
          snapshot: inventory.snapshot_sha256,
          pointer: occurrence.source_pointer,
        })
      )
        throw Error("Unstable source occurrence identity");
      const pointer = /^\/locais\/(\d+)\/fotos\/(\d+)$/.exec(occurrence.source_pointer),
        sourceLocal = pointer ? db.locais[Number(pointer[1])] : null;
      const sourcePhoto = sourceLocal?.fotos?.[Number(pointer?.[2])],
        asset = byAsset.get(occurrence.asset_id);
      if (
        !sourcePhoto ||
        sourceLocal.id !== occurrence.source_local_id ||
        sourceLocal.unidade_id !== occurrence.source_unit_id ||
        sourcePhoto.miniatura !== asset.thumbnail_reference ||
        (sourcePhoto.arquivo || sourcePhoto.caminho || sourcePhoto.path) !==
          asset.original_reference
      )
        throw Error("Occurrence no longer matches the immutable source snapshot");
      const context = units.get(occurrence.source_unit_id),
        localId = ids.get(`local:${occurrence.source_unit_id}/${occurrence.source_local_id}`);
      if (
        !context?.cliente ||
        !context.unidade ||
        context.unidade !== occurrence.unidade_id ||
        localId !== occurrence.local_id
      )
        throw Error("Canonical mapping conflict");
      const prior = confirmed.find(
        (row) => row.source_reference === source && row.unidade_id === context.unidade,
      );
      if (
        prior &&
        (prior.sha256 !== hash || prior.mime !== image.mime || prior.tamanho !== bytes.length)
      )
        throw Error(
          "Source bytes conflict with a previously confirmed Nexus file; explicit reconciliation required",
        );
      const key = `${context.unidade}:${source}`;
      if (!found.has(key)) {
        const uuid = createHash("sha256")
          .update(`${org}|${context.unidade}|${SOURCE}|${source}|${hash}`)
          .digest()
          .subarray(0, 16);
        uuid[6] = (uuid[6] & 15) | 80;
        uuid[8] = (uuid[8] & 63) | 128;
        const hex = uuid.toString("hex"),
          chave = `${hex.slice(0, 8)}-${hex.slice(8, 12)}-${hex.slice(12, 16)}-${hex.slice(16, 20)}-${hex.slice(20)}`;
        const normas = [
          ...new Set(
            occurrences
              .filter((row) => row.source_unit_id === occurrence.source_unit_id)
              .map((row) =>
                db.locais.find(
                  (local) =>
                    local.unidade_id === row.source_unit_id && local.id === row.source_local_id,
                )?.tipo === "ALTURA"
                  ? "NR35"
                  : "NR33",
              ),
          ),
        ];
        found.set(key, {
          kind: config.kind,
          slot: config.slot,
          source_id: source,
          source_unit: occurrence.source_unit_id,
          chave,
          local_path: file,
          metadata: {
            cliente_id: context.cliente,
            unidade_id: context.unidade,
            normas,
            nome:
              config.kind === "thumbnail"
                ? `Miniatura de origem — ${path.basename(source)}`
                : path.basename(source),
            mime: image.mime,
            tamanho: bytes.length,
            sha256: hash,
            papel: config.kind === "thumbnail" ? "representacao" : "foto",
            origem_metadata: {
              sistema: SOURCE,
              tipo: config.type,
              referencia_source: source,
              source_snapshot_sha256: inventory.snapshot_sha256,
              largura: image.largura,
              altura: image.altura,
              ...(config.kind === "thumbnail"
                ? { original_recuperado: false }
                : { binario_verificado_localmente: true }),
            },
          },
          acquisition: {
            method: observation.method,
            source_reference: source,
            captured_at: observation.captured_at,
            observation_basis: observation.observation_basis,
            ...(archive ? { archive_sha256: archive.sha256, archive_entry: archive.entry } : {}),
          },
          occurrences: [],
        });
      }
      found.get(key).occurrences.push({
        local_id: localId,
        origem: SOURCE,
        ocorrencia_origem: occurrence.id,
        referencia_original: asset.original_reference,
        referencia_miniatura: asset.thumbnail_reference,
        ordem: occurrence.ordem,
        campo: "fotos",
        arquivo_id: null,
        miniatura_proveniencia: "origem",
        legenda_origem: occurrence.legenda,
        categoria_origem: occurrence.categoria,
        data_origem: occurrence.data,
        autoria_historica: occurrence.autoria,
        evidencia: {
          metodo: occurrence.evidencia,
          source_pointer: occurrence.source_pointer,
          snapshot_sha256: inventory.snapshot_sha256,
          arquivo_sha256: hash,
          tipo_ativo: config.kind,
          aquisicao: {
            metodo: observation.method,
            referencia_observada: source,
            largura_observada: observation.natural_width,
            altura_observada: observation.natural_height,
            capturado_em: observation.captured_at,
            evidencia_observacao: observation.observation_basis,
            ...(archive ? { archive_sha256: archive.sha256, archive_entry: archive.entry } : {}),
          },
          recuperacao:
            "Binário da origem validado localmente; disponibilidade na Nexus depende de upload e GET verificados",
        },
      });
    }
  }
}
const q = (value) => `'${String(value).replaceAll("'", "''")}'`,
  files = [...found.values()];
const output = path.join(
  root,
  mode === "thumbnails"
    ? "source-photo-recovery"
    : mode === "originals"
      ? "source-original-recovery"
      : "source-photo-recovery-all",
);
await mkdir(output, { recursive: true, mode: 0o700 });
await writeFile(
  path.join(output, "destinations.json"),
  JSON.stringify(
    {
      format: "nexus-source-photo-files/2",
      source: SOURCE,
      snapshot_sha256: inventory.snapshot_sha256,
      mode,
      files,
      skipped,
    },
    null,
    2,
  ),
  { mode: 0o600 },
);
const batches = [];
for (let index = 0; index < files.length; index += 40) {
  const group = files.slice(index, index + 40);
  batches.push(
    `select jsonb_agg(arquivo) as arquivos from (${group.map((file, i) => `${i ? "union all " : ""}select public.nr_arquivo_importar_preparar(${q(org)}::uuid,${q(file.chave)}::uuid,${q(JSON.stringify(file.metadata))}::jsonb) as arquivo`).join("\n")}) prepared;`,
  );
}
await writeFile(
  path.join(output, "prepare.json"),
  JSON.stringify({ count: files.length, batches }, null, 2),
  { mode: 0o600 },
);
await writeFile(
  path.join(output, "prepare.sql"),
  batches.join("\n") || "select '[]'::jsonb as arquivos;",
  { mode: 0o600 },
);
console.log(
  JSON.stringify({
    verified_downloads: files.length,
    originals_locally_verified: files.filter((file) => file.kind === "original").length,
    thumbnails_locally_verified: files.filter((file) => file.kind === "thumbnail").length,
    unique_binary_hashes: new Set(files.map((file) => file.metadata.sha256)).size,
    source_occurrences: new Set(
      files.flatMap((file) => file.occurrences.map((occurrence) => occurrence.ocorrencia_origem)),
    ).size,
    skipped: skipped.length,
    storage_confirmation: false,
    bytes: files.reduce((n, file) => n + file.metadata.tamanho, 0),
  }),
);
