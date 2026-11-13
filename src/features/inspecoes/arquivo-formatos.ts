import { mimeDetectado, sha256, validarBinario } from "@/features/operacao/files";
import { mimeDetectadoNr, NR_ARQUIVO_MIMES } from "@/features/nr/files";

export const inspecoesAnexoTipos = ["levantamento", "registro", "contrato", "unidade"] as const;
export type InspecoesAnexoAlvo = { tipo: (typeof inspecoesAnexoTipos)[number]; id: string };
export const inspecoesAnexoPapeis = [
  "original",
  "documento",
  "contrato",
  "foto",
  "art",
  "certificado",
  "projeto",
  "ensaio",
  "evidencia",
] as const;
export type InspecoesAnexoPapel = (typeof inspecoesAnexoPapeis)[number];
export const inspecoesUploadLimite = 20 * 1024 * 1024;

export const inspecoesUploadMimes = [
  "application/pdf",
  NR_ARQUIVO_MIMES.docx,
  "image/jpeg",
  "image/png",
  "image/webp",
  "video/mp4",
  "video/webm",
] as const;

function ascii(bytes: Uint8Array, start: number, count: number) {
  return String.fromCharCode(...bytes.subarray(start, start + count));
}

// https://mimesniff.spec.whatwg.org/#signature-for-mp4
function mp4(bytes: Uint8Array) {
  if (bytes.length < 16 || ascii(bytes, 4, 4) !== "ftyp") return false;
  const size = new DataView(bytes.buffer, bytes.byteOffset, bytes.byteLength).getUint32(0);
  if (size < 16 || size > bytes.length || size % 4) return false;
  if (ascii(bytes, 8, 3) === "mp4") return true;
  for (let brand = 16; brand < size; brand += 4) {
    if (ascii(bytes, brand, 3) === "mp4") return true;
  }
  return false;
}

// The EBML signature alone also matches Matroska. Require a WebM DocType.
// https://www.webmproject.org/docs/container/
function webm(bytes: Uint8Array) {
  if (![0x1a, 0x45, 0xdf, 0xa3].every((value, index) => bytes[index] === value)) return false;
  for (let index = 4; index + 7 < Math.min(bytes.length, 46); index += 1) {
    if (bytes[index] !== 0x42 || bytes[index + 1] !== 0x82) continue;
    const first = bytes[index + 2] ?? 0;
    if (!first) continue;
    const width = Math.clz32(first) - 23;
    const end = index + 2 + width;
    if (end + 4 > bytes.length) continue;
    let size = first & (0xff >> width);
    for (let cursor = index + 3; cursor < end; cursor += 1) {
      size = size * 256 + (bytes[cursor] ?? 0);
    }
    if (size === 4 && ascii(bytes, end, 4) === "webm") return true;
  }
  return false;
}

export function mimeInspecoes(bytes: Uint8Array) {
  return mimeDetectado(bytes) ?? (mp4(bytes) ? "video/mp4" : webm(bytes) ? "video/webm" : null);
}

export async function detectarArquivoInspecoes(bytes: Uint8Array) {
  if (bytes.length < 1 || bytes.length > inspecoesUploadLimite)
    throw new Error("Selecione um arquivo de até 20 MiB.");
  if (ascii(bytes, 0, 4) === "PK\x03\x04") return mimeDetectadoNr(bytes);
  return mimeInspecoes(bytes);
}

export function mimesPorPapel(papel: InspecoesAnexoPapel): readonly string[] {
  if (papel === "original" || papel === "art") return ["application/pdf"];
  if (papel === "foto") return ["image/jpeg", "image/png", "image/webp"];
  if (["documento", "contrato", "certificado", "projeto"].includes(papel))
    return ["application/pdf", NR_ARQUIVO_MIMES.docx];
  return inspecoesUploadMimes;
}

export async function validarArquivoInspecoes(
  bytes: Uint8Array,
  meta: { tamanho: number; mime: string; sha256: string },
) {
  if (!["video/mp4", "video/webm", NR_ARQUIVO_MIMES.docx].includes(meta.mime)) {
    return validarBinario(bytes, meta);
  }
  if (bytes.byteLength !== meta.tamanho || bytes.byteLength > inspecoesUploadLimite)
    throw new Error("O tamanho do arquivo armazenado diverge do envio.");
  if ((await detectarArquivoInspecoes(bytes)) !== meta.mime)
    throw new Error("O arquivo armazenado não corresponde ao formato informado.");
  if ((await sha256(bytes)) !== meta.sha256)
    throw new Error("O arquivo armazenado não corresponde ao hash informado. Repita o envio.");
}
