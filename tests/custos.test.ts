import { describe, expect, it } from "vitest";

import { calcularAquisicao, parcelasDuplicadas, resumoCustos } from "../src/features/custos/domain";

describe("custos de aquisição", () => {
  it("reproduz a linha Bonier CSB-NXS-P000 (NF 6957)", () => {
    const r = calcularAquisicao(
      2,
      "PC",
      "PC",
      {
        produtos: 155.87,
        frete: 7.8,
        ipi: 10.13,
        difal: 10.47,
      },
      null,
    );
    expect(r.custo_total).toBe(184.27);
    expect(r.custo_unitario).toBeCloseTo(92.135, 3);
  });

  it("mantém custo pendente sem preço, com quantidade zero ou sem fator", () => {
    expect(calcularAquisicao(1, "CT", "CT", { produtos: null }, null).pendencia).toMatch(
      /pendente/,
    );
    expect(calcularAquisicao(0, "UN", "UN", { produtos: 10 }, null).pendencia).toMatch(
      /Quantidade/,
    );
    const s = calcularAquisicao(2, "CT", "UN", { produtos: 10 }, null);
    expect(s.pendencia).toMatch(/fator/);
    expect(s.custo_total).toBeNull();
  });

  it("converte somente com fator confirmado", () => {
    const r = calcularAquisicao(2, "CT", "UN", { produtos: 100 }, 50);
    expect(r.quantidade_uso).toBe(100);
    expect(r.custo_unitario).toBe(1);
  });

  it("média ponderada ignora pendentes e não depende da ordem", () => {
    const a = [
      { custo_total: 184.27, quantidade_uso: 2, data: "2026-01-16", situacao: "valida" as const },
      { custo_total: 1000, quantidade_uso: 8, data: "2026-03-01", situacao: "valida" as const },
      {
        custo_total: null,
        quantidade_uso: null,
        data: "2026-04-01",
        situacao: "pendente" as const,
      },
    ];
    const r = resumoCustos(a);
    expect(r.media_ponderada).toBeCloseTo(1184.27 / 10, 6);
    expect(r.ultima_compra).toBe(125);
    expect(resumoCustos([...a].reverse()).media_ponderada).toBe(r.media_ponderada);
    expect(r.compras_pendentes).toBe(1);
  });

  it("aponta frete/IPI cobrados duas vezes", () => {
    expect(parcelasDuplicadas(["frete", "ipi"], ["frete"])).toEqual(["frete"]);
  });
});
