import { describe, expect, it } from "vitest";
import {
  draftPayload,
  filterPetPickerOptions,
  pendingTarget,
  petAnswerError,
  petConferenceActions,
  petDraft,
  petModelRequirements,
  updatePetAnswer,
} from "../src/features/pet/preparation-domain";
import type { PetDetalhe, PetOption, PetResposta } from "../src/features/pet/ui-types";
import { petPdfFixture } from "./fixtures/pet-pdf.fixture";

describe("PET: preparação preserva o documento", () => {
  it("usa o ID da versão e retira da equipe somente vínculos encerrados", () => {
    const detail = petPdfFixture(0) as unknown as PetDetalhe;
    detail.participantes.push(
      {
        ...detail.participantes[0]!,
        id: "anterior",
        pessoa_id: "anterior",
        fim: "2026-10-23T03:00:00Z",
      },
      {
        ...detail.participantes[0]!,
        id: "anterior-v2",
        pessoa_id: "anterior-v2",
        fim_vigencia: "2026-10-23T03:00:00Z",
      },
    );
    detail.pet.conteudo = { ...detail.pet.conteudo, modelo_id: "id-antigo-no-json" };
    const draft = petDraft(detail);
    expect(draft.modelo_id).toBe(detail.pet.modelo_versao_id);
    expect(draft.participantes.map((person) => person.pessoa_id)).toEqual(["pessoa-1"]);
    expect(draft.respostas).toEqual([]);
    expect(draft.monitoramento_continuo.confirmado).toBe(false);
  });

  it("mescla somente campos editados sem apagar propriedades de outras etapas", () => {
    const detail = petPdfFixture(0) as unknown as PetDetalhe;
    const base = {
      ...detail.pet.conteudo,
      condicao_final: "Registro final preservado",
      metadados_versao: { origem: "procedimento", valores: [1, false, null] },
      procedimentos: {
        legado: { referencia: "Manter JSON desconhecido" },
        comunicacao: "Anterior",
      },
      monitoramento_continuo: { aprovado_por: "pessoa-original", confirmado: false },
    };
    const original = structuredClone(base);
    const draft = petDraft(detail);
    draft.termino_previsto = "2026-10-24T08:30";
    draft.procedimentos = { comunicacao: "Canal conferido" };
    const payload = draftPayload(draft, "Asia/Tokyo", base);
    expect(payload["termino_previsto"]).toBe("2026-10-23T23:30:00.000Z");
    expect(payload["conteudo"]).toMatchObject({
      condicao_final: "Registro final preservado",
      metadados_versao: original.metadados_versao,
      procedimentos: {
        legado: { referencia: "Manter JSON desconhecido" },
        comunicacao: "Canal conferido",
      },
      monitoramento_continuo: { aprovado_por: "pessoa-original", confirmado: false },
    });
    expect(base).toEqual(original);
  });

  it("editar o texto conserva os segundos e a representação da validade que não mudou", () => {
    const detail = petPdfFixture(0) as unknown as PetDetalhe;
    detail.pet.termino_previsto = "2026-10-23T10:00:47.913+00:00";
    const draft = petDraft(detail);
    draft.atividade = "Descrição editada sem alterar a jornada";
    expect(draft.termino_previsto).toBe("2026-10-23T07:00");
    const payload = draftPayload(
      draft,
      detail.pet.timezone,
      detail.pet.conteudo,
      detail.pet.termino_previsto,
    );
    expect(payload["atividade"]).toBe(draft.atividade);
    expect(payload["termino_previsto"]).toBe("2026-10-23T10:00:47.913+00:00");
  });

  it("uma validade editada continua sendo convertida no fuso explícito da PET", () => {
    const detail = petPdfFixture(0) as unknown as PetDetalhe;
    detail.pet.termino_previsto = "2026-10-23T10:00:47.913+00:00";
    const draft = petDraft(detail);
    draft.termino_previsto = "2026-10-23T07:01";
    const payload = draftPayload(
      draft,
      detail.pet.timezone,
      detail.pet.conteudo,
      detail.pet.termino_previsto,
    );
    expect(payload["termino_previsto"]).toBe("2026-10-23T10:01:00.000Z");
  });

  it("preserva justificativas ocultas e respostas de outros itens ao mudar a escolha", () => {
    const answers: PetResposta[] = [
      { item: "isolamento", resposta: "nao_aplicavel", justificativa: "Previsão do procedimento" },
      { item: "legado_oculto", resposta: "nao", justificativa: "Verificação anterior" },
    ];
    const next = updatePetAnswer(answers, "isolamento", { resposta: "sim" });
    expect(next[0]).toEqual({
      item: "isolamento",
      resposta: "sim",
      justificativa: "Previsão do procedimento",
    });
    expect(next[1]).toBe(answers[1]);
    expect(answers[0]?.resposta).toBe("nao_aplicavel");
    expect(updatePetAnswer(next, "novo", { justificativa: "Anotação local" }).at(-1)).toEqual({
      item: "novo",
      resposta: "nao_verificado",
      justificativa: "Anotação local",
    });
  });
});

