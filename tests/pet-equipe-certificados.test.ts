import { describe, expect, it } from "vitest";
import { demoParticipant } from "@/features/pet/demo/domain";
import { certificadoKey, rotuloCertificado } from "@/features/pet/equipe-certificados";

const scope = { organization_id: "o", cliente_id: "c", unidade_id: "u" };

describe("equipe da PET com certificado por função", () => {
  it("rascunho antigo só com nome continua válido", () => {
    const r = demoParticipant.safeParse({
      id: "3c20d4ca-f63b-4a28-bb5c-201d95c07d26",
      nome: "Dari Medeiros Ramos",
      funcao: "vigia",
    });
    expect(r.success).toBe(true);
  });
  it("participante novo guarda a referência ao cadastro", () => {
    const r = demoParticipant.parse({
      id: "3c20d4ca-f63b-4a28-bb5c-201d95c07d26",
      nome: "Dari Medeiros Ramos",
      funcao: "resgate",
      pessoa_id: "38ba79e5-1818-461e-aa9c-af912491ff34",
    });
    expect(r.pessoa_id).toBe("38ba79e5-1818-461e-aa9c-af912491ff34");
  });
  it("sem certificado da função mostra ❌ com texto", () => {
    expect(rotuloCertificado("ausente")).toMatchObject({ icone: "❌", texto: "Sem certificado desta função" });
  });
  it("certificado em conferência nunca aparece como liberado", () => {
    expect(rotuloCertificado("em_conferencia").texto).toContain("em conferência");
  });
  it("a consulta de cada função tem chave própria (resposta atrasada não troca de linha)", () => {
    expect(certificadoKey(scope, "supervisor")).not.toEqual(certificadoKey(scope, "resgate"));
  });
});
