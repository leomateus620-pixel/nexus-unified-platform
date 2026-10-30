import { createFileRoute } from "@tanstack/react-router";
import { NrRoute } from "@/features/nr/NrRoute";
export const Route = createFileRoute("/_authenticated/nr-35/")({
  component: () => <NrRoute norma="NR35" section="visao-geral" />,
});
