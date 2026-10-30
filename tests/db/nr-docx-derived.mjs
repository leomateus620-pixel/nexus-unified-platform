import assert from "node:assert/strict";
import { randomUUID, createHash } from "node:crypto";
import { mkdtemp, readFile, rm, writeFile } from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import postgres from "postgres";
import { prepareDocxDerived } from "../../scripts/nr/prepare-docx-derived.mjs";
import { compileDocxDerivedRecord } from "../../scripts/nr/compile-docx-derived.mjs";
import { SOURCE, digest } from "../../scripts/nr/inventory.mjs";
if (
  process.env.PGTEST_EPHEMERAL !== "1" ||
  process.env.PGTEST_HOST !== "127.0.0.1" ||
  !/^\d{4,5}$/.test(process.env.PGTEST_PORT ?? "") ||
  process.env.PGTEST_PORT === "5432"
)
  throw Error("Disposable loopback PostgreSQL required");
const sql = postgres({
  host: "127.0.0.1",
  port: Number(process.env.PGTEST_PORT),
  user: "postgres",
  database: process.env.PGTEST_DATABASE || "postgres",
  max: 1,
  prepare: false,
  onnotice: () => {},
});
const directory = await mkdtemp(path.join(os.tmpdir(), "nexus-derived-db-"));
const hash = (bytes) => createHash("sha256").update(bytes).digest("hex");
const org = randomUUID(),
  client = randomUUID(),
  unit = randomUUID(),
  local = randomUUID(),
  engineer = randomUUID();
const source = Buffer.from(
  "PK-synthetic-original-metadata fixture; no Storage HTTP or Office conversion claim",
);
const image = Buffer.from(
  "iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mP8/x8AAwMCAO+aB7sAAAAASUVORK5CYII=",
  "base64",
);
const rollback = Symbol("rollback");
let assertions = 0;
const json = async (name, value) =>
  writeFile(path.join(directory, name), JSON.stringify(value), { mode: 0o600 });
