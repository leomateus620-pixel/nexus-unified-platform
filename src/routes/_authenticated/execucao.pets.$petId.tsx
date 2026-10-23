import { createFileRoute } from "@tanstack/react-router";
import { PetWorkspace } from "@/features/pet/PetWorkspace";
export const Route = createFileRoute("/_authenticated/execucao/pets/$petId")({
  head: () => ({ meta: [{ title: "PET Digital Nexus — Permissão de Entrada e Trabalho" }] }),
  component: Page,
});
function Page() {
  const { petId } = Route.useParams();
  return <PetWorkspace petId={petId} />;
}
