/* eslint-disable react-refresh/only-export-components -- Test-only router boundary exports helpers and components together. */
import { createContext, useContext, useSyncExternalStore } from "react";

export const OutletContext = createContext(null);
export const Outlet = () => useContext(OutletContext);
const listeners = new Set<() => void>();
const routeSearchKeys = [
  "aba",
  "nrPath",
  "unidade",
  "pasta",
  "lixeira",
  "detalhe",
  "registro",
  "local",
  "projeto",
  "q",
  "cliente",
  "busca",
  "situacao",
  "pagina",
  "levantamento",
  "estudo",
  "acao",
  "perigo",
  "revisao",
  "ponto",
  "estado",
  "pessoa",
  "arquivadas",
  "area",
  "equipe",
  "paginaMembros",
  "competencia",
  "qualificacao",
  "pessoaFiltro",
  "data",
  "vista",
  "foco",
  "tipo",
  "evento",
  "dia",
  "fuso",
  "pendentesEquipe",
  "painel",
  "inicio",
  "fim",
  "hora",
  "natureza",
  "demanda",
  "ficha",
  "escopo",
  "familia",
  "vinculo",
  "importLote",
  "importItem",
  "importPagina",
  "importResultado",
  "importBusca",
  "grupo",
  "copias",
  "aplicabilidade",
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
// Match the browser history behavior of the real router so Back exercises the
// application's URL state rather than only changing the address bar.
window.addEventListener("popstate", () => {
  const url = new URL(location.href);
  search = Object.fromEntries(
    [...url.searchParams].filter(([key]) => routeSearchKeys.includes(key)),
  );
  page = url.searchParams.get("page") || "dimensionamento";
  pageListeners.forEach((listener) => listener());
  listeners.forEach((listener) => listener());
});
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
  "nr-33": "/nr-33",
  "nr-35": "/nr-35",
  "agenda-equipe": "/agenda-equipe",
  almoxarifado: "/almoxarifado",
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
      if (opts.replace) history.replaceState({}, "", url);
      else history.pushState({}, "", url);
      listeners.forEach((l) => l());
    }
    if (typeof opts.to === "string" && /^\/nr-(33|35)(\/|$)/.test(opts.to)) {
      page = opts.to.startsWith("/nr-33") ? "nr-33" : "nr-35";
      const url = new URL(location.href);
      url.searchParams.set("page", page);
      url.searchParams.set("nrPath", opts.to.split("/").slice(2).join("/"));
      history.pushState({}, "", url);
      pageListeners.forEach((listener) => listener());
      window.dispatchEvent(new Event("nr-lab-navigation"));
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
  const targetPath = to.replace(/\$([\w]+)/g, (_, key) => p[key] || key);
  const targetSearch =
    _search === true ? search : typeof _search === "function" ? _search(search) : _search || {};
  const encoded = new URLSearchParams(
    Object.entries(targetSearch)
      .filter(([, value]) => value !== undefined && value !== "")
      .map(([key, value]) => [key, String(value)]),
  ).toString();
  const href = targetPath + (encoded ? `?${encoded}` : "");
  const currentPage = useFixturePage();
  const fixturePath =
    pathForPage(currentPage) +
    (currentPage.startsWith("nr-") && new URLSearchParams(location.search).get("nrPath")
      ? "/" + new URLSearchParams(location.search).get("nrPath")
      : "");
  const active = fixturePath === targetPath;
  const state = active ? activeProps : inactiveProps;
  return (
    <a
      {...props}
      {...state}
      href={href}
      aria-current={props["aria-current"] ?? (active ? "page" : undefined)}
      className={[className, state?.className].filter(Boolean).join(" ")}
      onClick={(event) => {
        event.preventDefault();
        props.onClick?.(event);
        window.__nexusNavigations.push({
          to,
          params: p,
          ...(encoded ? { search: targetSearch } : {}),
        });
        if (/^\/nr-(33|35)(\/|$)/.test(targetPath)) {
          page = targetPath.startsWith("/nr-33") ? "nr-33" : "nr-35";
          const url = new URL(location.href);
          url.searchParams.set("page", page);
          url.searchParams.set("nrPath", targetPath.split("/").slice(2).join("/"));
          for (const key of routeSearchKeys) {
            if (key === "nrPath") continue;
            const value = targetSearch[key];
            if (value !== undefined && value !== "") url.searchParams.set(key, String(value));
            else url.searchParams.delete(key);
          }
          search = Object.fromEntries(
            [...url.searchParams].filter(([key]) => routeSearchKeys.includes(key)),
          );
          history.pushState({}, "", url);
          pageListeners.forEach((listener) => listener());
          listeners.forEach((listener) => listener());
          window.dispatchEvent(new Event("nr-lab-navigation"));
        } else if (href.includes("/revisoes/rev-fixture/")) {
          page = href.split("/").at(-1);
          const url = new URL(location.href);
          url.searchParams.set("page", page);
          history.pushState({}, "", url);
          pageListeners.forEach((listener) => listener());
        } else if (Object.values(operationalPaths).includes(targetPath)) {
          page =
            Object.entries(operationalPaths).find(([, target]) => target === targetPath)?.[0] ||
            page;
          const url = new URL(location.href);
          url.searchParams.set("page", page);
          for (const key of routeSearchKeys) url.searchParams.delete(key);
          for (const [key, value] of Object.entries(targetSearch)) {
            if (value !== undefined && value !== "") url.searchParams.set(key, String(value));
          }
          search = Object.fromEntries(
            [...url.searchParams].filter(([key]) => routeSearchKeys.includes(key)),
          );
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
