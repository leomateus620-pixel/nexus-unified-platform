import { describe, expect, it } from "vitest";
import {
  demoDraftSchema,
  demoSeguranca,
  emptyDemoDraft,
  parseDecimalBR,
  segurancaPendencias,
} from "@/features/pet/demo/domain";

describe("PET mobile — preenchimento por toque", () => {
  it("aceita vírgula decimal e preserva a precisão informada", () => {
    expect(parseDecimalBR("20,9")).toBe("20.9");
    expect(parseDecimalBR("0,50")).toBe("0.50");
  });
  it("aceita zero como leitura válida", () => {
    expect(parseDecimalBR("0")).toBe("0");
  });
  it("rejeita texto, vazio e unidade digitada junto do valor", () => {
    expect(parseDecimalBR("")).toBeNull();
    expect(parseDecimalBR("20,9%")).toBeNull();
    expect(parseDecimalBR("abc")).toBeNull();
  });
  it("rascunho antigo com texto livre continua válido e vira item 'Outro'", () => {
    const d = { ...emptyDemoDraft(), atividade: "Limpeza", inicio_previsto: "2026-11-06T10:00:00Z", termino_previsto: "2026-11-06T12:00:00Z", perigos: "Poeira", medidas: "Ventilar" };
    expect(demoDraftSchema.safeParse(d).success).toBe(true);
    const s = demoSeguranca(d);
    expect(s[0]!.perigo).toBe("Poeira");
    expect(s[0]!.medidas[0]!.estado).toBe("pendente");
  });
  it("medida pendente e perigo sem medida aparecem como pendência na conferência", () => {
    const p = segurancaPendencias([
      { id: crypto.randomUUID(), grupo: "Atmosfera", perigo: "Deficiência de oxigênio", origem: "avaliacao", medidas: [] },
      { id: crypto.randomUUID(), grupo: "Energias", perigo: "Energia elétrica", origem: "avaliacao",
        medidas: [{ id: crypto.randomUUID(), medida: "Bloqueio", estado: "pendente" }] },
    ]);
    expect(p).toHaveLength(2);
  });
  it("medida confirmada em campo não gera pendência", () => {
    expect(segurancaPendencias([{ id: crypto.randomUUID(), grupo: "x", perigo: "Ruído", origem: "entrada",
      medidas: [{ id: crypto.randomUUID(), medida: "Protetor", estado: "confirmada" }] }])).toHaveLength(0);
  });
});
