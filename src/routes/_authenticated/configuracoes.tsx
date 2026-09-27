import { createFileRoute, Link, Outlet } from "@tanstack/react-router";

import { SubNav, subTab, subTabActive } from "@/components/nexus/SubNav";

export const Route = createFileRoute("/_authenticated/configuracoes")({ component: Layout });

function Layout() {
  return (
    <div>
      <SubNav>
        <Link to="/configuracoes" activeOptions={{ exact: true }} className={subTab} activeProps={subTabActive}>Usuários e permissões</Link>
        <Link to="/configuracoes/orcamentos" className={subTab} activeProps={subTabActive}>Orçamentos</Link>
        <Link to="/engenharia/regras-dimensionamento" className={subTab}>Regras técnicas (Engenharia) ↗</Link>
      </SubNav>
      <Outlet />
    </div>
  );
}
