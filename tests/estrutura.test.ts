import { describe, expect, it } from "vitest";
import {
  calcularRevisao,
  expandirAvulsos,
  PARAMETROS_MODELO,
  REGRAS_MODELO,
} from "../src/features/calculo/domain";

const comp = (id: string, custo: number, indivisivel = true) => ({
  id,
  codigo: id,
  custo,
  indivisivel,
  multiplo: 1,
  produto_id: `p-${id}`,
});

describe("estrutura de produto e itens avulsos", () => {
  it("multiplica quantidades por nível: 3 montagens × 2 conjuntos × 4 peças", () => {
    const comps = [comp("M", 1000), comp("S", 500), comp("P", 10)];
    const estrutura = {
      produto_id: "p-M",
      base_custo: "composto",
      filhos: [
        {
          produto_id: "p-S",
          quantidade: 2,
          base_custo: "composto",
          filhos: [{ produto_id: "p-P", quantidade: 4, base_custo: "completo" }],
        },
      ],
    };
    const { ocorrencias } = expandirAvulsos(
      [{ componente_id: "M", produto_id: "p-M", quantidade: 3, estrutura }],
      comps,
    );
    expect(ocorrencias).toEqual([
      { componente_id: "P", origem_id: "M", caminho: ["M", "S"], quantidade_tecnica: 24 },
    ]);
    const r = calcularRevisao(
      [],
      comps,
      REGRAS_MODELO,
      PARAMETROS_MODELO,
      [],
      [{ componente_id: "M", produto_id: "p-M", quantidade: 3, estrutura }],
    );
    // sem cobrança duplicada: só as peças são custeadas
    expect(r.por_componente.map((c) => [c.componente_id, c.quantidade])).toEqual([["P", 24]]);
    expect(r.totais.custo_materiais).toBeGreaterThan(0);
    expect(r.totais.item_tecnico).toBe(0);
  });

  it("produto comprado completo é custeado inteiro e não compra componentes", () => {
    const comps = [comp("M", 1000), comp("P", 10)];
    const estrutura = {
      produto_id: "p-M",
      base_custo: "completo",
      filhos: [{ produto_id: "p-P", quantidade: 4 }],
    };
    const r = calcularRevisao(
      [],
      comps,
      REGRAS_MODELO,
      PARAMETROS_MODELO,
      [],
      [{ componente_id: "M", produto_id: "p-M", quantidade: 2, estrutura }],
    );
    expect(r.por_componente.map((c) => [c.componente_id, c.quantidade])).toEqual([["M", 2]]);
  });

  it("peça avulsa sem sistema e indivisível arredonda para cima", () => {
    const comps = [comp("P", 10)];
    const r = calcularRevisao(
      [],
      comps,
      REGRAS_MODELO,
      PARAMETROS_MODELO,
      [],
      [{ componente_id: "P", produto_id: "p-P", quantidade: 2.2, estrutura: null }],
    );
    expect(r.por_componente[0]).toMatchObject({
      quantidade: 3,
      quantidade_avulsa: 3,
      quantidade_sistemas: 0,
    });
  });

  it("mesma peça em conjuntos diferentes é consolidada sem perder caminhos", () => {
    const comps = [comp("M", 0), comp("S1", 0), comp("S2", 0), comp("P", 5)];
    const estrutura = {
      produto_id: "p-M",
      base_custo: "composto",
      filhos: [
        {
          produto_id: "p-S1",
          quantidade: 1,
          base_custo: "composto",
          filhos: [{ produto_id: "p-P", quantidade: 2 }],
        },
        {
          produto_id: "p-S2",
          quantidade: 1,
          base_custo: "composto",
          filhos: [{ produto_id: "p-P", quantidade: 3 }],
        },
      ],
    };
    const r = calcularRevisao(
      [],
      comps,
      REGRAS_MODELO,
      PARAMETROS_MODELO,
      [],
      [{ componente_id: "M", produto_id: "p-M", quantidade: 1, estrutura }],
    );
    expect(r.avulsos?.map((o) => o.caminho)).toEqual([
      ["M", "S1"],
      ["M", "S2"],
    ]);
    expect(r.por_componente).toHaveLength(1);
    expect(r.por_componente[0]!.quantidade).toBe(5);
  });

  it("composição pendente fica explícita", () => {
    const comps = [comp("S", 0)];
    const r = calcularRevisao(
      [],
      comps,
      REGRAS_MODELO,
      PARAMETROS_MODELO,
      [],
      [
        {
          componente_id: "S",
          produto_id: "p-S",
          quantidade: 1,
          estrutura: { produto_id: "p-S", base_custo: "composto", tipo: "S", filhos: [] },
        },
      ],
    );
    expect(r.pendencias.some((p) => p.includes("Composição pendente"))).toBe(true);
    expect(r.pendencias.some((p) => p.includes("sem custo"))).toBe(true);
  });
});
