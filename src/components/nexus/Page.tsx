import type { ButtonHTMLAttributes, ReactNode } from "react";

import { cn } from "@/lib/utils";

export function PageHeader({
  eyebrow,
  title,
  description,
  actions,
}: {
  eyebrow: string;
  title: string;
  description: string;
  actions?: ReactNode;
}) {
  return (
    <div className="mb-6 flex flex-wrap items-end justify-between gap-4 border-b border-border pb-5">
      <div>
        <p className="text-[11px] font-semibold uppercase tracking-[0.22em] text-primary">
          {eyebrow}
        </p>
        <h1 className="mt-1 text-2xl font-bold text-foreground md:text-3xl">{title}</h1>
        <p className="mt-2 max-w-2xl text-sm text-muted-foreground">{description}</p>
      </div>
      {actions && <div className="flex flex-wrap gap-2">{actions}</div>}
    </div>
  );
}

export function ActionButton({
  children,
  variant = "primary",
  loading = false,
  className,
  disabled,
  type = "button",
  ...rest
}: {
  children: ReactNode;
  variant?: "primary" | "ghost" | "danger";
  loading?: boolean;
} & Omit<ButtonHTMLAttributes<HTMLButtonElement>, "children">) {
  return (
    <button
      type={type}
      disabled={disabled || loading}
      aria-busy={loading || undefined}
      className={cn(
        "rounded-md px-4 py-2 text-sm font-medium transition-colors disabled:cursor-not-allowed disabled:opacity-50",
        variant === "primary" && "bg-primary text-primary-foreground hover:bg-primary/90",
        variant === "ghost" && "border border-border text-foreground hover:bg-accent",
        variant === "danger" && "border border-destructive/50 text-destructive hover:bg-destructive/10",
        className,
      )}
      {...rest}
    >
      {loading ? "Processando…" : children}
    </button>
  );
}

export function StatCard({
  label,
  value,
  hint,
  tone = "default",
}: {
  label: string;
  value: string;
  hint?: string;
  tone?: "default" | "primary" | "info" | "danger";
}) {
  return (
    <div className="rounded-lg border border-border bg-card p-4">
      <p className="text-xs uppercase tracking-wide text-muted-foreground">{label}</p>
      <p
        className={cn(
          "mt-2 text-2xl font-bold",
          tone === "primary" && "text-primary",
          tone === "danger" && "text-destructive",
          tone === "info" && "text-info",
          tone === "default" && "text-foreground",
        )}
      >
        {value}
      </p>
      {hint && <p className="mt-1 text-xs text-muted-foreground">{hint}</p>}
    </div>
  );
}

export function Section({
  title,
  description,
  children,
  className,
}: {
  title: string;
  description?: string;
  children: ReactNode;
  className?: string;
}) {
  return (
    <section className={cn("rounded-lg border border-border bg-card", className)}>
      <div className="border-b border-border px-4 py-3">
        <h2 className="text-sm font-semibold text-foreground">{title}</h2>
        {description && <p className="text-xs text-muted-foreground">{description}</p>}
      </div>
      <div className="p-4">{children}</div>
    </section>
  );
}

export type Column<T> = {
  key: string;
  label: string;
  render?: (row: T) => ReactNode;
  align?: "left" | "right";
};

export function DataTable<T>({
  columns,
  rows,
  getRowId,
  onRowClick,
  selectedId,
}: {
  columns: Column<T>[];
  rows: T[];
  getRowId: (row: T) => string;
  onRowClick?: (row: T) => void;
  selectedId?: string | null;
}) {
  return (
    <div className="max-h-[70vh] overflow-auto">
      <table className="w-full min-w-[640px] text-sm">
        <thead className="sticky top-0 z-10 bg-card">
          <tr className="border-b border-border text-left text-xs uppercase tracking-wide text-muted-foreground">
            {columns.map((c) => (
              <th key={c.key} className={cn("px-3 py-2 font-medium", c.align === "right" && "text-right")}>
                {c.label}
              </th>
            ))}
          </tr>
        </thead>
        <tbody>
          {rows.map((row) => {
            const id = getRowId(row);
            return (
              <tr
                key={id}
                onClick={onRowClick ? () => onRowClick(row) : undefined}
                className={cn(
                  "border-b border-border/60 last:border-0 hover:bg-accent/40",
                  onRowClick && "cursor-pointer",
                  selectedId === id && "bg-accent/60",
                )}
              >
                {columns.map((c) => (
                  <td key={c.key} className={cn("px-3 py-3 text-foreground/90", c.align === "right" && "text-right tabular-nums")}>
                    {c.render ? c.render(row) : String((row as Record<string, unknown>)[c.key] ?? "—")}
                  </td>
                ))}
              </tr>
            );
          })}
        </tbody>
      </table>
    </div>
  );
}

