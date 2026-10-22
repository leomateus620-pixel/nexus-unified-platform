import { createFileRoute } from "@tanstack/react-router";
import { PessoasWorkspace } from "@/features/operacao/PessoasWorkspace";
export const Route = createFileRoute("/_authenticated/equipe")({ component: PessoasWorkspace });
