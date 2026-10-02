import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { createContext, useContext } from "react";

import { supabase } from "@/integrations/supabase/client";
import {
  PARAMETROS_MODELO,
  type Parametros,
  type Regras,
  type Totais,
} from "@/features/calculo/domain";
import { applyRevisionPatch } from "./revision-patch";
import type { Json } from "@/integrations/supabase/types";
import type { SaveStatus, CalculationStatus } from "./save-queue";
export type { SaveStatus, CalculationStatus } from "./save-queue";

export const SaveCtx = createContext<{
  status: SaveStatus;
  set: (s: SaveStatus, msg?: string) => void;
  msg: string | null;
  run: <T>(key: string, work: () => Promise<T>) => Promise<T | undefined>;
  register: (key: string, flush: () => void) => () => void;
  local: (key?: string) => void;
  settle: (key?: string) => void;
  save: () => Promise<boolean>;
  ensureConsistent: () => Promise<boolean>;
  retry: () => Promise<boolean>;
  flush: () => Promise<boolean>;
  requestCalculation: () => Promise<boolean>;
  calculation: CalculationStatus;
  draft: <T>(key: string) => T | undefined;
  remember: (key: string, value: unknown) => void;
  revisionVersion: { current: number | null };
  revisionBaselines: Map<string, Record<string, unknown>>;
  busy: boolean;
}>({
  status: "idle",
  set: () => {},
  msg: null,
  run: (_key, work) => work(),
  register: () => () => {},
  local: () => {},
  settle: () => {},
  save: async () => true,
  ensureConsistent: async () => true,
  retry: async () => false,
  flush: async () => true,
  requestCalculation: async () => true,
  calculation: "current",
  draft: () => undefined,
  remember: () => {},
  revisionVersion: { current: null },
  revisionBaselines: new Map(),
  busy: false,
});
export const useSave = () => useContext(SaveCtx);

export type ResumoCalculo = {
  totais: Totais;
  pendencias: string[];
  por_sistema: {
    sistema_id: string;
    extensao_m: number;
    cabo_m: number;
    venda_materiais: number;
    custo_materiais: number;
  }[];
  por_componente: {
    componente_id: string;
    codigo: string;
    quantidade: number;
    quantidade_sistemas?: number;
    quantidade_avulsa?: number;
    quantidade_avulsa_tecnica?: number;
    custo: number;
    preco_unit: number;
    total_venda: number;
    total_custo: number;
  }[];
  avulsos?: { componente_id: string; origem_id: string; caminho: string[]; quantidade_tecnica: number }[];
};

export const revKeys = {
  all: (id: string) => ["rev", id] as const,
  head: (id: string) => ["rev", id, "head"] as const,
  comps: (id: string) => ["rev", id, "comps"] as const,
  sis: (id: string) => ["rev", id, "sis"] as const,
  itens: (id: string) => ["rev", id, "itens"] as const,
  demandas: (id: string) => ["rev", id, "demandas"] as const,
};

export function useRevisao(id: string) {
  return useQuery({
    queryKey: revKeys.head(id),
    queryFn: async () => {
      const { data, error } = await supabase
        .from("proposta_revisoes")
        .select(
          "*, propostas!proposta_revisoes_proposta_id_fkey(id,numero,titulo,revisao_corrente_id,projeto_id,clientes(razao_social,cnpj,cidade,uf),unidades(nome,endereco),contatos(nome,email))",
        )
        .eq("id", id)
        .single();
      if (error) throw error;
      const p = data.propostas as unknown as {
        id: string;
        numero: string;
        titulo: string | null;
        revisao_corrente_id: string | null;
        projeto_id: string | null;
        clientes: {
          razao_social: string;
          cnpj: string | null;
          cidade: string | null;
          uf: string | null;
        } | null;
        unidades: { nome: string; endereco: string | null } | null;
        contatos: { nome: string; email: string | null } | null;
      };
      return {
        ...data,
        proposta: p,
        parametros: data.parametros as unknown as Parametros,
        regras: data.regras_snapshot as unknown as Regras | null,
        resumo: data.totais as unknown as ResumoCalculo | null,
        textos: (data.textos ?? {}) as Record<string, string>,
        editavel: data.status === "rascunho" || data.status === "em_revisao",
      };
    },
  });
}
export type RevisaoData = NonNullable<ReturnType<typeof useRevisao>["data"]>;