export function LoadingState({ label = "Carregando…" }: { label?: string }) {
  return (
    <div role="status" className="space-y-2 p-4">
      <div className="h-4 w-1/3 animate-pulse rounded bg-muted" />
      <div className="h-4 w-2/3 animate-pulse rounded bg-muted" />
      <div className="h-4 w-1/2 animate-pulse rounded bg-muted" />
      <span className="sr-only">{label}</span>
    </div>
  );
}

export function ErrorState({ error, onRetry }: { error: unknown; onRetry?: () => void }) {
  const msg = error instanceof Error ? error.message : typeof error === "object" && error && "message" in error ? String((error as { message: unknown }).message) : "Erro inesperado.";
  return (
    <div role="alert" className="rounded-md border border-destructive/40 bg-destructive/10 p-4 text-sm text-destructive">
      <p>Não foi possível carregar: {msg}</p>
      {onRetry && (
        <button onClick={onRetry} className="mt-2 rounded border border-destructive/50 px-3 py-1 text-xs">
          Tentar novamente
        </button>
      )}
    </div>
  );
}

export function EmptyState({ title, hint, action }: { title: string; hint?: string; action?: ReactNode }) {
  return (
    <div className="rounded-md border border-dashed border-border p-6 text-center">
      <p className="text-sm font-medium text-foreground">{title}</p>
      {hint && <p className="mt-1 text-xs text-muted-foreground">{hint}</p>}
      {action && <div className="mt-3 flex justify-center">{action}</div>}
    </div>
  );
}

export function NotConfigured({ what }: { what: string }) {
  return (
    <div className="rounded-md border border-warning/40 bg-warning/10 p-4 text-sm text-warning">
      <p className="font-medium">Integração não configurada</p>
      <p className="mt-1 text-xs">{what}</p>
    </div>
  );
}

/** Renderiza estados de uma consulta: carregando, erro, vazio ou conteúdo. */
export function QueryView<T>({
  query,
  empty,
  children,
}: {
  query: { isPending: boolean; isError: boolean; error: unknown; data: T[] | undefined; refetch: () => unknown };
  empty: ReactNode;
  children: (data: T[]) => ReactNode;
}) {
  if (query.isPending) return <LoadingState />;
  if (query.isError) return <ErrorState error={query.error} onRetry={() => query.refetch()} />;
  if (!query.data || query.data.length === 0) return <>{empty}</>;
  return <>{children(query.data)}</>;
}

const toneMap: Record<string, string> = {
  ok: "border-primary/40 bg-primary/10 text-primary",
  warn: "border-warning/40 bg-warning/10 text-warning",
  danger: "border-destructive/40 bg-destructive/10 text-destructive",
  neutral: "border-border bg-muted text-muted-foreground",
};

export function StatusBadge({ value }: { value: string }) {
  const v = value.toLowerCase();
  let tone = "neutral";
  if (/(aprovad|conclu|em dia|ativo|emitid|aceit|liberad)/.test(v)) tone = "ok";
  if (/(aguard|revis|análise|analise|em elabora|negocia|cotação|cotacao|vencendo|em campo|em fabrica|prospec|rascunho|enviad|planejad)/.test(v))
    tone = "warn";
  if (/(vencid|crític|critic|atras|reprov|recusad)/.test(v)) tone = "danger";

  return (
    <span
      className={cn(
        "inline-flex rounded-full border px-2.5 py-0.5 text-xs font-medium",
        toneMap[tone],
      )}
    >
      {value}
    </span>
  );
}

export function Progress({ value }: { value: number }) {
  return (
    <div className="flex items-center gap-2">
      <div className="h-1.5 w-24 overflow-hidden rounded-full bg-muted">
        <div className="h-full rounded-full bg-primary" style={{ width: `${value}%` }} />
      </div>
      <span className="text-xs tabular-nums text-muted-foreground">{value}%</span>
    </div>
  );
}
