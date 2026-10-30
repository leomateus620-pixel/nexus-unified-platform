import { Fragment, useEffect, useId, useRef, useState } from "react";
import * as Popover from "@radix-ui/react-popover";
import { Check, ChevronsUpDown, Search, X } from "lucide-react";
import { useQuery } from "@tanstack/react-query";
import { useServerFn } from "@tanstack/react-start";
import { ErrorState, ActionButton } from "@/components/nexus/Page";
import { fieldClass } from "@/features/operacao/components";
import { buscarOpcoesAgenda } from "./agenda.functions";
import { acessoAgendaNegado } from "./domain";
import { agendaFreshness } from "./queries";
import { useAgendaAppearance } from "./AgendaAppearance";
import type { OpcaoAgenda, TipoOpcao } from "./types";
import "./agenda-composer.css";
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
  clearable = true,
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
  clearable?: boolean;
}) {
  const { theme } = useAgendaAppearance();
  const id = useId(),
    load = useServerFn(buscarOpcoesAgenda),
    searchRef = useRef<HTMLInputElement>(null);
  const [open, setOpen] = useState(false),
    [busca, setBusca] = useState(""),
    [term, setTerm] = useState(""),
    [page, setPage] = useState(0),
    [active, setActive] = useState(0),
    [selection, setSelection] = useState({ id: value, nome: initialLabel, contexto: "" });
  useEffect(() => {
    const timer = setTimeout(() => {
      setTerm(busca);
      setPage(0);
      setActive(0);
    }, 180);
    return () => clearTimeout(timer);
  }, [busca]);
  const q = useQuery({
    queryKey: ["agenda-equipe", org, "opcoes", tipo, clienteId, term, page],
    enabled: !!org && !disabled && open,
    ...agendaFreshness,
    queryFn: ({ signal }) =>
      load({
        data: { organization_id: org, tipo, busca: term, cliente_id: clienteId, pagina: page },
        signal,
      }),
  });
  useEffect(() => {
    if (acessoAgendaNegado(q.error)) onDenied(q.error);
  }, [q.error, onDenied]);
  const rows = q.isError
    ? []
    : [...(q.data?.registros ?? [])].sort((a, b) =>
        tipo === "projetos"
          ? (a.cliente_nome || a.contexto || "").localeCompare(
              b.cliente_nome || b.contexto || "",
              "pt-BR",
            ) || a.nome.localeCompare(b.nome, "pt-BR")
          : 0,
      );
  const currentRow = rows.find((r) => r.id === value);
  const selected =
    currentRow ??
    (selection.id === value ? selection : { id: value, nome: initialLabel, contexto: "" });
  const choose = (row: OpcaoAgenda | null) => {
    if (row)
      setSelection({
        ...row,
        nome:
          tipo === "projetos" && row.cliente_nome ? row.cliente_nome + " · " + row.nome : row.nome,
      });
    onChange(row);
    setOpen(false);
    setBusca("");
  };
  return (
    <div className="agenda-picker grid min-w-0 gap-1.5">
      <span id={id + "-label"} className="text-sm font-medium">
        {label}
        {required ? " *" : ""}
      </span>
      <Popover.Root open={open} onOpenChange={setOpen}>
        <Popover.Trigger asChild>
          <button
            type="button"
            disabled={disabled}
            className={fieldClass + " agenda-picker-trigger"}
            aria-labelledby={id + "-label"}
            aria-invalid={!!error}
            aria-describedby={error ? id + "-error" : undefined}
          >
            <span className="min-w-0 truncate">
              {value
                ? (tipo === "projetos" && currentRow?.cliente_nome
                    ? currentRow.cliente_nome + " · " + currentRow.nome
                    : selected.nome) || "Vínculo preservado"
                : tipo === "pessoas" && /Adicionar|Selecionar pessoas/.test(label)
                  ? "Buscar e adicionar pessoas"
                  : tipo === "projetos"
                    ? "Buscar cliente ou projeto"
                    : `Selecionar ${label.toLocaleLowerCase("pt-BR")}`}
            </span>
            <ChevronsUpDown size={16} aria-hidden="true" />
          </button>
        </Popover.Trigger>
        <Popover.Portal>
          <Popover.Content
            className="agenda-picker-popup"
            data-theme={theme}
            align="start"
            sideOffset={6}
            onOpenAutoFocus={(e) => {
              e.preventDefault();
              searchRef.current?.focus();
            }}
          >
            <div className="agenda-picker-search">
              <Search size={16} aria-hidden="true" />
              <input
                ref={searchRef}
                role="combobox"
                aria-label={`Buscar ${label.toLocaleLowerCase("pt-BR")}`}
                aria-expanded="true"
                aria-controls={id + "-list"}
                aria-autocomplete="list"
                aria-activedescendant={rows[active] ? id + "-option-" + active : undefined}
                type="search"
                value={busca}
                maxLength={120}
                placeholder={tipo === "projetos" ? "Cliente ou projeto…" : "Buscar por nome…"}
                onChange={(e) => setBusca(e.target.value)}
                onKeyDown={(e) => {
                  if (e.key === "ArrowDown") {
                    e.preventDefault();
                    setActive((i) => Math.min(i + 1, rows.length - 1));
                  }
                  if (e.key === "ArrowUp") {
                    e.preventDefault();
                    setActive((i) => Math.max(0, i - 1));
                  }
                  if (e.key === "Enter") {
                    e.preventDefault();
                    if (rows[active]) choose(rows[active]);
                  }
                }}
              />
            </div>
            {q.isError ? (
              <ErrorState error={q.error} onRetry={() => q.refetch()} />
            ) : q.isPending ? (
              <p role="status" className="p-3 text-sm">
                Carregando opções…
              </p>
            ) : (
              <div
                role="listbox"
                id={id + "-list"}
                aria-label={label}
                className="agenda-picker-list"
              >
                {rows.length === 0 && (
                  <p className="p-3 text-sm text-muted-foreground">
                    Nenhum resultado para esta busca.
                  </p>
                )}
                {rows.map((row, index) => (
                  <Fragment key={row.id}>
                    {tipo === "projetos" &&
                      (index === 0 ||
                        (rows[index - 1]?.cliente_nome || rows[index - 1]?.contexto) !==
                          (row.cliente_nome || row.contexto)) && (
                        <p role="presentation" className="agenda-picker-group">
                          {row.cliente_nome || row.contexto || "Projetos"}
                        </p>
                      )}
                    <button
                      type="button"
                      role="option"
                      id={id + "-option-" + index}
                      key={row.id}
                      aria-selected={row.id === value}
                      data-active={active === index || undefined}
                      onMouseEnter={() => setActive(index)}
                      onClick={() => choose(row)}
                      className="agenda-picker-option"
                    >
                      <span className="min-w-0">
                        <strong className="block break-words font-medium">{row.nome}</strong>
                        {row.contexto && (
                          <span className="block break-words text-xs opacity-70">
                            {row.contexto}
                          </span>
                        )}
                      </span>
                      {row.id === value && <Check size={16} aria-hidden="true" />}
                    </button>
                  </Fragment>
                ))}
              </div>
            )}
            {q.data && q.data.total > q.data.limite && (
              <div className="agenda-picker-pagination">
                <ActionButton
                  variant="ghost"
                  disabled={!page}
                  onClick={() => {
                    setPage((p) => p - 1);
                    setActive(0);
                  }}
                >
                  Anterior
                </ActionButton>
                <span>
                  {page * q.data.limite + 1}–{Math.min((page + 1) * q.data.limite, q.data.total)} de{" "}
                  {q.data.total}
                </span>
                <ActionButton
                  variant="ghost"
                  disabled={(page + 1) * q.data.limite >= q.data.total}
                  onClick={() => {
                    setPage((p) => p + 1);
                    setActive(0);
                  }}
                >
                  Próxima
                </ActionButton>
              </div>
            )}
            {clearable && value && !required && (
              <button type="button" className="agenda-picker-clear" onClick={() => choose(null)}>
                <X size={14} aria-hidden="true" /> Remover seleção
              </button>
            )}
          </Popover.Content>
        </Popover.Portal>
      </Popover.Root>
      {error && (
        <p id={id + "-error"} className="text-sm text-destructive">
          {error}
        </p>
      )}
    </div>
  );
}
