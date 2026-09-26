import { ClientOnly, createFileRoute } from "@tanstack/react-router";
import { lazy, Suspense } from "react";

const TrevisanViewer = lazy(() => import("@/trevisan/TrevisanViewer"));
export const Route = createFileRoute("/mapas-3d_/trevisan")({
  head: () => ({
    meta: [
      { title: "Trevisan · Moega 3 e complexo industrial — Nexus" },
      {
        name: "description",
        content:
          "Modelo técnico navegável da Moega 3 e complexo Trevisan. Levantamento preliminar de 25/09/2026, com camadas e origem das medidas.",
      },
    ],
  }),
  component: () => (
    <ClientOnly fallback={<Loading />}>
      <Suspense fallback={<Loading />}>
        <TrevisanViewer />
      </Suspense>
    </ClientOnly>
  ),
});
function Loading() {
  return (
    <div className="flex h-dvh items-center justify-center bg-background text-sm text-muted-foreground">
      Preparando visualização dedicada da Trevisan…
    </div>
  );
}
