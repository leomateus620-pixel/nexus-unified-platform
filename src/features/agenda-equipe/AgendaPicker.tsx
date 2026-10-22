import { useEffect, useId, useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { useServerFn } from "@tanstack/react-start";
import { ErrorState, ActionButton } from "@/components/nexus/Page";
import { fieldClass } from "@/features/operacao/components";
import { buscarOpcoesAgenda } from "./agenda.functions";
import { acessoAgendaNegado } from "./domain";
import { agendaFreshness } from "./queries";
import type { OpcaoAgenda, TipoOpcao } from "./types";
export function AgendaPicker({
  org,
  tipo,
  label,
  value,
  initialLabel = "",
  clienteId = null,
  required = false,
  disabled = false,
  onChange,
  onDenied,
  error,
}: {
  org: string;
  tipo: TipoOpcao;
  label: string;
  value: string;
  initialLabel?: string;
  clienteId?: string | null;
  required?: boolean;
  disabled?: boolean;
  onChange: (row: OpcaoAgenda | null) => void;
  onDenied: (error: unknown) => void;
  error?: string | undefined;
}) {
  const id = useId(),
    load = useServerFn(buscarOpcoesAgenda);
  const [busca, setBusca] = useState(""),
    [term, setTerm] = useState(""),
    [page, setPage] = useState(0);
  const [selection, setSelection] = useState({
    id: value,
    nome: initialLabel,
    contexto: "Seleção atual",
  });
  useEffect(() => {
    const timer = setTimeout(() => {
      setTerm(busca);
      setPage(0);
    }, 300);
    return () => clearTimeout(timer);
  }, [busca]);
  const q = useQuery({
    queryKey: ["agenda-equipe", org, "opcoes", tipo, clienteId, term, page],
    enabled: !!org && !disabled,
    ...agendaFreshness,
    queryFn: ({ signal }) =>
      load({
        data: {
          organization_id: org,
          tipo,
          busca: term,
          cliente_id: clienteId,
          pagina: page,
        },
        signal,
      }),
  });
  useEffect(() => {
    if (acessoAgendaNegado(q.error)) onDenied(q.error);
  }, [q.error, onDenied]);
  const rows = q.isError ? [] : (q.data?.registros ?? []),
    selected =
      selection.id === value
        ? selection
        : { id: value, nome: initialLabel, contexto: "Seleção atual" };
  const choices = value && !rows.some((r) => r.id === value) ? [selected, ...rows] : rows;
  if (disabled)
    return (
      <div className="rounded-md border border-border bg-muted/20 px-3 py-2 text-sm">
        <span className="text-xs text-muted-foreground">{label}</span>
        <p className="break-words font-medium">{initialLabel || "Cadastro vinculado"}</p>
      </div>
    );
  return (
    <div className="grid min-w-0 gap-2">
      <label htmlFor={id + "-search"} className="grid gap-1 text-sm">
        Buscar {label.toLocaleLowerCase("pt-BR")}
        <input
          id={id + "-search"}
          className={fieldClass}
          type="search"
          value={busca}
          maxLength={120}
          onChange={(e) => setBusca(e.target.value)}
        />
      </label>
      <label htmlFor={id + "-choice"} className="grid gap-1 text-sm">
        {label}
        {required ? " *" : ""}
        <select
          id={id + "-choice"}
          className={fieldClass}
          value={value}
          required={required}
          disabled={q.isError || q.isPending}
          aria-invalid={!!error}
          aria-describedby={error ? id + "-error" : undefined}
          onChange={(e) => {
            const row = choices.find((r) => r.id === e.target.value) ?? null;
            if (row) setSelection(row);
            onChange(row);
          }}
        >
          <option value="">Selecione</option>
          {choices.map((r) => (
            <option key={r.id} value={r.id}>
              {r.nome}
              {r.contexto ? " · " + r.contexto : ""}
            </option>
          ))}
        </select>
      </label>
      {error && (
        <p id={id + "-error"} className="text-sm text-destructive">
          {error}
        </p>
      )}
      {q.isError ? (
        <ErrorState error={q.error} onRetry={() => q.refetch()} />
      ) : q.isPending ? (
        <p role="status" className="text-xs text-muted-foreground">
          Consultando opções autorizadas…
        </p>
      ) : (
        q.data && (
          <div className="flex flex-wrap items-center justify-between gap-2 text-xs text-muted-foreground">
            <span>{q.data.total} opções encontradas</span>
            <div className="flex gap-1">
              <ActionButton
                variant="ghost"
                disabled={!page}
                onClick={() => setPage((p) => Math.max(0, p - 1))}
              >
                Anterior
              </ActionButton>
              <ActionButton
                variant="ghost"
                disabled={(page + 1) * q.data.limite >= q.data.total}
                onClick={() => setPage((p) => p + 1)}
              >
                Próxima
              </ActionButton>
            </div>
          </div>
        )
      )}
    </div>
  );
}
