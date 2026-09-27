import type { ReactNode } from "react";

export const subTab = "whitespace-nowrap rounded-md px-3 py-1.5 text-sm text-muted-foreground hover:bg-accent hover:text-foreground";
export const subTabActive = { className: "bg-accent text-foreground font-medium" };

export function SubNav({ children }: { children: ReactNode }) {
  return <nav className="mb-4 flex gap-1 overflow-x-auto border-b border-border pb-2">{children}</nav>;
}
