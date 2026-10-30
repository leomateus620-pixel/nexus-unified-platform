import { describe, expect, it } from "vitest";
import { initialPetStage, petStageAvailable } from "../src/features/pet/presentation";
import type { PetDetalhe } from "../src/features/pet/ui-types";
function view(state: string, condition = "nao_liberada", present = false) {
  return {
    pet: {
      estado_documental: state,
      condicao_operacional: condition,
      emitida_em: ["rascunho", "em_conferencia", "aguardando_assinaturas"].includes(state)
        ? null
        : "2026-10-30T09:00:00Z",
    },
    intervalos: present ? [{ saida_em: null }] : [],
  } as unknown as PetDetalhe;
}
describe("PET navigation is presentation, not documentary state", () => {
  it("opens preparation, conference and certified operation by persisted state", () => {
    expect(initialPetStage(view("rascunho"))).toBe(0);
    expect(initialPetStage(view("em_conferencia"))).toBe(4);
    expect(initialPetStage(view("aguardando_assinaturas"))).toBe(4);
    expect(initialPetStage(view("emitida", "em_atividade", true))).toBe(5);
  });
  it("keeps open presence in front even during termination; otherwise opens closing", () => {
    expect(initialPetStage(view("encerramento_pendente", "terminada", true))).toBe(5);
    expect(initialPetStage(view("encerramento_pendente", "terminada"))).toBe(6);
  });
  it("opens completed and cancelled records for consultation", () => {
    expect(initialPetStage(view("encerrada", "terminada"))).toBe(7);
    expect(initialPetStage(view("cancelada"))).toBe(7);
    expect(petStageAvailable(view("encerrada"), 5)).toBe(false);
    expect(petStageAvailable(view("cancelada"), 6)).toBe(false);
    expect(petStageAvailable(view("encerrada"), 7)).toBe(true);
  });
  it("does not offer operation or completion for a draft and rejects invalid phases", () => {
    for (const stage of [5, 6, 7, -1, 8, 1.5])
      expect(petStageAvailable(view("rascunho"), stage)).toBe(false);
    expect(petStageAvailable(view("emitida"), 6)).toBe(true);
    expect(petStageAvailable(view("emitida"), 7)).toBe(false);
  });
});
