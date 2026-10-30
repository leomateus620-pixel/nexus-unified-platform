import { useState, type ReactNode } from "react";
import { ArrowUpRight } from "lucide-react";
import type { DashboardAgenda } from "../types";
import { countLabel, initials, number } from "./presentation";
export function SummaryCard({
  icon,
  title,
  children,
  className = "",
}: {
  icon: ReactNode;
  title: string;
  children: ReactNode;
  className?: string;
}) {
  return (
    <section className={`agenda-dashboard-summary ${className}`}>
      <header>
        <span className="agenda-dashboard-icon" aria-hidden="true">
          {icon}
        </span>
        <h2>{title}</h2>
      </header>
      {children}
    </section>
  );
}

export function EmptyMetric({ children = "Sem eventos neste período" }: { children?: ReactNode }) {
  return <p className="agenda-dashboard-empty-metric">{children}</p>;
}

export function PeakMetric({
  value,
  context,
  count,
  onClick,
  children,
  formatCount = countLabel,
}: {
  value: ReactNode;
  context?: ReactNode;
  count: number;
  formatCount?: (value: number) => string;
  onClick: () => void;
  children?: ReactNode;
}) {
  return (
    <>
      <button type="button" className="agenda-dashboard-peak" onClick={onClick}>
        <strong>{value}</strong>
        {context ? <span>{context}</span> : null}
        <b>
          {formatCount(count)} <ArrowUpRight size={15} aria-hidden="true" />
        </b>
      </button>
      {children}
    </>
  );
}

export function PeopleRanking({
  people,
  onPerson,
}: {
  people: DashboardAgenda["pessoas"];
  onPerson: (id: string) => void;
}) {
  const [expanded, setExpanded] = useState(false);
  const top = people.filter((person) => person.total > 0);
  const maximum = top[0]?.total || 1;
  return (
    <>
      {top.length ? (
        <ol className="agenda-dashboard-people">
          {(expanded ? top : top.slice(0, 5)).map((person) => (
            <li key={person.pessoa_id}>
              <button
                type="button"
                onClick={() => onPerson(person.pessoa_id)}
                aria-label={`${person.nome}: ${countLabel(person.total)}. Abrir eventos.`}
              >
                <span className="agenda-dashboard-avatar" aria-hidden="true">
                  {initials(person.nome)}
                </span>
                <span className="agenda-dashboard-rank-body">
                  <span>{person.nome}</span>
                  <span className="agenda-dashboard-track" aria-hidden="true">
                    <span style={{ width: `${(person.total / maximum) * 100}%` }} />
                  </span>
                </span>
                <b>{number.format(person.total)}</b>
              </button>
            </li>
          ))}
        </ol>
      ) : (
        <EmptyMetric>Nenhuma pessoa com eventos</EmptyMetric>
      )}
      {top.length > 5 && (
        <button
          type="button"
          className="agenda-dashboard-text-button"
          onClick={() => setExpanded((current) => !current)}
          aria-expanded={expanded}
        >
          {expanded ? "Mostrar Top 5" : `Ver todas (${top.length})`}
        </button>
      )}
    </>
  );
}
