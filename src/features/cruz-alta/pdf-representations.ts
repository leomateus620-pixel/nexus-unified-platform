export const CRUZ_PDF_CHUNK_BYTES = 256 * 1024;
export const CRUZ_PDF_MAX_BYTES = 50 * 1024 * 1024;
export const CRUZ_PDF_MAX_PAGE_BYTES = 2 * 1024 * 1024;

export type CruzPdfPage = {
  url: string;
  size: number;
  sha256: string;
  page: number;
  pageCount: number;
};

export type CruzPdfRepresentations = {
  chunks: string[];
  page?: CruzPdfPage | undefined;
};
