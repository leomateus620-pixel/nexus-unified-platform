import { useId, useState } from "react";
import { ActionButton } from "@/components/nexus/Page";
import { fieldClass } from "@/features/operacao/components";
import { AgendaPicker } from "./AgendaPicker";
import { tipoLabels } from "./domain";
import { addCivilDays } from "./calendar-domain";
import type { EventoInput, OpcaoAgenda } from "./types";
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
  onOriginIntent,
  errors = {},
}: {
  org: string;
  value: EventoInput;
  onChange: (value: EventoInput) => void;
  labels: AgendaLabels;
  onLabel: (id: string, label: string) => void;
  onDenied: (e: unknown) => void;
  originLocked?: boolean;
  responsibleLocked?: boolean;
  onOriginIntent: (kind: "independente" | "acao" | "levantamento") => void;
  errors?: Record<string, string>;
}) {
  const uid = useId(),
    [participant, setParticipant] = useState<OpcaoAgenda | null>(null),
    [role, setRole] = useState<"participante" | "observador">("participante"),
    [competence, setCompetence] = useState<OpcaoAgenda | null>(null),
    [team, setTeam] = useState<OpcaoAgenda | null>(null),
    [tool, setTool] = useState<OpcaoAgenda | null>(null),
    [toolPerson, setToolPerson] = useState("");
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
  const selectedOrigin = value.acao_id
    ? "acao"
    : value.levantamento_id
      ? "levantamento"
      : "independente";
  const [origin, setOrigin] = useState<"independente" | "acao" | "levantamento">(selectedOrigin);
  const name = (id: string) => labels[id] || "Cadastro vinculado";
  const pick = (row: OpcaoAgenda | null) => {
    if (row) onLabel(row.id, row.nome);
  };
  return (
    <div className="grid min-w-0 gap-5">
      <div className="grid gap-1">
        <label htmlFor={uid + "-title"} className="text-sm">
          Título do compromisso *
          <input
            id={uid + "-title"}
            name="titulo"
            className={fieldClass}
            maxLength={200}
            value={value.titulo}
            onChange={(e) => set("titulo", e.target.value)}
            {...field("titulo")}
          />
        </label>
        {err("titulo")}
      </div>
      <div className="grid gap-3 sm:grid-cols-2">
        <label className="grid gap-1 text-sm">
          Tipo de atividade
          <select
            className={fieldClass}
            value={value.tipo}
            onChange={(e) =>
              onChange({
                ...value,
                tipo: e.target.value as EventoInput["tipo"],
                bloqueia_recursos: e.target.value === "reuniao" ? value.bloqueia_recursos : true,
              })
            }
          >
            {Object.entries(tipoLabels).map(([v, l]) => (
              <option key={v} value={v}>
                {l}
              </option>
            ))}
          </select>
        </label>
        <label className="grid gap-1 text-sm">
          Visibilidade
          <select
            className={fieldClass}
            value={value.visibilidade}
            onChange={(e) => set("visibilidade", e.target.value as EventoInput["visibilidade"])}
          >
            <option value="participantes">Participantes e coordenação</option>
            <option value="organizacao">Organização, conforme acesso à origem</option>
          </select>
        </label>
      </div>
      <fieldset className="grid gap-3 rounded-lg border border-border p-3">
        <legend className="px-1 text-sm font-medium">Período</legend>
        <label className="grid gap-1 text-sm">
          Fuso horário IANA *
          <input
            name="timezone"
            className={fieldClass}
            value={value.timezone}
            maxLength={80}
            onChange={(e) => set("timezone", e.target.value)}
            placeholder="America/Sao_Paulo"
            {...field("timezone")}
          />
        </label>
        {err("timezone")}
        <p className="text-xs text-muted-foreground">
          Os horários abaixo serão interpretados neste fuso. Alterar o fuso mantém os horários
          preenchidos; confira o período antes de salvar. Ao alterar período ou fuso, horários
          repetidos usam a ocorrência posterior.
        </p>
        <label className="flex min-h-11 items-center gap-2 text-sm">
          <input
            type="checkbox"
            checked={value.dia_inteiro}
            onChange={(e) => {
              const { inicio_local, fim_local, inicio, fim, data_inicio, data_fim, ...rest } =
                value;
              onChange(
                e.target.checked
                  ? {
                      ...rest,
                      dia_inteiro: true,
                      data_inicio: (inicio_local ?? "").slice(0, 10) || "",
                      data_fim: (() => {
                        const start = (inicio_local ?? "").slice(0, 10),
                          end = (fim_local ?? "").slice(0, 10);
                        try {
                          return end > start ? end : addCivilDays(start, 1);
                        } catch {
                          return "";
                        }
                      })(),
                    }
                  : {
                      ...rest,
                      dia_inteiro: false,
                      inicio_local: (data_inicio ?? "") + "T08:00",
                      fim_local: (data_fim ?? "") + "T09:00",
                    },
              );
            }}
          />
          Dia inteiro
        </label>
        <div className="grid gap-3 sm:grid-cols-2">
          {value.dia_inteiro ? (
            <>
              <div>
                <label className="grid gap-1 text-sm">
                  Primeiro dia *
                  <input
                    className={fieldClass}
                    type="date"
                    value={value.data_inicio ?? ""}
                    onChange={(e) => set("data_inicio", e.target.value)}
                    {...field("data_inicio")}
                  />
                </label>
                {err("data_inicio")}
              </div>
              <div>
                <label className="grid gap-1 text-sm">
                  Fim exclusivo *
                  <input
                    className={fieldClass}
                    type="date"
                    value={value.data_fim ?? ""}
                    onChange={(e) => set("data_fim", e.target.value)}
                    {...field("data_fim")}
                  />
                </label>
                <p className="mt-1 text-xs text-muted-foreground">
                  Primeiro dia que já não faz parte do evento.
                </p>
                {err("data_fim")}
              </div>
            </>
          ) : (
            <>
              <div>
                <label className="grid gap-1 text-sm">
                  Início local *
                  <input
                    className={fieldClass}
                    type="datetime-local"
                    step={1}
                    value={value.inicio_local ?? ""}
                    onChange={(e) => set("inicio_local", e.target.value)}
                    {...field("inicio_local")}
                  />
                </label>
                {err("inicio_local")}
              </div>
              <div>
                <label className="grid gap-1 text-sm">
                  Fim local *
                  <input
                    className={fieldClass}
                    type="datetime-local"
                    step={1}
                    value={value.fim_local ?? ""}
                    onChange={(e) => set("fim_local", e.target.value)}
                    {...field("fim_local")}
                  />
                </label>
                {err("fim_local")}
              </div>
            </>
          )}
        </div>
        {value.tipo === "reuniao" && (
          <label className="flex min-h-11 items-center gap-2 text-sm">
            <input
              type="checkbox"
              checked={value.bloqueia_recursos}
              onChange={(e) => set("bloqueia_recursos", e.target.checked)}
            />
            Reservar o período das pessoas participantes
          </label>
        )}
      </fieldset>
      <fieldset className="grid gap-4 rounded-lg border border-border p-3">
        <legend className="px-1 text-sm font-medium">Pessoas e responsabilidade</legend>
        <AgendaPicker
          org={org}
          tipo="pessoas"
          label="Responsável principal"
          disabled={responsibleLocked}
          value={value.responsavel_id}
          initialLabel={name(value.responsavel_id)}
          required
          error={errors["responsavel_id"]}
          onDenied={onDenied}
          onChange={(row) => {
            pick(row);
            const id = row?.id ?? "";
            onChange({
              ...value,
              responsavel_id: id,
              participantes: [
                ...value.participantes
                  .filter((p) => p.pessoa_id !== id)
                  .map((p) => ({
                    ...p,
                    funcao: p.funcao === "responsavel" ? ("participante" as const) : p.funcao,
                  })),
                ...(id ? [{ pessoa_id: id, funcao: "responsavel" as const }] : []),
              ],
            });
          }}
        />
        <ul className="space-y-2">
          {value.participantes.map((p) => (
            <li
              key={p.pessoa_id}
              className="flex flex-wrap items-center justify-between gap-2 rounded bg-muted/20 px-3 py-2 text-sm"
            >
              <span className="min-w-0 break-words">
                {name(p.pessoa_id)} ·{" "}
                {p.funcao === "responsavel"
                  ? "Responsável"
                  : p.funcao === "observador"
                    ? "Observador"
                    : "Participante"}
              </span>
              {p.funcao !== "responsavel" && (
                <ActionButton
                  variant="ghost"
                  onClick={() =>
                    set(
                      "participantes",
                      value.participantes.filter((x) => x.pessoa_id !== p.pessoa_id),
                    )
                  }
                >
                  Remover
                </ActionButton>
              )}
            </li>
          ))}
        </ul>
        {err("participantes")}
        <details className="rounded border border-border p-3">
          <summary className="cursor-pointer py-1 text-sm font-medium">
            Adicionar participante ou observador
          </summary>
          <div className="mt-4 grid gap-3">
            <AgendaPicker
              org={org}
              tipo="pessoas"
              label="Pessoa"
              value={participant?.id ?? ""}
              onDenied={onDenied}
              onChange={setParticipant}
            />
            <label className="grid gap-1 text-sm">
              Participação
              <select
                className={fieldClass}
                value={role}
                onChange={(e) => setRole(e.target.value as typeof role)}
              >
                <option value="participante">Participante — reserva período</option>
                <option value="observador">Observador — acompanha sem reservar período</option>
              </select>
            </label>
            <ActionButton
              variant="ghost"
              disabled={
                !participant || value.participantes.some((p) => p.pessoa_id === participant.id)
              }
              onClick={() => {
                if (!participant) return;
                pick(participant);
                set("participantes", [
                  ...value.participantes,
                  { pessoa_id: participant.id, funcao: role },
                ]);
                setParticipant(null);
              }}
            >
              Incluir pessoa
            </ActionButton>
          </div>
        </details>
        <details className="rounded border border-border p-3">
          <summary className="cursor-pointer py-1 text-sm font-medium">
            Incluir membros de uma equipe
          </summary>
          <div className="mt-4 grid gap-3">
            <AgendaPicker
              org={org}
              tipo="equipes"
              label="Equipe"
              value={team?.id ?? ""}
              onDenied={onDenied}
              onChange={setTeam}
            />
            <ActionButton
              variant="ghost"
              disabled={!team || (value.equipes ?? []).includes(team.id)}
              onClick={() => {
                if (!team) return;
                pick(team);
                set("equipes", [...(value.equipes ?? []), team.id]);
                setTeam(null);
              }}
            >
              Incluir equipe no período
            </ActionButton>
            <p className="text-xs text-muted-foreground">
              O servidor incluirá as pessoas com vínculo vigente na data da atividade; pessoas
              repetidas não serão duplicadas.
            </p>
            {(value.equipes ?? []).map((id) => (
              <div key={id} className="flex flex-wrap justify-between gap-2 text-sm">
                <span>{name(id)}</span>
                <ActionButton
                  variant="ghost"
                  onClick={() =>
                    set(
                      "equipes",
                      value.equipes?.filter((x) => x !== id),
                    )
                  }
                >
                  Remover equipe
                </ActionButton>
              </div>
            ))}
          </div>
        </details>
      </fieldset>
      <details
        className="rounded-lg border border-border p-3"
        open={originLocked || origin !== "independente"}
      >
        <summary className="cursor-pointer py-1 text-sm font-medium">Origem e contexto</summary>
        <div className="mt-4 grid gap-4">
          {originLocked ? (
            <p className="text-sm">
              Origem:{" "}
              {selectedOrigin === "independente"
                ? "Evento independente"
                : selectedOrigin === "acao"
                  ? "Ação operacional"
                  : "Levantamento"}
              . Para outra origem, cancele esta visita e crie um novo compromisso.
            </p>
          ) : (
            <label className="grid gap-1 text-sm">
              Agendar
              <select
                className={fieldClass}
                value={origin}
                onChange={(e) => {
                  setOrigin(e.target.value as typeof origin);
                  onOriginIntent(e.target.value as typeof origin);
                  onChange({
                    ...value,
                    acao_id: null,
                    levantamento_id: null,
                    origem_ocorrencia: null,
                  });
                }}
              >
                <option value="independente">Evento independente</option>
                <option value="acao">Ação existente</option>
                <option value="levantamento">Levantamento existente</option>
              </select>
            </label>
          )}
          {!originLocked && origin !== "independente" && (
            <AgendaPicker
              org={org}
              tipo={origin === "acao" ? "acoes" : "levantamentos"}
              label={origin === "acao" ? "Ação de origem" : "Levantamento de origem"}
              value={(origin === "acao" ? value.acao_id : value.levantamento_id) ?? ""}
              initialLabel={name(value.acao_id ?? value.levantamento_id ?? "")}
              required
              onDenied={onDenied}
              onChange={(row) => {
                pick(row);
                onChange({
                  ...value,
                  acao_id: origin === "acao" ? (row?.id ?? null) : null,
                  levantamento_id: origin === "levantamento" ? (row?.id ?? null) : null,
                  origem_ocorrencia: null,
                  ...(origin === "levantamento"
                    ? {
                        cliente_id: row?.cliente_id ?? null,
                        unidade_id: row?.unidade_id ?? null,
                      }
                    : {}),
                });
              }}
            />
          )}
          <AgendaPicker
            org={org}
            tipo="clientes"
            label="Cliente"
            value={value.cliente_id ?? ""}
            initialLabel={name(value.cliente_id ?? "")}
            disabled={!!value.levantamento_id}
            onDenied={onDenied}
            onChange={(row) => {
              pick(row);
              onChange({
                ...value,
                cliente_id: row?.id ?? null,
                unidade_id: null,
                projeto_id: null,
              });
            }}
          />
          {value.cliente_id && (
            <AgendaPicker
              key={"unidade:" + value.cliente_id}
              org={org}
              tipo="unidades"
              label="Unidade"
              value={value.unidade_id ?? ""}
              initialLabel={name(value.unidade_id ?? "")}
              clienteId={value.cliente_id}
              disabled={!!value.levantamento_id}
              onDenied={onDenied}
              onChange={(row) => {
                pick(row);
                set("unidade_id", row?.id ?? null);
              }}
            />
          )}
          <AgendaPicker
            key={"projeto:" + (value.cliente_id ?? "sem-cliente")}
            org={org}
            tipo="projetos"
            label="Projeto operacional"
            value={value.projeto_id ?? ""}
            initialLabel={name(value.projeto_id ?? "")}
            clienteId={value.cliente_id ?? null}
            onDenied={onDenied}
            onChange={(row) => {
              pick(row);
              set("projeto_id", row?.id ?? null);
            }}
          />
        </div>
      </details>
      <details className="rounded-lg border border-border p-3">
        <summary className="cursor-pointer py-1 text-sm font-medium">
          Competências exigidas e ferramentas
        </summary>
        <div className="mt-4 grid gap-4">
          <p className="text-xs text-muted-foreground">
            A publicação e o início verificarão os requisitos cadastrados para todo o período.
            Qualificação validada não representa aptidão universal.
          </p>
          <AgendaPicker
            org={org}
            tipo="competencias"
            label="Competência exigida"
            value={competence?.id ?? ""}
            onDenied={onDenied}
            onChange={setCompetence}
          />
          <ActionButton
            variant="ghost"
            disabled={!competence || value.competencias.includes(competence.id)}
            onClick={() => {
              if (!competence) return;
              pick(competence);
              set("competencias", [...value.competencias, competence.id]);
              setCompetence(null);
            }}
          >
            Adicionar requisito
          </ActionButton>
          {value.competencias.map((id) => (
            <div key={id} className="flex flex-wrap items-center justify-between gap-2 text-sm">
              <span>{name(id)}</span>
              <ActionButton
                variant="ghost"
                onClick={() =>
                  set(
                    "competencias",
                    value.competencias.filter((x) => x !== id),
                  )
                }
              >
                Remover requisito
              </ActionButton>
            </div>
          ))}
          <AgendaPicker
            org={org}
            tipo="ferramentas"
            label="Ferramenta"
            value={tool?.id ?? ""}
            onDenied={onDenied}
            onChange={setTool}
          />
          <label className="grid gap-1 text-sm">
            Responsável pela ferramenta
            <select
              className={fieldClass}
              value={toolPerson}
              onChange={(e) => setToolPerson(e.target.value)}
            >
              <option value="">Selecione uma pessoa da atividade</option>
              {value.participantes
                .filter((p) => p.funcao !== "observador")
                .map((p) => (
                  <option key={p.pessoa_id} value={p.pessoa_id}>
                    {name(p.pessoa_id)}
                  </option>
                ))}
            </select>
          </label>
          <ActionButton
            variant="ghost"
            disabled={
              !tool ||
              !toolPerson ||
              (value.ferramentas ?? []).some((t) => t.ferramenta_id === tool.id)
            }
            onClick={() => {
              if (!tool || !toolPerson) return;
              pick(tool);
              set("ferramentas", [
                ...(value.ferramentas ?? []),
                { ferramenta_id: tool.id, pessoa_id: toolPerson },
              ]);
              setTool(null);
            }}
          >
            Adicionar ferramenta
          </ActionButton>
          {(value.ferramentas ?? []).map((t) => (
            <div
              key={t.ferramenta_id}
              className="flex flex-wrap items-center justify-between gap-2 text-sm"
            >
              <span>
                {name(t.ferramenta_id)} · {name(t.pessoa_id)}
              </span>
              <ActionButton
                variant="ghost"
                onClick={() =>
                  set(
                    "ferramentas",
                    value.ferramentas?.filter((x) => x.ferramenta_id !== t.ferramenta_id),
                  )
                }
              >
                Remover ferramenta
              </ActionButton>
            </div>
          ))}
          <p className="text-xs text-muted-foreground">
            A disponibilidade e a calibração serão verificadas no almoxarifado. Concluir o evento
            não registra devolução física.
          </p>
        </div>
      </details>
      <label className="grid gap-1 text-sm">
        Local e instruções de acesso
        <input
          className={fieldClass}
          value={value.local}
          maxLength={1000}
          onChange={(e) => set("local", e.target.value)}
        />
      </label>
      <label className="grid gap-1 text-sm">
        Descrição
        <textarea
          className={fieldClass + " min-h-24"}
          value={value.descricao}
          maxLength={4000}
          onChange={(e) => set("descricao", e.target.value)}
        />
      </label>
    </div>
  );
}
