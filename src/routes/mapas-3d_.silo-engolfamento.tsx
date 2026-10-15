import { createFileRoute } from "@tanstack/react-router";
import { lazy, Suspense } from "react";

const SiloViewer = lazy(() => import("@/silo-engolfamento/SiloViewer"));
export const Route = createFileRoute("/mapas-3d_/silo-engolfamento")({
  ssr: false,
  head: () => ({
    meta: [
      { title: "Silo metálico · LVHF interna e engolfamento | Nexus" },
      {
        name: "description",
        content:
          "Explore o silo metálico de 22 m, inspecione a LVHF circular interna e reproduza o incidente educativo em quatro perspectivas.",
      },
    ],
  }),
  component: () => (
    <Suspense fallback={<p style={{ padding: 32 }}>Preparando a experiência educativa…</p>}>
      <SiloViewer />
    </Suspense>
  ),
});
