import { createFileRoute } from "@tanstack/react-router";
import { ExecucaoWorkspace } from "@/features/pet/ExecucaoWorkspace";
export const Route = createFileRoute("/_authenticated/execucao/")({
  component: () => <ExecucaoWorkspace />,
});
