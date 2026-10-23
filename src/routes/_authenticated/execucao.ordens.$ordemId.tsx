import { createFileRoute } from "@tanstack/react-router";
import { ExecucaoWorkspace } from "@/features/pet/ExecucaoWorkspace";
export const Route = createFileRoute("/_authenticated/execucao/ordens/$ordemId")({
  head: () => ({ meta: [{ title: "Ordem de serviço — Sistema Nexus" }] }),
  component: Page,
});
function Page() {
  const { ordemId } = Route.useParams();
  return <ExecucaoWorkspace ordemId={ordemId} />;
}
