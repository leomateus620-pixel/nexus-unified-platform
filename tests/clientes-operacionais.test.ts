import { describe, expect, it } from "vitest";
import {
  clienteDados,
  contatoDados,
  identificadorNormalizado,
  listInput,
  salvarClienteInput,
  unidadeDados,
} from "../src/features/clientes/schemas";

const cliente = {
  razao_social: "Cliente alfanumérico",
  nome_exibicao: "Operação",
  cnpj: "AB.12-CD/34",
  cidade: "Santa Rosa",
  uf: "rs",
  observacoes: "",
};
describe("contratos cadastrais da operação", () => {
  it("preserva a representação fiscal alfanumérica e normaliza apenas sua chave de comparação", () => {
    const parsed = clienteDados.parse(cliente);
    expect(parsed.cnpj).toBe("AB.12-CD/34");
    expect(parsed.uf).toBe("RS");
    expect(identificadorNormalizado(parsed.cnpj)).toBe(identificadorNormalizado("ab12cd34"));
    expect(clienteDados.safeParse({ ...cliente, cnpj: "" }).success).toBe(true);
  });
  it("não aceita distância negativa ou NaN, mas preserva zero e ausência como valores distintos", () => {
    const base = { nome: "Unidade", endereco: "", observacoes: "" };
    expect(unidadeDados.parse({ ...base, distancia_ida_volta_km: 0 }).distancia_ida_volta_km).toBe(
      0,
    );
    expect(
      unidadeDados.parse({ ...base, distancia_ida_volta_km: null }).distancia_ida_volta_km,
    ).toBeNull();
    expect(unidadeDados.safeParse({ ...base, distancia_ida_volta_km: -1 }).success).toBe(false);
    expect(unidadeDados.safeParse({ ...base, distancia_ida_volta_km: Number.NaN }).success).toBe(
      false,
    );
  });
  it("qualifica erros por campo e não transforma contato em login", () => {
    const r = contatoDados.safeParse({
      nome: "Contato",
      cargo: "",
      email: "sem-arroba",
      telefone: "",
      unidade_id: null,
      observacoes: "",
      user_id: "injetado",
    });
    expect(r.success).toBe(false);
    if (!r.success) expect(r.error.issues[0]?.path).toEqual(["email"]);
    const valid = contatoDados.parse({
      nome: "Contato",
      cargo: "",
      email: "",
      telefone: "",
      unidade_id: null,
      observacoes: "",
      user_id: "injetado",
    });
    expect(valid).not.toHaveProperty("user_id");
  });
  it("limita paginação e exige pai nos vínculos, preservando busca literal", () => {
    const org = "13200000-0000-0000-0000-000000000001";
    expect(listInput.safeParse({ organization_id: org, grupo: "unidades" }).success).toBe(false);
    expect(
      listInput.safeParse({ organization_id: org, grupo: "clientes", limite: 500 }).success,
    ).toBe(false);
    expect(listInput.parse({ organization_id: org, grupo: "clientes", busca: "%_" }).busca).toBe(
      "%_",
    );
  });
  it("não permite forjar versão/autoria nos dados editáveis", () => {
    const result = salvarClienteInput.parse({
      organization_id: "13200000-0000-0000-0000-000000000001",
      chave: "13300000-0000-0000-0000-000000000001",
      dados: { ...cliente, organization_id: "outro", version: 999, created_by: "outro" },
    });
    expect(result.dados).not.toHaveProperty("organization_id");
    expect(result.dados).not.toHaveProperty("created_by");
    expect(result.dados).not.toHaveProperty("version");
  });
});
