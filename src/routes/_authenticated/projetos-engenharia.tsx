import { createFileRoute, useNavigate } from "@tanstack/react-router";
import { z } from "zod";

import { ProjetosEngenhariaPage } from "@/features/projetos-engenharia/ProjetosEngenhariaPage";

export const Route = createFileRoute("/_authenticated/projetos-engenharia")({
  validateSearch: z.object({ projeto: z.string().uuid().optional() }),
  head: () => ({
    meta: [
      { title: "Projetos de Engenharia — Nexus" },
      {
        name: "description",
        content: "Acervo e versões técnicas com autoria e fontes preservadas.",
      },
    ],
  }),
  component: Pagina,
});

function Pagina() {
  const { projeto } = Route.useSearch();
  const navigate = useNavigate({ from: Route.fullPath });
  return (
    <ProjetosEngenhariaPage
      projetoId={projeto}
      selecionar={(id) => navigate({ search: { projeto: id } })}
    />
  );
}
