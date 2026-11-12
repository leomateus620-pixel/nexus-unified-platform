#!/usr/bin/env node
import { createHash } from "node:crypto";
import { mkdir, readFile, realpath, writeFile } from "node:fs/promises";
import path from "node:path";
import { fileURLToPath } from "node:url";

const repository = fileURLToPath(new URL("../../", import.meta.url));
const uuid = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;
const scoped = new Set([
  "documentos",
  "ativos",
  "inspecoes",
  "pendencias",
  "importacoes",
  "plantas",
  "avisos",
  "contratos",
  "ensaios",
  "os",
]);
const hash = (bytes, algorithm = "sha256") => createHash(algorithm).update(bytes).digest("hex");
const sql = (value) => "'" + String(value).replaceAll("'", "''") + "'";
const jsonSql = (value) => sql(JSON.stringify(value)) + "::jsonb";
const asText = (value) => (typeof value === "string" ? value.trim() || null : null);
const civil = (value) =>
  typeof value === "string" && /^\d{4}-\d{2}-\d{2}$/.test(value) ? value : null;
const assetState = (item) => ({
  vigente: item.vigente !== false && !item.cancelado && item.situacao_sistema !== "cancelado",
  existente: item.situacao_sistema !== "inexistente",
});

export function stableId(seed) {
  const digest = hash(seed);
  return [
    digest.slice(0, 8),
    digest.slice(8, 12),
    "8" + digest.slice(13, 16),
    "8" + digest.slice(17, 20),
    digest.slice(20, 32),
  ].join("-");
}

function identity(value) {
  return (value ?? "")
    .normalize("NFKD")
    .replace(/\p{M}/gu, "")
    .toLowerCase()
    .replace(/[^a-z0-9]/g, "");
}

export function prepareMappings(source, org, canonical) {
  const decisions = [];
  for (const cliente of source.clientes.filter((value) => !value.exemplo)) {
    const names = new Set(
      [cliente.nome_fantasia, cliente.razao_social].map(identity).filter(Boolean),
    );
    const numbers = [cliente.cnpj_matriz, ...cliente.unidades.map((unidade) => unidade.cnpj)]
      .map(identity)
      .filter(Boolean);
    const candidates = canonical.filter((candidate) => {
      const legalId = identity(candidate.identificador_normalizado);
      const sameNumber =
        legalId &&
        numbers.some(
          (number) =>
            legalId === number ||
            (legalId.length === 14 &&
              number.length === 14 &&
              legalId.slice(0, 8) === number.slice(0, 8)),
        );
      return (
        sameNumber ||
        names.has(identity(candidate.nome_exibicao)) ||
        names.has(identity(candidate.razao_social))
      );
    });
    for (const unidade of cliente.unidades.filter((value) => !value.exemplo)) {
      if (candidates.length) {
        decisions.push({
          cliente_source_id: cliente.id,
          unidade_source_id: unidade.id,
          decisao: "conferir",
          candidatos: candidates.map((candidate) => candidate.id),
        });
      } else {
        decisions.push({
          cliente_source_id: cliente.id,
          unidade_source_id: unidade.id,
          decisao: "criar",
          cliente_id: stableId(org + ":cliente:" + cliente.id),
          unidade_id: stableId(org + ":unidade:" + cliente.id + ":" + unidade.id),
          criar_cliente: !decisions.some((prior) => prior.cliente_source_id === cliente.id),
          criar_unidade: true,
          evidencia:
            "Identidade declarada no snapshot integral; sem correspondência de documento fiscal, raiz de CNPJ ou nome normalizado na leitura do cadastro canônico da organização. Leitura SHA-256 " +
            hash(JSON.stringify(canonical)),
        });
      }
    }
  }
  return decisions;
}

