/** Política do leitor de bytes; o limite operacional é consultado no banco antes do upload. */
export const NR_ARQUIVO_BUCKET = "nexus-nr-acervo";
export const NR_ARQUIVO_MAX_BYTES = 50 * 1024 * 1024;
export const NR_ARQUIVO_MIMES = {
  pdf: "application/pdf",
  png: "image/png",
  jpg: "image/jpeg",
  jpeg: "image/jpeg",
  webp: "image/webp",
  docx: "application/vnd.openxmlformats-officedocument.wordprocessingml.document",
  xlsx: "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
} as const;
export type NrArquivo = {
  id: string;
  organization_id: string;
  cliente_id: string;
  unidade_id: string;
  normas: ("NR33" | "NR35")[];
  nome: string;
  nome_exibicao?: string | null;
  mime: string;
  tamanho: number;
  sha256: string;
  extensao: string;
  caminho: string;
  estado: "preparado" | "verificado" | "vinculado" | "falhou" | "arquivado";
  papel: "original" | "derivado" | "foto" | "anexo" | "representacao";
  pasta_id: string | null;
  documento_id: string | null;
  revisao_id: string | null;
  local_id: string | null;
  bytes_verificados: boolean;
  created_by: string | null;
  created_at: string;
  confirmado_em: string | null;
  erro: string | null;
  version: number;
};
export type NrArquivoLimites = {
  bucket: string;
  max_bytes: number;
  mime_types: string[];
  extensoes: string[];
};
export function extensaoNr(nome: string): string {
  if (
    !nome.trim() ||
    nome.length > 500 ||
    Array.from(nome).some(
      (character) => character.charCodeAt(0) < 32 || character === "/" || character === "\\",
    )
  )
    throw new Error("Nome de arquivo inválido.");
  return (nome.split(".").pop() ?? "").toLowerCase();
}
export function validarMetadataNr(
  meta: { nome: string; mime: string; tamanho: number; sha256: string },
  limites: Pick<NrArquivoLimites, "max_bytes" | "mime_types" | "extensoes"> = {
    max_bytes: NR_ARQUIVO_MAX_BYTES,
    mime_types: Object.values(NR_ARQUIVO_MIMES),
    extensoes: Object.keys(NR_ARQUIVO_MIMES),
  },
) {
  const extensao = extensaoNr(meta.nome);
  const mime = NR_ARQUIVO_MIMES[extensao as keyof typeof NR_ARQUIVO_MIMES];
  if (
    !mime ||
    mime !== meta.mime ||
    !limites.extensoes.includes(extensao) ||
    !limites.mime_types.includes(mime)
  )
    throw new Error(
      "Formato ou extensão não suportado. Originais sem suporte permanecem pendentes no inventário.",
    );
  if (
    !Number.isSafeInteger(meta.tamanho) ||
    meta.tamanho <= 0 ||
    meta.tamanho > limites.max_bytes ||
    meta.tamanho > NR_ARQUIVO_MAX_BYTES
  )
    throw new Error(
      `Arquivo excede o limite de ${Math.floor(Math.min(limites.max_bytes, NR_ARQUIVO_MAX_BYTES) / (1024 * 1024))} MiB ou está vazio.`,
    );
  if (!/^[a-f0-9]{64}$/.test(meta.sha256))
    throw new Error("Informe um SHA-256 válido dos bytes originais.");
  return extensao;
}
export async function sha256Nr(bytes: Uint8Array): Promise<string> {
  const input =
    bytes.buffer instanceof ArrayBuffer
      ? (bytes as Uint8Array<ArrayBuffer>)
      : Uint8Array.from(bytes);
  const hash = await crypto.subtle.digest("SHA-256", input);
  return Array.from(new Uint8Array(hash), (value) => value.toString(16).padStart(2, "0")).join("");
}
const ascii = (bytes: Uint8Array, start: number, end: number) =>
  String.fromCharCode(...bytes.subarray(start, end));
