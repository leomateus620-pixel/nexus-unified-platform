import { describe, expect, it } from "vitest";
import { anexoPai, anexoRow, uploadInput } from "../src/features/operacao/schemas";
import { IntencoesAnexoOperacional } from "../src/features/operacao/upload-intents";

const id = (n: number) => `00000000-0000-4000-8000-${String(n).padStart(12, "0")}`;
describe("Anexos canônicos: pais e identidade de envio", () => {
  it("preserva exatamente as chaves e nulls legados sem acrescentar novos defaults", () => {
    const pai = anexoPai.parse({ organization_id: id(1), pessoa_id: id(2) });
    expect(pai).toEqual({
      organization_id: id(1),
      pessoa_id: id(2),
      acao_id: null,
      qualificacao_id: null,
    });
    expect(Object.hasOwn(pai, "ferramenta_id")).toBe(false);
    expect(Object.hasOwn(pai, "calibracao_id")).toBe(false);
    expect(Object.hasOwn(pai, "pet_id")).toBe(false);
    expect(Object.hasOwn(pai, "pet_item")).toBe(false);
  });
  it("aceita cada um dos cinco pais e rejeita ausência, mistura e UUID inválido", () => {
    const keys = ["pessoa_id", "acao_id", "qualificacao_id", "ferramenta_id", "calibracao_id"];
    for (const key of keys) {
      expect(anexoPai.safeParse({ organization_id: id(1), [key]: id(2) }).success).toBe(true);
      expect(anexoPai.safeParse({ organization_id: id(1), [key]: "texto-livre" }).success).toBe(
        false,
      );
      for (const other of keys.filter((value) => value !== key))
        expect(
          anexoPai.safeParse({ organization_id: id(1), [key]: id(2), [other]: id(3) }).success,
        ).toBe(false);
    }
    expect(anexoPai.safeParse({ organization_id: id(1) }).success).toBe(false);
  });
  it("vincula evidência à PET e ao item sem misturar pais ou mudar requests antigos", () => {
    expect(
      anexoPai.safeParse({ organization_id: id(1), pet_id: id(2), pet_item: "epc_isolamento" })
        .success,
    ).toBe(true);
    expect(
      anexoPai.safeParse({ organization_id: id(1), pet_id: id(2), agenda_evento_id: id(3) })
        .success,
    ).toBe(false);
    expect(
      anexoPai.safeParse({ organization_id: id(1), pessoa_id: id(2), pet_item: "epc_isolamento" })
        .success,
    ).toBe(false);
  });
  it("normaliza apenas a leitura de um recibo legado, sem tocar o request", () => {
    const row = anexoRow.parse({
      id: id(5),
      organization_id: id(1),
      nome: "original.pdf",
      mime: "application/pdf",
      tamanho: 10,
      sha256: "a".repeat(64),
      caminho: "privado",
      estado: "pendente",
      pessoa_id: id(2),
      acao_id: null,
      qualificacao_id: null,
    });
    expect(row.ferramenta_id).toBeNull();
    expect(row.calibracao_id).toBeNull();
    const request = uploadInput.parse({
      pai: { organization_id: id(1), pessoa_id: id(2) },
      chave: id(4),
      nome: row.nome,
      mime: row.mime,
      tamanho: row.tamanho,
      sha256: row.sha256,
    });
    expect(Object.hasOwn(request.pai, "ferramenta_id")).toBe(false);
  });
  it("mantém limite e integridade comuns sem aceitar arquivos vazios ou hash livre", () => {
    const request = {
      pai: { organization_id: id(1), ferramenta_id: id(2) },
      chave: id(4),
      nome: "foto.jpg",
      mime: "image/jpeg",
      tamanho: 1,
      sha256: "a".repeat(64),
    };
    expect(uploadInput.safeParse(request).success).toBe(true);
    for (const delta of [{ tamanho: 0 }, { tamanho: 20 * 1024 * 1024 + 1 }, { sha256: "qualquer" }])
      expect(uploadInput.safeParse({ ...request, ...delta }).success).toBe(false);
  });
  it("retry conserva chave enquanto outro conteúdo ou pai inicia outra intenção", () => {
    let key = 0;
    const intents = new IntencoesAnexoOperacional(() => `key-${++key}`);
    const original = intents.chave("ferramenta-1:foto-a");
    expect(intents.chave("ferramenta-1:foto-a")).toBe(original);
    expect(intents.chave("ferramenta-1:foto-b")).not.toBe(original);
    expect(intents.chave("ferramenta-2:foto-a")).not.toBe(original);
  });
  it("cancelamento encerra o payload conhecido mesmo quando a resposta perdeu o ID", () => {
    let key = 0;
    const intents = new IntencoesAnexoOperacional(() => `key-${++key}`);
    const old = intents.chave("payload-original");
    intents.cancelar(id(9), "payload-original");
    expect(intents.chave("payload-original")).not.toBe(old);
  });
  it("cancela aliases identificados pelo mesmo arquivo, preservando outro registro legítimo", () => {
    let key = 0;
    const intents = new IntencoesAnexoOperacional(() => `key-${++key}`);
    const a = intents.chave("nome-a:conteudo-a");
    const alias = intents.chave("nome-b:conteudo-a");
    const other = intents.chave("nome-c:conteudo-a");
    intents.identificar("nome-a:conteudo-a", id(9));
    intents.identificar("nome-b:conteudo-a", id(9));
    intents.identificar("nome-c:conteudo-a", id(10));
    intents.cancelar(id(9));
    expect(intents.chave("nome-a:conteudo-a")).not.toBe(a);
    expect(intents.chave("nome-b:conteudo-a")).not.toBe(alias);
    expect(intents.chave("nome-c:conteudo-a")).toBe(other);
  });
});
