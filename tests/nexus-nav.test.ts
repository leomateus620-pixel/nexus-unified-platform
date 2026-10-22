import { describe, expect, it } from "vitest";

import { destinoInicial, menusVisiveis, podeVerEtapa, podeVerRota } from "../src/lib/nexus-nav";

describe("navegação por papel", () => {
  it("permite à Engenharia atravessar os módulos técnicos e operacionais existentes", () => {
    const itens = menusVisiveis(["engenharia"]).flatMap((grupo) =>
      grupo.items.map((item) => item.to),
    );

    expect(itens).toEqual([
      "/",
      "/comercial",
      "/clientes",
      "/produtos",
      "/levantamentos",
      "/engenharia",
      "/projetos-engenharia",
      "/mapas-3d/unidades",
      "/escada-lc02",
      "/projetos",
      "/execucao",
      "/equipe",
      "/seguranca",
      "/documentacao",
      "/inspecoes",
    ]);
    expect(destinoInicial(["engenharia"])).toBe("/comercial");
    expect(podeVerRota(["engenharia"], "/")).toBe(true);
    expect(podeVerRota(["engenharia"], "/configuracoes")).toBe(false);
    expect(podeVerRota(["engenharia"], "/configuracoes/orcamentos")).toBe(false);
  });

  it("mantém os cinco fluxos comerciais e bloqueia os demais", () => {
    for (const etapa of [
      "itens-comerciais",
      "dimensionamento",
      "orcamento",
      "compras",
      "producao",
    ]) {
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

  it.each([[], ["desconhecido"], ["constructor"], ["__proto__"]])(
    "nega navegação sem um papel conhecido: %j",
    (...roles) => {
      expect(menusVisiveis(roles)).toEqual([]);
      expect(podeVerRota(roles, "/")).toBe(false);
      expect(podeVerRota(roles, "/comercial")).toBe(false);
      expect(podeVerEtapa(roles, "orcamento")).toBe(false);
      expect(destinoInicial(roles)).toBe("/auth");
    },
  );

  it("um papel desconhecido junto de Engenharia não amplia menus ou etapas", () => {
    expect(menusVisiveis(["engenharia", "futuro"])).toEqual(menusVisiveis(["engenharia"]));
    expect(podeVerRota(["engenharia", "futuro"], "/financeiro")).toBe(false);
    expect(podeVerEtapa(["engenharia", "futuro"], "historico")).toBe(false);
    expect(podeVerRota(["admin", "futuro"], "/configuracoes")).toBe(true);
  });

  it.each([
    ["comercial", ["/", "/comercial", "/clientes", "/produtos"]],
    ["compras", ["/", "/clientes", "/produtos", "/projetos", "/compras"]],
    ["financeiro", ["/", "/projetos", "/financeiro", "/relatorios"]],
    [
      "campo",
      ["/", "/levantamentos", "/execucao", "/equipe", "/seguranca", "/documentacao", "/inspecoes"],
    ],
  ])("o papel %s recebe somente seu contexto atual", (role, paths) => {
    const actual = menusVisiveis([role as string]).flatMap((g) => g.items.map((i) => i.to));
    expect(actual).toEqual(paths);
    expect(podeVerRota([role as string], "/configuracoes")).toBe(false);
  });

  it("combina capacidades conhecidas sem depender da ordem dos papéis", () => {
    expect(destinoInicial(["engenharia", "admin"])).toBe("/");
    expect(destinoInicial(["admin", "engenharia"])).toBe("/");
    expect(podeVerRota(["campo", "financeiro"], "/financeiro")).toBe(true);
    expect(podeVerRota(["campo", "financeiro"], "/comercial")).toBe(false);
  });

  it("reconhece fronteiras de rota e não concede futuros módulos por prefixo", () => {
    expect(podeVerRota(["admin"], "/projetos/projeto-1")).toBe(true);
    expect(podeVerRota(["admin"], "/projetos-engenharia")).toBe(true);
    expect(podeVerRota(["admin"], "/projetos-engenharia-futuro")).toBe(false);
    expect(podeVerRota(["compras"], "/projetos-engenharia/privado")).toBe(false);
    expect(podeVerRota(["comercial"], "/comercializacao")).toBe(false);
    expect(podeVerRota(["admin"], "/agenda-equipe")).toBe(false);
  });

  it("concede coordenação explícita a um membro sem papel sem ampliar acesso técnico ou administrativo", () => {
    const caps = ["coordenar_operacao"];
    const paths = menusVisiveis([], caps).flatMap((g) => g.items.map((i) => i.to));
    expect(paths).toEqual(["/", "/levantamentos", "/execucao", "/equipe", "/seguranca"]);
    expect(destinoInicial([], caps)).toBe("/");
    for (const path of paths) expect(podeVerRota([], path, caps)).toBe(true);
    for (const path of ["/configuracoes", "/financeiro", "/projetos-engenharia", "/comercial"])
      expect(podeVerRota([], path, caps)).toBe(false);
    expect(podeVerEtapa([], "orcamento")).toBe(false);
  });

  it("não reconhece nomes de capacidade desconhecidos e revoga menus ao retirar a concessão", () => {
    expect(menusVisiveis([], ["admin", "constructor", "__proto__"])).toEqual([]);
    expect(destinoInicial([], ["coordenar_operacao_futuro"])).toBe("/auth");
    expect(podeVerRota(["comercial"], "/equipe", ["coordenar_operacao"])).toBe(true);
    expect(podeVerRota(["comercial"], "/equipe", [])).toBe(false);
    expect(podeVerRota([], "/execucao-extra", ["coordenar_operacao"])).toBe(false);
  });
});
