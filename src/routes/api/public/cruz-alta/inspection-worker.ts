import { createFileRoute } from "@tanstack/react-router";

export const Route = createFileRoute("/api/public/cruz-alta/inspection-worker")({
  server: {
    handlers: {
      ANY: async ({ request }) => {
        const { handleCruzAltaInspectionWorker } =
          await import("@/features/cruz-alta/inspection-sync/handler.server");
        return handleCruzAltaInspectionWorker(request);
      },
    },
  },
});
