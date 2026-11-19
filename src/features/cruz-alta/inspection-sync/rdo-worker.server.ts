import "@tanstack/react-start/server-only";
import { z } from "zod";
import { imageInfo } from "@/features/nr/image-worker/image-info.server";
import {
  createDrive,
  driveId,
  readLimited,
  serviceCredentials,
  sha256Hex,
  SyncFailure,
} from "./drive.server";
import { isRasterPhotoMime, rasterPhotoSignature } from "./photo-media.server";
import {
  assetPath,
  rdoAssets,
  rdoBucket,
  rdoDerivativeBytes,
  rdoDerivativeLimits,
  rdoRef,
  rdoVariants,
  type RdoAsset,
} from "./rdo-storage.server";
import { rdoFolderCode } from "./sources.server";
import {
  createInspectionService,
  inspectionTicket,
  workerResponse,
  type InspectionServiceOptions,
} from "./service.server";

const maxPixels = 24_000_000;
const lease = z.object({ id: z.string().uuid(), lease: z.string().uuid() });
const scope = lease.extend({
  organization: z.string().uuid(),
  unit: z.string().uuid(),
  folderId: z.string().regex(driveId),
});
const folderIdentity = z.object({
  code: z.string().regex(/^\d{2}(?:\.\d+)?$/),
  resourceKey: z
    .string()
    .regex(/^[A-Za-z0-9_-]{1,250}$/)
    .nullable(),
});
const jobSchema = z.discriminatedUnion("kind", [
  scope.merge(folderIdentity).extend({ kind: z.literal("catalogo") }),
  scope.merge(folderIdentity).extend({ kind: z.literal("midia"), foto: rdoRef }),
  scope.extend({ kind: z.literal("limpeza"), foto: rdoRef }),
]);
const originSchema = z.object({
  credential: z.string().min(1),
  folders: z
    .array(
      z.object({
        id: z.string().regex(driveId),
        parentId: z.string().regex(driveId),
        rootId: z.string().regex(driveId),
      }),
    )
    .length(1),
});
type Job = z.infer<typeof jobSchema>;
type WorkerService = ReturnType<typeof createInspectionService>;

const encoded = (path: string) => path.split("/").map(encodeURIComponent).join("/");
const storagePath = (path: string, access = "object") =>
  `/storage/v1/${access}/${rdoBucket}/${encoded(path)}`;

async function verifiedImage(response: Response, limit: number, expectedMime?: string) {
  const mime = response.headers.get("content-type")?.split(";")[0]?.trim().toLowerCase();
  if (!response.ok || !isRasterPhotoMime(mime) || (expectedMime && mime !== expectedMime)) {
    await response.body?.cancel();
    throw new SyncFailure(
      "binario_rdo_indisponivel",
      response.status >= 500 || response.status === 429,
    );
  }
  const body = await readLimited(response, limit, "limite_binario_rdo");
  if (!rasterPhotoSignature(body, mime)) throw new SyncFailure("imagem_rdo_invalida");
  const sha256 = await sha256Hex(body);
  return { body, metadata: { mime, bytes: body.length, sha256 } };
}

async function preserve(
  service: WorkerService,
  path: string,
  image: Awaited<ReturnType<typeof verifiedImage>>,
  signal: AbortSignal,
) {
  const sent = await service.request(storagePath(path), {
    method: "POST",
    headers: { "content-type": image.metadata.mime, "x-upsert": "false" },
    body: image.body,
    signal,
  });
  await sent.body?.cancel();
  if (!sent.ok && sent.status !== 400 && sent.status !== 409)
    throw new SyncFailure("armazenamento_rdo_indisponivel", true);
  const persisted = await verifiedImage(
    await service.request(storagePath(path, "object/authenticated"), { signal }),
    image.metadata.bytes,
    image.metadata.mime,
  );
  if (
    persisted.metadata.sha256 !== image.metadata.sha256 ||
    persisted.metadata.bytes !== image.metadata.bytes
  )
    throw new SyncFailure("arquivo_rdo_persistido_divergente");
  return image.metadata;
}

function dimensions(buffer: Uint8Array, mime: string) {
  const image = imageInfo(buffer);
  if (
    image.mime !== mime ||
    !Number.isSafeInteger(image.width * image.height) ||
    image.width * image.height > maxPixels
  )
    throw new SyncFailure("dimensoes_rdo_indisponiveis");
  return image.orientation && [5, 6, 7, 8].includes(image.orientation)
    ? { width: image.height, height: image.width }
    : image;
}

