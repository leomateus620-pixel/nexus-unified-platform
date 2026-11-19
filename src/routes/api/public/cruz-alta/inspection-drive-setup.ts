import { createFileRoute } from "@tanstack/react-router";

export const Route = createFileRoute("/api/public/cruz-alta/inspection-drive-setup")({
  server: {
    handlers: {
      ANY: async ({ request }) => {
        const { handleCruzAltaDriveSetup } =
          await import("@/features/cruz-alta/inspection-sync/setup.server");
        return handleCruzAltaDriveSetup(request);
      },
    },
  },
});
