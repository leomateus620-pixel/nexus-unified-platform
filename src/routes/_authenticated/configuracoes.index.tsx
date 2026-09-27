import { createFileRoute } from "@tanstack/react-router";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { useState } from "react";

import { EmptyState, PageHeader, QueryView, Section } from "@/components/nexus/Page";
import { supabase } from "@/integrations/supabase/client";
import { useOrg } from "@/features/org/session";

export const Route = createFileRoute("/_authenticated/configuracoes/")({
  head: () => ({
    meta: [
      { title: "Configurações — Sistema Nexus" },
      { name: "description", content: "Usuários, papéis e parâmetros da organização." },
      { property: "og:title", content: "Configurações — Sistema Nexus" },
      { property: "og:description", content: "Usuários e permissões." },
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
  const q = useQuery({
    queryKey: ["membros", orgId],
    enabled: !!orgId,
    queryFn: async () => {
      const [m, r] = await Promise.all([
        supabase.from("memberships").select("id,user_id,nome,email").eq("organization_id", orgId),
        supabase.from("user_roles").select("id,user_id,role").eq("organization_id", orgId),
      ]);
      if (m.error) throw m.error;
      if (r.error) throw r.error;
      return m.data.map((x) => ({ ...x, roles: r.data.filter((y) => y.user_id === x.user_id) }));
    },
  });
  const toggle = async (userId: string, role: (typeof PAPEIS)[number], atual?: string) => {
    setErro(null);
    const res = atual
      ? await supabase.from("user_roles").delete().eq("id", atual)
      : await supabase.from("user_roles").insert({ organization_id: orgId, user_id: userId, role });
    if (res.error) return setErro(res.error.message);
    qc.invalidateQueries({ queryKey: ["membros", orgId] });
  };
  return (
    <div className="space-y-4">
      <PageHeader eyebrow="Configurações" title={`Organização: ${org.data?.orgNome ?? "—"}`} description="Papéis definem acesso a custos, margens, aprovações e ordens. A organização proprietária não se confunde com clientes." />
      {erro && <p className="text-sm text-destructive">{erro}</p>}
      <Section title="Membros e papéis" description={org.data?.isAdmin ? "Clique em um papel para conceder ou remover." : "Somente administradores alteram papéis."}>
        <QueryView query={q} empty={<EmptyState title="Nenhum membro" />}>
          {(rows) => (
            <table className="w-full text-sm">
              <tbody>
                {rows.map((m) => (
                  <tr key={m.id} className="border-b border-border/60">
                    <td className="py-2">{m.nome ?? m.email ?? m.user_id}</td>
                    <td className="flex flex-wrap gap-1 py-2">
                      {PAPEIS.map((p) => {
                        const r = m.roles.find((x) => x.role === p);
                        return (
                          <button key={p} disabled={!org.data?.isAdmin} onClick={() => toggle(m.user_id, p, r?.id)} className={`rounded-full border px-2 py-0.5 text-xs ${r ? "border-primary/50 bg-primary/10 text-primary" : "border-border text-muted-foreground"} disabled:cursor-default`}>
                            {p}
                          </button>
                        );
                      })}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          )}
        </QueryView>
        <p className="mt-3 text-xs text-muted-foreground">Convite de novos usuários por e-mail ainda não está disponível: o usuário cria a conta e um administrador o inclui.</p>
      </Section>
    </div>
  );
}
