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

export function inspectionBackendError(error: unknown) {
  return error instanceof SyncFailure && error.code.startsWith("backend_") ? error.code : undefined;
}

export function createInspectionService(options: InspectionServiceOptions) {
  const base = new URL(options.url);
  if (base.href !== `${SUPABASE_ORIGIN}/` || !options.serviceKey)
    throw new SyncFailure("worker_nao_configurado");
  if (options.serviceKey.startsWith("sb_publishable_"))
    throw new SyncFailure("backend_chave_sem_privilegio");

  async function request(path: string, init: RequestInit) {
    const transport = options.fetch ?? fetch;
    const headers = new Headers(init.headers);
    // Supabase rejects secret keys presented by browser user agents. Identify this server leg.
    headers.set("user-agent", "Nexus-Cruz-Alta-Worker/1.0");
    headers.set("apikey", options.serviceKey);
    if (!options.serviceKey.startsWith("sb_"))
      headers.set("Authorization", `Bearer ${options.serviceKey}`);
    try {
      // Workerd supports manual redirects. Callers reject every non-2xx response.
      return await transport(`${base.origin}${path}`, { ...init, headers, redirect: "manual" });
    } catch {
      throw new SyncFailure("backend_transporte_indisponivel", true);
    }
  }

  async function rpc(name: string, params: Record<string, unknown>, signal: AbortSignal) {
    const response = await request(`/rest/v1/rpc/${name}`, {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify(params),
      signal,
    });
    if (!response.ok) {
      if (response.status === 401 || response.status === 403) {
        const denied = await readLimited(response, 4096, "resposta_curta_invalida")
          .then((bytes) => JSON.parse(new TextDecoder().decode(bytes)) as { code?: string })
          .catch(() => null);
        throw new SyncFailure(
          denied?.code === "42501" ? "backend_permissao_negada" : "backend_acesso_rejeitado",
        );
      }
      await response.body?.cancel();
      if (response.status === 404) throw new SyncFailure("backend_rpc_indisponivel", true);
      if (response.status === 429) throw new SyncFailure("backend_limite_atingido", true);
      throw new SyncFailure("backend_resposta_rejeitada", response.status >= 500);
    }
    if (!response.body) return null;
    const bytes = await readLimited(response, 32_768, "resposta_da_fila_acima_do_limite");
    return bytes.length ? (JSON.parse(new TextDecoder().decode(bytes)) as unknown) : null;
  }

  return { request, rpc };
}
