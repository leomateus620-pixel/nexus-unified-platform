import { PDFDocument, rgb, type PDFFont, type PDFPage } from "pdf-lib";
import fontkit from "@pdf-lib/fontkit";
import regularData from "@/features/pet/assets/fonts/Barlow-Regular.ttf?inline";
import boldData from "@/features/pet/assets/fonts/Barlow-SemiBold.ttf?inline";
import fallbackData from "@/features/pet/assets/fonts/Saira-SemiBold.ttf?inline";
import type { NrDocumentAsset, NrDocumentSnapshot, NrNativeBlock } from "./documents";
import { NR_DOCUMENTO_RENDER_VERSAO, imageDimensions } from "./documents";
const fontBytes = (data: string) =>
  Uint8Array.from(atob(data.slice(data.indexOf(",") + 1)), (c) => c.charCodeAt(0));
function wrap(
  text: string,
  font: Pick<PDFFont, "widthOfTextAtSize">,
  size: number,
  width: number,
): string[] {
  const result: string[] = [];
  for (const paragraph of text.replaceAll("\t", "    ").split("\n")) {
    let line = "";
    for (const word of paragraph.split(/\s+/)) {
      if (!word) continue;
      const candidate = line ? `${line} ${word}` : word;
      if (font.widthOfTextAtSize(candidate, size) <= width) {
        line = candidate;
        continue;
      }
      if (line) {
        result.push(line);
        line = "";
      }
      if (font.widthOfTextAtSize(word, size) <= width) {
        line = word;
        continue;
      }
      for (const char of word) {
        if (line && font.widthOfTextAtSize(line + char, size) > width) {
          result.push(line);
          line = "";
        }
        line += char;
      }
    }
    result.push(line);
  }
  return result.length ? result : [""];
}
export async function gerarPdfNr(snapshot: NrDocumentSnapshot, assets: NrDocumentAsset[] = []) {
  const doc = await PDFDocument.create();
  doc.registerFontkit(fontkit);
  const regular = await doc.embedFont(fontBytes(regularData), { subset: true }),
    bold = await doc.embedFont(fontBytes(boldData), { subset: true }),
    fallback = await doc.embedFont(fontBytes(fallbackData), { subset: true });
  const avisos: string[] = [],
    characters = new Set(regular.getCharacterSet()),
    fallbackCharacters = new Set(fallback.getCharacterSet());
  const printable = (value: string) =>
    Array.from(value)
      .map((c) => {
        if (
          c === "\n" ||
          c === "\t" ||
          characters.has(c.codePointAt(0)!) ||
          fallbackCharacters.has(c.codePointAt(0)!)
        )
          return c;
        const token = `[U+${c.codePointAt(0)!.toString(16).toUpperCase()}]`;
        if (!avisos.includes(`Glifo ${token} preservado por código Unicode no PDF.`))
          avisos.push(`Glifo ${token} preservado por código Unicode no PDF.`);
        return token;
      })
      .join("");
  function runs(value: string, font: PDFFont) {
    const groups: { texto: string; font: PDFFont }[] = [];
    for (const char of value) {
      const selected = characters.has(char.codePointAt(0)!) ? font : fallback;
      const last = groups.at(-1);
      if (last?.font === selected) last.texto += char;
      else groups.push({ texto: char, font: selected });
    }
    return groups;
  }
  const measure = (value: string, font: PDFFont, size: number) =>
    runs(value, font).reduce(
      (width, run) => width + run.font.widthOfTextAtSize(run.texto, size),
      0,
    );
  const wrapText = (value: string, font: PDFFont, size: number, width: number) =>
    wrap(value, { widthOfTextAtSize: (text, size) => measure(text, font, size) }, size, width);
  const landscape = snapshot.conteudo.blocos.some(
    (b) => b.tipo === "tabela" && (b.linhas ?? []).some((r) => r.length > 5),
  );
  const width = landscape ? 841.89 : 595.28,
    height = landscape ? 595.28 : 841.89,
    margin = 44,
    bottom = 52,
    usable = width - margin * 2;
  const black = rgb(0, 0, 0),
    gray = rgb(0.84, 0.86, 0.85),
    light = rgb(0.94, 0.95, 0.95);
  let page!: PDFPage,
    y = 0;
  const draw = (text: string, x: number, baseline: number, size = 10, isBold = false) => {
    let position = x;
    for (const run of runs(printable(text), isBold ? bold : regular)) {
      page.drawText(run.texto, { x: position, y: baseline, size, font: run.font, color: black });
      position += run.font.widthOfTextAtSize(run.texto, size);
    }
  };
  function newPage() {
    if (doc.getPageCount() >= 400)
      throw new Error("Exportação excede 400 páginas; divida o documento em partes explícitas.");
    page = doc.addPage([width, height]);
    draw("NEXUS   Acervo técnico NR-33 / NR-35", margin, height - 30, 10, true);
    draw(
      `Revisão ${snapshot.revisao_numero} | dados v${snapshot.version} | ${snapshot.estado.replaceAll("_", " ")}`,
      margin,
      height - 45,
      8,
    );
    y = height - 72;
  }
  function ensure(points: number) {
    if (y - points < bottom) newPage();
  }
  function paragraph(text: string, size = 10, isBold = false, after = 9) {
    const font = isBold ? bold : regular,
      lines = wrapText(printable(text), font, size, usable),
      lineHeight = size * 1.4;
    for (const line of lines) {
      ensure(lineHeight);
      draw(line, margin, y, size, isBold);
      y -= lineHeight;
    }
    y -= after;
  }
  const imageMap = new Map(assets.map((a) => [a.id, a]));
  function field(block: NrNativeBlock) {
    if (block.tipo !== "campo") return block.texto ?? "";
    if (block.valor_snapshot !== undefined)
      return typeof block.valor_snapshot === "object"
        ? JSON.stringify(block.valor_snapshot)
        : String(block.valor_snapshot ?? "");
    avisos.push(`Campo ${block.chave ?? block.id} sem snapshot; valor atual não foi inferido.`);
    return `[Campo sem snapshot: ${block.chave ?? block.id}]`;
  }
  newPage();
  paragraph(snapshot.titulo, 20, true, 12);
  paragraph(
    "Cópia derivada de consulta. Não constitui emissão, aprovação, assinatura ou autorização de entrada.",
    10,
    false,
    12,
  );
  paragraph(`Documento ${snapshot.id}\nRevisão ${snapshot.revisao_id}`, 8, false, 14);
  for (const block of snapshot.conteudo.blocos) {
    if (block.tipo === "titulo") {
      ensure(50);
      paragraph(block.texto ?? "", block.nivel === 1 ? 15 : 12, true, 10);
    } else if (block.tipo === "tabela") {
      const rows = block.linhas ?? [],
        columns = Math.max(0, ...rows.map((r) => r.length));
      if (!columns) {
        paragraph("Tabela sem células.");
        continue;
      }
      if (columns > 12)
        throw new Error(
          "PDF suporta até doze colunas em A4 paisagem. Reorganize a tabela ou exporte DOCX.",
        );
      const weights = Array.from({ length: columns }, (_, i) =>
          Math.min(60, Math.max(8, ...rows.slice(0, 25).map((r) => (r[i] ?? "").length))),
        ),
        sum = weights.reduce((a, b) => a + b, 0),
        widths = weights.map((w) => (usable * w) / sum),
        fontSize = 9,
        lineHeight = 12.5,
        padding = 7;
      const lines = (row: string[], isHeader = false) =>
        widths.map((w, i) =>
          wrapText(printable(row[i] ?? ""), isHeader ? bold : regular, fontSize, w - padding * 2),
        );
      const header = lines(rows[0]!, true),
        headerLines = Math.max(...header.map((c) => c.length));
      if (headerLines > 12)
        throw new Error(
          "Cabeçalho de tabela excede o espaço legível. Reduza seu texto antes de exportar PDF.",
        );
      function rowPart(cells: string[][], from: number, count: number, isHeader: boolean) {
        const h = count * lineHeight + padding * 2;
        let x = margin;
        for (let c = 0; c < columns; c++) {
          const w = widths[c]!;
          page.drawRectangle({
            x,
            y: y - h,
            width: w,
            height: h,
            borderColor: gray,
            borderWidth: 0.5,
            ...(isHeader ? { color: light } : {}),
          });
          for (let l = 0; l < count; l++) {
            const text = cells[c]?.[from + l];
            if (text !== undefined)
              draw(text, x + padding, y - padding - 9 - l * lineHeight, fontSize, isHeader);
          }
          x += w;
        }
        y -= h;
      }
      function tablePage() {
        newPage();
        rowPart(header, 0, headerLines, true);
      }
      ensure((headerLines + 2) * lineHeight + padding * 4);
      rowPart(header, 0, headerLines, true);
      for (let rowIndex = 1; rowIndex < rows.length; rowIndex++) {
        const cells = lines(rows[rowIndex]!),
          length = Math.max(...cells.map((c) => c.length)),
          fullHeight = length * lineHeight + padding * 2,
          freshCapacity = height - 72 - bottom - headerLines * lineHeight - padding * 2;
        if (fullHeight <= freshCapacity && y - fullHeight < bottom) tablePage();
        let position = 0;
        while (position < length) {
          let fit = Math.floor((y - bottom - padding * 2) / lineHeight);
          if (fit < 1) {
            tablePage();
            fit = Math.floor((y - bottom - padding * 2) / lineHeight);
          }
          const count = Math.min(fit, length - position);
          rowPart(cells, position, count, false);
          position += count;
          if (position < length) tablePage();
        }
      }
      y -= 12;
    } else if (block.tipo === "imagem") {
      const asset = imageMap.get(block.arquivo_id ?? "");
      if (!asset || !["image/png", "image/jpeg"].includes(asset.mime)) {
        avisos.push(
          `Imagem ${block.arquivo_id ?? block.id} não incorporada no PDF; consulte o original privado.`,
        );
        paragraph(`[Imagem não incorporada: ${block.legenda ?? block.arquivo_id ?? block.id}]`);
        continue;
      }
      const dimensions = imageDimensions(asset);
      if (!dimensions || dimensions.width * dimensions.height > 24_000_000) {
        avisos.push(`Imagem ${asset.nome} excede o limite de decodificação; original preservado.`);
        paragraph(`[Imagem não incorporada por dimensão: ${block.legenda ?? asset.nome}]`);
        continue;
      }
      const image =
          asset.mime === "image/png"
            ? await doc.embedPng(asset.bytes)
            : await doc.embedJpg(asset.bytes),
        scale = Math.min(usable / image.width, (height - 150) / image.height, 1),
        iw = image.width * scale,
        ih = image.height * scale,
        caption = block.legenda ?? asset.nome,
        captionLines = wrapText(printable(caption), regular, 9, usable);
      ensure(ih + captionLines.length * 13 + 20);
      page.drawImage(image, { x: margin, y: y - ih, width: iw, height: ih });
      y -= ih + 12;
      paragraph(caption, 9, false, 12);
    } else paragraph(field(block), block.tipo === "referencia" ? 9 : 10, false, 10);
  }
  const total = doc.getPageCount();
  for (const [p, index] of doc.getPages().map((p, i) => [p, i] as const)) {
    page = p;
    draw(`Derivado de consulta | ${NR_DOCUMENTO_RENDER_VERSAO}`, margin, 28, 8);
    const count = `Página ${index + 1} de ${total}`;
    draw(count, width - margin - regular.widthOfTextAtSize(count, 8), 28, 8);
  }
  doc.setTitle(`${snapshot.titulo} | derivado de consulta`);
  doc.setAuthor("Nexus");
  doc.setSubject(
    `Documento ${snapshot.id}; revisão ${snapshot.revisao_id}; dados v${snapshot.version}; ${NR_DOCUMENTO_RENDER_VERSAO}`,
  );
  doc.setCreator("Nexus");
  return { bytes: await doc.save(), avisos, paginas: total };
}
