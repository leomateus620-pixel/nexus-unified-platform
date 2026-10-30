import { useState, type ReactNode } from "react";
import * as Tooltip from "@radix-ui/react-tooltip";
import {
  Sun,
  Moon,
  BarChart3,
  CalendarDays,
  ChevronLeft,
  ChevronRight,
  ListFilter,
  Plus,
  Bell,
  ListTodo,
} from "lucide-react";
import { ActionButton } from "@/components/nexus/Page";
import { addCivilDays, formatCivil } from "./calendar-domain";
import { useAgendaAppearance } from "./AgendaAppearance";
import { AgendaFiltersPanel } from "./AgendaFiltersPanel";
import type { AgendaSearch } from "./types";

export function AgendaToolbar({
  org,
  search,
  date,
  today,
  start,
  end,
  busy,
  canCreate,
  canTeam,
  onSearch,
  onCreate,
  onDenied,
}: {
  org: string;
  search: AgendaSearch;
  date: string;
  today: string;
  start: string;
  end: string;
  busy: boolean;
  canCreate: boolean;
  canTeam: boolean;
  onSearch: (patch: Partial<AgendaSearch>) => void;
  onCreate: () => void;
  onDenied: (error: unknown) => void;
}) {
  const { theme, toggle } = useAgendaAppearance();
  const [filters, setFilters] = useState(false),
    [custom, setCustom] = useState(false);
  const dashboard = search.painel === "dashboard";
  const scope =
    search.foco === "equipe" || (search.foco !== "minha" && search.pendentesEquipe)
      ? "equipe"
      : "minha";
  const active = [
    search.busca,
    search.estado,
    search.tipo,
    search.equipe,
    search.pessoa,
    search.cliente,
    search.projeto,
    search.natureza,
    search.hora >= 0,
  ].filter(Boolean).length;
  const changeMonth = (delta: number) => {
    const d = new Date(date + "T12:00:00Z");
    d.setUTCMonth(d.getUTCMonth() + delta, 1);
    onSearch({ data: d.toISOString().slice(0, 10), inicio: "", fim: "", dia: "", pagina: 0 });
  };
  const move = (delta: number) =>
    dashboard || search.vista === "mes"
      ? changeMonth(delta)
      : onSearch({ data: addCivilDays(date, delta * 7), inicio: "", fim: "", dia: "", pagina: 0 });
  return (
    <>
      <div className="agenda-toolbar">
        <div className="agenda-orientation">
          {dashboard ? (
            <h1>Dashboard da agenda</h1>
          ) : (
            <h1 className="sr-only">Compromissos da equipe</h1>
          )}
          <div className="agenda-period-nav">
            <ActionButton variant="ghost" aria-label="Período anterior" onClick={() => move(-1)}>
              <ChevronLeft size={18} />
            </ActionButton>
            <ActionButton
              variant="ghost"
              onClick={() => onSearch({ data: today, inicio: "", fim: "", dia: "", pagina: 0 })}
            >
              Hoje
            </ActionButton>
            <ActionButton variant="ghost" aria-label="Próximo período" onClick={() => move(1)}>
              <ChevronRight size={18} />
            </ActionButton>
            <label className="agenda-date">
              <span className="sr-only">Data da agenda</span>
              {dashboard && (
                <span className="agenda-month-label" aria-hidden="true">
                  {formatCivil(date, { month: "short", year: "numeric" })}
                  <CalendarDays size={17} />
                </span>
              )}
              <input
                aria-label="Data da agenda"
                type={dashboard ? "month" : "date"}
                value={dashboard ? date.slice(0, 7) : date}
                onChange={(e) =>
                  onSearch({
                    data: dashboard ? e.target.value + "-01" : e.target.value,
                    inicio: "",
                    fim: "",
                    dia: "",
                    pagina: 0,
                  })
                }
              />
            </label>
          </div>
          <IconButton
            label={theme === "dark" ? "Ativar modo claro" : "Ativar modo noite"}
            pressed={theme === "light"}
            onClick={toggle}
          >
            {theme === "dark" ? <Sun size={18} /> : <Moon size={18} />}
          </IconButton>
        </div>
        <div className="agenda-command-actions">
          {!dashboard && (
            <label>
              <span className="sr-only">Visualização</span>
              <select
                aria-label="Visualização"
                value={search.vista}
                onChange={(e) =>
                  onSearch({ vista: e.target.value as AgendaSearch["vista"], dia: "", pagina: 0 })
                }
              >
                <option value="lista">Lista</option>
                <option value="semana">Semana</option>
                <option value="mes">Mês</option>
              </select>
            </label>
          )}
          {dashboard && (
            <ActionButton variant="ghost" aria-expanded={custom} onClick={() => setCustom(!custom)}>
              Período
            </ActionButton>
          )}
          <IconButton label="Filtros da agenda" pressed={filters} onClick={() => setFilters(true)}>
            <ListFilter size={18} />
            {active > 0 && <span className="agenda-filter-count">{active}</span>}
          </IconButton>
          <IconButton
            label="Dashboard da agenda"
            pressed={dashboard}
            onClick={() =>
              onSearch({
                painel: dashboard ? "agenda" : "dashboard",
                evento: "",
                acao: "",
                pagina: 0,
                dia: "",
              })
            }
          >
            {dashboard ? <CalendarDays size={18} /> : <BarChart3 size={18} />}
          </IconButton>
          {canCreate && (
            <ActionButton className="agenda-create" disabled={busy} onClick={onCreate}>
              <Plus size={18} />
              <span>Novo evento</span>
            </ActionButton>
          )}
        </div>
      </div>
      {dashboard && custom && (
        <form
          className="agenda-custom-period"
          onSubmit={(e) => {
            e.preventDefault();
            const data = new FormData(e.currentTarget),
              inicio = String(data.get("inicio")),
              last = String(data.get("fim"));
            if (inicio && last >= inicio) {
              onSearch({ inicio, fim: addCivilDays(last, 1), pagina: 0 });
              setCustom(false);
            }
          }}
        >
          <label>
            De
            <input name="inicio" type="date" defaultValue={start} required />
          </label>
          <label>
            Até
            <input
              name="fim"
              type="date"
              defaultValue={addCivilDays(end, -1)}
              min={start}
              required
            />
          </label>
          <ActionButton type="submit">Aplicar período</ActionButton>
        </form>
      )}
      {!dashboard && (
        <div className="agenda-context-line">
          <p>
            {formatCivil(start, { day: "numeric", month: "short" })} —{" "}
            {formatCivil(addCivilDays(end, -1), {
              day: "numeric",
              month: "short",
              year: "numeric",
            })}
          </p>
          <nav aria-label="Entradas contextuais da agenda">
            <button
              type="button"
              aria-pressed={search.foco === "pendentes"}
              onClick={() =>
                onSearch({
                  foco: search.foco === "pendentes" ? scope : "pendentes",
                  pendentesEquipe: scope === "equipe",
                  pagina: 0,
                  evento: "",
                  acao: "",
                })
              }
            >
              <ListTodo size={16} />
              Sem horário
            </button>
            <button
              type="button"
              aria-label="Notificações da agenda"
              aria-pressed={search.foco === "notificacoes"}
              onClick={() =>
                onSearch({
                  foco: search.foco === "notificacoes" ? scope : "notificacoes",
                  pendentesEquipe: scope === "equipe",
                  pagina: 0,
                  evento: "",
                  acao: "",
                })
              }
            >
              <Bell size={16} />
            </button>
          </nav>
        </div>
      )}
      {filters && (
        <AgendaFiltersPanel
          org={org}
          search={search}
          canTeam={canTeam}
          onDenied={onDenied}
          onClose={() => setFilters(false)}
          onApply={(patch) => {
            onSearch({ ...patch, pagina: 0, dia: "" });
            setFilters(false);
          }}
        />
      )}
    </>
  );
}
function IconButton({
  label,
  pressed,
  onClick,
  children,
}: {
  label: string;
  pressed: boolean;
  onClick: () => void;
  children: ReactNode;
}) {
  return (
    <Tooltip.Provider delayDuration={300}>
      <Tooltip.Root>
        <Tooltip.Trigger asChild>
          <button
            type="button"
            className="agenda-icon-button"
            aria-label={label}
            aria-pressed={pressed}
            onClick={onClick}
          >
            {children}
          </button>
        </Tooltip.Trigger>
        <Tooltip.Portal>
          <Tooltip.Content className="agenda-tooltip" sideOffset={6}>
            {label}
          </Tooltip.Content>
        </Tooltip.Portal>
      </Tooltip.Root>
    </Tooltip.Provider>
  );
}
