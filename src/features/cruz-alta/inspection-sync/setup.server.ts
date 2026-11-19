import "@tanstack/react-start/server-only";
import { driveSigningKey, readLimited, serviceCredentials, SyncFailure } from "./drive.server";
import {
  createInspectionService,
  inspectionResponseHeaders,
  inspectionTicket,
  workerResponse,
  type InspectionServiceOptions,
} from "./service.server";

const MAX_CREDENTIAL_BYTES = 16 * 1024;
const TOO_LARGE = "credencial_acima_do_limite";

export function createDriveSetupHandler(options: InspectionServiceOptions | null) {
  return async (request: Request) => {
    if (request.method !== "POST") return workerResponse({ error: "metodo_nao_permitido" }, 405);
    const ticket = request.headers.get("X-Nexus-Drive-Setup-Token") ?? "";
    if (new URL(request.url).protocol !== "https:" || !inspectionTicket.test(ticket))
      return workerResponse({ error: "acesso_negado" }, 403);
    const mime = request.headers.get("content-type")?.split(";")[0]?.trim().toLowerCase();
    if (mime !== "application/json")
      return workerResponse({ error: "modo_de_envio_invalido" }, 415);
    if (!options) return workerResponse({ error: "configuracao_indisponivel" }, 503);

    let credential: ReturnType<typeof serviceCredentials>;
    try {
      const bytes = await readLimited(request, MAX_CREDENTIAL_BYTES, TOO_LARGE);
      credential = serviceCredentials(new TextDecoder("utf-8", { fatal: true }).decode(bytes));
      await driveSigningKey(credential.privateKey);
    } catch (error) {
      if (error instanceof SyncFailure && error.code === TOO_LARGE)
        return workerResponse({ error: TOO_LARGE }, 413);
      return workerResponse({ error: "credencial_drive_invalida" }, 400);
    }

    try {
      const { rpc } = createInspectionService(options);
      const stored = await rpc(
        "ca_inspecao_drive_setup_concluir",
        {
          p_token: ticket,
          p_credential: {
            type: "service_account",
            client_email: credential.clientEmail,
            private_key: credential.privateKey,
            ...(credential.keyId ? { private_key_id: credential.keyId } : {}),
          },
        },
        AbortSignal.any([request.signal, AbortSignal.timeout(15_000)]),
      );
      if (stored === true)
        return new Response(null, { status: 204, headers: inspectionResponseHeaders });
      if (stored === false) return workerResponse({ error: "acesso_negado" }, 403);
    } catch {
      // Authentication and storage failures share a redacted public error.
    }
    return workerResponse({ error: "configuracao_indisponivel" }, 503);
  };
}

export function handleCruzAltaDriveSetup(request: Request) {
  const url = process.env["SUPABASE_URL"];
  const serviceKey = process.env["SUPABASE_SERVICE_ROLE_KEY"];
  return createDriveSetupHandler(url && serviceKey ? { url, serviceKey } : null)(request);
}
