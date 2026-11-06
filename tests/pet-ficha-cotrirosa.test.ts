import { describe, expect, it } from "vitest";
import {
  FICHA_ITENS,
  FICHA_PERIGOS,
  emptyFicha,
  estadoDe,
  fichaPendencias,
  leiturasDe,
  o2Status,
  type Ficha,
} from "@/features/pet/cotrirosa-ficha";

const ids = FICHA_ITENS.map((i) => i.id);

describe("ficha PET Cotrirosa", () => {
  it("cinco famílias de perigo com as opções do papel", () => {
    expect(FICHA_PERIGOS.map((g) => g.grupo)).toEqual(["Químicos", "Físicos", "Ergonômicos", "Biológicos", "Acidentes"]);
    expect(FICHA_PERIGOS[3]!.itens.map((i) => i.perigo)).toEqual(["Vírus", "Bactérias", "Fungos", "Parasitas"]);
  });

  it("itens antes agrupados têm respostas independentes", () => {
    for (const id of ["epc_resgate_4x1", "epc_corda", "epc_iluminacao_fixa", "epc_escada_movel", "epi_cinturao", "epi_talabarte", "epi_auricular", "epi_creme"])
      expect(ids).toContain(id);
    const f: Ficha = { ...emptyFicha(), respostas: { epc_resgate_4x1: { estado: "S" } } };
    expect(estadoDe(f, "epc_corda")).toBe("NV");
  });

  it("cinturão aceita só Sim/Não", () => {
    expect(FICHA_ITENS.find((i) => i.id === "epi_cinturao")!.estados).toEqual(["S", "N"]);
  });

  it("resposta legada agrupada não confirma itens novos", () => {
    const f = { ...emptyFicha(), respostas: { iluminacao_escada: { estado: "S" as const } } };
    expect(estadoDe(f, "epc_iluminacao_fixa")).toBe("NV");
    expect(estadoDe(f, "epc_escada_movel")).toBe("NV");
  });

  it("O₂ segue 19,5–23 % e bloqueia fora da faixa", () => {
    expect(o2Status("20.9")).toBe("ok");
    expect(o2Status("19.5")).toBe("atencao");
    expect(o2Status("19.4")).toBe("bloqueio");
    expect(o2Status("23.1")).toBe("bloqueio");
  });

  it("os dois testes atmosféricos ficam separados; leitura legada vai para o inicial", () => {
    const ls = [
      { agente: "O₂", valor: "20.9", momento: "inicial" },
      { agente: "O₂", valor: "20.5", momento: "pos_ventilacao" },
      { agente: "CO", valor: "1", momento: "pre_entrada" },
    ];
    expect(leiturasDe(ls, "inicial").map((l) => l.valor)).toEqual(["20.9", "1"]);
    expect(leiturasDe(ls, "pos_ventilacao").map((l) => l.valor)).toEqual(["20.5"]);
  });

  it("O₂ fora da faixa vira pendência impeditiva", () => {
    const p = fichaPendencias(emptyFicha(), [{ agente: "O₂", valor: "18", momento: "inicial" }]);
    expect(p.some((x) => x.tipo === "impeditiva" && x.id === "teste_inicial")).toBe(true);
  });

  it("trabalho a quente aplicável sem permissão vinculada fica pendente", () => {
    const f: Ficha = { ...emptyFicha(), respostas: { dur_trabalho_quente: { estado: "S" } } };
    expect(fichaPendencias(f).some((x) => x.id === "dur_trabalho_quente" && x.texto.includes("vincule"))).toBe(true);
    const ok: Ficha = { ...f, quente: { referencia: "PTQ-12" } };
    expect(fichaPendencias(ok).some((x) => x.texto.includes("vincule"))).toBe(false);
  });

  it("Não em qualquer item proíbe a entrada", () => {
    const f: Ficha = { ...emptyFicha(), respostas: { epc_extintor: { estado: "N" } } };
    expect(fichaPendencias(f).find((x) => x.id === "epc_extintor")!.tipo).toBe("impeditiva");
  });
});
