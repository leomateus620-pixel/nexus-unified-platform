import assert from "node:assert/strict";
import { spawnSync } from "node:child_process";
import { createHash, randomUUID } from "node:crypto";
import { mkdtemp, readFile, rm, writeFile } from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import { fileURLToPath } from "node:url";
import postgres from "postgres";

if (
  process.env.PGTEST_EPHEMERAL !== "1" ||
  process.env.PGTEST_HOST !== "127.0.0.1" ||
  !/^\d{4,5}$/.test(process.env.PGTEST_PORT ?? "") ||
  process.env.PGTEST_PORT === "5432"
)
  throw new Error("Storage confirmation tests require isolated loopback PostgreSQL.");
const sql = postgres({
  host: "127.0.0.1",
  port: Number(process.env.PGTEST_PORT),
  user: "postgres",
  database: process.env.PGTEST_DATABASE || "postgres",
  prepare: false,
  max: 1,
  onnotice: () => {},
});
const directory = await mkdtemp(path.join(os.tmpdir(), "nexus-storage-confirm-db-test-"));
const script = fileURLToPath(
  new URL("../../scripts/nr/prepare-storage-confirmation.mjs", import.meta.url),
);
const org = randomUUID(),
  client = randomUUID(),
  unit = randomUUID();
const rollback = new Error("Intentional rollback of isolated fixtures");
let checks = 0;
try {
  try {
    await sql.begin(async (tx) => {
      await tx`insert into public.organizations(id,nome)values(${org},'Synthetic Storage confirmation test')`;
      await tx`insert into public.clientes(id,organization_id,razao_social)values(${client},${org},'Synthetic client')`;
      await tx`insert into public.unidades(id,organization_id,cliente_id,nome)values(${unit},${org},${client},'Synthetic unit')`;
      const files = [];
      for (const n of [1, 2]) {
        const data = {
          cliente_id: client,
          unidade_id: unit,
          normas: ["NR33"],
          nome: `synthetic-${n}.pdf`,
          mime: "application/pdf",
          tamanho: n * 10,
          sha256: String(n).repeat(64),
          papel: "original",
        };
        const file = (
          await tx`select public.nr_arquivo_importar_preparar(${org},${randomUUID()},${tx.json(data)}) as arquivo`
        )[0].arquivo;
        files.push(file);
        await tx`insert into storage.objects(bucket_id,name,metadata)values('nexus-nr-acervo',${file.caminho},${tx.json({ size: data.tamanho, mimetype: data.mime })})`;
      }
      const canonical = files
        .map((file) => ({
          arquivo_id: file.id,
          caminho: file.caminho,
          mime: file.mime,
          tamanho: Number(file.tamanho),
          sha256: file.sha256,
        }))
        .sort((a, b) => a.arquivo_id.localeCompare(b.arquivo_id));
      const proof = {
        format: "nexus-storage-readback-receipt-v1",
        project_ref: "yhtgijtllvgzoqtfcgal",
        bucket: "nexus-nr-acervo",
        canonical_sha256: createHash("sha256").update(JSON.stringify(canonical)).digest("hex"),
        verified: 2,
        bytes: 30,
        errors: 0,
        manifest_mismatches: 0,
        unfinished: 0,
        source_message_id: "synthetic-db-contract-only",
      };
      await writeFile(path.join(directory, "storage-prepared.json"), JSON.stringify(files));
      await writeFile(path.join(directory, "storage-proof.json"), JSON.stringify(proof));
      const prepared = spawnSync(process.execPath, [script, directory, org], {
        encoding: "utf8",
        env: {},
        timeout: 10000,
      });
      assert.equal(prepared.status, 0, prepared.stderr);
      checks++;
      const plan = JSON.parse(
        await readFile(path.join(directory, "plans/storage-confirmar.json"), "utf8"),
      );
      let preflight = (await tx.unsafe(plan.preflight))[0];
      assert.equal(Number(preflight.encontrados), 2);
      assert.equal(Number(preflight.objetos_compativeis), 2);
      checks++;
      await tx`update storage.objects set metadata=${tx.json({ size: 999, mimetype: "text/html" })} where bucket_id='nexus-nr-acervo' and name=${files[1].caminho}`;
      preflight = (await tx.unsafe(plan.preflight))[0];
      assert.equal(Number(preflight.encontrados), 2);
      assert.equal(Number(preflight.objetos_compativeis), 1);
      checks++;
      await assert.rejects(
        tx.savepoint(async (sp) => sp.unsafe(plan.batches[0])),
        (error) => error.code === "23514",
      );
      checks++;
      assert.equal(
        Number(
          (
            await tx`select count(*)as n from public.nr_arquivos where organization_id=${org} and estado='preparado'`
          )[0].n,
        ),
        2,
      );
      checks++;
      await tx`update storage.objects set metadata=${tx.json({ size: files[1].tamanho, mimetype: files[1].mime })} where bucket_id='nexus-nr-acervo' and name=${files[1].caminho}`;
      assert.equal(Number((await tx.unsafe(plan.batches[0]))[0].confirmados), 2);
      checks++;
      const readback = await tx.unsafe(plan.readback);
      assert.equal(readback.length, 1);
      assert.equal(readback[0].estado, "vinculado");
      assert.equal(Number(readback[0].arquivos), 2);
      assert.equal(Number(readback[0].bytes), 30);
      checks++;
      assert.equal(Number((await tx.unsafe(plan.batches[0]))[0].confirmados), 2);
      checks++;
      assert.equal(
        Number(
          (
            await tx`select count(*)as n from public.nr_arquivos where organization_id=${org} and estado='vinculado' and bytes_verificados`
          )[0].n,
        ),
        2,
      );
      checks++;
      throw rollback;
    });
  } catch (error) {
    if (error !== rollback) throw error;
  }
  assert.equal(
    Number((await sql`select count(*)as n from public.organizations where id=${org}`)[0].n),
    0,
  );
  checks++;
  console.log(
    JSON.stringify({
      suite: "NR Storage confirmation plans",
      checks,
      passed: true,
      scope:
        "isolated PostgreSQL and synthetic Storage metadata; does not prove HTTP bytes; fixtures rolled back",
    }),
  );
} finally {
  await sql.end();
  await rm(directory, { recursive: true, force: true });
}
