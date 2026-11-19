import "@tanstack/react-start/server-only";
import type { SupabaseClient } from "@supabase/supabase-js";
import { z } from "zod";
import { supabaseAdmin } from "@/integrations/supabase/client.server";
import {
  createDrive,
  driveId,
  serviceCredentials,
  SyncFailure,
} from "./inspection-sync/drive.server";
import { isRasterPhotoMime } from "./inspection-sync/photo-media.server";
import { rdoFolderCode } from "./inspection-sync/sources.server";
import {
  assetPath,
  rdoAssets,
  rdoBucket,
  rdoRef,
  rdoVariants,
  type RdoAsset,
  type RdoVariant,
} from "./inspection-sync/rdo-storage.server";
import { objects } from "./manifest";
import { rdoPageSize, type RdoPhoto } from "./rdo-photos";

const storedFolders = z.array(
  z.object({
    id: z.string().regex(driveId),
    code: z.string().regex(/^\d{2}(?:\.\d+)?$/),
    category: z.enum(["montagem", "lancada"]),
    resourceKey: z
      .string()
      .regex(/^[A-Za-z0-9_-]{1,250}$/)
      .nullish(),
  }),
);
const storedOrigin = z.object({
  credential: z.string().min(1),
  folders: z.array(
    z.object({
      id: z.string().regex(driveId),
      parentId: z.string().regex(driveId),
      rootId: z.string().regex(driveId),
    }),
  ),
});
const photoScopes = new Set(
  objects
    .filter(({ kind }) => kind === "estrutura" || kind === "componente" || kind === "lvhf")
    .map(({ id }) => id),
);
const mediaHeaders = {
  "Cache-Control": "private, no-store",
  "Referrer-Policy": "no-referrer",
  "X-Content-Type-Options": "nosniff",
  "Cross-Origin-Resource-Policy": "same-origin",
};
const unavailable = "As fotos de montagem estão temporariamente indisponíveis.";
type Selection = { organization_id: string; chave: string };
type PhotoRef = z.infer<typeof rdoRef>;
type PhotoRequest = Selection & PhotoRef & { representation: RdoVariant };
const photoRecord = rdoRef.extend({
  code: z.string().regex(/^\d{2}(?:\.\d+)?$/),
  category: z.enum(["montagem", "lancada"]),
  name: z.string().min(1).max(500),
  modifiedAt: z.string(),
  representations: z.array(z.enum(rdoVariants)).optional(),
});
const catalog = z.object({
  ready: z.boolean(),
  photos: z.array(photoRecord).max(rdoPageSize),
  total: z.number().int().nonnegative(),
  partial: z.boolean(),
});
const storedReads = z.object({
  folders: storedFolders,
  assets: z.array(rdoRef.extend({ unit: z.string().uuid(), variants: rdoAssets })).max(rdoPageSize),
});
const titleOrder = new Intl.Collator("pt-BR", { numeric: true });

function unavailableCatalog(code: string) {
  return code === "PGRST202" || code === "42883";
}

function outsideOrigin(error: unknown) {
  return (
    error instanceof SyncFailure &&
    ["pasta_rdo_fora_da_origem", "pasta_drive_divergente", "pasta_drive_sem_acesso"].includes(
      error.code,
    )
  );
}

async function authorizedFolders(client: SupabaseClient, input: Selection, signal: AbortSignal) {
  if (!photoScopes.has(input.chave)) return [];
  const result = await client
    .rpc("ca_inspecao_rdo_summary", { p_org: input.organization_id, p_chave: input.chave })
    .abortSignal(signal);
  if (result.error?.code === "42501") return [];
  if (result.error) throw new Error(unavailable);
  const parsed = storedFolders.safeParse(result.data);
  if (!parsed.success) throw new Error(unavailable);
  return parsed.data;
}

