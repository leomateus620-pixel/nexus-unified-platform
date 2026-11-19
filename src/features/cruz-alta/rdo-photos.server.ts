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
import { objects } from "./manifest";
import type { RdoPhoto } from "./rdo-photos";

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
type PhotoRequest = Selection &
  Pick<RdoPhoto, "folderId" | "id" | "version" | "path"> & {
    preview: boolean;
  };

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
  input: Selection,
  request: AbortSignal,
) {
  const signal = AbortSignal.any([request, AbortSignal.timeout(15_000)]);
  try {
    const authorized = await authorizedFolders(client, input, signal);
    if (!authorized.length) return { photos: [] as RdoPhoto[], partial: false };
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
    return { photos, partial: failures > 0 };
  } catch {
    throw new Error(unavailable);
  }
}

function failedPhoto(status: number) {
  return new Response(null, { status, headers: mediaHeaders });
}

export async function readRdoPhoto(
  client: SupabaseClient,
  input: PhotoRequest,
  request: AbortSignal,
) {
  const signal = AbortSignal.any([request, AbortSignal.timeout(20_000)]);
  try {
    const folders = await authorizedFolders(client, input, signal);
    const folder = folders.find(({ id }) => id === input.folderId);
    if (!folder) return failedPhoto(404);
    const { drive, folders: configured } = await driveForFolders([folder], signal);
    const media = await drive.readPhoto(
      configured[0]!.folder,
      { id: input.id, version: input.version, path: input.path },
      input.preview,
      signal,
    );
    const type = media.headers.get("Content-Type");
    if (!media.ok || !media.body || !isRasterPhotoMime(type)) {
      await media.body?.cancel();
      return failedPhoto(503);
    }
    return new Response(media.body, { headers: { ...mediaHeaders, "Content-Type": type } });
  } catch (error) {
    if (outsideOrigin(error)) return failedPhoto(404);
    if (error instanceof SyncFailure) {
      if (error.code === "versao_foto_rdo_alterada") return failedPhoto(409);
      if (error.code === "foto_rdo_indisponivel") return failedPhoto(404);
    }
    return failedPhoto(503);
  }
}
