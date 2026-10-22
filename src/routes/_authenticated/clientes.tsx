import { createFileRoute, type SearchSchemaInput } from "@tanstack/react-router";
import { z } from "zod";
import { ClientesWorkspace, type ClientesSearch } from "@/features/clientes/ClientesWorkspace";

const searchSchema = z.object({
  cliente: z.string().uuid().or(z.literal("")).catch(""),
  busca: z.string().max(120).catch(""),
  situacao: z.enum(["ativos", "arquivados", "todos"]).catch("ativos"),
  pagina: z.coerce.number().int().min(0).max(100000).catch(0),
});
export const Route = createFileRoute("/_authenticated/clientes")({
  validateSearch: (search: Partial<ClientesSearch> & SearchSchemaInput) =>
    searchSchema.parse(search),
  head: () => ({
    meta: [
      { title: "Clientes — Sistema Nexus" },
      {
        name: "description",
        content: "Cadastro, unidades, contatos e histórico dos clientes da organização.",
      },
      { property: "og:title", content: "Clientes — Sistema Nexus" },
      { property: "og:description", content: "Clientes, unidades e contatos." },
    ],
  }),
  component: Page,
});
function Page() {
  const search = Route.useSearch();
  const navigate = Route.useNavigate();
  return (
    <ClientesWorkspace
      search={search}
      onSearch={(patch) => {
        void navigate({ search: (previous) => ({ ...previous, ...patch }), replace: true });
      }}
    />
  );
}
