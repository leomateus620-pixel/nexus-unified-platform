import { describe, expect, it } from "vitest";
import { mkdirSync, readFileSync, writeFileSync } from "node:fs";
import { PDFDocument, PDFDict, PDFName } from "pdf-lib";
import { getDocument } from "pdfjs-dist/legacy/build/pdf.mjs";
import { strToU8, zipSync, unzipSync } from "fflate";
import {
  converterDocxNr,
  gerarDocxNr,
  type NrDocumentSnapshot,
} from "../src/features/nr/documents";
import { gerarPdfNr } from "../src/features/nr/documents.pdf";
const id = "c7330000-0000-4000-8000-000000000001";
const snapshot = (rows = 80): NrDocumentSnapshot => ({
  id,
  titulo: "Registro técnico para verificação de exportação",
  normas: ["NR33", "NR35"],
  estado: "rascunho",
  version: 3,
  revisao_numero: 2,
  revisao_id: "c7330000-0000-4000-8000-000000000002",
  updated_at: "2026-10-30T00:00:00Z",
  conteudo: {
    schema_version: 1,
    blocos: [
      { id: "intro", tipo: "titulo", nivel: 1, texto: "Contexto e rastreabilidade" },
      {
        id: "p1",
        tipo: "paragrafo",
        texto:
          "Este cenário isolado verifica texto em português, unidades m³/h e conteúdo estruturado. Todos os registros abaixo pertencem exclusivamente à validação do exportador.",
      },
      {
        id: "table",
        tipo: "tabela",
        linhas: [
          ["Código", "Descrição técnica", "Estado"],
          ...Array.from({ length: rows }, (_, i) => [
            String(i + 1).padStart(3, "0"),
            `Registro ${i + 1}: conferir os dados informados e a evidência correspondente sem inferir conformidade.`,
            i % 2 ? "Não verificado" : "Em revisão",
          ]),
        ],
      },
      { id: "last", tipo: "paragrafo", texto: "MARCADOR FINAL DE INTEGRIDADE DOCUMENTAL" },
    ],
  },
});
describe("NR documentos: exportação e conversão estrutural", () => {
  it("não duplica texto de parágrafos em caixas de texto dentro de células", async () => {
    const files = {
      "[Content_Types].xml": strToU8(
        '<Types><Override PartName="/word/document.xml" ContentType="application/vnd.openxmlformats-officedocument.wordprocessingml.document.main+xml"/></Types>',
      ),
      "word/document.xml": strToU8(
        '<w:document xmlns:w="w"><w:body><w:tbl><w:tr><w:tc><w:p><w:r><w:t>Início</w:t><w:tab/><w:drawing><w:txbxContent><w:p><w:r><w:t>Valor técnico</w:t><w:br/><w:t>Confirmar</w:t></w:r></w:p></w:txbxContent></w:drawing></w:r></w:p></w:tc></w:tr></w:tbl></w:body></w:document>',
      ),
    };
    const converted = await converterDocxNr(zipSync(files));
    const cell = converted.conteudo.blocos.find((b) => b.tipo === "tabela")?.linhas?.[0]?.[0];
    expect(cell).toBe("Início\tValor técnico\nConfirmar");
    expect(converted.conteudo.blocos.filter((b) => b.tipo === "paragrafo")).toHaveLength(0);
  });
  it("preserva texto OfficeMath e declara a perda da notação estrutural", async () => {
    const files = {
      "[Content_Types].xml": strToU8(
        '<Types><Override PartName="/word/document.xml" ContentType="application/vnd.openxmlformats-officedocument.wordprocessingml.document.main+xml"/></Types>',
      ),
      "word/document.xml": strToU8(
        '<w:document xmlns:w="w" xmlns:m="m"><w:body><w:p><w:r><w:t>Fórmula: </w:t></w:r><m:oMath><m:r><m:t>πr</m:t></m:r><m:sSup><m:e/><m:sup><m:r><m:t>2</m:t></m:r></m:sup></m:sSup><m:r><m:t>h</m:t></m:r></m:oMath></w:p></w:body></w:document>',
      ),
    };
    const converted = await converterDocxNr(zipSync(files));
    expect(converted.conteudo.blocos[0]?.texto).toBe("Fórmula: πr2h");
    expect(converted.avisos.join(" ")).toContain("índices, expoentes, operadores");
  });
  it("usa paisagem para tabelas largas e preserva subscritos técnicos por fonte local", async () => {
    const source = snapshot(1);
    source.conteudo.blocos = [
      {
        id: "larga",
        tipo: "tabela",
        linhas: [
          Array.from({ length: 9 }, (_, i) => `Campo ${i + 1}`),
          ...Array.from({ length: 20 }, (_, r) =>
            Array.from({ length: 9 }, (_, c) =>
              c === 1 ? `CO₂ registro ${r + 1}` : `${r + 1}.${c + 1}`,
            ),
          ),
        ],
      },
    ];
    const pdf = await gerarPdfNr(source),
      loaded = await PDFDocument.load(pdf.bytes),
      task = getDocument({ data: Uint8Array.from(pdf.bytes), useSystemFonts: false }),
      reader = await task.promise;
    let text = "";
    for (const page of loaded.getPages()) {
      expect(page.getWidth()).toBeCloseTo(841.89);
      expect(page.getHeight()).toBeCloseTo(595.28);
    }
    for (let n = 1; n <= reader.numPages; n++) {
      const page = await reader.getPage(n),
        content = await page.getTextContent();
      text += content.items.map((item) => ("str" in item ? item.str : "")).join("");
      for (const item of content.items)
        if ("str" in item && item.str.trim()) {
          expect(item.transform[4]! + item.width).toBeLessThan(799);
          expect(item.transform[5]).toBeGreaterThan(24);
        }
    }
    await task.destroy();
    expect(text).toContain("CO₂");
    expect(pdf.avisos.some((message) => message.includes("U+2082"))).toBe(false);
  });
  const sourcePath = process.env["NR_DOCX_SOURCE_PATH"];
  if (sourcePath)
    it("verifica estrutura e exportações sobre um original autorizado privado", async () => {
      const converted = await converterDocxNr(new Uint8Array(readFileSync(sourcePath)));
      const source = snapshot(1),
        assets = converted.assets.map((a, index) => ({
          id: `d7330000-0000-4000-8000-${String(index + 50).padStart(12, "0")}`,
          nome: a.nome,
          mime: a.mime,
          bytes: a.bytes,
          sha256: a.sha256,
        }));
      const ids = new Map(converted.assets.map((a, index) => [a.chave, assets[index]!.id]));
      source.conteudo = {
        ...converted.conteudo,
        blocos: converted.conteudo.blocos.map((block) =>
          block.chave && ids.has(block.chave)
            ? {
                id: block.id,
                tipo: "imagem",
                arquivo_id: ids.get(block.chave)!,
                legenda: block.legenda,
              }
            : block,
        ),
      };
      const pdf = await gerarPdfNr(source, assets),
        docx = await gerarDocxNr(source, assets),
        task = getDocument({ data: Uint8Array.from(pdf.bytes), useSystemFonts: false }),
        reader = await task.promise;
      let characters = 0,
        overflow = 0;
      for (let i = 1; i <= reader.numPages; i++) {
        const page = await reader.getPage(i),
          viewport = page.getViewport({ scale: 1 }),
          content = await page.getTextContent();
        for (const item of content.items)
          if ("str" in item && item.str.trim()) {
            characters += item.str.length;
            const x = item.transform[4]!,
              y = item.transform[5]!;
            if (
              x < 43 ||
              x + item.width > viewport.width - 43 ||
              y < 24 ||
              y > viewport.height - 20
            )
              overflow++;
          }
      }
      await task.destroy();
      expect(overflow).toBe(0);
      expect(characters).toBeGreaterThan(10000);
      const output = process.env["NR_DOC_REAL_REVIEW_DIR"];
      if (output) {
        mkdirSync(output, { recursive: true });
        writeFileSync(`${output}/derivado.docx`, docx.bytes);
        writeFileSync(`${output}/derivado.pdf`, pdf.bytes);
        writeFileSync(
          `${output}/resumo.json`,
          JSON.stringify(
            {
              blocos: converted.conteudo.blocos.length,
              imagens: assets.length,
              paginas_pdf: pdf.paginas,
              caracteres_pdf: characters,
              overflow,
              avisos: [...converted.avisos, ...pdf.avisos, ...docx.avisos],
            },
            null,
            2,
          ),
        );
      }
    });
  it("DOCX é um pacote íntegro e preserva títulos, parágrafos e todas as linhas de tabela em conversão", async () => {
    const source = snapshot(20),
      docx = await gerarDocxNr(source),
      converted = await converterDocxNr(docx.bytes);
    expect(converted.conteudo.blocos.find((b) => b.tipo === "tabela")?.linhas).toHaveLength(21);
    expect(
      converted.conteudo.blocos.some(
        (b) => b.tipo === "titulo" && b.texto === "Contexto e rastreabilidade",
      ),
    ).toBe(true);
    expect(converted.conteudo.blocos.at(-1)?.texto).toBe(
      "MARCADOR FINAL DE INTEGRIDADE DOCUMENTAL",
    );
    expect(converted.avisos.join(" ")).toContain("original continua disponível");
    const files = unzipSync(docx.bytes);
    expect(files["word/header1.xml"]).toBeDefined();
    expect(files["word/footer1.xml"]).toBeDefined();
    expect(new TextDecoder().decode(files["word/document.xml"])).toContain("w:tblHeader");
  });
  it("mantém glifos, cabeçalho repetido, páginas e rodapé sem transbordamento de texto", async () => {
    const source = snapshot(),
      pdf = await gerarPdfNr(source),
      task = getDocument({ data: Uint8Array.from(pdf.bytes), useSystemFonts: false }),
      reader = await task.promise;
    const pages: string[] = [],
      overflow: string[] = [];
    for (let pageNo = 1; pageNo <= reader.numPages; pageNo++) {
      const page = await reader.getPage(pageNo),
        content = await page.getTextContent();
      for (const item of content.items)
        if ("str" in item && item.str.trim()) {
          const x = item.transform[4]!,
            y = item.transform[5]!;
          if (x < 43 || x + item.width > 552 || y < 24 || y > 820)
            overflow.push(`${pageNo}: ${item.str}`);
        }
      pages.push(content.items.map((item) => ("str" in item ? item.str : "")).join(" "));
    }
    await task.destroy();
    expect(pages.length).toBeGreaterThan(3);
    expect(overflow).toEqual([]);
    expect(pages.join(" ")).toContain("MARCADOR FINAL DE INTEGRIDADE DOCUMENTAL");
    expect(pages.every((page) => page.includes("NEXUS") && page.includes("Página"))).toBe(true);
    expect(pages.filter((page) => page.includes("Descrição técnica")).length).toBeGreaterThan(2);
    const loaded = await PDFDocument.load(pdf.bytes);
    expect(loaded.getTitle()).toContain("derivado de consulta");
    expect(
      loaded.context
        .enumerateIndirectObjects()
        .some(
          ([, x]) =>
            x instanceof PDFDict && String(x.get(PDFName.of("BaseFont"))).includes("Barlow"),
        ),
    ).toBe(true);
    const output = process.env["NR_DOC_REVIEW_DIR"];
    if (output) {
      mkdirSync(output, { recursive: true });
      writeFileSync(`${output}/exportacao-nativa.pdf`, pdf.bytes);
      writeFileSync(`${output}/exportacao-nativa.docx`, (await gerarDocxNr(source)).bytes);
    }
  });
  it("não presume valor de campo vinculado sem snapshot nem conteúdo de formatos não suportados", async () => {
    const source = snapshot(1);
    source.conteudo.blocos = [
      { id: "field", tipo: "campo", chave: "local.volume", modo: "vinculado" },
    ];
    expect((await gerarDocxNr(source)).avisos).toContain(
      "Campo local.volume sem snapshot; nenhum valor atual foi inferido.",
    );
    expect((await gerarPdfNr(source)).avisos.join(" ")).toContain("valor atual não foi inferido");
    await expect(converterDocxNr(strToU8("<html>Google Drive login</html>"))).rejects.toThrow(
      "não é um DOCX",
    );
  });
  it("converte imagens incorporadas por bytes e explica células mescladas e fontes externas", async () => {
    const image = Uint8Array.from(
      Buffer.from(
        "iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mP8/x8AAwMCAO+jM1sAAAAASUVORK5CYII=",
        "base64",
      ),
    );
    // Corrige somente o CRC de uma fixture sintética legada; nunca toca arquivos de clientes.
    const crc = (data: Uint8Array) => {
      let value = 0xffffffff;
      for (const b of data) {
        value ^= b;
        for (let i = 0; i < 8; i++) value = value & 1 ? 0xedb88320 ^ (value >>> 1) : value >>> 1;
      }
      return (value ^ 0xffffffff) >>> 0;
    };
    const view = new DataView(image.buffer);
    for (let start = 8; start + 12 <= image.length;) {
      const length = view.getUint32(start),
        end = start + 12 + length;
      view.setUint32(end - 4, crc(image.subarray(start + 4, end - 4)));
      start = end;
    }
    const files = {
      "[Content_Types].xml": strToU8(
        '<Types><Override PartName="/word/document.xml" ContentType="application/vnd.openxmlformats-officedocument.wordprocessingml.document.main+xml"/></Types>',
      ),
      "word/document.xml": strToU8(
        '<w:document xmlns:w="w" xmlns:a="a" xmlns:r="r"><w:body><w:p><w:r><w:t>Legenda da evidência</w:t><w:drawing><a:blip r:embed="r1"/></w:drawing></w:r></w:p><w:tbl><w:tr><w:tc><w:tcPr><w:gridSpan w:val="2"/></w:tcPr><w:p><w:r><w:t>Célula preservada</w:t></w:r></w:p></w:tc></w:tr></w:tbl></w:body></w:document>',
      ),
      "word/_rels/document.xml.rels": strToU8(
        '<Relationships><Relationship Id="r1" Target="media/foto.png"/></Relationships>',
      ),
      "word/media/foto.png": image,
    };
    const converted = await converterDocxNr(zipSync(files));
    expect(converted.assets).toHaveLength(1);
    expect(converted.assets[0]?.bytes).toEqual(image);
    expect(converted.avisos.join(" ")).toContain("mescladas");
    expect(converted.conteudo.blocos.some((b) => b.chave === "word/media/foto.png")).toBe(true);
    const doc = snapshot(1);
    doc.conteudo.blocos = [
      { id: "img", tipo: "imagem", arquivo_id: id, legenda: "Imagem de validação" },
    ];
    const assets = [
      {
        id,
        nome: "foto.png",
        mime: "image/png",
        bytes: image,
        sha256: converted.assets[0]!.sha256,
      },
    ];
    expect((await gerarDocxNr(doc, assets)).avisos).toEqual([]);
    expect((await gerarPdfNr(doc, assets)).avisos).toEqual([]);
  });
});
