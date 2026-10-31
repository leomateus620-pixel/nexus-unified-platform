import type { HTMLAttributes } from "react";

export type NrCardKind =
  | "local"
  | "documento"
  | "pendencia"
  | "levantamento"
  | "biblioteca"
  | "unidade"
  | "candidato"
  | "evento"
  | "generic";

/** Structure only: each resource owns its identity, evidence and actions. */
export function NrCard({
  kind = "generic",
  className = "",
  ...props
}: HTMLAttributes<HTMLElement> & { kind?: NrCardKind }) {
  return <article className={`nr-card nr-card-${kind} ${className}`} {...props} />;
}

export function NrCardMeta({ className = "", ...props }: HTMLAttributes<HTMLDListElement>) {
  return <dl className={`nr-card-meta ${className}`} {...props} />;
}

export function NrCardActions({ className = "", ...props }: HTMLAttributes<HTMLElement>) {
  return <footer className={`nr-card-actions ${className}`} {...props} />;
}
