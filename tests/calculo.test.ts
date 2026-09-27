import { describe, expect, it } from "vitest";

import {
  calcularRevisao,
  composicaoSistema,
  consumoCabo,
  distribuirParcelas,
  extensaoInstalada,
  PARAMETROS_MODELO,
  quantidadeOperacional,
  REGRAS_MODELO,
  type SistemaEntrada,
} from "../src/features/calculo/domain";
import { CATALOGO_MODELO } from "../src/features/calculo/catalogo-modelo";

const comps = CATALOGO_MODELO.map((c) => ({ id: c.codigo, codigo: c.codigo, custo: c.custo, indivisivel: c.indivisivel, multiplo: 1 }));

const anexoD: [string, "TELHADO" | "OVERHEAD", number, number][] = [
  ["Pav.I", "TELHADO", 60, 1], ["Pav.II", "TELHADO", 80, 1], ["Pav.III", "TELHADO", 105, 1],
  ["Pav.IV O", "OVERHEAD", 120, 4], ["Pav.IV", "TELHADO", 120, 1], ["Pav.V", "TELHADO", 65, 1],
  ["Pav.VI", "TELHADO", 60, 1], ["Pav.VII O", "OVERHEAD", 100, 4], ["Pav.VII", "TELHADO", 100, 1],
  ["IBS", "TELHADO", 40, 1], ["Receb", "TELHADO", 25, 1], ["Receb O", "OVERHEAD", 25, 1],
  ["Pav.I O", "OVERHEAD", 60, 2], ["Pav.II O", "OVERHEAD", 80, 4], ["Pav.III O", "OVERHEAD", 105, 4],
  ["Pav.VI O", "OVERHEAD", 60, 2], ["TSI", "TELHADO", 40, 1],
];
const sistemas: SistemaEntrada[] = anexoD.map(([identificacao, tipo, metragem, trechos], i) => ({ id: `s${i}`, identificacao, tipo, metragem, trechos }));

describe("dimensionamento", () => {
  it("OVERHEAD 4×120 m: 480 m instalados e 500 m de cabo", () => {
    const s = { tipo: "OVERHEAD" as const, metragem: 120, trechos: 4 };
    expect(extensaoInstalada(s)).toBe(480);
    expect(consumoCabo(s, REGRAS_MODELO)).toBe(500);
  });
  it("TELHADO ignora trechos na metragem", () => {
    expect(extensaoInstalada({ tipo: "TELHADO", metragem: 60, trechos: 3 })).toBe(60);
  });
  it("reproduz metragens e cabo do modelo (695 / 1.885 / 2.725 m, 93 dias)", () => {
    const r = calcularRevisao(sistemas, comps, REGRAS_MODELO, PARAMETROS_MODELO);
    expect(r.totais.metragem_telhado).toBe(695);
    expect(r.totais.metragem_overhead).toBe(1885);
    expect(r.totais.cabo_total).toBe(2725);
    expect(r.totais.dias_equipe).toBe(93);
  });
  it("trocar TELHADO→OVERHEAD remove componentes não aplicáveis", () => {
    const t = composicaoSistema({ id: "a", identificacao: "X", tipo: "TELHADO", metragem: 50, trechos: 1 }, REGRAS_MODELO);
    const o = composicaoSistema({ id: "a", identificacao: "X", tipo: "OVERHEAD", metragem: 50, trechos: 1 }, REGRAS_MODELO);
    expect(t.some((l) => l.chave === "flange")).toBe(true);
    expect(o.some((l) => l.chave === "flange")).toBe(false);
    expect(o.some((l) => l.chave === "proll")).toBe(true);
  });
  it("sistema parcial não gera composição", () => {
    expect(composicaoSistema({ id: "a", identificacao: "", tipo: "TELHADO", metragem: 50, trechos: 1 }, REGRAS_MODELO)).toEqual([]);
  });
  it("não fraciona peças indivisíveis", () => {
    expect(quantidadeOperacional(163.5, true)).toBe(164);
    expect(quantidadeOperacional(163.5, false)).toBe(163.5);
    expect(quantidadeOperacional(10, true, 6)).toBe(12);
  });
});

describe("orçamento", () => {
  it("inclui 18º e 26º sistemas em venda e custo (sem limite de linhas)", () => {
    const extras = Array.from({ length: 9 }, (_, i) => ({ id: `x${i}`, identificacao: `Extra ${i}`, tipo: "TELHADO" as const, metragem: 30, trechos: 1 }));
    const base = calcularRevisao(sistemas, comps, REGRAS_MODELO, PARAMETROS_MODELO);
    const r = calcularRevisao([...sistemas, ...extras], comps, REGRAS_MODELO, PARAMETROS_MODELO);
    expect(r.por_sistema).toHaveLength(26);
    expect(r.por_sistema[25]!.venda_materiais).toBeGreaterThan(0);
    expect(r.totais.materiais).toBeGreaterThan(base.totais.materiais);
    expect(r.totais.custo_materiais).toBeGreaterThan(base.totais.custo_materiais);
  });
  it("mudança de custo altera preço, não quantidades", () => {
    const a = calcularRevisao(sistemas, comps, REGRAS_MODELO, PARAMETROS_MODELO);
    const c2 = comps.map((c) => (c.codigo === "COMP-05" ? { ...c, custo: 20 } : c));
    const b = calcularRevisao(sistemas, c2, REGRAS_MODELO, PARAMETROS_MODELO);
    expect(b.itens.map((i) => i.quantidade)).toEqual(a.itens.map((i) => i.quantidade));
    expect(b.totais.materiais).toBeGreaterThan(a.totais.materiais);
  });
  it("mudança de metragem recalcula quantidades", () => {
    const s2 = sistemas.map((s, i) => (i === 0 ? { ...s, metragem: 200 } : s));
    const a = calcularRevisao(sistemas, comps, REGRAS_MODELO, PARAMETROS_MODELO);
    const b = calcularRevisao(s2, comps, REGRAS_MODELO, PARAMETROS_MODELO);
    expect(b.totais.cabo_total).toBe(a.totais.cabo_total + 140);
  });
  it("desconto altera bases comerciais, não a composição", () => {
    const a = calcularRevisao(sistemas, comps, REGRAS_MODELO, PARAMETROS_MODELO);
    const b = calcularRevisao(sistemas, comps, REGRAS_MODELO, { ...PARAMETROS_MODELO, desconto: 0.05 });
    expect(b.itens).toEqual(a.itens);
    expect(b.totais.final).toBeCloseTo(a.totais.base * 0.95, 1);
  });
  it("montagem independe do markup (CORREÇÃO F11)", () => {
    const r = calcularRevisao(sistemas, comps, REGRAS_MODELO, { ...PARAMETROS_MODELO, markup: 0.6 });
    expect(r.totais.montagem).toBeCloseTo(r.totais.materiais * 0.4, 2);
  });
  it("parcelas somam exatamente o total", () => {
    const p = distribuirParcelas(618346.87, Array(12).fill(1));
    expect(Math.round(p.reduce((a, b) => a + b, 0) * 100)).toBe(61834687);
    const q = distribuirParcelas(100.01, [50, 30, 20]);
    expect(Math.round(q.reduce((a, b) => a + b, 0) * 100)).toBe(10001);
  });
  it("sem escopo não gera viagem nem item técnico (CORREÇÃO F17)", () => {
    const r = calcularRevisao([], comps, REGRAS_MODELO, PARAMETROS_MODELO);
    expect(r.totais.viagens).toBe(0);
    expect(r.totais.final).toBe(0);
    expect(r.totais.margem).toBeNull();
  });
});
