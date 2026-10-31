import "@tanstack/react-start/server-only";
import { createImageWorker } from "./core.server";
import { imageInfo } from "./image-info.server";

function denied(status: number, error: string) {
  return new Response(JSON.stringify({ error }), {
    status,
    headers: {
      "content-type": "application/json",
      "cache-control": "no-store",
      "x-content-type-options": "nosniff",
    },
  });
}

/** Internal queue processing only. No session, caller identity, path or body controls its scope. */
export async function handleNrImageWorker(request: Request): Promise<Response> {
  if (request.method !== "POST") return denied(405, "metodo_nao_permitido");
  if (!/^[a-f0-9]{64}$/.test(request.headers.get("X-Nexus-Job-Token") ?? ""))
    return denied(403, "acesso_negado");

  // Bindings are resolved per request, exclusively after the server boundary.
  // Maintenance-shell presence is not evidence that a published Worker has these bindings.
  const url = process.env["SUPABASE_URL"];
  const serviceKey = process.env["SUPABASE_SERVICE_ROLE_KEY"];
  if (!url || !serviceKey) return denied(503, "integracao_nao_configurada");
  try {
    return await createImageWorker({ url, serviceKey, inspectImage: imageInfo })(request);
  } catch {
    // Do not expose configuration, credentials, request headers or private paths.
    return denied(503, "worker_nao_configurado");
  }
}
