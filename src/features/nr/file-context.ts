type RecordValue = Record<string, unknown>;
const object = (value: unknown): RecordValue =>
  value && typeof value === "object" && !Array.isArray(value) ? (value as RecordValue) : {};
const text = (value: unknown) => (typeof value === "string" ? value : "");
export type NrFileContextScope = {
  documentoId?: string | undefined;
  revisaoId?: string | undefined;
  localId?: string | undefined;
  pastaId?: string | undefined;
};
export type NrFileContextSummary = {
  documentTitle: string;
  revisionId: string;
  revisionNumber: number | null;
  caption: string;
  date: string;
  author: string;
  category: string;
  primary: boolean;
};
/** Metadata belongs to the selected relation, not to an unrelated use of a shared binary. */
export function nrFileContextSummaries(
  file: RecordValue,
  scope: NrFileContextScope,
): NrFileContextSummary[] {
  const matches = (candidate: RecordValue) =>
    [
      ["documento_id", scope.documentoId],
      ["revisao_id", scope.revisaoId],
      ["local_id", scope.localId],
      ["pasta_id", scope.pastaId],
    ].every(([key, id]) => !id || candidate[key!] === id);
  const links = Array.isArray(file["contextos"])
    ? file["contextos"].map(object).filter(matches)
    : [];
  const candidates = links.map((link) => ({
    relation: link,
    metadata: object(link["evidencia"]),
    primary: false,
  }));
  // Include primary metadata only when that primary association matches every selected ID.
  if (matches(file))
    candidates.unshift({
      relation: file,
      metadata: object(file["origem_metadata"]),
      primary: true,
    });
  return candidates.map(({ relation, metadata, primary }) => ({
    documentTitle: text(relation["documento_titulo"]),
    revisionId: text(relation["revisao_id"]),
    revisionNumber:
      typeof relation["revisao_numero"] === "number" ? relation["revisao_numero"] : null,
    caption: text(metadata["legenda"]),
    date: text(metadata["data_origem"]) || text(metadata["data"]),
    author: text(metadata["autor_historico"]) || text(metadata["autor"]),
    category: text(metadata["categoria"]) || text(metadata["grupo"]),
    primary,
  }));
}
