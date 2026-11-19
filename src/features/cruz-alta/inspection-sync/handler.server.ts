import "@tanstack/react-start/server-only";
import { createInspectionWorker, inspectionTicket, workerResponse } from "./core.server";
import { serviceCredentials } from "./drive.server";

export async function handleCruzAltaInspectionWorker(request: Request) {
  if (request.method !== "POST") return workerResponse({ error: "metodo_nao_permitido" }, 405);
  if (!inspectionTicket.test(request.headers.get("X-Nexus-Job-Token") ?? ""))
    return workerResponse({ error: "acesso_negado" }, 403);

  const url = process.env["SUPABASE_URL"];
  const serviceKey = process.env["SUPABASE_SERVICE_ROLE_KEY"];
  const credential = process.env["CRUZ_ALTA_DRIVE_SERVICE_ACCOUNT_JSON"];
  if (!url || !serviceKey || !credential)
    return workerResponse({ error: "integracao_nao_configurada" }, 503);

  try {
    const worker = createInspectionWorker({
      url,
      serviceKey,
      credentials: serviceCredentials(credential),
      parse: async (bytes, source) => {
        const { parseCruzAltaInspectionPdf } = await import("../inspection-pdf.server");
        return parseCruzAltaInspectionPdf(bytes, source);
      },
      parseLayout: async (bytes) => {
        const { parseCruzAltaLayoutPdf } = await import("../inspection-layout.server");
        return parseCruzAltaLayoutPdf(bytes);
      },
    });
    return await worker(request);
  } catch {
    return workerResponse({ error: "integracao_nao_configurada" }, 503);
  }
}
