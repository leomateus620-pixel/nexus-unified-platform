import { createElement } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it, vi } from "vitest";
vi.mock("../src/features/nr/NrPhotoGallery", () => ({ NrPhotoGallery: () => null }));
import { NrSurveyField } from "../src/features/nr/NrSurveyFields";
import type { SurveyFieldDefinition } from "../src/features/nr/survey-projection";

const render = (field: SurveyFieldDefinition, value: unknown, disabled = false) =>
  renderToStaticMarkup(
    createElement(NrSurveyField, { field, value, disabled, onChange: () => {} }),
  );
describe("campos técnicos do levantamento sem JSON digitado", () => {
  it("múltipla escolha preserva resposta histórica fora das opções e não exige estrutura JSON", () => {
    const markup = render(
      {
        id: "B16.documentos",
        nome: "Documentos apresentados",
        tipo: "multipla",
        obrigatorio: false,
        opcoes: ["Projeto", "ART"],
      },
      ["ART", "Laudo anterior"],
    );
    expect(markup).toContain('type="checkbox"');
    expect(markup).toContain("Laudo anterior");
    expect(markup).toContain("resposta histórica");
    expect(markup).not.toContain("<textarea");
    expect(markup).not.toContain("JSON");
  });
  it("sistemas repetíveis têm controles nomeados e conservam propriedades desconhecidas", () => {
    const value = [
      {
        sistema: "Ancoragem de teste",
        quantidade: 0,
        fonte_futura: { descricao: "Fonte preservada" },
      },
    ];
    const before = structuredClone(value);
    const markup = render(
      {
        id: "B16.sistemas",
        nome: "Sistemas levantados",
        tipo: "lista",
        obrigatorio: true,
        subcampos: [
          { id: "sistema", nome: "Descrição do sistema", tipo: "texto", obrigatorio: false },
          { id: "quantidade", nome: "Quantidade", tipo: "numero", obrigatorio: false },
        ],
      },
      value,
    );
    expect(markup).toContain("Descrição do sistema");
    expect(markup).toContain('value="0"');
    expect(markup).toContain("Fonte preservada");
    expect(markup).toContain("Adicionar registro");
    expect(markup).not.toContain("JSON");
    expect(value).toEqual(before);
    const readOnly = render(
      { id: "B16.sistemas", nome: "Sistemas levantados", tipo: "lista", obrigatorio: false },
      value,
      true,
    );
    expect(readOnly).not.toContain("Remover registro");
    expect(readOnly).not.toContain("Adicionar registro");
  });
  it("dimensões aceitam decimais; valores não numéricos legados permanecem explicitamente preservados", () => {
    const field = {
      id: "B07.diametro",
      nome: "Diâmetro (m)",
      tipo: "numero",
      obrigatorio: true,
    } as const;
    expect(render(field, 2.5)).toContain('type="number"');
    expect(render(field, 2.5)).toContain('step="any"');
    expect(render(field, 2.5)).toContain('value="2.5"');
    expect(render(field, "Não medido")).toContain("Valor histórico preservado: Não medido");
  });
  it("matriz conserva cinco eixos e não oferece validação histórica como nova aprovação", () => {
    const markup = render(
      { id: "B14.itens", nome: "Itens avaliados", tipo: "checklist", obrigatorio: true },
      {
        GRUPO: {
          existencia: "ausente",
          aplicabilidade: "aplicavel",
          condicao: "nao_avaliada",
          acao: "instalar",
          validacao: "validada",
          justificativa: "Aguardando vistoria",
        },
      },
    );
    for (const label of [
      "Existência",
      "Aplicabilidade",
      "Condição",
      "Ação",
      "Validação histórica",
      "Aguardando vistoria",
    ])
      expect(markup).toContain(label);
    expect(markup.match(/<select /g)?.length).toBe(4);
    expect(markup).toContain("Uma avaliação não equivale a equipamento instalado");
  });
  it("valor calculado é leitura preservada e não cria cálculo ou input novo", () => {
    const markup = render(
      { id: "B07.volume", nome: "Volume (m³)", tipo: "calculado", obrigatorio: false },
      18.75,
    );
    expect(markup).toContain("<output");
    expect(markup).toContain("18.75");
    expect(markup).not.toContain("<input");
  });
});
