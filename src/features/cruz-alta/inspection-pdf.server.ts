import "@tanstack/react-start/server-only";
import { getResolvedPDFJS } from "unpdf";
import type { InspectionField, InspectionKind, ParsedInspectionPdf } from "./inspection-domain";

type PdfSource = { kind: InspectionKind; code: string; revision: number };
const maxPages = 120;
const maxTextLength = 1_000_000;
const dateToken = String.raw`(\d{1,2}[/.-]\d{1,2}[/.-]\d{4})(?!\d)`;

function normalized(text: string) {
  return text
    .normalize("NFD")
    .replace(/\p{Mark}/gu, "")
    .toLowerCase();
}

function isoDate(date: string) {
  const [day, month, year] = date.split(/[/.-]/);
  if (!day || !month || !year || +year < 1900) return null;
  const iso = `${year}-${month.padStart(2, "0")}-${day.padStart(2, "0")}`;
  const time = Date.parse(iso);
  return Number.isFinite(time) && new Date(time).toISOString().startsWith(iso) ? iso : null;
}

type DateRule = { field: InspectionField; label: string; prefix: string; rank?: number };
const dateRules: DateRule[] = [
  {
    field: "installation",
    label: "Data da montagem",
    prefix: String.raw`\b(?:data\s+d[ae]\s+(?:montagem|instalacao)|(?:montagem|instalacao)\s+concluida\s+em|(?:montad[ao]|instalad[ao])\s+em)`,
  },
  {
    field: "rt",
    label: "Data da RT/ART",
    prefix: String.raw`\b(?:data\s+d[ae]\s+(?:\b(?:art|rt)\b)|(?:\b(?:art|rt)\b)(?:\s*(?:n[.º°o]*\s*)?\d{6,})?\s*(?:crea[-/ ]\w{2})?\s*[·:–—-]?\s*(?:registrad[ao]\s+em|emitid[ao]\s+em|assinad[ao]\s+em))`,
  },
  {
    field: "inspection",
    label: "Última inspeção",
    prefix: String.raw`\b(?:ultima\s+inspecao|inspecao(?:\s+periodica)?\s+realizada\s+em|data\s+da\s+inspecao\s+periodica)`,
    rank: 2,
  },
  {
    field: "inspection",
    label: "Inspeção inicial",
    prefix: String.raw`\binspecao\s+inicial(?:\s*/\s*inspetor)?`,
    rank: 1,
  },
  {
    field: "due",
    label: "Próxima inspeção",
    prefix: String.raw`\bproxima\s+inspecao(?:\s+(?:periodica|em))?`,
  },
];

const datePatterns = dateRules.map((rule) => ({
  ...rule,
  pattern: new RegExp(`${rule.prefix}\\s*[·:–—-]?\\s*${dateToken}`, "g"),
}));

function extractedRestriction(pages: string[], kind: InspectionKind) {
  for (const [index, page] of pages.entries()) {
    const pattern =
      kind === "placa"
        ? /(?:^|\n)[ \t]*(?:limites de uso|restri[cç][oõ]es de uso)[ \t]*(?:[:–—-][ \t]*|\n[ \t]*)?([^\n·]{4,280})(?:\n|·|$)/i
        : /(?:^|\n)[ \t]*regime[ \t]{2,}([^\n·]{4,280})(?:\n|·|$)/i;
    const text = page.match(pattern)?.[1]?.replace(/\s+/g, " ").trim();
    if (text && !/^\d/.test(text)) return { text, page: index + 1 };
  }
  for (const [index, page] of pages.entries()) {
    const text = page
      .match(
        /(?:^|\n)[ \t]*(?:restri[cç][oõ]es de uso|condi[cç][oõ]es de uso)[ \t]*:[ \t]*(.{4,400}?\.)(?=\s|$)/is,
      )?.[1]
      ?.replace(/\s+/g, " ")
      .trim();
    if (text) return { text, page: index + 1 };
  }
  return null;
}

function identifiersOnCover(page: string) {
  const identifiers = new Set<string>();
  for (const pattern of [
    /^[ \t]*(\d{1,3}(?:[.,]\d+)?)\s*[-–]\s*[^\n]+?\s*[-–]\s*lvhf\b/gim,
    /(?:^|\n)[ \t]*lvhf-(?:[a-z]+-)+(\d{1,3}(?:[.,]\d+)?)(?![\d.,])/gi,
    /^[ \t]*lvhf\s+(\d{1,3}(?:[.,]\d+)?)\s*[-–]\s*[^\n]+/gim,
  ]) {
    for (const match of page.matchAll(pattern)) {
      const parts = match[1]?.split(/[.,]/);
      if (parts?.[0])
        identifiers.add([String(Number(parts[0])).padStart(2, "0"), ...parts.slice(1)].join("."));
    }
  }
  return identifiers;
}

