import { describe, expect, it } from "vitest";
import { IntencoesArquivoLevantamento } from "../src/features/levantamentos/upload-intents";

describe("intenção de evidência de levantamento", () => {
  it("conserva a chave após falha de resposta e diferencia ponto, conteúdo e nome", () => {
    let chave = 0;
    const envios = new IntencoesArquivoLevantamento(() => `intencao-${++chave}`);
    const payload = JSON.stringify({ revisao: "r1", ponto: "p1", sha: "a", nome: "foto.jpg" });
    const primeira = envios.chave(payload);
    envios.identificar(payload, "arquivo-pendente");
    // Uma falha de rede não encerra a intenção nem pode preparar outro arquivo por omissão.
    expect(envios.chave(payload)).toBe(primeira);
    expect(
      envios.chave(JSON.stringify({ revisao: "r1", ponto: "p2", sha: "a", nome: "foto.jpg" })),
    ).not.toBe(primeira);
    expect(
      envios.chave(JSON.stringify({ revisao: "r1", ponto: "p1", sha: "b", nome: "foto.jpg" })),
    ).not.toBe(primeira);
    expect(
      envios.chave(JSON.stringify({ revisao: "r1", ponto: "p1", sha: "a", nome: "outra.jpg" })),
    ).not.toBe(primeira);
  });

  it("cancelamento permite reenviar os mesmos bytes sem renovar a chave de outro arquivo", () => {
    let chave = 0;
    const envios = new IntencoesArquivoLevantamento(() => `intencao-${++chave}`);
    const cancelada = envios.chave("foto-a");
    envios.identificar("foto-a", "arquivo-a");
    const mantida = envios.chave("foto-b");
    envios.identificar("foto-b", "arquivo-b");
    envios.cancelar("arquivo-a");
    expect(envios.chave("foto-a")).not.toBe(cancelada);
    expect(envios.chave("foto-b")).toBe(mantida);
  });

  it("cancelamento reconhece o payload consultado quando a resposta do staging se perdeu antes do ID", () => {
    let chave = 0;
    const envios = new IntencoesArquivoLevantamento(() => `intencao-${++chave}`);
    const original = envios.chave("payload-completo-da-foto");
    // Sem identificar(): o servidor confirmou staging, mas a resposta não chegou ao browser.
    envios.cancelar("id-reencontrado-na-consulta", "payload-completo-da-foto");
    expect(envios.chave("payload-completo-da-foto")).not.toBe(original);
  });
});
