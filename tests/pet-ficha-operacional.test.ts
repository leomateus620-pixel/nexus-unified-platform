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

import { emptyFicha, fichaProgresso, resumoTeste } from "../src/features/pet/cotrirosa-ficha";
describe("andamento e resumo dos testes", () => {
  it("conta respondidos e impedimentos da fase antes", () => {
    const f = emptyFicha();
    f.respostas["pre_bloqueio"] = { estado: "S" };
    f.respostas["pre_purga"] = { estado: "N" };
    const p = fichaProgresso(f, "antes");
    expect(p.respondidos).toBe(2);
    expect(p.impedimentos).toBe(1);
  });
  it("teste com O₂ fora da faixa fica Bloqueado", () => {
    const r = resumoTeste(emptyFicha(), [{ agente: "O₂", valor: "18", momento: "inicial" }], "inicial");
    expect(r.situacao).toBe("Bloqueado");
  });
  it("teste completo exige quatro agentes e responsável", () => {
    const f = emptyFicha();
    f.testes = { inicial: { responsavel: "Diciane" } };
    const ls = ["H₂S", "CO", "Inflamáveis"].map((a) => ({ agente: a, valor: "0", momento: "inicial" }));
    expect(resumoTeste(f, [...ls, { agente: "O₂", valor: "20.9", momento: "inicial" }], "inicial").situacao).toBe("Completo");
    expect(resumoTeste(f, ls, "inicial").situacao).toBe("Incompleto");
  });
});
