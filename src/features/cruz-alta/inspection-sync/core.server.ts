import "@tanstack/react-start/server-only";
import { z } from "zod";
import type { ParsedInspectionPdf } from "../inspection-domain";
import {
  createDrive,
  DRIVE_PDF,
  driveId,
  MAX_DRIVE_PDF_BYTES,
  readLimited,
  type serviceCredentials,
  sha256Pattern,
  SyncFailure,
} from "./drive.server";
import { classifyInspectionFiles, inspectionFolders, knownLvhf } from "./sources.server";

const SUPABASE_ORIGIN = "https://yhtgijtllvgzoqtfcgal.supabase.co";
const BUCKET = "nexus-cruz-alta-laudos";
const WORKER_TIMEOUT_MS = 43_000;
export const inspectionTicket = /^[a-f0-9]{64}$/;

const uuid = z.string().uuid();
const id = z.string().regex(driveId);
const fileName = z.string().min(1).max(500);
const rootKind = z.enum(["laudo", "montada", "layout"]);
const lease = z.object({ id: uuid, lease: uuid });
const scan = z.object({
  folderId: id,
  kind: rootKind,
  pageToken: z.string().min(1).max(4096).nullish(),
  resourceKey: id.nullish(),
  parentFolderId: id.optional(),
  ancestorNames: z.array(fileName).max(4).optional(),
});
const source = z.object({
  id,
  name: fileName,
  kind: z.enum(["laudo", "placa", "montada", "layout"]),
  mimeType: z.literal(DRIVE_PDF),
  parents: z.array(id).length(1),
  modifiedAt: z.string().refine((value) => Number.isFinite(Date.parse(value))),
  version: z.string().regex(/^\d{1,24}$/),
  size: z.number().int().positive().max(Number.MAX_SAFE_INTEGER),
  sha256: z.string().regex(sha256Pattern).nullable(),
  resourceKey: id.nullable(),
  code: z.string().refine(knownLvhf).nullable(),
  revision: z.number().int().min(0).max(999).nullable(),
});
const job = z.discriminatedUnion("kind", [
  lease.extend({ kind: z.literal("scan"), scan }),
  lease.extend({ kind: z.literal("process"), source }),
]);
const claimedResult = z.object({ authorized: z.boolean(), job: z.unknown() });
const finishedResult = z.object({ state: z.enum(["completed", "obsolete"]) });
const failedResult = z.object({ state: z.enum(["retry", "failed", "obsolete"]) });

type WorkerOptions = {
  url: string;
  serviceKey: string;
  credentials: ReturnType<typeof serviceCredentials>;
  parse: (
    bytes: Uint8Array,
    source: { kind: "laudo" | "placa"; code: string; revision: number },
  ) => Promise<ParsedInspectionPdf>;
  fetch?: typeof fetch;
};

type ProcessResult = ParsedInspectionPdf & {
  kind: "process";
  status: "ready" | "review" | "verified";
  itemKeys: string[];
  size: number | null;
  sha256: string | null;
};

export function workerResponse(body: Record<string, unknown>, status = 200) {
  return Response.json(body, {
    status,
    headers: {
      "cache-control": "no-store",
      "x-content-type-options": "nosniff",
    },
  });
}

function noOriginal(itemKeys: string[], issue?: string): ProcessResult {
  return {
    kind: "process",
    status: issue ? "review" : "ready",
    sha256: null,
    size: null,
    itemKeys,
    fields: {},
    restriction: null,
    issues: issue ? [issue] : [],
    pages: 0,
  };
}

