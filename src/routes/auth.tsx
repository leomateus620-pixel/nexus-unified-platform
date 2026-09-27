// ============= Full file contents =============
import { createFileRoute, useNavigate } from "@tanstack/react-router";
import { useForm } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import { z } from "zod";
import { useEffect, useState } from "react";
import { AlertCircle, ArrowRight, Eye, EyeOff, Lock, Mail } from "lucide-react";

import { supabase } from "@/integrations/supabase/client";
import { lovable } from "@/integrations/lovable/index";
import nexusLogo from "@/assets/nexus-logo.png";
import authArtAsset from "@/assets/auth-art.png.asset.json";

export const Route = createFileRoute("/auth")({
  head: () => ({
    meta: [
      { title: "Entrar — Sistema Nexus" },
      {
        name: "description",
        content: "Acesso ao Sistema Nexus de orçamentos, compras e produção.",
      },
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

const fieldIcon =
  "pointer-events-none absolute inset-y-0 left-0 flex items-center pl-4 text-muted-foreground/70 transition-colors group-focus-within:text-primary";
const fieldInput =
  "h-12 w-full rounded-xl border border-border bg-background/60 pl-12 pr-4 text-sm text-foreground placeholder:text-muted-foreground/50 outline-none transition-colors focus:border-primary focus:ring-2 focus:ring-primary/25";

function AuthPage() {
  const navigate = useNavigate();
  const [modo, setModo] = useState<"entrar" | "cadastrar">("entrar");
  const [msg, setMsg] = useState<string | null>(null);
  const [erro, setErro] = useState<string | null>(null);
  const [verSenha, setVerSenha] = useState(false);
  const form = useForm<z.infer<typeof schema>>({
    resolver: zodResolver(schema),
    defaultValues: { email: "", senha: "" },
  });

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
      if (error)
        return setErro(
          error.message === "Invalid login credentials"
            ? "E-mail ou senha incorretos."
            : error.message,
        );
      navigate({ to: "/", replace: true });
    } else {
      const { error } = await supabase.auth.signUp({
        email,
        password: senha,
        options: { emailRedirectTo: window.location.origin },
      });
      if (error) return setErro(error.message);
      setMsg("Enviamos um link de confirmação para o seu e-mail.");
    }
  });

  const google = async () => {
    setErro(null);
    const r = await lovable.auth.signInWithOAuth("google", {
      redirect_uri: window.location.origin,
    });
    if (r.error) return setErro("Não foi possível entrar com Google.");
    if (r.redirected) return;
    navigate({ to: "/", replace: true });
  };

  return (
    <div className="relative flex min-h-screen items-center justify-center overflow-hidden bg-background px-4 py-8">
      {/* Glow de fundo */}
      <div
        aria-hidden
        className="pointer-events-none absolute -top-32 left-1/2 h-96 w-[42rem] -translate-x-1/2 rounded-full bg-primary/10 blur-[120px]"
      />
      <div
        aria-hidden
        className="pointer-events-none absolute -bottom-40 right-0 h-80 w-[32rem] rounded-full bg-primary/5 blur-[110px]"
      />

      <div className="relative z-10 grid w-full max-w-5xl overflow-hidden rounded-3xl border border-border/60 bg-card/70 shadow-2xl backdrop-blur-xl md:grid-cols-2">
        {/* Lado da marca */}
        <div className="relative hidden md:block">
          <img
            src={authArtAsset.url}
            alt="NEXUS — Tecnologia em Segurança para o Agroindustrial"
            className="absolute inset-0 h-full w-full object-cover object-left-top"
          />
          <div
            aria-hidden
            className="absolute inset-0 bg-gradient-to-t from-background/60 via-transparent to-background/20"
          />
          <div
            aria-hidden
            className="absolute inset-y-0 right-0 w-24 bg-gradient-to-l from-background/40 to-transparent"
          />
        </div>

        {/* Lado do formulário */}
        <div className="flex flex-col justify-center bg-white/5 px-7 py-10 sm:px-10 md:px-12 md:py-14">
          <img
            src={nexusLogo}
            alt="NEXUS"
            width={951}
            height={188}
            loading="eager"
            className="h-9 w-auto self-center md:self-start"
          />

          <h1 className="mt-8 font-display text-2xl font-bold tracking-tight text-foreground">
            {modo === "entrar" ? "Acesso ao sistema" : "Criar sua conta"}
          </h1>
          <p className="mt-1 text-sm text-muted-foreground">
            {modo === "entrar"
              ? "Identifique-se para continuar gerenciando sua operação."
              : "Informe seus dados para criar a primeira credencial de acesso."}
          </p>

          <form onSubmit={onSubmit} className="mt-8 space-y-5" noValidate>
            <div className="space-y-2">
              <label
                htmlFor="auth-email"
                className="ml-1 block text-[10px] font-semibold uppercase tracking-[0.2em] text-muted-foreground"
              >
                E-mail
              </label>
              <div className="group relative">
                <span className={fieldIcon}>
                  <Mail className="h-5 w-5" aria-hidden />
                </span>
                <input
                  id="auth-email"
                  type="email"
                  autoComplete="email"
                  className={fieldInput}
                  {...form.register("email")}
                />
              </div>
              {form.formState.errors.email && (
                <p className="flex items-center gap-1.5 text-xs text-destructive">
                  <AlertCircle className="h-3.5 w-3.5" aria-hidden />
                  {form.formState.errors.email.message}
                </p>
              )}
            </div>

            <div className="space-y-2">
              <label
                htmlFor="auth-senha"
                className="ml-1 block text-[10px] font-semibold uppercase tracking-[0.2em] text-muted-foreground"
              >
                Senha
              </label>
              <div className="group relative">
                <span className={fieldIcon}>
                  <Lock className="h-5 w-5" aria-hidden />
                </span>
                <input
                  id="auth-senha"
                  type={verSenha ? "text" : "password"}
                  autoComplete={modo === "entrar" ? "current-password" : "new-password"}
                  className={`${fieldInput} pr-11`}
                  {...form.register("senha")}
                />
                <button
                  type="button"
                  onClick={() => setVerSenha((v) => !v)}
                  aria-label={verSenha ? "Ocultar senha" : "Mostrar senha"}
                  className="absolute inset-y-0 right-0 flex items-center pr-4 text-muted-foreground/70 transition-colors hover:text-foreground"
                >
                  {verSenha ? <EyeOff className="h-5 w-5" aria-hidden /> : <Eye className="h-5 w-5" aria-hidden />}
                </button>
              </div>
              {form.formState.errors.senha && (
                <p className="flex items-center gap-1.5 text-xs text-destructive">
                  <AlertCircle className="h-3.5 w-3.5" aria-hidden />
                  {form.formState.errors.senha.message}
                </p>
              )}
            </div>

            {erro && (
              <p
                role="alert"
                className="flex items-start gap-2 rounded-lg border border-destructive/40 bg-destructive/10 px-3 py-2.5 text-sm text-destructive"
              >
                <AlertCircle className="mt-0.5 h-4 w-4 shrink-0" aria-hidden />
                {erro}
              </p>
            )}
            {msg && (
              <p className="rounded-lg border border-primary/40 bg-primary/10 px-3 py-2.5 text-sm text-primary">
                {msg}
              </p>
            )}

            <button
              type="submit"
              disabled={form.formState.isSubmitting}
              className="group flex h-12 w-full items-center justify-center gap-2.5 rounded-xl bg-primary font-display text-sm font-bold uppercase tracking-wider text-primary-foreground shadow-[0_8px_24px_-8px] shadow-primary/50 transition-all hover:shadow-[0_12px_28px_-8px] hover:shadow-primary/60 disabled:cursor-not-allowed disabled:opacity-60"
            >
              {form.formState.isSubmitting
                ? "Aguarde…"
                : modo === "entrar"
                  ? "Entrar"
                  : "Criar conta"}
              {!form.formState.isSubmitting && (
                <ArrowRight
                  className="h-4.5 w-4.5 transition-transform group-hover:translate-x-0.5"
                  aria-hidden
                />
              )}
            </button>

            <div className="relative py-2">
              <div className="absolute inset-0 flex items-center" aria-hidden>
                <div className="w-full border-t border-border/70" />
              </div>
              <div className="relative flex justify-center">
                <span className="bg-card px-4 text-[10px] font-semibold uppercase tracking-[0.2em] text-muted-foreground">
                  ou
                </span>
              </div>
            </div>

            <button
              type="button"
              onClick={google}
              className="flex h-12 w-full items-center justify-center gap-3 rounded-xl border border-border bg-background/50 text-sm font-medium text-foreground transition-colors hover:bg-accent"
            >
              <svg className="h-5 w-5" viewBox="0 0 24 24" aria-hidden>
                <path
                  fill="#4285F4"
                  d="M22.56 12.25c0-.78-.07-1.53-.2-2.25H12v4.26h5.92c-.26 1.37-1.04 2.53-2.21 3.31v2.77h3.57c2.08-1.92 3.28-4.74 3.28-8.09z"
                />
                <path
                  fill="#34A853"
                  d="M12 23c2.97 0 5.46-.98 7.28-2.66l-3.57-2.77c-.98.66-2.23 1.06-3.71 1.06-2.86 0-5.29-1.93-6.16-4.53H2.18v2.84C3.99 20.53 7.7 23 12 23z"
                />
                <path
                  fill="#FBBC05"
                  d="M5.84 14.09c-.22-.66-.35-1.36-.35-2.09s.13-1.43.35-2.09V7.07H2.18C1.43 8.55 1 10.22 1 12s.43 3.45 1.18 4.93l3.66-2.84z"
                />
                <path
                  fill="#EA4335"
                  d="M12 5.38c1.62 0 3.06.56 4.21 1.66l3.15-3.15C17.45 2.09 14.97 1 12 1 7.7 1 3.99 3.47 2.18 7.07l3.66 2.84c.87-2.6 3.3-4.53 6.16-4.53z"
                />
              </svg>
              Continuar com Google
            </button>
          </form>

          <button
            onClick={() => {
              setModo(modo === "entrar" ? "cadastrar" : "entrar");
              setErro(null);
              setMsg(null);
            }}
            className="mt-8 w-full text-center text-sm text-muted-foreground transition-colors hover:text-foreground"
          >
            {modo === "entrar" ? (
              <>
                Não tem conta?{" "}
                <span className="font-semibold text-primary underline-offset-4 hover:underline">
                  Criar conta
                </span>
              </>
            ) : (
              <>
                Já tem conta?{" "}
                <span className="font-semibold text-primary underline-offset-4 hover:underline">
                  Entrar
                </span>
              </>
            )}
          </button>
        </div>
      </div>
    </div>
  );
}
