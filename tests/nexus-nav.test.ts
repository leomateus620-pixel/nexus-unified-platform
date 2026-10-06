import { describe, expect, it } from "vitest";

import {
  destinoInicial,
  menusVisiveis,
  podeVerEtapa,
  podeVerRota,
} from "../src/lib/nexus-nav";

describe("navegação por papel", () => {
  it("limita Engenharia aos três módulos definidos", () => {
    const itens = menusVisiveis(["engenharia"]).flatMap((grupo) =>
      grupo.items.map((item) => item.to),
    );

    expect(itens).toEqual(["/comercial", "/produtos", "/engenharia"]);
    expect(destinoInicial(["engenharia"])).toBe("/comercial");
    expect(podeVerRota(["engenharia"], "/")).toBe(false);
    expect(podeVerRota(["engenharia"], "/configuracoes")).toBe(false);
    expect(podeVerRota(["engenharia"], "/configuracoes/orcamentos")).toBe(false);
  });

  it("mantém os cinco fluxos comerciais e bloqueia os demais", () => {
    for (const etapa of ["itens-comerciais", "dimensionamento", "orcamento", "compras", "producao"]) {
      expect(podeVerEtapa(["engenharia"], etapa)).toBe(true);
    }
    for (const etapa of ["resumo-executivo", "parametros", "historico"]) {
      expect(podeVerEtapa(["engenharia"], etapa)).toBe(false);
    }
  });

  it("preserva o acesso amplo e a Dashboard para administrador", () => {
    expect(destinoInicial(["admin"])).toBe("/");
    expect(podeVerRota(["admin"], "/")).toBe(true);
    expect(menusVisiveis(["admin"]).flatMap((grupo) => grupo.items).length).toBeGreaterThan(3);
  });
});