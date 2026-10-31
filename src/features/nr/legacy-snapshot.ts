import type { NrJson } from "./domain";

export const NR_LEGACY_SNAPSHOT_READER_VERSION = "nr-legacy-snapshot-reader-1";
const geometryFieldLabels: Record<string, string> = {
  altura: "Altura (m)",
  diametro: "Diâmetro (m)",
  comprimento: "Comprimento (m)",
  largura: "Largura (m)",
  profundidade: "Profundidade (m)",
};
/** Field names have a context; the classification value `altura` keeps its own label. */
export const legacySnapshotFieldLabel = (section: string, key: string): string | null =>
  section === "geometria" ? (geometryFieldLabels[key] ?? null) : null;
const object = (value: unknown): Record<string, unknown> =>
  value && typeof value === "object" && !Array.isArray(value)
    ? (value as Record<string, unknown>)
    : {};
const canonical = (value: unknown): string =>
  JSON.stringify(value, (_, child: unknown) =>
    child && !Array.isArray(child) && typeof child === "object"
      ? Object.fromEntries(Object.entries(child).sort(([a], [b]) => a.localeCompare(b)))
      : child,
  );

/** Only a cheap query gate. The signature alone never authorizes the typed projection. */
export function hasLegacySnapshotSignature(value: unknown): boolean {
  const content = object(value),
    blocks = content["blocos"];
  return (
    content["schema_version"] === 1 &&
    Array.isArray(blocks) &&
    blocks.length > 0 &&
    blocks.length <= 1000 &&
    blocks.every((entry, index) => {
      const block = object(entry);
      return (
        block["id"] === `source-${index + 1}` &&
        ["titulo", "paragrafo"].includes(String(block["tipo"]))
      );
    }) &&
    object(blocks[0])["texto"] === "Snapshot documental da origem"
  );
}

/**
 * Verifies the exact output contract of prepare-import.mjs/content(snapshot).
 * JSONB does not preserve object-key order: each sibling may occur in another order,
 * but its complete contiguous subtree, values, title level and source IDs must match.
 * Arrays remain ordered. A changed paragraph, absent field or ambiguous match rejects.
 */
export function proveLegacySnapshotContent(input: {
  content: unknown;
  revisionContent: unknown;
  snapshot: unknown;
  expectedRevisionId: string;
  actualRevisionId: unknown;
  converted?: boolean;
}): { version: string; snapshot: NrJson } | null {
  if (
    input.converted ||
    !input.expectedRevisionId ||
    input.actualRevisionId !== input.expectedRevisionId ||
    input.snapshot == null ||
    !hasLegacySnapshotSignature(input.content) ||
    canonical(input.content) !== canonical(input.revisionContent)
  )
    return null;
  const blocks = object(input.content)["blocos"] as unknown[];
  const match = (cursor: number, tipo: string, texto: string, nivel?: number): number | null => {
    const expected = {
      id: `source-${cursor + 1}`,
      tipo,
      ...(nivel === undefined ? {} : { nivel }),
      texto,
    };
    return cursor < blocks.length && canonical(blocks[cursor]) === canonical(expected)
      ? cursor + 1
      : null;
  };
  function consume(value: unknown, label: string, depth: number, cursor: number): number | null {
    if (value == null || value === "") return cursor;
    if (depth > 8) return match(cursor, "paragrafo", canonical(value));
    if (typeof value !== "object")
      return match(cursor, "paragrafo", label ? `${label}: ${value}` : String(value));
    let next: number | null = cursor;
    if (label) {
      next = match(cursor, "titulo", label, Math.min(depth + 2, 6));
      if (next === null) return null;
    }
    if (Array.isArray(value)) {
      if (value.every((item) => typeof item !== "object"))
        return match(next, "paragrafo", value.join("\n"));
      for (const item of value) {
        next = consume(item, "", depth + 1, next);
        if (next === null) return null;
      }
      return next;
    }
    const remaining = Object.entries(value).filter(([, item]) => item != null && item !== "");
    while (remaining.length) {
      const matches = remaining.flatMap(([key, item], index) => {
        const end = consume(item, key, depth + 1, next!);
        return end === null ? [] : [{ index, end }];
      });
      if (matches.length !== 1) return null;
      next = matches[0]!.end;
      remaining.splice(matches[0]!.index, 1);
    }
    return next;
  }
  return consume(input.snapshot, "Snapshot documental da origem", 0, 0) === blocks.length
    ? { version: NR_LEGACY_SNAPSHOT_READER_VERSION, snapshot: input.snapshot as NrJson }
    : null;
}
