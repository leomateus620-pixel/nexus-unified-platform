import { createFileRoute } from "@tanstack/react-router";
import { lazy, Suspense } from "react";
const IndustrialMap = lazy(() => import("../industrial/app/IndustrialMap"));
export const Route = createFileRoute("/mapas-3d")({
  ssr: false,
  head: () => ({
    meta: [
      { title: "3 Tentos · Mapa da unidade — Nexus" },
      {
        name: "description",
        content:
          "Reconstrução visual referenciada da unidade 3 Tentos. Explore silos, edificações, acessos e entorno em 3D.",
      },
    ],
  }),
  component: () => (
    <Suspense fallback={<div style={{ padding: 40 }}>Preparando o mapa da unidade…</div>}>
      <IndustrialMap />
    </Suspense>
  ),
});
