import { createFileRoute } from "@tanstack/react-router";
import { NrRoute } from "@/features/nr/NrRoute";
export const Route = createFileRoute("/_authenticated/nr-33/")({
  component: () => <NrRoute norma="NR33" section="visao-geral" />,
});
