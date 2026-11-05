import { createFileRoute } from "@tanstack/react-router";
import { PetUnitRoute } from "@/features/pet/PetUnitRoute";
export const Route = createFileRoute("/_authenticated/execucao/pets/$petId")({
  head: () => ({ meta: [{ title: "PET Digital Nexus — Permissão de Entrada e Trabalho" }] }),
  component: Page,
});
function Page() {
  const { petId } = Route.useParams();
  return <PetUnitRoute petId={petId} legacy />;
}
