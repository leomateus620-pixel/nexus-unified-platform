#!/usr/bin/env node
/** Converts preserved DOCX bytes locally; writes only private derivatives, never contacts a DB. */
import { createHash, randomUUID } from "node:crypto";
import { mkdir, readFile, realpath, rename, stat, writeFile } from "node:fs/promises";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { converterDocxNr, NR_DOCX_CONVERSAO_VERSAO } from "../../src/features/nr/documents";
import { conteudoNrSchema } from "../../src/features/nr/schemas";
import { validarBinarioNr, NR_ARQUIVO_MIMES } from "../../src/features/nr/files";

const inside = (parent: string, child: string) =>
  child === parent || child.startsWith(parent + path.sep);
const sha = (bytes: Uint8Array) => createHash("sha256").update(bytes).digest("hex");
const UUID = /^[a-f0-9]{8}-[a-f0-9]{4}-[a-f0-9]{4}-[a-f0-9]{4}-[a-f0-9]{12}$/i;
const EXT: Record<string, string> = {
  "image/jpeg": "jpg",
  "image/png": "png",
  "image/webp": "webp",
};
type Binding = {
  arquivo_id: string;
  source_id: string;
  source_unit: string;
  cliente_id: string;
  unidade_id: string;
  sha256: string;
  local_path: string;
  nome: string;
};
async function atomicJson(filename: string, value: unknown) {
  const tmp = filename + ".tmp-" + randomUUID();
  await writeFile(tmp, JSON.stringify(value, null, 2) + "\n", { mode: 0o600 });
  await rename(tmp, filename);
}
export async function convertPrivateDocx(privateDirectory: string) {
  const repo = await realpath(path.resolve(path.dirname(fileURLToPath(import.meta.url)), "../.."));
  if (!path.isAbsolute(privateDirectory)) throw new Error("Private directory must be absolute.");
  const directory = await realpath(privateDirectory);
  if (inside(repo, directory))
    throw new Error("Customer inputs and derivatives must remain outside Git.");
  const auditPath = await realpath(path.join(directory, "docx-bindings-audit.json"));
  if (!inside(directory, auditPath)) throw new Error("Bindings audit escaped private staging.");
  const audit = JSON.parse(await readFile(auditPath, "utf8"));
  if (!Array.isArray(audit.files)) throw new Error("Bindings audit files[] required.");
  const output = path.join(directory, "docx-conversions");
  await mkdir(output, { recursive: true, mode: 0o700 });
  if (!inside(directory, await realpath(output)))
    throw new Error("Conversion output escaped private staging.");
  const records: Record<string, unknown>[] = [];
  const seen = new Set<string>();
  for (const binding of audit.files as Binding[]) {
    if (!UUID.test(binding.arquivo_id) || seen.has(binding.arquivo_id))
      throw new Error("Missing or duplicated file identity in audit.");
    seen.add(binding.arquivo_id);
    const identity = {
      arquivo_id: binding.arquivo_id,
      source_id: binding.source_id,
      source_unit: binding.source_unit,
      cliente_id: binding.cliente_id,
      unidade_id: binding.unidade_id,
      source_sha256: binding.sha256,
    };
    try {
      const original = await realpath(binding.local_path);
      if (!inside(directory, original) || !(await stat(original)).isFile())
        throw new Error("Original escaped private staging or is not a regular file.");
      const bytes = new Uint8Array(await readFile(original));
      if (sha(bytes) !== binding.sha256)
        throw new Error("Original hash differs from reconciled audit.");
      await validarBinarioNr(bytes, {
        nome: binding.nome,
        mime: NR_ARQUIVO_MIMES.docx,
        tamanho: bytes.length,
        sha256: binding.sha256,
      });
      const converted = await converterDocxNr(bytes);
      const conteudo = conteudoNrSchema.parse(converted.conteudo);
      const target = path.join(output, binding.arquivo_id);
      await mkdir(path.join(target, "assets"), { recursive: true, mode: 0o700 });
      if (
        !inside(output, await realpath(target)) ||
        !inside(target, await realpath(path.join(target, "assets")))
      )
        throw new Error("Derivative path escaped private staging.");
      const assets = [];
      for (const asset of converted.assets) {
        const ext = EXT[asset.mime];
        if (!ext || sha(asset.bytes) !== asset.sha256)
          throw new Error("Converted asset failed MIME/integrity check.");
        const localPath = path.join(target, "assets", `${asset.sha256}.${ext}`);
        await writeFile(localPath, asset.bytes, { mode: 0o600 });
        assets.push({
          chave: asset.chave,
          nome: asset.nome,
          mime: asset.mime,
          tamanho: asset.bytes.length,
          sha256: asset.sha256,
          local_path: localPath,
        });
      }
      const conversionPath = path.join(target, "conversion.json");
      const result = {
        format: "nexus-docx-conversion/1",
        converter: NR_DOCX_CONVERSAO_VERSAO,
        ...identity,
        source_bytes: bytes.length,
        conteudo,
        avisos: converted.avisos,
        assets,
      };
      await atomicJson(conversionPath, result);
      const tables = conteudo.blocos.filter((block) => block.tipo === "tabela");
      const stats = {
        blocos: conteudo.blocos.length,
        tabelas: tables.length,
        linhas: tables.reduce((n, t) => n + (t.linhas?.length ?? 0), 0),
        celulas: tables.reduce(
          (n, t) => n + (t.linhas?.reduce((s, row) => s + row.length, 0) ?? 0),
          0,
        ),
        caracteres: conteudo.blocos.reduce(
          (n, block) =>
            n +
            (block.texto?.length ?? 0) +
            (block.linhas?.reduce((s, row) => s + row.reduce((r, cell) => r + cell.length, 0), 0) ??
              0),
          0,
        ),
        imagens: assets.length,
        bytes_imagens: assets.reduce((n, asset) => n + asset.tamanho, 0),
      };
      records.push({
        ...identity,
        source_bytes: bytes.length,
        resultado: "convertido",
        conversion_path: conversionPath,
        stats,
      });
    } catch (error) {
      records.push({
        ...identity,
        resultado: "erro",
        motivo: error instanceof Error ? error.message : "Unknown conversion failure",
      });
    }
    await atomicJson(path.join(output, "index.json"), {
      format: "nexus-docx-conversions/1",
      converter: NR_DOCX_CONVERSAO_VERSAO,
      captured_at: new Date().toISOString(),
      records,
    });
  }
  const converted = records.filter((row) => row.resultado === "convertido");
  const keys = ["blocos", "tabelas", "linhas", "celulas", "caracteres", "imagens", "bytes_imagens"];
  const summary = {
    format: "nexus-docx-conversions-summary/1",
    converter: NR_DOCX_CONVERSAO_VERSAO,
    captured_at: new Date().toISOString(),
    identified: records.length,
    converted: converted.length,
    errors: records.length - converted.length,
    totals: Object.fromEntries(
      keys.map((key) => [
        key,
        converted.reduce(
          (n, row) => n + Number((row.stats as Record<string, number>)[key] ?? 0),
          0,
        ),
      ]),
    ),
    database_writes: false,
    storage_uploads: false,
    originals_modified: false,
  };
  await atomicJson(path.join(output, "summary.json"), summary);
  return summary;
}
if (process.argv[1] && path.resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  try {
    if (!process.argv[2])
      throw new Error("Usage: tsx scripts/nr/convert-docx.mts ABS_PRIVATE_DIRECTORY");
    const summary = await convertPrivateDocx(process.argv[2]);
    process.stdout.write(JSON.stringify(summary) + "\n");
    if (summary.errors) process.exitCode = 2;
  } catch (error) {
    process.stderr.write((error instanceof Error ? error.message : "Conversion failed") + "\n");
    process.exitCode = 1;
  }
}
