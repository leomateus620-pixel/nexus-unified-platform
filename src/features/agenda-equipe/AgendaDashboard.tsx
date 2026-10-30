import { useEffect, useState } from "react";
import { ArrowUpRight, BarChart3, CalendarDays, Clock3, Layers3, UsersRound } from "lucide-react";
import { ErrorState } from "@/components/nexus/Page";
import { useAgendaDashboard } from "./queries";
import { acessoAgendaNegado } from "./domain";
import { addCivilDays, civilInZone, formatCivil } from "./calendar-domain";
import type { AgendaDashboardInput, AgendaSearch, DashboardAgenda } from "./types";
import {
  SummaryCard,
  EmptyMetric,
  PeakMetric,
  PeopleRanking,
} from "./dashboard/DashboardPrimitives";
import { DistributionChart } from "./dashboard/DistributionChart";
import { WeeklyHours, CategoryRanking } from "./dashboard/DashboardPanels";
import {
  categoryLabel,
  countLabel,
  hourLabel,
  minutesLabel,
  occupancyLabel,
} from "./dashboard/presentation";
import "./dashboard.css";

export type AgendaDashboardProps = {
  input: AgendaDashboardInput;
  onDrilldown: (patch: Partial<AgendaSearch>) => void;
  onDenied?: (error: unknown) => void;
};

