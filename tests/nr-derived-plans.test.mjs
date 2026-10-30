import assert from "node:assert/strict";
import { createHash } from "node:crypto";
import { cp, mkdir, mkdtemp, readFile, rm, writeFile } from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import test from "node:test";
import { fileURLToPath } from "node:url";
import { prepareDocxDerived } from "../scripts/nr/prepare-docx-derived.mjs";
import { compileDocxDerivedRecord } from "../scripts/nr/compile-docx-derived.mjs";
import { digest } from "../scripts/nr/inventory.mjs";

// Synthetic contract fixtures live only in an OS temporary directory, never in app code or Git.
const uuid = (n) => `00000000-0000-4000-8000-${String(n).padStart(12, "0")}`;
const hash = (value) => createHash("sha256").update(value).digest("hex");
const PNG = Buffer.from(
  "iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mP8/x8AAwMCAO+aB7sAAAAASUVORK5CYII=",
  "base64",
);

async function fixture(t, count = 1, originals = 1) {
  const directory = await mkdtemp(path.join(os.tmpdir(), "nexus-nr-derived-plan-test-"));
  t.after(() => rm(directory, { recursive: true, force: true }));
  const source = Buffer.from("PK-synthetic-contract-source; no customer content");
  const sourcePath = path.join(directory, "synthetic-source.bin");
  const imagePath = path.join(directory, "synthetic-image.png");
  await writeFile(sourcePath, source);
  await writeFile(imagePath, PNG);
  const org = uuid(1),
    client = uuid(2),
    unit = uuid(3),
    lot = uuid(4),
    image = uuid(5);
  const audit = { files: [] };
  const index = {
    format: "nexus-docx-conversions/1",
    converter: "synthetic-converter-1",
    captured_at: "2026-10-30T20:00:00Z",
    records: [],
  };
  const conversions = [];
  const json = async (filename, data) => writeFile(filename, JSON.stringify(data));
  for (let i = 0; i < count; i++) {
    const binding = {
      arquivo_id: uuid(1000 + i),
      source_id: `synthetic-drive-file-${i}`,
      source_unit: "synthetic-unit",
      cliente_id: client,
      unidade_id: unit,
      normas: ["NR33"],
      sha256: hash(source),
      local_path: sourcePath,
      nome: "Documento sintético.docx",
      documentos:
        i < originals
          ? [
              {
                externo_id: `synthetic-unit/doc-${i}`,
                documento_id: uuid(2000 + i),
                revisao_id: uuid(3000 + i),
              },
            ]
          : [],
      locais: [],
      pastas: [],
    };
    const conversion = {
      format: "nexus-docx-conversion/1",
      converter: index.converter,
      arquivo_id: binding.arquivo_id,
      source_id: binding.source_id,
      source_unit: binding.source_unit,
      source_sha256: binding.sha256,
      source_bytes: source.length,
      conteudo: {
        schema_version: 1,
        blocos: [
          {
            id: "image1",
            tipo: "referencia",
            chave: "word/media/image1.png",
            legenda: "Imagem sintética",
          },
        ],
      },
      avisos: ["Fixture sintética de contrato de planejamento"],
      assets: [
        {
          chave: "word/media/image1.png",
          nome: "image1.png",
          mime: "image/png",
          tamanho: PNG.length,
          sha256: hash(PNG),
          local_path: imagePath,
        },
      ],
    };
    const conversionPath = path.join(directory, `conversion-${i}.json`);
    await json(conversionPath, conversion);
    audit.files.push(binding);
    index.records.push({
      arquivo_id: binding.arquivo_id,
      source_id: binding.source_id,
      source_unit: binding.source_unit,
      cliente_id: client,
      unidade_id: unit,
      source_sha256: binding.sha256,
      source_bytes: source.length,
      resultado: "convertido",
      conversion_path: conversionPath,
    });
    conversions.push(conversion);
  }
  const config = {
    privateDir: directory,
    organizationId: org,
    lotId: lot,
    conversionsPath: path.join(directory, "index.json"),
    outputDir: path.join(directory, "plans"),
  };
  const confirmed = {
    id: image,
    organization_id: org,
    cliente_id: client,
    unidade_id: unit,
    mime: "image/png",
    tamanho: PNG.length,
    sha256: hash(PNG),
    estado: "vinculado",
    bytes_verificados: true,
  };
  const save = async () => {
    await json(path.join(directory, "docx-bindings-audit.json"), audit);
    await json(config.conversionsPath, index);
    for (let i = 0; i < conversions.length; i++)
      await json(index.records[i].conversion_path, conversions[i]);
  };
  const images = async (rows = [confirmed]) => {
    const filename = path.join(directory, "confirmed-images.json");
    await json(filename, rows);
    return filename;
  };
  const readPlan = async (name) =>
    JSON.parse(await readFile(path.join(config.outputDir, name), "utf8"));
  await save();
  return {
    directory,
    config,
    audit,
    index,
    conversions,
    confirmed,
    sourcePath,
    imagePath,
    save,
    images,
    readPlan,
  };
}

