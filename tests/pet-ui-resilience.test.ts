import { describe, expect, it } from "vitest";
import { anexoPai } from "../src/features/operacao/schemas";
import { retainPetDraftView } from "../src/features/pet/draft-recovery";
import { petDangerEvidenceItem } from "../src/features/pet/evidence-context";
import { petResult } from "../src/features/pet/errors";

describe("PET: rascunho durante falha de transporte", () => {
  it("mantém somente a ficha já autorizada quando o refetch falha por rede", () => {
    expect(retainPetDraftView(new TypeError("Failed to fetch"), true)).toBe(true);
    expect(retainPetDraftView(new TypeError("Failed to fetch"), false)).toBe(false);
    let transported: unknown;
    try {
      petResult({ data: null, error: { message: "TypeError: fetch failed" } });
    } catch (error) {
      transported = error;
    }
    expect(retainPetDraftView(transported, true)).toBe(true);
  });
  it("retira o conteúdo em revogação, sessão inválida e erro desconhecido", () => {
    for (const error of [
      new Error("Unauthorized: Invalid token"),
      new Error("Registro indisponível para seu acesso atual."),
      { status: 403, message: "Failed to fetch" },
      { code: "42501", message: "Network error" },
      new Error("Falha inesperada do servidor"),
    ])
      expect(retainPetDraftView(error, true)).toBe(false);
  });
});
describe("PET: contexto da evidência de perigo", () => {
  it("preserva chaves legadas curtas e não altera a descrição longa", () => {
    expect(petDangerEvidenceItem("Químicos", "Poeiras")).toBe("perigo:Químicos:Poeiras");
    const description =
      "Atmosfera observada com detalhe específico, sem abreviar descrição. ".repeat(12);
    const original = description;
    const item = petDangerEvidenceItem("Outros perigos", description);
    expect(
      anexoPai.parse({
        organization_id: "10000000-0000-4000-8000-000000000001",
        pet_id: "10000000-0000-4000-8000-000000000002",
        pet_item: item,
      }).pet_item,
    ).toBe(item);
    expect(item.length).toBeLessThanOrEqual(120);
    expect(description).toBe(original);
    expect(petDangerEvidenceItem("Outros perigos", description)).toBe(item);
    expect(petDangerEvidenceItem("Outros perigos", description + "outro contexto")).not.toBe(item);
  });
});
