/* eslint-disable react-refresh/only-export-components -- Test-only router boundary exports helpers and components together. */
import { createContext, useContext, useSyncExternalStore } from "react";

export const OutletContext = createContext(null);
export const Outlet = () => useContext(OutletContext);
const listeners = new Set<() => void>();
const routeSearchKeys = [
  "projeto",
  "q",
  "cliente",
  "busca",
  "situacao",
  "pagina",
  "levantamento",
  "revisao",
  "ponto",
  "estado",
];
let search = Object.fromEntries(
  [...new URLSearchParams(location.search)].filter(([key]) => routeSearchKeys.includes(key)),
);
const params = {
  revisaoId: "rev-fixture",
  propostaId: "proposal-fixture",
  ordemId: "order-fixture",
  projetoId: "project-fixture",
  produtoId: "product-0",
};
let page = new URLSearchParams(location.search).get("page") || "dimensionamento";
const pageListeners = new Set<() => void>();
export function useFixturePage() {
  return useSyncExternalStore(
    (listener) => {
      pageListeners.add(listener);
      return () => pageListeners.delete(listener);
    },
    () => page,
  );
}
const operationalPaths = {
  engenharia: "/engenharia",
  levantamentos: "/levantamentos",
  equipe: "/equipe",
  seguranca: "/seguranca",
  clientes: "/clientes",
  configuracoes: "/configuracoes",
  "projetos-engenharia": "/projetos-engenharia",
  "mapas-library": "/mapas-3d/unidades",
};
const pathForPage = (page: string) =>
  operationalPaths[page] ||
  (page === "list"
    ? "/comercial/propostas"
    : page === "oc"
      ? "/compras/ordens-compra/order-fixture"
      : page === "op"
        ? "/compras/ordens-producao/order-fixture"
        : `/comercial/propostas/proposal-fixture/revisoes/rev-fixture/${page}`);
export function useNavigate() {
  return (opts) => {
    if (opts.search) {
      search = typeof opts.search === "function" ? opts.search(search) : opts.search;
      const url = new URL(location.href);
      for (const key of routeSearchKeys) {
        if (search[key] !== undefined && search[key] !== "")
          url.searchParams.set(key, String(search[key]));
        else url.searchParams.delete(key);
      }
      history.replaceState({}, "", url);
      listeners.forEach((l) => l());
    }
    window.__nexusNavigations.push(opts);
  };
}
export function useRouterState({ select }) {
  const current = useFixturePage();
  return select({ location: { pathname: pathForPage(current) } });
}
export function useBlocker() {
  return { status: "idle", reset: () => {}, proceed: () => {} };
}
export const createFileRoute = (path) => (options) => ({
  options,
  fullPath: path,
  useNavigate,
  useParams: () => params,
  useSearch: () => {
    const raw = useSyncExternalStore(
      (l) => {
        listeners.add(l);
        return () => listeners.delete(l);
      },
      () => search,
    );
    return typeof options.validateSearch === "function"
      ? options.validateSearch(raw)
      : options.validateSearch?.parse
        ? options.validateSearch.parse(raw)
        : raw;
  },
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
  const active = pathForPage(useFixturePage()) === href;
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
        if (href.includes("/revisoes/rev-fixture/")) {
          page = href.split("/").at(-1);
          const url = new URL(location.href);
          url.searchParams.set("page", page);
          history.pushState({}, "", url);
          pageListeners.forEach((listener) => listener());
        } else if (Object.values(operationalPaths).includes(href)) {
          page =
            Object.entries(operationalPaths).find(([, target]) => target === href)?.[0] || page;
          const url = new URL(location.href);
          url.searchParams.set("page", page);
          url.searchParams.delete("projeto");
          search = {};
          history.pushState({}, "", url);
          pageListeners.forEach((listener) => listener());
          listeners.forEach((listener) => listener());
        }
      }}
    >
      {children}
    </a>
  );
}
