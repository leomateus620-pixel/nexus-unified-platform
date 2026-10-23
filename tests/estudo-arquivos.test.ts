import { describe, expect, it } from "vitest";
import { IntencoesArquivoEstudo } from "../src/features/estudos/upload-intents";

describe("intenção de evidência de estudo", () => {
  it("conserva a chave após falha de resposta e diferencia perigo, conteúdo e nome", () => {
    let chave = 0;
    const envios = new IntencoesArquivoEstudo(() => `intencao-${++chave}`);
    const payload = JSON.stringify({ revisao: "r1", perigo: "p1", sha: "a", nome: "foto.jpg" });
    const primeira = envios.chave(payload);
    envios.identificar(payload, "arquivo-pendente");
    // Uma falha de rede não encerra a intenção nem pode preparar outro arquivo por omissão.
    expect(envios.chave(payload)).toBe(primeira);
    expect(
      envios.chave(JSON.stringify({ revisao: "r1", perigo: "p2", sha: "a", nome: "foto.jpg" })),
    ).not.toBe(primeira);
    expect(
      envios.chave(JSON.stringify({ revisao: "r1", perigo: "p1", sha: "b", nome: "foto.jpg" })),
    ).not.toBe(primeira);
    expect(
      envios.chave(JSON.stringify({ revisao: "r1", perigo: "p1", sha: "a", nome: "outra.jpg" })),
    ).not.toBe(primeira);
  });

  it("cancelamento permite reenviar os mesmos bytes sem renovar a chave de outro arquivo", () => {
    let chave = 0;
    const envios = new IntencoesArquivoEstudo(() => `intencao-${++chave}`);
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
    const envios = new IntencoesArquivoEstudo(() => `intencao-${++chave}`);
    const original = envios.chave("payload-completo-da-foto");
    // Sem identificar(): o servidor confirmou staging, mas a resposta não chegou ao browser.
    envios.cancelar("id-reencontrado-na-consulta", "payload-completo-da-foto");
    expect(envios.chave("payload-completo-da-foto")).not.toBe(original);
  });

  it("cancelamento encerra aliases de nome deduplicados pelo SQL, preservando outro perigo", () => {
    let chave = 0;
    const envios = new IntencoesArquivoEstudo(() => `intencao-${++chave}`);
    const base = {
      organization_id: "org",
      estudo_id: "estudo",
      revisao_id: "rev",
      perigo_id: "p1",
      mime: "image/jpeg",
      tamanho: 100,
      sha256: "hash",
    };
    const nomeServidor = JSON.stringify({ ...base, nome: "original.jpg" });
    const nomeLocal = JSON.stringify({ ...base, nome: "renomeada.jpg" });
    const outroPerigo = JSON.stringify({ ...base, perigo_id: "p2", nome: "original.jpg" });
    const perdida = envios.chave(nomeLocal);
    const mantida = envios.chave(outroPerigo);
    // Deduplication returned another existing row, but that response never reached the browser.
    envios.cancelar("arquivo-canonico", nomeServidor);
    expect(envios.chave(nomeLocal)).not.toBe(perdida);
    expect(envios.chave(outroPerigo)).toBe(mantida);
  });
});
