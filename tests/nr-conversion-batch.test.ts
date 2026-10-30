import { afterEach, describe, expect, it } from "vitest";
import { mkdtemp, readFile, rm, symlink, writeFile } from "node:fs/promises";
import path from "node:path";
import os from "node:os";
import { createHash } from "node:crypto";
import { convertPrivateDocx } from "../scripts/nr/convert-docx.mts";
import { gerarDocxNr } from "../src/features/nr/documents";
const temporary: string[] = [];
afterEach(async () => {
  for (const directory of temporary.splice(0))
    await rm(directory, { recursive: true, force: true });
});
const id = (n: number) => `e7330000-0000-4000-8000-${String(n).padStart(12, "0")}`;
async function fixture() {
  const directory = await mkdtemp(path.join(os.tmpdir(), "nexus-conversion-test-"));
  temporary.push(directory);
  const rendered = await gerarDocxNr({
    id: id(1),
    titulo: "Fixture privada sintética",
    normas: ["NR33"],
    estado: "rascunho",
    version: 2,
    revisao_numero: 1,
    revisao_id: id(2),
    updated_at: "2026-10-30T00:00:00Z",
    conteudo: {
      schema_version: 1,
      blocos: [
        { id: "inicio", tipo: "paragrafo", texto: "Texto completo de teste" },
        {
          id: "tabela",
          tipo: "tabela",
          linhas: [
            ["Campo", "Valor"],
            ["TAG", "13A"],
          ],
        },
      ],
    },
  });
  const original = path.join(directory, "original.bin");
  await writeFile(original, rendered.bytes);
  const binding = {
    arquivo_id: id(3),
    source_id: "synthetic-drive-id",
    source_unit: "synthetic-unit",
    cliente_id: id(4),
    unidade_id: id(5),
    sha256: createHash("sha256").update(rendered.bytes).digest("hex"),
    local_path: original,
    nome: "fixture.docx",
  };
  await writeFile(
    path.join(directory, "docx-bindings-audit.json"),
    JSON.stringify({ files: [binding] }),
  );
  return { directory, binding, bytes: rendered.bytes };
}
describe("private DOCX batch conversion", () => {
  it("converts actual bytes, preserves original and returns no database/storage claim", async () => {
    const { directory, binding, bytes } = await fixture();
    const first = await convertPrivateDocx(directory);
    expect(first.converted).toBe(1);
    expect(first.errors).toBe(0);
    expect(first.database_writes).toBe(false);
    expect(first.storage_uploads).toBe(false);
    expect(new Uint8Array(await readFile(binding.local_path))).toEqual(bytes);
    const output = JSON.parse(
      await readFile(
        path.join(directory, "docx-conversions", binding.arquivo_id, "conversion.json"),
        "utf8",
      ),
    );
    expect(
      output.conteudo.blocos.some(
        (b: Record<string, unknown>) => b.texto === "Texto completo de teste",
      ),
    ).toBe(true);
    await convertPrivateDocx(directory);
    expect(
      JSON.parse(
        await readFile(
          path.join(directory, "docx-conversions", binding.arquivo_id, "conversion.json"),
          "utf8",
        ),
      ),
    ).toEqual(output);
  });
  it("records mismatched original hash as item error without replacing it", async () => {
    const { directory, binding } = await fixture();
    await writeFile(binding.local_path, "Changed bytes");
    const summary = await convertPrivateDocx(directory);
    expect(summary.errors).toBe(1);
    expect(summary.converted).toBe(0);
    expect(await readFile(binding.local_path, "utf8")).toBe("Changed bytes");
  });
  it("rejects Git output and refuses originals resolving outside private staging", async () => {
    await expect(convertPrivateDocx(process.cwd())).rejects.toThrow("outside Git");
    const { directory, binding } = await fixture();
    const foreign = await mkdtemp(path.join(os.tmpdir(), "nexus-foreign-test-"));
    temporary.push(foreign);
    const target = path.join(foreign, "original.bin");
    await writeFile(target, await readFile(binding.local_path));
    await rm(binding.local_path);
    await symlink(target, binding.local_path);
    expect((await convertPrivateDocx(directory)).errors).toBe(1);
  });
});
