import { describe, expect, it } from "vitest";
import { strToU8, zipSync } from "fflate";
import {
  NR_ARQUIVO_MIMES,
  mimeDetectadoNr,
  sha256Nr,
  validarBinarioNr,
  validarMetadataNr,
} from "../src/features/nr/files";
const pdf = new TextEncoder().encode("%PDF-1.7\n1 0 obj <</Type/Catalog>> endobj\n%%EOF");
function docx(extra: Record<string, Uint8Array> = {}) {
  return zipSync({
    "[Content_Types].xml": strToU8(
      '<Types><Override PartName="/word/document.xml" ContentType="application/vnd.openxmlformats-officedocument.wordprocessingml.document.main+xml"/></Types>',
    ),
    "word/document.xml": strToU8(
      '<w:document xmlns:w="http://schemas.openxmlformats.org/wordprocessingml/2006/main"><w:body><w:p><w:r><w:t>Texto preservado</w:t></w:r></w:p></w:body></w:document>',
    ),
    ...extra,
  });
}
describe("NR: bytes, MIME, extensão e integridade do acervo", () => {
  it("recusa todos os controles ASCII em nomes e preserva Unicode, espaços e o limite de 500 caracteres", () => {
    const metadata = {
      mime: NR_ARQUIVO_MIMES.pdf,
      tamanho: 1,
      sha256: "a".repeat(64),
    };
    for (let code = 0; code < 32; code++)
      expect(() =>
        validarMetadataNr({ ...metadata, nome: `Registro${String.fromCharCode(code)}13A.pdf` }),
      ).toThrow("Nome de arquivo inválido");
    for (const separator of ["/", "\\"])
      expect(() =>
        validarMetadataNr({ ...metadata, nome: `pasta${separator}arquivo.pdf` }),
      ).toThrow("Nome de arquivo inválido");
    expect(validarMetadataNr({ ...metadata, nome: "Ação 😀 — 61 EFGHIJ 63CDEFGH.PDF" })).toBe(
      "pdf",
    );
    expect(validarMetadataNr({ ...metadata, nome: `${"a".repeat(496)}.pdf` })).toBe("pdf");
    expect(() => validarMetadataNr({ ...metadata, nome: `${"a".repeat(497)}.pdf` })).toThrow(
      "Nome de arquivo inválido",
    );
  });
  it("bloqueia NUL e barra invertida em entradas ZIP sem rejeitar caminhos Office Unicode", async () => {
    for (const name of ["word/oculto\0.xml", "word\\oculto.xml"])
      await expect(mimeDetectadoNr(docx({ [name]: strToU8("<x/>") }))).rejects.toThrow(
        "Caminho ambíguo",
      );
    expect(
      await mimeDetectadoNr(docx({ "word/metadados/ação.xml": strToU8("<x>Preservado</x>") })),
    ).toBe(NR_ARQUIVO_MIMES.docx);
  });
  it("confere os bytes completos e não confunde HTML ou visualizador com PDF", async () => {
    const meta = {
      nome: "Original Rev. 03.pdf",
      mime: NR_ARQUIVO_MIMES.pdf,
      tamanho: pdf.length,
      sha256: await sha256Nr(pdf),
    };
    expect(await validarBinarioNr(pdf, meta)).toMatchObject({
      tamanho: pdf.length,
      mime: meta.mime,
      sha256: meta.sha256,
    });
    const html = new TextEncoder().encode("<html><title>Login Google Drive</title></html>");
    await expect(
      validarBinarioNr(html, { ...meta, tamanho: html.length, sha256: await sha256Nr(html) }),
    ).rejects.toThrow("MIME real");
    await expect(validarBinarioNr(pdf, { ...meta, sha256: "0".repeat(64) })).rejects.toThrow(
      "SHA-256",
    );
    await expect(validarBinarioNr(pdf, { ...meta, tamanho: pdf.length + 1 })).rejects.toThrow(
      "tamanho",
    );
    expect(await mimeDetectadoNr(pdf.slice(0, -5))).toBeNull();
  });
  it("identifica DOCX por pacote real e valida CRC de todos os arquivos internos", async () => {
    const bytes = docx();
    expect(await mimeDetectadoNr(bytes)).toBe(NR_ARQUIVO_MIMES.docx);
    const meta = {
      nome: "Cadastro EC 13A.docx",
      mime: NR_ARQUIVO_MIMES.docx,
      tamanho: bytes.length,
      sha256: await sha256Nr(bytes),
    };
    expect((await validarBinarioNr(bytes, meta)).extensao).toBe("docx");
    const zip = zipSync({ "texto.txt": strToU8("não é um Word") });
    await expect(mimeDetectadoNr(zip)).rejects.toThrow("não corresponde");
    const corrupt = bytes.slice();
    corrupt[45] = (corrupt[45] ?? 0) ^ 0xff;
    await expect(mimeDetectadoNr(corrupt)).rejects.toThrow();
  });
  it("recusa macros, caminhos ambíguos, objetos ativos e arquivos XML executáveis", async () => {
    await expect(
      mimeDetectadoNr(docx({ "word/vbaProject.bin": new Uint8Array([1, 2, 3]) })),
    ).rejects.toThrow("ativo");
    await expect(mimeDetectadoNr(docx({ "../fora.xml": strToU8("<x/>") }))).rejects.toThrow(
      "Caminho",
    );
    await expect(
      mimeDetectadoNr(
        docx({
          "word/document.xml": strToU8(
            '<!DOCTYPE x [<!ENTITY x SYSTEM "file:///private">]><w:document/>',
          ),
        }),
      ),
    ).rejects.toThrow("XML ativo");
  });
  it("limita expansão do Office e mantém formatos sem suporte explicitamente pendentes", async () => {
    await expect(
      mimeDetectadoNr(docx({ "word/grande.xml": strToU8("a".repeat(2 * 1024 * 1024)) })),
    ).rejects.toThrow("expansão segura");
    expect(() =>
      validarMetadataNr({
        nome: "Ativo.docm",
        mime: NR_ARQUIVO_MIMES.docx,
        tamanho: 1,
        sha256: "a".repeat(64),
      }),
    ).toThrow("não suportado");
    expect(() =>
      validarMetadataNr({
        nome: "../nome.pdf",
        mime: NR_ARQUIVO_MIMES.pdf,
        tamanho: 1,
        sha256: "a".repeat(64),
      }),
    ).toThrow("Nome");
    expect(() =>
      validarMetadataNr({
        nome: "nome.pdf",
        mime: NR_ARQUIVO_MIMES.pdf,
        tamanho: 51 * 1024 * 1024,
        sha256: "a".repeat(64),
      }),
    ).toThrow("limite");
  });
  it("obedece ao limite efetivo consultado do banco e distingue extensão falsa", () => {
    const meta = {
      nome: "foto.JPG",
      mime: NR_ARQUIVO_MIMES.jpg,
      tamanho: 120,
      sha256: "a".repeat(64),
    };
    expect(validarMetadataNr(meta)).toBe("jpg");
    expect(() =>
      validarMetadataNr(meta, {
        max_bytes: 100,
        mime_types: [NR_ARQUIVO_MIMES.jpg],
        extensoes: ["jpg"],
      }),
    ).toThrow("limite");
    expect(() => validarMetadataNr({ ...meta, nome: "foto.pdf" })).toThrow("não suportado");
  });
});
