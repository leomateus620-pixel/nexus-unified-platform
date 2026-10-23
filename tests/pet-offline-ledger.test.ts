import { describe, expect, it } from "vitest";
import {
  abrirPacote,
  confirmarPendenteLocal,
  mesclarPacoteLocal,
  protegerPacote,
  type PacoteLocal,
  type RegistroPendente,
} from "../src/features/pet/offline";
const base: PacoteLocal = {
  formato: 1,
  organizationId: "org",
  userId: "vigia",
  petId: "pet",
  version: 7,
  sincronizadoEm: "2026-10-23T12:00:00Z",
  documentoHash: "a".repeat(64),
  pdf: "JVBERg==",
  snapshot: {},
  pendentes: [],
};
const registro: RegistroPendente = {
  chave: "registro-controlado",
  tipo: "registrar_saida",
  pessoa_id: "trabalhador",
  momento: "2026-10-23T12:10:00Z",
  motivo: "Saída controlada",
  origem: "offline",
  estado: "pendente",
};
describe("PET: confirmações locais cifradas e reimportação", () => {
  it("abre pacotes legados sem ledger e mantém confirmações cifradas em novos pacotes", async () => {
    const old = await abrirPacote(
      await protegerPacote(base, "Senha local protegida 2026"),
      "Senha local protegida 2026",
      base,
    );
    expect(old).toEqual(base);
    const sent = { ...base, pendentes: [{ ...registro, expected_version: 7 }] };
    const confirmed = confirmarPendenteLocal(sent, registro.chave, "2026-10-23T12:11:00Z");
    const cipher = await protegerPacote(confirmed, "Senha local protegida 2026");
    expect(cipher).not.toContain("trabalhador");
    expect(await abrirPacote(cipher, "Senha local protegida 2026", base)).toEqual(confirmed);
  });
  it("não recria pendência ao reimportar o arquivo antigo depois da confirmação", () => {
    const old = { ...base, pendentes: [registro] };
    const sent = { ...base, pendentes: [{ ...registro, expected_version: 7 }] };
    const confirmed = confirmarPendenteLocal(sent, registro.chave, "2026-10-23T12:11:00Z");
    const merged = mesclarPacoteLocal({ ...confirmed, version: 9 }, old);
    expect(merged.pendentes).toEqual([]);
    expect(merged.confirmados?.[0]?.registro.expected_version).toBe(7);
    expect(mesclarPacoteLocal(merged, old).pendentes).toEqual([]);
  });
  it("preserva a versão exata de um envio sem resposta ao importar export anterior", () => {
    const sent = {
      ...base,
      pendentes: [{ ...registro, expected_version: 7, estado: "conflito" as const }],
    };
    expect(mesclarPacoteLocal(sent, { ...base, pendentes: [registro] }).pendentes[0]).toEqual(
      sent.pendentes[0],
    );
  });
  it("não aceita confirmação importada como prova de recebimento no servidor", () => {
    const imported = confirmarPendenteLocal(
      { ...base, pendentes: [{ ...registro, expected_version: 7 }] },
      registro.chave,
      "2026-10-23T12:11:00Z",
    );
    const merged = mesclarPacoteLocal(null, imported);
    expect(merged.confirmados).toEqual([]);
    expect(merged.pendentes).toHaveLength(1);
    expect(merged.pendentes[0]?.expected_version).toBe(7);
  });
  it("recusa reuso divergente da chave e contexto diferente sem eliminar o original", () => {
    const confirmed = confirmarPendenteLocal(
      { ...base, pendentes: [{ ...registro, expected_version: 7 }] },
      registro.chave,
      "2026-10-23T12:11:00Z",
    );
    expect(() =>
      mesclarPacoteLocal(confirmed, {
        ...base,
        pendentes: [{ ...registro, momento: "2026-10-23T13:00:00Z" }],
      }),
    ).toThrow("divergente");
    expect(() => mesclarPacoteLocal(confirmed, { ...base, organizationId: "outra" })).toThrow(
      "contexto",
    );
    expect(confirmed.confirmados).toHaveLength(1);
  });
});
