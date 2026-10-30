import { createFileRoute } from "@tanstack/react-router";
import { NrCatchall } from "@/features/nr/NrRoute";
export const Route = createFileRoute("/_authenticated/nr-35/$")({
  component: () => <NrCatchall norma="NR35" />,
});