async function driveForFolders(folders: z.infer<typeof storedFolders>, signal: AbortSignal) {
  const result = await (supabaseAdmin as SupabaseClient)
    .rpc("ca_inspecao_rdo_origem", { p_pastas: folders.map(({ id }) => id) })
    .abortSignal(signal);
  if (result.error) throw new Error(unavailable);
  const origin = storedOrigin.safeParse(result.data);
  if (!origin.success) throw new Error(unavailable);
  const byId = new Map(origin.data.folders.map((item) => [item.id, item]));
  return {
    drive: createDrive(serviceCredentials(origin.data.credential)),
    folders: folders.map(({ id, code, category, resourceKey }) => {
      const expected = byId.get(id);
      if (!expected) throw new Error(unavailable);
      return {
        code,
        category,
        folder: {
          id,
          resourceKey: resourceKey ?? null,
          origin: {
            parentId: expected.parentId,
            rootId: expected.rootId,
            nameMatches: (name: string) => rdoFolderCode(name) === code,
          },
        },
      };
    }),
  };
}

export async function listRdoPhotos(
  client: SupabaseClient,
  input: Selection & { page: number },
  request: AbortSignal,
) {
  const signal = AbortSignal.any([request, AbortSignal.timeout(15_000)]);
  try {
    if (!photoScopes.has(input.chave)) return { photos: [], partial: false, total: 0 };
    const snapshot = await client
      .rpc("ca_rdo_listar", {
        p_org: input.organization_id,
        p_chave: input.chave,
        p_pagina: input.page,
      })
      .abortSignal(signal);
    if (snapshot.error?.code === "42501") return { photos: [], partial: false, total: 0 };
    if (snapshot.error && !unavailableCatalog(snapshot.error.code)) throw new Error(unavailable);
    if (!snapshot.error) {
      const result = catalog.parse(snapshot.data);
      if (result.ready)
        return { photos: result.photos, total: result.total, partial: result.partial };
    }

    const authorized = await authorizedFolders(client, input, signal);
    if (!authorized.length) return { photos: [], partial: false, total: 0 };
    const { drive, folders } = await driveForFolders(authorized, signal);
    const photos: RdoPhoto[] = [];
    let failures = 0;
    // A structure can include several TAGs. Bound Drive concurrency for each panel refresh.
    for (let offset = 0; offset < folders.length; offset += 4) {
      signal.throwIfAborted();
      const entries = await Promise.allSettled(
        folders.slice(offset, offset + 4).map(async ({ folder, code, category }) => {
          const refs = await drive.listPhotos(folder, signal);
          return refs.map((ref) => ({ ...ref, folderId: folder.id, code, category }));
        }),
      );
      for (const entry of entries) {
        if (entry.status === "fulfilled") photos.push(...entry.value);
        else if (!outsideOrigin(entry.reason)) failures += 1;
      }
    }
    if (failures === folders.length) throw new Error(unavailable);
    photos.sort(
      (a, b) =>
        titleOrder.compare(a.code, b.code) ||
        b.category.localeCompare(a.category) ||
        b.modifiedAt.localeCompare(a.modifiedAt) ||
        titleOrder.compare(a.name, b.name) ||
        a.folderId.localeCompare(b.folderId) ||
        a.id.localeCompare(b.id),
    );
    const offset = input.page * rdoPageSize;
    return {
      photos: photos.slice(offset, offset + rdoPageSize),
      total: photos.length,
      partial: failures > 0,
    };
  } catch {
    throw new Error(unavailable);
  }
}

function failedPhoto(status: number) {
  return new Response(null, { status, headers: mediaHeaders });
}

function sameRef(left: PhotoRef, right: PhotoRef) {
  return (
    left.id === right.id &&
    left.folderId === right.folderId &&
    left.version === right.version &&
    left.path.length === right.path.length &&
    left.path.every((part, index) => part === right.path[index])
  );
}

async function openReplica(path: string, asset: RdoAsset, transfer: AbortSignal) {
  const open = new AbortController();
  const timeout = setTimeout(() => open.abort(), 8_000);
  const result = await supabaseAdmin.storage
    .from(rdoBucket)
    .download(path, {}, { signal: AbortSignal.any([transfer, open.signal]), cache: "no-store" })
    .asStream()
    .finally(() => clearTimeout(timeout));
  if (result.error || !result.data) return undefined;
  let bytes = 0;
  // The source authorization deadline ends at the transfer boundary, not during a slow read.
  const body = result.data.pipeThrough(
    new TransformStream<Uint8Array, Uint8Array>({
      transform(chunk, controller) {
        bytes += chunk.byteLength;
        if (bytes > asset.bytes) throw new Error(unavailable);
        controller.enqueue(chunk);
      },
      flush() {
        if (bytes !== asset.bytes) throw new Error(unavailable);
      },
    }),
  );
  return new Response(body, {
    headers: { "Content-Type": asset.mime, "Content-Length": String(asset.bytes) },
  });
}

