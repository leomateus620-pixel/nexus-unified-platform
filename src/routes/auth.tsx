import { createFileRoute, useNavigate } from "@tanstack/react-router";
import { useForm } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import { z } from "zod";
import { useEffect, useState } from "react";

import { supabase } from "@/integrations/supabase/client";
import { lovable } from "@/integrations/lovable/index";

export const Route = createFileRoute("/auth")({
  head: () => ({
    meta: [
      { title: "Entrar — Sistema Nexus" },
      { name: "description", content: "Acesso ao Sistema Nexus de orçamentos, compras e produção." },
      { property: "og:title", content: "Entrar — Sistema Nexus" },
      { property: "og:description", content: "Acesso ao Sistema Nexus." },
    ],
  }),
  component: AuthPage,
});

const schema = z.object({
  email: z.string().trim().email("E-mail inválido"),
  senha: z.string().min(8, "Mínimo de 8 caracteres"),
});

function AuthPage() {
  const navigate = useNavigate();
  const [modo, setModo] = useState<"entrar" | "cadastrar">("entrar");
  const [msg, setMsg] = useState<string | null>(null);
  const [erro, setErro] = useState<string | null>(null);
  const form = useForm<z.infer<typeof schema>>({ resolver: zodResolver(schema), defaultValues: { email: "", senha: "" } });

  useEffect(() => {
    supabase.auth.getUser().then(({ data }) => {
      if (data.user) navigate({ to: "/", replace: true });
    });
  }, [navigate]);

  const onSubmit = form.handleSubmit(async ({ email, senha }) => {
    setErro(null);
    setMsg(null);
    if (modo === "entrar") {
      const { error } = await supabase.auth.signInWithPassword({ email, password: senha });
      if (error) return setErro(error.message === "Invalid login credentials" ? "E-mail ou senha incorretos." : error.message);
      navigate({ to: "/", replace: true });
    } else {
      const { error } = await supabase.auth.signUp({ email, password: senha, options: { emailRedirectTo: window.location.origin } });
      if (error) return setErro(error.message);
      setMsg("Enviamos um link de confirmação para o seu e-mail.");
    }
  });

  const google = async () => {
    setErro(null);
    const r = await lovable.auth.signInWithOAuth("google", { redirect_uri: window.location.origin });
    if (r.error) return setErro("Não foi possível entrar com Google.");
    if (r.redirected) return;
    navigate({ to: "/", replace: true });
  };

  const input = "h-10 w-full rounded-md border border-input bg-card px-3 text-sm text-foreground outline-none focus:border-primary";
  return (
    <div className="flex min-h-screen items-center justify-center bg-background px-4">
      <div className="w-full max-w-sm rounded-lg border border-border bg-card p-6">
        <p className="font-display text-2xl font-extrabold tracking-[0.18em] text-foreground">NEXUS</p>
        <h1 className="mt-4 text-lg font-semibold text-foreground">{modo === "entrar" ? "Entrar" : "Criar conta"}</h1>
        <form onSubmit={onSubmit} className="mt-4 space-y-3" noValidate>
          <label className="block text-xs text-muted-foreground">
            E-mail
            <input type="email" autoComplete="email" className={input} {...form.register("email")} />
            {form.formState.errors.email && <span className="text-destructive">{form.formState.errors.email.message}</span>}
          </label>
          <label className="block text-xs text-muted-foreground">
            Senha
            <input type="password" autoComplete={modo === "entrar" ? "current-password" : "new-password"} className={input} {...form.register("senha")} />
            {form.formState.errors.senha && <span className="text-destructive">{form.formState.errors.senha.message}</span>}
          </label>
          {erro && <p role="alert" className="text-sm text-destructive">{erro}</p>}
          {msg && <p className="text-sm text-primary">{msg}</p>}
          <button type="submit" disabled={form.formState.isSubmitting} className="h-10 w-full rounded-md bg-primary text-sm font-medium text-primary-foreground disabled:opacity-60">
            {form.formState.isSubmitting ? "Aguarde…" : modo === "entrar" ? "Entrar" : "Criar conta"}
          </button>
        </form>
        <button onClick={google} className="mt-3 h-10 w-full rounded-md border border-border text-sm text-foreground hover:bg-accent">
          Continuar com Google
        </button>
        <button onClick={() => setModo(modo === "entrar" ? "cadastrar" : "entrar")} className="mt-4 w-full text-xs text-muted-foreground underline">
          {modo === "entrar" ? "Não tem conta? Criar conta" : "Já tem conta? Entrar"}
        </button>
      </div>
    </div>
  );
}
