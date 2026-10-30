import { describe, expect, it } from "vitest";
import { PetCommandIntents } from "../src/features/pet/command-intents";
describe("PET pending command identity", () => {
  it("preserves a lost response retry across an interleaved command", () => {
    const intents = new PetCommandIntents();
    const exit = {
      comando: "registrar_saida",
      dados: { pessoa_id: "person", expected_version: 12, momento: "2026-10-30T14:00:00Z" },
    };
    const first = intents.key(exit);
    expect(intents.key({ comando: "interromper", dados: { expected_version: 13 } })).not.toBe(
      first,
    );
    expect(intents.key(structuredClone(exit))).toBe(first);
  });
  it("a confirmed command releases its key while version changes define a different intent", () => {
    const intents = new PetCommandIntents();
    const payload = { comando: "salvar_rascunho", dados: { expected_version: 1 } };
    const first = intents.key(payload);
    expect(intents.key({ comando: "salvar_rascunho", dados: { expected_version: 2 } })).not.toBe(
      first,
    );
    intents.confirmed(payload);
    expect(intents.key(payload)).not.toBe(first);
  });
});