async function prepareReads(
  client: SupabaseClient,
  input: Selection,
  refs: PhotoRef[],
  signal: AbortSignal,
  transfer = signal,
) {
  if (!photoScopes.has(input.chave)) return null;
  const candidate = await client
    .rpc("ca_rdo_material", {
      p_org: input.organization_id,
      p_chave: input.chave,
      p_fotos: refs,
    })
    .abortSignal(signal);
  if (candidate.error?.code === "42501") return null;
  if (candidate.error && !unavailableCatalog(candidate.error.code)) throw new Error(unavailable);
  const ready = candidate.error ? undefined : storedReads.parse(candidate.data);
  const folders = (ready?.folders ?? (await authorizedFolders(client, input, signal))).filter(
    ({ id }) => refs.some(({ folderId }) => folderId === id),
  );
  if (!folders.length) return null;
  const { drive, folders: configured } = await driveForFolders(folders, signal);
  const access = new Map(
    configured.map(({ folder }) => [folder.id, drive.photoAccess(folder, signal)]),
  );

  return async (ref: PhotoRef, variant: RdoVariant) => {
    const source = access.get(ref.folderId);
    if (!source) return failedPhoto(404);
    const record = ready?.assets.find((asset) => sameRef(asset, ref));
    const asset = record?.variants[variant];
    const original = record?.variants.original;
    let media: Response | undefined;
    if (record && asset && original) {
      const live = await source.verifyCatalogRef(record);
      if (
        live.mimeType !== original.mime ||
        live.size !== original.bytes ||
        (live.sha256 && live.sha256 !== original.sha256)
      )
        return failedPhoto(409);
      if (live.canDownload) {
        const path = assetPath(input.organization_id, record.unit, ref, variant);
        signal.throwIfAborted();
        media = await openReplica(path, asset, transfer);
      }
    }
    media ??= await source.read(ref, variant !== "original");
    const type = media.headers.get("Content-Type");
    if (!media.ok || !media.body || !isRasterPhotoMime(type)) {
      await media.body?.cancel();
      return failedPhoto(503);
    }
    const length = media.headers.get("Content-Length");
    return new Response(media.body, {
      headers: {
        ...mediaHeaders,
        "Content-Type": type,
        ...(length ? { "Content-Length": length } : {}),
      },
    });
  };
}

function photoFailure(error: unknown) {
  if (outsideOrigin(error)) return failedPhoto(404);
  if (error instanceof SyncFailure) {
    if (error.code === "versao_foto_rdo_alterada") return failedPhoto(409);
    if (error.code === "foto_rdo_indisponivel") return failedPhoto(404);
  }
  return failedPhoto(503);
}

export async function readRdoPhoto(
  client: SupabaseClient,
  input: PhotoRequest,
  request: AbortSignal,
) {
  const signal = AbortSignal.any([request, AbortSignal.timeout(20_000)]);
  try {
    const ref = rdoRef.parse(input);
    const read = await prepareReads(client, input, [ref], signal, request);
    return read ? await read(ref, input.representation) : failedPhoto(404);
  } catch (error) {
    return photoFailure(error);
  }
}

export async function readRdoThumbnails(
  client: SupabaseClient,
  input: Selection & { photos: PhotoRef[] },
  request: AbortSignal,
) {
  const signal = AbortSignal.any([request, AbortSignal.timeout(20_000)]);
  try {
    const read = await prepareReads(client, input, input.photos, signal);
    if (!read) return failedPhoto(404);
    const result = await Promise.allSettled(
      input.photos.map(async (ref) => {
        const response = await read(ref, "thumbnail");
        return response.ok ? response.blob() : null;
      }),
    );
    signal.throwIfAborted();
    const body = new FormData();
    result.forEach((entry, index) => {
      if (entry.status === "fulfilled" && entry.value) body.append(String(index), entry.value);
    });
    return new Response(body, { headers: mediaHeaders });
  } catch (error) {
    return photoFailure(error);
  }
}
