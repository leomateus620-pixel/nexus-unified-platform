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
  buscarOpcoesLevantamento,
  listarLevantamentos,
  executarLevantamento,
  previaAdocaoLevantamento,
} from "../src/features/levantamentos/levantamentos.functions";

const id = (n: number) => `00000000-0000-4000-8000-${String(n).padStart(12, "0")}`;
// A adaptação chama só o handler: não comprova transporte, autenticação real ou RLS.
function handler<T>(fn: unknown) {
  return fn as (arg: {
    data: unknown;
    context: { supabase: T; userId: string };
  }) => Promise<unknown>;
}
describe("Levantamentos: fronteira autenticada de comandos e consultas", () => {
  it("nega opções amplas antes de consultar cadastros quando o ator não possui gestão", async () => {
    const db = { rpc: vi.fn().mockResolvedValue({ data: false, error: null }), from: vi.fn() };
    await expect(
      handler<typeof db>(buscarOpcoesLevantamento)({
        data: { organization_id: id(1), tipo: "clientes" },
        context: { supabase: db, userId: id(2) },
      }),
    ).rejects.toThrow(/não permite/);
    expect(db.rpc).toHaveBeenCalledWith("operacao_pode", { _org: id(1), _acao: "gerir_operacao" });
    expect(db.from).not.toHaveBeenCalled();
  });
  it("valida enum de fonte antes de qualquer consulta", async () => {
    const db = { rpc: vi.fn(), from: vi.fn() };
    await expect(
      handler<typeof db>(buscarOpcoesLevantamento)({
        data: { organization_id: id(1), tipo: "auth.users" },
        context: { supabase: db, userId: id(2) },
      }),
    ).rejects.toThrow();
    expect(db.rpc).not.toHaveBeenCalled();
    expect(db.from).not.toHaveBeenCalled();
  });
  it("página e filtros de tenant passam ao RPC sem sintaxe de filtro gerada pelo browser", async () => {
    const db = {
      rpc: vi.fn().mockResolvedValue({
        data: { registros: [], total: 0, pagina: 2, limite: 25 },
        error: null,
      }),
    };
    await expect(
      handler<typeof db>(listarLevantamentos)({
        data: { organization_id: id(1), busca: "%_", cliente_id: id(3), pagina: 2 },
        context: { supabase: db, userId: id(2) },
      }),
    ).resolves.toEqual({ rows: [], total: 0, page: 2, pageSize: 25 });
    expect(db.rpc).toHaveBeenCalledWith("lev_listar", {
      _org: id(1),
      _busca: "%_",
      _estado: null,
      _responsavel: null,
      _pagina: 2,
      _limite: 25,
      _cliente: id(3),
    });
  });
  it("rejeita autor forjado e edição sem versão antes de chamar comando SQL", async () => {
    const db = { rpc: vi.fn() };
    const call = handler<typeof db>(executarLevantamento);
    const context = { supabase: db, userId: id(2) };
    await expect(
      call({
        data: {
          organization_id: id(1),
          chave: id(4),
          comando: "aprovar",
          levantamento_id: id(5),
          revisao_id: id(6),
          expected_version: 1,
          created_by: id(7),
        },
        context,
      }),
    ).rejects.toThrow();
    await expect(
      call({
        data: {
          organization_id: id(1),
          chave: id(4),
          comando: "salvar_ponto",
          levantamento_id: id(5),
          revisao_id: id(6),
          ponto_id: id(7),
          codigo: "P1",
          nome: "Ponto",
        },
        context,
      }),
    ).rejects.toThrow();
    expect(db.rpc).not.toHaveBeenCalled();
  });
  it("falha de autorização retorna erro público sem reproduzir detalhe de registro protegido", async () => {
    const db = {
      rpc: vi.fn().mockResolvedValue({
        data: null,
        error: { code: "42501", message: "DETALHE_PRIVADO_FIXTURE" },
      }),
    };
    const promise = handler<typeof db>(listarLevantamentos)({
      data: { organization_id: id(1) },
      context: { supabase: db, userId: id(2) },
    });
    await expect(promise).rejects.toThrow("Registro indisponível para seu acesso atual.");
    await expect(promise).rejects.not.toThrow("DETALHE_PRIVADO_FIXTURE");
  });
  it("preview de adoção usa exclusivamente o comando SQL, sem ler custos ou recalcular no handler", async () => {
    const preview = {
      preview_hash: "hash-fixture",
      levantamento_id: id(3),
      revisao_fonte_id: id(4),
      medicao_id: id(5),
      sistema_id: id(6),
      revisao_destino_id: id(7),
      proposta_destino_id: id(8),
      campo: "metragem",
      atual: "2.000",
      proposto: "12.123",
      unidade: "m",
      origem: { valor: "12.123456", unidade: "m" },
      afetados: [],
      versao_destino: 1,
    };
    const db = { rpc: vi.fn().mockResolvedValue({ data: preview, error: null }), from: vi.fn() };
    await expect(
      handler<typeof db>(previaAdocaoLevantamento)({
        data: {
          organization_id: id(1),
          revisao_id: id(4),
          medicao_id: id(5),
          sistema_id: id(6),
          campo: "metragem",
        },
        context: { supabase: db, userId: id(2) },
      }),
    ).resolves.toEqual(preview);
    expect(db.rpc).toHaveBeenCalledWith("lev_prever_adocao", {
      _org: id(1),
      _revisao: id(4),
      _medicao: id(5),
      _sistema: id(6),
      _campo: "metragem",
    });
    expect(db.from).not.toHaveBeenCalled();
  });
});
