import { createServerFn } from "@tanstack/react-start";
import { setResponseHeader } from "@tanstack/react-start/server";
import type { SupabaseClient } from "@supabase/supabase-js";
import { z } from "zod";
import { nrResult } from "@/features/nr/nr.functions";
import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";
import { cruzAlta } from "./context";
import {
  inspectionAdoptFields,
  inspectionFields,
  type CaInspectionLine,
  type CaInspectionSummary,
} from "./inspection-domain";

const organization = z.object({ organization_id: z.literal(cruzAlta.org) });
const uuid = z.string().uuid();
const key = z.string().regex(/^lvhf-\d{1,3}(?:\.\d+)?$/);
const page = z.number().int().positive();
const signature = z.string().regex(/^[a-f0-9]{64}$/);
const issueList = z.array(z.string());
const sourceIssues: Record<string, string> = {
  numero_lvhf_ausente_ou_divergente:
    "O código da linha está ausente ou diverge entre a pasta e o arquivo.",
  pdf_acima_do_limite: "O PDF excede o limite da leitura automática.",
  revisao_documental_ausente_ou_divergente: "Confira o número da revisão no nome do arquivo.",
  extracao_documental_indisponivel: "Confira as datas e as condições de uso no PDF original.",
};
const explainIssue = (issue: string) => sourceIssues[issue] ?? issue;
const field = z.enum(inspectionAdoptFields);
const rawField = z.object({
  value: z.string().date(),
  page,
  label: z.string(),
  evidence: uuid.optional(),
});
const sealValue = z.string().regex(/^\d+(?: \/ \d+)*$/);
const storedSealField = rawField.extend({ value: sealValue });
const storedFields = z.object({
  installation: rawField.optional(),
  rt: rawField.optional(),
  inspection: rawField.optional(),
  due: rawField.optional(),
  seal: storedSealField.optional(),
});
const restriction = z.object({ text: z.string(), page, evidence: uuid.optional() });
const storedDocument = z.object({
  id: uuid,
  kind: z.enum(["laudo", "placa"]),
  sourceName: z.string(),
  revision: z.coerce.number().int().nonnegative(),
  state: z.enum(["pending", "approved", "dismissed", "historical"]),
  available: z.boolean(),
  pages: page.nullable().optional(),
  fields: storedFields.optional(),
  restriction: restriction.nullable().optional(),
  issues: issueList.optional(),
});
const storedLine = z.object({
  key,
  version: z.number().int().nonnegative(),
  description: z.string().nullish(),
  seal: z
    .discriminatedUnion("source", [
      z.object({
        source: z.literal("layout"),
        value: sealValue,
        page,
        revision: z.number().int().nonnegative(),
      }),
      storedSealField.extend({ source: z.literal("pdf") }),
    ])
    .nullish(),
  availability: z.enum(["stale", "review", "verified", "unconfirmed"]),
  fields: storedFields,
  restriction: restriction.nullable(),
  documents: z.array(storedDocument),
  issues: issueList,
});
const storedSummary = z.object({
  items: z.array(storedLine),
  canReview: z.boolean(),
  lastCheckedAt: z.string().nullable(),
  unmatched: z.array(z.object({ id: uuid, sourceName: z.string(), issues: issueList })).optional(),
});
const syncState = z.object({
  state: z.enum(["not_configured", "syncing", "partial", "stale", "verified"]),
  lastCheckedAt: z.string().nullable(),
});

function privateResponse() {
  setResponseHeader("Cache-Control", "private, no-store");
  setResponseHeader("Referrer-Policy", "no-referrer");
}

async function rpc(client: SupabaseClient, method: string, parameters: Record<string, unknown>) {
  return nrResult(await client.rpc(method, parameters));
}

function asLine(row: z.infer<typeof storedLine>): CaInspectionLine {
  const documents = row.documents.map((doc) => ({
    id: doc.id,
    kind: doc.kind,
    revision: doc.revision,
    state: doc.state,
    page: 1,
    title: doc.sourceName,
  }));
  const byId = new Map(documents.map((doc) => [doc.id, doc]));
  const fields: CaInspectionLine["fields"] = {};
  for (const name of inspectionFields) {
    const data = row.fields[name];
    const doc = data?.evidence && byId.get(data.evidence);
    if (doc && data) fields[name] = { ...doc, ...data };
  }
  const sealDocument =
    row.seal?.source === "pdf" && row.seal.evidence && byId.get(row.seal.evidence);
  const seal =
    row.seal?.source === "layout"
      ? row.seal
      : sealDocument && row.seal
        ? {
            ...sealDocument,
            page: row.seal.page,
            value: row.seal.value,
            source: "document" as const,
          }
        : undefined;
  const source = row.restriction?.evidence && byId.get(row.restriction.evidence);
  const reviews = row.documents
    .filter((doc) => doc.available && doc.state === "pending")
    .map((doc) => ({
      id: doc.id,
      reasons: (doc.issues?.length ? doc.issues : row.issues).map(explainIssue),
      restriction: doc.restriction?.text ?? null,
      fields: inspectionAdoptFields.filter((name) => !!doc.fields?.[name]),
    }));
  const first = reviews[0];
  return {
    key: row.key,
    ...(row.description ? { description: row.description } : {}),
    ...(seal ? { seal } : {}),
    fields,
    documents,
    version: row.version,
    status:
      row.availability === "stale"
        ? "stale"
        : row.availability === "verified"
          ? "verified"
          : "review",
    restriction: source && row.restriction ? { ...source, ...row.restriction } : null,
    ...(first ? { review: first, reviews } : {}),
  };
}

