import { createFileRoute, Link, Outlet } from "@tanstack/react-router";

import { SubNav, subTab, subTabActive } from "@/components/nexus/SubNav";

export const Route = createFileRoute("/_authenticated/engenharia")({ component: Layout });

function Layout() {
  return (
    <div>
      <SubNav>
        <Link
          to="/engenharia"
          activeOptions={{ exact: true }}
          className={subTab}
          activeProps={subTabActive}
        >
          Visão geral
        </Link>
        <Link to="/engenharia/regras-dimensionamento" className={subTab} activeProps={subTabActive}>
          Regras de dimensionamento
        </Link>
        <Link to="/engenharia/dimensionamentos" className={subTab} activeProps={subTabActive}>
          Dimensionamentos
        </Link>
      </SubNav>
      <Outlet />
    </div>
  );
}
