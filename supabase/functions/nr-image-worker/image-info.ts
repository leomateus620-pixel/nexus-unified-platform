import { imageSize } from "image-size";

export type ImageInfo = {
  width: number;
  height: number;
  mime: string;
  orientation?: number;
};

/** Header preflight; the private Storage transformation subsequently decodes the image. */
export function imageInfo(bytes: Uint8Array): ImageInfo {
  const info = imageSize(bytes);
  const types: Record<string, string> = {
    jpg: "image/jpeg",
    png: "image/png",
    webp: "image/webp",
    gif: "image/gif",
    bmp: "image/bmp",
    ico: "image/x-icon",
    tiff: "image/tiff",
    avif: "image/avif",
    heif: "image/heic",
  };
  let mime = types[info.type ?? ""];
  if (info.type === "heif") {
    const brands = new TextDecoder().decode(bytes.subarray(8, 40));
    mime = /avif|avis/.test(brands) ? "image/avif" : "image/heic";
  }
  if (!mime || !info.width || !info.height) throw Error("unsupported_image");
  return { width: info.width, height: info.height, mime, orientation: info.orientation };
}
