import { beforeEach, describe, expect, it, vi } from "vitest";
vi.mock("@/integrations/supabase/auth-middleware", () => ({ requireSupabaseAuth: {} }));
vi.mock("@tanstack/react-start/server", () => ({
  getRequest: () => ({ signal: new AbortController().signal }),
}));
vi.mock("@tanstack/react-start", () => ({
  createServerFn: () => {
    let parse: (v: unknown) => unknown;
    const chain = {
      middleware: () => chain,
      inputValidator: (s: { parse: (v: unknown) => unknown }) => {
        parse = s.parse.bind(s);
        return chain;
      },
      handler: (h: (v: unknown) => unknown) => (v: { data: unknown; context: unknown }) =>
        h({ data: parse(v.data), context: v.context }),
    };
    return chain;
  },
}));
import {
  petDemoExecutar,
  petDemoObter,
  petDemoArquivo,
} from "../src/features/pet/demo/demo.functions";
import { demoExportDetail } from "../src/features/pet/demo/export-detail";
import type { DemoDetail } from "../src/features/pet/demo/domain";
const id = (n: number) => `b7330000-0000-4000-8000-${String(n).padStart(12, "0")}`;
const scope = {
  organization_id: id(1),
  cliente_id: id(2),
  unidade_id: id(3),
  local_id: id(4),
  norma: "NR33",
};
const detail: DemoDetail = {
  pode_editar: true,
  eventos: [],
  presencas: [],
  anexos: [],
  sessao: {
    id: id(5),
    ...scope,
    numero: "DEMO-000001",
    norma_origem: "NR33",
    estado: "rascunho",
    etapa: 0,
    version: 1,
    conteudo: {
      atividade: "Teste",
      inicio_previsto: "2026-11-05T12:00:00Z",
      termino_previsto: "2026-11-05T13:00:00Z",
      equipe: [],
      perigos: "",
      medidas: "",
      procedimentos: "",
      leituras: [],
    },
    identificacao: { tag: "EC25", titulo: "Silo", unidade: "Fixture" },
    created_at: "2026-11-05T12:00:00Z",
    updated_at: "2026-11-05T12:00:00Z",
    encerrada_em: null,
  },
};
const rpc = vi.fn(),
  sign = vi.fn(),
  storage = { from: vi.fn(() => ({ createSignedUrl: sign, createSignedUploadUrl: sign })) };
const call = (fn: unknown, data: unknown) =>
  (fn as (v: unknown) => Promise<unknown>)({ data, context: { supabase: { rpc, storage } } });
beforeEach(() => {
  vi.clearAllMocks();
  rpc.mockImplementation((name: string) => {
    const p = Promise.resolve({
      data: name === "pet_demo_obter" ? detail : { id: id(5), version: 1, numero: "DEMO-000001" },
      error: null,
    });
    return Object.assign(p, { abortSignal: () => p });
  });
});
describe("Fronteira autenticada de demonstração", () => {
  it.each(["cliente_id", "unidade_id", "local_id"])(
    "recusa URL manipulada em %s",
    async (field) => {
      await expect(call(petDemoObter, { ...scope, [field]: id(99), id: id(5) })).rejects.toThrow(
        /contexto/,
      );
    },
  );
  it("revalida o contexto antes de emitir acesso ao arquivo privado", async () => {
    await expect(
      call(petDemoArquivo, {
        ...scope,
        local_id: id(99),
        id: id(5),
        comando: "abrir",
        arquivo_id: id(6),
      }),
    ).rejects.toThrow(/contexto/);
    expect(sign).not.toHaveBeenCalled();
  });
  it("não envia comando se o silo do corpo diverge do escopo", async () => {
    await expect(
      call(petDemoExecutar, {
        ...scope,
        comando: {
          comando: "criar",
          norma: "NR33",
          chave: id(9),
          dados: {
            cliente_id: id(2),
            unidade_id: id(3),
            local_id: id(99),
            conteudo: detail.sessao.conteudo,
          },
        },
      }),
    ).rejects.toThrow(/divergente/);
    expect(rpc).not.toHaveBeenCalled();
  });
  it("revalida norma e versão recebida no comando", async () => {
    await expect(
      call(petDemoExecutar, {
        ...scope,
        comando: {
          comando: "salvar",
          norma: "NR35",
          chave: id(9),
          id: id(5),
          expected_version: 1,
          dados: {},
        },
      }),
    ).rejects.toThrow(/normativo/);
    expect(rpc).toHaveBeenCalledTimes(1);
  });
  it("exporta todas as páginas e rejeita alteração durante a consulta", async () => {
    const event = { id: id(7), tipo: "criar", dados: {}, created_at: detail.sessao.created_at };
    const page = vi.fn(async (resource: string, index: number) => ({
      total: resource === "eventos" ? 2 : 0,
      registros: resource === "eventos" ? [{ ...event, id: id(7 + index) }] : [],
    }));
    const result = await demoExportDetail(async () => detail, page);
    expect(result.eventos).toHaveLength(2);
    expect(page).toHaveBeenCalledTimes(3);
    let count = 0;
    await expect(
      demoExportDetail(
        async () => ({ ...detail, sessao: { ...detail.sessao, version: ++count } }),
        page,
      ),
    ).rejects.toThrow(/atualizada/);
  });
});
