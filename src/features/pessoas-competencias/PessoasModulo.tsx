import { ActionButton, ErrorState, LoadingState, PageHeader } from "@/components/nexus/Page";
import { useOrg } from "@/features/org/session";
import { PessoasWorkspace } from "@/features/operacao/PessoasWorkspace";
import { fieldClass } from "@/features/operacao/components";
import { useOperationalAccess } from "@/features/operacao/access";
import { EquipesWorkspace } from "./equipes/EquipesWorkspace";
import { QualificacoesWorkspace } from "./qualificacoes/QualificacoesWorkspace";

export type PessoasModuloSearch = {
  area: "pessoas" | "equipes" | "competencias" | "qualificacoes";
  busca: string;
  pagina: number;
  arquivadas: boolean;
  pessoa: string;
  equipe: string;
  paginaMembros: number;
  competencia: string;
  qualificacao: string;
  pessoaFiltro: string;
  estado: string;
};
const areas = [
  ["pessoas", "Pessoas"],
  ["equipes", "Equipes"],
  ["competencias", "Competências"],
  ["qualificacoes", "Qualificações"],
] as const;
export function PessoasModulo({
  search,
  onSearch,
}: {
  search: PessoasModuloSearch;
  onSearch: (patch: Partial<PessoasModuloSearch>) => void;
}) {
  const changeArea = (area: PessoasModuloSearch["area"]) =>
    onSearch({
      area,
      busca: "",
      pagina: 0,
      arquivadas: false,
      pessoa: "",
      equipe: "",
      paginaMembros: 0,
      competencia: "",
      qualificacao: "",
      pessoaFiltro: "",
      estado: "",
    });
  return (
    <div className="min-w-0 space-y-5">
      <div className="md:hidden">
        <label className="text-sm font-medium">
          Área de pessoas
          <select
            className={`${fieldClass} mt-1`}
            value={search.area}
            onChange={(event) => changeArea(event.target.value as PessoasModuloSearch["area"])}
          >
            {areas.map(([key, title]) => (
              <option key={key} value={key}>
                {title}
              </option>
            ))}
          </select>
        </label>
      </div>
      <nav
        aria-label="Áreas de Pessoas e Competências"
        className="hidden flex-wrap gap-2 border-b border-border pb-3 md:flex"
      >
        {areas.map(([key, title]) => (
          <ActionButton
            key={key}
            variant={key === search.area ? "primary" : "ghost"}
            aria-current={key === search.area ? "page" : undefined}
            onClick={() => changeArea(key)}
          >
            {title}
          </ActionButton>
        ))}
      </nav>
      {search.area === "pessoas" ? (
        <PessoasWorkspace search={search} onSearch={onSearch} />
      ) : (
        <AreasOperacionais search={search} onSearch={onSearch} />
      )}
    </div>
  );
}
function AreasOperacionais({
  search,
  onSearch,
}: {
  search: PessoasModuloSearch;
  onSearch: (patch: Partial<PessoasModuloSearch>) => void;
}) {
  const org = useOrg();
  const access = useOperationalAccess(org.data?.orgId ?? "", org.data?.userId ?? "");
  if (org.isPending || access.isPending)
    return <LoadingState label="Conferindo acesso à equipe…" />;
  if (org.isError || access.isError || !org.data)
    return (
      <ErrorState
        error={org.error || access.error || new Error("Sessão indisponível.")}
        onRetry={async () => {
          const current = await org.refetch();
          if (!current.isError) await access.refetch();
        }}
      />
    );
  const openPerson = (pessoa: string) =>
    onSearch({
      area: "pessoas",
      pessoa,
      busca: "",
      pagina: 0,
      arquivadas: false,
      equipe: "",
      competencia: "",
      qualificacao: "",
      pessoaFiltro: "",
      estado: "",
    });
  return (
    <div className="space-y-5">
      <PageHeader
        eyebrow="Pessoas e Competências"
        title={
          search.area === "equipes"
            ? "Equipes e participações"
            : search.area === "competencias"
              ? "Competências"
              : "Qualificações"
        }
        description={
          search.area === "equipes"
            ? "Organize pessoas e preserve os períodos de participação."
            : search.area === "competencias"
              ? "Defina as evidências e a validade exigidas pela operação."
              : "Registre, confira e acompanhe evidências por pessoa."
        }
      />
      {search.area === "equipes" ? (
        <EquipesWorkspace
          orgId={org.data.orgId}
          userId={org.data.userId}
          access={access.data}
          search={search}
          onSearch={onSearch}
          onOpenPessoa={openPerson}
        />
      ) : (
        <QualificacoesWorkspace
          orgId={org.data.orgId}
          userId={org.data.userId}
          access={access.data}
          search={{ ...search, area: search.area as "competencias" | "qualificacoes" }}
          onSearch={onSearch}
          onOpenPessoa={openPerson}
        />
      )}
    </div>
  );
}
