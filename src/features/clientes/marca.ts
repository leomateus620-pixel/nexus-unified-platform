import type { ClienteMarca } from "./schemas";

export const CLIENTE_MARCA_BUCKET = "nexus-clientes-marcas";
export const CLIENTE_MARCA_MAX_BYTES = 1048576;

/** Dimensões do binário, nunca do nome ou dos metadados enviados pelo navegador. */
export function dimensoesMarca(bytes: Uint8Array, mime: "image/png" | "image/jpeg") {
  const view = new DataView(bytes.buffer, bytes.byteOffset, bytes.byteLength);
  let largura = 0,
    altura = 0;
  if (mime === "image/png" && bytes.length >= 24) {
    largura = view.getUint32(16);
    altura = view.getUint32(20);
  } else if (mime === "image/jpeg") {
    let offset = 2;
    while (offset + 4 < bytes.length) {
      if (bytes[offset] !== 0xff) break;
      const marker = bytes[offset + 1]!;
      if (marker === 0xda || marker === 0xd9) break;
      if (marker === 0xd8 || marker === 0x01 || (marker >= 0xd0 && marker <= 0xd7)) {
        offset += 2;
        continue;
      }
      const size = view.getUint16(offset + 2);
      if (size < 2 || offset + size + 2 > bytes.length) break;
      if (
        [0xc0, 0xc1, 0xc2, 0xc3, 0xc5, 0xc6, 0xc7, 0xc9, 0xca, 0xcb, 0xcd, 0xce, 0xcf].includes(
          marker,
        ) &&
        size >= 7
      ) {
        altura = view.getUint16(offset + 5);
        largura = view.getUint16(offset + 7);
        break;
      }
      offset += size + 2;
    }
  }
  if (!largura || !altura || largura > 8192 || altura > 8192)
    throw new Error("Use uma marca PNG ou JPEG com dimensões de até 8192 × 8192 px.");
  return { largura, altura };
}

/** Caminho publicado pela Nexus ou URL temporária autorizada; nunca usa hotlink da origem. */
export function marcaImagem(marca: ClienteMarca | null | undefined) {
  if (!marca) return undefined;
  if (marca.caminho.startsWith("/brands/") && !marca.caminho.includes("..")) return marca.caminho;
  return marca.url;
}

export function marcaMonograma(nome: string) {
  return (
    nome
      .trim()
      .split(/\s+/)
      .filter(Boolean)
      .slice(0, 2)
      .map((part) => part[0])
      .join("")
      .toLocaleUpperCase("pt-BR") || "?"
  );
}
