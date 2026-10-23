import { describe, expect, it } from "vitest";

import { destinoInicial, menusVisiveis, podeVerEtapa, podeVerRota } from "../src/lib/nexus-nav";

describe("navegação por papel", () => {
  it("disponibiliza Agenda explicitamente aos leitores operacionais e à coordenação", () => {
    for (const role of ["admin", "engenharia", "compras", "campo"]) {
      expect(podeVerRota([role], "/agenda-equipe")).toBe(true);
      expect(menusVisiveis([role])[0]?.items.map((item) => item.to)).toEqual([
        "/",
        "/agenda-equipe",
      ]);
    }
    for (const role of ["comercial", "financeiro", "desconhecido", "constructor", "__proto__"]) {
      expect(podeVerRota([role], "/agenda-equipe")).toBe(false);
    }
    expect(podeVerRota([], "/agenda-equipe")).toBe(false);
    expect(podeVerRota([], "/agenda-equipe", ["coordenar_operacao"])).toBe(true);
    expect(podeVerRota([], "/agenda-equipe", ["coordenar_operacao_futuro"])).toBe(false);
    expect(podeVerRota(["comercial"], "/agenda-equipe", ["coordenar_operacao"])).toBe(true);
    expect(podeVerRota(["comercial"], "/agenda-equipe", [])).toBe(false);
  });

  it("mantém placeholders off nos menus e nas URLs, inclusive para admin e coordenação", () => {
    for (const roles of [["admin"], ["engenharia"], ["campo"], []]) {
      for (const caps of [[], ["coordenar_operacao"]]) {
        const itens = menusVisiveis(roles, caps).flatMap((group) =>
          group.items.map((item) => item.to),
        );
        for (const off of ["/documentacao", "/inspecoes", "/projetos-engenharia", "/seguranca"]) {
          expect(itens).not.toContain(off);
          expect(podeVerRota(roles, off, caps)).toBe(false);
          expect(podeVerRota(roles, off + "/registro", caps)).toBe(false);
        }
      }
    }
  });

  it("cada menu visível e destino inicial continua autorizado após aplicar a disponibilidade", () => {
    for (const roles of [
      ["admin"],
      ["comercial"],
      ["engenharia"],
      ["compras"],
      ["financeiro"],
      ["campo"],
      ["engenharia", "campo"],
      [],
    ]) {
      for (const caps of [[], ["coordenar_operacao"]]) {
        for (const group of menusVisiveis(roles, caps)) {
          expect(group.items.length).toBeGreaterThan(0);
          for (const item of group.items) expect(podeVerRota(roles, item.to, caps)).toBe(true);
        }
        const inicio = destinoInicial(roles, caps);
        if (inicio !== "/auth") expect(podeVerRota(roles, inicio, caps)).toBe(true);
      }
    }
  });

  it("permite à Engenharia atravessar os módulos técnicos e operacionais existentes", () => {
    const itens = menusVisiveis(["engenharia"]).flatMap((grupo) =>
      grupo.items.map((item) => item.to),
    );

    expect(itens).toEqual([
      "/",
      "/agenda-equipe",
      "/comercial",
      "/clientes",
      "/produtos",
      "/levantamentos",
      "/engenharia",
      "/mapas-3d/unidades",
      "/escada-lc02",
      "/projetos",
      "/execucao",
      "/almoxarifado",
      "/equipe",
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
    [
      "compras",
      ["/", "/agenda-equipe", "/clientes", "/produtos", "/projetos", "/compras", "/almoxarifado"],
    ],
    ["financeiro", ["/", "/projetos", "/financeiro", "/relatorios"]],
    ["campo", ["/", "/agenda-equipe", "/levantamentos", "/execucao", "/almoxarifado", "/equipe"]],
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
    expect(podeVerRota(["admin"], "/projetos-engenharia")).toBe(false);
    expect(podeVerRota(["admin"], "/projetos-engenharia-futuro")).toBe(false);
    expect(podeVerRota(["compras"], "/projetos-engenharia/privado")).toBe(false);
    expect(podeVerRota(["comercial"], "/comercializacao")).toBe(false);
    expect(podeVerRota(["admin"], "/agenda-equipe-futuro")).toBe(false);
  });

  it("concede coordenação explícita a um membro sem papel sem ampliar acesso técnico ou administrativo", () => {
    const caps = ["coordenar_operacao"];
    const paths = menusVisiveis([], caps).flatMap((g) => g.items.map((i) => i.to));
    expect(paths).toEqual([
      "/",
      "/agenda-equipe",
      "/levantamentos",
      "/execucao",
      "/almoxarifado",
      "/equipe",
    ]);
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

  it("disponibiliza OS e PET com a mesma matriz no menu e no acesso direto", () => {
    for (const role of ["admin", "engenharia", "campo"]) {
      expect(podeVerRota([role], "/execucao/pets/pet-autorizada")).toBe(true);
      expect(menusVisiveis([role]).flatMap((g) => g.items.map((i) => i.to))).toContain("/execucao");
    }
    for (const role of ["comercial", "financeiro", "compras", "desconhecido"])
      expect(podeVerRota([role], "/execucao/pets/pet-autorizada")).toBe(false);
    expect(podeVerRota([], "/execucao/ordens/os", ["coordenar_operacao"])).toBe(true);
  });
});
