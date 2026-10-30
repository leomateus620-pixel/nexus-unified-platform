import { useId, useState } from "react";
import { Check, Clock3, Crown, MapPin, X } from "lucide-react";
import { ActionButton } from "@/components/nexus/Page";
import { fieldClass } from "@/features/operacao/components";
import { AgendaPicker } from "./AgendaPicker";
import {
  chooseResponsible,
  durationLabel,
  exclusiveAfterDay,
  includedLastDay,
} from "./composer-domain";
import type { EventoInput } from "./types";
export type AgendaLabels = Record<string, string>;
export function AgendaEventFields({
  org,
  value,
  onChange,
  labels,
  onLabel,
  onDenied,
  originLocked = false,
  responsibleLocked = false,
  errors = {},
  action = false,
  scheduled = true,
  onScheduledChange,
  deadline = "",
  onDeadlineChange,
}: {
  org: string;
  value: EventoInput;
  onChange: (value: EventoInput) => void;
  labels: AgendaLabels;
  onLabel: (id: string, label: string) => void;
  onDenied: (e: unknown) => void;
  originLocked?: boolean;
  responsibleLocked?: boolean;
  onOriginIntent?: (kind: "independente" | "acao" | "levantamento") => void;
  errors?: Record<string, string>;
  action?: boolean;
  scheduled?: boolean;
  onScheduledChange?: ((scheduled: boolean) => void) | undefined;
  deadline?: string;
  onDeadlineChange?: ((value: string) => void) | undefined;
}) {
  const uid = useId(),
    [suggestion, setSuggestion] = useState("");
  const set = <K extends keyof EventoInput>(key: K, v: EventoInput[K]) =>
    onChange({ ...value, [key]: v });
  const field = (key: string) => ({
    "aria-invalid": !!errors[key],
    "aria-describedby": errors[key] ? uid + "-" + key : undefined,
  });
  const err = (key: string) =>
    errors[key] ? (
      <p id={uid + "-" + key} className="text-sm text-destructive">
        {errors[key]}
      </p>
    ) : null;
  const name = (id: string) => labels[id] || "Pessoa vinculada";
  const people = value.participantes.some((p) => p.pessoa_id === value.responsavel_id)
    ? value.participantes
    : value.responsavel_id
      ? [
          { pessoa_id: value.responsavel_id, funcao: "responsavel" as const },
          ...value.participantes,
        ]
      : value.participantes;
  const duration = durationLabel(value);
  const changePeriod = (
    edge: "inicio_local" | "fim_local",
    part: "date" | "time",
    next: string,
  ) => {
    const previous = value[edge] ?? "";
    const changed =
      part === "date"
        ? next + "T" + (previous.slice(11, 16) || (edge === "inicio_local" ? "08:00" : "09:00"))
        : (previous.slice(0, 10) || value.inicio_local?.slice(0, 10) || "") + "T" + next;
    const { inicio: _inicio, fim: _fim, ...rest } = value;
    onChange({ ...rest, [edge]: changed });
  };
  return (
    <div className="agenda-event-fields grid min-w-0 gap-5">
      <div className="grid gap-1.5">
        <label htmlFor={uid + "-title"} className="text-sm font-medium">
          O que vamos fazer? *
        </label>
        <input
          id={uid + "-title"}
          name="titulo"
          className={fieldClass + " agenda-title-input"}
          placeholder="Dê um título ao compromisso"
          maxLength={200}
          value={value.titulo}
          onChange={(e) => set("titulo", e.target.value)}
          {...field("titulo")}
        />
        {err("titulo")}
      </div>
      <fieldset className="agenda-period">
        <legend className="sr-only">Período</legend>
        <div className="agenda-period-heading">
          <span className="flex items-center gap-2 text-sm font-medium">
            <Clock3 size={16} aria-hidden="true" /> Período
          </span>
          {action && onScheduledChange && (
            <label className="flex min-h-11 items-center gap-2 text-sm">
              <input
                type="checkbox"
                checked={scheduled}
                onChange={(e) => onScheduledChange(e.target.checked)}
              />{" "}
              Definir horário
            </label>
          )}
          {scheduled && (
            <label className="flex min-h-11 items-center gap-2 text-sm">
              <input
                type="checkbox"
                checked={value.dia_inteiro}
                onChange={(e) => {
                  const {
                    inicio_local,
                    fim_local,
                    inicio: _inicio,
                    fim: _fim,
                    data_inicio,
                    data_fim,
                    ...rest
                  } = value;
                  if (e.target.checked) {
                    const start = inicio_local?.slice(0, 10) || "",
                      end = fim_local?.slice(0, 10) || start;
                    const exclusive =
                      end > start && fim_local?.slice(11, 16) === "00:00"
                        ? end
                        : exclusiveAfterDay(end || start);
                    onChange({
                      ...rest,
                      dia_inteiro: true,
                      data_inicio: start,
                      data_fim: exclusive,
                    });
                  } else
                    onChange({
                      ...rest,
                      dia_inteiro: false,
                      inicio_local: (data_inicio || "") + "T08:00",
                      fim_local: (includedLastDay(data_fim) || data_inicio || "") + "T09:00",
                    });
                }}
              />{" "}
              Dia inteiro
            </label>
          )}
        </div>
        {scheduled ? (
          <>
            <div className="agenda-period-grid">
              {(["inicio", "fim"] as const).map((edge) => {
                const first = edge === "inicio",
                  key = first ? "inicio_local" : "fim_local";
                return (
                  <div className="agenda-period-edge" key={edge}>
                    <span className="text-xs font-semibold uppercase tracking-wider opacity-65">
                      {first ? "Início" : "Término"}
                    </span>
                    {value.dia_inteiro ? (
                      <input
                        className={fieldClass}
                        type="date"
                        aria-label={first ? "Primeiro dia" : "Último dia"}
                        value={first ? value.data_inicio || "" : includedLastDay(value.data_fim)}
                        onChange={(e) =>
                          set(
                            first ? "data_inicio" : "data_fim",
                            first ? e.target.value : exclusiveAfterDay(e.target.value),
                          )
                        }
                        {...field(first ? "data_inicio" : "data_fim")}
                      />
                    ) : (
                      <div className="agenda-date-time">
                        <input
                          className={fieldClass}
                          type="date"
                          aria-label={first ? "Data de início" : "Data de término"}
                          value={value[key]?.slice(0, 10) || ""}
                          onChange={(e) => changePeriod(key, "date", e.target.value)}
                          {...field(key)}
                        />
                        <input
                          className={fieldClass}
                          type="time"
                          step={60}
                          aria-label={first ? "Hora de início" : "Hora de término"}
                          value={value[key]?.slice(11, 16) || ""}
                          onChange={(e) => changePeriod(key, "time", e.target.value)}
                          {...field(key)}
                        />
                      </div>
                    )}
                    {err(value.dia_inteiro ? (first ? "data_inicio" : "data_fim") : key)}
                    {!first && err("fim")}
                  </div>
                );
              })}
            </div>
            {duration && (
              <p className="agenda-duration">
                <Check size={14} aria-hidden="true" /> {duration}
                {value.dia_inteiro ? " · último dia incluído" : " de duração"}
              </p>
            )}
          </>
        ) : (
          <div className="grid gap-2">
            <p className="text-sm text-muted-foreground">
              Sem horário. A ação fica na lista da equipe.
            </p>
            {onDeadlineChange && (
              <label className="grid gap-1 text-sm">
                Prazo opcional
                <input
                  type="date"
                  className={fieldClass}
                  value={deadline}
                  onChange={(e) => onDeadlineChange(e.target.value)}
                />
              </label>
            )}
          </div>
        )}
      </fieldset>
      <fieldset className="grid min-w-0 gap-2">
        <legend className="mb-2 text-sm font-medium">Pessoas *</legend>
        {people.length > 0 && (
          <ul className="agenda-people-chips">
            {people.map((person) => (
              <li
                key={person.pessoa_id}
                className="agenda-person-chip"
                data-responsible={person.funcao === "responsavel" || undefined}
              >
                <span className="agenda-person-initials" aria-hidden="true">
                  {name(person.pessoa_id)
                    .split(" ")
                    .filter(Boolean)
                    .slice(0, 2)
                    .map((s) => s[0])
                    .join("")}
                </span>
                <span className="min-w-0">
                  <span className="block truncate font-medium">{name(person.pessoa_id)}</span>
                  <span className="block text-xs opacity-65">
                    {person.funcao === "responsavel"
                      ? "Responsável"
                      : person.funcao === "observador"
                        ? "Observador"
                        : "Participante"}
                  </span>
                </span>
                {person.funcao !== "responsavel" &&
                  !responsibleLocked &&
                  person.funcao !== "observador" && (
                    <button
                      type="button"
                      className="agenda-chip-icon"
                      title="Definir como responsável"
                      aria-label={`Definir ${name(person.pessoa_id)} como responsável`}
                      onClick={() =>
                        onChange(
                          chooseResponsible({ ...value, participantes: people }, person.pessoa_id),
                        )
                      }
                    >
                      <Crown size={15} aria-hidden="true" />
                    </button>
                  )}
                {(!responsibleLocked || person.funcao !== "responsavel") && (
                  <button
                    type="button"
                    className="agenda-chip-icon"
                    aria-label={`Remover ${name(person.pessoa_id)}`}
                    onClick={() =>
                      onChange({
                        ...value,
                        responsavel_id: person.funcao === "responsavel" ? "" : value.responsavel_id,
                        participantes: people.filter((p) => p.pessoa_id !== person.pessoa_id),
                      })
                    }
                  >
                    <X size={15} aria-hidden="true" />
                  </button>
                )}
              </li>
            ))}
          </ul>
        )}
        <AgendaPicker
          org={org}
          tipo="pessoas"
          label={people.length ? "Adicionar pessoa" : "Selecionar pessoas"}
          value=""
          clearable={false}
          onDenied={onDenied}
          error={errors["responsavel_id"] || errors["participantes"]}
          onChange={(row) => {
            if (!row || people.some((p) => p.pessoa_id === row.id)) return;
            onLabel(row.id, row.nome);
            const responsible = !value.responsavel_id;
            onChange({
              ...value,
              responsavel_id: responsible ? row.id : value.responsavel_id,
              participantes: [
                ...people,
                { pessoa_id: row.id, funcao: responsible ? "responsavel" : "participante" },
              ],
            });
          }}
        />
      </fieldset>
      <AgendaPicker
        org={org}
        tipo="projetos"
        label="Cliente / projeto"
        value={value.projeto_id || ""}
        initialLabel={
          value.projeto_id
            ? labels[value.projeto_id] ||
              (value.cliente_id && labels[value.cliente_id]) ||
              "Projeto vinculado"
            : ""
        }
        disabled={!!value.levantamento_id && originLocked}
        onDenied={onDenied}
        onChange={(row) => {
          if (row) {
            onLabel(row.id, (row.cliente_nome ? row.cliente_nome + " · " : "") + row.nome);
            if (row.cliente_id)
              onLabel(row.cliente_id, row.cliente_nome || row.contexto || "Cliente");
          }
          setSuggestion(row?.endereco || "");
          onChange({
            ...value,
            projeto_id: row?.id || null,
            cliente_id: row?.cliente_id || null,
            unidade_id: row?.unidade_id || null,
          });
        }}
      />
      {value.cliente_id && !value.projeto_id && (
        <p className="-mt-3 text-xs text-muted-foreground">
          {labels[value.cliente_id] || "Cliente vinculado"} · vínculo existente preservado
        </p>
      )}
      <div className="grid gap-1.5">
        <label htmlFor={uid + "-local"} className="text-sm font-medium">
          Local
        </label>
        <div className="agenda-location">
          <MapPin size={17} aria-hidden="true" />
          <input
            id={uid + "-local"}
            className={fieldClass}
            maxLength={1000}
            placeholder="Endereço, sala ou link da reunião"
            value={value.local}
            onChange={(e) => set("local", e.target.value)}
          />
        </div>
        {suggestion && suggestion !== value.local && (
          <ActionButton
            variant="ghost"
            onClick={() => {
              set("local", suggestion);
              setSuggestion("");
            }}
          >
            Usar endereço do projeto: {suggestion}
          </ActionButton>
        )}
      </div>
    </div>
  );
}
