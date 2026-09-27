import { createFileRoute, Link, Outlet, useRouterState } from "@tanstack/react-router";

import { SubNav, subTab, subTabActive } from "@/components/nexus/SubNav";

export const Route = createFileRoute("/_authenticated/comercial")({
  component: Layout,
});

function Layout() {
  const inWorkspace = useRouterState({ select: (s) => /\/revisoes\//.test(s.location.pathname) });
  return (
    <div>
      {!inWorkspace && (
        <SubNav>
          <Link
            to="/comercial"
            activeOptions={{ exact: true }}
            className={subTab}
            activeProps={subTabActive}
          >
            Visão geral
          </Link>
          <Link to="/comercial/propostas" className={subTab} activeProps={subTabActive}>
            Propostas
          </Link>
        </SubNav>
      )}
      <Outlet />
    </div>
  );
}