export function parseInspectionPages(pages: string[], source: PdfSource): ParsedInspectionPdf {
  const result: ParsedInspectionPdf = {
    fields: {},
    restriction: null,
    issues: [],
    pages: pages.length,
  };
  if (pages.every((page) => !page.trim())) {
    result.issues.push(
      "O PDF não contém texto pesquisável. Confira as datas e o aviso no original.",
    );
    return result;
  }
  const readable = pages.map(normalized);
  const cover = readable[0] ?? "";
  const identifiers = identifiersOnCover(cover);
  if (identifiers.size > 0 && (identifiers.size !== 1 || !identifiers.has(source.code))) {
    result.issues.push(
      "O código na capa diverge da identificação da pasta. Confira o vínculo no original.",
    );
    result.identityMismatch = true;
    return result;
  }
  const revisionPattern =
    source.kind === "placa"
      ? /\bplaca rev(?:isao)?\.?\s*(\d{1,3})\b/g
      : /\blaudo(?: tecnico)? rev(?:isao)?\.?\s*(\d{1,3})\b/g;
  if ([...cover.matchAll(revisionPattern)].some((match) => Number(match[1]) !== source.revision)) {
    result.issues.push("A revisão na capa diverge da revisão identificada no arquivo.");
    return result;
  }

  for (const field of ["installation", "rt", "inspection", "due"] as const) {
    let chosenRank = 0;
    const dates = new Map<string, { value: string; page: number; label: string }>();
    let invalid = false;
    const patterns = datePatterns.filter((rule) => rule.field === field);
    for (const [index, text] of readable.entries()) {
      for (const rule of patterns) {
        const rank = rule.rank ?? 1;
        if (rank < chosenRank) continue;
        for (const match of text.matchAll(rule.pattern)) {
          if (rank > chosenRank) {
            chosenRank = rank;
            dates.clear();
            invalid = false;
          }
          const value = match[1] ? isoDate(match[1]) : null;
          if (value === null) invalid = true;
          else if (!dates.has(value))
            dates.set(value, { value, page: index + 1, label: rule.label });
        }
      }
    }
    const evidence = dates.values().next().value;
    if (invalid || dates.size > 1) {
      result.issues.push(
        `${patterns[0]?.label ?? field}: data inválida ou divergente no documento.`,
      );
    } else if (evidence) result.fields[field] = evidence;
  }
  if (
    result.fields.due &&
    result.fields.inspection &&
    result.fields.due.value <= result.fields.inspection.value
  ) {
    delete result.fields.due;
    result.issues.push("A próxima inspeção antecede a inspeção registrada ou tem a mesma data.");
  }
  result.restriction = extractedRestriction(pages, source.kind);
  return result;
}

export async function parseCruzAltaInspectionPdf(bytes: Uint8Array, source: PdfSource) {
  if (bytes.byteLength > 24 * 1024 * 1024)
    throw new Error("PDF acima do limite de extração automática.");
  const { getDocument } = await getResolvedPDFJS();
  const task = getDocument({
    data: bytes.slice(),
    disableFontFace: true,
    useSystemFonts: false,
    useWasm: false,
    isOffscreenCanvasSupported: false,
    isImageDecoderSupported: false,
    stopAtErrors: true,
  });
  try {
    const pdf = await task.promise;
    if (pdf.numPages > maxPages)
      throw new Error("PDF acima do limite de páginas da extração automática.");
    const pages: string[] = [];
    let length = 0;
    for (let number = 1; number <= pdf.numPages; number++) {
      const page = await pdf.getPage(number);
      try {
        const content = await page.getTextContent();
        const text = content.items
          .map((item) => ("str" in item ? item.str + (item.hasEOL ? "\n" : " ") : ""))
          .join("");
        length += text.length;
        if (length > maxTextLength)
          throw new Error("PDF acima do limite de texto da extração automática.");
        pages.push(text);
      } finally {
        page.cleanup();
      }
    }
    return parseInspectionPages(pages, source);
  } finally {
    await task.destroy();
  }
}
