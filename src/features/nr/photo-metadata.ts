const uuid = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;
export const PHOTO_EDIT_KEY = "edicao_foto_nexus";
type PhotoEdit = {
  schema_version: 1;
  ocorrencia_id: string;
  ordem_origem: number;
  ordem: number;
  legenda?: string;
  categoria?: string;
};
const object = (value: unknown): Record<string, unknown> =>
  value !== null && typeof value === "object" && !Array.isArray(value)
    ? (value as Record<string, unknown>)
    : {};
export const photoEntries = (value: unknown) =>
  Array.isArray(value)
    ? value.map((entry, index) => [String(index), entry] as const)
    : Object.entries(object(value));

/** Explicit current metadata never replaces the preserved source aliases. */
export function readPhotoEdit(value: unknown): PhotoEdit | null {
  const edit = object(object(value)[PHOTO_EDIT_KEY]);
  return edit["schema_version"] === 1 &&
    typeof edit["ocorrencia_id"] === "string" &&
    uuid.test(edit["ocorrencia_id"]) &&
    Number.isSafeInteger(edit["ordem_origem"]) &&
    Number(edit["ordem_origem"]) >= 0 &&
    Number.isSafeInteger(edit["ordem"]) &&
    Number(edit["ordem"]) >= 0
    ? (edit as PhotoEdit)
    : null;
}

/** Storage order is preserved. Only an explicit presentation order changes. */
export function editPhotoMetadata(
  value: unknown,
  key: string,
  change: { legenda?: string; categoria?: string } | { move: -1 | 1 },
  identities: ReadonlyMap<string, string>,
): unknown {
  const entries = photoEntries(value).map(([entryKey, entry], index) => {
    const original: Record<string, unknown> =
      typeof entry === "string"
        ? { arquivo: entry }
        : entry !== null && typeof entry === "object" && !Array.isArray(entry)
          ? object(entry)
          : { valor_original: entry };
    const previous = readPhotoEdit(entry);
    const id = previous?.ocorrencia_id ?? identities.get(entryKey);
    if (!id || !uuid.test(id)) throw new Error("Identidade da ocorrência indisponível.");
    const edit: PhotoEdit = previous ?? {
      ...object(original[PHOTO_EDIT_KEY]),
      schema_version: 1,
      ocorrencia_id: id,
      ordem_origem: index,
      ordem: index,
    };
    return { key: entryKey, entry: { ...original }, edit: { ...edit } };
  });
  const target = entries.find((entry) => entry.key === key);
  if (!target) return value;
  if ("move" in change) {
    const ordered = [...entries].sort((a, b) => a.edit["ordem"] - b.edit["ordem"]);
    const from = ordered.indexOf(target),
      to = from + change.move;
    if (to < 0 || to >= ordered.length) return value;
    [ordered[from], ordered[to]] = [ordered[to]!, ordered[from]!];
    ordered.forEach((entry, index) => {
      entry.edit["ordem"] = index;
    });
  } else {
    if (change.legenda !== undefined) target.edit.legenda = change.legenda;
    if (change.categoria !== undefined) target.edit.categoria = change.categoria;
  }
  const result = entries.map(
    (entry) => [entry.key, { ...entry.entry, [PHOTO_EDIT_KEY]: entry.edit }] as const,
  );
  return Array.isArray(value) ? result.map(([, entry]) => entry) : Object.fromEntries(result);
}
