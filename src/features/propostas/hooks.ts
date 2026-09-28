import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useServerFn } from "@tanstack/react-start";
import { createContext, useContext } from "react";

import { supabase } from "@/integrations/supabase/client";
import { recalcularRevisao } from "./propostas.functions";
import type { Parametros, Regras, Totais } from "@/features/calculo/domain";

export type SaveStatus =
  "idle" | "local" | "salvando" | "salvo" | "consolidando" | "confirmado" | "erro" | "conflito";
export const SaveCtx = createContext<{
  status: SaveStatus;
  set: (s: SaveStatus, msg?: string) => void;
  msg: string | null;
  run: <T>(key: string, work: () => Promise<T>) => Promise<T | undefined>;
  register: (key: string, flush: () => void) => () => void;
  local: (key?: string) => void;
  settle: (key?: string) => void;
  save: () => Promise<void>;
  busy: boolean;
}>({
  status: "idle",
  set: () => {},
  msg: null,
  run: (_key, work) => work(),
  register: () => () => {},
  local: () => {},
  settle: () => {},
  save: async () => {},
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
    custo: number;
    preco_unit: number;
    total_venda: number;
    total_custo: number;
  }[];
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
  const qc = useQueryClient();
  const fn = useServerFn(recalcularRevisao);
  const save = useSave();
  return useMutation({
    mutationFn: () => save.run("calculo", async () => fn({ data: { revisao_id: id } })),
    onMutate: () => save.set("salvando"),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: revKeys.all(id) });
    },
    onError: (e) => save.set("erro", e instanceof Error ? e.message : String(e)),
  });
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
