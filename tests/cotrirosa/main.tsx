import React from "react";
import { createRoot } from "react-dom/client";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import {
  createRootRoute,
  createRoute,
  createRouter,
  RouterProvider,
  useLocation,
} from "@tanstack/react-router";
import { NrCatchall, NrRoute } from "@/features/nr/NrRoute";
import { PetUnitRoute } from "@/features/pet/PetUnitRoute";
import { nrSearchSchema } from "@/features/nr/route-state";
import "@/styles.css";
const cache = new QueryClient({ defaultOptions: { queries: { retry: false } } });
function Lab() {
  const { pathname } = useLocation();
  const legacy = pathname.match(/^\/execucao\/pets\/(.+)/);
  const norma = pathname.startsWith("/nr-35") ? "NR35" : "NR33";
  return (
    <QueryClientProvider client={cache}>
      <div
        style={{
          position: "relative",
          zIndex: 50,
          background: "#213d32",
          color: "white",
          padding: "7px 12px",
          fontSize: 12,
        }}
      >
        LABORATÓRIO LOCAL · dados sintéticos · PostgreSQL real · autenticação de teste · emissão
        bloqueada
      </div>
      <main className="cotrirosa-lab-main">
        {legacy ? (
          <PetUnitRoute petId={legacy[1]!} legacy />
        ) : pathname.split("/").filter(Boolean).length < 2 ? (
          <NrRoute norma={norma} section="visao-geral" />
        ) : (
          <NrCatchall norma={norma} />
        )}
      </main>
      <style>{`.cotrirosa-lab-main{padding:24px 24px 0}@media(max-width:767px){.cotrirosa-lab-main{padding:16px 12px 0}}`}</style>
    </QueryClientProvider>
  );
}
const route = createRootRoute();
const all = createRoute({
  getParentRoute: () => route,
  path: "$",
  validateSearch: nrSearchSchema,
  component: Lab,
});
const router = createRouter({ routeTree: route.addChildren([all]) });
createRoot(document.getElementById("root")!).render(<RouterProvider router={router} />);
