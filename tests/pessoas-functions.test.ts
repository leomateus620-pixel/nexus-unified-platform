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
  listarPessoas,
  obterPessoa,
  salvarPessoa,
} from "../src/features/operacao/operacao.functions";
import {
  acessoPessoaNegado,
  PESSOA_ACESSO_INDISPONIVEL,
} from "../src/features/operacao/pessoas-domain";
const id = (n: number) => `00000000-0000-4000-8000-${String(n).padStart(12, "0")}`;
const person = {
  id: id(3),
  organization_id: id(1),
  nome: "Pessoa do teste isolado",
  vinculo: "colaborador",
  funcao: null,
  email_profissional: null,
  telefone_profissional: null,
  registro_profissional: null,
  user_id: null,
  ativa: true,
  version: 2,
};
function database() {
  const query = {
    select: vi.fn(),
    eq: vi.fn(),
    ilike: vi.fn(),
    order: vi.fn(),
    range: vi.fn().mockResolvedValue({ data: [person], error: null, count: 1 }),
    single: vi.fn().mockResolvedValue({ data: person, error: null }),
  };
  for (const method of [query.select, query.eq, query.ilike, query.order])
    method.mockReturnValue(query);
  return {
    query,
    from: vi.fn().mockReturnValue(query),
    rpc: vi.fn().mockResolvedValue({ data: true, error: null }),
  };
}
const call = (fn: unknown, db: ReturnType<typeof database>, data: unknown) =>
  (fn as (v: unknown) => Promise<unknown>)({ data, context: { supabase: db, userId: id(2) } });

// Fronteira isolada de contrato; não comprova middleware Auth, RLS ou transporte HTTP.
describe("Pessoas: leitura atual e recuperação", () => {
  it("confere acesso antes/depois da leitura e mantém projeção operacional com tenant e ID", async () => {
    const db = database();
    expect(await call(obterPessoa, db, { organization_id: id(1), id: id(3) })).toEqual(person);
    expect(db.rpc).toHaveBeenCalledTimes(2);
    expect(db.rpc).toHaveBeenCalledWith("operacao_pode", { _org: id(1), _acao: "ver_equipe" });
    expect(db.query.eq.mock.calls).toEqual([
      ["organization_id", id(1)],
      ["id", id(3)],
    ]);
    expect(db.query.select.mock.calls[0]?.[0]).not.toMatch(/custo|cpf|saude|auth\.users/);
  });
  it("nega antes de consultar dados quando o acesso atual é falso", async () => {
    const db = database();
    db.rpc.mockResolvedValue({ data: false, error: null });
    await expect(call(obterPessoa, db, { organization_id: id(1), id: id(3) })).rejects.toThrow(
      PESSOA_ACESSO_INDISPONIVEL,
    );
    expect(db.from).not.toHaveBeenCalled();
  });
  it("não devolve a ficha se a segunda autorização já foi revogada", async () => {
    const db = database();
    db.rpc
      .mockResolvedValueOnce({ data: true, error: null })
      .mockResolvedValueOnce({ data: false, error: null });
    await expect(call(obterPessoa, db, { organization_id: id(1), id: id(3) })).rejects.toThrow(
      PESSOA_ACESSO_INDISPONIVEL,
    );
  });
  it("ausência sob RLS não revela mensagem interna nem vira ficha vazia", async () => {
    const db = database();
    db.query.single.mockResolvedValue({
      data: null,
      error: { code: "PGRST116", message: "internal row details" },
    });
    await expect(call(obterPessoa, db, { organization_id: id(1), id: id(3) })).rejects.toThrow(
      PESSOA_ACESSO_INDISPONIVEL,
    );
  });
  it("lista pagina no servidor, escapa busca e não converte contagem ausente em zero", async () => {
    const db = database();
    expect(
      await call(listarPessoas, db, { organization_id: id(1), busca: "A%_", pagina: 2 }),
    ).toEqual({ rows: [person], total: 1 });
    expect(db.query.range).toHaveBeenCalledWith(50, 74);
    expect(db.query.ilike).toHaveBeenCalledWith("nome", "%A\\%\\_%");
    db.query.range.mockResolvedValue({ data: [person], error: null, count: null });
    await expect(call(listarPessoas, db, { organization_id: id(1) })).rejects.toThrow(
      "contagem de pessoas",
    );
  });
  it("retry de salvamento retorna leitura atual em vez do snapshot antigo do recibo", async () => {
    const db = database();
    db.rpc.mockImplementation(async (name: string) => ({
      data: name === "salvar_pessoa" ? { ...person, nome: "Snapshot antigo", version: 1 } : true,
      error: null,
    }));
    const response = await call(salvarPessoa, db, {
      organization_id: id(1),
      id: id(3),
      chave: id(4),
      expected_version: 1,
      dados: { nome: person.nome, vinculo: "colaborador" },
    });
    expect(response).toEqual(person);
    expect(db.rpc.mock.calls[0]?.[0]).toBe("salvar_pessoa");
    expect(db.query.single).toHaveBeenCalledOnce();
  });
  it("nega recibo se o usuário perdeu acesso antes de lê-lo", async () => {
    const db = database();
    db.rpc
      .mockResolvedValueOnce({ data: person, error: null })
      .mockResolvedValueOnce({ data: false, error: null });
    await expect(
      call(salvarPessoa, db, {
        organization_id: id(1),
        id: id(3),
        chave: id(4),
        expected_version: 1,
        dados: { nome: person.nome, vinculo: "colaborador" },
      }),
    ).rejects.toThrow(PESSOA_ACESSO_INDISPONIVEL);
    expect(db.from).not.toHaveBeenCalled();
  });
  it("distingue negação serializada de falha de rede", () => {
    expect(acessoPessoaNegado({ message: PESSOA_ACESSO_INDISPONIVEL })).toBe(true);
    expect(acessoPessoaNegado(new Error("Falha de rede"))).toBe(false);
  });
});
