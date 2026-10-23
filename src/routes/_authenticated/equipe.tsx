import { createFileRoute, useNavigate } from "@tanstack/react-router";
import { z } from "zod";
import { PessoasModulo } from "@/features/pessoas-competencias/PessoasModulo";
export const Route = createFileRoute("/_authenticated/equipe")({
  validateSearch: z.object({
    area: z
      .enum(["pessoas", "equipes", "competencias", "qualificacoes"])
      .default("pessoas")
      .catch("pessoas"),
    busca: z.string().max(120).default("").catch(""),
    pagina: z.coerce.number().int().min(0).max(10000).default(0).catch(0),
    arquivadas: z.enum(["true", "false"]).optional().catch(undefined),
    pessoa: z.string().uuid().optional().catch(undefined),
    equipe: z.string().uuid().optional().catch(undefined),
    competencia: z.string().uuid().optional().catch(undefined),
    qualificacao: z.string().uuid().optional().catch(undefined),
    pessoaFiltro: z.string().uuid().optional().catch(undefined),
    paginaMembros: z.coerce.number().int().min(0).max(10000).default(0).catch(0),
    estado: z.enum(["", "enviada", "em_conferencia", "validada", "revogada"]).default("").catch(""),
  }),
  component: Pagina,
});
function Pagina() {
  const search = Route.useSearch();
  const navigate = useNavigate({ from: Route.fullPath });
  return (
    <PessoasModulo
      search={{
        ...search,
        arquivadas: search.arquivadas === "true",
        pessoa: search.pessoa || "",
        equipe: search.equipe || "",
        competencia: search.competencia || "",
        qualificacao: search.qualificacao || "",
        pessoaFiltro: search.pessoaFiltro || "",
      }}
      onSearch={(patch) =>
        navigate({
          replace: !["pessoa", "equipe", "competencia", "qualificacao", "area"].some(
            (key) => key in patch,
          ),
          search: (previous) => ({
            ...previous,
            ...patch,
            pessoa: (patch.pessoa ?? previous.pessoa) || undefined,
            equipe: (patch.equipe ?? previous.equipe) || undefined,
            competencia: (patch.competencia ?? previous.competencia) || undefined,
            qualificacao: (patch.qualificacao ?? previous.qualificacao) || undefined,
            pessoaFiltro: (patch.pessoaFiltro ?? previous.pessoaFiltro) || undefined,
            arquivadas:
              patch.arquivadas === undefined
                ? previous.arquivadas
                : patch.arquivadas
                  ? "true"
                  : "false",
          }),
        })
      }
    />
  );
}
