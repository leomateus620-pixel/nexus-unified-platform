import { Link, useNavigate, useRouterState } from "@tanstack/react-router";
import { useQueryClient } from "@tanstack/react-query";
import { LogOut, Menu, X } from "lucide-react";
import * as Dialog from "@radix-ui/react-dialog";

import { supabase } from "@/integrations/supabase/client";
import { useOrg, useSessionUser } from "@/features/org/session";
import { useState, type ReactNode } from "react";

import { destinoInicial, menusVisiveis, navGroups } from "@/lib/nexus-nav";
import { cn } from "@/lib/utils";
import { NexusLogo } from "./NexusLogo";

function Brand() {
  const org = useOrg();
  const inicio = destinoInicial(org.data?.roles ?? []);
  return (
    <Link to={inicio} className="nx-brand">
      <NexusLogo className="text-3xl" />
      <span>
        Tecnologia em Segurança
        <br />
        para o Agroindustrial
      </span>
    </Link>
  );
}

function SidebarNav({ onNavigate }: { onNavigate?: () => void }) {
  const pathname = useRouterState({ select: (s) => s.location.pathname });
  const org = useOrg();
  const grupos = org.data ? menusVisiveis(org.data.roles) : navGroups;

  return (
    <nav
      aria-label="Navegação principal"
      className="nx-sidebar-nav flex-1 overflow-y-auto"
    >
      {grupos.map((group) => (
        <div key={group.label}>
          <p className="nx-nav-group-label">
            {group.label}
          </p>
          <ul className="space-y-1">
            {group.items.map((item) => {
              const active = item.to === "/" ? pathname === "/" : pathname.startsWith(item.to);
              const Icon = item.icon;
              return (
                <li key={item.to}>
                  <Link
                    to={item.to}
                    onClick={onNavigate}
                    className={cn(
                      "nx-nav-link group flex items-center gap-3",
                      active
                        ? "nx-nav-link-active"
                        : "text-sidebar-foreground/70 hover:bg-sidebar-accent/50 hover:text-primary",
                    )}
                  >
                    <Icon
                      className={cn(
                        "size-4 shrink-0",
                        active ? "text-primary" : "text-muted-foreground",
                      )}
                    />
                    <span className="truncate">{item.label}</span>
                  </Link>
                </li>
              );
            })}
          </ul>
        </div>
      ))}
    </nav>
  );
}

export function AppShell({ children }: { children: ReactNode }) {
  const [open, setOpen] = useState(false);
  const pathname = useRouterState({ select: (s) => s.location.pathname });
  const operational =
    /^\/(comercial|clientes|produtos|projetos|compras)(\/|$)/.test(pathname) ||
    pathname === "/configuracoes/orcamentos" ||
    pathname === "/engenharia/dimensionamentos";
  const area =
    navGroups
      .flatMap((group) => group.items)
      .find((item) => item.to !== "/" && pathname.startsWith(item.to))?.label ?? "Operação";
  if (pathname === "/mapas-3d" || pathname === "/auth") return <main>{children}</main>;

  return (
    <div
      className={cn(
        "nx-app-shell nexus-operational nx-shell min-h-screen bg-background",
        (/\/revisoes\//.test(pathname) || /\/compras\/ordens-(compra|producao)\//.test(pathname)) &&
          "nx-catalog-shell",
      )}
    >
      {operational && (
        <a className="nx-skip" href="#nexus-content">
          Ir para o conteúdo
        </a>
      )}
      <aside className="nx-sidebar fixed inset-y-0 left-0 z-40 hidden w-64 flex-col border-r border-sidebar-border bg-sidebar lg:flex">
        <Brand />
        <SidebarNav />
      </aside>

      <div className="nx-shell-content lg:pl-64">
        <header
          className={cn(
            "nx-topbar sticky top-0 z-30 flex h-16 items-center gap-3 border-b border-border px-4 md:px-6",
            operational ? "bg-background" : "bg-background/90 backdrop-blur",
          )}
        >
          <Dialog.Root open={open} onOpenChange={setOpen}>
            <Dialog.Trigger asChild>
              <button className="nx-menu-trigger lg:hidden" aria-label="Abrir menu">
                <Menu aria-hidden="true" size={20} />
              </button>
            </Dialog.Trigger>
            <Dialog.Portal>
              <Dialog.Overlay className="nx-menu-overlay" />
              <Dialog.Content className="nx-mobile-menu" aria-describedby={undefined}>
                <Dialog.Title className="sr-only">Navegação NEXUS</Dialog.Title>
                <Brand />
                <Dialog.Close className="nx-menu-close" aria-label="Fechar menu">
                  <X aria-hidden="true" size={20} />
                </Dialog.Close>
                <SidebarNav onNavigate={() => setOpen(false)} />
              </Dialog.Content>
            </Dialog.Portal>
          </Dialog.Root>
          {operational && (
            <div className="nx-area-label">
              <span>Workspace</span>
              <strong>{area}</strong>
            </div>
          )}
          <UserArea />
        </header>

        <main id="nexus-content" tabIndex={-1} className="nx-main px-4 py-6 md:px-6 lg:px-8">
          {children}
        </main>
      </div>
    </div>
  );
}

function UserArea() {
  const user = useSessionUser();
  const org = useOrg();
  const qc = useQueryClient();
  const navigate = useNavigate();
  if (user === undefined) return <div className="ml-auto" />;
  if (!user)
    return (
      <Link
        to="/auth"
        className="ml-auto rounded-md border border-border px-3 py-1.5 text-xs text-foreground"
      >
        Entrar
      </Link>
    );
  const sair = async () => {
    await qc.cancelQueries();
    qc.clear();
    await supabase.auth.signOut();
    navigate({ to: "/auth", replace: true });
  };
  const email = user.email ?? "";
  return (
    <div className="ml-auto flex items-center gap-3">
      <div className="hidden text-right text-xs leading-tight sm:block">
        <p className="font-medium text-foreground">{email}</p>
        <p className="text-muted-foreground">
          {org.data ? `${org.data.orgNome} · ${org.data.roles.join(", ") || "sem papel"}` : "—"}
        </p>
      </div>
      <div className="flex size-8 items-center justify-center rounded-full bg-primary text-xs font-bold uppercase text-primary-foreground">
        {email.slice(0, 2)}
      </div>
      <button
        onClick={sair}
        aria-label="Sair"
        className="rounded-md border border-border p-2 text-muted-foreground hover:text-foreground"
      >
        <LogOut className="size-4" />
      </button>
    </div>
  );
}
