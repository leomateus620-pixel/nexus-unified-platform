/* eslint-disable react-refresh/only-export-components -- Scoped PET portals share the appearance hook. */
import { createContext, useContext, useEffect, useState, type ReactNode } from "react";
import { Moon, Sun } from "lucide-react";
import "./pet-experience.css";
const Appearance = createContext<{ theme: "dark" | "light"; toggle: () => void }>({
  theme: "dark",
  toggle: () => {},
});
export function PetAppearanceProvider({
  organizationId,
  userId,
  children,
}: {
  organizationId: string;
  userId: string;
  children: ReactNode;
}) {
  return (
    <PetAppearanceScope
      key={organizationId + ":" + userId}
      storageKey={`nexus.pet.appearance.${organizationId}:${userId}`}
    >
      {children}
    </PetAppearanceScope>
  );
}
function PetAppearanceScope({ storageKey, children }: { storageKey: string; children: ReactNode }) {
  const [theme, setTheme] = useState<"dark" | "light">(() => {
    try {
      return typeof window !== "undefined" && localStorage.getItem(storageKey) === "light"
        ? "light"
        : "dark";
    } catch {
      return "dark";
    }
  });
  useEffect(() => {
    const sync = (event: StorageEvent) => {
      if (event.key === storageKey && (event.newValue === "dark" || event.newValue === "light"))
        setTheme(event.newValue);
    };
    window.addEventListener("storage", sync);
    return () => window.removeEventListener("storage", sync);
  }, [storageKey]);
  const toggle = () =>
    setTheme((current) => {
      const next = current === "dark" ? "light" : "dark";
      try {
        localStorage.setItem(storageKey, next);
      } catch {
        /* The view remains usable when storage is unavailable. */
      }
      return next;
    });
  return <Appearance.Provider value={{ theme, toggle }}>{children}</Appearance.Provider>;
}
export function usePetAppearance() {
  return useContext(Appearance);
}
export function PetThemeToggle() {
  const { theme, toggle } = usePetAppearance();
  const label = theme === "dark" ? "Ativar modo dia na PET" : "Ativar modo noite na PET";
  return (
    <button
      type="button"
      className="pet-theme-toggle"
      aria-label={label}
      title={label}
      aria-pressed={theme === "light"}
      onClick={toggle}
    >
      {theme === "dark" ? <Sun size={18} aria-hidden /> : <Moon size={18} aria-hidden />}
      <span>{theme === "dark" ? "Modo dia" : "Modo noite"}</span>
    </button>
  );
}
