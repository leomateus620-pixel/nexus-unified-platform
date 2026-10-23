import { describe, expect, it } from "vitest";
import {
  buscarOpcoesEstudoSchema,
  comandoEstudoSchema,
  fonteBibliograficaSchema,
  listarEstudosSchema,
  publicarMetodoEstudoSchema,
  requisitosMetodoSchema,
  vincularAcaoEstudoSchema,
} from "../src/features/estudos/schemas";
import {
  acessoEstudoNegado,
  ESTUDO_ACESSO_INDISPONIVEL,
  compararSubmissoesEstudo,
  pendenciasEstudo,
} from "../src/features/estudos/domain";
import type { EstudoDetalhe } from "../src/features/estudos/types";

const id = (n: number) => `00000000-0000-4000-8000-${String(n).padStart(12, "0")}`;
const base = { organization_id: id(1), chave: id(2), estudo_id: id(3), revisao_id: id(4) };
const publication = {
  organization_id: id(1),
  chave: id(2),
  nome: "Procedimento de teste",
  tipo: "memorial",
  instrucoes: "Critérios registrados somente no teste isolado",
  fontes: [{ titulo: "Procedimento interno de teste", edicao: "V1", emissor: "Equipe de teste" }],
};

describe("Estudos técnicos: contratos sem critérios normativos presumidos", () => {
  it("identifica a negação serializável sem depender de uma classe de erro", () => {
    expect(acessoEstudoNegado(new Error(ESTUDO_ACESSO_INDISPONIVEL))).toBe(true);
    expect(acessoEstudoNegado({ message: ESTUDO_ACESSO_INDISPONIVEL })).toBe(true);
  });
  it("preserva a distinção entre falta de acesso e falha de rede", () => {
    for (const error of [
      null,
      undefined,
      "42501",
      {},
      new Error("Falha de rede"),
      { message: "Fonte mudou" },
    ])
      expect(acessoEstudoNegado(error)).toBe(false);
  });
  it("permite elaborar conteúdo incompleto sem simular aprovação", () => {
    const draft = comandoEstudoSchema.parse({
      ...base,
      comando: "salvar_revisao",
      expected_version: 1,
      responsavel_tecnico_id: id(5),
      escopo: "",
      premissas: "",
      analise: "",
      conclusao: "",
      responsabilidade_tecnica: "",
      art_referencia: "",
    });
    expect(draft.analise).toBe("");
    expect(draft).not.toHaveProperty("aprovado_por");
    expect(comandoEstudoSchema.safeParse({ ...draft, aprovado_por: id(6) }).success).toBe(false);
  });
  it("requer versões e motivos nas decisões e na abertura de revisão", () => {
    for (const comando of ["devolver", "aprovar", "cancelar", "nova_revisao"]) {
      expect(comandoEstudoSchema.safeParse({ ...base, comando, expected_version: 1 }).success).toBe(
        false,
      );
      expect(
        comandoEstudoSchema.safeParse({ ...base, comando, motivo: "Conferência registrada" })
          .success,
      ).toBe(false);
      expect(
        comandoEstudoSchema.safeParse({
          ...base,
          comando,
          expected_version: 1,
          motivo: "Conferência registrada",
        }).success,
      ).toBe(true);
    }
    expect(
      comandoEstudoSchema.safeParse({
        ...base,
        comando: "submeter",
        expected_version: 1,
        autor: id(6),
      }).success,
    ).toBe(false);
  });
  it("bulk preserva medidas omitidas e exige versão de cada medida existente", () => {
    const point = {
      ...base,
      comando: "salvar_perigo",
      perigo_id: id(7),
      expected_version: 1,
      codigo: "P1",
    };
    expect(comandoEstudoSchema.safeParse(point).success).toBe(true);
    expect(comandoEstudoSchema.parse(point)).not.toHaveProperty("medidas");
    expect(
      comandoEstudoSchema.safeParse({ ...point, medidas: [{ medida_id: id(8) }] }).success,
    ).toBe(false);
    const measure = { medida_id: id(8), expected_version: 1 };
    expect(comandoEstudoSchema.safeParse({ ...point, medidas: [measure] }).success).toBe(true);
    expect(comandoEstudoSchema.safeParse({ ...point, medidas: [measure, measure] }).success).toBe(
      false,
    );
    expect(
      comandoEstudoSchema.safeParse({ ...point, medidas: Array.from({ length: 101 }, () => ({})) })
        .success,
    ).toBe(false);
  });
  it("excluir perigo exige também versão da revisão que contém suas medidas", () => {
    const command = { ...base, comando: "excluir_perigo", perigo_id: id(7), expected_version: 1 };
    expect(comandoEstudoSchema.safeParse(command).success).toBe(false);
    expect(
      comandoEstudoSchema.safeParse({ ...command, expected_revision_version: 3 }).success,
    ).toBe(true);
  });
  it("fontes operacionais usam exatamente uma FK compatível com o tipo", () => {
    const source = {
      ...base,
      comando: "vincular_fonte",
      expected_version: 1,
      tipo_fonte: "levantamento",
      levantamento_revisao_id: id(9),
      justificativa: "Coleta conferida para a análise",
    };
    expect(comandoEstudoSchema.safeParse(source).success).toBe(true);
    expect(comandoEstudoSchema.safeParse({ ...source, pe_versao_id: id(10) }).success).toBe(false);
    expect(
      comandoEstudoSchema.safeParse({ ...source, tipo_fonte: "projeto_engenharia" }).success,
    ).toBe(false);
    expect(
      comandoEstudoSchema.safeParse({ ...source, fonte_snapshot: { totais: "forged" } }).success,
    ).toBe(false);
  });
  it("fontes bibliográficas exigem edição/emissor e aceitam somente URLs http ou https", () => {
    const source = { titulo: "Fonte técnica", edicao: "2026", emissor: "Emissor de teste" };
    expect(fonteBibliograficaSchema.safeParse(source).success).toBe(true);
    expect(fonteBibliograficaSchema.parse({ ...source, url: "", consultado_em: "" })).toEqual({
      ...source,
      url: null,
      consultado_em: null,
    });
    expect(
      fonteBibliograficaSchema.safeParse({
        ...source,
        url: "https://example.invalid/fonte",
        consultado_em: "2024-02-29",
      }).success,
    ).toBe(true);
    for (const url of [
      "javascript:alert(1)",
      "data:text/html,test",
      "file:///documento.pdf",
      "ftp://example.invalid/fonte",
    ])
      expect(fonteBibliograficaSchema.safeParse({ ...source, url }).success).toBe(false);
    expect(
      fonteBibliograficaSchema.safeParse({ ...source, consultado_em: "2025-02-29" }).success,
    ).toBe(false);
    expect(fonteBibliograficaSchema.safeParse({ ...source, edicao: "" }).success).toBe(false);
  });
  it("método exige fonte e não cria regra, fórmula ou habilitação por omissão", () => {
    const checked = publicarMetodoEstudoSchema.parse(publication);
    expect(checked.requisitos).toEqual({
      exige_levantamento: false,
      exige_perigos: false,
      exige_medidas: false,
      exige_art: false,
      revisao_independente: false,
    });
    expect(publicarMetodoEstudoSchema.safeParse({ ...publication, fontes: [] }).success).toBe(
      false,
    );
    expect(
      publicarMetodoEstudoSchema.safeParse({
        ...publication,
        fontes: Array.from({ length: 51 }, () => publication.fontes[0]),
      }).success,
    ).toBe(false);
    expect(requisitosMetodoSchema.safeParse({ risco_maximo_legal: 10 }).success).toBe(false);
    expect(
      publicarMetodoEstudoSchema.safeParse({ ...publication, registro_profissional: "forjado" })
        .success,
    ).toBe(false);
  });
  it("ação requer instrução liberada e pessoa real, sem aceitar cópia da análise", () => {
    const request = { organization_id: id(1), chave: id(2), medida_id: id(8) };
    expect(vincularAcaoEstudoSchema.safeParse(request).success).toBe(false);
    expect(
      vincularAcaoEstudoSchema.safeParse({
        ...request,
        titulo: "Executar medida",
        responsavel_id: id(5),
      }).success,
    ).toBe(true);
    expect(vincularAcaoEstudoSchema.safeParse({ ...request, acao_id: id(9) }).success).toBe(true);
    expect(
      vincularAcaoEstudoSchema.safeParse({
        ...request,
        acao_id: id(9),
        snapshot: { analise: "segredo" },
      }).success,
    ).toBe(false);
  });
  it("limita paginação e não permite fonte arbitrária de seletor", () => {
    expect(listarEstudosSchema.parse({ organization_id: id(1), busca: "%_'" }).busca).toBe("%_'");
    expect(listarEstudosSchema.safeParse({ organization_id: id(1), pagina: 10001 }).success).toBe(
      false,
    );
    expect(listarEstudosSchema.safeParse({ organization_id: id(1), limite: 500 }).success).toBe(
      false,
    );
    expect(
      buscarOpcoesEstudoSchema.safeParse({ organization_id: id(1), tipo: "auth.users" }).success,
    ).toBe(false);
  });
  it("comparação mantém snapshots e destaca alteração técnica sem aplicar valores", () => {
    const oldSnapshot = Object.freeze({
      revisao: Object.freeze({ escopo: "Escopo original", analise: "Análise original" }),
      fontes: Object.freeze([{ id: id(9), tipo: "levantamento" }]),
    });
    const nextSnapshot = {
      revisao: { escopo: "Escopo original", analise: "Análise revisada" },
      fontes: [{ id: id(9), tipo: "levantamento" }],
    };
    const before = JSON.stringify(oldSnapshot);
    const differences = compararSubmissoesEstudo(
      { snapshot: JSON.parse(before) },
      { snapshot: nextSnapshot },
    );
    expect(differences).toEqual([
      { campo: "analise", anterior: "Análise original", atual: "Análise revisada" },
    ]);
    expect(JSON.stringify(oldSnapshot)).toBe(before);
    expect(
      compararSubmissoesEstudo({ snapshot: nextSnapshot }, { snapshot: nextSnapshot }),
    ).toEqual([]);
  });
  it("pendências exibidas vêm do servidor e não calculam aprovação no browser", () => {
    const detail = {
      bloqueios: ["Método não publicado.", "Revisor profissional não configurado."],
    } as EstudoDetalhe;
    const pending = pendenciasEstudo(detail);
    pending.pop();
    expect(detail.bloqueios).toHaveLength(2);
    expect(pending[0]).toBe("Método não publicado.");
  });
});
