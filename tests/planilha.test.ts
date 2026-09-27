import { describe, expect, it } from "vitest";

import {
  composicaoSistema,
  REGRAS_MODELO,
  sistemaValido,
  type SistemaEntrada,
} from "../src/features/calculo/domain";
import {
  CUSTO_COMP08_HIST,
  OVERHEAD_PLANILHA,
  SISTEMAS_PLANILHA,
  TOTAIS_PLANILHA,
} from "./fixtures/planilha-referencia";

const sis: SistemaEntrada[] = SISTEMAS_PLANILHA.map(([identificacao, tipo, metragem, trechos], i) => ({
  id: `s${i}`,
  identificacao,
  tipo,
  metragem,
  trechos,
}));

function somar(lista: SistemaEntrada[]) {
  const t = new Map<string, number>();
  for (const s of lista)
    for (const l of composicaoSistema(s, REGRAS_MODELO))
      t.set(l.codigo, Math.round(((t.get(l.codigo) ?? 0) + l.quantidade_tecnica) * 1e6) / 1e6);
  return t;
}

describe("C01 — fidelidade à planilha (17 sistemas originais)", () => {
  it("OVERHEAD 4×120 m: 40 intermediárias, 56 treliças, 48 alongadores", () => {
    const q = Object.fromEntries(
      composicaoSistema(
        { id: "a", identificacao: "X", tipo: "OVERHEAD", metragem: 120, trechos: 4 },
        REGRAS_MODELO,
      ).map((l) => [l.chave, l.quantidade_tecnica]),
    );
    expect(q.intermediaria).toBe(40);
    expect(q.ancoragem_trelica).toBe(56);
    expect(q.pilar_alongador).toBe(48);
  });

  it("sete registros OVERHEAD: 158 / 219 / 187", () => {
    const t = somar(sis.filter((s) => s.tipo === "OVERHEAD"));
    expect(t.get("COMP-06")).toBe(OVERHEAD_PLANILHA.intermediaria);
    expect(t.get("COMP-10")).toBe(OVERHEAD_PLANILHA.trelica);
    expect(t.get("COMP-11")).toBe(OVERHEAD_PLANILHA.alongador);
  });

  it("todas as famílias batem com LISTA_COMPRAS", () => {
    const t = somar(sis);
    for (const [cod, ref] of Object.entries(TOTAIS_PLANILHA))
      expect({ cod, qtd: t.get(cod) ?? 0 }).toEqual({ cod, qtd: ref.qtd });
  });

  it("COMP-08: 81 conjuntos e R$ 10.145,25 de custo bruto histórico", () => {
    const q = somar(sis).get("COMP-08")!;
    expect(q).toBe(81);
    expect(Math.round(q * CUSTO_COMP08_HIST * 100)).toBe(1014525);
  });
});

describe("C05 — entradas inválidas", () => {
  const base = { id: "a", identificacao: "X", metragem: 50 };
  it("rejeita trechos não inteiros, zero e TELHADO com vários trechos (legado)", () => {
    expect(sistemaValido({ ...base, tipo: "OVERHEAD", trechos: 1.5 })).toBe(false);
    expect(sistemaValido({ ...base, tipo: "OVERHEAD", trechos: 0 })).toBe(false);
    expect(sistemaValido({ ...base, tipo: "TELHADO", trechos: 3 })).toBe(false);
    expect(sistemaValido({ ...base, tipo: "TELHADO", metragem: Number.NaN, trechos: 1 })).toBe(false);
    expect(sistemaValido({ ...base, tipo: "TELHADO", metragem: -5, trechos: 1 })).toBe(false);
  });
  it("espaçamento zero não gera quantidade infinita", () => {
    const r = { ...REGRAS_MODELO, overhead: { ...REGRAS_MODELO.overhead, espacamento_intermediaria_m: 0 } };
    expect(() => composicaoSistema({ ...base, tipo: "OVERHEAD", trechos: 2 }, r)).toThrow();
  });
});