test("requires confirmed image bytes in the exact client/unit context", async (t) => {
  const f = await fixture(t);
  let plan = await prepareDocxDerived(f.config);
  assert.equal(plan.summary.documentos_planejados, 0);
  assert.equal(plan.summary.documentos_aguardando_imagens, 1);
  const [asset] = (await f.readPlan("phase-assets.json")).records;
  assert.equal(asset.rpc.args.p_dados.papel, "derivado");
  assert.equal(
    asset.rpc.args.p_dados.origem_metadata.extracoes[0].chave_ooxml,
    "word/media/image1.png",
  );
  for (const row of [
    { ...f.confirmed, bytes_verificados: false },
    { ...f.confirmed, estado: "preparado" },
    { ...f.confirmed, unidade_id: uuid(99) },
  ]) {
    plan = await prepareDocxDerived({ ...f.config, imagesPath: await f.images([row]) });
    assert.equal(plan.summary.documentos_aguardando_imagens, 1);
  }
  await assert.rejects(
    prepareDocxDerived({
      ...f.config,
      imagesPath: await f.images([{ ...f.confirmed, organization_id: uuid(99) }]),
    }),
    /another organization/,
  );
  await assert.rejects(
    prepareDocxDerived({
      ...f.config,
      imagesPath: await f.images([{ ...f.confirmed, tamanho: PNG.length + 1 }]),
    }),
    /match extracted/,
  );
  await assert.rejects(
    prepareDocxDerived({
      ...f.config,
      imagesPath: await f.images([{ ...f.confirmed, cliente_id: uuid(99) }]),
    }),
    /match extracted/,
  );
});

test("preserves 65 explicit document relations while 168 received files get no invented original", async (t) => {
  const f = await fixture(t, 233, 65);
  const result = await prepareDocxDerived({
    ...f.config,
    imagesPath: await f.images([{ arquivo: f.confirmed }]),
  });
  assert.equal(result.summary.documentos_planejados, 233);
  assert.equal(result.summary.documentos_com_origem_explicita, 65);
  assert.equal(result.summary.assets_fisicos_por_contexto, 1);
  const docs = (await f.readPlan("phase-documents.json")).records;
  assert.equal(new Set(docs.map((doc) => doc.externo_id)).size, 233);
  assert.equal(
    docs
      .flatMap((doc) => doc.after_success_only)
      .filter((op) => op.nome === "nr_vincular_documentos_importados").length,
    65,
  );
  for (let i = 0; i < docs.length; i++) {
    const doc = docs[i];
    assert.equal(doc.rpc.args.p_payload.conteudo.blocos[0].arquivo_id, f.confirmed.id);
    assert.equal(doc.guard.original.id, f.audit.files[i].arquivo_id);
    assert.equal(doc.guard.original.bytes_verificados, true);
    assert.equal(doc.rpc.args.p_destino.registro.estado, "rascunho");
    assert.equal(doc.rpc.args.p_destino.registro.recebimento, "nativo");
    assert.equal(
      doc.after_success_only[0].args.p_destino.revisao_id.$ref,
      "fonte.snapshot_destino.revisao_atual_id",
    );
    assert.equal(
      doc.after_success_only.filter((op) => op.nome === "nr_vincular_documentos_importados").length,
      i < 65 ? 1 : 0,
    );
  }
  assert.equal(result.summary.executado, false);
});

