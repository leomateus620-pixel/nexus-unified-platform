/* eslint-disable react-refresh/only-export-components -- Agenda portals share this scoped appearance context. */
import { createContext, useContext, useEffect, useState, type ReactNode } from "react";
type Theme = "dark" | "light";
const Appearance = createContext<{ theme: Theme; toggle: () => void }>({
  theme: "dark",
  toggle: () => {},
});
export function AgendaAppearanceProvider({
  storageKey,
  children,
}: {
  storageKey: string;
  children: ReactNode;
}) {
  const [theme, setTheme] = useState<Theme>(() => {
    try {
      return typeof window !== "undefined" && window.localStorage.getItem(storageKey) === "light"
        ? "light"
        : "dark";
    } catch {
      return "dark";
    }
  });
  useEffect(() => {
    const sync = (event: StorageEvent) => {
      if (event.key === storageKey && (event.newValue === "light" || event.newValue === "dark"))
        setTheme(event.newValue);
    };
    window.addEventListener("storage", sync);
    return () => window.removeEventListener("storage", sync);
  }, [storageKey]);
  const toggle = () =>
    setTheme((previous) => {
      const next = previous === "dark" ? "light" : "dark";
      try {
        window.localStorage.setItem(storageKey, next);
      } catch {
        /* Visual preference remains usable when storage is unavailable. */
      }
      return next;
    });
  return <Appearance.Provider value={{ theme, toggle }}>{children}</Appearance.Provider>;
}
export function useAgendaAppearance() {
  return useContext(Appearance);
}
