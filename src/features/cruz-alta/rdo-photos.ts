export const rdoPageSize = 6;
export type RdoRepresentation = "thumbnail" | "preview" | "original";

export type RdoPhoto = {
  id: string;
  folderId: string;
  code: string;
  category: "montagem" | "lancada";
  name: string;
  version: string;
  modifiedAt: string;
  path: string[];
  representations?: RdoRepresentation[] | undefined;
};

export type RdoPhotoPage = { photos: RdoPhoto[]; total: number; partial: boolean };
