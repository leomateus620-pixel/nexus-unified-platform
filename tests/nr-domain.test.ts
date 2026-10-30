import { describe, expect, it } from "vitest";
import {
  avaliacaoNrInicial,
  calcularGeometriaNr,
  calcularVentilacaoNr,
  type Parametro,
} from "../src/features/nr/domain";

function p<U extends string>(valor: number | null, unidade: U): Parametro<U> {
  return {
    valor,
    unidade,
    estado: "validado",
    fonte: "Medição registrada no cenário isolado",
    autor: "responsável do cenário",
  };
}
const cilindro = (tipo: "raio" | "diametro" = "diametro", valor = 6) => ({
  tipo: "cilindro" as const,
  radial: { tipo, medida: p(valor, "m") },
  altura: p(10, "m"),
});
describe("NR: geometria versionada e rastreável", () => {
  it("distingue raio e diâmetro e converte centímetros/milímetros", () => {
    const diametro = calcularGeometriaNr(cilindro(), []);
    expect(diametro.volume_bruto_m3).toBeCloseTo(Math.PI * 90, 10);
    expect(calcularGeometriaNr(cilindro("raio", 3), []).volume_bruto_m3).toBeCloseTo(
      diametro.volume_bruto_m3!,
      10,
    );
    expect(calcularGeometriaNr(cilindro("raio", 6), []).volume_bruto_m3).toBeCloseTo(
      diametro.volume_bruto_m3! * 4,
      10,
    );
    const metric = calcularGeometriaNr(
      {
        tipo: "cilindro",
        radial: { tipo: "diametro", medida: p(600, "cm") },
        altura: p(10000, "mm"),
      },
      [],
    );
    expect(metric.volume_bruto_m3).toBeCloseTo(diametro.volume_bruto_m3!, 10);
    expect(metric.estado).toBe("validado");
    expect(metric.autoriza_entrada).toBe(false);
  });
  it("separa volume bruto de deduções em litros e volume líquido", () => {
    const r = calcularGeometriaNr(
      { tipo: "paralelepipedo", comprimento: p(3, "m"), largura: p(2, "m"), altura: p(4, "m") },
      [p(1000, "L"), p(2, "m3")],
    );
    expect(r.volume_bruto_m3).toBe(24);
    expect(r.deducoes_m3).toBe(3);
    expect(r.volume_liquido_m3).toBe(21);
    expect(r.parametros).toHaveProperty("deducoes");
  });
  it("não converte deduções desconhecidas em zero nem aceita volume líquido negativo", () => {
    const incompleto = calcularGeometriaNr(cilindro(), null);
    expect(incompleto.volume_bruto_m3).not.toBeNull();
    expect(incompleto.deducoes_m3).toBeNull();
    expect(incompleto.volume_liquido_m3).toBeNull();
    expect(incompleto.estado).toBe("incompleto");
    const negativo = calcularGeometriaNr(cilindro(), [p(1000, "m3")]);
    expect(negativo.volume_liquido_m3).toBeNull();
    expect(negativo.pendencias[0]).toContain("Deduções");
  });
  it("preserva propostas sem lhes conferir validação e explica dados incompletos", () => {
    const g = cilindro();
    g.altura.estado = "proposto";
    expect(calcularGeometriaNr(g, []).estado).toBe("proposto");
    g.altura = p(null, "m");
    expect(calcularGeometriaNr(g, []).estado).toBe("incompleto");
    g.altura = { ...p(10, "m"), fonte: "" };
    const semFonte = calcularGeometriaNr(g, []);
    expect(semFonte.estado).toBe("incompleto");
    expect(semFonte.pendencias).toContain("Altura: registre a fonte e o autor.");
  });
  it("não apresenta infinito como resultado e calcula cone sem confundir com cilindro", () => {
    expect(
      calcularGeometriaNr({ ...cilindro(), altura: p(Infinity, "m") }, []).volume_liquido_m3,
    ).toBeNull();
    expect(calcularGeometriaNr(cilindro("raio", 1e200), []).volume_bruto_m3).toBeNull();
    expect(calcularGeometriaNr({ ...cilindro(), tipo: "cone" }, []).volume_bruto_m3).toBeCloseTo(
      Math.PI * 30,
      10,
    );
  });
});

describe("NR: ventilação, unidades e eixos independentes", () => {
  const entrada = () => ({
    volume_liquido: p(100, "m3"),
    vazao_nominal: p(3600, "m3/h"),
    fator_efetividade: p(0.5, "fracao"),
    duracao: p(30, "min"),
  });
  it("separa vazão nominal/efetiva, taxa horária e volumes acumulados", () => {
    const r = calcularVentilacaoNr(entrada());
    expect(r.vazao_nominal_m3_h).toBe(3600);
    expect(r.vazao_efetiva_m3_h).toBe(1800);
    expect(r.renovacoes_por_hora).toBe(18);
    expect(r.volumes_acumulados).toBe(9);
    expect(r.duracao_horas).toBe(0.5);
    expect(r.autoriza_entrada).toBe(false);
  });
  it("m³/s e L/s são convertidos para m³/h, sem confundir duração com taxa", () => {
    expect(
      calcularVentilacaoNr({ ...entrada(), vazao_nominal: p(1, "m3/s") }).renovacoes_por_hora,
    ).toBe(18);
    expect(
      calcularVentilacaoNr({ ...entrada(), vazao_nominal: p(1000, "L/s") }).volumes_acumulados,
    ).toBe(9);
    expect(calcularVentilacaoNr({ ...entrada(), duracao: p(2, "h") }).volumes_acumulados).toBe(36);
  });
  it("não supõe efetividade de 100% nem capacidade desconhecida", () => {
    const r = calcularVentilacaoNr({ ...entrada(), fator_efetividade: p(null, "fracao") });
    expect(r.vazao_nominal_m3_h).toBe(3600);
    expect(r.vazao_efetiva_m3_h).toBeNull();
    expect(r.renovacoes_por_hora).toBeNull();
    expect(r.estado).toBe("incompleto");
    expect(
      calcularVentilacaoNr({ ...entrada(), fator_efetividade: p(1.2, "fracao") })
        .vazao_efetiva_m3_h,
    ).toBeNull();
  });
  it("mantém ausência, não aplicabilidade, condição, ação e validação independentes", () => {
    const a = avaliacaoNrInicial();
    a.existencia = "ausente";
    a.aplicabilidade = "nao_aplicavel";
    a.acao = "instalar";
    expect(a.condicao).toBe("nao_verificado");
    expect(a.validacao).toBe("nao_validado");
    expect(avaliacaoNrInicial().existencia).toBe("nao_verificado");
  });
});
