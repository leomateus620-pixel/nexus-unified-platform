import type { z } from "zod";
import type { conteudoNrSchema } from "./schemas";
import { NR_ARQUIVO_MIMES, mimeDetectadoNr, sha256Nr } from "./files";
export const NR_DOCUMENTO_RENDER_VERSAO = "nr-documento-1.0.0";
export const NR_DOCX_CONVERSAO_VERSAO = "nr-docx-1.0.1";
export type NrNativeContent = z.infer<typeof conteudoNrSchema>;
export type NrNativeBlock = NrNativeContent["blocos"][number];
export type NrDocumentAsset = {
  id: string;
  nome: string;
  mime: string;
  bytes: Uint8Array;
  sha256: string;
};
export type NrDocumentSnapshot = {
  id: string;
  titulo: string;
  normas: string[];
  estado: string;
  version: number;
  revisao_numero: number;
  revisao_id: string;
  updated_at: string;
  conteudo: NrNativeContent;
};
type XmlNode = { name: string; attrs: Record<string, string>; children: (XmlNode | string)[] };
const local = (name: string) => name.split(":").pop() ?? name;
function decodeXml(text: string): string {
  return text.replace(/&(#x[0-9a-fA-F]+|#\d+|amp|lt|gt|quot|apos);/g, (_, value: string) => {
    const known: Record<string, string> = { amp: "&", lt: "<", gt: ">", quot: '"', apos: "'" };
    if (known[value]) return known[value]!;
    const code = value.startsWith("#x")
      ? parseInt(value.slice(2), 16)
      : parseInt(value.slice(1), 10);
    if (
      !Number.isInteger(code) ||
      code < 1 ||
      code > 0x10ffff ||
      (code >= 0xd800 && code <= 0xdfff)
    )
      throw new Error("Entidade XML inválida.");
    return String.fromCodePoint(code);
  });
}
/** Leitor restrito de OOXML; não resolve DTD, rede, entidades externas ou código. */
function parseXml(xml: string): XmlNode {
  if (xml.length > 8_000_000 || /<!DOCTYPE|<!ENTITY/i.test(xml))
    throw new Error("XML Office excede o limite ou contém entidades externas.");
  const root: XmlNode = { name: "root", attrs: {}, children: [] },
    stack = [root];
  let position = 0,
    nodes = 0;
  while (position < xml.length) {
    if (++nodes > 300000 || stack.length > 128)
      throw new Error("XML Office excede a complexidade suportada.");
    const start = xml.indexOf("<", position);
    if (start < 0) {
      stack.at(-1)!.children.push(decodeXml(xml.slice(position)));
      break;
    }
    if (start > position) stack.at(-1)!.children.push(decodeXml(xml.slice(position, start)));
    if (xml.startsWith("<!--", start)) {
      const end = xml.indexOf("-->", start + 4);
      if (end < 0) throw new Error("Comentário XML incompleto.");
      position = end + 3;
      continue;
    }
    if (xml.startsWith("<![CDATA[", start)) {
      const end = xml.indexOf("]]>", start + 9);
      if (end < 0) throw new Error("CDATA incompleto.");
      stack.at(-1)!.children.push(xml.slice(start + 9, end));
      position = end + 3;
      continue;
    }
    let quote = "",
      end = start + 1;
    for (; end < xml.length; end++) {
      const c = xml[end];
      if (quote) {
        if (c === quote) quote = "";
      } else if (c === '"' || c === "'") quote = c;
      else if (c === ">") break;
    }
    if (end >= xml.length) throw new Error("Elemento XML incompleto.");
    const token = xml.slice(start + 1, end).trim();
    position = end + 1;
    if (token.startsWith("?")) continue;
    if (token.startsWith("!")) throw new Error("Declaração XML não suportada.");
    if (token.startsWith("/")) {
      const node = stack.pop();
      if (stack.length === 0 || node?.name !== token.slice(1).trim())
        throw new Error("Hierarquia XML inválida.");
      continue;
    }
    const name = token.match(/^([^\s/>]+)/)?.[1];
    if (!name) throw new Error("Nome XML inválido.");
    const attrs: Record<string, string> = {};
    for (const match of token
      .slice(name.length)
      .matchAll(/([^\s=]+)\s*=\s*(?:"([^"]*)"|'([^']*)')/g))
      attrs[match[1]!] = decodeXml(match[2] ?? match[3] ?? "");
    const node: XmlNode = { name, attrs, children: [] };
    stack.at(-1)!.children.push(node);
    if (!token.endsWith("/")) stack.push(node);
  }
  if (stack.length !== 1) throw new Error("XML Office não foi fechado integralmente.");
  return root;
}
const childNodes = (node: XmlNode) =>
  node.children.filter((x): x is XmlNode => typeof x !== "string");
function descendants(node: XmlNode, name: string): XmlNode[] {
  const out: XmlNode[] = [];
  for (const child of childNodes(node)) {
    if (local(child.name) === name) out.push(child);
    out.push(...descendants(child, name));
  }
  return out;
}
function nodeText(node: XmlNode): string {
  const name = local(node.name);
  if (name === "tab") return "\t";
  if (name === "br" || name === "cr") return "\n";
  if (name === "del") return "";
  if (name === "AlternateContent") {
    const choice =
      childNodes(node).find((n) => local(n.name) === "Choice") ??
      childNodes(node).find((n) => local(n.name) === "Fallback");
    return choice ? nodeText(choice) : "";
  }
  return node.children
    .map((child) => (typeof child === "string" ? child : nodeText(child)))
    .join("");
}
function attr(node: XmlNode, name: string) {
  return Object.entries(node.attrs).find(([key]) => local(key) === name)?.[1];
}
export type NrDocxAsset = {
  chave: string;
  nome: string;
  mime: string;
  bytes: Uint8Array;
  sha256: string;
};
export async function converterDocxNr(bytes: Uint8Array) {
  if ((await mimeDetectadoNr(bytes)) !== NR_ARQUIVO_MIMES.docx)
    throw new Error("O original não é um DOCX suportado.");
  const { unzipSync } = await import("fflate");
  const files = unzipSync(bytes);
  const main = files["word/document.xml"];
  if (!main) throw new Error("DOCX não contém o corpo do documento.");
  const xml = parseXml(new TextDecoder().decode(main)),
    body = descendants(xml, "body")[0];
  if (!body) throw new Error("DOCX não contém corpo editável.");
  const avisos = new Set<string>([
    "Conversão estrutural: preserva texto, títulos, tabelas e imagens raster suportadas. O original continua disponível; layout, tipografia, quebras, cabeçalhos, rodapés, campos Word, comentários, assinaturas e posicionamento de desenhos não são reproduzidos fielmente.",
  ]);
  const relData = files["word/_rels/document.xml.rels"],
    relationships = new Map<string, string>();
  if (relData)
    for (const rel of descendants(parseXml(new TextDecoder().decode(relData)), "Relationship")) {
      const id = attr(rel, "Id"),
        target = attr(rel, "Target");
      if (id && target && attr(rel, "TargetMode") !== "External") {
        if (relationships.has(id)) throw new Error("DOCX contém identificador de vínculo ambíguo.");
        relationships.set(id, target);
      }
    }
  const styleNames = new Map<string, string>();
  const styles = files["word/styles.xml"];
  if (styles)
    for (const style of descendants(parseXml(new TextDecoder().decode(styles)), "style")) {
      const id = attr(style, "styleId"),
        name = childNodes(style).find((n) => local(n.name) === "name");
      if (id && name) styleNames.set(id, attr(name, "val") ?? id);
    }
  const blocos: NrNativeBlock[] = [],
    assets = new Map<string, NrDocxAsset>();
  let index = 0,
    totalImages = 0;
  function push(block: Omit<NrNativeBlock, "id">) {
    blocos.push({ id: `docx-${++index}`, ...block });
    if (blocos.length > 1000)
      throw new Error("DOCX excede 1000 blocos; a conversão exige divisão controlada.");
  }
  async function paragraph(node: XmlNode, includeText = true) {
    const textNodes = descendants(node, "t"),
      text = textNodes.map(nodeText).join("");
    const style = descendants(node, "pStyle")[0],
      styleValue = style ? (attr(style, "val") ?? "") : "",
      styleName = styleNames.get(styleValue) ?? styleValue;
    const heading = /(?:heading|titulo|título)\s*([1-6])?/i.exec(styleName);
    // Tabs e quebras são preservados pela árvore de runs; espaços de formatação XML são descartados.
    const runs = childNodes(node).filter((n) => !["pPr"].includes(local(n.name)));
    const content = runs
      .map((run) => {
        const pieces: string[] = [];
        function walk(n: XmlNode) {
          const ln = local(n.name);
          if (ln === "t") pieces.push(nodeText(n));
          else if (ln === "tab") pieces.push("\t");
          else if (ln === "br" || ln === "cr") pieces.push("\n");
          else if (ln !== "del") childNodes(n).forEach(walk);
        }
        walk(run);
        return pieces.join("");
      })
      .join("");
    if (includeText && (content || text))
      push({
        tipo: heading ? "titulo" : "paragrafo",
        texto: content || text,
        ...(heading ? { nivel: Number(heading[1] ?? 1) } : {}),
      });
    const refs = [
      ...descendants(node, "blip").map((n) => attr(n, "embed")),
      ...descendants(node, "imagedata").map((n) => attr(n, "id")),
    ].filter((x): x is string => !!x);
    for (const relationship of refs) {
      const target = relationships.get(relationship);
      if (!target) {
        avisos.add(
          "Imagem com vínculo externo ou não resolvido foi mantida como referência no original.",
        );
        push({
          tipo: "referencia",
          texto: `Imagem não incorporada: vínculo ${relationship}; consulte o DOCX original.`,
        });
        continue;
      }
      const parts = (target.startsWith("/") ? target.slice(1) : `word/${target}`).split("/"),
        normalized: string[] = [];
      for (const part of parts) {
        if (part === "..") normalized.pop();
        else if (part !== "." && part) normalized.push(part);
      }
      const path = normalized.join("/"),
        image = files[path];
      if (!image) {
        avisos.add(`Imagem interna indisponível: ${path}.`);
        push({
          tipo: "referencia",
          texto: `Imagem indisponível na conversão: ${path}; consulte o original.`,
        });
        continue;
      }
      const mime = await mimeDetectadoNr(image);
      if (
        !mime ||
        ![NR_ARQUIVO_MIMES.png, NR_ARQUIVO_MIMES.jpg, NR_ARQUIVO_MIMES.webp].includes(
          mime as typeof NR_ARQUIVO_MIMES.png,
        )
      ) {
        avisos.add(`Imagem ${path}: formato preservado somente no DOCX original.`);
        push({
          tipo: "referencia",
          texto: `Imagem em formato sem editor: ${path}; original preservado.`,
        });
        continue;
      }
      if (!assets.has(path)) {
        totalImages += image.length;
        if (totalImages > 24 * 1024 * 1024 || assets.size >= 100)
          throw new Error(
            "Imagens do DOCX excedem o orçamento de conversão de 24 MiB/100 imagens; nenhum ativo foi omitido silenciosamente.",
          );
        assets.set(path, {
          chave: path,
          nome: path.split("/").pop() ?? "imagem",
          mime,
          bytes: image,
          sha256: await sha256Nr(image),
        });
      }
      const docPr = descendants(node, "docPr")[0];
      push({
        tipo: "referencia",
        texto: `Imagem aguardando vínculo privado: ${path}`,
        legenda: (docPr ? (attr(docPr, "descr") ?? attr(docPr, "name")) : undefined) ?? path,
        chave: path,
      });
    }
  }
  async function read(node: XmlNode): Promise<void> {
    for (const item of childNodes(node)) {
      const name = local(item.name);
      if (name === "p") await paragraph(item);
      else if (name === "tbl") {
        const rows = childNodes(item)
          .filter((n) => local(n.name) === "tr")
          .map((row) =>
            childNodes(row)
              .filter((n) => local(n.name) === "tc")
              .map((cell) => {
                const pieces: string[] = [];
                function walk(n: XmlNode) {
                  const name = local(n.name);
                  if (name === "t") pieces.push(nodeText(n));
                  else if (name === "tab") pieces.push("\t");
                  else if (name === "br" || name === "cr") pieces.push("\n");
                  else if (name !== "del") {
                    childNodes(n).forEach(walk);
                    if (name === "p") pieces.push("\n");
                  }
                }
                // A text box can contain paragraphs inside another paragraph.
                // Visit each text node once instead of collecting descendants
                // separately for both the enclosing and nested paragraphs.
                walk(cell);
                return pieces.join("").replace(/\n+$/, "");
              }),
          );
        if (rows.length) push({ tipo: "tabela", linhas: rows });
        if (descendants(item, "gridSpan").length || descendants(item, "vMerge").length)
          avisos.add(
            "Células mescladas foram linearizadas em uma tabela editável; confira a correspondência com o original.",
          );
        for (const p of descendants(item, "p"))
          if (descendants(p, "blip").length || descendants(p, "imagedata").length) {
            avisos.add("Imagens em tabelas foram deslocadas para blocos após a tabela.");
            // The table already owns its text, including text inside drawings.
            // Extract only image relationships here; cloning runs retained nested
            // text boxes and duplicated their technical values after the table.
            await paragraph(p, false);
          }
      } else if (name === "sectPr") continue;
      else if (["sdt", "sdtContent", "customXml", "ins"].includes(name)) await read(item);
      else if (name !== "del")
        avisos.add(`Bloco Word ${name} não convertido; permanece no original.`);
    }
  }
  await read(body);
  if (descendants(xml, "oMath").length || descendants(xml, "oMathPara").length)
    avisos.add(
      "Expressões matemáticas do Word foram linearizadas em texto; índices, expoentes, operadores e estrutura da fórmula exigem conferência no original antes de qualquer uso técnico.",
    );
  const substantiveNotes = ["word/footnotes.xml", "word/endnotes.xml"].some((path) => {
    const bytes = files[path];
    if (!bytes) return false;
    const parsed = parseXml(new TextDecoder().decode(bytes));
    return [...descendants(parsed, "footnote"), ...descendants(parsed, "endnote")].some(
      (note) =>
        !attr(note, "type") &&
        descendants(note, "t").some((text) => nodeText(text).trim().length > 0),
    );
  });
  if (substantiveNotes)
    avisos.add(
      "Notas de rodapé e notas finais permanecem no original; confira-as antes de revisar a edição derivada.",
    );
  if (descendants(xml, "del").length || descendants(xml, "ins").length)
    avisos.add(
      "Controle de alterações: inserções foram lidas; exclusões históricas e revisão de alterações permanecem no original.",
    );
  if (descendants(xml, "hyperlink").length)
    avisos.add("Texto de hyperlinks foi preservado; os destinos permanecem no original.");
  return {
    conteudo: { schema_version: 1 as const, blocos },
    assets: [...assets.values()],
    avisos: [...avisos],
    versao: NR_DOCX_CONVERSAO_VERSAO,
  };
}

const escapeXml = (value: string) =>
  value
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&apos;");
const fieldText = (block: NrNativeBlock, avisos: string[]) => {
  if (block.tipo !== "campo") return block.texto ?? "";
  if (block.valor_snapshot !== undefined)
    return typeof block.valor_snapshot === "object"
      ? JSON.stringify(block.valor_snapshot)
      : String(block.valor_snapshot ?? "");
  avisos.push(`Campo ${block.chave ?? block.id} sem snapshot; nenhum valor atual foi inferido.`);
  return `[Campo sem snapshot: ${block.chave ?? block.id}]`;
};
export function imageDimensions(asset: NrDocumentAsset): { width: number; height: number } | null {
  const b = asset.bytes;
  if (asset.mime === NR_ARQUIVO_MIMES.png && b.length >= 24) {
    const v = new DataView(b.buffer, b.byteOffset, b.byteLength);
    return { width: v.getUint32(16), height: v.getUint32(20) };
  }
  if (asset.mime === NR_ARQUIVO_MIMES.jpg) {
    let p = 2;
    while (p + 9 < b.length) {
      if (b[p] !== 0xff) {
        p++;
        continue;
      }
      const marker = b[p + 1]!;
      if (marker === 0xd8 || marker === 0xd9) {
        p += 2;
        continue;
      }
      const length = (b[p + 2]! << 8) | b[p + 3]!;
      if (length < 2 || p + 2 + length > b.length) break;
      if (
        [0xc0, 0xc1, 0xc2, 0xc3, 0xc5, 0xc6, 0xc7, 0xc9, 0xca, 0xcb, 0xcd, 0xce, 0xcf].includes(
          marker,
        )
      )
        return { height: (b[p + 5]! << 8) | b[p + 6]!, width: (b[p + 7]! << 8) | b[p + 8]! };
      p += 2 + length;
    }
  }
  return null;
}
export async function gerarDocxNr(snapshot: NrDocumentSnapshot, assets: NrDocumentAsset[] = []) {
  const { zipSync, strToU8 } = await import("fflate"),
    avisos: string[] = [],
    files: Record<string, Uint8Array> = {};
  const byId = new Map(assets.map((a) => [a.id, a]));
  let media = 0;
  const rels = [
    `<Relationship Id="header" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/header" Target="header1.xml"/>`,
    `<Relationship Id="footer" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/footer" Target="footer1.xml"/>`,
    `<Relationship Id="styles" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/styles" Target="styles.xml"/>`,
  ];
  const p = (text: string, style = "Normal") =>
    `<w:p><w:pPr><w:pStyle w:val="${style}"/></w:pPr>${text
      .split("\n")
      .map(
        (line, i) =>
          `${i ? "<w:r><w:br/></w:r>" : ""}<w:r><w:t xml:space="preserve">${escapeXml(line)}</w:t></w:r>`,
      )
      .join("")}</w:p>`;
  let body =
    p(snapshot.titulo, "Title") +
    p(
      `${snapshot.normas.map((n) => (n === "NR33" ? "NR-33" : "NR-35")).join(" / ")} | Revisão ${snapshot.revisao_numero} | ${snapshot.estado.replaceAll("_", " ")}`,
      "Subtitle",
    ) +
    p(
      "Cópia derivada de consulta. Não constitui emissão, aprovação, assinatura ou autorização de entrada.",
    ) +
    p(
      `Documento ${snapshot.id} | revisão ${snapshot.revisao_id} | versão de dados ${snapshot.version}`,
      "Metadata",
    );
  for (const block of snapshot.conteudo.blocos) {
    if (block.tipo === "tabela") {
      const rows = block.linhas ?? [],
        cols = Math.max(0, ...rows.map((r) => r.length));
      if (cols === 0) {
        body += p("Tabela sem células.");
        continue;
      }
      const weights = Array.from({ length: cols }, (_, i) =>
          Math.min(60, Math.max(8, ...rows.slice(0, 25).map((r) => (r[i] ?? " ").length))),
        ),
        weightSum = weights.reduce((a, b) => a + b, 0),
        widths = weights.map((weight) => Math.floor((9360 * weight) / weightSum));
      body += `<w:tbl><w:tblPr><w:tblW w:w="9360" w:type="dxa"/><w:tblLayout w:type="fixed"/><w:tblBorders>${["top", "left", "bottom", "right", "insideH", "insideV"].map((side) => `<w:${side} w:val="single" w:sz="4" w:color="D9D9D9"/>`).join("")}</w:tblBorders><w:tblCellMar><w:top w:w="90" w:type="dxa"/><w:left w:w="110" w:type="dxa"/><w:bottom w:w="90" w:type="dxa"/><w:right w:w="110" w:type="dxa"/></w:tblCellMar></w:tblPr><w:tblGrid>${Array.from({ length: cols }, (_, i) => `<w:gridCol w:w="${widths[i]}"/>`).join("")}</w:tblGrid>${rows.map((row, i) => `<w:tr>${i === 0 ? "<w:trPr><w:tblHeader/><w:cantSplit/></w:trPr>" : "<w:trPr><w:cantSplit/></w:trPr>"}${Array.from({ length: cols }, (_, c) => `<w:tc><w:tcPr><w:tcW w:w="${widths[c]}" w:type="dxa"/><w:vAlign w:val="center"/>${i === 0 ? '<w:shd w:fill="EEF2F1"/>' : ""}</w:tcPr>${p(row[c] ?? "", i === 0 ? "TableHeader" : "TableText")}</w:tc>`).join("")}</w:tr>`).join("")}</w:tbl>${p("")}`;
    } else if (block.tipo === "imagem") {
      const asset = byId.get(block.arquivo_id ?? ""),
        dimensions = asset ? imageDimensions(asset) : null;
      if (!asset || !dimensions) {
        avisos.push(
          `Imagem ${block.arquivo_id ?? block.id}: representação raster não incorporada; original privado permanece disponível.`,
        );
        body += p(`[Imagem não incorporada: ${block.legenda ?? block.arquivo_id ?? block.id}]`);
        continue;
      }
      const scale = Math.min((6.5 * 914400) / dimensions.width, (5 * 914400) / dimensions.height),
        cx = Math.round(dimensions.width * scale),
        cy = Math.round(dimensions.height * scale),
        rid = `image${++media}`,
        ext = asset.mime === NR_ARQUIVO_MIMES.png ? "png" : "jpg";
      files[`word/media/${rid}.${ext}`] = asset.bytes;
      rels.push(
        `<Relationship Id="${rid}" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/image" Target="media/${rid}.${ext}"/>`,
      );
      body +=
        `<w:p><w:r><w:drawing><wp:inline><wp:extent cx="${cx}" cy="${cy}"/><wp:docPr id="${media}" name="${escapeXml(asset.nome)}" descr="${escapeXml(block.legenda ?? asset.nome)}"/><a:graphic><a:graphicData uri="http://schemas.openxmlformats.org/drawingml/2006/picture"><pic:pic><pic:nvPicPr><pic:cNvPr id="${media}" name="${rid}"/><pic:cNvPicPr/></pic:nvPicPr><pic:blipFill><a:blip r:embed="${rid}"/><a:stretch><a:fillRect/></a:stretch></pic:blipFill><pic:spPr><a:xfrm><a:off x="0" y="0"/><a:ext cx="${cx}" cy="${cy}"/></a:xfrm><a:prstGeom prst="rect"><a:avLst/></a:prstGeom></pic:spPr></pic:pic></a:graphicData></a:graphic></wp:inline></w:drawing></w:r></w:p>` +
        p(block.legenda ?? asset.nome, "Caption");
    } else
      body += p(
        fieldText(block, avisos),
        block.tipo === "titulo"
          ? `Heading${block.nivel ?? 1}`
          : block.tipo === "referencia"
            ? "Caption"
            : "Normal",
      );
  }
  const ns =
    'xmlns:w="http://schemas.openxmlformats.org/wordprocessingml/2006/main" xmlns:r="http://schemas.openxmlformats.org/officeDocument/2006/relationships" xmlns:wp="http://schemas.openxmlformats.org/drawingml/2006/wordprocessingDrawing" xmlns:a="http://schemas.openxmlformats.org/drawingml/2006/main" xmlns:pic="http://schemas.openxmlformats.org/drawingml/2006/picture"';
  files["word/document.xml"] = strToU8(
    `<?xml version="1.0" encoding="UTF-8" standalone="yes"?><w:document ${ns}><w:body>${body}<w:sectPr><w:headerReference w:type="default" r:id="header"/><w:footerReference w:type="default" r:id="footer"/><w:pgSz w:w="11906" w:h="16838"/><w:pgMar w:top="1134" w:right="1273" w:bottom="1134" w:left="1273" w:header="567" w:footer="567"/></w:sectPr></w:body></w:document>`,
  );
  files["word/_rels/document.xml.rels"] = strToU8(
    `<Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships">${rels.join("")}</Relationships>`,
  );
  files["word/header1.xml"] = strToU8(
    `<w:hdr ${ns}>${p("NEXUS   Acervo técnico NR-33 e NR-35", "Metadata")}</w:hdr>`,
  );
  files["word/footer1.xml"] = strToU8(
    `<w:ftr ${ns}><w:p><w:pPr><w:pStyle w:val="Metadata"/></w:pPr><w:r><w:t xml:space="preserve">Derivado de consulta | Revisão ${snapshot.revisao_numero} | Página </w:t></w:r><w:fldSimple w:instr="PAGE"/><w:r><w:t xml:space="preserve"> de </w:t></w:r><w:fldSimple w:instr="NUMPAGES"/></w:p></w:ftr>`,
  );
  files["word/styles.xml"] = strToU8(
    `<w:styles ${ns}><w:docDefaults><w:rPrDefault><w:rPr><w:rFonts w:ascii="Arial" w:hAnsi="Arial"/><w:color w:val="000000"/><w:sz w:val="22"/></w:rPr></w:rPrDefault><w:pPrDefault><w:pPr><w:spacing w:after="140" w:line="276" w:lineRule="auto"/><w:widowControl/></w:pPr></w:pPrDefault></w:docDefaults>${[["Normal", 22, false], ["Title", 36, true], ["Subtitle", 22, false], ["Metadata", 17, false], ["Caption", 19, false], ["TableText", 20, false], ["TableHeader", 20, true], ...[1, 2, 3, 4, 5, 6].map((n) => [`Heading${n}`, n === 1 ? 28 : 24, true])].map(([id, size, bold]) => `<w:style w:type="paragraph" w:styleId="${id}"><w:name w:val="${id}"/><w:pPr>${String(id).startsWith("Heading") ? '<w:keepNext/><w:spacing w:before="240" w:after="120"/>' : ""}</w:pPr><w:rPr><w:color w:val="000000"/><w:sz w:val="${size}"/>${bold ? "<w:b/>" : ""}</w:rPr></w:style>`).join("")}</w:styles>`,
  );
  files["[Content_Types].xml"] = strToU8(
    `<Types xmlns="http://schemas.openxmlformats.org/package/2006/content-types"><Default Extension="rels" ContentType="application/vnd.openxmlformats-package.relationships+xml"/><Default Extension="xml" ContentType="application/xml"/><Default Extension="png" ContentType="image/png"/><Default Extension="jpg" ContentType="image/jpeg"/><Override PartName="/word/document.xml" ContentType="application/vnd.openxmlformats-officedocument.wordprocessingml.document.main+xml"/>${["styles", "header1", "footer1"].map((n) => `<Override PartName="/word/${n}.xml" ContentType="application/vnd.openxmlformats-officedocument.wordprocessingml.${n === "styles" ? "styles" : n === "header1" ? "header" : "footer"}+xml"/>`).join("")}<Override PartName="/docProps/core.xml" ContentType="application/vnd.openxmlformats-package.core-properties+xml"/></Types>`,
  );
  files["_rels/.rels"] = strToU8(
    '<Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships"><Relationship Id="document" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/officeDocument" Target="word/document.xml"/><Relationship Id="core" Type="http://schemas.openxmlformats.org/package/2006/relationships/metadata/core-properties" Target="docProps/core.xml"/></Relationships>',
  );
  files["docProps/core.xml"] = strToU8(
    `<cp:coreProperties xmlns:cp="http://schemas.openxmlformats.org/package/2006/metadata/core-properties" xmlns:dc="http://purl.org/dc/elements/1.1/"><dc:title>${escapeXml(snapshot.titulo)}</dc:title><dc:creator>Nexus</dc:creator><dc:description>${escapeXml(`Derivado de consulta; documento ${snapshot.id}; revisão ${snapshot.revisao_id}; dados v${snapshot.version}; render ${NR_DOCUMENTO_RENDER_VERSAO}`)}</dc:description></cp:coreProperties>`,
  );
  return { bytes: zipSync(files), avisos };
}
