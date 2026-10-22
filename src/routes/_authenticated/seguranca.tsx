import { createFileRoute } from "@tanstack/react-router";
import { AcoesWorkspace } from "@/features/operacao/AcoesWorkspace";
export const Route = createFileRoute("/_authenticated/seguranca")({ component: AcoesWorkspace });
