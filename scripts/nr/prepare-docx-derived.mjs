#!/usr/bin/env node
/** Private, offline DOCX derivative plans. This module never contacts a database or network. */
import { createHash, randomUUID } from "node:crypto";
import { mkdir, readFile, realpath, rename, stat, writeFile } from "node:fs/promises";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { SOURCE, digest } from "./inventory.mjs";

const UUID = /^[a-f0-9]{8}-[a-f0-9]{4}-[a-f0-9]{4}-[a-f0-9]{4}-[a-f0-9]{12}$/i;
const HASH = /^[a-f0-9]{64}$/;
const DOCX = "application/vnd.openxmlformats-officedocument.wordprocessingml.document";
const EXT = { "image/png": "png", "image/jpeg": "jpg", "image/webp": "webp" };
const inside = (parent, child) => child === parent || child.startsWith(parent + path.sep);
const sha = (bytes) => createHash("sha256").update(bytes).digest("hex");
const stableUuid = (value) => {
  const b = createHash("sha256").update(value).digest().subarray(0, 16);
  b[6] = (b[6] & 15) | 80;
  b[8] = (b[8] & 63) | 128;
  const s = b.toString("hex");
  return `${s.slice(0, 8)}-${s.slice(8, 12)}-${s.slice(12, 16)}-${s.slice(16, 20)}-${s.slice(20)}`;
};
function assert(condition, message) {
  if (!condition) throw new Error(message);
}
function rows(input) {
  if (Array.isArray(input)) return input;
  for (const key of ["rows", "files", "prepared", "records"])
    if (Array.isArray(input?.[key])) return input[key];
  throw new Error("Image records must be an array or contain rows/files/prepared/records.");
}
async function atomicJson(filename, value) {
  const temp = `${filename}.tmp-${randomUUID()}`;
  await writeFile(temp, JSON.stringify(value, null, 2) + "\n", { mode: 0o600 });
  await rename(temp, filename);
}
async function canonicalOutput(filename) {
  const suffix = [];
  let parent = filename;
  while (true) {
    try {
      return path.join(await realpath(parent), ...suffix);
    } catch (error) {
      if (error.code !== "ENOENT") throw error;
      const next = path.dirname(parent);
      if (next === parent) throw error;
      suffix.unshift(path.basename(parent));
      parent = next;
    }
  }
}
function imageMime(bytes) {
  if (bytes.subarray(0, 8).equals(Buffer.from([137, 80, 78, 71, 13, 10, 26, 10])))
    return "image/png";
  if (bytes[0] === 255 && bytes[1] === 216 && bytes[2] === 255) return "image/jpeg";
  if (bytes.subarray(0, 4).toString() === "RIFF" && bytes.subarray(8, 12).toString() === "WEBP")
    return "image/webp";
  return null;
}
function imageKey(org, unit, hash) {
  return `${org}|${unit}|${hash}`;
}
function ref(token) {
  return { $ref: token };
}

