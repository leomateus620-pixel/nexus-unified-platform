import { ArrowUpRight, ChevronLeft, ChevronRight, Layers3 } from "lucide-react";
import type { DashboardAgenda } from "../types";
import { addCivilDays, formatCivil } from "../calendar-domain";
import { EmptyMetric } from "./DashboardPrimitives";
import { categoryLabel, initials, minutesLabel, number } from "./presentation";
export function WeeklyHours({
  weeks,
  selected,
  onSelect,
  onPerson,
}: {
  weeks: DashboardAgenda["semanas"];
  selected: string;
  onSelect: (start: string) => void;
  onPerson: (id: string, start: string, end: string) => void;
}) {
  const week = weeks.find((entry) => entry.inicio === selected) ?? weeks[0];
  const index = week ? weeks.indexOf(week) : -1;
  const maximum = Math.max(0, ...(week?.pessoas.map((person) => person.minutos) ?? []));
  return (
    <section
      className="agenda-dashboard-panel agenda-dashboard-weekly"
      aria-labelledby="agenda-weekly-title"
    >
      <header className="agenda-dashboard-panel-header">
        <div>
          <span className="agenda-dashboard-eyebrow">Horas agendadas</span>
          <h2 id="agenda-weekly-title">Por pessoa, por semana</h2>
        </div>
        <div className="agenda-dashboard-week-nav">
          <button
            type="button"
            aria-label="Semana anterior"
            disabled={index <= 0}
            onClick={() => onSelect(weeks[index - 1]!.inicio)}
          >
            <ChevronLeft size={17} aria-hidden="true" />
          </button>
          <span>
            {week
              ? `${formatCivil(week.inicio)} – ${formatCivil(addCivilDays(week.fim, -1))}`
              : "Sem período"}
          </span>
          <button
            type="button"
            aria-label="Próxima semana"
            disabled={index < 0 || index >= weeks.length - 1}
            onClick={() => onSelect(weeks[index + 1]!.inicio)}
          >
            <ChevronRight size={17} aria-hidden="true" />
          </button>
        </div>
      </header>
      {week?.parcial && (
        <p className="agenda-dashboard-partial">
          Semana parcialmente coberta pelo período selecionado.
        </p>
      )}
      {week?.pessoas.length ? (
        <ol className="agenda-dashboard-hours-ranking">
          {week.pessoas.map((person) => (
            <li key={person.pessoa_id}>
              <button
                type="button"
                disabled={!person.minutos}
                onClick={() => onPerson(person.pessoa_id, week.inicio, week.fim)}
                aria-label={`${person.nome}: ${minutesLabel(person.minutos)} agendadas nesta semana. Abrir eventos.`}
              >
                <span className="agenda-dashboard-avatar" aria-hidden="true">
                  {initials(person.nome)}
                </span>
                <span className="agenda-dashboard-rank-body">
                  <span>{person.nome}</span>
                  <span className="agenda-dashboard-track" aria-hidden="true">
                    <span style={{ width: `${maximum ? (person.minutos / maximum) * 100 : 0}%` }} />
                  </span>
                </span>
                <b>{minutesLabel(person.minutos)}</b>
              </button>
            </li>
          ))}
        </ol>
      ) : (
        <EmptyMetric>Nenhuma pessoa elegível neste recorte</EmptyMetric>
      )}
      <p className="agenda-dashboard-help">
        Intervalos sobrepostos contam uma única vez por pessoa. Dia inteiro sem jornada não entra
        nas horas.
      </p>
    </section>
  );
}

export function CategoryRanking({
  categories,
  onCategory,
}: {
  categories: DashboardAgenda["categorias"];
  onCategory: (category: string) => void;
}) {
  const maximum = categories[0]?.total || 1;
  return (
    <section className="agenda-dashboard-panel" aria-labelledby="agenda-categories-title">
      <header className="agenda-dashboard-panel-header">
        <div>
          <span className="agenda-dashboard-eyebrow">Classificação operacional</span>
          <h2 id="agenda-categories-title">Eventos por categoria</h2>
        </div>
        <Layers3 size={19} aria-hidden="true" />
      </header>
      {categories.length ? (
        <ol className="agenda-dashboard-category-ranking">
          {categories.map((category, index) => (
            <li key={category.tipo}>
              <button type="button" onClick={() => onCategory(category.tipo)}>
                <span className="agenda-dashboard-rank-position">
                  {String(index + 1).padStart(2, "0")}
                </span>
                <span className="agenda-dashboard-rank-body">
                  <span>{categoryLabel(category.tipo)}</span>
                  <span className="agenda-dashboard-track" aria-hidden="true">
                    <span style={{ width: `${(category.total / maximum) * 100}%` }} />
                  </span>
                </span>
                <b>{number.format(category.total)}</b>
                <ArrowUpRight size={15} aria-hidden="true" />
              </button>
            </li>
          ))}
        </ol>
      ) : (
        <EmptyMetric>Nenhuma categoria neste recorte</EmptyMetric>
      )}
      <p className="agenda-dashboard-help">
        Categoria é a classificação persistida do evento. Evento e Ação indicam a natureza do
        registro.
      </p>
    </section>
  );
}
