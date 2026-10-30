import { createFileRoute, redirect, Link } from "@tanstack/react-router";
import { useState } from "react";
import { supabase } from "@/integrations/supabase/client";
import { Button } from "@/components/ui/button";
import { NexusLogo } from "@/components/nexus/NexusLogo";

export const Route = createFileRoute("/.lovable/oauth/consent")({
  ssr: false,
  validateSearch: (s: Record<string, unknown>) => ({ authorization_id: typeof s.authorization_id === "string" ? s.authorization_id : "" }),
  head: () => ({ meta: [
    { title: "Autorizar agente — Nexus" },
    { name: "description", content: "Autorize um agente a consultar o Nexus com as permissões da sua conta." },
    { property: "og:title", content: "Autorizar agente — Nexus" },
    { property: "og:description", content: "Conexão protegida de agentes ao Nexus." },
    { property: "og:type", content: "website" }, { name: "twitter:card", content: "summary" },
  ] }),
  beforeLoad: async ({ search, location }) => {
    if (!search.authorization_id) throw new Error("Solicitação de autorização ausente. Inicie a conexão novamente no agente.");
    const { data, error } = await supabase.auth.getSession();
    if (error) throw new Error("Não foi possível verificar sua sessão.");
    if (!data.session) throw redirect({ to: "/auth", search: { next: location.pathname + location.searchStr + location.hash } });
  },
  loader: async ({ location }) => {
    const id = new URLSearchParams(location.searchStr).get("authorization_id");
    if (!id) throw new Error("Solicitação de autorização ausente.");
    const { data, error } = await supabase.auth.oauth.getAuthorizationDetails(id);
    if (error) throw new Error("Solicitação inválida ou expirada. Inicie a conexão novamente no agente.");
    if (data && "redirect_url" in data && data.redirect_url) throw redirect({ href: data.redirect_url });
    const { data: session } = await supabase.auth.getSession();
    return { details: data, email: session.session?.user.email };
  },
  pendingComponent: () => <main className="p-8 text-foreground">Verificando autorização…</main>,
  errorComponent: ({ error }) => <main className="mx-auto flex min-h-screen max-w-lg flex-col justify-center gap-6 px-6"><NexusLogo /><h1 className="font-display text-2xl">Conexão não disponível</h1><p role="alert">{error.message}</p><Button asChild variant="outline"><Link to="/auth" search={{ next: "/" }}>Voltar ao acesso</Link></Button></main>,
  component: Consent,
});

function Consent() {
  const { details, email } = Route.useLoaderData();
  const { authorization_id } = Route.useSearch();
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const client = details && "client" in details ? details.client : null;
  const scopes = details && "scope" in details ? details.scope.split(" ").filter(Boolean) : [];
  async function decide(approve: boolean) {
    setBusy(true); setError(null);
    try {
      const result = approve ? await supabase.auth.oauth.approveAuthorization(authorization_id) : await supabase.auth.oauth.denyAuthorization(authorization_id);
      if (result.error) throw new Error("Não foi possível concluir sua decisão. Tente novamente.");
      if (!result.data?.redirect_url) throw new Error("O agente não informou um destino de retorno.");
      window.location.assign(result.data.redirect_url);
    } catch (e) { setError(e instanceof Error ? e.message : "Falha na autorização."); setBusy(false); }
  }
  return <main className="mx-auto flex min-h-screen max-w-lg flex-col justify-center gap-6 px-6 py-10 text-foreground">
    <NexusLogo className="text-3xl" />
    <h1 className="font-display text-2xl font-semibold">Conectar {client?.name ?? "agente"} ao Nexus</h1>
    <p className="text-sm text-muted-foreground">Conta: {email ?? "Usuário autenticado"}</p>
    {client?.uri && <p className="break-all text-sm text-muted-foreground">Aplicativo: {client.uri}</p>}
    <p>Este agente poderá consultar organizações, produtos e propostas usando sua conta.</p>
    <ul className="space-y-2 text-sm">{scopes.map(scope => <li key={scope}>{({ openid: "Identificar sua conta", email: "Compartilhar seu e-mail", profile: "Compartilhar seu perfil básico" } as Record<string, string>)[scope] ?? `Permissão adicional solicitada: ${scope}`}</li>)}</ul>
    <p className="text-sm text-muted-foreground">As permissões do Nexus continuam valendo. Esta conexão não altera registros nem emite ordens.</p>
    {error && <p role="alert" className="text-destructive">{error}</p>}
    <div className="flex flex-wrap gap-3"><Button disabled={busy} onClick={() => decide(true)}>{busy ? "Aguarde…" : "Permitir conexão"}</Button><Button disabled={busy} variant="outline" onClick={() => decide(false)}>Cancelar conexão</Button></div>
    <Button variant="ghost" disabled={busy} onClick={async () => {
      const { error } = await supabase.auth.signOut();
      if (error) { setError("Não foi possível trocar a conta."); return; }
      window.location.assign(`/auth?next=${encodeURIComponent(window.location.pathname + window.location.search)}`);
    }}>Entrar com outra conta</Button>
  </main>;
}