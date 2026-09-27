import { createFileRoute, Outlet, redirect } from "@tanstack/react-router";
import { useQueryClient } from "@tanstack/react-query";
import { useState } from "react";

import { supabase } from "@/integrations/supabase/client";
import { orgQueryKey, useOrg } from "@/features/org/session";
import { ErrorState, LoadingState } from "@/components/nexus/Page";

export const Route = createFileRoute("/_authenticated")({
  ssr: false,
  beforeLoad: async () => {
    const { data, error } = await supabase.auth.getUser();
    if (error || !data.user) throw redirect({ to: "/auth" });
    return { user: data.user };
  },
  component: Gate,
});

function Gate() {
  const org = useOrg();
  if (org.isPending) return <LoadingState />;
  if (org.isError) return <ErrorState error={org.error} onRetry={() => org.refetch()} />;
  if (!org.data) return <Onboarding />;
  return <Outlet />;
}

function Onboarding() {
  const qc = useQueryClient();
  const [nome, setNome] = useState("");
  const [erro, setErro] = useState<string | null>(null);
  const [salvando, setSalvando] = useState(false);
  const criar = async () => {
    if (nome.trim().length < 2) return setErro("Informe o nome da empresa.");
    setSalvando(true);
    const { error } = await supabase.rpc("criar_organizacao", { _nome: nome.trim() });
    setSalvando(false);
    if (error) return setErro(error.message);
    qc.invalidateQueries({ queryKey: orgQueryKey });
  };
  return (
    <div className="mx-auto mt-16 max-w-md rounded-lg border border-border bg-card p-6">
      <h1 className="text-lg font-semibold text-foreground">Configure sua organização</h1>
      <p className="mt-1 text-sm text-muted-foreground">
        Sua conta ainda não pertence a uma organização. Crie a organização proprietária dos dados (você será administrador) ou peça a um administrador para incluí-lo.
      </p>
      <input value={nome} onChange={(e) => setNome(e.target.value)} placeholder="Nome da empresa" className="mt-4 h-10 w-full rounded-md border border-input bg-background px-3 text-sm text-foreground" />
      {erro && <p className="mt-2 text-sm text-destructive">{erro}</p>}
      <button onClick={criar} disabled={salvando} className="mt-4 h-10 w-full rounded-md bg-primary text-sm font-medium text-primary-foreground disabled:opacity-60">
        {salvando ? "Criando…" : "Criar organização"}
      </button>
    </div>
  );
}
