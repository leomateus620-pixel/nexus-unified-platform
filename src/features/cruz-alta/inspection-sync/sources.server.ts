import "@tanstack/react-start/server-only";
import { surveyItems } from "../linhas";
import { DRIVE_FOLDER, type DriveItem } from "./drive.server";

export const inspectionFolders = {
  layout: "1wexshbdZctbJ5zoLcwmIUh4-xx9kYxf4",
  montada: "1FjvgNs3u0e4cYqgvGTiEhE6l5u-8ha5K",
  laudo: "1Dh_gK_YehJ7-1nEj9RRCGuH0IZwR7bte",
} as const;
export type FolderKind = keyof typeof inspectionFolders | "rdo";
export type SourceKind = Exclude<FolderKind, "rdo"> | "placa";
export type ScanItem = DriveItem & {
  kind: SourceKind;
  code: string | null;
  revision: number | null;
};

const codes = new Set([...surveyItems.map((item) => item.code), "29.2"]);
export function knownLvhf(code: string) {
  return codes.has(code);
}

const driveDashes = /[\u2010-\u2015\u2212]/g;

const normalize = (name: string) =>
  name
    .normalize("NFD")
    .replace(/\p{Diacritic}/gu, "")
    .replace(driveDashes, "-")
    .toUpperCase()
    .trim();
const segments = (name: string) =>
  normalize(name)
    .replace(/\.PDF$/i, "")
    .split(/\s+-\s+/);

function numericCode(value: string) {
  const match = /^(\d{1,2})(?:[.,](\d{1,2}))?$/.exec(value.trim());
  if (!match) return null;
  const whole = Number(match[1]).toString().padStart(2, "0");
  return match[2] ? `${whole}.${Number(match[2])}` : whole;
}

function firstCode(name: string) {
  return numericCode(segments(name)[0] ?? "");
}

export function rdoFolderCode(name: string) {
  const code = numericCode(
    name
      .replace(driveDashes, "-")
      .trim()
      .split(/\s+-\s+/)[0] ?? "",
  );
  return code && code !== "29.2" && knownLvhf(code) ? code : null;
}

export function classifyInspectionFiles(
  kind: Exclude<FolderKind, "rdo">,
  items: DriveItem[],
  ancestorNames: string[],
) {
  const results: ScanItem[] = [];
  for (const item of items) {
    const parts = segments(item.name);
    if (item.mimeType === DRIVE_FOLDER) {
      if (
        kind === "laudo" &&
        ancestorNames.length < 4 &&
        (ancestorNames.length || firstCode(item.name))
      ) {
        results.push({ ...item, kind, code: null, revision: null });
      }
      continue;
    }
    if (kind === "layout") {
      if (
        !parts.some((part) => /^LAYOUT GERAL\b/.test(part)) ||
        !/\bCRUZ\s+ALTA\b/.test(normalize(item.name))
      )
        continue;
      results.push({ ...item, kind, code: null, revision: revisionIn(parts) });
      continue;
    }
    if (kind === "montada") {
      const code = firstCode(item.name);
      if (!code) continue;
      results.push({
        ...item,
        kind,
        code: knownLvhf(code) ? code : null,
        revision: revisionIn(parts),
      });
      continue;
    }
    const category = parts.some((part) => /^PLACA DE IDENTIFICACAO\b/.test(part))
      ? "placa"
      : parts.some((part) => /^LAUDO\b/.test(part))
        ? "laudo"
        : null;
    if (!category) continue;
    const candidates = new Set(
      parts.map(numericCode).filter((code): code is string => code !== null),
    );
    const parent = ancestorNames[0] ? firstCode(ancestorNames[0]) : null;
    if (parent) candidates.add(parent);
    const [candidate] = candidates;
    const code = candidates.size === 1 && candidate && knownLvhf(candidate) ? candidate : null;
    results.push({ ...item, kind: category, code, revision: revisionIn(parts) });
  }
  return results;
}

function revisionIn(parts: string[]) {
  const revisions = parts.flatMap((part) => {
    const result = /^REV(?:ISAO)?\s*\.?\s*(\d{1,3})$/.exec(part.trim());
    return result?.[1] === undefined ? [] : [Number(result[1])];
  });
  return revisions.length === 1 ? revisions[0]! : null;
}
