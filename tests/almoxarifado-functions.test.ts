import { describe, expect, it, vi } from "vitest";

vi.mock("@/integrations/supabase/auth-middleware", () => ({ requireSupabaseAuth: {} }));
vi.mock("@tanstack/react-start", () => ({
  createServerFn: () => {
    let parse: (value: unknown) => unknown;
    const chain = {
      middleware: () => chain,
      inputValidator: (schema: { parse: (value: unknown) => unknown }) => {
        parse = (value) => schema.parse(value);
        return chain;
      },
      handler:
        (handler: (value: unknown) => unknown) =>
        async (value: { data: unknown; context: unknown }) =>
          handler({ data: parse(value.data), context: value.context }),
    };
    return chain;
  },
}));

import {
  buscarOpcoesAlmoxarifado,
  executarAlmoxarifado,
  listarAlmoxarifado,
  obterAlmoxarifado,
} from "../src/features/almoxarifado/almoxarifado.functions";
import { ALMOXARIFADO_ACESSO_INDISPONIVEL } from "../src/features/almoxarifado/domain";

const id = (n: number) => `00000000-0000-4000-8000-${String(n).padStart(12, "0")}`;
function handler<T>(fn: unknown) {
  return fn as (arg: {
    data: unknown;
    context: { supabase: T; userId: string };
  }) => Promise<unknown>;
}
const permissions = {
  ler: true,
  gerir: true,
  conferir: true,
  reservar: true,
  aprovar_ajuste: true,
  publicar_politica_calibracao: false,
};
const localDetail = (localId = id(3)) => ({
  tipo: "locais",
  id: localId,
  registro: {
    id: localId,
    organization_id: id(1),
    nome: "Central",
    descricao: "Local operacional",
    ativo: true,
    version: 2,
    created_at: "2026-10-22T12:00:00Z",
    updated_at: "2026-10-22T12:00:00Z",
  },
  historico: [],
  permissoes: { ...permissions, editar: true, executar: true },
});

// Handlers e schemas isolados: não comprova middleware HTTP, autenticação ou RLS reais.
describe("Almoxarifado: fronteira autenticada e DTO operacional", () => {
  it("consulta opções com organização, recorte e limite, sem ler aquisições ou custos", async () => {
    const db = {
      rpc: vi.fn().mockResolvedValue({
        data: {
          registros: [
            {
              id: id(4),
              nome: "Material",
              contexto: "UN",
              produto_id: id(4),
              quantidade: "4.000000",
              unidade: "UN",
              custo_total: "900.00",
              parcelas: { frete: 40 },
            },
          ],
          total: 26,
          pagina: 1,
          limite: 25,
        },
        error: null,
      }),
      from: vi.fn(),
    };
    const response = await handler<typeof db>(buscarOpcoesAlmoxarifado)({
      data: { organization_id: id(1), tipo: "produtos", local_id: id(3), busca: "%_'", pagina: 1 },
      context: { supabase: db, userId: id(2) },
    });
    expect(response).toEqual({
      rows: [
        {
          id: id(4),
          nome: "Material",
          contexto: "UN",
          produto_id: id(4),
          quantidade: "4.000000",
          unidade: "UN",
        },
      ],
      total: 26,
      page: 1,
      pageSize: 25,
    });
    expect(db.rpc).toHaveBeenCalledWith("alm_opcoes", {
      _org: id(1),
      _tipo: "produtos",
      _busca: "%_'",
      _local: id(3),
      _pagina: 1,
      _limite: 25,
    });
    expect(db.from).not.toHaveBeenCalled();
    expect(JSON.stringify(response)).not.toMatch(/custo_total|parcelas|frete/);
  });

  it("rejeita seletor arbitrário, paginação ilimitada e autoria no browser antes do RPC", async () => {
    const db = { rpc: vi.fn(), from: vi.fn() };
    for (const patch of [
      { tipo: "aquisicoes" },
      { tipo: "auth.users" },
      { limite: 10000 },
      { created_by: id(7) },
    ])
      await expect(
        handler<typeof db>(buscarOpcoesAlmoxarifado)({
          data: { organization_id: id(1), tipo: "pessoas", ...patch },
          context: { supabase: db, userId: id(2) },
        }),
      ).rejects.toThrow();
    expect(db.rpc).not.toHaveBeenCalled();
    expect(db.from).not.toHaveBeenCalled();
  });

  it("não troca falha de acesso por lista vazia nem expõe diagnóstico privado", async () => {
    const db = {
      rpc: vi
        .fn()
        .mockResolvedValue({ data: null, error: { code: "42501", message: "PRIVADO_TESTE" } }),
    };
    const response = handler<typeof db>(buscarOpcoesAlmoxarifado)({
      data: { organization_id: id(1), tipo: "recebimentos" },
      context: { supabase: db, userId: id(2) },
    });
    await expect(response).rejects.toThrow(ALMOXARIFADO_ACESSO_INDISPONIVEL);
    await expect(response).rejects.not.toThrow("PRIVADO_TESTE");
  });

  it("identifica dependência do banco e falha desconhecida sem sucesso fictício", async () => {
    for (const code of ["PGRST202", "42P01", "42883"]) {
      const db = {
        rpc: vi.fn().mockResolvedValue({ data: null, error: { code, message: "PRIVADO_TESTE" } }),
      };
      await expect(
        handler<typeof db>(buscarOpcoesAlmoxarifado)({
          data: { organization_id: id(1), tipo: "locais" },
          context: { supabase: db, userId: id(2) },
        }),
      ).rejects.toThrow(/migração 0023/);
    }
    const db = {
      rpc: vi
        .fn()
        .mockResolvedValue({ data: null, error: { code: "XX000", message: "PRIVADO_TESTE" } }),
    };
    const response = handler<typeof db>(buscarOpcoesAlmoxarifado)({
      data: { organization_id: id(1), tipo: "produtos" },
      context: { supabase: db, userId: id(2) },
    });
    await expect(response).rejects.toThrow(/Tente novamente/);
    await expect(response).rejects.not.toThrow("PRIVADO_TESTE");
  });
});