test("payload identity excludes capture timestamp and private staging paths", async (t) => {
  const f = await fixture(t);
  const config = { ...f.config, imagesPath: await f.images() };
  await prepareDocxDerived(config);
  const first = (await f.readPlan("phase-documents.json")).records[0];
  const firstAsset = (await f.readPlan("phase-assets.json")).records[0];
  f.index.captured_at = "2026-11-01T20:00:00Z";
  const moved = path.join(f.directory, "moved");
  await mkdir(moved);
  await cp(f.imagePath, path.join(moved, "image.png"));
  await cp(f.sourcePath, path.join(moved, "source.bin"));
  f.conversions[0].assets[0].local_path = path.join(moved, "image.png");
  f.audit.files[0].local_path = path.join(moved, "source.bin");
  await f.save();
  await prepareDocxDerived(config);
  const second = (await f.readPlan("phase-documents.json")).records[0];
  assert.equal(second.sha256_payload, first.sha256_payload);
  assert.equal(second.rpc.args.p_capturado_em, f.index.captured_at);
  assert.equal(second.after_success_only[0].args.p_chave, first.after_success_only[0].args.p_chave);
  f.index.converter = "synthetic-converter-2";
  f.conversions[0].converter = f.index.converter;
  await f.save();
  await prepareDocxDerived(config);
  assert.notEqual(
    (await f.readPlan("phase-documents.json")).records[0].externo_id,
    first.externo_id,
  );
  assert.equal((await f.readPlan("phase-assets.json")).records[0].chave, firstAsset.chave);
});

test("rejects altered originals and unproven images without planning orphan uploads", async (t) => {
  const f = await fixture(t);
  await writeFile(f.sourcePath, "altered source");
  let result = await prepareDocxDerived(f.config);
  assert.equal(result.summary.erros, 1);
  assert.equal(result.summary.assets_a_preparar, 0);
  assert.match((await f.readPlan("terminal-plan.json")).records[0].motivo, /Original changed/);
  const source = Buffer.from("PK-synthetic-contract-source; no customer content");
  await writeFile(f.sourcePath, source);
  f.conversions[0].conteudo.blocos = [];
  await f.save();
  result = await prepareDocxDerived(f.config);
  assert.equal(result.summary.erros, 1);
  assert.equal(result.summary.assets_a_preparar, 0);
  f.conversions[0].conteudo.blocos = [
    { id: "unverified", tipo: "imagem", arquivo_id: f.confirmed.id },
  ];
  await f.save();
  result = await prepareDocxDerived(f.config);
  assert.equal(result.summary.erros, 1);
  assert.equal(result.summary.assets_a_preparar, 0);
  f.conversions[0].conteudo.blocos = [
    { id: "image1", tipo: "referencia", chave: "word/media/image1.png" },
  ];
  f.conversions[0].assets[0].sha256 = "0".repeat(64);
  await f.save();
  result = await prepareDocxDerived(f.config);
  assert.equal(result.summary.erros, 1);
  assert.equal(result.summary.assets_a_preparar, 0);
});

