import { describe, expect, it } from "vitest";
import { mimeDetectado, sha256, validarBinario } from "../src/features/operacao/files";
import { anexoPai, pessoaDados } from "../src/features/operacao/schemas";

describe("arquivos operacionais", () => {
  it("confirma hash e tipo a partir dos bytes e rejeita divergências", async () => {
    const bytes = new TextEncoder().encode("%PDF-1.7\nconteudo teste isolado");
    const meta = { tamanho: bytes.length, mime: "application/pdf", sha256: await sha256(bytes) };
    await expect(validarBinario(bytes, meta)).resolves.toBeUndefined();
    await expect(validarBinario(bytes, { ...meta, tamanho: 1 })).rejects.toThrow("tamanho");
    await expect(validarBinario(bytes, { ...meta, mime: "image/png" })).rejects.toThrow("tipo");
    await expect(validarBinario(bytes, { ...meta, sha256: "0".repeat(64) })).rejects.toThrow(
      "hash",
    );
  });
  it("não trata HTML, arquivo vazio ou extensão como imagem/PDF", () => {
    expect(mimeDetectado(new TextEncoder().encode("<html>PDF.exe</html>"))).toBeNull();
    expect(mimeDetectado(new Uint8Array())).toBeNull();
  });
  it("não permite dois pais ou ausência de pai", () => {
    const org = "00000000-0000-0000-0000-000000000001";
    expect(anexoPai.safeParse({ organization_id: org }).success).toBe(false);
    expect(anexoPai.safeParse({ organization_id: org, pessoa_id: org, acao_id: org }).success).toBe(
      false,
    );
  });
  it("pessoa não recebe permissão de sistema ao ser cadastrada", () => {
    const p = pessoaDados.parse({ nome: "Pessoa isolada", vinculo: "prestador", role: "admin" });
    expect(p.user_id).toBeNull();
    expect(p).not.toHaveProperty("role");
  });
});
