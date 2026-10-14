import { createFileRoute } from "@tanstack/react-router";
import { lazy, Suspense } from "react";

const SiloViewer = lazy(() => import("@/silo-engolfamento/SiloViewer"));
export const Route = createFileRoute("/mapas-3d_/silo-engolfamento")({
  ssr: false,
  head: () => ({ meta: [{ title: "Silo de Grãos — Engolfamento | Nexus" }] }),
  component: () => (
    <Suspense fallback={<p style={{ padding: 32 }}>Preparando a experiência educativa…</p>}>
      <SiloViewer />
    </Suspense>
  ),
});