export function useComponentes(id: string) {
  return useQuery({
    queryKey: revKeys.comps(id),
    queryFn: async () => {
      const { data, error } = await supabase
        .from("revisao_componentes")
        .select("*, fornecedores(nome)")
        .eq("revisao_id", id)
        .order("codigo");
      if (error) throw error;
      return data;
    },
  });
}
export function useSistemas(id: string) {
  return useQuery({
    queryKey: revKeys.sis(id),
    queryFn: async () => {
      const { data, error } = await supabase
        .from("sistemas_dimensionados")
        .select("*")
        .eq("revisao_id", id)
        .order("ordem");
      if (error) throw error;
      return data;
    },
  });
}
export function useItens(id: string) {
  return useQuery({
    queryKey: revKeys.itens(id),
    queryFn: async () => {
      const { data, error } = await supabase
        .from("sistema_componentes")
        .select("*, revisao_componentes(codigo,descricao,unidade)")
        .eq("revisao_id", id);
      if (error) throw error;
      return data;
    },
  });
}

/** Recalcula no servidor (cálculo canônico) e invalida todos os dependentes da revisão. */
export function useRecalcular(id: string) {
  const save = useSave();
  return useMutation({
    mutationKey: ["calculo", id],
    mutationFn: () => save.requestCalculation(),
    onError: (e) => save.set("erro", e instanceof Error ? e.message : String(e)),
  });
}

/** Revision fields share the FIFO/version guard and recognize a write whose response was lost. */
export function usePatchRevisao(id: string) {
  const qc = useQueryClient();
  const save = useSave();
  const revision = useRevisao(id);
  const baselines = save.revisionBaselines;
  // Capture before editing and keep it with the revision while an invalid/failed draft is local.
  if (revision.data) {
    for (const field of ["textos", "parametros"] as const)
      if (!save.draft(field)) baselines.set(field, revision.data[field] as Record<string, unknown>);
  }
  return async (
    key: "textos" | "parametros",
    values: Record<string, unknown>,
    options?: { fields?: string[] },
  ) => {
    const original = revision.data;
    if (!original?.editavel) return false;
    const baseline = baselines.get(key) ?? (original[key] as Record<string, unknown>);
    baselines.set(key, baseline);
    const desired = options?.fields
      ? Object.fromEntries(
          Object.entries(values).filter(([field]) => options.fields!.includes(field)),
        )
      : values;
    // Compare only when this captured edit reaches the FIFO. An earlier write can
    // advance the baseline while a newer edit restores the original value.
    const version = save.revisionVersion.current ?? original.version;
    const normalize = (field: string, value: unknown) =>
      key === "parametros" && value === undefined
        ? PARAMETROS_MODELO[field as keyof Parametros]
        : value;
    const result = await save.run(key, async () => {
      const executionBaseline = baselines.get(key) ?? baseline;
      const snapshot = await applyRevisionPatch(
        {
          read: async () => {
            const { data, error } = await supabase
              .from("proposta_revisoes")
              .select("version,textos,parametros")
              .eq("id", id)
              .single();
            if (error) throw new Error(error.message);
            return { version: data.version, values: (data[key] ?? {}) as Record<string, unknown> };
          },
          write: async (expectedVersion, next) => {
            const { data, error } = await supabase
              .from("proposta_revisoes")
              .update(key === "textos" ? { textos: next as Json } : { parametros: next as Json })
              .eq("id", id)
              .eq("version", expectedVersion)
              .select("version");
            if (error) throw new Error(error.message);
            return data?.[0]?.version ?? null;
          },
        },
        {
          version: save.revisionVersion.current ?? version,
          values: executionBaseline,
        },
        desired,
        normalize,
      );
      // The form may still contain untouched values from before another editor's change.
      // Acknowledging those remote values here would misclassify the old displayed value
      // as a new local edit on the next full-form flush. Advance only our confirmed fields.
      baselines.set(key, {
        ...executionBaseline,
        ...Object.fromEntries(
          Object.entries(desired).filter(
            ([field, value]) =>
              !Object.is(normalize(field, value), normalize(field, executionBaseline[field])),
          ),
        ),
      });
      save.revisionVersion.current = snapshot.version;
      await qc.invalidateQueries({ queryKey: revKeys.head(id) });
      return true;
    });
    return result === true;
  };
}

export function useFornecedores(orgId: string) {
  return useQuery({
    queryKey: ["fornecedores", orgId],
    enabled: !!orgId,
    queryFn: async () => {
      const { data, error } = await supabase
        .from("fornecedores")
        .select("id,nome,cnpj,contato")
        .eq("organization_id", orgId)
        .order("nome");
      if (error) throw error;
      return data;
    },
  });
}
