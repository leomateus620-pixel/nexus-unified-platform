export const inspectionFields = ["installation", "rt", "inspection", "due"] as const;

export type InspectionField = (typeof inspectionFields)[number];
export const inspectionAdoptFields = [...inspectionFields, "seal"] as const;
export type InspectionAdoptField = (typeof inspectionAdoptFields)[number];
export type InspectionKind = "laudo" | "placa";
export type InspectionDateEvidence = { value: string; page: number; label: string };

export type ParsedInspectionPdf = {
  fields: Partial<Record<InspectionField, InspectionDateEvidence>>;
  restriction: { text: string; page: number } | null;
  issues: string[];
  pages: number;
  identityMismatch?: true;
  seal?: InspectionDateEvidence;
};

export type CaInspectionEvidence = {
  id: string;
  page: number;
  revision: number;
  kind: InspectionKind;
  title: string;
  state: "pending" | "approved" | "dismissed" | "historical";
};

export type CaInspectionLine = {
  key: string;
  status: "verified" | "review" | "stale";
  description?: string;
  seal?:
    | { source: "layout"; value: string; page: number; revision: number }
    | (CaInspectionEvidence & { source: "document"; value: string });
  version: number;
  fields: Partial<Record<InspectionField, CaInspectionEvidence & InspectionDateEvidence>>;
  restriction: (CaInspectionEvidence & { text: string }) | null;
  review?: {
    id: string;
    reasons: string[];
    restriction: string | null;
    fields?: InspectionAdoptField[];
  };
  reviews?: Array<NonNullable<CaInspectionLine["review"]>>;
  documents: CaInspectionEvidence[];
};

export type InspectionRdoFolder = {
  id: string;
  code: string;
  name: string;
  category: "montagem" | "lancada";
  resourceKey?: string | undefined;
};

export type CaInspectionSummary = {
  lastSync: string | null;
  status: "not_configured" | "idle" | "running" | "failed";
  canReview: boolean;
  lines: CaInspectionLine[];
  rdoFolders?: InspectionRdoFolder[];
  unmatched?: Array<{ id: string; title: string; issues: string[] }>;
};

const inspectionDayFormat = new Intl.DateTimeFormat("en-CA", {
  timeZone: "America/Sao_Paulo",
  year: "numeric",
  month: "2-digit",
  day: "2-digit",
});

export function inspectDueStatus(
  value: string | null,
  today = inspectionDayFormat.format(new Date()),
) {
  if (!value) return "unknown";
  const days = (Date.parse(value) - Date.parse(today)) / 86_400_000;
  if (!Number.isFinite(days)) return "unknown";
  if (days < 0) return "overdue";
  if (days <= 30) return "soon";
  return "current";
}

export function formatInspectionDate(value: string | null | undefined) {
  if (!value) return "Data a confirmar";
  return value.split("-").reverse().join("/");
}
