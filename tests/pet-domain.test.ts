import { describe, expect, it } from "vitest";
import { decimalCampo, duracaoApresentada, validadeTemporal } from "../src/features/pet/domain";
import {
  adicionarPendente,
  abrirPacote,
  protegerPacote,
  type PacoteLocal,
} from "../src/features/pet/offline";
import { visualizadorProtegido } from "../src/features/pet/offline-viewer";
describe("PET: apresentação e contingência", () => {
  it("aceita vírgula sem aceitar valor incompleto ou infinito", () => {
    expect(decimalCampo("20,9")).toBe(20.9);
    expect(decimalCampo("0.1")).toBe(0.1);
    for (const v of ["", "20,", "1.000,3", "Infinity", "1e5"]) expect(decimalCampo(v)).toBeNull();
  });
  it("preserva segundos e expira no instante limite", () => {
    expect(duracaoApresentada(3661)).toBe("1h 01min 01s");
    expect(validadeTemporal("2026-10-24T01:00:00Z", Date.parse("2026-10-24T01:00:00Z"))).toBe(
      "expirada",
    );
  });
  const pacote: PacoteLocal = {
    formato: 1,
    organizationId: "org",
    userId: "vigia",
    petId: "pet",
    version: 4,
    sincronizadoEm: "2026-10-23T12:00:00Z",
    documentoHash: "hash",
    pdf: "JVBERg==",
    snapshot: {},
    pendentes: [],
  };
  it("cifra documento e registros; senha/contexto incorretos falham", async () => {
    const cipher = await protegerPacote(pacote, "Senha local de teste 2026");
    expect(cipher).not.toContain("JVBERg");
    const html = visualizadorProtegido(cipher);
    expect(html).not.toContain("JVBERg");
    expect(html).toContain("connect-src 'none'");
    expect(html).toContain("Não libera entrada");
    expect(await abrirPacote(cipher, "Senha local de teste 2026", pacote)).toEqual(pacote);
    await expect(abrirPacote(cipher, "Outra senha de teste", pacote)).rejects.toThrow();
    await expect(
      abrirPacote(cipher, "Senha local de teste 2026", { ...pacote, userId: "outro" }),
    ).rejects.toThrow();
  });
  it("fila preserva chave e horário offline sem duplicar", () => {
    const r = {
      chave: "idempotente",
      tipo: "registrar_saida" as const,
      pessoa_id: "pessoa",
      momento: "2026-10-24T00:01:00Z",
      motivo: "Sem conexão",
      origem: "offline" as const,
      estado: "pendente" as const,
    };
    const p = adicionarPendente(pacote, r);
    expect(adicionarPendente(p, r).pendentes).toHaveLength(1);
    expect(p.pendentes[0]?.momento).toBe(r.momento);
    expect(pacote.pendentes).toHaveLength(0);
  });
});
