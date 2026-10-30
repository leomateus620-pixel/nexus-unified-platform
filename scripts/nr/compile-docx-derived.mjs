#!/usr/bin/env node
/** Compiles guarded private DML envelopes for the authorized Lovable executor; never executes SQL. */
import { readFile, realpath, writeFile } from "node:fs/promises";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { SOURCE, canonical, digest } from "./inventory.mjs";
const UUID = /^[a-f0-9]{8}-[a-f0-9]{4}-[a-f0-9]{4}-[a-f0-9]{4}-[a-f0-9]{12}$/i;
const q = (value) => `'${String(value).replaceAll("'", "''")}'`;
const j = (value) => `${q(JSON.stringify(value))}::jsonb`;
function assert(condition, message) {
  if (!condition) throw new Error(message);
}
export function compileDocxDerivedRecord(record) {
  assert(
    record.resultado === "planejado_com_precondicoes" && record.rpc?.nome === "nr_importar_item",
    "Only complete derivative plans can be compiled.",
  );
  const a = record.rpc.args,
    payload = a.p_payload,
    destination = a.p_destino;
  assert(
    UUID.test(a.p_org) && UUID.test(a.p_lote) && a.p_tipo === "registro_documental",
    "Invalid organization/lot/type.",
  );
  assert(
    a.p_externo_id ===
      `derivado-docx/${payload.source_unit}/drive:${payload.source_id}/${payload.converter}` &&
      payload.tipo === "derivado_docx_editavel",
    "Derivative namespace must remain separate from the original.",
  );
  assert(
    a.p_hash === digest(payload) && record.sha256_payload === a.p_hash,
    "Conversion payload hash disagrees.",
  );
  assert(
    destination.entidade === "documentos" &&
      destination.registro.estado === "rascunho" &&
      destination.registro.recebimento === "nativo",
    "A conversion creates only a native draft derivative.",
  );
  assert(
    canonical(destination.revisao.conteudo) === canonical(payload.conteudo) &&
      canonical(destination.revisao.snapshot) === canonical(payload),
    "Editable content/snapshot differ from the hashed conversion.",
  );
  assert(
    canonical(payload.contexto) ===
      canonical({
        cliente_id: destination.registro.cliente_id,
        unidade_id: destination.registro.unidade_id,
        normas: [...destination.registro.normas].sort(),
      }) &&
      destination.registro.local_id === payload.local_id &&
      destination.registro.pasta_id === payload.pasta_id,
    "Destination context/relationships differ from the hashed conversion.",
  );
  const original = record.guard.original;
  assert(
    original.id === payload.arquivo_original_id &&
      original.sha256 === payload.source_sha256 &&
      original.organization_id === a.p_org &&
      original.cliente_id === destination.registro.cliente_id &&
      original.unidade_id === destination.registro.unidade_id,
    "Original guard does not match derivative context/source.",
  );
  assert(
    original.mime === "application/vnd.openxmlformats-officedocument.wordprocessingml.document" &&
      original.tamanho === payload.source_bytes,
    "Original guard MIME/size differ from source conversion.",
  );
  const metadata = destination.registro.dados;
  assert(
    metadata.arquivo_original_id === payload.arquivo_original_id &&
      metadata.converter === payload.converter &&
      canonical(metadata.avisos_conversao) === canonical(payload.avisos) &&
      canonical(metadata.documentos_originais) === canonical(payload.documentos_originais),
    "Derived provenance/limitations differ from hashed source.",
  );
  const guards = [original, ...record.guard.imagens];
  assert(
    guards.every(
      (g) =>
        UUID.test(g.id) &&
        g.organization_id === a.p_org &&
        g.cliente_id === original.cliente_id &&
        g.unidade_id === original.unidade_id &&
        g.estado === "vinculado" &&
        g.bytes_verificados === true,
    ),
    "Invalid file guard/context.",
  );
  const images = new Map(record.guard.imagens.map((g) => [g.id, g]));
  assert(
    payload.assets.length === record.guard.imagens.length,
    "Image proof and guard count disagree.",
  );
  for (const asset of payload.assets) {
    const image = images.get(asset.arquivo_id);
    assert(
      image &&
        ["image/png", "image/jpeg", "image/webp"].includes(image.mime) &&
        image.sha256 === asset.sha256 &&
        image.mime === asset.mime &&
        image.tamanho === asset.tamanho,
      "Image proof differs from guarded bytes/context.",
    );
  }
  for (const block of payload.conteudo.blocos)
    if (block.tipo === "imagem")
      assert(images.has(block.arquivo_id), "Native image lacks an explicit verified guard.");
  for (const after of record.after_success_only) {
    const b = after.args;
    assert(b.p_org === a.p_org, "Cross-organization post-import command.");
    if (after.nome === "nr_arquivo_importar_vinculo") {
      assert(
        guards.some((g) => g.id === b.p_arquivo),
        "Post-import file is not a guarded source/image.",
      );
      assert(
        b.p_destino.documento_id?.$ref === "resultado.destino_id" &&
          b.p_destino.revisao_id?.$ref === "fonte.snapshot_destino.revisao_atual_id",
        "Post-import revision must use the frozen imported source mapping.",
      );
      assert(
        (b.p_destino.local_id ?? null) === payload.local_id &&
          (b.p_destino.pasta_id === undefined || b.p_destino.pasta_id === payload.pasta_id),
        "Post-import local/folder lacks the source relationship.",
      );
    } else if (after.nome === "nr_vincular_documentos_importados") {
      assert(
        b.p_origem === SOURCE &&
          b.p_tipo === a.p_tipo &&
          b.p_externo_de === a.p_externo_id &&
          b.p_relacao === "referencia" &&
          payload.documentos_originais.some((o) => o.externo_id === b.p_externo_para),
        "Document relation must reference an explicit original.",
      );
    } else throw new Error("Unexpected post-import command.");
  }
  const data = { args: a, guard: record.guard, after: record.after_success_only };
  let delimiter = "$nr_docx_0$";
  while (JSON.stringify(data).includes(delimiter))
    delimiter = delimiter.replace(/(\d+)\$$/, (_, n) => `${Number(n) + 1}$`);
  return `DO ${delimiter}
declare p jsonb:=${j(data)};a jsonb;g jsonb;src jsonb;cmd jsonb;b jsonb;r jsonb;dest uuid;rev uuid;f public.nr_arquivos;expected_source uuid;
begin
 a:=p->'args';
 -- Stable global file ordering also serializes archiving/association without lock upgrades.
 for g in select value from jsonb_array_elements(jsonb_build_array(p->'guard'->'original')||(p->'guard'->'imagens')) order by value->>'id' loop
  select * into f from public.nr_arquivos where organization_id=(a->>'p_org')::uuid and id=(g->>'id')::uuid for update;
  if not found or f.cliente_id is distinct from(g->>'cliente_id')::uuid or f.unidade_id is distinct from(g->>'unidade_id')::uuid or f.sha256 is distinct from g->>'sha256' or f.mime is distinct from g->>'mime' or f.tamanho is distinct from(g->>'tamanho')::bigint or f.estado<>'vinculado' or not f.bytes_verificados or f.arquivado_em is not null then raise exception 'Original/imagem ainda não confirmado ou contexto/integridade divergente.'using errcode='23514';end if;
 end loop;
 for src in select value from jsonb_array_elements(a->'p_payload'->'documentos_originais') loop
  expected_source:=(src->>'documento_id')::uuid;
  if not exists(select 1 from public.nr_documentos d join public.nr_documento_revisoes v on v.organization_id=d.organization_id and v.documento_id=d.id and v.id=(src->>'revisao_id')::uuid where d.organization_id=(a->>'p_org')::uuid and d.id=expected_source and d.cliente_id=(p->'guard'->'original'->>'cliente_id')::uuid and d.unidade_id=(p->'guard'->'original'->>'unidade_id')::uuid and exists(select 1 from public.nr_fontes s where s.organization_id=d.organization_id and s.origem=${q(SOURCE)} and s.tipo='registro_documental' and s.externo_id=src->>'externo_id' and s.destino_tipo='documentos' and s.destino_id=d.id)and exists(select 1 from public.nr_arquivos x where x.organization_id=d.organization_id and x.id=(p->'guard'->'original'->>'id')::uuid and ((x.documento_id=d.id and x.revisao_id=v.id)or exists(select 1 from public.nr_arquivo_vinculos l where l.organization_id=x.organization_id and l.arquivo_id=x.id and l.documento_id=d.id and l.revisao_id=v.id))))then raise exception 'Relação documental de origem não confirmada por ID/revisão.'using errcode='23514';end if;
 end loop;
 r:=public.nr_importar_item((a->>'p_org')::uuid,(a->>'p_lote')::uuid,a->>'p_tipo',a->>'p_externo_id',a->'p_payload',a->'p_destino',a->>'p_hash',(a->>'p_capturado_em')::timestamptz);
 -- Keep the importer's conflict/error item; never create links after a failed import.
 if r->>'resultado' not in('importado','ja_existente')then return;end if;
 dest:=(r->>'destino_id')::uuid;
 select (s.snapshot_destino->>'revisao_atual_id')::uuid into rev from public.nr_fontes s where s.organization_id=(a->>'p_org')::uuid and s.origem=${q(SOURCE)} and s.tipo=a->>'p_tipo' and s.externo_id=a->>'p_externo_id' and s.sha256=a->>'p_hash' and s.destino_id=dest and s.destino_tipo='documentos';
 if rev is null or not exists(select 1 from public.nr_documento_revisoes v where v.organization_id=(a->>'p_org')::uuid and v.documento_id=dest and v.id=rev)or exists(select 1 from jsonb_array_elements(a->'p_payload'->'documentos_originais') o where(o->>'documento_id')::uuid=dest)then raise exception 'Revisão derivada congelada indisponível; original não pode ser substituído.'using errcode='23514';end if;
 for cmd in select value from jsonb_array_elements(p->'after')loop
  b:=cmd->'args';
  if cmd->>'nome'='nr_arquivo_importar_vinculo'then
   perform public.nr_arquivo_importar_vinculo((b->>'p_org')::uuid,(b->>'p_arquivo')::uuid,b->>'p_chave',jsonb_set(jsonb_set(b->'p_destino','{documento_id}',to_jsonb(dest)),'{revisao_id}',to_jsonb(rev)),b->'p_evidencia');
  elsif cmd->>'nome'='nr_vincular_documentos_importados'then
   perform public.nr_vincular_documentos_importados((b->>'p_org')::uuid,b->>'p_origem',b->>'p_tipo',b->>'p_externo_de',b->>'p_externo_para',b->>'p_relacao',b->'p_evidencia');
  end if;
 end loop;
end
${delimiter};\n`;
}
export async function compileDocxDerivedPlan(filename, outputPath) {
  const repo = await realpath(path.resolve(path.dirname(fileURLToPath(import.meta.url)), "../.."));
  const file = await realpath(filename),
    parent = await realpath(path.dirname(outputPath));
  const inside = (p, c) => c === p || c.startsWith(p + path.sep);
  assert(
    path.isAbsolute(filename) &&
      path.isAbsolute(outputPath) &&
      !inside(repo, file) &&
      !inside(repo, parent),
    "Private conversion plans must remain outside Git.",
  );
  const source = JSON.parse(await readFile(file, "utf8"));
  assert(
    source.format === "nexus-docx-derived-plan/1" && Array.isArray(source.records),
    "Unknown conversion plan.",
  );
  const batches = [];
  let current = "";
  let count = 0;
  const pending = [];
  for (const record of source.records) {
    if (record.resultado !== "planejado_com_precondicoes") {
      pending.push({ arquivo_id: record.arquivo_id, resultado: record.resultado });
      continue;
    }
    const sql = compileDocxDerivedRecord(record);
    if (current && Buffer.byteLength(current + sql) > 180000) {
      batches.push(current);
      current = "";
    }
    current += sql;
    count++;
  }
  if (current) batches.push(current);
  const result = {
    format: "nexus-docx-derived-envelopes/1",
    converter: source.converter,
    organization_id: source.organization_id,
    lote_id: source.lote_id,
    count,
    pending,
    batches,
    executado: false,
  };
  await writeFile(path.join(parent, path.basename(outputPath)), JSON.stringify(result), {
    mode: 0o600,
  });
  return {
    count,
    pending: pending.length,
    batches: batches.length,
    max_batch_bytes: Math.max(0, ...batches.map((b) => Buffer.byteLength(b))),
    executado: false,
  };
}
if (process.argv[1] && path.resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  if (!process.argv[2] || !process.argv[3])
    throw Error(
      "Usage: compile-docx-derived.mjs PRIVATE_PHASE_DOCUMENTS_JSON PRIVATE_ENVELOPES_JSON",
    );
  console.log(JSON.stringify(await compileDocxDerivedPlan(process.argv[2], process.argv[3])));
}
