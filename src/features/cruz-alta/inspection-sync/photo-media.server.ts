import "@tanstack/react-start/server-only";

export const RASTER_PHOTO_MIMES = ["image/jpeg", "image/png", "image/webp", "image/gif"] as const;
export type RasterPhotoMime = (typeof RASTER_PHOTO_MIMES)[number];

export function isRasterPhotoMime(value: unknown): value is RasterPhotoMime {
  return RASTER_PHOTO_MIMES.some((mime) => mime === value);
}

export function rasterPhotoSignature(bytes: Uint8Array, mime: RasterPhotoMime) {
  const utf8 = new TextDecoder();
  if (mime === "image/jpeg") return bytes[0] === 255 && bytes[1] === 216 && bytes[2] === 255;
  if (mime === "image/png")
    return [137, 80, 78, 71, 13, 10, 26, 10].every((value, index) => bytes[index] === value);
  if (mime === "image/gif") return /^(GIF87a|GIF89a)$/.test(utf8.decode(bytes.subarray(0, 6)));
  return (
    utf8.decode(bytes.subarray(0, 4)) === "RIFF" && utf8.decode(bytes.subarray(8, 12)) === "WEBP"
  );
}

export function safeDriveThumbnail(link: unknown, fileId: string) {
  if (typeof link !== "string" || !/^https:\/\//.test(link) || link.length > 4096) return null;
  let url: URL;
  try {
    url = new URL(link);
  } catch {
    return null;
  }
  if (url.port || url.username || url.password || url.hash || url.protocol !== "https:")
    return null;
  if (url.hostname === "drive.google.com") {
    return url.pathname === "/thumbnail" &&
      url.searchParams.getAll("id").length === 1 &&
      url.searchParams.get("id") === fileId
      ? url
      : null;
  }
  return /^lh[3-6]\.googleusercontent\.com$/.test(url.hostname) &&
    /^\/(?:drive-storage|d)\/[A-Za-z0-9_-][A-Za-z0-9_./=-]*$/.test(url.pathname)
    ? url
    : null;
}
