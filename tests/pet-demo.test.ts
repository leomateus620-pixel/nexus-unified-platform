import { describe, it, expect } from "vitest";
import {
  emptyDemoDraft,
  demoDraftSchema,
  demoCanEnterStep,
  demoContextErrors,
  type DemoSession,
} from "../src/features/pet/demo/domain";
import { nrSearchSchema } from "../src/features/nr/route-state";
import { PetCommandIntents } from "../src/features/pet/command-intents";
const draft = {
  ...emptyDemoDraft(),
  atividade: "Demonstração",
  inicio_previsto: "2026-11-05T12:00:00Z",
  termino_previsto: "2026-11-05T13:00:00Z",
};
describe("Demonstrações isoladas", () => {
  it("inicia sem equipe, medições ou informações técnicas automáticas", () => {
    expect(Object.values(emptyDemoDraft()).every((v) => v.length === 0)).toBe(true);
    expect(demoDraftSchema.safeParse(draft).success).toBe(true);
  });
  it("atividade e período são obrigatórios somente ao salvar", () => {
    const e = demoContextErrors(emptyDemoDraft());
    expect(e.atividade).toBeTruthy();
    expect(e.inicio_previsto).toBeTruthy();
    expect(e.termino_previsto).toBeTruthy();
  });
  it("recusa período invertido e nome sem função válida", () => {
    expect(
      demoDraftSchema.safeParse({ ...draft, termino_previsto: draft.inicio_previsto }).success,
    ).toBe(false);
    expect(
      demoDraftSchema.safeParse({
        ...draft,
        equipe: [{ id: crypto.randomUUID(), nome: "A", funcao: "desconhecida" }],
      }).success,
    ).toBe(false);
  });
  it.each(["NaN", "Infinity", "texto"])(
    "recusa leitura %s sem criar detector ou limite automático",
    (valor) => {
      expect(
        demoDraftSchema.safeParse({
          ...draft,
          leituras: [{ id: crypto.randomUUID(), agente: "O2", valor, unidade: "%" }],
        }).success,
      ).toBe(false);
    },
  );
  it("preserva dados de leitura manual sem transformar em aprovação técnica", () => {
    const parsed = demoDraftSchema.parse({
      ...draft,
      leituras: [{ id: crypto.randomUUID(), agente: "O2", valor: "20.9", unidade: "%" }],
    });
    expect(parsed.leituras[0]?.valor).toBe("20.9");
    expect(parsed).not.toHaveProperty("aprovado");
  });
  it("não abre acompanhamento antes da confirmação explícita", () => {
    expect(demoCanEnterStep(undefined, 4)).toBe(true);
    expect(demoCanEnterStep(undefined, 5)).toBe(false);
    expect(demoCanEnterStep({ estado: "em_andamento" } as DemoSession, 6)).toBe(true);
    expect(demoCanEnterStep({ estado: "em_andamento" } as DemoSession, 7)).toBe(false);
  });
  it("restaura parâmetros válidos sem confiar em etapa ou ID manipulados", () => {
    const route = nrSearchSchema.parse({
      visualizacao: "qualquer",
      petDemo: "externo",
      etapaDemo: 99,
    });
    expect(route.visualizacao).toBe("compacta");
    expect(route.petDemo).toBe("");
    expect(route.etapaDemo).toBe(0);
  });
  it("mantém intenção em retry e troca a chave apenas após confirmação", () => {
    const intents = new PetCommandIntents(),
      payload = { comando: "criar", dados: draft };
    const key = intents.key(payload);
    expect(intents.key(structuredClone(payload))).toBe(key);
    intents.confirmed(payload);
    expect(intents.key(payload)).not.toBe(key);
  });
});
