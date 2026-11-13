import "@tanstack/react-start/server-only";
import { sha256 } from "@/features/operacao/files";
import { imageInfo } from "@/features/nr/image-worker/image-info.server";

const maxPreviewBytes = 4 * 1024 * 1024;
const maxImageBytes = 10 * 1024 * 1024;
const maxPixels = 24_000_000;
const formatos = [
  ["miniatura_384", 384],
  ["previa_768", 768],
] as const;

type Variante = (typeof formatos)[number][0];
type Derivados = Partial<Record<Variante, { caminho: string; sha256: string; bytes: number }>>;
type Foto = {
  caminho: string;
  mime: string;
  miniatura_caminho: string | null;
  previa_caminho: string | null;
};
const rootPath = /^[0-9a-f-]{36}\/[0-9a-f-]{36}\/original\.(?:jpg|png|webp)$/;

/** A transformação pode falhar sem bloquear o download do original já verificado. */
export async function gerarDerivadosInspecoes(
  foto: Foto,
  original: Uint8Array,
): Promise<Derivados> {
  const url = process.env["SUPABASE_URL"];
  const key = process.env["SUPABASE_SERVICE_ROLE_KEY"];
  if (!url || !key || original.length > maxImageBytes || !rootPath.test(foto.caminho)) return {};
  const base = new URL(url);
  if (base.origin !== "https://yhtgijtllvgzoqtfcgal.supabase.co" || base.href !== base.origin + "/")
    return {};
  let source;
  try {
    source = imageInfo(original);
  } catch {
    return {};
  }
  if (
    source.mime !== foto.mime ||
    source.width * source.height > maxPixels ||
    !Number.isSafeInteger(source.width) ||
    !Number.isSafeInteger(source.height)
  )
    return {};

  const storage = base.origin + "/storage/v1";
  const headers: Record<string, string> = { apikey: key };
  if (!key.startsWith("sb_")) headers["Authorization"] = "Bearer " + key;
  const enc = (path: string) => path.split("/").map(encodeURIComponent).join("/");
  const path = "inspecoes-acervo/" + enc(foto.caminho);
  const prefix = foto.caminho.slice(0, foto.caminho.lastIndexOf("/") + 1);
  const derivados: Derivados = {};
  const signal = AbortSignal.timeout(18_000);
  const fetchStorage = (endpoint: string, init?: RequestInit) =>
    fetch(storage + endpoint, {
      ...init,
      headers: { ...headers, ...init?.headers },
      signal,
      redirect: "error",
      cache: "no-store",
    });

  for (const [variante, limite] of formatos) {
    if (variante === "miniatura_384" ? foto.miniatura_caminho : foto.previa_caminho) continue;
    try {
      const lado = Math.min(limite, Math.max(source.width, source.height));
      const query = new URLSearchParams({
        width: String(lado),
        height: String(lado),
        resize: "contain",
        quality: "88",
      });
      const transformed = await fetchStorage("/render/image/authenticated/" + path + "?" + query, {
        headers: { Accept: "image/webp" },
      });
      const bytes = await webpBytes(transformed);
      const preview = imageInfo(bytes);
      const rotated = [5, 6, 7, 8].includes(source.orientation ?? 1);
      const [width, height] = rotated
        ? [source.height, source.width]
        : [source.width, source.height];
      const scale = lado / Math.max(width, height);
      const validDimension = (actual: number, before: number) =>
        actual <= before && Math.abs(actual - Math.max(1, Math.round(before * scale))) <= 1;
      if (
        preview.mime !== "image/webp" ||
        Math.max(preview.width, preview.height) !== lado ||
        !validDimension(preview.width, width) ||
        !validDimension(preview.height, height)
      )
        continue;

      const caminho = prefix + variante + ".webp";
      const destination = "inspecoes-acervo/" + enc(caminho);
      const sent = await fetchStorage("/object/" + destination, {
        method: "POST",
        headers: { "Content-Type": "image/webp", "x-upsert": "false" },
        body: bytes,
      });
      // Storage returns 400 or 409 when a concurrent/retried request already created the object.
      if (!sent.ok && sent.status !== 400 && sent.status !== 409) continue;
      await sent.body?.cancel();
      const persisted = await webpBytes(await fetchStorage("/object/authenticated/" + destination));
      const digest = await sha256(bytes);
      if (persisted.length !== bytes.length || (await sha256(persisted)) !== digest) continue;
      derivados[variante] = { caminho, sha256: digest, bytes: bytes.length };
    } catch {
      // Preserve other successful representations and allow retry using the same immutable paths.
    }
  }
  return derivados;
}

async function webpBytes(response: Response): Promise<Uint8Array<ArrayBuffer>> {
  const length = response.headers.get("content-length");
  if (
    !response.ok ||
    response.headers.get("content-type")?.split(";")[0]?.trim().toLowerCase() !== "image/webp" ||
    (length !== null && (!/^\d+$/.test(length) || Number(length) > maxPreviewBytes))
  ) {
    await response.body?.cancel();
    throw new Error("Representação WebP indisponível.");
  }
  const bytes = await lerArquivoLimitado(response.body, maxPreviewBytes);
  const texto = new TextDecoder("ascii");
  if (
    bytes.length < 20 ||
    texto.decode(bytes.subarray(0, 4)) !== "RIFF" ||
    texto.decode(bytes.subarray(8, 12)) !== "WEBP" ||
    new DataView(bytes.buffer).getUint32(4, true) + 8 !== bytes.length
  )
    throw new Error("Representação WebP inválida.");
  return bytes;
}

export async function lerArquivoLimitado(
  stream: ReadableStream | null,
  maximo: number,
): Promise<Uint8Array<ArrayBuffer>> {
  const reader = stream?.getReader();
  if (!reader) throw new Error("Arquivo ainda não disponível no armazenamento.");
  const buffer = new Uint8Array(maximo);
  let offset = 0;
  try {
    while (true) {
      const part = await reader.read();
      if (part.done) break;
      if (!(part.value instanceof Uint8Array) || offset + part.value.length > maximo)
        throw new Error("O arquivo armazenado excede o tamanho esperado.");
      buffer.set(part.value, offset);
      offset += part.value.length;
    }
    return buffer.subarray(0, offset);
  } finally {
    void reader.cancel().catch(() => undefined);
    reader.releaseLock();
  }
}
