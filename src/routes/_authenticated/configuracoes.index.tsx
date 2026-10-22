import { createFileRoute } from "@tanstack/react-router";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { useState } from "react";
import { useServerFn } from "@tanstack/react-start";
import { administrarVinculo, listarVinculos } from "@/features/operacao/admin.functions";
import { AdminVinculos } from "@/features/operacao/AdminVinculos";
import {
  fieldClass,
  OperationalDialog,
  Pagination,
  useCommandKey,
} from "@/features/operacao/components";
import {
  ActionButton,
  EmptyState,
  ErrorState,
  LoadingState,
  PageHeader,
  Section,
} from "@/components/nexus/Page";
import { supabase } from "@/integrations/supabase/client";
import { useOrg } from "@/features/org/session";

export const Route = createFileRoute("/_authenticated/configuracoes/")({
  head: () => ({
    meta: [
      { title: "Configurações — Sistema Nexus" },
      { name: "description", content: "Usuários, papéis e parâmetros da organização." },
    ],
  }),
  component: Page,
});
const PAPEIS = ["admin", "comercial", "engenharia", "compras", "financeiro", "campo"] as const;
function Page() {
  const org = useOrg();
  const orgId = org.data?.orgId ?? "";
  const qc = useQueryClient();
  const [erro, setErro] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const [pagina, setPagina] = useState(0);
  const [desligar, setDesligar] = useState<{ user_id: string; nome: string } | null>(null);
  const [motivo, setMotivo] = useState("");
  const execute = useServerFn(administrarVinculo);
  const load = useServerFn(listarVinculos);
  const keyFor = useCommandKey();
  const q = useQuery({
    queryKey: ["membros", orgId, pagina],
    enabled: !!orgId && !!org.data?.isAdmin,
    queryFn: ({ signal }) => load({ data: { organization_id: orgId, pagina }, signal }),
  });
  async function command(
    comando: "papel" | "coordenacao" | "desligar",
    dados: {
      user_id: string;
      role?: (typeof PAPEIS)[number];
      habilitar?: boolean;
      motivo?: string;
    },
  ) {
    setErro(null);
    setBusy(true);
    try {
      const payload = { organization_id: orgId, comando, dados };
      await execute({ data: { ...payload, chave: keyFor(payload) } });
      if (comando === "desligar") setDesligar(null);
      await qc.invalidateQueries({ queryKey: ["membros", orgId] });
      await qc.invalidateQueries({ queryKey: ["org"] });
      await qc.invalidateQueries({ queryKey: ["operacao-acesso", orgId] });
      if (comando === "desligar" && dados.user_id === org.data?.userId) {
        qc.clear();
        await supabase.auth.signOut();
      }
    } catch (e) {
      setErro(e instanceof Error ? e.message : "Não foi possível salvar. Tente novamente.");
    } finally {
      setBusy(false);
    }
  }
  return (
    <div className="space-y-5">
      <PageHeader
        eyebrow="Configurações"
        title={org.data?.orgNome ?? "Organização"}
        description="Administre vínculos, papéis e coordenação operacional. A autoria dos registros anteriores permanece preservada."
      />
      {erro && !desligar && (
        <p role="alert" className="text-sm text-destructive">
          {erro}
        </p>
      )}
      <Section
        title="Membros e acesso"
        description="Papéis concedem acesso ao sistema; qualificações profissionais são conferidas separadamente."
      >
        {q.isPending && <LoadingState />}
        {q.isError && <ErrorState error={q.error} onRetry={() => q.refetch()} />}
        {q.data?.rows.length === 0 && <EmptyState title="Nenhum membro neste recorte" />}
        <ul className="grid gap-3 xl:grid-cols-2">
          {q.data?.rows.map((m) => (
            <li key={m.id} className="min-w-0 space-y-3 rounded-lg border border-border p-4">
              <div className="flex flex-wrap items-start justify-between gap-2">
                <p className="min-w-0 break-words font-medium">{m.nome || m.email || m.user_id}</p>
                <ActionButton
                  variant="danger"
                  disabled={busy}
                  onClick={() => {
                    setDesligar({ user_id: m.user_id, nome: m.nome || m.email || m.user_id });
                    setMotivo("");
                    setErro(null);
                  }}
                >
                  Desligar acesso
                </ActionButton>
              </div>
              <fieldset disabled={busy} className="flex flex-wrap gap-2">
                <legend className="sr-only">Papéis de {m.nome || m.user_id}</legend>
                {PAPEIS.map((p) => {
                  const ativo = m.roles.some((r) => r.role === p);
                  return (
                    <button
                      type="button"
                      key={p}
                      aria-pressed={ativo}
                      onClick={() =>
                        command("papel", { user_id: m.user_id, role: p, habilitar: !ativo })
                      }
                      className={`min-h-11 rounded-md border px-3 text-sm ${ativo ? "border-primary text-primary" : "border-border text-muted-foreground"} disabled:opacity-50`}
                    >
                      {p}
                    </button>
                  );
                })}
              </fieldset>
              <button
                type="button"
                disabled={busy}
                aria-pressed={m.coordenacao}
                className="min-h-11 rounded border border-border px-3 text-sm disabled:opacity-50"
                onClick={() =>
                  command("coordenacao", { user_id: m.user_id, habilitar: !m.coordenacao })
                }
              >
                Coordenação operacional: {m.coordenacao ? "concedida" : "sem concessão"}
              </button>
            </li>
          ))}
        </ul>
        {q.data && <Pagination page={pagina} total={q.data.total} onChange={setPagina} />}
      </Section>
      <AdminVinculos />
      <OperationalDialog
        title={`Desligar acesso: ${desligar?.nome ?? ""}`}
        open={!!desligar}
        onOpenChange={(v) => {
          if (!v && !busy) setDesligar(null);
        }}
      >
        <form
          data-dirty={!!motivo}
          className="space-y-4"
          onSubmit={(e) => {
            e.preventDefault();
            if (desligar) void command("desligar", { user_id: desligar.user_id, motivo });
          }}
        >
          <p className="text-sm">
            O vínculo com esta organização e os papéis serão removidos. A conta, a pessoa
            operacional, as horas e a autoria histórica serão preservadas. Trabalhos futuros
            continuam atribuídos e precisam ser revisados pela coordenação.
          </p>
          <label className="block text-sm">
            Motivo *
            <textarea
              className={`${fieldClass} min-h-24`}
              value={motivo}
              onChange={(e) => setMotivo(e.target.value)}
              minLength={5}
              required
            />
          </label>
          {erro && (
            <p role="alert" className="text-sm text-destructive">
              {erro}
            </p>
          )}
          <ActionButton
            variant="danger"
            type="submit"
            disabled={motivo.trim().length < 5}
            loading={busy}
          >
            Confirmar desligamento
          </ActionButton>
        </form>
      </OperationalDialog>
    </div>
  );
}