try {
  await sql
    .begin(async (tx) => {
      await tx`insert into auth.users(id,email)values(${engineer},'derived-isolated@test.invalid')`;
      await tx`insert into public.organizations(id,nome)values(${org},'Derived isolated')`;
      await tx`insert into public.memberships(organization_id,user_id)values(${org},${engineer})`;
      await tx`insert into public.user_roles(organization_id,user_id,role)values(${org},${engineer},'engenharia')`;
      await tx`insert into public.clientes(id,organization_id,razao_social)values(${client},${org},'Synthetic client')`;
      await tx`insert into public.unidades(id,organization_id,cliente_id,nome)values(${unit},${org},${client},'Synthetic unit')`;
      await tx`insert into public.nr_locais(id,organization_id,cliente_id,unidade_id,normas,titulo)values(${local},${org},${client},${unit},array['NR33'],'Synthetic local')`;
      const lot = (
        await tx`select public.nr_iniciar_importacao(${org},${SOURCE},${randomUUID()},now(),now(),'{}'::jsonb) id`
      )[0].id;
      const originalPayload = { fixture: "Issued source remains unchanged" };
      const original = (
        await tx`select public.nr_importar_item(${org},${lot},'registro_documental','synthetic-unit/original-issued',${tx.json(originalPayload)},${tx.json({ entidade: "documentos", registro: { cliente_id: client, unidade_id: unit, normas: ["NR33"], titulo: "Issued original", estado: "emitido_origem" }, revisao: { numero: 3, conteudo: { schema_version: 1, blocos: [{ id: "original", tipo: "paragrafo", texto: "Historical issued snapshot" }] }, snapshot: originalPayload } })},${digest(originalPayload)},now()) r`
      )[0].r;
      assert.equal(original.resultado, "importado");
      assertions++;
      const originalDoc = (
        await tx`select * from public.nr_documentos where id=${original.destino_id}`
      )[0];
      const originalBefore = (
        await tx`select md5(to_jsonb(v)::text) as hash from public.nr_documento_revisoes v where id=${originalDoc.revisao_atual_id}`
      )[0].hash;
      async function prepare(name, mime, bytes, extra = {}, confirmed = true) {
        const metadata = {
          cliente_id: client,
          unidade_id: unit,
          normas: ["NR33"],
          nome: name,
          mime,
          tamanho: bytes.length,
          sha256: hash(bytes),
          papel: name.endsWith(".png") ? "derivado" : "original",
          lote_id: lot,
          ...extra,
        };
        const f = (
          await tx`select public.nr_arquivo_importar_preparar(${org},${randomUUID()},${tx.json(metadata)}) r`
        )[0].r;
        if (!confirmed) return f;
        await tx`insert into storage.objects(bucket_id,name,metadata)values('nexus-nr-acervo',${f.caminho},${tx.json({ size: f.tamanho, mimetype: f.mime })})`;
        return (
          await tx`select public.nr_arquivo_importar_confirmar(${org},${f.id},${f.sha256},${f.tamanho},${f.mime}) r`
        )[0].r;
      }
      const docxMime = "application/vnd.openxmlformats-officedocument.wordprocessingml.document";
      const first = await prepare("issued-source.docx", docxMime, source, {
        documento_id: originalDoc.id,
        revisao_id: originalDoc.revisao_atual_id,
      });
      const second = await prepare("received-source.docx", docxMime, source, { local_id: local });
      const img = await prepare("extracted.png", "image/png", image);
      const pending = await prepare("not-confirmed.png", "image/png", image, {}, false);
      const sourcePath = path.join(directory, "original.bin"),
        imagePath = path.join(directory, "image.png");
      await writeFile(sourcePath, source);
      await writeFile(imagePath, image);
      const audit = { files: [] };
      const index = {
        format: "nexus-docx-conversions/1",
        converter: "synthetic-converter-1",
        captured_at: "2026-10-30T00:00:00Z",
        records: [],
      };
      for (const [n, file] of [first, second].entries()) {
        const binding = {
          arquivo_id: file.id,
          source_id: "synthetic-file-" + n,
          source_unit: "synthetic-unit",
          cliente_id: client,
          unidade_id: unit,
          normas: ["NR33"],
          sha256: hash(source),
          local_path: sourcePath,
          nome: "Synthetic.docx",
          documentos:
            n === 0
              ? [
                  {
                    externo_id: "synthetic-unit/original-issued",
                    documento_id: originalDoc.id,
                    revisao_id: originalDoc.revisao_atual_id,
                  },
                ]
              : [],
          locais: [{ local_id: local }],
          pastas: [],
        };
        audit.files.push(binding);
        const conversion = {
          format: "nexus-docx-conversion/1",
          converter: index.converter,
          arquivo_id: file.id,
          source_id: binding.source_id,
          source_unit: binding.source_unit,
          source_sha256: hash(source),
          source_bytes: source.length,
          conteudo: {
            schema_version: 1,
            blocos: [
              { id: "text", tipo: "paragrafo", texto: "Preserved converted content" },
              {
                id: "image",
                tipo: "referencia",
                chave: "word/media/image.png",
                texto: "Awaiting verified asset",
              },
            ],
          },
          avisos: ["Synthetic conversion limitations remain visible"],
          assets: [
            {
              chave: "word/media/image.png",
              nome: "image.png",
              mime: "image/png",
              tamanho: image.length,
              sha256: hash(image),
              local_path: imagePath,
            },
          ],
        };
        await json("conversion-" + n + ".json", conversion);
        index.records.push({
          ...binding,
          source_sha256: binding.sha256,
          source_bytes: source.length,
          resultado: "convertido",
          conversion_path: path.join(directory, "conversion-" + n + ".json"),
        });
      }
      await json("docx-bindings-audit.json", audit);
      await json("index.json", index);
      await json("images.json", [img]);
      await prepareDocxDerived({
        privateDir: directory,
        organizationId: org,
        lotId: lot,
        conversionsPath: path.join(directory, "index.json"),
        imagesPath: path.join(directory, "images.json"),
      });
      const plans = JSON.parse(
        await readFile(path.join(directory, "docx-derived-plans/phase-documents.json"), "utf8"),
      ).records;
      assert.equal(plans.length, 2);
      assertions++;
    const wrongSource = structuredClone(plans[0]);
    wrongSource.rpc.args.p_payload.documentos_originais[0].externo_id = "synthetic-unit/unrelated-original";
    wrongSource.rpc.args.p_destino.registro.dados.documentos_originais = structuredClone(wrongSource.rpc.args.p_payload.documentos_originais);
    wrongSource.rpc.args.p_destino.revisao.snapshot = structuredClone(wrongSource.rpc.args.p_payload);
    wrongSource.rpc.args.p_hash = wrongSource.sha256_payload = digest(wrongSource.rpc.args.p_payload);
    wrongSource.after_success_only.find(command => command.nome === "nr_vincular_documentos_importados").args.p_externo_para = "synthetic-unit/unrelated-original";
    await assert.rejects(() => tx.savepoint(s => s.unsafe(compileDocxDerivedRecord(wrongSource))), error => error.code === "23514");
    assertions++;
      const invalid = structuredClone(plans[0]);
      invalid.guard.imagens[0].id = pending.id;
      invalid.rpc.args.p_payload.conteudo.blocos[1].arquivo_id = pending.id;
      invalid.rpc.args.p_payload.assets[0].arquivo_id = pending.id;
      invalid.rpc.args.p_destino.revisao.conteudo = structuredClone(
        invalid.rpc.args.p_payload.conteudo,
      );
      invalid.rpc.args.p_destino.revisao.snapshot = structuredClone(invalid.rpc.args.p_payload);
      invalid.rpc.args.p_hash = invalid.sha256_payload = digest(invalid.rpc.args.p_payload);
      invalid.after_success_only = invalid.after_success_only.filter(
        (c) => c.nome !== "nr_arquivo_importar_vinculo" || c.args.p_arquivo !== img.id,
      );
      await assert.rejects(
        () => tx.savepoint((s) => s.unsafe(compileDocxDerivedRecord(invalid))),
        (e) => e.code === "23514",
      );
      assertions++;
      assert.equal(
        (await tx`select count(*)::int n from public.nr_documentos where organization_id=${org}`)[0]
          .n,
        1,
      );
      assertions++;
      for (const plan of plans) await tx.unsafe(compileDocxDerivedRecord(plan));
      assert.equal(
        (await tx`select count(*)::int n from public.nr_documentos where organization_id=${org}`)[0]
          .n,
        3,
      );
      assertions++;
      assert.equal(
        (
          await tx`select count(*)::int n from public.nr_documento_relacoes where organization_id=${org}`
        )[0].n,
        1,
      );
      assertions++;
      const content =
        await tx`select conteudo from public.nr_documento_revisoes where organization_id=${org} and documento_id<>${originalDoc.id} order by id`;
      assert.ok(
        content.every(
          (r) =>
            r.conteudo.blocos[1].tipo === "imagem" && r.conteudo.blocos[1].arquivo_id === img.id,
        ),
      );
      assertions++;
      const beforeLinks = (
        await tx`select count(*)::int n from public.nr_arquivo_vinculos where organization_id=${org}`
      )[0].n;
      for (const plan of plans) await tx.unsafe(compileDocxDerivedRecord(plan));
      assert.equal(
        (await tx`select count(*)::int n from public.nr_documentos where organization_id=${org}`)[0]
          .n,
        3,
      );
      assertions++;
      assert.equal(
        (
          await tx`select count(*)::int n from public.nr_arquivo_vinculos where organization_id=${org}`
        )[0].n,
        beforeLinks,
      );
      assertions++;
      const f = (
        await tx`select * from public.nr_fontes where organization_id=${org} and externo_id=${plans[1].externo_id}`
      )[0];
      const d = (await tx`select * from public.nr_documentos where id=${f.destino_id}`)[0];
      await tx`select set_config('request.jwt.claim.sub',${engineer},true)`;
      const edit = (
        await tx`select public.nr_executar(${org},'NR33','documentos','salvar',${d.id},${d.version},${randomUUID()},${tx.json({ conteudo: { schema_version: 1, blocos: [{ id: "user", tipo: "paragrafo", texto: "Later Nexus edit must survive" }] } })}) r`
      )[0].r;
      const revision = (
        await tx`select public.nr_executar(${org},'NR33','documentos','nova_revisao',${d.id},${edit.version},${randomUUID()},${tx.json({ motivo: "Synthetic later user revision" })}) r`
      )[0].r;
      assert.notEqual(revision.revisao_atual_id, f.snapshot_destino.revisao_atual_id);
      assertions++;
      await tx.unsafe(compileDocxDerivedRecord(plans[1]));
      assert.equal(
        (
          await tx`select conteudo from public.nr_documento_revisoes where id=${revision.revisao_atual_id}`
        )[0].conteudo.blocos[0].texto,
        "Later Nexus edit must survive",
      );
      assertions++;
      assert.equal(
        (
          await tx`select count(*)::int n from public.nr_arquivo_vinculos where organization_id=${org}`
        )[0].n,
        beforeLinks,
      );
      assertions++;
      const changed = structuredClone(plans[1]);
      changed.rpc.args.p_payload.conteudo.blocos[0].texto = "Changed source conversion";
      changed.rpc.args.p_destino.revisao.conteudo = structuredClone(
        changed.rpc.args.p_payload.conteudo,
      );
      changed.rpc.args.p_destino.revisao.snapshot = structuredClone(changed.rpc.args.p_payload);
      changed.rpc.args.p_hash = changed.sha256_payload = digest(changed.rpc.args.p_payload);
      await tx.unsafe(compileDocxDerivedRecord(changed));
      assert.equal(
        (
          await tx`select resultado from public.nr_import_itens where organization_id=${org} and externo_id=${plans[1].externo_id}`
        )[0].resultado,
        "conflito",
      );
      assertions++;
      assert.equal(
        (
          await tx`select md5(to_jsonb(v)::text)hash from public.nr_documento_revisoes v where id=${originalDoc.revisao_atual_id}`
        )[0].hash,
        originalBefore,
      );
      assertions++;
      assert.equal(
        (
          await tx`select conteudo from public.nr_documento_revisoes where id=${revision.revisao_atual_id}`
        )[0].conteudo.blocos[0].texto,
        "Later Nexus edit must survive",
      );
      assertions++;
      throw rollback;
    })
    .catch((error) => {
      if (error !== rollback) throw error;
    });
  assert.equal(
    (await sql`select count(*)::int n from public.organizations where id=${org}`)[0].n,
    0,
  );
  assertions++;
  console.log(
    JSON.stringify({
      suite: "DOCX derived import envelopes PostgreSQL",
      assertions,
      passed: true,
      scope:
        "Synthetic fixtures inside disposable local transaction rolled back; exact original/revision/image guards, separate derivatives, native images, retry, later edit/new revision, three-way conflict and issued-source immutability. No Storage HTTP or source-document conversion claim.",
    }),
  );
} finally {
  await rm(directory, { recursive: true, force: true });
  await sql.end({ timeout: 3 });
}