export function createInspectionWorker(options: WorkerOptions) {
  const base = new URL(options.url);
  if (base.href !== `${SUPABASE_ORIGIN}/` || !options.serviceKey)
    throw new SyncFailure("worker_nao_configurado");

  const transport = options.fetch ?? fetch;
  const supabaseHeaders = new Headers({ apikey: options.serviceKey });
  if (!options.serviceKey.startsWith("sb_"))
    supabaseHeaders.set("Authorization", `Bearer ${options.serviceKey}`);

  async function rpc(name: string, params: Record<string, unknown>, signal: AbortSignal) {
    const headers = new Headers(supabaseHeaders);
    headers.set("Content-Type", "application/json");
    const response = await transport(`${base.origin}/rest/v1/rpc/${name}`, {
      method: "POST",
      headers,
      body: JSON.stringify(params),
      redirect: "error",
      signal,
    });
    if (!response.ok) {
      await response.body?.cancel();
      throw new SyncFailure("fila_laudos_indisponivel", true);
    }
    if (!response.body) return null;
    const bytes = await readLimited(response, 32_768, "resposta_da_fila_acima_do_limite");
    return bytes.length ? (JSON.parse(new TextDecoder().decode(bytes)) as unknown) : null;
  }

  async function keepOriginal(bytes: Uint8Array<ArrayBuffer>, sha256: string, signal: AbortSignal) {
    const headers = new Headers(supabaseHeaders);
    headers.set("Content-Type", DRIVE_PDF);
    headers.set("x-upsert", "false");
    const response = await transport(`${base.origin}/storage/v1/object/${BUCKET}/${sha256}.pdf`, {
      method: "POST",
      headers,
      body: bytes,
      redirect: "error",
      signal,
    });
    if (response.ok) {
      await response.body?.cancel();
      return;
    }
    // A previous attempt may have kept the same bytes before committing its source revision.
    // The finish RPC verifies the canonical path, byte count and MIME on the existing object.
    if (response.status === 409) {
      await response.body?.cancel();
      return;
    }
    if (response.status === 400) {
      const bytes = await readLimited(response, 2048, "resposta_do_acervo_invalida");
      try {
        const duplicate = JSON.parse(new TextDecoder().decode(bytes)) as {
          statusCode?: unknown;
          error?: unknown;
        };
        if (String(duplicate.statusCode) === "409" && duplicate.error === "Duplicate") return;
      } catch {
        throw new SyncFailure("upload_laudo_indisponivel", true);
      }
    } else await response.body?.cancel();
    throw new SyncFailure("upload_laudo_indisponivel", true);
  }

  async function processSource(
    item: z.infer<typeof source>,
    drive: ReturnType<typeof createDrive>,
    signal: AbortSignal,
  ): Promise<ProcessResult> {
    if (item.kind === "layout") {
      if (item.parents[0] !== inspectionFolders.layout)
        throw new SyncFailure("pasta_do_layout_invalida");
      return noOriginal(["unidade"]);
    }
    const keys = item.code ? [`lvhf-${item.code}`] : [];
    if (!item.code) return noOriginal(keys, "numero_lvhf_ausente_ou_divergente");
    if (item.kind === "montada") {
      if (item.parents[0] !== inspectionFolders.montada)
        throw new SyncFailure("pasta_de_montagem_invalida");
      return noOriginal(keys);
    }
    if (item.size > MAX_DRIVE_PDF_BYTES) return noOriginal(keys, "pdf_acima_do_limite");
    if (item.revision === null) return noOriginal(keys, "revisao_documental_ausente_ou_divergente");
    const { bytes, sha256 } = await drive.download(item, signal);
    let parsed: ParsedInspectionPdf;
    try {
      parsed = await options.parse(bytes, {
        kind: item.kind,
        code: item.code,
        revision: item.revision,
      });
    } catch {
      parsed = {
        fields: {},
        restriction: null,
        issues: ["extracao_documental_indisponivel"],
        pages: 0,
      };
    }
    signal.throwIfAborted();
    await keepOriginal(bytes, sha256, signal);
    const { identityMismatch, fields, restriction, issues, pages } = parsed;
    return {
      kind: "process",
      status: identityMismatch || issues.length ? "review" : "verified",
      sha256,
      size: bytes.length,
      itemKeys: identityMismatch ? [] : keys,
      fields: identityMismatch ? {} : fields,
      restriction: identityMismatch ? null : restriction,
      issues,
      pages,
    };
  }

  return async (request: Request) => {
    if (request.method !== "POST") return workerResponse({ error: "metodo_nao_permitido" }, 405);
    const ticket = request.headers.get("X-Nexus-Job-Token") ?? "";
    if (!inspectionTicket.test(ticket)) return workerResponse({ error: "acesso_negado" }, 403);
    const signal = AbortSignal.any([request.signal, AbortSignal.timeout(WORKER_TIMEOUT_MS)]);
    const drive = createDrive(options.credentials, transport);
    let credentials: z.infer<typeof lease> | undefined;
    try {
      const claim = claimedResult.parse(
        await rpc("ca_inspecao_sync_claim", { p_token: ticket }, signal),
      );
      if (!claim.authorized) return workerResponse({ error: "acesso_negado" }, 403);
      if (!claim.job) return workerResponse({ state: "sem_trabalho" });
      credentials = lease.parse(claim.job);
      const current = job.parse(claim.job);
      let result;
      if (current.kind === "scan") {
        const {
          folderId,
          kind,
          resourceKey,
          pageToken,
          parentFolderId,
          ancestorNames = [],
        } = current.scan;
        if (
          (ancestorNames.length && kind !== "laudo") ||
          (!ancestorNames.length && folderId !== inspectionFolders[kind])
        )
          throw new SyncFailure("pasta_da_varredura_invalida");
        const page = await drive.listFolder(
          folderId,
          resourceKey ?? null,
          pageToken ?? null,
          signal,
          {
            parent: kind === "montada" ? inspectionFolders.layout : parentFolderId,
            name: ancestorNames.at(-1),
          },
        );
        result = {
          kind: "scan",
          children: classifyInspectionFiles(kind, page.items, ancestorNames),
          nextPageToken: page.nextPageToken,
        };
      } else {
        result = await processSource(current.source, drive, signal);
      }
      const finished = finishedResult.parse(
        await rpc(
          "ca_inspecao_sync_finish",
          {
            p_id: credentials.id,
            p_lease: credentials.lease,
            p_result: result,
          },
          signal,
        ),
      );
      return workerResponse({ state: finished.state });
    } catch (error) {
      if (!credentials) return workerResponse({ error: "fila_laudos_indisponivel" }, 503);
      const failure =
        error instanceof SyncFailure
          ? error
          : signal.aborted
            ? new SyncFailure("tempo_do_job_excedido", true)
            : error instanceof z.ZodError
              ? new SyncFailure("trabalho_laudos_invalido")
              : new SyncFailure("processamento_laudos_indisponivel", true);
      try {
        const failed = failedResult.parse(
          await rpc(
            "ca_inspecao_sync_fail",
            {
              p_id: credentials.id,
              p_lease: credentials.lease,
              p_error: failure.code,
              p_retryable: failure.retryable,
            },
            AbortSignal.timeout(5000),
          ),
        );
        return workerResponse({ state: failed.state });
      } catch {
        return workerResponse({ error: "fila_laudos_indisponivel" }, 503);
      }
    }
  };
}
