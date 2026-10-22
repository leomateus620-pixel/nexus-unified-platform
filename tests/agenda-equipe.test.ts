import { describe, it, expect } from "vitest";
import {
  agendaSearchSchema,
  comandoInput,
  eventoInput,
  listarInput,
  regraSerie,
} from "../src/features/agenda-equipe/schemas";
import {
  acessoAgendaNegado,
  AGENDA_ACESSO_NEGADO,
  eventForSave,
  inputFromDetail,
} from "../src/features/agenda-equipe/domain";
import {
  addCivilDays,
  calendarWindow,
  civilInZone,
  daysInWindow,
  mondayOf,
  supportsTimezone,
  formatInstant,
} from "../src/features/agenda-equipe/calendar-domain";
import type { DetalheAgenda } from "../src/features/agenda-equipe/types";
const id = (n: number) => `00000000-0000-4000-8000-${String(n).padStart(12, "0")}`;
const event = {
  titulo: "Visita técnica",
  descricao: "",
  tipo: "visita_tecnica" as const,
  timezone: "America/Sao_Paulo",
  dia_inteiro: false,
  inicio_local: "2026-10-22T08:00",
  fim_local: "2026-10-22T09:00",
  local: "",
  responsavel_id: id(2),
  bloqueia_recursos: true,
  participantes: [{ pessoa_id: id(2), funcao: "responsavel" as const }],
  competencias: [],
  visibilidade: "participantes" as const,
};
const rule = {
  frequencia: "semanal" as const,
  intervalo: 1,
  dias_semana: [4],
  dia_mes: 22,
  termina_em: null,
  quantidade: 10,
  politica_mes: "pular" as const,
  hora_ambigua: "posterior" as const,
  hora_inexistente: "pular" as const,
};
describe("Agenda: contratos de intenção e janela civil", () => {
  it("não infere UTC para período local IANA", () => {
    const parsed = eventoInput.parse(event);
    expect(parsed.inicio_local).toBe(event.inicio_local);
    expect(parsed.inicio).toBeUndefined();
    expect(eventoInput.safeParse({ ...event, timezone: "Fuso/Inexistente" }).success).toBe(false);
  });
  it("aceita evento noturno e nega fim anterior sem contar datas civis em milissegundos", () => {
    expect(
      eventoInput.safeParse({
        ...event,
        inicio_local: "2026-10-22T23:00",
        fim_local: "2026-10-23T02:00",
      }).success,
    ).toBe(true);
    expect(eventoInput.safeParse({ ...event, fim_local: "2026-10-22T07:00" }).success).toBe(false);
  });
  it("aceita instantes com offset e rejeita dois transportes de período juntos", () => {
    const { inicio_local, fim_local, ...base } = event;
    expect(
      eventoInput.safeParse({
        ...base,
        inicio: "2026-11-01T01:45:00-04:00",
        fim: "2026-11-01T01:15:00-05:00",
        timezone: "America/New_York",
      }).success,
    ).toBe(true);
    expect(
      eventoInput.safeParse({
        ...event,
        inicio: "2026-10-22T11:00:00Z",
        fim: "2026-10-22T12:00:00Z",
      }).success,
    ).toBe(false);
  });
  it("dia inteiro preserva fim civil exclusivo inclusive bissexto", () => {
    const { inicio_local, fim_local, ...base } = event;
    expect(
      eventoInput.parse({
        ...base,
        dia_inteiro: true,
        data_inicio: "2024-02-29",
        data_fim: "2024-03-01",
      }).data_inicio,
    ).toBe("2024-02-29");
    for (const end of ["2024-02-29", "2024-02-28"])
      expect(
        eventoInput.safeParse({
          ...base,
          dia_inteiro: true,
          data_inicio: "2024-02-29",
          data_fim: end,
        }).success,
      ).toBe(false);
  });
  it("exige uma origem principal e responsável entre participantes sem duplicação", () => {
    expect(
      eventoInput.safeParse({ ...event, acao_id: id(3), levantamento_id: id(4) }).success,
    ).toBe(false);
    expect(eventoInput.safeParse({ ...event, participantes: [] }).success).toBe(false);
    expect(
      eventoInput.safeParse({
        ...event,
        participantes: [...event.participantes, ...event.participantes],
      }).success,
    ).toBe(false);
  });
  it("observador não vira responsável e reunião é a única não exclusiva", () => {
    expect(eventoInput.safeParse({ ...event, bloqueia_recursos: false }).success).toBe(false);
    expect(
      eventoInput.safeParse({
        ...event,
        tipo: "reuniao",
        bloqueia_recursos: false,
        participantes: [...event.participantes, { pessoa_id: id(3), funcao: "observador" }],
      }).success,
    ).toBe(true);
  });
  it("cria ação sem prazo e sem inventar evento", () => {
    const input = {
      organization_id: id(1),
      chave: id(9),
      comando: "criar_acao",
      dados: {
        acao: {
          titulo: "Conferir proteção",
          descricao: "",
          responsavel_id: id(2),
          prioridade: "normal",
          exige_verificacao: true,
        },
      },
    };
    const p = comandoInput.parse(input);
    expect(p.comando).toBe("criar_acao");
    if (p.comando === "criar_acao") {
      expect(p.dados.evento).toBeUndefined();
      expect(p.dados.acao.prazo).toBeUndefined();
    }
  });
  it("edição congela versão e rejeita autoria do browser", () => {
    const base = {
      organization_id: id(1),
      chave: id(9),
      comando: "salvar_evento",
      dados: { evento_id: id(4), evento: event },
    };
    expect(comandoInput.safeParse(base).success).toBe(false);
    expect(
      comandoInput.safeParse({ ...base, dados: { ...base.dados, expected_version: 2 } }).success,
    ).toBe(true);
    expect(
      comandoInput.safeParse({
        ...base,
        dados: { ...base.dados, expected_version: 2, created_by: id(5) },
      }).success,
    ).toBe(false);
  });
  it("cancelamento pede motivo, sem liberar recursos por exclusão", () => {
    const data = {
      organization_id: id(1),
      chave: id(9),
      comando: "cancelar",
      dados: { evento_id: id(4), expected_version: 1, motivo: "" },
    };
    expect(comandoInput.safeParse(data).success).toBe(false);
    expect(
      comandoInput.safeParse({
        ...data,
        dados: { ...data.dados, motivo: "Visita reagendada por solicitação" },
      }).success,
    ).toBe(true);
  });
  it("recorrência tem término único e limite finito; dias não se repetem", () => {
    expect(regraSerie.parse(rule).quantidade).toBe(10);
    expect(regraSerie.safeParse({ ...rule, termina_em: "2027-01-01" }).success).toBe(false);
    expect(regraSerie.safeParse({ ...rule, quantidade: 201 }).success).toBe(false);
    expect(regraSerie.safeParse({ ...rule, dias_semana: [1, 1] }).success).toBe(false);
    expect(regraSerie.safeParse({ ...rule, frequencia: "mensal", dia_mes: null }).success).toBe(
      false,
    );
  });
  it("recarga preserva filtro booleano sem transformar string false em true", () => {
    expect(agendaSearchSchema.parse({ pendentesEquipe: "true" }).pendentesEquipe).toBe(true);
    expect(agendaSearchSchema.parse({ pendentesEquipe: "false" }).pendentesEquipe).toBe(false);
    expect(agendaSearchSchema.parse({ pendentesEquipe: "sim" }).pendentesEquipe).toBe(false);
    expect(agendaSearchSchema.parse({}).pendentesEquipe).toBe(false);
  });
  it("janela de consulta inclui somente período finito autorizado", () => {
    expect(
      listarInput.safeParse({
        organization_id: id(1),
        inicio: "2026-01-01",
        fim: "2027-01-01",
        timezone: event.timezone,
      }).success,
    ).toBe(false);
    expect(
      listarInput.safeParse({
        organization_id: id(1),
        inicio: "2026-10-22",
        fim: "2026-10-23",
        timezone: event.timezone,
      }).success,
    ).toBe(true);
  });
  it("calendário atravessa mês, ano, bissexto e fuso sem gerar série", () => {
    expect(addCivilDays("2024-02-28", 1)).toBe("2024-02-29");
    expect(addCivilDays("2026-12-31", 1)).toBe("2027-01-01");
    expect(mondayOf("2026-10-25")).toBe("2026-10-19");
    const w = calendarWindow("2024-02-29", "mes");
    expect(daysInWindow(w.start, w.endExclusive)).toHaveLength(42);
    expect(civilInZone("2026-10-22T02:30:00Z", event.timezone)).toBe("2026-10-21");
  });
  it("negação exata serializável se distingue de rede", () => {
    expect(acessoAgendaNegado({ message: AGENDA_ACESSO_NEGADO })).toBe(true);
    expect(acessoAgendaNegado(new Error("Falha de rede"))).toBe(false);
  });
  it("editar título na dobra de DST mantém a ocorrência original anterior", () => {
    const base = {
      evento: {
        ...event,
        id: id(5),
        inicio: "2026-11-01T01:30:00-04:00",
        fim: "2026-11-01T02:30:00-05:00",
        timezone: "America/New_York",
        acao_id: null,
        levantamento_id: null,
        origem_ocorrencia: null,
        cliente_id: null,
        unidade_id: null,
        projeto_id: null,
      },
      participantes: [{ pessoa_id: id(2), funcao: "responsavel", vigente: true }],
      competencias: [],
      ferramentas: [],
    } as unknown as DetalheAgenda;
    const editable = inputFromDetail(base),
      payload = eventForSave({ ...editable, titulo: "Novo título sem reagendamento" }, base);
    expect(payload.inicio).toBe("2026-11-01T01:30:00-04:00");
    expect(payload.inicio_local).toBeUndefined();
    expect(Date.parse(payload.inicio!)).toBe(Date.parse("2026-11-01T05:30:00Z"));
    expect(
      eventForSave(
        { ...editable, inicio_local: "2026-11-01T03:00", fim_local: "2026-11-01T04:00" },
        base,
      ).inicio_local,
    ).toBe("2026-11-01T03:00");
  });
  it("fuso indisponível neste cliente identifica o instante original sem UTC silencioso", () => {
    // PostgreSQL accepts Factory, while Intl support varies by client/ICU version.
    // Exercise the refusal path with a deliberately unavailable name instead of
    // claiming that Factory is unsupported in every browser.
    const zone = "Unsupported/Legacy";
    expect(supportsTimezone(zone)).toBe(false);
    const iso = "2026-10-22T12:00:00Z",
      formatted = formatInstant(iso, zone);
    expect(formatted).toContain("Instante original: " + iso);
    expect(formatted).toContain(zone);
    expect(formatted).toContain("fuso não suportado");
    expect(() => civilInZone(iso, zone)).toThrow();
    expect(supportsTimezone("Factory")).toBe(
      (() => {
        try {
          new Intl.DateTimeFormat("pt-BR", { timeZone: "Factory" });
          return true;
        } catch {
          return false;
        }
      })(),
    );
  });
  it("falhas de criação e recorrência usam mensagens locais em português", () => {
    const error = comandoInput.safeParse({
      organization_id: id(1),
      chave: id(9),
      comando: "salvar_evento",
      dados: { evento: { ...event, titulo: "", responsavel_id: "", participantes: [] } },
    });
    expect(error.success).toBe(false);
    if (!error.success) {
      expect(
        error.error.issues.some((i) => i.message.includes("Selecione um cadastro válido")),
      ).toBe(true);
      expect(
        error.error.issues.every((i) => !/(String must|Invalid uuid|Number must)/.test(i.message)),
      ).toBe(true);
    }
    const recurrence = comandoInput.safeParse({
      organization_id: id(1),
      chave: id(9),
      comando: "criar_serie",
      dados: { evento_id: id(4), expected_version: 1, regra: { ...rule, intervalo: 0 } },
    });
    expect(recurrence.success).toBe(false);
    if (!recurrence.success)
      expect(
        recurrence.error.issues.some((i) => i.message.includes("Informe um valor a partir de")),
      ).toBe(true);
  });
});
