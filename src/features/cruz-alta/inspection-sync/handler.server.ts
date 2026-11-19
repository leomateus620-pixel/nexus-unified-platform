import "@tanstack/react-start/server-only";
import { createInspectionWorker } from "./core.server";
import { serviceCredentials } from "./drive.server";
import { inspectionBackendError, inspectionTicket, workerResponse } from "./service.server";

export async function handleCruzAltaInspectionWorker(request: Request) {
  if (request.method !== "POST") return workerResponse({ error: "metodo_nao_permitido" }, 405);
  if (!inspectionTicket.test(request.headers.get("X-Nexus-Job-Token") ?? ""))
    return workerResponse({ error: "acesso_negado" }, 403);

  const url = process.env["SUPABASE_URL"];
  const serviceKey = process.env["SUPABASE_SERVICE_ROLE_KEY"];
  const credential = process.env["CRUZ_ALTA_DRIVE_SERVICE_ACCOUNT_JSON"];
  if (!url || !serviceKey) return workerResponse({ error: "integracao_nao_configurada" }, 503);

  try {
    if (request.headers.get("X-Nexus-Job-Queue") === "imagens") {
      const [{ createImageWorker }, { imageInfo }] = await Promise.all([
        import("../../nr/image-worker/core.server"),
        import("../../nr/image-worker/image-info.server"),
      ]);
      return await createImageWorker({ url, serviceKey, inspectImage: imageInfo, cruzAlta: true })(
        request,
      );
    }
    if (request.headers.get("X-Nexus-Job-Queue") === "rdo") {
      const { createRdoWorker } = await import("./rdo-worker.server");
      return await createRdoWorker({ url, serviceKey })(request);
    }
    const worker = createInspectionWorker({
      url,
      serviceKey,
      ...(credential ? { credentials: serviceCredentials(credential) } : {}),
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
  } catch (error) {
    return workerResponse(
      { error: inspectionBackendError(error) ?? "integracao_nao_configurada" },
      503,
    );
  }
}
