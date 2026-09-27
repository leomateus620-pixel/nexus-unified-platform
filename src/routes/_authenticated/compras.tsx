import { createFileRoute, Link, Outlet } from "@tanstack/react-router";

import { SubNav, subTab, subTabActive } from "@/components/nexus/SubNav";

export const Route = createFileRoute("/_authenticated/compras")({ component: Layout });

function Layout() {
  return (
    <div>
      <SubNav>
        <Link
          to="/compras"
          activeOptions={{ exact: true }}
          className={subTab}
          activeProps={subTabActive}
        >
          Visão geral
        </Link>
        <Link to="/compras/demandas" className={subTab} activeProps={subTabActive}>
          Demandas
        </Link>
        <Link to="/compras/ordens-compra" className={subTab} activeProps={subTabActive}>
          Ordens de compra
        </Link>
        <Link to="/compras/ordens-producao" className={subTab} activeProps={subTabActive}>
          Ordens de produção
        </Link>
        <Link to="/compras/fornecedores" className={subTab} activeProps={subTabActive}>
          Fornecedores
        </Link>
      </SubNav>
      <Outlet />
    </div>
  );
}
