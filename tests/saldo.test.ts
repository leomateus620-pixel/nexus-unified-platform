import { describe, expect, it } from "vitest";
import { arredondarCompra, previaGeracao, reconciliar } from "@/features/suprimentos/saldo";

describe("reconciliação de suprimentos", () => {
  it("gera só o saldo descoberto, respeitando múltiplo e indivisível", () => {
    expect(arredondarCompra(3, 5, false)).toBe(5);
    expect(arredondarCompra(10, 5, false)).toBe(10);
    expect(arredondarCompra(2.2, 0, true)).toBe(3);
    expect(arredondarCompra(2.2, 0, false)).toBe(2.2);
    expect(arredondarCompra(0, 5, true)).toBe(0);
  });
  it("aumento vira complemento; redução abaixo do comprometido vira pendência", () => {
    expect(reconciliar(15, 10, 4)).toMatchObject({ semOrdem: 5, excedente: 0 });
    expect(reconciliar(6, 10, 4)).toMatchObject({ semOrdem: 0, excedente: 4, realizada: 4 });
  });
  it("prévia explica OC por fornecedor e OP", () => {
    const p = previaGeracao([
      { modalidade: "comprar", planejada: 5, comprometida: 0, fornecedor: { id: "a", nome: "A" } },
      { modalidade: "comprar", planejada: 5, comprometida: 5, fornecedor: { id: "b", nome: "B" } },
      { modalidade: "fabricar", planejada: 2, comprometida: 0, fornecedor: null },
      { modalidade: "terceirizar", planejada: 1, comprometida: 0, fornecedor: null },
    ]);
    expect(p).toEqual({ fornecedores: ["A"], op: true, semFornecedor: 1 });
  });
});
