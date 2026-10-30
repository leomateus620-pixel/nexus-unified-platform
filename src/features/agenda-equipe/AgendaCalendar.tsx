import { CalendarPlus, ChevronRight } from "lucide-react";
import { formatCivil } from "./calendar-domain";
import { AgendaEventCard } from "./AgendaEventCard";

/** Modelo de apresentação. O adapter será preenchido somente pelo DTO autorizado do backend. */
export type AgendaCalendarItem = {
  id: string;
  titulo: string;
  periodo: string;
  periodoCurto: string;
  estado: string;
  tipo: string;
  responsavel: string | null;
  origem: string;
  origemCurta: string;
  diasVisiveis: readonly string[];
  diaInteiro: boolean;
  estadoCanonico?: string;
  inicio?: string;
  fim?: string;
  dataInicio?: string | null;
  dataFim?: string | null;
  descricao?: string | null;
  local?: string | null;
  cliente?: string | null;
  projeto?: string | null;
  pessoas?: readonly { pessoa_id: string; nome: string; funcao: string; confirmacao: string }[];
};
type Props = {
  view: "semana" | "mes" | "lista";
  days: readonly string[];
  items: readonly AgendaCalendarItem[];
  /** Contagem da fonte autorizada; ausência não significa zero. */
  dayCounts: Readonly<Record<string, number | undefined>>;
  selectedDay: string;
  today: string;
  timezone: string;
  onOpen: (id: string) => void;
  onDay: (day: string) => void;
  onCreate?: ((day: string) => void) | undefined;
};
export function AgendaCalendar(props: Props) {
  const isList = props.view === "lista";
  return (
    <div className="min-w-0 space-y-3">
      {!isList && (
        <div className="hidden min-w-0 xl:block">
          <section
            aria-label={props.view === "mes" ? "Calendário mensal da equipe" : "Semana da equipe"}
            className="overflow-hidden rounded-lg border border-border bg-card"
          >
            <div
              aria-hidden="true"
              className="grid grid-cols-7 border-b border-border bg-muted/30 text-center text-xs font-medium text-muted-foreground"
            >
              {["Segunda", "Terça", "Quarta", "Quinta", "Sexta", "Sábado", "Domingo"].map((day) => (
                <div key={day} className="px-2 py-2">
                  {day}
                </div>
              ))}
            </div>
            <ol className="grid grid-cols-7">
              {props.days.map((day) => (
                <CalendarDay key={day} {...props} day={day} compact={props.view === "mes"} />
              ))}
            </ol>
          </section>
        </div>
      )}
      <div className={isList ? "min-w-0" : "min-w-0 xl:hidden"}>
        {props.items.length ? (
          <ol aria-label="Atividades em ordem cronológica" className="agenda-event-list">
            {props.items.map((item) => (
              <li key={item.id}>
                <AgendaEventCard item={item} onOpen={props.onOpen} />
              </li>
            ))}
          </ol>
        ) : (
          <div className="agenda-empty">
            <CalendarPlus size={28} aria-hidden="true" />
            <h2>Nenhum compromisso neste período</h2>
            <p>Os próximos eventos aparecerão aqui.</p>
          </div>
        )}
      </div>
    </div>
  );
}
function EventButton({
  item,
  onOpen,
  compact = false,
  calendar = false,
}: {
  item: AgendaCalendarItem;
  onOpen: Props["onOpen"];
  compact?: boolean;
  calendar?: boolean;
}) {
  return (
    <button
      type="button"
      onClick={() => onOpen(item.id)}
      className="min-h-11 w-full min-w-0 rounded-md border border-border bg-background p-3 text-left text-sm transition-colors hover:border-primary/60 hover:bg-accent focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
      aria-label={item.titulo + ". " + item.periodo + ". " + item.estado + ". " + item.origem}
    >
      <span className="block break-words text-sm font-medium tabular-nums text-muted-foreground">
        {calendar ? item.periodoCurto : item.periodo}
      </span>
      <span
        className={
          compact
            ? "mt-1 line-clamp-2 break-words font-medium"
            : "mt-1 block break-words font-medium"
        }
      >
        {item.titulo}
      </span>
      <span className="mt-1 block break-words text-xs text-muted-foreground">
        {item.tipo} · {item.estado}
      </span>
      {!compact && (
        <>
          <span
            className={
              calendar ? "mt-1 line-clamp-1 break-words text-xs" : "mt-1 block break-words text-xs"
            }
            title={item.responsavel ?? undefined}
          >
            {item.responsavel || "Responsável não disponível neste recorte"}
          </span>
          <span
            className="mt-1 block break-words text-xs text-muted-foreground"
            title={item.origem}
          >
            {calendar ? item.origemCurta : item.origem}
          </span>
        </>
      )}
    </button>
  );
}
function CalendarDay({ day, compact, ...props }: Props & { day: string; compact: boolean }) {
  const items = props.items.filter((item) => item.diasVisiveis.includes(day));
  const shown = compact ? items.slice(0, 3) : items;
  const total = props.dayCounts[day];
  const more = total !== undefined ? total > shown.length : items.length > shown.length;
  const label = formatCivil(day, {
    weekday: "long",
    day: "2-digit",
    month: "long",
  });
  return (
    <li
      className={
        (compact ? "min-h-40 " : "min-h-72 ") +
        "min-w-0 border-b border-r border-border p-2 last:border-r-0"
      }
    >
      <div className="mb-2 flex min-w-0 items-start justify-between gap-1">
        <h3>
          <button
            type="button"
            aria-label={"Abrir " + label}
            aria-current={day === props.today ? "date" : undefined}
            onClick={() => props.onDay(day)}
            className={
              (day === props.selectedDay
                ? "border-primary bg-primary/10 "
                : "border-transparent ") +
              "min-h-11 rounded-md border px-2 text-sm font-semibold tabular-nums hover:bg-accent focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
            }
          >
            {formatCivil(day)}
          </button>
        </h3>
        {props.onCreate && (
          <button
            type="button"
            onClick={() => props.onCreate?.(day)}
            aria-label={"Agendar em " + label}
            className="inline-flex min-h-11 min-w-11 items-center justify-center rounded-md text-muted-foreground hover:bg-accent focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
          >
            <CalendarPlus size={16} aria-hidden="true" />
          </button>
        )}
      </div>
      <ul className="grid min-w-0 gap-2">
        {shown.map((item) => (
          <li key={item.id} className="min-w-0">
            <EventButton item={item} compact={compact} calendar onOpen={props.onOpen} />
          </li>
        ))}
      </ul>
      {!shown.length && (
        <p className="px-2 py-3 text-xs text-muted-foreground">
          {total === 0
            ? "Sem agendamentos"
            : total
              ? total + " atividades no dia"
              : "Sem itens exibidos nesta página"}
        </p>
      )}
      {more && (
        <button
          type="button"
          onClick={() => props.onDay(day)}
          className="mt-2 inline-flex min-h-11 w-full items-center justify-between gap-1 rounded px-2 text-left text-xs font-medium text-primary hover:bg-accent focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
        >
          {total !== undefined ? "Ver atividades do dia (" + total + ")" : "Ver o dia"}
          <ChevronRight size={14} aria-hidden="true" />
        </button>
      )}
    </li>
  );
}
