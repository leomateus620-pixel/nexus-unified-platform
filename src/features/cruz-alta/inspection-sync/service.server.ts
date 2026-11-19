import "@tanstack/react-start/server-only";
import { readLimited, SyncFailure } from "./drive.server";

const SUPABASE_ORIGIN = "https://yhtgijtllvgzoqtfcgal.supabase.co";
export const inspectionTicket = /^[a-f0-9]{64}$/;
export const inspectionResponseHeaders = {
  "cache-control": "no-store",
  "x-content-type-options": "nosniff",
};

export type InspectionServiceOptions = {
  url: string;
  serviceKey: string;
  fetch?: typeof fetch;
};

export function workerResponse(body: Record<string, unknown>, status = 200) {
  return Response.json(body, { status, headers: inspectionResponseHeaders });
}

export function createInspectionService(options: InspectionServiceOptions) {
  const base = new URL(options.url);
  if (base.href !== `${SUPABASE_ORIGIN}/` || !options.serviceKey)
    throw new SyncFailure("worker_nao_configurado");

  async function request(path: string, init: RequestInit) {
    const transport = options.fetch ?? fetch;
    const headers = new Headers(init.headers);
    headers.set("apikey", options.serviceKey);
    if (!options.serviceKey.startsWith("sb_"))
      headers.set("Authorization", `Bearer ${options.serviceKey}`);
    return transport(`${base.origin}${path}`, { ...init, headers, redirect: "error" });
  }

  async function rpc(name: string, params: Record<string, unknown>, signal: AbortSignal) {
    const response = await request(`/rest/v1/rpc/${name}`, {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify(params),
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

  return { request, rpc };
}
