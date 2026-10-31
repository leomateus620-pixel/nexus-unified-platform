import type { ImageInfo } from "./image-info.ts";

export const PROCESSOR = "nexus-storage-transform-v1";
export const NEXUS_STORAGE_ORIGIN = "https://yhtgijtllvgzoqtfcgal.supabase.co";
export const MAX_PROCESS_BYTES = 25_000_000;
export const MAX_ORIGINAL_BYTES = 50 * 1024 * 1024;
export const MAX_PIXELS = 24_000_000;
const MAX_PREVIEW_BYTES = 4 * 1024 * 1024;
const BUCKET = "nexus-nr-acervo";
const uuid = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;
const hash = /^[0-9a-f]{64}$/;
type Binary = Uint8Array<ArrayBuffer>;
type Job = {
  id: string;
  lease: string;
  organization_id: string;
  arquivo_id: string;
  original_sha256: string;
  original_caminho: string;
  original_mime: string;
  original_tamanho: number;
  processador: typeof PROCESSOR;
  variante: "miniatura_384" | "previa_768";
  caminho: string;
};
type WorkerOptions = {
  url: string;
  serviceKey: string;
  fetch?: typeof fetch;
  inspectImage: (data: Uint8Array) => ImageInfo;
  now?: () => number;
};
class WorkerFailure extends Error {
  constructor(readonly code: string) {
    super(code);
  }
}
function fail(code: string): never {
  throw new WorkerFailure(code);
}
const mime = (value: string) => value.split(";")[0]!.trim().toLowerCase();
const sameMime = (a: string, b: string) => {
  const normalize = (value: string) =>
    mime(value).replace("image/jpg", "image/jpeg").replace("image/heif", "image/heic");
  return normalize(a) === normalize(b);
};
export async function sha256(bytes: Uint8Array): Promise<string> {
  const digest = await crypto.subtle.digest("SHA-256", new Uint8Array(bytes).buffer);
  return Array.from(new Uint8Array(digest), (byte) => byte.toString(16).padStart(2, "0")).join("");
}
async function bytesLimited(response: Response, limit: number): Promise<Binary> {
  const declared = response.headers.get("content-length");
  if (declared !== null && (!/^\d+$/.test(declared) || Number(declared) > limit))
    fail("limite_de_bytes");
  if (!response.body) fail("resposta_sem_binario");
  const reader = response.body!.getReader();
  const chunks: Uint8Array[] = [];
  let total = 0;
  try {
    while (true) {
      const chunk = await reader.read();
      if (chunk.done) break;
      total += chunk.value.byteLength;
      if (total > limit) {
        await reader.cancel();
        fail("limite_de_bytes");
      }
      chunks.push(chunk.value);
    }
  } finally {
    reader.releaseLock();
  }
  const result = new Uint8Array(total);
  let offset = 0;
  for (const chunk of chunks) {
    result.set(chunk, offset);
    offset += chunk.byteLength;
  }
  return result;
}
function validateJob(raw: Record<string, unknown>): Job {
  for (const key of ["id", "lease", "organization_id", "arquivo_id"])
    if (typeof raw[key] !== "string" || !uuid.test(raw[key] as string)) fail("trabalho_invalido");
  if (
    raw.processador !== PROCESSOR ||
    !["miniatura_384", "previa_768"].includes(String(raw.variante)) ||
    !hash.test(String(raw.original_sha256))
  )
    fail("trabalho_invalido");
  const expected = `${raw.organization_id}/representacoes/${raw.arquivo_id}/${raw.original_sha256}/${PROCESSOR}/${raw.variante}.webp`;
  if (raw.caminho !== expected) fail("caminho_de_representacao_invalido");
  const original = String(raw.original_caminho ?? "");
  if (
    original.length > 2048 ||
    original.split("/")[0] !== raw.organization_id ||
    original.split("/").some((part) => !part || part === "." || part === "..") ||
    /[\\?#]/.test(original) ||
    Array.from(original).some((character) => character.charCodeAt(0) < 32)
  )
    fail("caminho_do_original_invalido");
  const size = Number(raw.original_tamanho);
  if (!Number.isSafeInteger(size) || size < 1 || size > MAX_ORIGINAL_BYTES)
    fail("metadados_do_original_invalidos");
  if (typeof raw.original_mime !== "string" || !raw.original_mime.startsWith("image/"))
    fail("mime_do_original_invalido");
  return { ...raw, original_tamanho: size } as Job;
}
const encodedPath = (path: string) => path.split("/").map(encodeURIComponent).join("/");
const json = (body: Record<string, unknown>, status = 200) =>
  new Response(JSON.stringify(body), {
    status,
    headers: {
      "content-type": "application/json",
      "cache-control": "no-store",
      "x-content-type-options": "nosniff",
    },
  });

export function createImageWorker(options: WorkerOptions): (request: Request) => Promise<Response> {
  const transport = options.fetch ?? fetch;
  const now = options.now ?? (() => performance.now());
  const base = new URL(options.url);
  if (
    base.protocol !== "https:" ||
    base.origin !== NEXUS_STORAGE_ORIGIN ||
    base.username ||
    base.password ||
    base.search ||
    base.hash ||
    base.pathname !== "/"
  )
    throw Error("Invalid private worker origin");
  const root = base.origin;
  const headers: Record<string, string> = { apikey: options.serviceKey };
  if (!options.serviceKey.startsWith("sb_")) headers.Authorization = `Bearer ${options.serviceKey}`;
  return async (request: Request): Promise<Response> => {
    const started = now();
    if (request.method !== "POST") return json({ error: "metodo_nao_permitido" }, 405);
    if (!options.serviceKey) return json({ error: "worker_nao_configurado" }, 503);
    const token = request.headers.get("X-Nexus-Job-Token") ?? "";
    if (!/^[a-f0-9]{64}$/.test(token)) return json({ error: "acesso_negado" }, 403);
    const deadline = new AbortController();
    const timer = setTimeout(() => deadline.abort(), 45_000);
    const elapsed = () => Math.round(now() - started);
    let claimed: { id: string; lease: string } | null = null;
    const call = (url: string, init: RequestInit = {}) =>
      transport(url, {
        ...init,
        redirect: "error",
        signal: deadline.signal,
        headers: { ...headers, ...init.headers },
      });
    const rpc = async (name: string, data: Record<string, unknown>) => {
      const response = await call(`${root}/rest/v1/rpc/${name}`, {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify(data),
      });
      if (!response.ok) fail("rpc_indisponivel");
      const body = await bytesLimited(response, 32_768);
      return body.length ? JSON.parse(new TextDecoder().decode(body)) : null;
    };
    try {
      // A short-lived invocation ticket is consumed atomically by this service-only RPC.
      // Only its hash is stored; the RPC never returns a ticket or a persistent secret.
      try {
        if ((await rpc("nr_imagem_worker_validar", { p_token: token })) !== true)
          return json({ error: "acesso_negado" }, 403);
      } catch {
        return json({ error: "acesso_negado" }, 403);
      }
      // Request payload is deliberately ignored: no caller-supplied organization, path or limit.
      const jobs: unknown = await rpc("nr_imagem_trabalho_obter", {
        p_limite: 1,
        p_processador: PROCESSOR,
      });
      if (!Array.isArray(jobs) || jobs.length > 1) fail("resposta_de_fila_invalida");
      if (!jobs.length)
        return json({
          processor: PROCESSOR,
          processed: 0,
          ready: 0,
          failed: 0,
          elapsed_ms: elapsed(),
        });
      const raw = jobs[0] as Record<string, unknown>;
      if (uuid.test(String(raw.id)) && uuid.test(String(raw.lease)))
        claimed = { id: String(raw.id), lease: String(raw.lease) };
      const job = validateJob(raw);
      if (job.original_tamanho > MAX_PROCESS_BYTES)
        fail("original_preservado_limite_automatico_25mb");
      const originalResponse = await call(
        `${root}/storage/v1/object/authenticated/${BUCKET}/${encodedPath(job.original_caminho)}`,
      );
      if (!originalResponse.ok) fail("original_indisponivel");
      if (!sameMime(originalResponse.headers.get("content-type") ?? "", job.original_mime))
        fail("mime_do_original_divergente");
      const original = await bytesLimited(originalResponse, MAX_PROCESS_BYTES);
      if (
        original.length !== job.original_tamanho ||
        (await sha256(original)) !== job.original_sha256
      )
        fail("original_divergente");
      let source: ImageInfo;
      try {
        source = options.inspectImage(original);
      } catch {
        fail("imagem_do_original_invalida");
      }
      if (!sameMime(source!.mime, job.original_mime)) fail("mime_real_do_original_divergente");
      if (
        !Number.isSafeInteger(source!.width) ||
        !Number.isSafeInteger(source!.height) ||
        source!.width < 1 ||
        source!.height < 1 ||
        source!.width * source!.height > MAX_PIXELS
      )
        fail("original_preservado_limite_automatico_24mp");
      const limit = job.variante === "miniatura_384" ? 384 : 768;
      const side = Math.min(limit, Math.max(source!.width, source!.height));
      const transform = new URL(
        `${root}/storage/v1/render/image/authenticated/${BUCKET}/${encodedPath(job.original_caminho)}`,
      );
      transform.search = new URLSearchParams({
        width: String(side),
        height: String(side),
        resize: "contain",
        quality: "88",
      }).toString();
      const transformStarted = now();
      const transformedResponse = await call(transform.href, { headers: { Accept: "image/webp" } });
      if (!transformedResponse.ok) fail("transformacao_indisponivel");
      if (mime(transformedResponse.headers.get("content-type") ?? "") !== "image/webp")
        fail("mime_da_representacao_divergente");
      const transformed = await bytesLimited(transformedResponse, MAX_PREVIEW_BYTES);
      const transformMs = Math.round(now() - transformStarted);
      let preview: ImageInfo;
      try {
        preview = options.inspectImage(transformed);
      } catch {
        fail("representacao_invalida");
      }
      const text = new TextDecoder("ascii");
      if (
        preview!.mime !== "image/webp" ||
        text.decode(transformed.subarray(0, 4)) !== "RIFF" ||
        text.decode(transformed.subarray(8, 12)) !== "WEBP" ||
        transformed.length < 20 ||
        new DataView(transformed.buffer).getUint32(4, true) + 8 !== transformed.length
      )
        fail("webp_invalido");
      const before = [source!.width, source!.height].sort((a, b) => a - b);
      const after = [preview!.width, preview!.height].sort((a, b) => a - b);
      const expectedShort = Math.max(1, Math.round((before[0]! * side) / before[1]!));
      if (
        after[1] !== side ||
        Math.abs(after[0]! - expectedShort) > 1 ||
        after[0]! > before[0]! ||
        after[1]! > before[1]!
      )
        fail("dimensoes_da_representacao_divergentes");
      if (
        source!.orientation &&
        [5, 6, 7, 8].includes(source!.orientation) &&
        Math.sign(preview!.width - preview!.height) !== Math.sign(source!.height - source!.width)
      )
        fail("orientacao_da_representacao_divergente");
      const digest = await sha256(transformed);
      const target = `${root}/storage/v1/object/${BUCKET}/${encodedPath(job.caminho)}`;
      // Never overwrite: even a retry must prove that the existing private object is identical.
      await call(target, {
        method: "POST",
        headers: { "content-type": "image/webp", "x-upsert": "false" },
        body: transformed,
      });
      const verification = await call(
        `${root}/storage/v1/object/authenticated/${BUCKET}/${encodedPath(job.caminho)}`,
      );
      if (!verification.ok || mime(verification.headers.get("content-type") ?? "") !== "image/webp")
        fail("leitura_privada_nao_confirmada");
      const persisted = await bytesLimited(verification, MAX_PREVIEW_BYTES);
      if (persisted.length !== transformed.length || (await sha256(persisted)) !== digest)
        fail("representacao_persistida_divergente");
      await rpc("nr_imagem_trabalho_concluir", {
        p_id: job.id,
        p_lease: job.lease,
        p_resultado: {
          estado: "disponivel",
          mime: "image/webp",
          tamanho: persisted.length,
          largura: preview!.width,
          altura: preview!.height,
          sha256: digest,
        },
      });
      claimed = null;
      // The private SQL completion trigger schedules the next job. This handler
      // never recursively invokes itself or starts work after its response.
      return json({
        processor: PROCESSOR,
        processed: 1,
        ready: 1,
        failed: 0,
        bytes: persisted.length,
        transform_ms: transformMs,
        elapsed_ms: elapsed(),
      });
    } catch (error) {
      const code =
        error instanceof WorkerFailure
          ? error.code
          : deadline.signal.aborted
            ? "tempo_de_processamento_esgotado"
            : "worker_indisponivel";
      let recorded = false;
      if (claimed && !deadline.signal.aborted) {
        try {
          await rpc("nr_imagem_trabalho_concluir", {
            p_id: claimed.id,
            p_lease: claimed.lease,
            p_resultado: { estado: "falhou", erro: code },
          });
          recorded = true;
        } catch {
          /* The lease/cron recover a network interruption; never fake completion. */
        }
      }
      return json(
        {
          processor: PROCESSOR,
          processed: claimed ? 1 : 0,
          ready: 0,
          failed: 1,
          recorded,
          error: code,
          elapsed_ms: elapsed(),
        },
        claimed ? 200 : 503,
      );
    } finally {
      clearTimeout(timer);
    }
  };
}