export async function prepareDocxDerived(options) {
  const repo = await realpath(path.resolve(path.dirname(fileURLToPath(import.meta.url)), "../.."));
  assert(path.isAbsolute(options.privateDir ?? ""), "Private directory must be absolute.");
  const directory = await realpath(options.privateDir);
  assert(!inside(repo, directory), "Customer conversions and plans must remain outside Git.");
  const org = options.organizationId,
    lot = options.lotId;
  assert(
    UUID.test(org ?? "") && UUID.test(lot ?? ""),
    "Organization and import lot UUIDs are required.",
  );
  async function privatePath(filename) {
    assert(path.isAbsolute(filename ?? ""), "Private paths must be absolute.");
    const target = await realpath(filename);
    assert(inside(directory, target) && !inside(repo, target), "Input escaped private staging.");
    return target;
  }
  async function read(filename) {
    return JSON.parse(await readFile(await privatePath(filename), "utf8"));
  }
  const audit = await read(options.auditPath ?? path.join(directory, "docx-bindings-audit.json"));
  const index = await read(
    options.conversionsPath ?? path.join(directory, "docx-conversions/index.json"),
  );
  assert(Array.isArray(audit.files), "Bindings audit files[] required.");
  assert(
    index.format === "nexus-docx-conversions/1" && Array.isArray(index.records),
    "Unknown conversions index.",
  );
  assert(
    typeof index.converter === "string" &&
      index.converter.length > 0 &&
      index.converter.length < 100,
    "Converter version required.",
  );
  assert(!Number.isNaN(Date.parse(index.captured_at)), "Captured timestamp required.");
  const output = await canonicalOutput(
    options.outputDir ?? path.join(directory, "docx-derived-plans"),
  );
  assert(
    inside(directory, output) && !inside(repo, output),
    "Plans must remain within private staging.",
  );
  await mkdir(output, { recursive: true, mode: 0o700 });
  const bindings = new Map();
  for (const binding of audit.files) {
    assert(
      UUID.test(binding.arquivo_id ?? "") && !bindings.has(binding.arquivo_id),
      "Ambiguous source file UUID.",
    );
    assert(
      UUID.test(binding.cliente_id ?? "") &&
        UUID.test(binding.unidade_id ?? "") &&
        HASH.test(binding.sha256 ?? ""),
      "Invalid reconciled source context/hash.",
    );
    bindings.set(binding.arquivo_id, binding);
  }
  const confirmed = new Map();
  if (options.imagesPath)
    for (const wrapper of rows(await read(options.imagesPath))) {
      const row = wrapper.arquivo ?? wrapper.row ?? wrapper;
      if (row.estado !== "vinculado" || row.bytes_verificados !== true) continue;
      assert(
        !row.organization_id || row.organization_id === org,
        "Confirmed image belongs to another organization.",
      );
      assert(
        UUID.test(row.id ?? "") &&
          UUID.test(row.cliente_id ?? "") &&
          UUID.test(row.unidade_id ?? "") &&
          HASH.test(row.sha256 ?? ""),
        "Invalid confirmed image identity.",
      );
      if (!EXT[row.mime]) continue;
      const key = imageKey(org, row.unidade_id, row.sha256);
      const prior = confirmed.get(key);
      assert(
        !prior ||
          (prior.cliente_id === row.cliente_id &&
            prior.mime === row.mime &&
            prior.tamanho === row.tamanho),
        "Conflicting confirmed image integrity/context.",
      );
      if (!prior || row.id.localeCompare(prior.id) < 0) confirmed.set(key, row);
    }
  const preparedAssets = new Map(),
    conversions = [],
    terminal = [],
    seen = new Set();
  for (const record of index.records) {
    const binding = bindings.get(record.arquivo_id);
    assert(
      binding && !seen.has(record.arquivo_id),
      "Unreconciled or duplicated conversion source.",
    );
    seen.add(record.arquivo_id);
    const identity = {
      arquivo_id: record.arquivo_id,
      source_id: record.source_id,
      source_unit: record.source_unit,
    };
    try {
      for (const key of ["source_id", "source_unit", "cliente_id", "unidade_id"])
        assert(record[key] === binding[key], "Conversion and reconciled identity disagree.");
      assert(
        record.source_sha256 === binding.sha256,
        "Conversion source hash disagrees with original.",
      );
      assert(
        record.resultado === "convertido",
        record.motivo ?? "Original could not be converted.",
      );
      const conversion = await read(record.conversion_path);
      assert(
        conversion.format === "nexus-docx-conversion/1" && conversion.converter === index.converter,
        "Conversion schema/version disagrees.",
      );
      for (const key of ["arquivo_id", "source_id", "source_unit", "source_sha256", "source_bytes"])
        assert(conversion[key] === record[key], "Conversion payload and index disagree.");
      assert(
        Number.isSafeInteger(conversion.source_bytes) && conversion.source_bytes > 0,
        "Original byte size required.",
      );
      assert(
        conversion.conteudo?.schema_version === 1 &&
          Array.isArray(conversion.conteudo.blocos) &&
          Array.isArray(conversion.assets) &&
          Array.isArray(conversion.avisos),
        "Native content/assets/warnings required.",
      );
      assert(
        (binding.documentos ?? []).length <= 1 &&
          (binding.locais ?? []).length <= 1 &&
          (binding.pastas ?? []).length <= 1,
        "Ambiguous document/local/folder; explicit decision required.",
      );
      const sourceFile = await privatePath(binding.local_path),
        sourceBytes = await readFile(sourceFile);
      assert(
        sourceBytes.length === conversion.source_bytes && sha(sourceBytes) === binding.sha256,
        "Original changed after conversion.",
      );
      const assetKeys = new Set(),
        assets = [];
      for (const asset of conversion.assets) {
        assert(
          typeof asset.chave === "string" && asset.chave.length > 0 && !assetKeys.has(asset.chave),
          "Ambiguous extracted OOXML image key.",
        );
        assetKeys.add(asset.chave);
        assert(
          EXT[asset.mime] && HASH.test(asset.sha256 ?? ""),
          "Unsupported extracted image MIME/hash.",
        );
        const filename = await privatePath(asset.local_path),
          bytes = await readFile(filename);
        assert(
          (await stat(filename)).isFile() &&
            bytes.length === asset.tamanho &&
            sha(bytes) === asset.sha256 &&
            imageMime(bytes) === asset.mime,
          "Extracted image bytes/MIME/hash differ.",
        );
        const key = imageKey(org, binding.unidade_id, asset.sha256);
        const current = preparedAssets.get(key);
        assert(
          !current ||
            (current.cliente_id === binding.cliente_id &&
              current.mime === asset.mime &&
              current.tamanho === asset.tamanho),
          "Image identity conflicts across contexts.",
        );
        assets.push({
          chave: asset.chave,
          key,
          sha256: asset.sha256,
          mime: asset.mime,
          tamanho: asset.tamanho,
          local_path: filename,
        });
      }
      assert(
        conversion.conteudo.blocos.every((block) => block.tipo !== "imagem"),
        "Converter must use extracted asset references, never unverified image IDs.",
      );
      const referencedAssets = new Set(
        conversion.conteudo.blocos
          .filter((block) => block.tipo === "referencia" && assetKeys.has(block.chave))
          .map((block) => block.chave),
      );
      assert(
        referencedAssets.size === assets.length,
        "Extracted image has no exact native block relationship.",
      );
      // An invalid source must not leave a partial asset plan for orphan upload.
      for (const asset of assets) {
        if (!preparedAssets.has(asset.key))
          preparedAssets.set(asset.key, {
            key: asset.key,
            chave: stableUuid(`nr-docx-image-v1|${asset.key}`),
            cliente_id: binding.cliente_id,
            unidade_id: binding.unidade_id,
            normas: [],
            sha256: asset.sha256,
            mime: asset.mime,
            tamanho: asset.tamanho,
            nome: `docx-${asset.sha256.slice(0, 16)}.${EXT[asset.mime]}`,
            local_path: asset.local_path,
            extracoes: [],
            local_ids: [],
          });
        const target = preparedAssets.get(asset.key);
        target.normas.push(...(binding.normas ?? []));
        target.local_ids.push(...(binding.locais ?? []).map((local) => local.local_id));
        target.extracoes.push({
          arquivo_docx_id: binding.arquivo_id,
          source_id: binding.source_id,
          source_sha256: binding.sha256,
          chave_ooxml: asset.chave,
          image_sha256: asset.sha256,
        });
      }
      conversions.push({ record, binding, conversion, assets });
    } catch (error) {
      terminal.push({ ...identity, resultado: "erro", motivo: error.message });
    }
  }
  for (const binding of audit.files)
    if (!seen.has(binding.arquivo_id))
      terminal.push({
        arquivo_id: binding.arquivo_id,
        source_id: binding.source_id,
        source_unit: binding.source_unit,
        resultado: "erro",
        motivo: "Original is absent from the conversion index.",
      });
  const assetPlans = [...preparedAssets.values()]
    .sort((a, b) => a.key.localeCompare(b.key))
    .map((asset) => {
      const image = confirmed.get(asset.key);
      if (image)
        assert(
          image.cliente_id === asset.cliente_id &&
            image.mime === asset.mime &&
            image.tamanho === asset.tamanho,
          "Confirmed image does not match extracted bytes/context.",
        );
      const localIds = [...new Set(asset.local_ids)];
      const extracoes = [
        ...new Map(asset.extracoes.map((item) => [digest(item), item])).values(),
      ].sort((a, b) => digest(a).localeCompare(digest(b)));
      const metadata = {
        cliente_id: asset.cliente_id,
        unidade_id: asset.unidade_id,
        normas: [...new Set(asset.normas)].sort(),
        nome: asset.nome,
        mime: asset.mime,
        tamanho: asset.tamanho,
        sha256: asset.sha256,
        papel: "derivado",
        lote_id: lot,
        origem_metadata: {
          sistema: SOURCE,
          tipo: "imagem_extraida_docx",
          converter: index.converter,
          extracoes,
        },
        ...(localIds.length === 1 ? { local_id: localIds[0] } : {}),
      };
      return {
        chave: asset.chave,
        local_path: asset.local_path,
        sha256: asset.sha256,
        mime: asset.mime,
        tamanho: asset.tamanho,
        cliente_id: asset.cliente_id,
        unidade_id: asset.unidade_id,
        resultado: image ? "ja_confirmado" : "preparar_transferir_confirmar",
        arquivo_id: image?.id ?? null,
        rpc: image
          ? null
          : {
              nome: "nr_arquivo_importar_preparar",
              args: { p_org: org, p_chave: asset.chave, p_dados: metadata },
            },
      };
    });
  const documentPlans = [];
  for (const { record, binding, conversion, assets } of conversions) {
    try {
      const assetMap = new Map(assets.map((asset) => [asset.chave, asset]));
      const missing = assets.filter((asset) => !confirmed.has(asset.key));
      const externoId = `derivado-docx/${binding.source_unit}/drive:${binding.source_id}/${index.converter}`;
      if (missing.length) {
        const pending = {
          arquivo_id: binding.arquivo_id,
          source_id: binding.source_id,
          source_unit: binding.source_unit,
          externo_id: externoId,
          resultado: "aguardando_imagens_confirmadas",
          dependencias: missing.map((asset) => ({
            sha256: asset.sha256,
            cliente_id: binding.cliente_id,
            unidade_id: binding.unidade_id,
            chave_ooxml: asset.chave,
          })),
        };
        documentPlans.push(pending);
        terminal.push(pending);
        continue;
      }
      const conteudo = {
        ...conversion.conteudo,
        blocos: conversion.conteudo.blocos.map((block) => {
          const asset = block.tipo === "referencia" ? assetMap.get(block.chave) : null;
          if (!asset) return block;
          const image = confirmed.get(asset.key);
          return {
            id: block.id,
            tipo: "imagem",
            arquivo_id: image.id,
            ...(block.legenda ? { legenda: block.legenda } : {}),
          };
        }),
      };
      const used = new Set(
        conversion.conteudo.blocos
          .filter((block) => block.tipo === "referencia" && assetMap.has(block.chave))
          .map((block) => block.chave),
      );
      assert(
        used.size === assets.length,
        "Extracted image has no exact native block relationship.",
      );
      const localId = binding.locais?.[0]?.local_id ?? null,
        pastaId = binding.pastas?.[0]?.pasta_id ?? null;
      const originals = binding.documentos ?? [];
      for (const original of originals)
        assert(
          UUID.test(original.documento_id ?? "") &&
            UUID.test(original.revisao_id ?? "") &&
            typeof original.externo_id === "string",
          "Original document/revision relation lacks proof.",
        );
      const assetProof = assets
        .map((asset) => ({
          chave_ooxml: asset.chave,
          sha256: asset.sha256,
          mime: asset.mime,
          tamanho: asset.tamanho,
          arquivo_id: confirmed.get(asset.key).id,
        }))
        .sort((a, b) => a.chave_ooxml.localeCompare(b.chave_ooxml));
      // Capture timestamps and private filesystem locations never enter content identity.
      const payload = {
        schema_version: 1,
        tipo: "derivado_docx_editavel",
        converter: index.converter,
        source_id: binding.source_id,
        source_unit: binding.source_unit,
        arquivo_original_id: binding.arquivo_id,
        source_sha256: binding.sha256,
        source_bytes: conversion.source_bytes,
        contexto: {
          cliente_id: binding.cliente_id,
          unidade_id: binding.unidade_id,
          normas: [...binding.normas].sort(),
        },
        conteudo,
        assets: assetProof,
        avisos: conversion.avisos,
        documentos_originais: originals,
        local_id: localId,
        pasta_id: pastaId,
      };
      const hash = digest(payload);
      const metadata = {
        tipo: "derivado_docx_editavel",
        converter: index.converter,
        arquivo_original_id: binding.arquivo_id,
        sha256_original: binding.sha256,
        documentos_originais: originals,
        avisos_conversao: conversion.avisos,
        conversao: {
          original_arquivo_id: binding.arquivo_id,
          original_sha256: binding.sha256,
          conversor: index.converter,
          avisos: conversion.avisos,
          estado: "convertida",
          documentos_originais: originals,
        },
        origem: SOURCE,
      };
      const destino = {
        entidade: "documentos",
        registro: {
          cliente_id: binding.cliente_id,
          unidade_id: binding.unidade_id,
          normas: payload.contexto.normas,
          titulo: `${binding.nome} — cópia editável`.slice(0, 240),
          descricao:
            "Derivado editável de DOCX preservado; conferir limitações da conversão antes da revisão técnica.",
          tipo: "derivado_docx",
          estado: "rascunho",
          recebimento: "nativo",
          local_id: localId,
          pasta_id: pastaId,
          dados: metadata,
        },
        revisao: { numero: 1, conteudo, snapshot: payload, vigencia: "vigente" },
        caminho_original: `drive:file:${binding.source_id}`,
        evidencia: {
          metodo: "Conversão dos bytes originais verificados e vínculos explícitos do de-para",
          converter: index.converter,
          arquivo_original_id: binding.arquivo_id,
          source_sha256: binding.sha256,
          documentos_originais: originals,
          sem_documento_origem: originals.length === 0,
        },
      };
      const guard = {
        original: {
          organization_id: org,
          id: binding.arquivo_id,
          cliente_id: binding.cliente_id,
          unidade_id: binding.unidade_id,
          mime: DOCX,
          tamanho: conversion.source_bytes,
          sha256: binding.sha256,
          estado: "vinculado",
          bytes_verificados: true,
        },
        imagens: assetProof.map((image) => ({
          organization_id: org,
          id: image.arquivo_id,
          cliente_id: binding.cliente_id,
          unidade_id: binding.unidade_id,
          mime: image.mime,
          tamanho: image.tamanho,
          sha256: image.sha256,
          estado: "vinculado",
          bytes_verificados: true,
        })),
        obrigatorio:
          "Revalidar estas condições no banco na mesma transação da importação. Plano privado não prova confirmação do Storage.",
      };
      const after = [
        {
          nome: "nr_arquivo_importar_vinculo",
          args: {
            p_org: org,
            p_arquivo: binding.arquivo_id,
            p_chave: digest({
              tipo: "fonte_docx_derivado",
              externo_id: externoId,
              sha256: binding.sha256,
              payload_sha256: hash,
            }),
            p_destino: {
              documento_id: ref("resultado.destino_id"),
              revisao_id: ref("fonte.snapshot_destino.revisao_atual_id"),
              ...(localId ? { local_id: localId } : {}),
            },
            p_evidencia: {
              tipo: "arquivo_fonte_de_derivado",
              arquivo_original_id: binding.arquivo_id,
              source_sha256: binding.sha256,
              converter: index.converter,
            },
          },
        },
      ];
      for (const image of assetProof)
        after.push({
          nome: "nr_arquivo_importar_vinculo",
          args: {
            p_org: org,
            p_arquivo: image.arquivo_id,
            p_chave: digest({
              tipo: "imagem_docx_derivado",
              externo_id: externoId,
              chave_ooxml: image.chave_ooxml,
              sha256: image.sha256,
              payload_sha256: hash,
            }),
            p_destino: {
              documento_id: ref("resultado.destino_id"),
              revisao_id: ref("fonte.snapshot_destino.revisao_atual_id"),
              ...(localId ? { local_id: localId } : {}),
            },
            p_evidencia: {
              tipo: "imagem_extraida_do_docx_fonte",
              arquivo_original_id: binding.arquivo_id,
              source_sha256: binding.sha256,
              chave_ooxml: image.chave_ooxml,
              image_sha256: image.sha256,
            },
          },
        });
      for (const original of originals)
        after.push({
          nome: "nr_vincular_documentos_importados",
          args: {
            p_org: org,
            p_origem: SOURCE,
            p_tipo: "registro_documental",
            p_externo_de: externoId,
            p_externo_para: original.externo_id,
            p_relacao: "referencia",
            p_evidencia: {
              tipo: "derivado_docx_editavel",
              arquivo_original_id: binding.arquivo_id,
              source_sha256: binding.sha256,
              documento_original_id: original.documento_id,
              revisao_original_id: original.revisao_id,
              converter: index.converter,
            },
          },
        });
      const planned = {
        arquivo_id: binding.arquivo_id,
        source_id: binding.source_id,
        source_unit: binding.source_unit,
        externo_id: externoId,
        resultado: "planejado_com_precondicoes",
        sha256_payload: hash,
        guard,
        rpc: {
          nome: "nr_importar_item",
          args: {
            p_org: org,
            p_lote: lot,
            p_tipo: "registro_documental",
            p_externo_id: externoId,
            p_payload: payload,
            p_destino: destino,
            p_hash: hash,
            p_capturado_em: index.captured_at,
          },
        },
        after_success_only: after,
        resolution: {
          "resultado.destino_id":
            "UUID devolvido por nr_importar_item quando importado/ja_existente; nunca executar vínculos em conflito/erro",
          "fonte.snapshot_destino.revisao_atual_id":
            "Consulta nr_fontes da mesma organização/origem/tipo/externo_id/hash e usa snapshot_destino.revisao_atual_id, fixado na conversão; não usar o ponteiro atual se houve edição posterior",
        },
      };
      documentPlans.push(planned);
      terminal.push({
        arquivo_id: binding.arquivo_id,
        source_id: binding.source_id,
        source_unit: binding.source_unit,
        externo_id: externoId,
        resultado: planned.resultado,
        sha256_payload: hash,
      });
    } catch (error) {
      terminal.push({
        arquivo_id: binding.arquivo_id,
        source_id: binding.source_id,
        source_unit: binding.source_unit,
        resultado: "erro",
        motivo: error.message,
      });
    }
  }
  const summary = {
    originais: audit.files.length,
    conversoes: index.records.length,
    assets_fisicos_por_contexto: assetPlans.length,
    assets_ja_confirmados: assetPlans.filter((asset) => asset.resultado === "ja_confirmado").length,
    assets_a_preparar: assetPlans.filter((asset) => asset.resultado !== "ja_confirmado").length,
    bytes_assets_a_preparar: assetPlans
      .filter((asset) => asset.resultado !== "ja_confirmado")
      .reduce((sum, asset) => sum + asset.tamanho, 0),
    documentos_planejados: documentPlans.filter(
      (doc) => doc.resultado === "planejado_com_precondicoes",
    ).length,
    documentos_aguardando_imagens: documentPlans.filter(
      (doc) => doc.resultado === "aguardando_imagens_confirmadas",
    ).length,
    documentos_com_origem_explicita: conversions.filter((item) => item.binding.documentos?.length)
      .length,
    erros: terminal.filter((item) => item.resultado === "erro").length,
    executado: false,
  };
  const base = {
    format: "nexus-docx-derived-plan/1",
    converter: index.converter,
    organization_id: org,
    lote_id: lot,
    source: SOURCE,
    captured_at: index.captured_at,
    executado: false,
  };
  await atomicJson(path.join(output, "phase-assets.json"), { ...base, records: assetPlans });
  await atomicJson(path.join(output, "phase-documents.json"), { ...base, records: documentPlans });
  await atomicJson(path.join(output, "terminal-plan.json"), {
    ...base,
    summary,
    records: terminal,
  });
  return { ...base, summary, output_dir: output };
}

if (process.argv[1] && path.resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  const args = {};
  for (let i = 2; i < process.argv.length; i += 2) {
    const key = process.argv[i];
    assert(key?.startsWith("--") && process.argv[i + 1], "Expected --option VALUE.");
    args[key.slice(2)] = process.argv[i + 1];
  }
  const result = await prepareDocxDerived({
    privateDir: args["private-dir"],
    organizationId: args.organization,
    lotId: args.lot,
    auditPath: args.audit,
    conversionsPath: args.conversions,
    imagesPath: args.images,
    outputDir: args.output,
  });
  process.stdout.write(JSON.stringify({ ...result.summary, output_dir: result.output_dir }) + "\n");
}