const databaseUnavailable = ["PGRST202", "42883", "42P01"];
const emptySummary: CaInspectionSummary = {
  lastSync: null,
  status: "not_configured",
  canReview: false,
  lines: [],
};

export const caInspectionSummary = createServerFn({ method: "GET" })
  .middleware([requireSupabaseAuth])
  .inputValidator(organization)
  .handler(async ({ context, data }): Promise<CaInspectionSummary> => {
    privateResponse();
    const client = context.supabase as SupabaseClient;
    const response = await client.rpc("ca_inspecao_summary", {
      p_org: data.organization_id,
      p_chave: "unidade",
    });
    if (response.error && databaseUnavailable.includes(response.error.code)) return emptySummary;
    const summary = storedSummary.parse(nrResult(response));
    const check = await client.rpc("ca_inspecao_sync_status", { p_org: data.organization_id });
    const service = check.error ? null : syncState.parse(check.data);
    const state: CaInspectionSummary["status"] =
      service?.state === "syncing"
        ? "running"
        : service?.state === "partial" || service?.state === "stale"
          ? "failed"
          : service?.state === "verified"
            ? "idle"
            : "not_configured";
    return {
      lastSync: service?.lastCheckedAt ?? summary.lastCheckedAt,
      status: state,
      canReview: summary.canReview,
      lines: summary.items
        .filter(
          (line) =>
            line.description ||
            line.seal ||
            line.documents.length > 0 ||
            line.availability === "review" ||
            line.availability === "stale",
        )
        .map((row) => {
          const line = asLine(row);
          return state === "failed" && line.status === "verified"
            ? { ...line, status: "stale" as const }
            : line;
        }),
      unmatched:
        summary.unmatched?.map((item) => ({
          id: item.id,
          title: item.sourceName,
          issues: item.issues.map(explainIssue),
        })) ?? [],
    };
  });

export const caInspectionOpen = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator(organization.extend({ key, id: uuid }))
  .handler(async ({ context, data }) => {
    privateResponse();
    const parameters = { p_org: data.organization_id, p_key: data.key, p_evidence: data.id };
    const schema = z.object({
      path: z.string(),
      sha256: signature,
      size: z.number().int().positive(),
      name: z.string(),
    });
    const load = async () =>
      schema.parse(
        await rpc(context.supabase as SupabaseClient, "ca_inspecao_preview", parameters),
      );
    const file = await load();
    if (file.path !== `${file.sha256}.pdf`)
      throw new Error("O caminho do laudo diverge da revisão conferida.");
    const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
    const signed = await supabaseAdmin.storage
      .from("nexus-cruz-alta-laudos")
      .createSignedUrl(file.path, 60);
    if (signed.error || !signed.data) throw new Error("O laudo está temporariamente indisponível.");
    const current = await load();
    if (current.sha256 !== file.sha256 || current.path !== file.path)
      throw new Error("A revisão mudou. Abra o laudo novamente.");
    return {
      url: signed.data.signedUrl,
      id: data.id,
      title: file.name,
      mime: "application/pdf" as const,
      size: file.size,
      sha256: file.sha256,
    };
  });

export const caInspectionReview = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator(
    organization
      .extend({
        key,
        version: z.number().int().nonnegative(),
        evidence: uuid,
        action: z.enum(["approve", "dismiss"]),
        adopt: z.array(field).max(5).optional(),
        restriction: z.enum(["keep", "adopt", "remove"]).optional(),
        note: z.string().trim().max(2500).optional(),
      })
      .refine(
        (data) => (data.action !== "dismiss" && data.restriction !== "remove") || !!data.note,
        {
          message: "Informe o motivo da decisão técnica.",
        },
      ),
  )
  .handler(async ({ context, data }) => {
    privateResponse();
    const response = await (context.supabase as SupabaseClient).rpc("ca_inspecao_review", {
      p_org: data.organization_id,
      p_key: data.key,
      p_version: data.version,
      p_decisions: {
        evidence: data.evidence,
        action: data.action,
        adopt: data.adopt ?? [],
        ...(data.restriction ? { restriction: { action: data.restriction } } : {}),
      },
      p_note: data.note ?? "",
    });
    if (response.error?.code === "PT409")
      throw new Error("A fonte mudou. Recarregue a ficha antes de confirmar.");
    return asLine(storedLine.parse(nrResult(response)));
  });

export const caInspectionSyncNow = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator(organization)
  .handler(async ({ context, data }) => {
    privateResponse();
    const result = z.object({ state: z.string(), queued: z.number().int().default(0) }).parse(
      await rpc(context.supabase as SupabaseClient, "ca_inspecao_request_sync", {
        p_org: data.organization_id,
      }),
    );
    if (
      result.state === "not_configured" ||
      result.state === "context_unavailable" ||
      result.state === "dispatch_failed"
    )
      throw new Error(
        "A sincronização com o Drive está indisponível. Consulte o estado da integração.",
      );
    return { queued: result.queued };
  });
