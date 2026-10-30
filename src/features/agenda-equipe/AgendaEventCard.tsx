import * as Popover from "@radix-ui/react-popover";
import * as DropdownMenu from "@radix-ui/react-dropdown-menu";
import { Clock3, MapPin, MoreHorizontal, UserRound } from "lucide-react";
import { addCivilDays, civilInZone, formatCivil } from "./calendar-domain";
import { useAgendaAppearance } from "./AgendaAppearance";
import type { AgendaCalendarItem } from "./AgendaCalendar";
const zone = "America/Sao_Paulo";
const initials = (name: string) =>
  name
    .split(/\s+/)
    .filter(Boolean)
    .slice(0, 2)
    .map((w) => w[0])
    .join("");
export function AgendaEventCard({
  item,
  onOpen,
}: {
  item: AgendaCalendarItem;
  onOpen: (id: string) => void;
}) {
  const { theme } = useAgendaAppearance();
  const day =
    item.dataInicio || (item.inicio ? civilInZone(item.inicio, zone) : item.diasVisiveis[0]);
  const last =
    item.diaInteiro && item.dataFim
      ? addCivilDays(item.dataFim, -1)
      : item.fim
        ? civilInZone(new Date(new Date(item.fim).getTime() - 1).toISOString(), zone)
        : day;
  const people = item.pessoas?.length
    ? item.pessoas
    : item.responsavel
      ? [
          {
            pessoa_id: "responsavel",
            nome: item.responsavel,
            funcao: "responsavel",
            confirmacao: "pendente",
          },
        ]
      : [];
  const time = (instant: string) =>
    new Intl.DateTimeFormat("pt-BR", { timeZone: zone, hour: "2-digit", minute: "2-digit" }).format(
      new Date(instant),
    );
  return (
    <article
      className="agenda-event-card"
      data-nature={item.origemCurta === "Ação" ? "acao" : "evento"}
    >
      <button
        type="button"
        className="agenda-card-open"
        onClick={() => onOpen(item.id)}
        aria-label={`${item.titulo}. ${item.periodo}. ${item.estado}`}
      >
        <span className="agenda-card-date">
          {day && (
            <>
              <strong>{formatCivil(day, { day: "2-digit" })}</strong>
              <span className="agenda-card-month">
                {formatCivil(day, {
                  month: "short",
                  ...(day.slice(0, 4) !== new Date().getFullYear().toString()
                    ? { year: "numeric" }
                    : {}),
                })}
              </span>
              <span className="agenda-card-weekday">{formatCivil(day, { weekday: "long" })}</span>
              {last && last !== day && (
                <span className="agenda-card-multiday">
                  até {formatCivil(last, { day: "numeric", month: "short" })}
                </span>
              )}
            </>
          )}
          <span className="agenda-card-time">
            <Clock3 size={14} />
            {item.diaInteiro
              ? "Dia inteiro"
              : item.inicio && item.fim
                ? `${time(item.inicio)} — ${time(item.fim)}`
                : item.periodoCurto}
          </span>
        </span>
        <span className="agenda-card-content">
          <span className="agenda-card-title">{item.titulo}</span>
          {item.descricao && <span className="agenda-card-description">{item.descricao}</span>}
          {item.local && (
            <span className="agenda-card-location">
              <MapPin size={15} />
              {item.local}
            </span>
          )}
          {(item.cliente || item.projeto) && (
            <span className="agenda-card-client">
              {item.cliente}
              {item.projeto && item.projeto !== item.cliente
                ? (item.cliente ? " · " : "") + item.projeto
                : ""}
            </span>
          )}
          <span className="agenda-card-category">
            {item.origemCurta} · {item.tipo}
          </span>
        </span>
      </button>
      <div className="agenda-card-status">
        <span className="agenda-status" data-state={item.estadoCanonico}>
          {item.estado}
        </span>
        <DropdownMenu.Root>
          <DropdownMenu.Trigger asChild>
            <button
              type="button"
              className="agenda-icon-button"
              aria-label={`Opções de ${item.titulo}`}
            >
              <MoreHorizontal size={19} />
            </button>
          </DropdownMenu.Trigger>
          <DropdownMenu.Portal>
            <DropdownMenu.Content className="agenda-card-menu" data-theme={theme} align="end">
              <DropdownMenu.Item onSelect={() => onOpen(item.id)}>
                Abrir detalhes e ações
              </DropdownMenu.Item>
            </DropdownMenu.Content>
          </DropdownMenu.Portal>
        </DropdownMenu.Root>
      </div>
      {people.length > 0 && (
        <div className="agenda-card-people">
          <Popover.Root>
            <Popover.Trigger asChild>
              <button
                type="button"
                className="agenda-people-trigger"
                aria-label={`Pessoas de ${item.titulo}: ${people.map((p) => p.nome).join(", ")}`}
              >
                <span className="agenda-avatar-stack">
                  {people.slice(0, 3).map((p) => (
                    <span key={p.pessoa_id} className="agenda-avatar">
                      {initials(p.nome)}
                    </span>
                  ))}
                </span>
                <span className="agenda-people-caption">
                  {people.find((p) => p.funcao === "responsavel")?.nome || people[0]?.nome}
                  {people.length > 1 && <span> +{people.length - 1}</span>}
                  {people.some((p) => p.funcao === "responsavel") && <small>Responsável</small>}
                </span>
              </button>
            </Popover.Trigger>
            <Popover.Portal>
              <Popover.Content className="agenda-people-popover" data-theme={theme} sideOffset={6}>
                <h3>
                  <UserRound size={16} />
                  Pessoas
                </h3>
                <ul>
                  {people.map((p) => (
                    <li key={p.pessoa_id}>
                      <span className="agenda-avatar">{initials(p.nome)}</span>
                      <span>
                        {p.nome}
                        <small>
                          {p.funcao === "responsavel"
                            ? "Responsável"
                            : p.funcao === "observador"
                              ? "Observador"
                              : "Participante"}
                          {p.confirmacao === "recusada" ? " · recusou" : ""}
                        </small>
                      </span>
                    </li>
                  ))}
                </ul>
              </Popover.Content>
            </Popover.Portal>
          </Popover.Root>
        </div>
      )}
    </article>
  );
}
