import "@tanstack/react-start/server-only";
import { z } from "zod";
import { driveId, MAX_DRIVE_PHOTO_BYTES, sha256Pattern } from "./drive.server";
import { RASTER_PHOTO_MIMES } from "./photo-media.server";

export const rdoBucket = "nexus-cruz-alta-rdo";
export const rdoVariants = ["thumbnail", "preview", "original"] as const;
export const rdoVariant = z.enum(rdoVariants);
export type RdoVariant = z.infer<typeof rdoVariant>;
export const rdoDerivativeLimits = { thumbnail: 384, preview: 1280 } as const;
export const rdoDerivativeBytes = { thumbnail: 512 * 1024, preview: 2 * 1024 * 1024 } as const;

export const rdoRef = z.object({
  folderId: z.string().regex(driveId),
  id: z.string().regex(driveId),
  version: z.string().regex(/^\d{1,24}$/),
  path: z.array(z.string().regex(driveId)).max(4),
});

export const rdoAsset = z.object({
  mime: z.enum(RASTER_PHOTO_MIMES),
  bytes: z.number().int().positive().max(MAX_DRIVE_PHOTO_BYTES),
  sha256: z.string().regex(sha256Pattern),
});
export type RdoAsset = z.infer<typeof rdoAsset>;

export const rdoAssets = z.object({
  thumbnail: rdoAsset
    .extend({
      mime: z.literal("image/webp"),
      bytes: z.number().int().positive().max(rdoDerivativeBytes.thumbnail),
    })
    .optional(),
  preview: rdoAsset
    .extend({
      mime: z.literal("image/webp"),
      bytes: z.number().int().positive().max(rdoDerivativeBytes.preview),
    })
    .optional(),
  original: rdoAsset.optional(),
});

export function assetPath(
  organization: string,
  unit: string,
  ref: Pick<z.infer<typeof rdoRef>, "folderId" | "id" | "version">,
  variant: RdoVariant,
) {
  const filename = variant === "original" ? variant : `${variant}.webp`;
  return `${organization}/${unit}/${ref.folderId}/${ref.id}/${ref.version}/${filename}`;
}
