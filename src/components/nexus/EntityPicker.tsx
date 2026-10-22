import { useId, useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { ErrorState } from "./Page";
import { useDebouncedValue } from "@/lib/use-debounced-value";

export type EntityOption = { id: string; nome: string };

/** Selects an authorized canonical record; the loader must limit results on the server. */
export function EntityPicker({
  label,
  value,
  initialLabel,
  onChange,
  queryKey,
  load,
  required = false,
  disabled = false,
  emptyHint,
  name,
  error,
}: {
  label: string;
  value: string;
  initialLabel?: string | undefined;
  onChange: (option: EntityOption | null) => void;
  queryKey: readonly unknown[];
  load: (search: string, signal: AbortSignal) => Promise<EntityOption[]>;
  required?: boolean;
  disabled?: boolean;
  emptyHint?: string;
  name?: string;
  error?: string | undefined;
}) {
  const id = useId();
  const [search, setSearch] = useState("");
  const [selection, setSelection] = useState<EntityOption | null>(null);
  const term = useDebouncedValue(search);
  const options = useQuery({
    queryKey: [...queryKey, term],
    queryFn: ({ signal }) => load(term, signal),
    enabled: !disabled,
  });
  const selected =
    selection?.id === value
      ? selection
      : initialLabel && value
        ? { id: value, nome: initialLabel }
        : null;
  const rows = options.data ?? [];
  const choices =
    selected && !rows.some((row) => row.id === selected.id) ? [selected, ...rows] : rows;
  return (
    <div className="nx-entity-picker grid min-w-0 gap-2">
      <label htmlFor={`${id}-search`} className="grid gap-1 text-sm">
        Buscar {label.toLocaleLowerCase("pt-BR")}
        <input
          id={`${id}-search`}
          type="search"
          value={search}
          maxLength={120}
          disabled={disabled}
          onChange={(event) => setSearch(event.target.value)}
          placeholder="Busca no servidor"
          className="min-h-11 w-full rounded-md border border-input bg-background px-3 py-2 text-sm text-foreground"
        />
      </label>
      <label htmlFor={`${id}-select`} className="grid gap-1 text-sm">
        {label}
        {required ? " *" : ""}
        <select
          id={`${id}-select`}
          name={name}
          value={value}
          disabled={disabled}
          required={required}
          className="min-h-11 w-full rounded-md border border-input bg-background px-3 py-2 text-sm text-foreground"
          aria-invalid={!!error}
          aria-describedby={`${id}-hint${error ? ` ${id}-error` : ""}`}
          onChange={(event) => {
            const next = choices.find((row) => row.id === event.target.value) ?? null;
            setSelection(next);
            onChange(next);
          }}
        >
          <option value="">Selecione</option>
          {choices.map((row) => (
            <option key={row.id} value={row.id}>
              {row.nome}
            </option>
          ))}
        </select>
      </label>
      {error && (
        <p id={`${id}-error`} className="text-xs text-destructive">
          {error}
        </p>
      )}
      <p id={`${id}-hint`} role="status" className="text-xs text-muted-foreground">
        {disabled
          ? "Selecione o vínculo anterior para consultar."
          : options.isPending
            ? "Consultando cadastros autorizados…"
            : options.isError
              ? "Não foi possível atualizar as opções."
              : !rows.length
                ? emptyHint || "Nenhum cadastro encontrado. Ajuste a busca."
                : "Até 25 resultados por busca."}
      </p>
      {options.isError && <ErrorState error={options.error} onRetry={() => options.refetch()} />}
    </div>
  );
}
