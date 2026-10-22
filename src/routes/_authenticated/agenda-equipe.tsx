import { createFileRoute, useNavigate } from "@tanstack/react-router";
import { ErrorState, LoadingState } from "@/components/nexus/Page";
import { AgendaEquipeWorkspace } from "@/features/agenda-equipe/AgendaEquipeWorkspace";
import { agendaSearchSchema } from "@/features/agenda-equipe/schemas";
import { useOperationalAccess } from "@/features/operacao/access";
import { useOrg } from "@/features/org/session";

export const Route = createFileRoute("/_authenticated/agenda-equipe")({
  validateSearch: agendaSearchSchema,
  component: AgendaPage,
});
function AgendaPage() {
  const search = Route.useSearch();
  const navigate = useNavigate({ from: Route.fullPath });
  const org = useOrg();
  const access = useOperationalAccess(org.data?.orgId ?? "", org.data?.userId ?? "");
  if (org.isPending || access.isPending)
    return <LoadingState label="Conferindo acesso à Agenda Equipe…" />;
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
  return (
    <AgendaEquipeWorkspace
      orgId={org.data.orgId}
      userId={org.data.userId}
      access={access.data}
      search={search}
      onSearch={(patch) =>
        navigate({
          replace: !["evento", "acao", "foco"].some((key) => key in patch),
          search: (previous) => ({ ...previous, ...patch }),
        })
      }
      onOpenLevantamento={(id) => navigate({ to: "/levantamentos", search: { levantamento: id } })}
    />
  );
}
