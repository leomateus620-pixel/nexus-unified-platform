export type RdoPhoto = {
  id: string;
  folderId: string;
  code: string;
  category: "montagem" | "lancada";
  name: string;
  version: string;
  modifiedAt: string;
  path: string[];
};
