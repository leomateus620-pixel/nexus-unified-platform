import { describe, expect, it } from "vitest";
import {
  comandoAlmoxarifadoSchema,
  conferenciaEstoqueRow,
  periodoRecursoEstoqueSchema,
  quantidadeEstoqueSchema,
  quantidadePositivaEstoqueSchema,
  saldoEstoqueRow,
} from "../src/features/almoxarifado/schemas";
import {
  acessoAlmoxarifadoNegado,
  ALMOXARIFADO_ACESSO_INDISPONIVEL,
  quantidadeFracionada,
} from "../src/features/almoxarifado/domain";

const id = (n: number) => `00000000-0000-4000-8000-${String(n).padStart(12, "0")}`;

describe("Almoxarifado: precisão e contratos de entrada", () => {
  it("preserva seis casas decimais como texto e normaliza vírgula", () => {
    expect(quantidadeEstoqueSchema.parse("999999999999,999999")).toBe("999999999999.999999");
    expect(quantidadePositivaEstoqueSchema.parse("0.000001")).toBe("0.000001");
    expect(quantidadeEstoqueSchema.parse("0.000000")).toBe("0.000000");
  });

  it("aceita saldo agregado maior que cada evento sem ampliar o limite de entrada", () => {
    const saldo = {
      fisico: "1999999999999.999998",
      aceito: "1999999999999.999998",
      quarentena: "0",
      rejeitado: "0",
      em_poder: "0",
      reservado: "0",
      disponivel: "1999999999999.999998",
      consumido: "0",
    };
    expect(saldoEstoqueRow.parse(saldo)).toEqual(saldo);
    expect(quantidadeEstoqueSchema.safeParse(saldo.aceito).success).toBe(false);
    for (const aceito of ["-1", "1e13", "1.0000001", "NaN"])
      expect(saldoEstoqueRow.safeParse({ ...saldo, aceito }).success).toBe(false);
  });

  it("não aceita float, notação científica, separador de milhar, negativos ou precisão excedente", () => {
    for (const value of [
      1.5,
      "1e3",
      "1.000,00",
      "-1",
      "1.0000001",
      "1000000000000",
      "NaN",
      "Infinity",
    ])
      expect(quantidadeEstoqueSchema.safeParse(value).success, String(value)).toBe(false);
    for (const value of ["0", "0.000000", "000,000"])
      expect(quantidadePositivaEstoqueSchema.safeParse(value).success, value).toBe(false);
  });

  it("indivisibilidade é conferida sem arredondar a quantidade enviada", () => {
    expect(quantidadeFracionada("8.000000")).toBe(false);
    expect(quantidadeFracionada("8,000001")).toBe(true);
    expect(quantidadeFracionada("0.000001")).toBe(true);
  });

  it("período atravessa meia-noite e compara instantes com offsets diferentes", () => {
    expect(
      periodoRecursoEstoqueSchema.safeParse({
        inicio: "2026-10-22T23:00:00-03:00",
        fim: "2026-10-23T04:00:00Z",
      }).success,
    ).toBe(true);
    for (const fim of ["2026-10-23T02:00:00Z", "2026-10-23T01:59:59Z"])
      expect(
        periodoRecursoEstoqueSchema.safeParse({ inicio: "2026-10-22T23:00:00-03:00", fim }).success,
      ).toBe(false);
    expect(
      periodoRecursoEstoqueSchema.safeParse({
        inicio: "2026-10-22T23:00:00",
        fim: "2026-10-23T04:00:00Z",
      }).success,
    ).toBe(false);
  });

  it("negação de acesso tem predicado serializável distinto de falha de rede", () => {
    expect(acessoAlmoxarifadoNegado(new Error(ALMOXARIFADO_ACESSO_INDISPONIVEL))).toBe(true);
    expect(acessoAlmoxarifadoNegado({ message: ALMOXARIFADO_ACESSO_INDISPONIVEL })).toBe(true);
    expect(acessoAlmoxarifadoNegado(new Error("Falha de rede"))).toBe(false);
    expect(acessoAlmoxarifadoNegado(null)).toBe(false);
  });
});

