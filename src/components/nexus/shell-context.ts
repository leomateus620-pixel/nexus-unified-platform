import { useSyncExternalStore } from "react";

/** Contextual header registered by a route (e.g. Mapa 3D) into the AppShell top bar. */
export type ShellLink = { to: string; search: Record<string, unknown>; label: string };
export type ShellContext = {
  /** Pathname + scope key that owns this context; shell shows it only while they match. */
  path: string;
  key: string;
  normaCodigo: string;
  normaNome: string;
  cliente: string;
  unidade: string;
  back: ShellLink;
  switchNorma: ShellLink;
};

let current: ShellContext | null = null;
const listeners = new Set<() => void>();
const emit = () => listeners.forEach((l) => l());

export function setShellContext(value: ShellContext) {
  current = value;
  emit();
}
/** Clears only if the context still belongs to the given owner key. */
export function clearShellContext(key: string) {
  if (current?.key !== key) return;
  current = null;
  emit();
}
export function getShellContext() {
  return current;
}
export function useShellContext() {
  return useSyncExternalStore(
    (l) => {
      listeners.add(l);
      return () => listeners.delete(l);
    },
    () => current,
    () => null,
  );
}