test("rejects ambiguous mappings and keeps private material outside the repository", async (t) => {
  const f = await fixture(t);
  f.audit.files[0].documentos.push({
    externo_id: "synthetic-unit/ambiguous",
    documento_id: uuid(90),
    revisao_id: uuid(91),
  });
  await f.save();
  const result = await prepareDocxDerived(f.config);
  assert.equal(result.summary.erros, 1);
  assert.equal(result.summary.assets_a_preparar, 0);
  const repo = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
  await assert.rejects(
    prepareDocxDerived({ ...f.config, outputDir: path.join(repo, "docs/nr/private-not-allowed") }),
    /private staging/,
  );
  await assert.rejects(prepareDocxDerived({ ...f.config, privateDir: repo }), /outside Git/);
});

test("compiler rejects payload, namespace, relationship and authorization-context tampering", async (t) => {
  const f = await fixture(t);
  await prepareDocxDerived({ ...f.config, imagesPath: await f.images() });
  const original = (await f.readPlan("phase-documents.json")).records[0];
  const sql = compileDocxDerivedRecord(original);
  assert.match(sql, /for update/i);
  assert.match(sql, /snapshot_destino->>'revisao_atual_id'/);
  assert.match(sql, /s\.externo_id=src->>'externo_id'/);
  const mutations = [
    (record) => {
      record.rpc.args.p_hash = "f".repeat(64);
    },
    (record) => {
      record.rpc.args.p_externo_id = "synthetic-unit/doc-0";
    },
    (record) => {
      record.rpc.args.p_destino.registro.cliente_id = uuid(99);
    },
    (record) => {
      record.rpc.args.p_destino.registro.normas = ["NR35"];
    },
    (record) => {
      record.rpc.args.p_destino.registro.local_id = uuid(99);
    },
    (record) => {
      record.rpc.args.p_destino.registro.pasta_id = uuid(99);
    },
    (record) => {
      record.rpc.args.p_destino.registro.estado = "emitido";
    },
    (record) => {
      record.guard.original.mime = "application/pdf";
    },
    (record) => {
      record.guard.original.tamanho += 1;
    },
    (record) => {
      record.guard.imagens[0].cliente_id = uuid(99);
    },
    (record) => {
      record.guard.imagens[0].sha256 = "f".repeat(64);
    },
    (record) => {
      record.after_success_only[0].args.p_org = uuid(99);
    },
    (record) => {
      record.after_success_only[0].args.p_destino.local_id = uuid(99);
    },
    (record) => {
      record.after_success_only[0].args.p_destino.revisao_id = {
        $ref: "documento.revisao_atual_id",
      };
    },
    (record) => {
      record.after_success_only.at(-1).args.p_externo_para = "synthetic-unit/unproven-document";
    },
    (record) => {
      record.after_success_only.at(-1).args.p_relacao = "substituido_por";
    },
    (record) => {
      record.after_success_only[0].nome = "emitir_documento";
    },
  ];
  for (const mutate of mutations) {
    const record = structuredClone(original);
    mutate(record);
    assert.throws(() => compileDocxDerivedRecord(record));
  }
});

test("compiler keeps source text inside escaped JSON and chooses a safe DO delimiter", async (t) => {
  const f = await fixture(t);
  await prepareDocxDerived({ ...f.config, imagesPath: await f.images() });
  const record = (await f.readPlan("phase-documents.json")).records[0];
  record.rpc.args.p_payload.conteudo.blocos.push({
    id: "quote",
    tipo: "paragrafo",
    texto: "Texto sintético $nr_docx_0$ O'Brien",
  });
  record.rpc.args.p_destino.revisao.conteudo = structuredClone(record.rpc.args.p_payload.conteudo);
  record.rpc.args.p_destino.revisao.snapshot = structuredClone(record.rpc.args.p_payload);
  record.rpc.args.p_hash = digest(record.rpc.args.p_payload);
  record.sha256_payload = record.rpc.args.p_hash;
  const sql = compileDocxDerivedRecord(record);
  assert.ok(sql.startsWith("DO $nr_docx_1$"));
  assert.match(sql, /O''Brien/);
});
