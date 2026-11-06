import { Link, useNavigate, useRouterState } from "@tanstack/react-router";
import { useQueryClient } from "@tanstack/react-query";
import { ChevronDown, LogOut, Menu, Search, X } from "lucide-react";
import * as Dialog from "@radix-ui/react-dialog";

import { supabase } from "@/integrations/supabase/client";
import { useOrg, useSessionUser } from "@/features/org/session";
import { useEffect, useRef, useState, type ReactNode } from "react";
import { ArrowLeft, ArrowLeftRight } from "lucide-react";
import { useShellContext, type ShellContext } from "./shell-context";

import { destinoInicial, menusVisiveis, navGroups } from "@/lib/nexus-nav";
import { cn } from "@/lib/utils";
import { NexusLogo } from "./NexusLogo";

function Brand() {
  const org = useOrg();
  const inicio = destinoInicial(org.data?.roles ?? [], org.data?.capabilities);
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
  const grupos = org.data ? menusVisiveis(org.data.roles, org.data.capabilities) : [];
  const [busca, setBusca] = useState("");
  const [expanded, setExpanded] = useState<Record<string, boolean>>({});
  const matches = (value: string) =>
    value
      .normalize("NFD")
      .replace(/[\u0300-\u036f]/g, "")
      .toLowerCase();
  const activeRoute = (to: string) =>
    to === "/" ? pathname === "/" : pathname === to || pathname.startsWith(`${to}/`);
  const filtered = grupos
    .map((g) => ({
      ...g,
      items: g.items.filter((i) => matches(`${i.label} ${i.hint}`).includes(matches(busca.trim()))),
    }))
    .filter((g) => g.items.length);

  return (
    <nav aria-label="Navegação principal" className="nx-sidebar-nav flex-1 overflow-y-auto">
      <label className="nx-nav-search">
        <Search size={16} aria-hidden="true" />
        <span className="sr-only">Buscar funcionalidade</span>
        <input
          value={busca}
          onChange={(e) => setBusca(e.target.value)}
          placeholder="Buscar funcionalidade"
          type="search"
        />
      </label>
      {!filtered.length && (
        <p className="px-4 py-3 text-sm text-sidebar-foreground">
          Nenhuma função encontrada para este perfil.
        </p>
      )}
      {filtered.map((group) => {
        const active = group.items.some((i) => activeRoute(i.to));
        const open =
          !!busca.trim() || (expanded[group.label] ?? (active || group.label === "Visão geral"));
        const regionId = `nav-${group.label.replace(/\s+/g, "-")}`;
        return (
          <div key={group.label}>
            <button
              type="button"
              className="nx-nav-group-label nx-nav-group-toggle"
              aria-expanded={open}
              aria-controls={regionId}
              onClick={() => setExpanded((prev) => ({ ...prev, [group.label]: !open }))}
            >
              {group.label}
              <ChevronDown size={14} aria-hidden="true" className={open ? "" : "-rotate-90"} />
            </button>
            <ul id={regionId} className="space-y-1" hidden={!open && !active}>
              {group.items
                .filter((item) => open || activeRoute(item.to))
                .map((item) => {
                  const active = activeRoute(item.to);
                  const Icon = item.icon;
                  return (
                    <li key={item.to}>
                      <Link
                        to={item.to}
                        onClick={onNavigate}
                        aria-current={active ? "page" : undefined}
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
        );
      })}
    </nav>
  );
}

export function AppShell({ children }: { children: ReactNode }) {
  const [open, setOpen] = useState(false);
  const pathname = useRouterState({ select: (s) => s.location.pathname });
  const operational = true;
  const area =
    navGroups
      .flatMap((group) => group.items)
      .find(
        (item) => item.to !== "/" && (pathname === item.to || pathname.startsWith(`${item.to}/`)),
      )?.label ?? "Operação";
  const registered = useShellContext();
  const mapCtx = registered?.path === pathname ? registered : null;
  const headerRef = useRef<HTMLElement>(null);
  useEffect(() => {
    const el = headerRef.current;
    if (!el || typeof ResizeObserver === "undefined") return;
    const sync = () =>
      document.documentElement.style.setProperty("--nx-topbar-h", `${el.offsetHeight}px`);
    sync();
    const ro = new ResizeObserver(sync);
    ro.observe(el);
    return () => ro.disconnect();
  });
  if (pathname === "/mapas-3d" || pathname === "/auth") return <main>{children}</main>;

  return (
    <div
      className={cn(
        "nx-app-shell nx-stable-frame nexus-operational nx-shell min-h-screen bg-background",
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
          ref={headerRef}
          data-context={mapCtx ? "map" : undefined}
          className={cn(
            "nx-topbar sticky top-0 z-30 flex items-center gap-3 border-b border-border px-4 md:px-6",
            mapCtx ? "nx-topbar-map min-h-14" : "h-16",
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
          {mapCtx ? (
            <MapContextBar ctx={mapCtx} />
          ) : (
            operational && (
              <div className="nx-area-label">
                <span>Workspace</span>
                <strong>{area}</strong>
              </div>
            )
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

function MapContextBar({ ctx }: { ctx: ShellContext }) {
  return (
    <div className="nx-mapctx">
      <Link
        to={ctx.back.to}
        search={ctx.back.search as never}
        className="nx-mapctx-back"
        aria-label={ctx.back.label}
        title={ctx.back.label}
      >
        <ArrowLeft aria-hidden="true" size={18} />
      </Link>
      <div className="nx-mapctx-cards" role="group" aria-label="Contexto do mapa">
        <span className="nx-mapctx-area">Workspace</span>
        <ContextCard label="Norma" short={ctx.normaCodigo} value={ctx.normaNome} />
        <ContextCard label="Cliente" value={ctx.cliente} />
        <ContextCard label="Unidade" value={ctx.unidade} grow />
      </div>
      <Link
        to={ctx.switchNorma.to}
        search={ctx.switchNorma.search as never}
        className="nx-mapctx-switch"
        aria-label={ctx.switchNorma.label}
        title={ctx.switchNorma.label}
      >
        <ArrowLeftRight aria-hidden="true" size={15} />
        <span>{ctx.switchNorma.label.replace(/^Alternar mapa para /, "")}</span>
      </Link>
    </div>
  );
}

function ContextCard({
  label,
  value,
  short,
  grow,
}: {
  label: string;
  value: string;
  short?: string;
  grow?: boolean;
}) {
  // A <details> keeps the full value reachable by touch and keyboard when truncated.
  return (
    <details className={cn("nx-mapctx-card", grow && "nx-mapctx-grow")}>
      <summary aria-label={`${label}: ${value}`}>
        <small>{label}</small>
        <strong>
          {short ? (
            <>
              <span className="nx-mapctx-short">{short}</span>
              <span className="nx-mapctx-long">{value}</span>
            </>
          ) : (
            value
          )}
        </strong>
      </summary>
      <p role="note">{value}</p>
    </details>
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
