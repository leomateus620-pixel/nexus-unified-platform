import { beforeEach, describe, expect, it, vi } from "vitest";
import type { SupabaseClient } from "@supabase/supabase-js";
import { NR_CALCULO_VERSAO } from "../src/features/nr/domain";
import {
  calcularSnapshotNr,
  lerCalculosNr,
  nrSalvarCalculosSchema,
  type NrCalculosEntrada,
} from "../src/features/nr/calculos.schemas";
vi.mock("@/integrations/supabase/auth-middleware", () => ({ requireSupabaseAuth: {} }));
vi.mock("@tanstack/react-start", () => ({
  createServerFn: () => {
    const chain = {
      middleware: () => chain,
      inputValidator: () => chain,
      handler: (fn: unknown) => fn,
    };
    return chain;
  },
}));
import { salvarCalculosNr } from "../src/features/nr/calculos.functions";
const id = (n: number) => `c4330000-0000-4000-8000-${String(n).padStart(12, "0")}`;
const parameter = <U extends string>(valor: number | null, unidade: U) => ({
  valor,
  unidade,
  estado: "informado" as const,
  fonte: "Medição sintética do teste isolado",
});
const entrada = (): NrCalculosEntrada => ({
  geometria: {
    modelo: {
      tipo: "paralelepipedo",
      comprimento: parameter(3, "m"),
      largura: parameter(200, "cm"),
      altura: parameter(4000, "mm"),
    },
    deducoes: [parameter(1000, "L"), parameter(2, "m3")],
  },
  ventilacao: {
    volume: { origem: "geometria" },
    vazao_nominal: parameter(1, "m3/s"),
    fator_efetividade: parameter(0.5, "fracao"),
    duracao: parameter(30, "min"),
  },
  notas: "Cenário isolado; não representa um local real.",
});
const input = () => ({
  organization_id: id(1),
  norma: "NR33" as const,
  local_id: id(2),
  expected_version: 7,
  chave: id(8),
  entrada: entrada(),
});
function setup(
  mode:
    "ok" | "denied" | "cross" | "norma" | "archived" | "stale" | "opaque" | "lost_response" = "ok",
) {
  let local = {
    id: id(2),
    organization_id: mode === "cross" ? id(99) : id(1),
    cliente_id: id(3),
    unidade_id: id(4),
    normas: mode === "norma" ? ["NR35"] : ["NR33"],
    titulo: "Local sintético",
    descricao: "",
    estado: "ativo",
    dados: {
      legado: { preservado: true },
      aliases_importados: ["13A", "61 EFGHIJ"],
      ...(mode === "opaque" ? { calculos: { tipo: "anterior_sem_schema" } } : {}),
    } as Record<string, unknown>,
    version: mode === "stale" ? 8 : 7,
    created_at: "2026-10-30T00:00:00Z",
    updated_at: "2026-10-30T00:00:00Z",
    arquivado_em: mode === "archived" ? "2026-10-30T01:00:00Z" : null,
  };
  const receipts = new Map<string, string>();
  let loseResponse = mode === "lost_response";
  const rpc = vi.fn(async (name: string, args: Record<string, unknown>) => {
    if (name === "pode") {
      expect(args).toEqual({ _org: id(1), _acao: "editar_nr" });
      return { data: mode !== "denied", error: null };
    }
    if (name === "nr_consultar") return { data: structuredClone(local), error: null };
    if (name !== "nr_executar") throw new Error(`RPC inesperada: ${name}`);
    const key = String(args["p_chave"]),
      payload = JSON.stringify(args);
    if (receipts.has(key))
      return receipts.get(key) === payload
        ? { data: structuredClone(local), error: null }
        : { data: null, error: { code: "23505", message: "chave já utilizada" } };
    if (local.version !== args["p_expected_version"])
      return { data: null, error: { code: "40001", message: "conflito" } };
    const dados = args["p_dados"] as { dados: Record<string, unknown> };
    local = { ...local, dados: structuredClone(dados.dados), version: local.version + 1 };
    receipts.set(key, payload);
    if (loseResponse) {
      loseResponse = false;
      return { data: null, error: { message: "Resposta perdida após confirmação" } };
    }
    return { data: structuredClone(local), error: null };
  });
  return { client: { rpc } as unknown as SupabaseClient, rpc, read: () => structuredClone(local) };
}
beforeEach(() => vi.clearAllMocks());
describe("NR cálculos persistidos: fronteira autenticada e motor canônico", () => {
  it("recalcula no servidor, vincula o volume à geometria deste local e preserva outros dados", async () => {
    const t = setup(),
      result = await salvarCalculosNr(t.client, input(), id(5));
    expect(result.registro.dados["legado"]).toEqual({ preservado: true });
    expect(result.registro.dados["aliases_importados"]).toEqual(["13A", "61 EFGHIJ"]);
    const calc = lerCalculosNr(result.registro.dados["calculos"]);
    expect(calc?.motor_versao).toBe(NR_CALCULO_VERSAO);
    expect(calc?.geometria?.volume_bruto_m3).toBe(24);
    expect(calc?.geometria?.volume_liquido_m3).toBe(21);
    expect(calc?.ventilacao?.vazao_nominal_m3_h).toBe(3600);
    expect(calc?.ventilacao?.vazao_efetiva_m3_h).toBe(1800);
    expect(calc?.ventilacao?.renovacoes_por_hora).toBeCloseTo(1800 / 21);
    expect(calc?.ventilacao?.volumes_acumulados).toBeCloseTo(900 / 21);
    expect(calc?.ventilacao?.estado).toBe("nao_validado");
    expect(calc?.autor).toBe(id(5));
    expect(calc?.autoriza_entrada).toBe(false);
    expect(JSON.stringify(calc)).not.toContain('"estado":"validado"');
    const written = t.rpc.mock.calls.find(([name]) => name === "nr_executar")?.[1];
    expect(written).toMatchObject({
      p_recurso: "locais",
      p_comando: "salvar",
      p_expected_version: 7,
      p_chave: id(8),
      p_id: id(2),
    });
    expect(Object.keys((written?.["p_dados"] ?? {}) as object)).toEqual(["dados"]);
  });
  it("salva parcialmente sem converter deduções desconhecidas, fator ou duração em valores presumidos", async () => {
    const t = setup(),
      data = input();
    data.entrada.geometria!.deducoes = null;
    data.entrada.ventilacao!.fator_efetividade.valor = null;
    data.entrada.ventilacao!.duracao.valor = null;
    const saved = await salvarCalculosNr(t.client, data, id(5)),
      calc = lerCalculosNr(saved.registro.dados["calculos"]);
    expect(calc?.geometria?.deducoes_m3).toBeNull();
    expect(calc?.geometria?.volume_liquido_m3).toBeNull();
    expect(calc?.ventilacao?.vazao_efetiva_m3_h).toBeNull();
    expect(calc?.ventilacao?.volumes_acumulados).toBeNull();
    expect(calc?.ventilacao?.estado).toBe("incompleto");
    expect(calc?.geometria?.pendencias.join(" ")).toContain("Deduções");
  });
  it.each(["denied", "cross", "norma", "archived", "opaque"] as const)(
    "bloqueia %s antes de escrever",
    async (mode) => {
      const t = setup(mode);
      await expect(salvarCalculosNr(t.client, input(), id(5))).rejects.toThrow();
      expect(t.rpc.mock.calls.some(([name]) => name === "nr_executar")).toBe(false);
    },
  );
  it("encaminha a versão esperada à transação e preserva o preenchimento em conflito", async () => {
    const t = setup("stale"),
      data = input(),
      before = structuredClone(data);
    await expect(salvarCalculosNr(t.client, data, id(5))).rejects.toThrow("Outra pessoa alterou");
    expect(t.read().version).toBe(8);
    expect(t.read().dados["calculos"]).toBeUndefined();
    expect(data).toEqual(before);
  });
  it("repete a mesma chave após resposta perdida sem payload temporal variável ou duplicação", async () => {
    const t = setup("lost_response"),
      data = input();
    await expect(salvarCalculosNr(t.client, data, id(5))).rejects.toThrow("Resposta perdida");
    const saved = await salvarCalculosNr(t.client, data, id(5));
    expect(saved.registro.version).toBe(8);
    const writes = t.rpc.mock.calls.filter(([name]) => name === "nr_executar");
    expect(writes).toHaveLength(2);
    expect(writes[0]?.[1]).toEqual(writes[1]?.[1]);
    const changed = structuredClone(data);
    changed.entrada.notas = "Outro pedido com a mesma chave";
    await expect(salvarCalculosNr(t.client, changed, id(5))).rejects.toThrow("chave já utilizada");
    expect(t.read().version).toBe(8);
  });
  it("recusa resultados, autoria, estado validado, unidades ou efetividade forjados no formulário", async () => {
    const t = setup();
    for (const mutate of [
      (d: Record<string, unknown>) => {
        d["autor"] = id(99);
      },
      (d: Record<string, unknown>) => {
        d["resultado"] = { volume: 100 };
      },
      (d: Record<string, unknown>) => {
        (d["entrada"] as NrCalculosEntrada).geometria!.modelo.altura.estado = "validado" as never;
      },
      (d: Record<string, unknown>) => {
        (d["entrada"] as NrCalculosEntrada).ventilacao!.fator_efetividade.valor = 1.1;
      },
      (d: Record<string, unknown>) => {
        (d["entrada"] as NrCalculosEntrada).geometria!.modelo.altura.unidade = "ft" as never;
      },
    ]) {
      const data = structuredClone(input()) as unknown as Record<string, unknown>;
      mutate(data);
      expect(nrSalvarCalculosSchema.safeParse(data).success).toBe(false);
      await expect(salvarCalculosNr(t.client, data as never, id(5))).rejects.toThrow();
    }
    expect(t.rpc).not.toHaveBeenCalled();
  });
  it("reproduz somente o motor conhecido e não confia em resultados JSON ou em validação declarada", () => {
    const snapshot = calcularSnapshotNr(entrada(), id(5), 7, id(8));
    const forged = { ...snapshot, geometria: { volume_liquido_m3: 999, estado: "validado" } };
    expect(lerCalculosNr(forged)?.geometria?.volume_liquido_m3).toBe(21);
    expect(lerCalculosNr(forged)?.geometria?.estado).toBe("nao_validado");
    expect(lerCalculosNr({ ...snapshot, motor_versao: "motor-futuro" })).toBeNull();
    expect(lerCalculosNr({ ...snapshot, autoriza_entrada: true })).toBeNull();
  });
});
