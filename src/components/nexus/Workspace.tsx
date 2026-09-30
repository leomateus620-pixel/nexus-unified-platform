import { useEffect, useRef, type ReactNode } from "react";
import { AlertCircle, Check, CircleDot } from "lucide-react";
import { useRouterState } from "@tanstack/react-router";
import type { SaveStatus } from "@/features/propostas/hooks";

/** Navigation stays ordinary links. Only its local scroll position is managed. */
export function StepRuler({ children }: { children: ReactNode }) {
  const ref = useRef<HTMLElement>(null);
  const pathname = useRouterState({ select: (state) => state.location.pathname });
  useEffect(() => {
    const rail = ref.current;
    if (!rail) return;
    const keepCurrentVisible = () => {
      const active = rail.querySelector<HTMLElement>('[aria-current="page"]');
      if (!active) return;
      const left = active.offsetLeft;
      if (
        left < rail.scrollLeft ||
        left + active.offsetWidth > rail.scrollLeft + rail.clientWidth
      ) {
        rail.scrollLeft = Math.max(0, left - 16);
      }
    };
    keepCurrentVisible();
    const observer = new ResizeObserver(keepCurrentVisible);
    observer.observe(rail);
    return () => observer.disconnect();
  }, [pathname]);
  return (
    <nav ref={ref} aria-label="Páginas da proposta" className="nx-step-ruler">
      {children}
    </nav>
  );
}

/** Never infers persistence from local editing or presentation state. */
export function SaveFeedback({ status, msg }: { status: SaveStatus; msg: string | null }) {
  const labels: Record<SaveStatus, string> = {
    idle: "",
    local: "Editando · alterações pendentes",
    consolidando: "Atualizando cálculo e histórico…",
    confirmado: msg ? "" : "Salvo",
    salvando: "Salvando…",
    salvo: "Entradas confirmadas · histórico pendente",
    erro: "Erro ao salvar",
    conflito: "Conflito · trabalho local preservado",
  };
  if (!labels[status] && !msg) return null;
  const Icon =
    status === "confirmado"
      ? Check
      : ["salvando", "consolidando", "local", "salvo"].includes(status)
        ? CircleDot
        : AlertCircle;
  return (
    <div
      role="status"
      aria-live="polite"
      aria-atomic="true"
      className="nx-save-feedback"
      data-status={status}
    >
      <Icon aria-hidden="true" size={16} />
      <span>
        {labels[status]}
        {msg ? `${labels[status] ? " — " : ""}${msg}` : ""}
      </span>
    </div>
  );
}
