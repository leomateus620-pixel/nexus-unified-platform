import { describe, expect, it } from "vitest";
import { petDateInput, petInstant } from "../src/features/pet/ui-types";

describe("PET: horários de campos no fuso explícito", () => {
  it("serializa a jornada no fuso informado, incluindo mudança de data", () => {
    expect(petInstant("2026-10-23T23:30", "America/Sao_Paulo")).toBe("2026-10-24T02:30:00.000Z");
    expect(petInstant("2026-10-23T23:30", "America/Manaus")).toBe("2026-10-24T03:30:00.000Z");
    expect(petInstant("2026-10-23T23:30", "America/Rio_Branco")).toBe("2026-10-24T04:30:00.000Z");
  });
  it("reabre o horário persistido sem convertê-lo para o fuso do computador", () => {
    const value = "2026-10-23T23:45";
    expect(petDateInput(petInstant(value, "America/Manaus"), "America/Manaus")).toBe(value);
    expect(petDateInput("2026-10-24T03:45:00Z", "America/Sao_Paulo")).toBe("2026-10-24T00:45");
  });
  it("recusa datas impossíveis e campos incompletos", () => {
    for (const value of [
      "2026-02-31T12:00",
      "2026-10-23T25:00",
      "2026-10-23T12:60",
      "2026-10-23",
      "",
    ])
      expect(() => petInstant(value, "America/Sao_Paulo")).toThrow(
        "Informe data e horário válidos",
      );
  });
});