describe("PET: pendências seguem coordenadas explícitas", () => {
  const model: PetOption = {
    id: "versao-3",
    procedimento: { itens: [{ id: "controle-especifico", rotulo: "Rótulo que pode mudar" }] },
  };
  it("leva os campos e itens canônicos à etapa correspondente", () => {
    expect(pendingTarget({ codigo: "modelo", campo: "modelo_versao_id" })).toEqual({
      stage: 0,
      item: "modelo_versao_id",
    });
    expect(pendingTarget({ campo: "contatos_emergencia" })).toEqual({
      stage: 1,
      item: "contatos_emergencia",
    });
    expect(pendingTarget({ campo: "isolamento" })).toEqual({ stage: 2, item: "isolamento" });
    expect(pendingTarget({ campo: "controle-especifico" }, model)).toEqual({
      stage: 2,
      item: "controle-especifico",
    });
    expect(pendingTarget({ campo: "procedimentos.dispositivo_adequado" })).toEqual({
      stage: 3,
      item: "procedimentos.dispositivo_adequado",
    });
    expect(pendingTarget({ codigo: "leitura", campo: "avaliacoes.O2" })).toEqual({
      stage: 3,
      item: "avaliacoes.O2",
    });
    expect(pendingTarget({ campo: "assinaturas" })).toEqual({ stage: 4, item: "assinaturas" });
    expect(pendingTarget({ etapa: 1, item: "participantes" })).toEqual({
      stage: 1,
      item: "participantes",
    });
  });
  it("mantém mensagem livre ou coordenada desconhecida na conferência", () => {
    expect(pendingTarget("Revise equipe, atmosfera e assinatura")).toEqual({ stage: 4 });
    expect(
      pendingTarget({
        codigo: "novo-codigo",
        campo: "supervisor_de_outro_fluxo",
        mensagem: "Equipe",
      }),
    ).toEqual({ stage: 4 });
    expect(pendingTarget({ etapa: 8, campo: "rota_desconhecida" })).toEqual({ stage: 4 });
    expect(pendingTarget({ campo: "Rótulo que pode mudar" }, model)).toEqual({ stage: 4 });
    expect(pendingTarget({ campo: "procedimentos.campo_novo_desconhecido" })).toEqual({ stage: 4 });
  });
});

describe("PET: seleção de pessoas e critérios", () => {
  it("busca sem distinguir acentos e preserva IDs de nomes iguais", () => {
    const options = [
      { id: "pessoa-1", label: "João da Conceição", description: "Equipe de São Luís" },
      { id: "pessoa-2", label: "João da Conceição", description: "Equipe de Curitiba" },
      { id: "pessoa-3", label: "Maria Silva" },
    ];
    expect(filterPetPickerOptions(options, "  JOAO conceicao ").map((option) => option.id)).toEqual(
      ["pessoa-1", "pessoa-2"],
    );
    expect(filterPetPickerOptions(options, "joao SAO").map((option) => option.id)).toEqual([
      "pessoa-1",
    ]);
    expect(filterPetPickerOptions(options, " ")).toEqual(options);
  });
  it("mantém os IDs declarados do procedimento sem derivar critérios do nome", () => {
    const requirements = petModelRequirements({
      id: "modelo",
      procedimento: {
        itens: [
          { id: "item-a", rotulo: "Mesmo rótulo" },
          { id: "item-b", rotulo: "Mesmo rótulo" },
          { rotulo: "Sem ID" },
          { id: "item-a", rotulo: "Duplicado" },
        ],
      },
    });
    expect(requirements.map((rule) => rule.id)).toEqual(["item-a", "item-b"]);
    expect(petModelRequirements({ id: "modelo-sem-criterios", nome: "NR-33" })).toEqual([]);
    expect(
      petAnswerError({ item: "a", resposta: "nao_aplicavel" }, { id: "a", permite_na: false }),
    ).toContain("não permite");
    expect(
      petAnswerError({ item: "a", resposta: "nao_aplicavel" }, { id: "a", permite_na: true }),
    ).toContain("5 caracteres");
    expect(
      petAnswerError(
        { item: "a", resposta: "nao_aplicavel" },
        { id: "a", permite_na: true, justificativa_na: false },
      ),
    ).toBeUndefined();
    expect(
      petAnswerError({ item: "a", resposta: "sim" }, { id: "a", permite_na: false }),
    ).toBeUndefined();
  });
});

describe("PET: ações da conferência respeitam o estado documental", () => {
  it("oferece conferência apenas durante o preparo e emissão apenas após a conferência", () => {
    const permissions = { conferir: true, emitir: true };
    for (const state of ["rascunho", "em_conferencia"]) {
      expect(petConferenceActions(state, permissions, true)).toEqual({
        conferir: { visible: true, enabled: true },
        emitir: { visible: false, enabled: false },
      });
    }
    expect(petConferenceActions("aguardando_assinaturas", permissions, true)).toEqual({
      conferir: { visible: false, enabled: false },
      emitir: { visible: true, enabled: true },
    });
    for (const state of [
      "emitida",
      "encerramento_pendente",
      "encerrada",
      "cancelada",
      "desconhecida",
    ])
      expect(petConferenceActions(state, permissions, true)).toEqual({
        conferir: { visible: false, enabled: false },
        emitir: { visible: false, enabled: false },
      });
  });
  it("mantém os bloqueios de permissão e de integração mesmo no estado adequado", () => {
    expect(petConferenceActions("rascunho", {}, true).conferir).toEqual({
      visible: true,
      enabled: false,
    });
    expect(petConferenceActions("aguardando_assinaturas", { emitir: true }, false).emitir).toEqual({
      visible: true,
      enabled: false,
    });
    expect(petConferenceActions("aguardando_assinaturas", {}, true).emitir).toEqual({
      visible: true,
      enabled: false,
    });
  });
});
