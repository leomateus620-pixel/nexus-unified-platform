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
  buscarOpcoesEstudo,
  executarEstudo,
  listarEstudos,
  obterEstudo,
  publicarMetodoEstudo,
  vincularAcaoEstudo,
} from "../src/features/estudos/estudos.functions";

const id = (n: number) => `00000000-0000-4000-8000-${String(n).padStart(12, "0")}`;
function handler<T>(fn: unknown) {
  return fn as (arg: {
    data: unknown;
    context: { supabase: T; userId: string };
  }) => Promise<unknown>;
}
// Este harness exercita handlers/Zod; não comprova middleware HTTP, Auth ou RLS reais.
describe("Estudos técnicos: fronteira de servidor e payloads mínimos", () => {
  it("envia recorte de tenant e busca literal para o RPC sem consultar tabelas amplas", async () => {
    const db = {
      rpc: vi.fn().mockResolvedValue({
        data: {
          registros: [],
          total: 0,
          pagina: 2,
          limite: 25,
          permissoes: { criar: true, publicar_metodo: false },
        },
        error: null,
      }),
      from: vi.fn(),
    };
    await expect(
      handler<typeof db>(listarEstudos)({
        data: { organization_id: id(1), cliente_id: id(3), busca: "%_'", pagina: 2 },
        context: { supabase: db, userId: id(2) },
      }),
    ).resolves.toEqual({
      rows: [],
      total: 0,
      page: 2,
      pageSize: 25,
      permissoes: { criar: true, publicar_metodo: false },
    });
    expect(db.rpc).toHaveBeenCalledWith("est_listar", {
      _org: id(1),
      _busca: "%_'",
      _estado: null,
      _responsavel: null,
      _pagina: 2,
      _limite: 25,
      _cliente: id(3),
    });
    expect(db.from).not.toHaveBeenCalled();
  });
  it("nega filtro de fonte desconhecido antes de consultar SQL", async () => {
    const db = { rpc: vi.fn(), from: vi.fn() };
    await expect(
      handler<typeof db>(buscarOpcoesEstudo)({
        data: { organization_id: id(1), tipo: "auth.users" },
        context: { supabase: db, userId: id(2) },
      }),
    ).rejects.toThrow();
    expect(db.rpc).not.toHaveBeenCalled();
    expect(db.from).not.toHaveBeenCalled();
  });
  it("seletor conserva paginação/contexto e descarta snapshots que não integram seu DTO", async () => {
    const db = {
      rpc: vi.fn().mockResolvedValue({
        data: {
          registros: [
            {
              id: id(4),
              nome: "Documento técnico",
              contexto: "V1",
              snapshot: { custos: "PRIVADO_TESTE" },
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
    const response = await handler<typeof db>(buscarOpcoesEstudo)({
      data: {
        organization_id: id(1),
        tipo: "documentos",
        cliente_id: id(3),
        unidade_id: id(5),
        pagina: 1,
      },
      context: { supabase: db, userId: id(2) },
    });
    expect(response).toEqual({
      rows: [{ id: id(4), nome: "Documento técnico", contexto: "V1" }],
      total: 26,
      page: 1,
      pageSize: 25,
    });
    expect(JSON.stringify(response)).not.toContain("PRIVADO_TESTE");
    expect(db.rpc).toHaveBeenCalledWith("est_opcoes", {
      _org: id(1),
      _tipo: "documentos",
      _busca: "",
      _cliente: id(3),
      _unidade: id(5),
      _pagina: 1,
    });
    expect(db.from).not.toHaveBeenCalled();
  });
  it("não aceita autoria forjada nem exclusão composta sem versão da revisão", async () => {
    const db = { rpc: vi.fn() };
    const request = {
      organization_id: id(1),
      chave: id(2),
      estudo_id: id(3),
      revisao_id: id(4),
      comando: "excluir_perigo",
      perigo_id: id(5),
      expected_version: 1,
    };
    const context = { supabase: db, userId: id(6) };
    await expect(handler<typeof db>(executarEstudo)({ data: request, context })).rejects.toThrow();
    await expect(
      handler<typeof db>(executarEstudo)({
        data: { ...request, expected_revision_version: 3, autor: id(7) },
        context,
      }),
    ).rejects.toThrow();
    expect(db.rpc).not.toHaveBeenCalled();
  });
  it("vínculo de fonte passa apenas a FK escolhida e renomeia tipo_fonte no contrato SQL", async () => {
    const db = {
      rpc: vi
        .fn()
        .mockResolvedValue({ data: null, error: { code: "42501", message: "Fonte inacessível" } }),
    };
    await expect(
      handler<typeof db>(executarEstudo)({
        data: {
          organization_id: id(1),
          chave: id(2),
          comando: "vincular_fonte",
          estudo_id: id(3),
          revisao_id: id(4),
          expected_version: 1,
          tipo_fonte: "projeto_engenharia",
          pe_versao_id: id(5),
          justificativa: "Referência congelada conferida",
        },
        context: { supabase: db, userId: id(6) },
      }),
    ).rejects.toThrow(/indisponível/);
    expect(db.rpc).toHaveBeenCalledWith("est_executar", {
      _org: id(1),
      _chave: id(2),
      _comando: "vincular_fonte",
      _dados: {
        estudo_id: id(3),
        revisao_id: id(4),
        expected_version: 1,
        tipo: "projeto_engenharia",
        pe_versao_id: id(5),
        justificativa: "Referência congelada conferida",
      },
    });
  });
  it("erro de acesso não reproduz detalhe da fonte protegida", async () => {
    const db = {
      rpc: vi
        .fn()
        .mockResolvedValue({ data: null, error: { code: "42501", message: "PRIVADO_TESTE" } }),
    };
    const request = handler<typeof db>(obterEstudo)({
      data: { organization_id: id(1), estudo_id: id(3) },
      context: { supabase: db, userId: id(2) },
    });
    await expect(request).rejects.toThrow("Estudo ou fonte indisponível para seu acesso atual.");
    await expect(request).rejects.not.toThrow("PRIVADO_TESTE");
  });
  it("falha de migração é erro recuperável, nunca lista vazia ou sucesso de emissão", async () => {
    const db = {
      rpc: vi
        .fn()
        .mockResolvedValue({ data: null, error: { code: "PGRST202", message: "missing RPC" } }),
    };
    await expect(
      handler<typeof db>(listarEstudos)({
        data: { organization_id: id(1) },
        context: { supabase: db, userId: id(2) },
      }),
    ).rejects.toThrow(/migração 0022/);
  });
  it("publicação não concede habilitação profissional a partir de campo enviado", async () => {
    const db = { rpc: vi.fn() };
    await expect(
      handler<typeof db>(publicarMetodoEstudo)({
        data: {
          organization_id: id(1),
          chave: id(2),
          nome: "Método",
          tipo: "memorial",
          instrucoes: "Critérios autorizados de teste",
          fontes: [{ titulo: "Fonte", edicao: "1", emissor: "Equipe" }],
          registro_profissional: "forjado",
        },
        context: { supabase: db, userId: id(3) },
      }),
    ).rejects.toThrow();
    expect(db.rpc).not.toHaveBeenCalled();
  });
  it("ação usa comando canônico por linhagem e instrução explícita, sem copiar estudo", async () => {
    const response = { acao_id: id(6), linhagem_id: id(7), estudo_id: id(3), revisao_id: id(4) };
    const db = { rpc: vi.fn().mockResolvedValue({ data: response, error: null }), from: vi.fn() };
    await expect(
      handler<typeof db>(vincularAcaoEstudo)({
        data: {
          organization_id: id(1),
          chave: id(2),
          medida_id: id(5),
          titulo: "Instrução liberada",
          descricao: "Executar a correção indicada",
          responsavel_id: id(8),
        },
        context: { supabase: db, userId: id(9) },
      }),
    ).resolves.toEqual(response);
    expect(db.rpc).toHaveBeenCalledWith("est_vincular_acao", {
      _org: id(1),
      _chave: id(2),
      _medida: id(5),
      _dados: {
        titulo: "Instrução liberada",
        descricao: "Executar a correção indicada",
        responsavel_id: id(8),
        prazo: null,
        prioridade: "normal",
        exige_verificacao: true,
      },
    });
    expect(db.from).not.toHaveBeenCalled();
  });
});
