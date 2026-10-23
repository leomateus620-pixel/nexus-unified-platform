import { describe, expect, it } from "vitest";
import {
  acessoEquipeNegado,
  EQUIPE_ACESSO_INDISPONIVEL,
  escapeEquipeSearch,
  periodoMembro,
  validarFimMembro,
} from "../src/features/pessoas-competencias/equipes/domain";
import {
  encerrarMembroInput,
  salvarEquipeInput,
  vincularMembroInput,
} from "../src/features/pessoas-competencias/equipes/schemas";

const id = (n: number) => `00000000-0000-4000-8000-${String(n).padStart(12, "0")}`;
describe("Equipes: contrato de vigência e edição", () => {
  it("aceita participação de um único dia civil inclusivo", () => {
    expect(
      vincularMembroInput.parse({
        organization_id: id(1),
        chave: id(2),
        equipe_id: id(3),
        pessoa_id: id(4),
        inicio: "2026-10-22",
        fim: "2026-10-22",
      }).fim,
    ).toBe("2026-10-22");
    expect(periodoMembro("2026-10-22", "2026-10-22")).toContain("22/10/2026 (inclusive)");
  });
  it("recusa fim anterior ao início sem conversão UTC", () => {
    expect(
      vincularMembroInput.safeParse({
        organization_id: id(1),
        chave: id(2),
        equipe_id: id(3),
        pessoa_id: id(4),
        inicio: "2026-10-22",
        fim: "2026-10-21",
      }).success,
    ).toBe(false);
    expect(validarFimMembro("2026-10-22", "2026-10-21")).toBe(false);
  });
  it("representa vínculo sem término sem inventar uma data", () => {
    expect(periodoMembro("2026-10-22", null)).toBe("22/10/2026 até sem término definido");
  });
  it("exige versão ao editar e inicia equipe ativa", () => {
    expect(
      salvarEquipeInput.safeParse({
        organization_id: id(1),
        chave: id(2),
        id: id(3),
        dados: { nome: "Equipe" },
      }).success,
    ).toBe(false);
    expect(
      salvarEquipeInput.safeParse({
        organization_id: id(1),
        chave: id(2),
        dados: { nome: "Equipe", ativa: false },
      }).success,
    ).toBe(false);
    expect(
      salvarEquipeInput.parse({ organization_id: id(1), chave: id(2), dados: { nome: " Equipe " } })
        .dados,
    ).toEqual({ nome: "Equipe", lider_id: null, ativa: true });
  });
  it("encerrar requer motivo identificável", () => {
    expect(
      encerrarMembroInput.safeParse({
        organization_id: id(1),
        chave: id(2),
        id: id(3),
        fim: "2026-10-22",
        motivo: "abc",
      }).success,
    ).toBe(false);
  });
  it("negação reconhecida não inclui erro de rede genérico", () => {
    expect(acessoEquipeNegado({ message: EQUIPE_ACESSO_INDISPONIVEL })).toBe(true);
    expect(acessoEquipeNegado(new Error("Falha de rede"))).toBe(false);
    expect(acessoEquipeNegado(null)).toBe(false);
  });
  it("escapa curingas na busca sem remover o texto", () => {
    expect(escapeEquipeSearch("Equipe_100%\\A")).toBe("Equipe\\_100\\%\\\\A");
  });
});