export function projectRecords(source, backgrounds = new Map()) {
  const records = [];
  const relations = [];
  const index = new Map();
  const resolvedContexts = new Set(
    source.clientes
      .filter((c) => !c.exemplo)
      .flatMap((c) => c.unidades.filter((u) => !u.exemplo).map((u) => c.id + "/" + u.id)),
  );
  function add(collection, item, fields = {}) {
    if (!item || typeof item !== "object" || Array.isArray(item)) {
      throw new Error("Entrada de origem não é objeto em " + collection);
    }
    const source_id = fields.source_id ?? item.id ?? item.codigo ?? item.cod;
    const key = collection + ":" + source_id;
    if (!asText(source_id) || index.has(key))
      throw new Error("ID de origem ausente ou repetido em " + collection);
    const info = item.importacao ?? {};
    const result = {
      colecao: collection,
      source_id,
      titulo: [item.titulo, item.nome, item.tag, item.descricao, item.codigo, source_id]
        .map(asText)
        .find(Boolean),
      codigo: asText(item.codigo ?? item.cod),
      familia: asText(item.familia),
      situacao: asText(item.situacao ?? item.estado),
      data_ref: civil(item.data ?? item.prazo ?? item.vence),
      origem_autor: [item.autor, item.inspetor, item.criado_por, info.autor]
        .map(asText)
        .find(Boolean),
      origem_data: [item.criado_em, item.em, item.data, info.em].map(asText).find(Boolean),
      snapshot: item,
      ...fields,
    };
    if (scoped.has(collection)) {
      const scope = item.cliente_id + "/" + item.unidade_id;
      if (!resolvedContexts.has(scope))
        throw new Error("Registro fora de um contexto operacional em " + collection);
      result.cliente_source_id = item.cliente_id;
      result.unidade_source_id = item.unidade_id;
    }
    records.push(result);
    index.set(key, result);
  }
  function connect(fromCollection, from, toCollection, to, kind) {
    if (!to) return;
    const fromRow = index.get(fromCollection + ":" + from);
    const toRow = index.get(toCollection + ":" + to);
    if (
      !fromRow ||
      !toRow ||
      fromRow.unidade_source_id !== toRow.unidade_source_id ||
      fromRow.cliente_source_id !== toRow.cliente_source_id
    ) {
      throw new Error(
        "Vínculo inválido ou fora do contexto: " + fromCollection + " → " + toCollection,
      );
    }
    const payload = {
      origem_colecao: fromCollection,
      origem_id: from,
      destino_colecao: toCollection,
      destino_id: to,
      tipo: kind,
    };
    relations.push({
      colecao: "relacao",
      source_id: hash(JSON.stringify(payload)),
      titulo: kind,
      snapshot: payload,
    });
  }

  const map = {
    documentos: "documentos",
    ativos: "insp_ativos",
    inspecoes: "insp_inspecoes",
    pendencias: "pendencias",
    importacoes: "insp_importacoes",
    plantas: "insp_plantas",
    equipamentos: "insp_equipamentos",
    servicos: "insp_servicos",
    familias: "insp_familias",
    regras: "insp_regras",
    parametros: "insp_parametros",
    textos: "insp_textos_padrao",
    avisos: "insp_avisos",
    contratos: "insp_contratos",
    ensaios: "insp_ensaios",
    os: "insp_os",
  };
  const assets = new Map(source.insp_ativos.map((item) => [item.id, item]));
  for (const [collection, original] of Object.entries(map)) {
    if (!Array.isArray(source[original])) throw new Error("Coleção de origem ausente: " + original);
    for (const item of source[original]) {
      const fields = {};
      if (collection === "ativos") {
        Object.assign(fields, assetState(item), {
          codigo: asText(item.tag),
          situacao: item.situacao_sistema,
        });
      } else if (collection === "inspecoes") {
        fields.titulo =
          [assets.get(item.ativo_id)?.tag, item.tipo_inspecao, item.data]
            .filter(Boolean)
            .join(" · ") || item.id;
      } else if (collection === "avisos") {
        fields.situacao = item.status ?? null;
        fields.titulo = "Aviso " + (item.regra ?? "R64") + " · " + (item.vence ?? item.id);
      } else if (collection === "documentos") {
        fields.data_ref = civil(item.r64?.data_base) ?? civil(item.datas?.inspecao);
        fields.codigo = asText(item.codigo ?? item.chave_importacao);
      } else if (collection === "plantas") {
        const background = backgrounds.get(item.id);
        if (item.fundo && !background) throw new Error("Fundo vetorial declarado indisponível.");
        fields.snapshot = { ...item, ...(background ? { geometria: background } : {}) };
      }
      add(collection, item, fields);
    }
  }
  for (const item of source.insp_listas.tipo_inspecao) {
    add("tipos", item, {
      source_id: item.valor,
      codigo: item.valor,
      titulo: item.rotulo ?? item.valor,
    });
  }
  for (const item of source.insp_catalogo.pacotes) add("pacotes", item);
  for (const [key, values] of Object.entries(source.insp_listas)) {
    add("listas", { valores: values }, { source_id: key, titulo: key.replaceAll("_", " ") });
  }
  for (const [key, values] of Object.entries(source.insp_catalogo)) {
    if (key === "pacotes") continue;
    add(
      key === "matriz" ? "matrizes" : "configuracoes",
      Array.isArray(values) || typeof values !== "object" ? { valor: values } : values,
      { source_id: key, titulo: key.replaceAll("_", " ") },
    );
  }
  const logDuplicates = new Map();
  for (const event of source.log) {
    const key = hash(JSON.stringify(event));
    const count = (logDuplicates.get(key) ?? 0) + 1;
    logDuplicates.set(key, count);
    add("registro", event, {
      source_id: key + "-" + count,
      titulo: asText(event.acao) ?? "Registro da origem",
    });
  }
  for (const item of source.locais) add("demonstracao", item);
  for (const item of source.clientes.filter((value) => value.exemplo)) add("demonstracao", item);
  for (const key of ["meta", "cliente_ativo", "unidade_ativa", "projeto", "modelos_documento"]) {
    add("metadados", { valor: source[key] }, { source_id: key, titulo: key.replaceAll("_", " ") });
  }

  for (const item of source.documentos) {
    connect("documentos", item.id, "documentos", item.documento_principal_id, "principal");
    connect("documentos", item.id, "documentos", item.substituido_por_id, "substituido_por");
  }
  for (const item of source.insp_ativos) {
    for (const id of new Set(item.documento_ids))
      connect("ativos", item.id, "documentos", id, "documento");
  }
  for (const item of source.insp_inspecoes) {
    connect("inspecoes", item.id, "ativos", item.ativo_id, "ativo");
    connect("inspecoes", item.id, "documentos", item.documento_id, "documento");
  }
  for (const item of source.pendencias) {
    for (const id of new Set(item.ativo_ids)) connect("pendencias", item.id, "ativos", id, "ativo");
    connect("pendencias", item.id, "documentos", item.documento_id, "documento");
  }
  for (const item of source.insp_avisos)
    connect("avisos", item.id, "documentos", item.documento_id, "documento");
  for (const item of source.insp_plantas) {
    connect("plantas", item.id, "documentos", item.documento_id, "documento");
    for (const id of new Set(item.pontos.map((point) => point.ativo_id))) {
      connect("plantas", item.id, "ativos", id, "ativo");
    }
  }
  return { records, relations };
}

