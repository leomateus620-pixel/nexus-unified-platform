import { createFileRoute, redirect } from "@tanstack/react-router";

export const Route = createFileRoute("/_authenticated/comercial/propostas/$propostaId/revisoes/$revisaoId/")({
  beforeLoad: ({ params }) => {
    throw redirect({ to: "/comercial/propostas/$propostaId/revisoes/$revisaoId/itens-comerciais", params, replace: true });
  },
});
