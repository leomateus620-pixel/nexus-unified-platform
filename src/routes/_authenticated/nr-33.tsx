import { createFileRoute, Outlet, type SearchSchemaInput } from "@tanstack/react-router";
import type { NrSearch } from "@/features/nr/NrWorkspace";
import { nrSearchSchema } from "@/features/nr/route-state";
export const Route = createFileRoute("/_authenticated/nr-33")({
  validateSearch: (search: Partial<NrSearch> & SearchSchemaInput): NrSearch =>
    nrSearchSchema.parse(search),
  head: () => ({ meta: [{ title: "NR-33 — Espaços confinados — Nexus" }] }),
  component: Page,
});
function Page() {
  return <Outlet />;
}
