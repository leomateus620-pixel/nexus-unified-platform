import { createFileRoute } from "@tanstack/react-router";

// A technical callback, not an application page. Public ingress still requires
// a short-lived, single-use ticket before the private queue can be claimed.
export const Route = createFileRoute("/api/public/nr/image-worker")({
  server: {
    handlers: {
      ANY: async ({ request }) => {
        const { handleNrImageWorker } = await import("@/features/nr/image-worker/handler.server");
        return handleNrImageWorker(request);
      },
    },
  },
});
