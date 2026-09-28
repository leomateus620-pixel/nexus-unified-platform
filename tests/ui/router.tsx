/* eslint-disable react-refresh/only-export-components -- Test-only router boundary exports helpers and components together. */
import { createContext, useContext, useSyncExternalStore } from "react";

export const OutletContext = createContext(null);
export const Outlet = () => useContext(OutletContext);
const listeners = new Set<() => void>();
let search = {};
const params = {
  revisaoId: "rev-fixture",
  propostaId: "proposal-fixture",
  ordemId: "order-fixture",
  projetoId: "project-fixture",
};
const page = new URLSearchParams(location.search).get("page") || "dimensionamento";
const pathname =
  page === "list"
    ? "/comercial/propostas"
    : page === "oc"
      ? "/compras/ordens-compra/order-fixture"
      : page === "op"
        ? "/compras/ordens-producao/order-fixture"
        : `/comercial/propostas/proposal-fixture/revisoes/rev-fixture/${page}`;
export function useNavigate() {
  return (opts) => {
    if (opts.search) {
      search = typeof opts.search === "function" ? opts.search(search) : opts.search;
      listeners.forEach((l) => l());
    }
    window.__nexusNavigations.push(opts);
  };
}
export function useRouterState({ select }) {
  return select({ location: { pathname } });
}
export function useBlocker() {
  return { status: "idle", reset: () => {}, proceed: () => {} };
}
export const createFileRoute = (path) => (options) => ({
  options,
  fullPath: path,
  useParams: () => params,
  useSearch: () =>
    useSyncExternalStore(
      (l) => {
        listeners.add(l);
        return () => listeners.delete(l);
      },
      () => search,
    ),
});
export function Link({
  to,
  params: p = {},
  children,
  activeProps,
  inactiveProps,
  activeOptions,
  search: _search,
  preload,
  className,
  ...props
}) {
  const href = to.replace(/\$([\w]+)/g, (_, key) => p[key] || key);
  const active =
    pathname === href || (href !== "/" && pathname.startsWith(href) && !href.includes("revisoes"));
  const state = active ? activeProps : inactiveProps;
  return (
    <a
      {...props}
      {...state}
      href={href}
      aria-current={active ? "page" : undefined}
      className={[className, state?.className].filter(Boolean).join(" ")}
      onClick={(event) => {
        event.preventDefault();
        props.onClick?.(event);
        window.__nexusNavigations.push({ to, params: p });
      }}
    >
      {children}
    </a>
  );
}