describe("Almoxarifado: listagem, confirmação e versões", () => {
  it("lista materiais com saldo decimal do banco e omite custos extras no nível e no produto", async () => {
    const material = {
      id: id(3),
      produto: {
        id: id(3),
        codigo: "MAT",
        descricao: "Material",
        unidade: "UN",
        indivisivel: true,
        custo_adotado: 90,
      },
      politica: { exige_lote: false, exige_serie: false, estoque_minimo: "0", version: 0 },
      saldo: {
        fisico: "4",
        aceito: "4",
        quarentena: "0",
        rejeitado: "0",
        em_poder: "0",
        reservado: "0",
        disponivel: "4",
        consumido: "6",
      },
      custo_total: "360",
    };
    const db = {
      rpc: vi.fn().mockResolvedValue({
        data: {
          registros: [material],
          total: 1,
          pagina: 0,
          limite: 25,
          permissoes: permissions,
          margem: "50",
        },
        error: null,
      }),
      from: vi.fn(),
    };
    const response = await handler<typeof db>(listarAlmoxarifado)({
      data: { organization_id: id(1), tipo: "materiais", local_id: id(4) },
      context: { supabase: db, userId: id(2) },
    });
    expect(response).toMatchObject({
      tipo: "materiais",
      total: 1,
      page: 0,
      pageSize: 25,
      rows: [{ saldo: { fisico: "4", consumido: "6" }, politica: { version: 0 } }],
    });
    expect(JSON.stringify(response)).not.toMatch(/custo_adotado|custo_total|margem/);
    expect(db.rpc).toHaveBeenCalledWith("alm_listar", {
      _org: id(1),
      _tipo: "materiais",
      _busca: "",
      _estado: null,
      _local: id(4),
      _pagina: 0,
      _limite: 25,
    });
    expect(db.from).not.toHaveBeenCalled();
  });

  it("não aceita um DTO de outra categoria nem confunde resposta malformada com lista vazia", async () => {
    const db = {
      rpc: vi.fn().mockResolvedValue({
        data: {
          registros: [localDetail().registro],
          total: 1,
          pagina: 0,
          limite: 25,
          permissoes: permissions,
        },
        error: null,
      }),
    };
    await expect(
      handler<typeof db>(listarAlmoxarifado)({
        data: { organization_id: id(1), tipo: "materiais" },
        context: { supabase: db, userId: id(2) },
      }),
    ).rejects.toThrow();
  });

  it("confere a identidade do detalhe solicitado e passa tenant ao banco", async () => {
    const db = { rpc: vi.fn().mockResolvedValue({ data: localDetail(), error: null }) };
    await expect(
      handler<typeof db>(obterAlmoxarifado)({
        data: { organization_id: id(1), tipo: "locais", id: id(3) },
        context: { supabase: db, userId: id(2) },
      }),
    ).resolves.toMatchObject({ tipo: "locais", id: id(3) });
    expect(db.rpc).toHaveBeenCalledWith("alm_obter", { _org: id(1), _tipo: "locais", _id: id(3) });
    await expect(
      handler<typeof db>(obterAlmoxarifado)({
        data: { organization_id: id(1), tipo: "locais", id: id(4) },
        context: { supabase: db, userId: id(2) },
      }),
    ).rejects.toThrow(/não corresponde/);
  });

  it("encaminha versão e intenção estáveis; rejeita patch direto de saldo e autoria", async () => {
    const db = {
      rpc: vi.fn().mockResolvedValue({
        data: { tipo: "locais", id: id(3), detalhe: localDetail() },
        error: null,
      }),
    };
    const data = {
      organization_id: id(1),
      chave: id(5),
      comando: "salvar_local",
      local_id: id(3),
      expected_version: 1,
      nome: "Central",
      descricao: "Local operacional",
      ativo: true,
    };
    const context = { supabase: db, userId: id(2) };
    for (let i = 0; i < 2; i++) await handler<typeof db>(executarAlmoxarifado)({ data, context });
    expect(db.rpc).toHaveBeenNthCalledWith(1, "alm_executar", {
      _org: id(1),
      _chave: id(5),
      _comando: "salvar_local",
      _dados: {
        local_id: id(3),
        expected_version: 1,
        nome: "Central",
        descricao: "Local operacional",
        ativo: true,
      },
    });
    expect(db.rpc.mock.calls[1]).toEqual(db.rpc.mock.calls[0]);
    db.rpc.mockClear();
    for (const patch of [
      { saldo: "100" },
      { created_by: id(7) },
      { organization_id: "tenant-inválido" },
    ])
      await expect(
        handler<typeof db>(executarAlmoxarifado)({ data: { ...data, ...patch }, context }),
      ).rejects.toThrow();
    expect(db.rpc).not.toHaveBeenCalled();
  });

  it("normaliza quantidade decimal sem aceitar fator ou custo ditado pelo browser", async () => {
    const db = {
      rpc: vi.fn().mockResolvedValue({
        data: null,
        error: { code: "23514", message: "Saldo insuficiente para a retirada." },
      }),
    };
    const data = {
      organization_id: id(1),
      chave: id(5),
      comando: "retirar",
      reserva_id: id(3),
      expected_version: 4,
      quantidade: "2,000001",
    };
    const context = { supabase: db, userId: id(2) };
    await expect(handler<typeof db>(executarAlmoxarifado)({ data, context })).rejects.toThrow(
      "Saldo insuficiente para a retirada.",
    );
    expect(db.rpc).toHaveBeenCalledWith("alm_executar", {
      _org: id(1),
      _chave: id(5),
      _comando: "retirar",
      _dados: { reserva_id: id(3), expected_version: 4, quantidade: "2.000001", motivo: "" },
    });
    db.rpc.mockClear();
    for (const patch of [{ fator: "2" }, { custo_unitario: "0.01" }])
      await expect(
        handler<typeof db>(executarAlmoxarifado)({ data: { ...data, ...patch }, context }),
      ).rejects.toThrow();
    expect(db.rpc).not.toHaveBeenCalled();
  });

  it("não confirma retorno com identidade divergente, conflito ou chave com outro conteúdo", async () => {
    const data = { organization_id: id(1), chave: id(5), comando: "salvar_local", nome: "Central" };
    const db = {
      rpc: vi.fn().mockResolvedValue({
        data: { tipo: "locais", id: id(8), detalhe: localDetail() },
        error: null,
      }),
    };
    await expect(
      handler<typeof db>(executarAlmoxarifado)({ data, context: { supabase: db, userId: id(2) } }),
    ).rejects.toThrow(/não corresponde/);
    for (const [code, expected] of [
      ["40001", /preenchimento foi preservado/],
      ["23505", /conteúdo diferente/],
    ]) {
      db.rpc.mockResolvedValue({ data: null, error: { code, message: "PRIVADO_TESTE" } });
      await expect(
        handler<typeof db>(executarAlmoxarifado)({
          data,
          context: { supabase: db, userId: id(2) },
        }),
      ).rejects.toThrow(expected);
    }
  });

  it("política publicada retorna sua própria versão, sem fabricar uma ferramenta", async () => {
    const detail = {
      tipo: "politicas_calibracao",
      id: id(6),
      registro: {
        id: id(6),
        nome: "Política conferida",
        numero: 1,
        metodo: "Método aprovado",
        fonte: "Fonte autorizada V1",
        exige_validade: false,
        profissional_id: id(4),
        created_at: "2026-10-22T12:00:00Z",
      },
      historico: [],
      permissoes: { ...permissions, editar: false, executar: false },
    };
    const db = {
      rpc: vi.fn().mockResolvedValue({
        data: { tipo: "politicas_calibracao", id: id(6), detalhe: detail },
        error: null,
      }),
    };
    await expect(
      handler<typeof db>(executarAlmoxarifado)({
        data: {
          organization_id: id(1),
          chave: id(5),
          comando: "publicar_politica_calibracao",
          nome: "Política conferida",
          metodo: "Método aprovado",
          fonte: "Fonte autorizada V1",
          exige_validade: false,
        },
        context: { supabase: db, userId: id(2) },
      }),
    ).resolves.toMatchObject({ tipo: "politicas_calibracao", id: id(6) });
  });
});
