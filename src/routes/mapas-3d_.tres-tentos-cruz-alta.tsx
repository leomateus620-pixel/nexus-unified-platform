import { createFileRoute, type SearchSchemaInput } from "@tanstack/react-router";
import { lazy, Suspense } from "react";
import { z } from "zod";

const Workspace = lazy(() => import("@/features/cruz-alta/CruzAltaWorkspace"));
const searchSchema = z.object({
  objeto: z.string().max(120).optional(),
  vista: z.literal("acervo").optional(),
  aba: z.enum(["documentos", "ficha"]).optional(),
  documento: z.string().uuid().optional(),
  revisao: z.string().uuid().optional(),
});
export const Route = createFileRoute("/mapas-3d_/tres-tentos-cruz-alta")({
  ssr: false,
  validateSearch: (raw: Record<string, unknown> & SearchSchemaInput) => searchSchema.parse(raw),
  head: () => ({ meta: [{ title: "Três Tentos · Cruz Alta/RS — Nexus" }] }),
  component: MapRoute,
});
function MapRoute() {
  const search = Route.useSearch();
  const navigate = Route.useNavigate();
  return (
    <Suspense fallback={<p role="status">Abrindo Cruz Alta…</p>}>
      <Workspace
        search={search}
        archive={search.vista === "acervo"}
        onChange={(next, replace) => {
          const fromReader = !!(search.documento || search.revisao);
          const toReader = !!(next.documento || next.revisao);
          const closing = (fromReader && !toReader) || (!!search.objeto && !next.objeto);
          if (closing && history.state?.caOrigem === (fromReader ? "leitor" : "ficha")) {
            window.history.back();
            return;
          }
          const marker =
            toReader && !fromReader
              ? "leitor"
              : !search.objeto && next.objeto
                ? "ficha"
                : closing
                  ? undefined
                  : history.state?.caOrigem;
          void navigate({
            search: { ...next, vista: search.vista },
            state: (prev) => ({ ...prev, caOrigem: marker }),
            replace: !!replace,
            resetScroll: false,
          });
        }}
      />
    </Suspense>
  );
}