async function privateOutput(root, output) {
  const resolved = path.resolve(output);
  function requireExternal(value) {
    const relative = path.relative(repository, value);
    if (
      !relative ||
      (!relative.startsWith(".." + path.sep) && relative !== ".." && !path.isAbsolute(relative))
    ) {
      throw new Error("O plano contém dados reais e precisa ficar fora do repositório.");
    }
  }
  requireExternal(resolved);
  await mkdir(resolved, { recursive: true, mode: 0o700 });
  const actual = await realpath(resolved);
  requireExternal(actual);
  if (actual === root) throw new Error("Escolha uma pasta de saída separada da fonte.");
  return actual;
}

function makeBlocks(items, maxBytes) {
  const blocks = [];
  let block = [];
  let size = 2;
  for (const item of items) {
    const bytes = Buffer.byteLength(JSON.stringify(item)) + 1;
    if (block.length && (size + bytes > maxBytes || block.length >= 500)) {
      blocks.push(block);
      block = [];
      size = 2;
    }
    block.push(item);
    size += bytes;
  }
  if (block.length) blocks.push(block);
  return blocks;
}

export async function prepare({ root, output, org, canonicalPath, mapPath, maxBytes = 450000 }) {
  if (!uuid.test(org) || (!canonicalPath && !mapPath)) {
    throw new Error("Informe a organização verificada e um cadastro canônico ou mapa revisado.");
  }
  root = await realpath(root);
  output = await privateOutput(root, output);
  const snapshot = await readFile(path.join(root, "base-completa-2026-11-01", "db.json"));
  const source = JSON.parse(snapshot);
  if (source.meta?.versao_base !== 1 || !civil(source.meta.atualizado_em))
    throw new Error("Versão de base desconhecida.");
  const backgrounds = new Map();
  for (const item of source.insp_plantas.filter((entry) => entry.fundo)) {
    const filename = item.fundo.arquivo;
    if (!/^plantas\/[a-zA-Z0-9-]+\.json$/.test(filename))
      throw new Error("Referência de fundo inválida.");
    const bytes = await readFile(path.join(root, "modulo-inspecoes", "data", filename));
    if (bytes.length !== item.fundo.bytes || hash(bytes, "md5") !== item.fundo.md5) {
      throw new Error("Bytes do fundo divergem da origem declarada.");
    }
    backgrounds.set(item.id, JSON.parse(bytes));
  }
  const { records, relations } = projectRecords(source, backgrounds);
  const blocks = [...makeBlocks(records, maxBytes), ...makeBlocks(relations, maxBytes)];
  const mapping = mapPath
    ? JSON.parse(await readFile(mapPath, "utf8"))
    : prepareMappings(source, org, JSON.parse(await readFile(canonicalPath, "utf8")));
  const privateWrite = (name, value) => writeFile(path.join(output, name), value, { mode: 0o600 });
  await privateWrite("mapeamento.json", JSON.stringify(mapping, null, 2));
  const contextKeys = new Set();
  const contextQueries = [];
  for (const entry of mapping) {
    const customer = source.clientes.find(
      (value) => value.id === entry.cliente_source_id && !value.exemplo,
    );
    const unit = customer?.unidades.find(
      (value) => value.id === entry.unidade_source_id && !value.exemplo,
    );
    if (!customer || !unit) throw new Error("O mapa contém contexto de origem desconhecido.");
    const contextKey = customer.id + "/" + unit.id;
    if (contextKeys.has(contextKey)) throw new Error("Contexto duplicado no mapa.");
    contextKeys.add(contextKey);
    if (entry.decisao === "conferir") continue;
    if (
      !["criar", "vincular"].includes(entry.decisao) ||
      !uuid.test(entry.cliente_id) ||
      !uuid.test(entry.unidade_id) ||
      !asText(entry.evidencia)
    )
      throw new Error("Decisão de mapa inválida.");
    const args = [
      sql(org),
      sql(entry.cliente_id),
      sql(entry.unidade_id),
      sql(entry.evidencia),
      jsonSql(customer),
      jsonSql(unit),
      entry.decisao === "criar" && entry.criar_cliente === true,
      entry.decisao === "criar" && entry.criar_unidade === true,
    ];
    contextQueries.push("select public.inspecoes_importar_contexto(" + args.join(",") + ");\n");
  }
  const snapshotHash = hash(snapshot);
  const version = source.meta.versao_base;
  const batchArgs = [
    sql(org),
    sql(snapshotHash),
    version,
    sql(source.meta.atualizado_em),
    blocks.length,
  ].join(",");
  const findLot = "public.inspecoes_importar_iniciar(" + batchArgs + ")";
  const selectLot = "with lote as materialized (select " + findLot + " as id) ";
  await privateWrite("01-contextos.sql", contextQueries.join(""));
  await privateWrite("02-iniciar.sql", "select " + findLot + " as lote_id;\n");
  for (let offset = 0; offset < blocks.length; offset += 1) {
    const number = offset + 1;
    const base = String(number).padStart(4, "0");
    await privateWrite(
      "03-estagiar-" + base + ".sql",
      selectLot +
        "select public.inspecoes_importar_estagiar(" +
        sql(org) +
        ",lote.id," +
        number +
        "," +
        jsonSql(blocks[offset]) +
        ") from lote;\n",
    );
    await privateWrite(
      "04-aplicar-" + base + ".sql",
      selectLot +
        "select public.inspecoes_importar_aplicar(" +
        sql(org) +
        ",lote.id," +
        number +
        ") from lote;\n",
    );
  }
  await privateWrite(
    "05-conferir.sql",
    selectLot +
      "select public.inspecoes_importar_resumo(" +
      sql(org) +
      ",lote.id,true) from lote;\n",
  );
  const recordCounts = {};
  for (const row of records) recordCounts[row.colecao] = (recordCounts[row.colecao] ?? 0) + 1;
  const summary = {
    sha256_snapshot: snapshotHash,
    versao: version,
    data_origem: source.meta.atualizado_em,
    blocos: blocks.length,
    registros: recordCounts,
    relacoes: relations.length,
    contextos: mapping.length,
    contextos_planejados: contextQueries.length,
    contextos_aguardando: mapping.length - contextQueries.length,
    ativos_vigentes_existentes: records.filter(
      (row) => row.colecao === "ativos" && row.vigente && row.existente,
    ).length,
    pontos: source.insp_plantas.flatMap((item) => item.pontos).length,
    checklist: source.insp_familias.reduce((total, item) => total + item.checklist.length, 0),
    checklist_t6: source.insp_familias.reduce((total, item) => total + item.checklist_t6.length, 0),
  };
  await privateWrite("manifesto-resumo.json", JSON.stringify(summary, null, 2));
  return summary;
}

if (process.argv[1] && path.resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  const [root, output, org, option, input, blockLimit] = process.argv.slice(2);
  if (!root || !output || !["--cadastro", "--mapa"].includes(option) || !input) {
    throw new Error(
      "Uso: node prepare-import.mjs FONTE SAIDA_PRIVADA ORG --cadastro|--mapa ARQUIVO_JSON [BYTES_BLOCO]",
    );
  }
  const maxBytes = blockLimit ? Number(blockLimit) : undefined;
  if (blockLimit && (!Number.isInteger(maxBytes) || maxBytes < 25000 || maxBytes > 4000000)) {
    throw new Error("Limite de bloco fora da faixa.");
  }
  const summary = await prepare({
    root,
    output,
    org,
    maxBytes,
    ...(option === "--cadastro" ? { canonicalPath: input } : { mapPath: input }),
  });
  console.log(JSON.stringify(summary));
}
