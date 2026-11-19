import { layoutDescriptions } from "./layout-descriptions";
import type { CaInspectionLine } from "./inspection-domain";
import type { CruzObject } from "./scene-types";

const lvhfPrefix = /^LVHF\s+\d+(?:\.\d+)?\s*[·–—-]\s*/i;

export function inspectionLabel(
  code: string,
  fallbackDescription: string,
  seal?: string,
  currentDescription?: string,
) {
  const description = (
    currentDescription ??
    layoutDescriptions[code] ??
    fallbackDescription.replace(lvhfPrefix, "")
  )
    .trim()
    .toLocaleUpperCase("pt-BR");
  const value = seal?.trim();
  return [code, description, ...(value ? ["LAC " + value] : [])].filter(Boolean).join(" · ");
}

export function technicalTag(object: CruzObject) {
  return object.kind === "lvhf"
    ? object.code
    : object.kind === "componente"
      ? /^cobertura-(\d+(?:\.\d+)?)$/.exec(object.id)?.[1]
      : undefined;
}

export function technicalTitle(
  object: CruzObject,
  line?: Pick<CaInspectionLine, "description" | "seal">,
) {
  const tag = technicalTag(object);
  return tag
    ? inspectionLabel(
        tag,
        object.name,
        object.kind === "lvhf" ? line?.seal?.value : undefined,
        line?.description,
      )
    : object.name;
}

export function inspectionCatalog(lines: CaInspectionLine[] = []) {
  return new Map(lines.map((line) => [line.key, line]));
}

export function objectInspection(
  object: CruzObject,
  catalog: ReadonlyMap<string, CaInspectionLine>,
) {
  const tag = technicalTag(object);
  return tag ? catalog.get("lvhf-" + tag) : undefined;
}

export function hasInspectionEvidence(line: CaInspectionLine) {
  return (
    line.documents.length > 0 ||
    Object.keys(line.fields).length > 0 ||
    !!line.restriction ||
    line.seal?.source === "document"
  );
}
