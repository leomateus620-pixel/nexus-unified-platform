import { describe, expect, it } from "vitest";

import { compararModelos, documentoInicial } from "../src/features/projetos-engenharia/domain";
import { documentoNativoSchema } from "../src/features/projetos-engenharia/schemas";

describe("Projetos de Engenharia: conteúdo nativo e proveniência", () => {
  it("não inventa medida, aprovação ou componente ao criar o documento", () => {
    const modelo = documentoInicial();
    expect(documentoNativoSchema.safeParse(modelo).success).toBe(true);
    expect(modelo.parametros).toEqual([]);
    expect(modelo.secoes.every((s) => s.texto === "")).toBe(true);
    expect(new Set(modelo.secoes.map((s) => s.id)).size).toBe(modelo.secoes.length);
  });

  it("preserva precisão e papel do valor declarado sem cálculo financeiro ou estrutural", () => {
    const modelo = documentoInicial();
    modelo.parametros.push({
      id: crypto.randomUUID(),
      nome: "Comprimento nominal",
      valor_original: "82,100000001",
      unidade: "m",
      natureza: "estimado",
      validacao: "a_confirmar",
      fonte: "Prancha 1, nota de levantamento por imagem aérea",
    });
    expect(documentoNativoSchema.parse(modelo).parametros[0]?.valor_original).toBe("82,100000001");
    expect(documentoNativoSchema.parse(modelo).parametros[0]?.validacao).toBe("a_confirmar");
  });

  it("rejeita parâmetro sem unidade/fonte e IDs repetidos entre seções e parâmetros", () => {
    const modelo = documentoInicial();
    modelo.parametros.push({
      id: modelo.secoes[0]!.id,
      nome: "Largura",
      valor_original: "1,2",
      unidade: "",
      natureza: "declarado",
      validacao: "a_confirmar",
      fonte: "",
    });
    const resultado = documentoNativoSchema.safeParse(modelo);
    expect(resultado.success).toBe(false);
    if (!resultado.success) expect(resultado.error.issues.length).toBeGreaterThanOrEqual(3);
  });

  it("compara pelo ID estável e identifica reordenação sem trocar a identidade das seções", () => {
    const base = documentoInicial();
    const atual = structuredClone(base);
    atual.secoes.reverse();
    const mudancas = compararModelos(base, atual);
    expect(mudancas).toHaveLength(1);
    expect(mudancas[0]?.campo).toBe("Ordem das seções");
    expect(base.secoes[0]?.id).toBe(atual.secoes.at(-1)?.id);
  });

  it("alterar fonte/status aparece no diff sem mudar a baseline", () => {
    const base = documentoInicial();
    base.parametros.push({
      id: crypto.randomUUID(),
      nome: "Largura útil",
      valor_original: "1,20",
      unidade: "m",
      natureza: "declarado",
      validacao: "a_confirmar",
      fonte: "Layout, folha 3",
    });
    const atual = structuredClone(base);
    atual.parametros[0]!.fonte = "Levantamento aprovado, ponto 2";
    atual.parametros[0]!.validacao = "conferido";
    expect(
      compararModelos(base, atual)
        .map((m) => m.campo)
        .sort(),
    ).toEqual(["fonte", "validacao"]);
    expect(base.parametros[0]?.validacao).toBe("a_confirmar");
  });

  it("recusa template não implementado e propriedades executáveis adicionais", () => {
    const modelo = documentoInicial();
    expect(documentoNativoSchema.safeParse({ ...modelo, familia: "cad_universal" }).success).toBe(
      false,
    );
    expect(documentoNativoSchema.safeParse({ ...modelo, sql: "select secret" }).success).toBe(
      false,
    );
  });
});
