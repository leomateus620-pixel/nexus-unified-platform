import { createFileRoute } from "@tanstack/react-router";
import { lazy, Suspense } from "react";
const EscadaViewer = lazy(() => import("@/escada/EscadaViewer"));
export const Route = createFileRoute("/escada-lc02")({
  head: () => ({
    meta: [
      { title: "Escada LC-02 — Layout 3D | Nexus" },
      {
        name: "description",
        content:
          "Estudo interativo independente da escada externa: dois lances, níveis 0 / 3 / 6 m e implantação conforme o PDF LC-02.",
      },
    ],
  }),
  component: () => (
    <Suspense fallback={<p>Carregando escada LC-02…</p>}>
      <EscadaViewer />
    </Suspense>
  ),
});
