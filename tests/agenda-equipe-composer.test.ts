import { describe, expect, it } from "vitest";
import {
  chooseResponsible,
  durationLabel,
  exclusiveAfterDay,
  includedLastDay,
} from "../src/features/agenda-equipe/composer-domain";
import { comandoInput, eventoInput } from "../src/features/agenda-equipe/schemas";
import type { EventoInput } from "../src/features/agenda-equipe/types";
const id = (n: number) => `00000000-0000-4000-8000-${String(n).padStart(12, "0")}`;
const event: EventoInput = {
  titulo: "Reunião de projeto",
  descricao: "Nota preservada",
  tipo: "sem_categoria",
  timezone: "America/Sao_Paulo",
  dia_inteiro: false,
  inicio_local: "2026-10-30T23:00",
  fim_local: "2026-10-31T00:30",
  local: "Sala de projetos",
  responsavel_id: id(1),
  participantes: [
    { pessoa_id: id(1), funcao: "responsavel" },
    { pessoa_id: id(2), funcao: "participante" },
    { pessoa_id: id(3), funcao: "observador" },
  ],
  bloqueia_recursos: true,
  competencias: [id(4)],
  ferramentas: [{ ferramenta_id: id(5), pessoa_id: id(2) }],
  cliente_id: id(6),
  projeto_id: id(7),
  visibilidade: "participantes",
};
describe("Editor diário da Agenda", () => {
  it("converte último dia incluído para fim exclusivo, inclusive bissexto e virada do ano", () => {
    for (const day of ["2024-02-29", "2026-12-31", "2026-10-30"])
      expect(includedLastDay(exclusiveAfterDay(day))).toBe(day);
    expect(exclusiveAfterDay("2026-12-31")).toBe("2027-01-01");
    expect(includedLastDay(null)).toBe("");
  });
  it("apresenta horas e minutos sem confundir frações decimais e cruza meia-noite", () => {
    expect(durationLabel(event)).toBe("1h30");
    expect(
      durationLabel({ ...event, inicio_local: "2026-10-30T09:00", fim_local: "2026-10-30T16:30" }),
    ).toBe("7h30");
    expect(durationLabel({ ...event, fim_local: event.inicio_local })).toBe("");
  });
  it("troca responsável sem duplicar pessoa nem transformar observadores", () => {
    const next = chooseResponsible(event, id(2));
    expect(next.participantes).toEqual([
      { pessoa_id: id(1), funcao: "participante" },
      { pessoa_id: id(2), funcao: "responsavel" },
      { pessoa_id: id(3), funcao: "observador" },
    ]);
    expect(eventoInput.parse(next)).toMatchObject({
      competencias: event.competencias,
      ferramentas: event.ferramentas,
      cliente_id: event.cliente_id,
      projeto_id: event.projeto_id,
      visibilidade: "participantes",
      descricao: "Nota preservada",
    });
  });
  it("agendar usa a mesma chave e o mesmo contrato completo, sem categoria técnica inventada", () => {
    const command = {
      organization_id: id(10),
      chave: id(11),
      comando: "agendar",
      dados: { evento: event },
    };
    expect(comandoInput.parse(command)).toMatchObject(command);
    expect(comandoInput.parse(command).chave).toBe(id(11));
  });
  it("ação sem horário persiste contexto e pessoas sem inventar intervalo", () => {
    const command = comandoInput.parse({
      organization_id: id(10),
      chave: id(12),
      comando: "criar_acao",
      dados: {
        acao: {
          titulo: event.titulo,
          descricao: "",
          responsavel_id: id(1),
          prazo: null,
          prioridade: "normal",
          exige_verificacao: true,
          participantes: event.participantes.filter((p) => p.funcao !== "observador"),
          cliente_id: id(6),
          projeto_id: id(7),
          unidade_id: null,
          local: event.local,
        },
      },
    });
    expect(command.comando).toBe("criar_acao");
    expect(command.dados).not.toHaveProperty("evento");
  });
});
