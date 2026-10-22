import { useId } from "react";
import { fieldClass } from "@/features/operacao/components";
import type { RegraSerie } from "./types";
export function RecurrenceFields({
  value,
  onChange,
}: {
  value: RegraSerie;
  onChange: (next: RegraSerie) => void;
}) {
  const id = useId();
  const set = <K extends keyof RegraSerie>(key: K, next: RegraSerie[K]) =>
    onChange({ ...value, [key]: next });
  return (
    <fieldset className="grid gap-4 rounded-lg border border-border p-3">
      <legend className="px-1 text-sm font-medium">Repetição</legend>
      <div className="grid gap-3 sm:grid-cols-2">
        <label className="grid gap-1 text-sm">
          Frequência
          <select
            className={fieldClass}
            value={value.frequencia}
            onChange={(e) => set("frequencia", e.target.value as RegraSerie["frequencia"])}
          >
            <option value="diaria">Diária</option>
            <option value="semanal">Semanal</option>
            <option value="mensal">Mensal</option>
          </select>
        </label>
        <label className="grid gap-1 text-sm">
          A cada (intervalo)
          <input
            className={fieldClass}
            type="number"
            min={1}
            max={12}
            value={value.intervalo}
            onChange={(e) => set("intervalo", e.target.valueAsNumber)}
          />
        </label>
      </div>
      {value.frequencia === "semanal" && (
        <fieldset>
          <legend className="mb-1 text-sm">Dias da semana *</legend>
          <div className="flex flex-wrap gap-2">
            {["Seg", "Ter", "Qua", "Qui", "Sex", "Sáb", "Dom"].map((label, i) => (
              <label
                key={label}
                className="inline-flex min-h-11 items-center gap-2 rounded border border-border px-3 text-sm"
              >
                <input
                  type="checkbox"
                  checked={value.dias_semana.includes(i + 1)}
                  onChange={(e) =>
                    set(
                      "dias_semana",
                      e.target.checked
                        ? [...value.dias_semana, i + 1].sort()
                        : value.dias_semana.filter((d) => d !== i + 1),
                    )
                  }
                />
                {label}
              </label>
            ))}
          </div>
        </fieldset>
      )}
      {value.frequencia === "mensal" && (
        <label className="grid gap-1 text-sm">
          Dia do mês *
          <input
            className={fieldClass}
            type="number"
            min={1}
            max={31}
            value={value.dia_mes ?? ""}
            onChange={(e) => set("dia_mes", e.target.value ? e.target.valueAsNumber : null)}
          />
        </label>
      )}
      <fieldset className="grid gap-3">
        <legend className="mb-1 text-sm">Término da série *</legend>
        <label className="flex min-h-11 items-center gap-2 text-sm">
          <input
            type="radio"
            name={id + "-until"}
            checked={value.quantidade !== null}
            onChange={() => onChange({ ...value, quantidade: 10, termina_em: null })}
          />
          Após uma quantidade de ocorrências
        </label>
        {value.quantidade !== null && (
          <label className="grid gap-1 text-sm">
            Quantidade de ocorrências
            <input
              className={fieldClass}
              type="number"
              min={1}
              max={200}
              value={value.quantidade}
              onChange={(e) => set("quantidade", e.target.valueAsNumber)}
            />
          </label>
        )}
        <label className="flex min-h-11 items-center gap-2 text-sm">
          <input
            type="radio"
            name={id + "-until"}
            checked={value.quantidade === null}
            onChange={() => onChange({ ...value, quantidade: null, termina_em: "" })}
          />
          Até uma data
        </label>
        {value.quantidade === null && (
          <label className="grid gap-1 text-sm">
            Última data
            <input
              className={fieldClass}
              type="date"
              required
              value={value.termina_em ?? ""}
              onChange={(e) => set("termina_em", e.target.value)}
            />
          </label>
        )}
      </fieldset>
      <p className="text-xs text-muted-foreground">
        Serão programados até 60 dias por vez, com término limitado a 2 anos. Meses sem o dia
        escolhido são pulados. Horário inexistente no fuso vira pendência; no horário repetido é
        usada a ocorrência posterior. Visitas realizadas e exceções individuais são preservadas.
      </p>
    </fieldset>
  );
}