describe("Almoxarifado: intenções de domínio com origem e versão", () => {
  const base = { organization_id: id(1), chave: id(2) };
  it("envia o fuso declarado da custódia e mantém padrão de compatibilidade para clientes sem campo", () => {
    const request = {
      ...base,
      comando: "reservar_ferramenta",
      ferramenta_id: id(3),
      pessoa_id: id(4),
      expected_version: 1,
      inicio: "2026-10-22T23:00:00Z",
      fim: "2026-10-23T01:00:00Z",
    };
    expect(comandoAlmoxarifadoSchema.parse(request)).toMatchObject({
      timezone: "America/Sao_Paulo",
    });
    expect(
      comandoAlmoxarifadoSchema.parse({ ...request, timezone: "Europe/Berlin" }),
    ).toMatchObject({
      timezone: "Europe/Berlin",
    });
    expect(comandoAlmoxarifadoSchema.safeParse({ ...request, timezone: "" }).success).toBe(false);
  });
  it("conferência exige exatamente um recebimento ou apontamento e rejeita origem genérica", () => {
    const request = {
      ...base,
      comando: "conferir_evento",
      produto_id: id(3),
      local_id: id(4),
      quantidade: "10",
      aceita: "6",
      quarentena: "3",
      rejeitada: "1",
    };
    expect(comandoAlmoxarifadoSchema.safeParse(request).success).toBe(false);
    expect(
      comandoAlmoxarifadoSchema.safeParse({
        ...request,
        recebimento_id: id(5),
        apontamento_id: id(6),
      }).success,
    ).toBe(false);
    expect(
      comandoAlmoxarifadoSchema.safeParse({
        ...request,
        recebimento_id: id(5),
        tipo_origem: "manual",
        origem_id: id(6),
      }).success,
    ).toBe(false);
    expect(comandoAlmoxarifadoSchema.safeParse({ ...request, recebimento_id: id(5) }).success).toBe(
      true,
    );
  });

  it("reserva tem destino real único e nenhuma OS inexistente ou saldo do browser", () => {
    const request = {
      ...base,
      comando: "reservar",
      produto_id: id(3),
      local_id: id(4),
      pessoa_id: id(5),
      quantidade: "8",
      validade: "2026-11-01T12:00:00-03:00",
    };
    expect(comandoAlmoxarifadoSchema.safeParse(request).success).toBe(false);
    expect(
      comandoAlmoxarifadoSchema.safeParse({ ...request, projeto_id: id(6), op_id: id(7) }).success,
    ).toBe(false);
    expect(
      comandoAlmoxarifadoSchema.safeParse({ ...request, projeto_id: id(6), os_id: id(8) }).success,
    ).toBe(false);
    expect(
      comandoAlmoxarifadoSchema.safeParse({ ...request, projeto_id: id(6), disponivel: "100" })
        .success,
    ).toBe(false);
    expect(comandoAlmoxarifadoSchema.safeParse({ ...request, op_id: id(7) }).success).toBe(true);
  });

  it("retirada, consumo e devolução exigem versão e quantidade positiva sem aceitar autoria forjada", () => {
    for (const comando of ["retirar", "consumir", "devolver"]) {
      const request = { ...base, comando, reserva_id: id(3), quantidade: "2" };
      expect(comandoAlmoxarifadoSchema.safeParse(request).success).toBe(false);
      expect(comandoAlmoxarifadoSchema.safeParse({ ...request, expected_version: 3 }).success).toBe(
        true,
      );
      expect(
        comandoAlmoxarifadoSchema.safeParse({ ...request, expected_version: 3, quantidade: "0" })
          .success,
      ).toBe(false);
      expect(
        comandoAlmoxarifadoSchema.safeParse({ ...request, expected_version: 3, autor: id(5) })
          .success,
      ).toBe(false);
    }
    expect(
      comandoAlmoxarifadoSchema.safeParse({
        ...base,
        comando: "transferir",
        produto_id: id(3),
        origem_local_id: id(4),
        destino_local_id: id(4),
        quantidade: "1",
        motivo: "Separação",
      }).success,
    ).toBe(false);
  });

  it("cadastro não aceita alterar condição, enquanto atualização exige versão", () => {
    const request = {
      ...base,
      comando: "salvar_ferramenta",
      patrimonio: "PAT-1",
      descricao: "Ferramenta",
      local_id: id(3),
      proprietario: "nexus",
    };
    expect(comandoAlmoxarifadoSchema.safeParse(request).success).toBe(true);
    expect(comandoAlmoxarifadoSchema.safeParse({ ...request, ferramenta_id: id(4) }).success).toBe(
      false,
    );
    expect(
      comandoAlmoxarifadoSchema.safeParse({ ...request, condicao: "disponivel" }).success,
    ).toBe(false);
    expect(
      comandoAlmoxarifadoSchema.safeParse({ ...request, proprietario: "terceiro" }).success,
    ).toBe(false);
    expect(
      comandoAlmoxarifadoSchema.safeParse({
        ...request,
        proprietario: "terceiro",
        proprietario_nome: "Empresa proprietária",
      }).success,
    ).toBe(true);
  });

  it("calibração rejeita validade anterior à execução e revogação sem motivo", () => {
    const request = {
      ...base,
      comando: "registrar_calibracao",
      ferramenta_id: id(3),
      politica_id: id(4),
      emissor: "Emissor autorizado",
      execucao: "2026-10-22",
    };
    expect(comandoAlmoxarifadoSchema.safeParse(request).success).toBe(true);
    expect(
      comandoAlmoxarifadoSchema.safeParse({ ...request, validade: "2026-10-21" }).success,
    ).toBe(false);
    expect(
      comandoAlmoxarifadoSchema.safeParse({
        ...base,
        comando: "conferir_calibracao",
        calibracao_id: id(5),
        expected_version: 1,
        estado: "revogada",
      }).success,
    ).toBe(false);
    expect(
      comandoAlmoxarifadoSchema.safeParse({
        ...base,
        comando: "publicar_politica_calibracao",
        nome: "Política",
        metodo: "Método autorizado",
        fonte: "Fonte e edição",
        exige_validade: false,
        registro_profissional: "FORJADO",
      }).success,
    ).toBe(false);
  });

  it("fator confirmado conserva precisão própria; quantidade física permanece numeric18,6", () => {
    const row = {
      id: id(1),
      organization_id: id(2),
      recebimento_id: id(3),
      apontamento_id: null,
      inventario_id: null,
      produto_id: id(4),
      local_id: id(5),
      produto: {
        id: id(4),
        codigo: "MAT",
        descricao: "Material",
        unidade: "UN",
        indivisivel: false,
      },
      local_nome: "Central",
      quantidade: "100000000000.000000",
      unidade_origem: "CX",
      fator: "0.00000000000000001",
      aceita: "0.000001",
      quarentena: "0",
      rejeitada: "0",
      lote: null,
      serie: null,
      motivo: null,
      reconciliacao: null,
      created_by: id(6),
      created_at: "2026-10-22T12:00:00Z",
    };
    expect(conferenciaEstoqueRow.parse(row).fator).toBe("0.00000000000000001");
    expect(conferenciaEstoqueRow.safeParse({ ...row, aceita: "0.0000001" }).success).toBe(false);
    expect(conferenciaEstoqueRow.safeParse({ ...row, fator: "0" }).success).toBe(false);
  });
});
