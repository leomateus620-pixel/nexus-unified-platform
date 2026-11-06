import { describe, expect, it } from "vitest";
import { FICHA_ITENS, fichaGruposDoModelo, fichaModeloItens } from "../src/features/pet/cotrirosa-ficha";

describe("ficha Cotrirosa no modelo operacional", () => {
  it("gera um item obrigatório por linha da ficha", () => {
    const itens = fichaModeloItens();
    expect(itens).toHaveLength(FICHA_ITENS.length);
    expect(itens.every((i) => i.obrigatorio)).toBe(true);
  });
  it("cinturão e treinamentos não aceitam Não se aplica", () => {
    const m = Object.fromEntries(fichaModeloItens().map((i) => [i.id, i.permite_na]));
    expect(m["epi_cinturao"]).toBe(false);
    expect(m["pre_treinamento"]).toBe(false);
    expect(m["dur_trabalho_quente"]).toBe(true);
  });
  it("agrupa só itens presentes no modelo", () => {
    const g = fichaGruposDoModelo(new Set(["epc_barreira", "dur_trabalho_quente"]));
    expect(g.map((x) => x.itens.length)).toEqual([1, 1]);
  });
});