function DashboardBoard({
  data,
  onDrilldown,
}: {
  data: DashboardAgenda;
  onDrilldown: AgendaDashboardProps["onDrilldown"];
}) {
  const maxDay = Math.max(0, ...data.dias.map((day) => day.total));
  const peakDays = maxDay ? data.dias.filter((day) => day.total === maxDay) : [];
  const maxHour = Math.max(0, ...data.horas.map((hour) => hour.total));
  const peakHours = maxHour ? data.horas.filter((hour) => hour.total === maxHour) : [];
  const maxCategory = Math.max(0, ...data.categorias.map((category) => category.total));
  const peakCategories = maxCategory
    ? data.categorias.filter((category) => category.total === maxCategory)
    : [];
  const firstDay = peakDays[0],
    firstHour = peakHours[0],
    firstCategory = peakCategories[0];
  const [selectedWeek, setSelectedWeek] = useState(() => {
    const today = civilInZone(new Date().toISOString(), "America/Sao_Paulo");
    return (
      (
        data.semanas.find(
          (week) =>
            today >= data.inicio && today < data.fim && week.inicio <= today && week.fim > today,
        ) ??
        data.semanas.find((week) => week.pessoas.some((person) => person.minutos > 0)) ??
        data.semanas[0]
      )?.inicio ?? ""
    );
  });
  const topWeek = data.semanas.find((week) => week.inicio === selectedWeek) ?? data.semanas[0];
  const topWeekPerson = topWeek?.pessoas
    .slice()
    .sort((left, right) => right.minutos - left.minutos)[0];
  const [showDayTies, setShowDayTies] = useState(false),
    [showHourTies, setShowHourTies] = useState(false),
    [showCategoryTies, setShowCategoryTies] = useState(false);
  const person = (id: string) => onDrilldown({ demanda: true, pessoa: id, dia: "", hora: -1 });
  const category = (tipo: string) =>
    onDrilldown({ demanda: true, tipo: tipo as AgendaSearch["tipo"], dia: "", hora: -1 });
  return (
    <div className="agenda-dashboard">
      <div className="agenda-dashboard-context">
        <span>{countLabel(data.total)} agendados no período</span>
        <span>São Paulo · atualização automática</span>
      </div>
      <div className="agenda-dashboard-summaries">
        <SummaryCard
          icon={<UsersRound size={19} />}
          title="Pessoas com mais eventos"
          className="agenda-dashboard-people-card"
        >
          <PeopleRanking people={data.pessoas} onPerson={person} />
        </SummaryCard>
        <SummaryCard icon={<CalendarDays size={19} />} title="Dia com mais eventos">
          {firstDay ? (
            <PeakMetric
              value={formatCivil(firstDay.data, { day: "2-digit", month: "short" })}
              context={formatCivil(firstDay.data, { weekday: "long" })}
              count={firstDay.total}
              onClick={() => onDrilldown({ demanda: true, dia: firstDay.data, hora: -1 })}
            >
              {peakDays.length > 1 && (
                <>
                  <button
                    type="button"
                    className="agenda-dashboard-text-button"
                    aria-expanded={showDayTies}
                    onClick={() => setShowDayTies((current) => !current)}
                  >
                    Empate entre {peakDays.length} dias
                  </button>
                  {showDayTies && (
                    <div className="agenda-dashboard-ties">
                      {peakDays.map((day) => (
                        <button
                          type="button"
                          key={day.data}
                          onClick={() => onDrilldown({ demanda: true, dia: day.data, hora: -1 })}
                        >
                          {formatCivil(day.data)} · {countLabel(day.total)}
                        </button>
                      ))}
                    </div>
                  )}
                </>
              )}
            </PeakMetric>
          ) : (
            <EmptyMetric />
          )}
        </SummaryCard>
        <SummaryCard icon={<Clock3 size={19} />} title="Horário com maior demanda">
          {firstHour ? (
            <PeakMetric
              value={hourLabel(firstHour.hora)}
              context="Ocupações por faixa de 1 hora"
              formatCount={occupancyLabel}
              count={firstHour.total}
              onClick={() => onDrilldown({ demanda: true, hora: firstHour.hora, dia: "" })}
            >
              {peakHours.length > 1 && (
                <>
                  <button
                    type="button"
                    className="agenda-dashboard-text-button"
                    aria-expanded={showHourTies}
                    onClick={() => setShowHourTies((current) => !current)}
                  >
                    Empate entre {peakHours.length} faixas
                  </button>
                  {showHourTies && (
                    <div className="agenda-dashboard-ties">
                      {peakHours.map((hour) => (
                        <button
                          type="button"
                          key={hour.hora}
                          onClick={() => onDrilldown({ demanda: true, hora: hour.hora, dia: "" })}
                        >
                          {hourLabel(hour.hora)} · {occupancyLabel(hour.total)}
                        </button>
                      ))}
                    </div>
                  )}
                </>
              )}
            </PeakMetric>
          ) : (
            <EmptyMetric>Nenhum evento com horário</EmptyMetric>
          )}
        </SummaryCard>
        <SummaryCard icon={<Layers3 size={19} />} title="Categoria com mais eventos">
          {firstCategory ? (
            <PeakMetric
              value={categoryLabel(firstCategory.tipo)}
              context="Categoria operacional"
              count={firstCategory.total}
              onClick={() => category(firstCategory.tipo)}
            >
              {peakCategories.length > 1 && (
                <>
                  <button
                    type="button"
                    className="agenda-dashboard-text-button"
                    aria-expanded={showCategoryTies}
                    onClick={() => setShowCategoryTies((current) => !current)}
                  >
                    Empate entre {peakCategories.length} categorias
                  </button>
                  {showCategoryTies && (
                    <div className="agenda-dashboard-ties">
                      {peakCategories.map((entry) => (
                        <button type="button" key={entry.tipo} onClick={() => category(entry.tipo)}>
                          {categoryLabel(entry.tipo)} · {countLabel(entry.total)}
                        </button>
                      ))}
                    </div>
                  )}
                </>
              )}
            </PeakMetric>
          ) : (
            <EmptyMetric />
          )}
        </SummaryCard>
        <SummaryCard icon={<BarChart3 size={19} />} title="Horas por pessoa na semana">
          {topWeek && topWeekPerson && topWeekPerson.minutos > 0 ? (
            <button
              type="button"
              className="agenda-dashboard-peak"
              onClick={() =>
                onDrilldown({
                  demanda: true,
                  pessoa: topWeekPerson.pessoa_id,
                  inicio: topWeek.inicio < data.inicio ? data.inicio : topWeek.inicio,
                  fim: topWeek.fim > data.fim ? data.fim : topWeek.fim,
                  dia: "",
                  hora: -1,
                })
              }
            >
              <strong>{minutesLabel(topWeekPerson.minutos)}</strong>
              <span>{topWeekPerson.nome}</span>
              <b>
                {formatCivil(topWeek.inicio)} – {formatCivil(addCivilDays(topWeek.fim, -1))}
                <ArrowUpRight size={15} aria-hidden="true" />
              </b>
              {topWeek.parcial && <small>Semana parcial</small>}
            </button>
          ) : (
            <EmptyMetric>Sem horas agendadas nesta semana</EmptyMetric>
          )}
        </SummaryCard>
      </div>
      <div className="agenda-dashboard-charts">
        <section className="agenda-dashboard-panel" aria-labelledby="agenda-days-title">
          <header className="agenda-dashboard-panel-header">
            <div>
              <span className="agenda-dashboard-eyebrow">Distribuição no período</span>
              <h2 id="agenda-days-title">Eventos por dia</h2>
            </div>
            <span className="agenda-dashboard-unit">eventos / dia</span>
          </header>
          <DistributionChart
            label="Eventos por dia"
            points={data.dias.map((day) => ({
              key: day.data,
              label:
                data.inicio.slice(0, 7) === addCivilDays(data.fim, -1).slice(0, 7)
                  ? day.data.slice(8)
                  : formatCivil(day.data),
              fullLabel: formatCivil(day.data, { day: "2-digit", month: "long", weekday: "short" }),
              total: day.total,
            }))}
            onOpen={(point) => onDrilldown({ demanda: true, dia: point.key, hora: -1 })}
            empty="Nenhum evento agendado neste período."
            help="Cada evento conta uma vez em cada dia ocupado. Eventos de vários dias podem aparecer em mais de uma barra."
          />
        </section>
        <section className="agenda-dashboard-panel" aria-labelledby="agenda-hours-title">
          <header className="agenda-dashboard-panel-header">
            <div>
              <span className="agenda-dashboard-eyebrow">Ocupação da agenda</span>
              <h2 id="agenda-hours-title">Demanda por horário</h2>
            </div>
            <span className="agenda-dashboard-unit">eventos × dia</span>
          </header>
          <DistributionChart
            label="Ocupação por faixa horária"
            formatCount={occupancyLabel}
            points={data.horas.map((hour) => ({
              key: String(hour.hora),
              label: `${String(hour.hora).padStart(2, "0")}h`,
              fullLabel: hourLabel(hour.hora),
              total: hour.total,
            }))}
            onOpen={(point) => onDrilldown({ demanda: true, hora: Number(point.key), dia: "" })}
            empty="Nenhum evento com horário neste período."
            help="Cada par evento/data conta uma vez por faixa ocupada. Dia inteiro fica fora; o término exato não ocupa a faixa seguinte."
          />
        </section>
      </div>
      <div className="agenda-dashboard-lower">
        <WeeklyHours
          weeks={data.semanas}
          selected={selectedWeek}
          onSelect={setSelectedWeek}
          onPerson={(id, inicio, fim) =>
            onDrilldown({
              demanda: true,
              pessoa: id,
              inicio: inicio < data.inicio ? data.inicio : inicio,
              fim: fim > data.fim ? data.fim : fim,
              dia: "",
              hora: -1,
            })
          }
        />
        <CategoryRanking categories={data.categorias} onCategory={category} />
      </div>
      <p className="agenda-dashboard-help agenda-dashboard-footer">
        Dados do período completo e do seu acesso. Rascunhos e cancelados não entram nos
        indicadores. Responsável e participantes operacionais contam uma vez por pessoa;
        observadores e recusas ficam fora.
      </p>
    </div>
  );
}

export default function AgendaDashboard({ input, onDrilldown, onDenied }: AgendaDashboardProps) {
  const result = useAgendaDashboard(input);
  useEffect(() => {
    if (acessoAgendaNegado(result.error)) onDenied?.(result.error);
  }, [result.error, onDenied]);
  if (result.isError)
    return (
      <div className="agenda-dashboard">
        <ErrorState error={result.error} onRetry={() => result.refetch()} />
      </div>
    );
  if (result.isPending)
    return (
      <div className="agenda-dashboard" role="status" aria-label="Carregando indicadores da agenda">
        <div className="agenda-dashboard-summaries">
          {Array.from({ length: 5 }, (_, index) => (
            <div key={index} className="agenda-dashboard-summary agenda-dashboard-skeleton">
              <span />
              <span />
              <span />
            </div>
          ))}
        </div>
        <p className="sr-only">Consultando todos os eventos autorizados do período…</p>
      </div>
    );
  return (
    <DashboardBoard key={JSON.stringify(input)} data={result.data} onDrilldown={onDrilldown} />
  );
}
