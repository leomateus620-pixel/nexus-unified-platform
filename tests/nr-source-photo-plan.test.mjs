import assert from "node:assert/strict";
import { mkdtemp, mkdir, readFile, rm, writeFile } from "node:fs/promises";
import { spawnSync } from "node:child_process";
import { createHash } from "node:crypto";
import path from "node:path";
import os from "node:os";
import test from "node:test";
import { zipSync } from "fflate";
import { SOURCE, digest } from "../scripts/nr/inventory.mjs";
const python = process.env.NEXUS_IMAGE_PYTHON || "python3";
const pillow = spawnSync(python, ["-c", "import PIL"], { encoding: "utf8" }).status === 0;
const org = "10000000-0000-4000-8000-000000000001",
  client = "20000000-0000-4000-8000-000000000001",
  unit = "21000000-0000-4000-8000-000000000001",
  local = "33000000-0000-4000-8000-000000000001";
const hash = (bytes) => createHash("sha256").update(bytes).digest("hex");
async function fixture(work) {
  const directory = await mkdtemp(path.join(os.tmpdir(), "nexus-source-photos-"));
  try {
    await mkdir(path.join(directory, "source-thumbnails"));
    const image = path.join(directory, "source-thumbnails/test__thumb__field.jpg");
    const generated = spawnSync(
      python,
      [
        "-c",
        "import sys;from PIL import Image;Image.new('RGB',(60,100),(44,77,90)).save(sys.argv[1],format='JPEG')",
        image,
      ],
      { encoding: "utf8" },
    );
    assert.equal(generated.status, 0);
    const photo = {
      arquivo: "fotos/test/field.jpg",
      miniatura: "fotos/test/thumb/field.jpg",
      legenda: "Legenda técnica preservada",
    };
    const source = {
      clientes: [{ id: "source-client", unidades: [{ id: "source-unit" }] }],
      locais: [{ id: "EC-01", unidade_id: "source-unit", tipo: "EC", fotos: [photo] }],
    };
    const bytes = Buffer.from(JSON.stringify(source)),
      snapshot = hash(bytes),
      pointer = "/locais/0/fotos/0",
      asset = digest({ source: SOURCE, original: photo.arquivo });
    const inventory = {
      source: SOURCE,
      snapshot_sha256: snapshot,
      assets: [
        { id: asset, original_reference: photo.arquivo, thumbnail_reference: photo.miniatura },
      ],
      occurrences: [
        {
          id: digest({ source: SOURCE, snapshot, pointer }),
          asset_id: asset,
          ordem: 0,
          source_pointer: pointer,
          source_unit_id: "source-unit",
          source_local_id: "EC-01",
          local_id: local,
          unidade_id: unit,
          legenda: photo.legenda,
          categoria: null,
          data: null,
          autoria: null,
          evidencia: "Explicit isolated source mapping",
        },
      ],
    };
    const mappings = [
      { tipo: "cliente", externo_id: "source-client", destino_id: client },
      { tipo: "unidade", externo_id: "source-unit", destino_id: unit },
      { tipo: "local", externo_id: "source-unit/EC-01", destino_id: local },
    ];
    await writeFile(path.join(directory, "source-db.json"), bytes);
    await writeFile(
      path.join(directory, "photo-recovery-inventory.json"),
      JSON.stringify(inventory),
    );
    await writeFile(path.join(directory, "mappings.json"), JSON.stringify(mappings));
    const binary = await readFile(image);
    await writeFile(
      path.join(directory, "source-thumbnails/observations.json"),
      JSON.stringify({
        records: [
          {
            file: path.basename(image),
            source_reference: photo.miniatura,
            method: "Chrome Save image as observed img.src",
            natural_width: 60,
            natural_height: 100,
            captured_at: "2026-10-31T03:00:00Z",
            captured_at_basis:
              "Synthetic download-completion timestamp; never technical authorship",
            observation_basis: "Isolated test observation",
            sha256: hash(binary),
            size: binary.length,
          },
        ],
      }),
    );
    const run = (mode) =>
      spawnSync(
        process.execPath,
        ["scripts/nr/prepare-source-photos.mjs", directory, org, ...(mode ? [mode] : [])],
        {
          cwd: process.cwd(),
          env: { ...process.env, NEXUS_IMAGE_PYTHON: python },
          encoding: "utf8",
        },
      );
    await work({ directory, image, source, inventory, run });
  } finally {
    await rm(directory, { recursive: true, force: true });
  }
}
test(
  "thumbnail plan is stable, preserves occurrence identity and never adopts it as an original",
  { skip: !pillow },
  async () =>
    fixture(async ({ directory, run }) => {
      assert.equal(run().status, 0);
      const first = await readFile(
        path.join(directory, "source-photo-recovery/destinations.json"),
        "utf8",
      );
      assert.equal(run().status, 0);
      assert.equal(
        await readFile(path.join(directory, "source-photo-recovery/destinations.json"), "utf8"),
        first,
      );
      const plan = JSON.parse(first),
        file = plan.files[0];
      assert.equal(file.metadata.papel, "representacao");
      assert.equal(file.metadata.origem_metadata.tipo, "miniatura_origem");
      assert.equal(file.metadata.origem_metadata.original_recuperado, false);
      assert.equal(file.occurrences[0].arquivo_id, null);
      assert.equal(file.occurrences[0].local_id, local);
      assert.equal(file.occurrences[0].legenda_origem, "Legenda técnica preservada");
    }),
);
test(
  "changed source bytes stop planning before any import SQL is written",
  { skip: !pillow },
  async () =>
    fixture(async ({ directory, source, run }) => {
      source.locais[0].fotos[0].legenda = "Changed snapshot";
      await writeFile(path.join(directory, "source-db.json"), JSON.stringify(source));
      const result = run();
      assert.notEqual(result.status, 0);
      assert.match(result.stderr, /snapshot differs/);
    }),
);
test("HTML disguised as JPEG cannot enter a transfer package", { skip: !pillow }, async () =>
  fixture(async ({ image, run }) => {
    await writeFile(image, "<html>Authentication required</html>");
    const result = run();
    assert.notEqual(result.status, 0);
    assert.match(result.stderr, /fully decoded/);
  }),
);
test("an invented filename cannot replace an exact source reference", { skip: !pillow }, async () =>
  fixture(async ({ directory, image, run }) => {
    await writeFile(
      path.join(directory, "source-thumbnails/unknown__thumb__field.jpg"),
      await readFile(image),
    );
    const result = run();
    assert.notEqual(result.status, 0);
    assert.match(result.stderr, /rendered-image observation/);
  }),
);
test("customer staging is rejected inside the repository", () => {
  const result = spawnSync(
    process.execPath,
    ["scripts/nr/prepare-source-photos.mjs", process.cwd(), org],
    { encoding: "utf8" },
  );
  assert.notEqual(result.status, 0);
  assert.match(result.stderr, /outside Git/);
});

