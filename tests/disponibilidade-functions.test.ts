import { describe, expect, it, vi } from "vitest";
vi.mock("@/integrations/supabase/auth-middleware", () => ({ requireSupabaseAuth: {} }));
vi.mock("@tanstack/react-start/server", () => ({
  getRequest: () => ({ signal: new AbortController().signal }),
}));
vi.mock("@tanstack/react-start", () => ({
  createServerFn: () => {
    let parse: (value: unknown) => unknown;
    const builder = {
      middleware: () => builder,
      inputValidator: (s: { parse: (value: unknown) => unknown }) => {
        parse = (value) => s.parse(value);
        return builder;
      },
      handler: (fn: (arg: unknown) => unknown) => (arg: { data: unknown; context: unknown }) =>
        fn({ ...arg, data: parse(arg.data) }),
    };
    return builder;
  },
}));
import {
  disponibilidadeResult,
  executarIndisponibilidade,
  listarIndisponibilidades,
} from "../src/features/pessoas-competencias/disponibilidade/functions";
import {
  comandoInput,
  DISPONIBILIDADE_NEGADA,
} from "../src/features/pessoas-competencias/disponibilidade/schemas";
const org = "00000000-0000-4000-8000-000000000001",
  person = "00000000-0000-4000-8000-000000000002",
  key = "00000000-0000-4000-8000-000000000003";
const row = {
  id: key,
  organization_id: org,
  pessoa_id: person,
  inicio: "2026-11-02T12:00:00Z",
  fim: "2026-11-02T15:00:00Z",
  motivo_operacional: "Atividade externa",
  version: 1,
  cancelada_em: null,
  motivo_cancelamento: null,
  created_at: "2026-10-22T12:00:00Z",
};
function fixture(result: unknown) {
  const signal = vi.fn().mockResolvedValue({ data: result, error: null });
  const rpc = vi.fn(() => ({ abortSignal: signal }));
  return { arg: { context: { supabase: { rpc } } }, rpc, signal };
}
const creation = {
  organization_id: org,
  chave: key,
  comando: "registrar" as const,
  dados: {
    pessoa_id: person,
    inicio_local: "2026-11-02T09:00",
    fim_local: "2026-11-02T12:00",
    timezone: "America/Sao_Paulo",
    motivo: "Atividade externa",
  },
};
describe("Disponibilidade operacional", () => {
  it("lista paginada preserva contagem e capacidade do servidor, com abort de request", async () => {
    const f = fixture({
      registros: [row],
      total: 52,
      pagina: 1,
      limite: 25,
      pode_gerir: false,
      timezone: "America/Sao_Paulo",
    });
    const result = await listarIndisponibilidades({
      ...f.arg,
      data: { organization_id: org, pessoa_id: person, pagina: 1 },
    } as never);
    expect(f.rpc).toHaveBeenCalledWith("eq_listar_indisponibilidades", {
      _org: org,
      _pessoa: person,
      _pagina: 1,
      _limite: 25,
    });
    expect(result.total).toBe(52);
    expect(result.pode_gerir).toBe(false);
    expect(f.signal).toHaveBeenCalledWith(expect.any(AbortSignal));
  });
  it("preserva horário civil e IANA para resolução única no SQL, sem conversão do browser", async () => {
    const f = fixture(row);
    expect(await executarIndisponibilidade({ ...f.arg, data: creation } as never)).toEqual(row);
    expect(f.rpc).toHaveBeenCalledWith("eq_executar_indisponibilidade", {
      _org: org,
      _chave: key,
      _comando: "registrar",
      _dados: creation.dados,
    });
  });
  it("cancelamento exige versão e motivo e não admite autoria forjada", () => {
    const cancellation = {
      organization_id: org,
      chave: key,
      comando: "cancelar",
      dados: { id: key, expected_version: 2, motivo: "Agenda reprogramada" },
    };
    expect(comandoInput.safeParse(cancellation).success).toBe(true);
    expect(
      comandoInput.safeParse({
        ...cancellation,
        dados: { ...cancellation.dados, created_by: person },
      }).success,
    ).toBe(false);
    expect(
      comandoInput.safeParse({
        ...cancellation,
        dados: { ...cancellation.dados, expected_version: 0 },
      }).success,
    ).toBe(false);
  });
  it("fim anterior, motivo vazio e identificador inválido não chegam ao transporte", () => {
    expect(
      comandoInput.safeParse({
        ...creation,
        dados: { ...creation.dados, fim_local: "2026-11-02T08:00" },
      }).success,
    ).toBe(false);
    expect(
      comandoInput.safeParse({ ...creation, dados: { ...creation.dados, motivo: " " } }).success,
    ).toBe(false);
    expect(comandoInput.safeParse({ ...creation, organization_id: "invalid" }).success).toBe(false);
  });
  it("negação não reflete detalhes privados do erro SQL", () => {
    expect(() =>
      disponibilidadeResult({
        data: null,
        error: { code: "42501", message: "Private actor, tenant, record" },
      }),
    ).toThrow(DISPONIBILIDADE_NEGADA);
  });
  it("conflito, versão e falha de rede têm recuperação distinta sem sucesso local", () => {
    expect(() =>
      disponibilidadeResult({ data: null, error: { code: "23P01", message: "Internal details" } }),
    ).toThrow("Reprograme a visita");
    expect(() =>
      disponibilidadeResult({ data: null, error: { code: "40001", message: "Internal details" } }),
    ).toThrow("preservado");
    expect(() =>
      disponibilidadeResult({ data: null, error: { code: "XX000", message: "Private stack" } }),
    ).toThrow("preenchimento foi preservado");
  });
  it("resposta sem contagem não se transforma em lista vazia/zero", async () => {
    const f = fixture({
      registros: [],
      pagina: 0,
      limite: 25,
      pode_gerir: true,
      timezone: "America/Sao_Paulo",
    });
    await expect(
      listarIndisponibilidades({
        ...f.arg,
        data: { organization_id: org, pessoa_id: person, pagina: 0 },
      } as never),
    ).rejects.toThrow();
  });
});