async function derivative(
  service: WorkerService,
  original: string,
  destination: string,
  size: ReturnType<typeof dimensions>,
  variant: keyof typeof rdoDerivativeLimits,
  signal: AbortSignal,
): Promise<RdoAsset> {
  const side = Math.min(rdoDerivativeLimits[variant], Math.max(size.width, size.height));
  const query = new URLSearchParams({
    width: String(side),
    height: String(side),
    resize: "contain",
    quality: "88",
  });
  const response = await service.request(
    `${storagePath(original, "render/image/authenticated")}?${query}`,
    {
      headers: { Accept: "image/webp" },
      signal,
    },
  );
  const image = await verifiedImage(response, rdoDerivativeBytes[variant], "image/webp");
  const sizeAfter = dimensions(image.body, "image/webp");
  const scale = side / Math.max(size.width, size.height);
  if (
    Math.max(sizeAfter.width, sizeAfter.height) !== side ||
    Math.abs(sizeAfter.width - Math.max(1, Math.round(size.width * scale))) > 1 ||
    Math.abs(sizeAfter.height - Math.max(1, Math.round(size.height * scale))) > 1 ||
    image.body.length < 20 ||
    new DataView(image.body.buffer).getUint32(4, true) + 8 !== image.body.length
  )
    throw new SyncFailure("previa_rdo_divergente");
  return preserve(service, destination, image, signal);
}

export function createRdoWorker(options: InspectionServiceOptions) {
  const service = createInspectionService(options);

  async function process(job: Job, signal: AbortSignal) {
    if (job.kind === "limpeza") {
      if (job.folderId !== job.foto.folderId) throw new SyncFailure("pasta_rdo_divergente");
      const prefixes = rdoVariants.map((variant) =>
        assetPath(job.organization, job.unit, job.foto, variant),
      );
      const response = await service.request(`/storage/v1/object/${rdoBucket}`, {
        method: "DELETE",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ prefixes }),
        signal,
      });
      await response.body?.cancel();
      if (!response.ok) throw new SyncFailure("limpeza_rdo_indisponivel", true);
      return {};
    }

    const source = originSchema.parse(
      await service.rpc("ca_inspecao_rdo_origem", { p_pastas: [job.folderId] }, signal),
    );
    const [origin] = source.folders;
    if (!origin || origin.id !== job.folderId) throw new SyncFailure("pasta_rdo_divergente");
    const folder = {
      id: job.folderId,
      resourceKey: job.resourceKey,
      origin: { ...origin, nameMatches: (name: string) => rdoFolderCode(name) === job.code },
    };
    const drive = createDrive(serviceCredentials(source.credential), options.fetch);
    if (job.kind === "catalogo") {
      try {
        return { fotos: await drive.listPhotos(folder, signal) };
      } catch (error) {
        if (error instanceof SyncFailure && error.code === "pasta_rdo_fora_da_origem")
          return { fotos: [] };
        throw error;
      }
    }
    if (job.folderId !== job.foto.folderId) throw new SyncFailure("pasta_rdo_divergente");

    const originalPath = assetPath(job.organization, job.unit, job.foto, "original");
    const sourceImage = await drive.photoAccess(folder, signal).readOriginal(job.foto);
    const captured = {
      body: sourceImage.bytes,
      metadata: {
        mime: sourceImage.mime,
        bytes: sourceImage.bytes.length,
        sha256: await sha256Hex(sourceImage.bytes),
      },
    };
    const original = await preserve(service, originalPath, captured, signal);
    const variants: Partial<Record<"thumbnail" | "preview", RdoAsset>> = {};
    let size: ReturnType<typeof dimensions>;
    try {
      size = dimensions(captured.body, original.mime);
    } catch {
      return { variants: { original }, retry: false };
    }
    for (const variant of ["thumbnail", "preview"] as const) {
      try {
        variants[variant] = await derivative(
          service,
          originalPath,
          assetPath(job.organization, job.unit, job.foto, variant),
          size,
          variant,
          signal,
        );
      } catch {
        signal.throwIfAborted();
      }
    }
    return {
      variants: rdoAssets.parse({ original, ...variants }),
      retry: !(variants.thumbnail && variants.preview),
    };
  }

  return async (request: Request) => {
    const token = request.headers.get("X-Nexus-Job-Token") ?? "";
    if (request.method !== "POST" || !inspectionTicket.test(token))
      return workerResponse({ error: "acesso_negado" }, 403);
    const signal = AbortSignal.any([request.signal, AbortSignal.timeout(43_000)]);
    let claimed: z.infer<typeof lease> | undefined;
    try {
      const response = z
        .object({ authorized: z.boolean(), job: z.unknown() })
        .parse(await service.rpc("ca_rdo_claim", { p_token: token }, signal));
      if (!response.authorized) return workerResponse({ error: "acesso_negado" }, 403);
      if (!response.job) return workerResponse({ state: "sem_trabalho" });
      claimed = lease.parse(response.job);
      const job = jobSchema.parse(response.job);
      const result = await process(job, signal);
      const state = await service.rpc(
        "ca_rdo_finish",
        { p_id: job.id, p_lease: job.lease, p_result: result },
        signal,
      );
      return workerResponse({ state });
    } catch (error) {
      if (!claimed) return workerResponse({ error: "fila_rdo_indisponivel" }, 503);
      const failure =
        error instanceof SyncFailure
          ? error
          : new SyncFailure("processamento_rdo_indisponivel", true);
      try {
        const state = await service.rpc(
          "ca_rdo_fail",
          {
            p_id: claimed.id,
            p_lease: claimed.lease,
            p_error: failure.code,
            p_retry: failure.retryable,
          },
          AbortSignal.timeout(5000),
        );
        return workerResponse({ state });
      } catch {
        return workerResponse({ error: "fila_rdo_indisponivel" }, 503);
      }
    }
  };
}
