import { test } from "node:test";
import assert from "node:assert/strict";
import { mkdtemp, mkdir, writeFile, readFile, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import path from "node:path";
import { createHash } from "node:crypto";
import { execFileSync } from "node:child_process";
const id = (n) => `c7330000-0000-4000-8000-${String(n).padStart(12, "0")}`;
test("a shared folder and matching filename remain candidates; photos never fan out to its locals", async () => {
  const root = await mkdtemp(path.join(tmpdir(), "nr-photo-reconcile-"));
  const write = (name, value) => writeFile(path.join(root, name), JSON.stringify(value));
  const run = (name, ...args) =>
    execFileSync(process.execPath, [`scripts/nr/${name}`, root, ...args], { stdio: "pipe" });
  try {
    await mkdir(path.join(root, "originals"));
    await mkdir(path.join(root, "folders"));
    const bytes = Buffer.from("isolated-byte-fixture"),
      hash = createHash("sha256").update(bytes).digest("hex");
    await writeFile(path.join(root, "image.bin"), bytes);
    const db = {
      clientes: [{ id: "client", unidades: [{ id: "unit" }] }],
      locais: [
        { id: "local-1", unidade_id: "unit", tipo: "EC" },
        { id: "local-2", unidade_id: "unit", tipo: "EC" },
      ],
      documentos: [],
    };
    const references = [
      {
        id: "drive:shared",
        external_id: "shared",
        tipo: "pasta",
        associacoes: [
          { caminho_json: "/locais/0/arquivos/0" },
          { caminho_json: "/locais/1/arquivos/0" },
        ],
      },
      {
        id: "source-path:fotos/unit/image.jpg",
        tipo: "foto",
        caminho_original: "fotos/unit/image.jpg",
        associacoes: [{ caminho_json: "/locais/0/fotos/0/arquivo" }],
      },
    ];
    await write("source-db.json", db);
    await write("inventory.json", {
      references,
      snapshot_sha256: "a".repeat(64),
      captured_at: "2026-10-31T00:00:00Z",
    });
    await write("mappings.json", [
      { tipo: "cliente", externo_id: "client", destino_id: id(2) },
      { tipo: "unidade", externo_id: "unit", destino_id: id(3) },
      { tipo: "local", externo_id: "unit/local-1", destino_id: id(4) },
      { tipo: "local", externo_id: "unit/local-2", destino_id: id(5) },
      { tipo: "pasta_origem", externo_id: "unit/drive:shared", destino_id: id(6) },
    ]);
    await write("lot.json", { lote_id: id(7) });
    await write("originals/image.json", {
      id: "image",
      name: "image.jpg",
      path: path.join(root, "image.bin"),
      estado: "validado",
      bytes: bytes.length,
      sha256: hash,
      mime_detectado: "image/jpeg",
      capturado_em: "2026-10-31T00:00:00Z",
    });
    await write("folders/shared.json", {
      id: "shared",
      metadata: { title: "Shared" },
      listing: { files: [{ id: "image", title: "image.jpg", mime_type: "image/jpeg" }] },
    });
    run("reconcile-files.mjs");
    const candidates = JSON.parse(await readFile(path.join(root, "photo-mappings.json")));
    assert.equal(candidates[0].estado, "candidata_nome_em_pasta");
    run("prepare-files.mjs", id(1));
    const destinations = JSON.parse(await readFile(path.join(root, "file-destinations.json")));
    assert.equal(destinations.files.length, 1);
    const file = destinations.files[0];
    assert.equal(file.metadata.local_id, undefined);
    assert.ok(
      file.bindings.every(
        (binding) =>
          !binding.local_externo &&
          !binding.doc_externo &&
          binding.vinculo_fotografico === "somente_pasta",
      ),
    );
    // A pre-fix staging payload must also remain safe when only the links planner is rerun.
    file.bindings.push({
      unit: "unit",
      local_externo: "unit/local-2",
      pasta_externa: "unit/drive:shared",
      evidencia: "/locais/1/pasta → Drive list_folder shared/image",
    });
    await write("file-destinations.json", destinations);
    await write("storage-prepared.json", [{ chave: file.chave, id: id(8) }]);
    await write("document-revisions.json", []);
    run("prepare-file-links.mjs", id(1));
    const plan = JSON.parse(await readFile(path.join(root, "plans/arquivos-vincular.json")));
    assert.ok(
      plan.batches.every((batch) => !batch.includes("local_id") && !batch.includes("documento_id")),
    );
    assert.ok(plan.batches.every((batch) => batch.includes("pasta_id")));
  } finally {
    await rm(root, { recursive: true, force: true });
  }
});
