/* Test-only router transport; production uses TanStack Router. */
import React, { useSyncExternalStore } from "react";
const subscribe = (f: () => void) => {
  window.addEventListener("popstate", f);
  return () => window.removeEventListener("popstate", f);
};
export const usePath = () => useSyncExternalStore(subscribe, () => location.pathname);
export function go(path: string) {
  history.pushState({}, "", path);
  window.dispatchEvent(new PopStateEvent("popstate"));
}
function target(to: string, params: Record<string, string> = {}) {
  return to.replace(/\$([a-zA-Z]+)/g, (_, k) => params[k] || "");
}
export function Link({ to, params, children, ...rest }: any) {
  return (
    <a
      {...rest}
      href={target(to, params)}
      onClick={(e) => {
        e.preventDefault();
        go(target(to, params));
        rest.onClick?.(e);
      }}
    >
      {children}
    </a>
  );
}
export const useNavigate = () => async (o: any) => go(target(o.to, o.params));
export const useRouterState = ({ select }: any) => select({ location: { pathname: usePath() } });
export const useBlocker = () => ({ status: "idle", reset: () => {}, proceed: () => {} });