test(
  "an original stays distinct from a thumbnail and remains unavailable until Storage confirmation",
  { skip: !pillow },
  async () =>
    fixture(async ({ directory, run }) => {
      const folder = path.join(directory, "source-originals");
      await mkdir(folder);
      const filename = "test__field.jpg",
        image = path.join(folder, filename);
      assert.equal(
        spawnSync(python, [
          "-c",
          "import sys;from PIL import Image;Image.new('RGB',(675,900),(44,77,90)).save(sys.argv[1],format='JPEG')",
          image,
        ]).status,
        0,
      );
      const bytes = await readFile(image);
      await writeFile(
        path.join(folder, "observations.json"),
        JSON.stringify({
          records: [
            {
              file: filename,
              source_reference: "fotos/test/field.jpg",
              method: "Perplexity owner project file download in Chrome test",
              project_path: "project/public/fotos/test/field.jpg",
              natural_width: 675,
              natural_height: 900,
              sha256: hash(bytes),
              size: bytes.length,
              captured_at: "2026-10-31T03:00:00Z",
              observation_basis: "Isolated owner-file observation",
            },
          ],
        }),
      );
      const result = run("originals");
      assert.equal(result.status, 0, result.stderr);
      const plan = JSON.parse(
        await readFile(path.join(directory, "source-original-recovery/destinations.json"), "utf8"),
      );
      assert.equal(plan.files[0].kind, "original");
      assert.equal(plan.files[0].slot, "arquivo_id");
      assert.equal(plan.files[0].metadata.papel, "foto");
      assert.equal(plan.files[0].metadata.nome, "field.jpg");
      assert.equal(plan.files[0].metadata.origem_metadata.tipo, "original_origem");
      assert.equal(plan.files[0].occurrences[0].arquivo_id, null);
      assert.equal(JSON.parse(result.stdout).storage_confirmation, false);
    }),
);
test(
  "an authorized archive is matched by complete entry and bytes, never its basename",
  { skip: !pillow },
  async () =>
    fixture(async ({ directory, image, run }) => {
      await mkdir(path.join(directory, "owner-artifacts"));
      const source = "fotos/test/thumb/field.jpg",
        archive = path.join(directory, "owner-artifacts/proof.zip");
      const bytes = await readFile(image);
      let raw = zipSync({ [source]: bytes }, { level: 0 });
      await writeFile(archive, raw);
      const observation = JSON.parse(
        await readFile(path.join(directory, "source-thumbnails/observations.json"), "utf8"),
      );
      Object.assign(observation.records[0], {
        method: "Authorized project export ZIP exact entry",
        project_path: source,
        archive_file: "proof.zip",
        archive_sha256: hash(raw),
        public_root: "",
      });
      await writeFile(
        path.join(directory, "source-thumbnails/observations.json"),
        JSON.stringify(observation),
      );
      assert.equal(run().status, 0);
      raw = zipSync({ [source]: Buffer.from("A different archive image") }, { level: 0 });
      await writeFile(archive, raw);
      observation.records[0].archive_sha256 = hash(raw);
      await writeFile(
        path.join(directory, "source-thumbnails/observations.json"),
        JSON.stringify(observation),
      );
      const rejected = run();
      assert.notEqual(rejected.status, 0);
      assert.match(rejected.stderr, /exact archive entry/);
    }),
);
test(
  "a previously confirmed reference cannot be replaced by new bytes",
  { skip: !pillow },
  async () =>
    fixture(async ({ directory, image, run }) => {
      await mkdir(path.join(directory, "source-photo-recovery"));
      const bytes = await readFile(image);
      await writeFile(
        path.join(directory, "source-photo-recovery/confirmed-files.json"),
        JSON.stringify({
          files: [
            {
              source_reference: "fotos/test/thumb/field.jpg",
              unidade_id: unit,
              sha256: "f".repeat(64),
              mime: "image/jpeg",
              tamanho: bytes.length,
            },
          ],
        }),
      );
      const result = run();
      assert.notEqual(result.status, 0);
      assert.match(result.stderr, /previously confirmed Nexus file/);
    }),
);