const crcTable = Array.from({ length: 256 }, (_, n) => {
  let c = n;
  for (let k = 0; k < 8; k++) c = c & 1 ? 0xedb88320 ^ (c >>> 1) : c >>> 1;
  return c >>> 0;
});
function crc32(bytes: Uint8Array): number {
  let crc = 0xffffffff;
  for (const b of bytes) crc = (crcTable[(crc ^ b) & 255]! ^ (crc >>> 8)) >>> 0;
  return (crc ^ 0xffffffff) >>> 0;
}
function pngIntegro(bytes: Uint8Array): boolean {
  const view = new DataView(bytes.buffer, bytes.byteOffset, bytes.byteLength);
  let offset = 8,
    count = 0;
  if (
    bytes.length < 33 ||
    ascii(bytes, 12, 16) !== "IHDR" ||
    view.getUint32(8) !== 13 ||
    view.getUint32(16) === 0 ||
    view.getUint32(20) === 0
  )
    return false;
  while (offset + 12 <= bytes.length && count++ < 100_000) {
    const size = view.getUint32(offset),
      end = offset + 12 + size;
    if (
      end > bytes.length ||
      crc32(bytes.subarray(offset + 4, end - 4)) !== view.getUint32(end - 4)
    )
      return false;
    const kind = ascii(bytes, offset + 4, offset + 8);
    offset = end;
    if (kind === "IEND") return size === 0 && end === bytes.length;
  }
  return false;
}
type ZipEntry = {
  nome: string;
  comprimido: number;
  tamanho: number;
  crc: number;
  metodo: number;
  inicio: number;
  fim: number;
};
function lerZip(bytes: Uint8Array): ZipEntry[] {
  const v = new DataView(bytes.buffer, bytes.byteOffset, bytes.byteLength);
  let eocd = -1;
  for (let i = bytes.length - 22; i >= Math.max(0, bytes.length - 65557); i--)
    if (
      v.getUint32(i, true) === 0x06054b50 &&
      i + 22 + v.getUint16(i + 20, true) === bytes.length
    ) {
      eocd = i;
      break;
    }
  if (eocd < 0 || v.getUint16(eocd + 4, true) !== 0 || v.getUint16(eocd + 6, true) !== 0)
    throw new Error("Pacote Office truncado, dividido ou sem diretório íntegro.");
  const entries = v.getUint16(eocd + 10, true),
    dirSize = v.getUint32(eocd + 12, true),
    dirStart = v.getUint32(eocd + 16, true);
  if (
    entries === 0 ||
    entries > 10000 ||
    v.getUint16(eocd + 8, true) !== entries ||
    dirStart + dirSize !== eocd
  )
    throw new Error("Estrutura de pacote Office não suportada.");
  let pos = dirStart,
    total = 0;
  const result: ZipEntry[] = [],
    names = new Set<string>();
  const decoder = new TextDecoder("utf-8", { fatal: true });
  for (let index = 0; index < entries; index++) {
    if (pos + 46 > eocd || v.getUint32(pos, true) !== 0x02014b50)
      throw new Error("Diretório Office corrompido.");
    const flags = v.getUint16(pos + 8, true),
      metodo = v.getUint16(pos + 10, true),
      crc = v.getUint32(pos + 16, true),
      comprimido = v.getUint32(pos + 20, true),
      tamanho = v.getUint32(pos + 24, true),
      nameLen = v.getUint16(pos + 28, true),
      extraLen = v.getUint16(pos + 30, true),
      commentLen = v.getUint16(pos + 32, true),
      local = v.getUint32(pos + 42, true),
      external = v.getUint32(pos + 38, true);
    const end = pos + 46 + nameLen + extraLen + commentLen;
    if (
      end > eocd ||
      (flags & 1) !== 0 ||
      ![0, 8].includes(metodo) ||
      [comprimido, tamanho, local].includes(0xffffffff) ||
      ((external >>> 16) & 0xf000) === 0xa000
    )
      throw new Error("Pacote Office criptografado, ZIP64, atalho ou compressão não suportada.");
    const nome = decoder.decode(bytes.subarray(pos + 46, pos + 46 + nameLen));
    if (
      !nome ||
      nome.startsWith("/") ||
      nome.includes("\\") ||
      nome.includes("\0") ||
      nome.split("/").includes("..") ||
      names.has(nome)
    )
      throw new Error("Caminho ambíguo ou inseguro no pacote Office.");
    names.add(nome);
    if (
      /(?:vba|macros|activex|embeddings)(?:\/|\.|project|data)/i.test(nome) ||
      /\.(?:html?|js|exe|com|bat|cmd|ps1|bin)$/i.test(nome)
    )
      throw new Error(
        "Conteúdo ativo, macro ou objeto incorporado não suportado. Preserve a referência como pendente.",
      );
    total += tamanho;
    if (
      total > 64 * 1024 * 1024 ||
      tamanho > 32 * 1024 * 1024 ||
      (tamanho > 1024 * 1024 && tamanho / Math.max(1, comprimido) > 100)
    )
      throw new Error("Pacote Office excede o limite de expansão segura.");
    if (
      local + 30 > dirStart ||
      v.getUint32(local, true) !== 0x04034b50 ||
      v.getUint16(local + 8, true) !== metodo ||
      v.getUint16(local + 6, true) !== flags
    )
      throw new Error("Cabeçalho Office inconsistente.");
    const localNameLen = v.getUint16(local + 26, true),
      localExtraLen = v.getUint16(local + 28, true),
      inicio = local + 30 + localNameLen + localExtraLen,
      fim = inicio + comprimido;
    if (
      fim > dirStart ||
      decoder.decode(bytes.subarray(local + 30, local + 30 + localNameLen)) !== nome
    )
      throw new Error("Arquivo interno Office truncado ou divergente.");
    result.push({ nome, comprimido, tamanho, crc, metodo, inicio, fim });
    pos = end;
  }
  if (pos !== eocd) throw new Error("Diretório Office contém bytes inesperados.");
  return result;
}
async function officeMime(bytes: Uint8Array): Promise<string> {
  const entries = lerZip(bytes),
    xml = new Map<string, string>();
  const { Inflate } = await import("fflate");
  for (const entry of entries) {
    const raw = bytes.subarray(entry.inicio, entry.fim);
    const readXml = [
      "[Content_Types].xml",
      "word/document.xml",
      "xl/workbook.xml",
      "_rels/.rels",
    ].includes(entry.nome);
    const pieces: Uint8Array[] = [];
    let size = 0,
      crc = 0xffffffff;
    function part(output: Uint8Array) {
      size += output.length;
      if (size > entry.tamanho || size > 32 * 1024 * 1024)
        throw new Error("Expansão Office excedeu o tamanho declarado.");
      for (const b of output) crc = (crcTable[(crc ^ b) & 255]! ^ (crc >>> 8)) >>> 0;
      if (readXml) pieces.push(output);
    }
    try {
      if (entry.metodo === 0) part(raw);
      else {
        const inflate = new Inflate((chunk) => part(chunk));
        if (!raw.length) inflate.push(raw, true);
        for (let start = 0; start < raw.length; start += 4096)
          inflate.push(raw.subarray(start, start + 4096), start + 4096 >= raw.length);
      }
    } catch {
      throw new Error("Pacote Office contém um arquivo interno inválido ou expansão excessiva.");
    }
    if (size !== entry.tamanho || (crc ^ 0xffffffff) >>> 0 !== entry.crc)
      throw new Error("Integridade interna do pacote Office não confere.");
    if (readXml) {
      const output = new Uint8Array(size);
      let position = 0;
      for (const piece of pieces) {
        output.set(piece, position);
        position += piece.length;
      }
      const value = new TextDecoder().decode(output);
      if (/<!DOCTYPE|<!ENTITY|<\s*(?:\w+:)?altChunk\b/i.test(value))
        throw new Error("XML ativo ou inclusão de HTML não suportada.");
      xml.set(entry.nome, value);
    }
  }
  const types = xml.get("[Content_Types].xml") ?? "";
  if (/macroEnabled|vbaProject|activeX|oleObject/i.test(types))
    throw new Error("Macros e objetos ativos não são aceitos.");
  if (
    xml.has("word/document.xml") &&
    /application\/vnd\.openxmlformats-officedocument\.wordprocessingml\.document\.main\+xml/.test(
      types,
    )
  )
    return NR_ARQUIVO_MIMES.docx;
  if (
    xml.has("xl/workbook.xml") &&
    /application\/vnd\.openxmlformats-officedocument\.spreadsheetml\.sheet\.main\+xml/.test(types)
  )
    return NR_ARQUIVO_MIMES.xlsx;
  throw new Error("O pacote ZIP não corresponde a DOCX ou XLSX suportado.");
}
export async function mimeDetectadoNr(bytes: Uint8Array): Promise<string | null> {
  if (bytes.length >= 12 && ascii(bytes, 0, 5) === "%PDF-")
    return ascii(bytes, Math.max(0, bytes.length - 2048), bytes.length).includes("%%EOF")
      ? NR_ARQUIVO_MIMES.pdf
      : null;
  if ([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a].every((b, i) => bytes[i] === b))
    return pngIntegro(bytes) ? NR_ARQUIVO_MIMES.png : null;
  if (
    bytes.length > 4 &&
    bytes[0] === 0xff &&
    bytes[1] === 0xd8 &&
    bytes[2] === 0xff &&
    bytes[bytes.length - 2] === 0xff &&
    bytes[bytes.length - 1] === 0xd9
  )
    return NR_ARQUIVO_MIMES.jpg;
  if (
    bytes.length >= 20 &&
    ascii(bytes, 0, 4) === "RIFF" &&
    ascii(bytes, 8, 12) === "WEBP" &&
    ["VP8 ", "VP8L", "VP8X"].includes(ascii(bytes, 12, 16)) &&
    new DataView(bytes.buffer, bytes.byteOffset, bytes.byteLength).getUint32(4, true) + 8 ===
      bytes.length
  )
    return NR_ARQUIVO_MIMES.webp;
  if (
    bytes.length >= 22 &&
    bytes[0] === 0x50 &&
    bytes[1] === 0x4b &&
    bytes[2] === 0x03 &&
    bytes[3] === 0x04
  )
    return officeMime(bytes);
  return null;
}
export async function validarBinarioNr(
  bytes: Uint8Array,
  meta: { nome: string; mime: string; tamanho: number; sha256: string },
  limites?: Pick<NrArquivoLimites, "max_bytes" | "mime_types" | "extensoes">,
) {
  const extensao = validarMetadataNr(meta, limites);
  if (bytes.byteLength !== meta.tamanho)
    throw new Error("O tamanho dos bytes armazenados diverge do envio.");
  const sha256 = await sha256Nr(bytes);
  if (sha256 !== meta.sha256)
    throw new Error(
      "SHA-256 dos bytes armazenados diverge do original. O arquivo não foi vinculado.",
    );
  const mime = await mimeDetectadoNr(bytes);
  if (mime !== meta.mime)
    throw new Error("MIME real dos bytes diverge da extensão ou do tipo informado.");
  return { mime, extensao, tamanho: bytes.length, sha256 };
}
