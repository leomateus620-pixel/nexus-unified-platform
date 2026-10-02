import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useServerFn } from "@tanstack/react-start";
import { useEffect, useMemo, useState } from "react";
import { ArrowDown, ArrowUp, ChevronRight, Plus, Trash2 } from "lucide-react";

import { supabase } from "@/integrations/supabase/client";
import { useOrg } from "@/features/org/session";
import {
  cadastrarProduto,
  editarProduto,
  minhasPermissoes,
  reclassificarProduto,
  salvarComposicao,
} from "./catalogo.functions";
import { nomeTipo, type TipoItem } from "./codigos";

const input = "h-9 w-full rounded border border-input bg-background px-2 text-sm text-foreground";
const btn = "inline-flex h-9 items-center gap-1.5 rounded border px-3 text-sm disabled:opacity-50";

export const TIPOS_GUIADOS: { valor: TipoItem; nome: string; apoio?: string; explica: string }[] = [
  { valor: "P", nome: "Peça", explica: "Item individual, usado sozinho ou dentro de um conjunto. Código com P." },
  {
    valor: "S",
    nome: "Conjunto soldado",
    apoio: "CJ SD",
    explica: "Produto formado por peças unidas por solda. Código com S.",
  },
  {
    valor: "M",
    nome: "Montagem",
    explica: "Produto formado pela combinação de peças e/ou conjuntos. Código com M.",
  },
];

export type Familia = { sigla: string; nome: string; grupo: string; situacao: string; observacao: string | null };

export function useFamiliasCodigo() {
  return useQuery({
    queryKey: ["familias_codigo"],
    staleTime: Infinity,
    queryFn: async () => {
      const { data, error } = await supabase
        .from("familias_codigo")
        .select("sigla,nome,grupo,situacao,observacao")
        .order("ordem");
      if (error) throw error;
      return data as Familia[];
    },
  });
}

export function usePermissoes() {
  const fn = useServerFn(minhasPermissoes);
  const orgId = useOrg().data?.orgId ?? "";
  return useQuery({ queryKey: ["permissoes", orgId], enabled: !!orgId, staleTime: 60_000, queryFn: () => fn() });
}

export type ProdutoCatalogo = {
  id: string;
  codigo: string;
  codigo_legado: string | null;
  descricao: string;
  familia: string | null;
  tipo_item: string | null;
  unidade: string;
  material: string | null;
  dimensoes: string | null;
  composicao_status: string;
};

export function useCatalogo(enabled = true) {
  const orgId = useOrg().data?.orgId ?? "";
  return useQuery({
    queryKey: ["catalogo-busca", orgId],
    enabled: enabled && !!orgId,
    queryFn: async () => {
      const { data, error } = await supabase
        .from("produtos")
        .select("id,codigo,codigo_legado,descricao,familia,tipo_item,unidade,material,dimensoes,composicao_status")
        .eq("organization_id", orgId)
        .eq("ativo", true)
        .order("descricao");
      if (error) throw error;
      return data as ProdutoCatalogo[];
    },
  });
}

/** Busca por nome, código, código antigo, família (sigla ou nome) e características técnicas. */
export function filtrarCatalogo(lista: ProdutoCatalogo[], termo: string, familias: Familia[]) {
  const t = termo.trim().toLowerCase();
  if (!t) return lista;
  const nomes = new Map(familias.map((f) => [f.sigla, f.nome.toLowerCase()]));
  return lista.filter((p) =>
    [p.descricao, p.codigo, p.codigo_legado, p.familia, nomes.get(p.familia ?? ""), p.material, p.dimensoes]
      .filter(Boolean)
      .some((v) => String(v).toLowerCase().includes(t)),
  );
}

export function FamiliaPicker({
  familias,
  value,
  onChange,
  id,
}: {
  familias: Familia[];
  value: string;
  onChange: (v: string) => void;
  id: string;
}) {
  const [texto, setTexto] = useState("");
  const atual = familias.find((f) => f.sigla === value);
  return (
    <>
      <input
        aria-label="Família"
        list={id}
        className={input}
        placeholder="Nome ou sigla (ex.: linha de vida, LVHF)"
        value={texto || (atual ? `${atual.nome} — ${atual.sigla}` : "")}
        onChange={(e) => {
          setTexto(e.target.value);
          const v = e.target.value.trim();
          const sigla = v.includes(" — ") ? v.split(" — ").pop()!.trim().toUpperCase() : v.toUpperCase();
          onChange(familias.some((f) => f.sigla === sigla) ? sigla : "");
        }}
        onBlur={() => setTexto("")}
      />
      <datalist id={id}>
        {familias.map((f) => (
          <option key={f.sigla} value={`${f.nome} — ${f.sigla}`}>
            {f.grupo}
          </option>
        ))}
      </datalist>
    </>
  );
}

type Linha = { filho_id: string; quantidade: string };
type Estado = {
  tipo: TipoItem | "";
  familia: string;
  descricao: string;
  unidade: string;
  modalidade: "comprar" | "fabricar" | "terceirizar";
  ncm: string;
  material: string;
  dimensoes: string;
  acabamento: string;
  custo: string;
  base_custo: "completo" | "composto";
};
const VAZIO: Estado = {
  tipo: "",
  familia: "",
  descricao: "",
  unidade: "PÇ",
  modalidade: "fabricar",
  ncm: "",
  material: "",
  dimensoes: "",
  acabamento: "",
  custo: "",
  base_custo: "composto",
};

const num = (v: string) => Number(v.trim().replace(/\./g, "").replace(",", "."));

/** Sugestão só a partir do que foi preenchido; nada é inventado. */
export function sugerirNome(e: Pick<Estado, "descricao" | "dimensoes" | "material" | "acabamento">) {
  const base = e.descricao.trim();
  if (!base) return "";
  const extras = [e.dimensoes, e.material, e.acabamento]
    .map((x) => x.trim())
    .filter((x) => x && !base.toLowerCase().includes(x.toLowerCase()));
  return extras.length ? `${base} — ${extras.join(" — ")}` : "";
}

/**
 * Editor único de produto (Produtos e Soluções e Itens Comerciais).
 * Novo: código reservado no servidor ao salvar, com chave idempotente. Edição: dados + composição.
 */
export function ProductEditor({
  produtoId,
  tipoInicial,
  compacto,
  rotuloSalvar,
  onSaved,
  onCancel,
}: {
  produtoId?: string;
  tipoInicial?: TipoItem;
  compacto?: boolean;
  rotuloSalvar?: string;
  onSaved?: (r: { id: string; codigo: string; descricao: string; novo: boolean }) => void | Promise<void>;
  onCancel?: () => void;
}) {
  const org = useOrg();
  const orgId = org.data?.orgId ?? "";
  const verCusto = org.data?.canSeeCosts ?? false;
  const perms = usePermissoes();
  const fam = useFamiliasCodigo();
  const familias = useMemo(() => fam.data ?? [], [fam.data]);
  const qc = useQueryClient();
  const cad = useServerFn(cadastrarProduto);
  const edit = useServerFn(editarProduto);
  const comp = useServerFn(salvarComposicao);
  const [f, setF] = useState<Estado>({ ...VAZIO, tipo: tipoInicial ?? "", base_custo: tipoInicial === "P" ? "completo" : "composto" });
  const [linhas, setLinhas] = useState<Linha[]>([]);
  const [chave, setChave] = useState(() => crypto.randomUUID());
  const [codigoAtual, setCodigoAtual] = useState<string | null>(null);
  const [subCadastro, setSubCadastro] = useState(false);

  const existente = useQuery({
    queryKey: ["produto-editor", produtoId],
    enabled: !!produtoId,
    queryFn: async () => {
      const [p, e] = await Promise.all([
        supabase.from("produtos").select("*").eq("id", produtoId!).single(),
        supabase.from("produto_estrutura").select("filho_id,quantidade,ordem").eq("pai_id", produtoId!).order("ordem"),
      ]);
      if (p.error) throw p.error;
      if (e.error) throw e.error;
      return { p: p.data, e: e.data };
    },
  });
  useEffect(() => {
    const d = existente.data;
    if (!d) return;
    setCodigoAtual(d.p.codigo);
    setF({
      tipo: (d.p.tipo_item as TipoItem) ?? "",
      familia: d.p.familia ?? "",
      descricao: d.p.descricao,
      unidade: d.p.unidade,
      modalidade: d.p.modalidade,
      ncm: d.p.ncm ?? "",
      material: d.p.material ?? "",
      dimensoes: d.p.dimensoes ?? "",
      acabamento: d.p.acabamento ?? "",
      custo: "",
      base_custo: d.p.base_custo as Estado["base_custo"],
    });
    setLinhas(d.e.map((x) => ({ filho_id: x.filho_id, quantidade: String(x.quantidade).replace(".", ",") })));
  }, [existente.data]);

  const previa = useQuery({
    queryKey: ["previa_codigo", orgId, f.familia, f.tipo],
    enabled: !produtoId && !!orgId && !!f.familia && !!f.tipo,
    queryFn: async () => {
      const { data, error } = await supabase.rpc("previa_codigo", { _org: orgId, _familia: f.familia, _tipo: f.tipo });
      if (error) throw error;
      return data as string | null;
    },
  });

  const podeSalvar = produtoId ? perms.data?.editar_cadastro : perms.data?.importar_catalogo;
  const composto = f.tipo === "S" || f.tipo === "M";
  const sugestao = sugerirNome(f);

  const salvar = useMutation({
    mutationFn: async () => {
      if (!f.tipo) throw new Error("Escolha o que você quer cadastrar.");
      if (!f.familia) throw new Error("Escolha a família.");
      if (f.descricao.trim().length < 2) throw new Error("Informe o nome do produto.");
      if (!f.unidade.trim()) throw new Error("Informe a unidade.");
      const custo = f.custo.trim() ? num(f.custo) : null;
      if (custo !== null && (!Number.isFinite(custo) || custo < 0)) throw new Error("Custo inválido.");
      const itens = composto
        ? linhas.map((l) => {
            const q = num(l.quantidade);
            if (!Number.isFinite(q) || q <= 0) throw new Error("Quantidade por unidade deve ser positiva.");
            return { filho_id: l.filho_id, quantidade: q };
          })
        : [];
      const comum = {
        descricao: f.descricao,
        unidade: f.unidade,
        ncm: f.ncm,
        modalidade: f.modalidade,
        material: f.material,
        dimensoes: f.dimensoes,
        acabamento: f.acabamento,
        base_custo: composto ? f.base_custo : ("completo" as const),
      };
      if (produtoId) {
        await edit({ data: { produto_id: produtoId, ...comum } });
        if (composto) await comp({ data: { produto_id: produtoId, itens, status: itens.length ? "definida" : "pendente" } });
        return { id: produtoId, codigo: codigoAtual ?? "", descricao: f.descricao, novo: false };
      }
      const r = await cad({
        data: { chave, familia: f.familia, tipo: f.tipo, custo, composicao: itens, ...comum },
      });
      return { id: r.id, codigo: r.codigo, descricao: f.descricao, novo: true };
    },
    onSuccess: async (r) => {
      if (!produtoId) {
        setChave(crypto.randomUUID());
        setF({ ...VAZIO, tipo: tipoInicial ?? "" });
        setLinhas([]);
      }
      await Promise.all([
        qc.invalidateQueries({ queryKey: ["produtos"] }),
        qc.invalidateQueries({ queryKey: ["catalogo-busca"] }),
        qc.invalidateQueries({ queryKey: ["series_codigo"] }),
        qc.invalidateQueries({ queryKey: ["previa_codigo"] }),
        qc.invalidateQueries({ queryKey: ["produto-editor", produtoId] }),
        qc.invalidateQueries({ queryKey: ["arvore"] }),
      ]);
      await onSaved?.(r);
    },
  });
  const set = (k: keyof Estado) => (e: { target: { value: string } }) => {
    salvar.reset();
    setF((x) => ({ ...x, [k]: e.target.value }));
  };

  if (produtoId && existente.isPending) return <p className="text-sm text-muted-foreground">Carregando cadastro…</p>;
  const familiaAtual = familias.find((x) => x.sigla === f.familia);

  return (
    <form
      onSubmit={(e) => {
        e.preventDefault();
        e.stopPropagation();
        salvar.mutate();
      }}
      className="grid gap-4"
    >
      {perms.data && !podeSalvar && (
        <p role="note" className="rounded border border-amber-500/40 bg-amber-500/10 px-3 py-2 text-sm text-foreground">
          {produtoId
            ? "Editar o cadastro mestre exige papel Comercial, Engenharia, Compras ou Admin."
            : "Cadastrar produto novo exige papel Engenharia, Compras ou Admin. Peça a um administrador o cadastro ou essa permissão."}
        </p>
      )}

      {!produtoId ? (
        <fieldset className="grid gap-2">
          <legend className="mb-1 text-sm font-semibold text-foreground">O que você quer cadastrar?</legend>
          <div className="grid gap-2 sm:grid-cols-3">
            {TIPOS_GUIADOS.map((t) => (
              <button
                key={t.valor}
                type="button"
                aria-pressed={f.tipo === t.valor}
                onClick={() => setF((x) => ({ ...x, tipo: t.valor, base_custo: t.valor === "P" ? "completo" : x.base_custo === "completo" && x.tipo === "P" ? "composto" : x.base_custo }))}
                className={`rounded border p-3 text-left ${f.tipo === t.valor ? "border-primary bg-primary/10" : "border-input"}`}
              >
                <span className="block text-sm font-semibold text-foreground">
                  {t.nome} {t.apoio && <span className="text-xs font-normal text-muted-foreground">({t.apoio})</span>}
                </span>
                {!compacto && <span className="mt-1 block text-xs text-muted-foreground">{t.explica}</span>}
              </button>
            ))}
          </div>
        </fieldset>
      ) : (
        <ReclassificarBloco
          produtoId={produtoId}
          codigo={codigoAtual ?? ""}
          familia={f.familia}
          tipo={f.tipo}
          familias={familias}
          pode={!!perms.data?.aprovar_tecnica}
          onDone={() => existente.refetch()}
        />
      )}

      {f.tipo && (
        <>
          <div className="grid gap-3 sm:grid-cols-6">
            {!produtoId && (
              <label className="grid gap-1 text-xs sm:col-span-3">
                Família — grupo técnico do produto
                <FamiliaPicker id={`fam-${chave}`} familias={familias} value={f.familia} onChange={(v) => setF((x) => ({ ...x, familia: v }))} />
                {familiaAtual?.situacao === "a_confirmar" && (
                  <span className="text-amber-600 dark:text-amber-400">Família com significado a confirmar: {familiaAtual.observacao}</span>
                )}
              </label>
            )}
            {!produtoId && (
              <div className="flex items-end gap-2 sm:col-span-3">
                <div className="flex h-9 w-full items-center gap-2 rounded border border-dashed border-primary/40 bg-primary/5 px-3">
                  <span className="text-xs text-muted-foreground">Código</span>
                  <span className="font-mono text-sm text-primary" aria-live="polite">
                    {previa.data ?? "—"}
                  </span>
                  {previa.data && <span className="text-xs text-muted-foreground">prévia · confirmado ao salvar</span>}
                </div>
              </div>
            )}
            <label className="grid gap-1 text-xs sm:col-span-4">
              Nome do produto
              <input aria-label="Nome do produto" className={input} value={f.descricao} onChange={set("descricao")} placeholder="Ex.: Pilar soldado" />
              {sugestao && sugestao !== f.descricao && (
                <button type="button" className="justify-self-start text-left text-xs text-primary underline" onClick={() => setF((x) => ({ ...x, descricao: sugestao }))}>
                  Usar “{sugestao}”
                </button>
              )}
            </label>
            <label className="grid gap-1 text-xs">
              Unidade
              <input aria-label="Unidade" className={input} value={f.unidade} onChange={set("unidade")} />
            </label>
            <label className="grid gap-1 text-xs">
              Fornecimento
              <select aria-label="Fornecimento" className={input} value={f.modalidade} onChange={set("modalidade")}>
                <option value="comprar">Comprar</option>
                <option value="fabricar">Fabricar</option>
                <option value="terceirizar">Terceirizar</option>
              </select>
            </label>
          </div>

          <details className="rounded border border-border px-3 py-2" open={!compacto && !!produtoId}>
            <summary className="cursor-pointer text-sm text-foreground">Detalhes complementares</summary>
            <div className="mt-2 grid gap-3 sm:grid-cols-6">
              <label className="grid gap-1 text-xs sm:col-span-2">
                Material
                <input aria-label="Material" className={input} value={f.material} onChange={set("material")} />
              </label>
              <label className="grid gap-1 text-xs sm:col-span-2">
                Dimensões
                <input aria-label="Dimensões" className={input} value={f.dimensoes} onChange={set("dimensoes")} placeholder="Ex.: 600 mm" />
              </label>
              <label className="grid gap-1 text-xs sm:col-span-2">
                Acabamento
                <input aria-label="Acabamento" className={input} value={f.acabamento} onChange={set("acabamento")} />
              </label>
              <label className="grid gap-1 text-xs sm:col-span-2">
                NCM
                <input aria-label="NCM" className={input} value={f.ncm} onChange={set("ncm")} />
              </label>
              {verCusto && !produtoId && (
                <label className="grid gap-1 text-xs sm:col-span-2">
                  Custo unitário (R$) — deixe vazio se desconhecido
                  <input aria-label="Custo" inputMode="decimal" className={input} value={f.custo} onChange={set("custo")} placeholder="0,00" />
                </label>
              )}
            </div>
          </details>

          {composto && (
            <section className="rounded border border-border p-3" aria-label="Composição do produto">
              <h4 className="text-sm font-semibold text-foreground">
                Composição do produto · {f.tipo === "S" ? "Peças deste conjunto" : "Componentes desta montagem"}
              </h4>
              <fieldset className="mt-2 flex flex-wrap gap-3 text-xs">
                <label className="flex items-center gap-1.5">
                  <input type="radio" checked={f.base_custo === "composto"} onChange={() => setF((x) => ({ ...x, base_custo: "composto" }))} />
                  Custo pelos componentes (fabricado/montado)
                </label>
                <label className="flex items-center gap-1.5">
                  <input type="radio" checked={f.base_custo === "completo"} onChange={() => setF((x) => ({ ...x, base_custo: "completo" }))} />
                  Produto comprado completo (composição apenas informativa)
                </label>
              </fieldset>
              <ComposicaoEditor
                linhas={linhas}
                setLinhas={setLinhas}
                excluir={produtoId}
                tipoPai={f.tipo as TipoItem}
                onNovo={() => setSubCadastro(true)}
              />
              {subCadastro && (
                <div className="mt-3 rounded border border-primary/30 bg-primary/5 p-3">
                  <p className="mb-2 text-xs text-muted-foreground">Cadastrar componente que falta — volta para esta composição ao salvar.</p>
                  <ProductEditor
                    compacto
                    tipoInicial="P"
                    rotuloSalvar="Cadastrar e adicionar à composição"
                    onCancel={() => setSubCadastro(false)}
                    onSaved={(r) => {
                      setLinhas((ls) => (ls.some((l) => l.filho_id === r.id) ? ls : [...ls, { filho_id: r.id, quantidade: "1" }]));
                      setSubCadastro(false);
                    }}
                  />
                </div>
              )}
              {!linhas.length && (
                <p className="mt-2 text-xs text-amber-600 dark:text-amber-400">
                  Sem componentes: o produto será salvo como “Composição pendente”.
                </p>
              )}
            </section>
          )}
        </>
      )}

      <div className="flex flex-wrap items-center gap-3">
        <button type="submit" disabled={salvar.isPending || !podeSalvar || !f.tipo} className={`${btn} border-primary bg-primary text-primary-foreground`}>
          {salvar.isPending ? "Salvando…" : (rotuloSalvar ?? (produtoId ? "Salvar cadastro" : "Cadastrar"))}
        </button>
        {onCancel && (
          <button type="button" className={`${btn} border-input`} onClick={onCancel}>
            Cancelar
          </button>
        )}
        {salvar.isSuccess && (
          <span className="text-sm text-primary" role="status">
            {salvar.data.novo ? (
              <>
                Cadastrado como <strong className="font-mono">{salvar.data.codigo}</strong>.
              </>
            ) : (
              "Cadastro salvo."
            )}
          </span>
        )}
        {salvar.isError && (
          <span className="text-sm text-destructive" role="alert">
            {(salvar.error as Error).message}
          </span>
        )}
      </div>
    </form>
  );
}

function ComposicaoEditor({
  linhas,
  setLinhas,
  excluir,
  tipoPai,
  onNovo,
}: {
  linhas: Linha[];
  setLinhas: (f: (l: Linha[]) => Linha[]) => void;
  excluir?: string;
  tipoPai: TipoItem;
  onNovo: () => void;
}) {
  const cat = useCatalogo();
  const fam = useFamiliasCodigo();
  const [busca, setBusca] = useState("");
  const porId = useMemo(() => new Map((cat.data ?? []).map((p) => [p.id, p])), [cat.data]);
  const opcoes = useMemo(
    () =>
      filtrarCatalogo(cat.data ?? [], busca, fam.data ?? [])
        .filter((p) => p.id !== excluir && !linhas.some((l) => l.filho_id === p.id))
        .filter((p) => (tipoPai === "S" ? p.tipo_item !== "M" : true))
        .slice(0, 8),
    [cat.data, busca, fam.data, excluir, linhas, tipoPai],
  );
  const mover = (i: number, d: number) =>
    setLinhas((ls) => {
      const n = [...ls];
      const [x] = n.splice(i, 1);
      n.splice(i + d, 0, x!);
      return n;
    });
  return (
    <div className="mt-3 grid gap-2">
      {linhas.length > 0 && (
        <ul className="divide-y divide-border rounded border border-border">
          {linhas.map((l, i) => {
            const p = porId.get(l.filho_id);
            return (
              <li key={l.filho_id} className="flex flex-wrap items-center gap-2 px-2 py-1.5">
                <span className="min-w-0 flex-1 text-sm text-foreground">
                  {p?.descricao ?? "…"}{" "}
                  <span className="font-mono text-xs text-muted-foreground">
                    {p?.codigo} · {nomeTipo(p?.tipo_item)}
                  </span>
                </span>
                <label className="flex items-center gap-1 text-xs text-muted-foreground">
                  Quantidade por unidade
                  <input
                    aria-label={`Quantidade por unidade de ${p?.descricao ?? ""}`}
                    inputMode="decimal"
                    className="h-8 w-20 rounded border border-input bg-background px-2 text-right text-sm text-foreground"
                    value={l.quantidade}
                    onChange={(e) => setLinhas((ls) => ls.map((x) => (x.filho_id === l.filho_id ? { ...x, quantidade: e.target.value } : x)))}
                  />
                  {p?.unidade}
                </label>
                <button type="button" aria-label="Subir" disabled={i === 0} onClick={() => mover(i, -1)} className="p-1 disabled:opacity-30">
                  <ArrowUp size={14} />
                </button>
                <button type="button" aria-label="Descer" disabled={i === linhas.length - 1} onClick={() => mover(i, 1)} className="p-1 disabled:opacity-30">
                  <ArrowDown size={14} />
                </button>
                <button type="button" aria-label={`Remover ${p?.descricao ?? ""}`} onClick={() => setLinhas((ls) => ls.filter((x) => x.filho_id !== l.filho_id))} className="p-1 text-destructive">
                  <Trash2 size={14} />
                </button>
              </li>
            );
          })}
        </ul>
      )}
      <div className="flex flex-wrap gap-2">
        <input
          aria-label="Buscar componente existente"
          placeholder="Buscar componente existente (nome, código, família, medida)"
          className={`${input} min-w-[14rem] flex-1`}
          value={busca}
          onChange={(e) => setBusca(e.target.value)}
        />
        <button type="button" className={`${btn} border-primary/50 text-primary`} onClick={onNovo}>
          <Plus size={14} /> Cadastrar componente que falta
        </button>
      </div>
      {busca.trim() && (
        <ul className="divide-y divide-border rounded border border-border">
          {opcoes.length === 0 && <li className="px-2 py-1.5 text-sm text-muted-foreground">Nenhum componente encontrado.</li>}
          {opcoes.map((p) => (
            <li key={p.id}>
              <button
                type="button"
                className="flex w-full flex-wrap items-baseline gap-2 px-2 py-1.5 text-left hover:bg-muted/40"
                onClick={() => {
                  setLinhas((ls) => [...ls, { filho_id: p.id, quantidade: "1" }]);
                  setBusca("");
                }}
              >
                <span className="text-sm text-foreground">{p.descricao}</span>
                <span className="font-mono text-xs text-muted-foreground">
                  {p.codigo} · {nomeTipo(p.tipo_item)}
                </span>
              </button>
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}

function ReclassificarBloco({
  produtoId,
  codigo,
  familia,
  tipo,
  familias,
  pode,
  onDone,
}: {
  produtoId: string;
  codigo: string;
  familia: string;
  tipo: string;
  familias: Familia[];
  pode: boolean;
  onDone: () => void;
}) {
  const fn = useServerFn(reclassificarProduto);
  const qc = useQueryClient();
  const [aberto, setAberto] = useState(false);
  const [nf, setNf] = useState(familia);
  const [nt, setNt] = useState<TipoItem | "">("");
  const [motivo, setMotivo] = useState("");
  const m = useMutation({
    mutationFn: () => fn({ data: { produto_id: produtoId, familia: nf, tipo: nt as TipoItem, motivo } }),
    onSuccess: async () => {
      setAberto(false);
      await qc.invalidateQueries({ queryKey: ["produtos"] });
      onDone();
    },
  });
  const fam = familias.find((x) => x.sigla === familia);
  return (
    <div className="rounded border border-border px-3 py-2 text-sm">
      <div className="flex flex-wrap items-center gap-x-3 gap-y-1">
        <span className="font-mono text-primary">{codigo}</span>
        <span className="text-muted-foreground">
          {nomeTipo(tipo)} · {fam ? `${fam.nome} — ${fam.sigla}` : "família a definir"}
        </span>
        {pode && familia && (
          <button type="button" className="text-xs text-primary underline" onClick={() => setAberto((v) => !v)}>
            Reclassificar família ou tipo
          </button>
        )}
      </div>
      {m.isSuccess && <p className="mt-1 text-xs text-primary">Novo código {m.data.codigo} (anterior {m.data.anterior} registrado).</p>}
      {aberto && (
        <div className="mt-2 grid gap-2 sm:grid-cols-3">
          <p className="text-xs text-muted-foreground sm:col-span-3">
            Gera um código novo da série escolhida. O número antigo não é reutilizado; propostas em rascunho e regras passam a
            usar o novo código; propostas aceitas e documentos emitidos ficam como estão.
          </p>
          <FamiliaPicker id={`recl-${produtoId}`} familias={familias} value={nf} onChange={setNf} />
          <select aria-label="Novo tipo" className={input} value={nt} onChange={(e) => setNt(e.target.value as TipoItem)}>
            <option value="">Novo tipo…</option>
            {TIPOS_GUIADOS.map((t) => (
              <option key={t.valor} value={t.valor}>
                {t.nome}
              </option>
            ))}
          </select>
          <input aria-label="Motivo" className={input} placeholder="Motivo técnico" value={motivo} onChange={(e) => setMotivo(e.target.value)} />
          <div className="sm:col-span-3">
            <button
              type="button"
              disabled={!nf || !nt || motivo.trim().length < 5 || m.isPending}
              className={`${btn} border-primary text-primary`}
              onClick={() => m.mutate()}
            >
              Confirmar reclassificação
            </button>
            {m.isError && <span className="ml-2 text-xs text-destructive">{(m.error as Error).message}</span>}
          </div>
        </div>
      )}
    </div>
  );
}

/** Árvore expansível: nomes, códigos e quantidades (por unidade e totais). */
export function ArvoreEstrutura({
  no,
  multiplicador = 1,
  nivel = 0,
  editavel,
  onQuantidade,
  onRemover,
  caminho = [],
}: {
  no: { produto_id: string; codigo?: string; descricao?: string; unidade?: string; tipo?: string | null; quantidade?: number; base_custo?: string; filhos?: unknown[] };
  multiplicador?: number;
  nivel?: number;
  editavel?: boolean;
  onQuantidade?: (caminho: number[], q: number) => void;
  onRemover?: (caminho: number[]) => void;
  caminho?: number[];
}) {
  const filhos = (no.filhos ?? []) as (typeof no)[];
  if (!filhos.length) return null;
  return (
    <ul className={nivel ? "ml-4 border-l border-border pl-3" : ""}>
      {filhos.map((f, i) => {
        const total = multiplicador * Number(f.quantidade ?? 0);
        const c = [...caminho, i];
        const temFilhos = (f.filhos ?? []).length > 0;
        const linha = (
          <span className="flex flex-wrap items-center gap-x-2 gap-y-1 py-1 text-sm">
            {temFilhos && <ChevronRight size={14} className="nx-tree-chevron" aria-hidden="true" />}
            <span className="text-foreground">{f.descricao}</span>
            <span className="font-mono text-xs text-muted-foreground">
              {f.codigo} · {nomeTipo(f.tipo)}
            </span>
            {editavel && onQuantidade ? (
              <label className="flex items-center gap-1 text-xs text-muted-foreground">
                Qtd. por unidade
                <input
                  aria-label={`Quantidade por unidade de ${f.descricao}`}
                  type="number"
                  min={0.0001}
                  step="any"
                  defaultValue={Number(f.quantidade)}
                  onBlur={(e) => {
                    const q = Number(e.target.value);
                    if (q > 0 && q !== Number(f.quantidade)) onQuantidade(c, q);
                  }}
                  className="h-7 w-16 rounded border border-input bg-background px-1 text-right text-xs text-foreground"
                />
              </label>
            ) : (
              <span className="text-xs text-muted-foreground">{Number(f.quantidade)} por unidade</span>
            )}
            <span className="text-xs font-medium text-foreground">
              = {Number(total.toFixed(4))} {f.unidade}
            </span>
            {editavel && onRemover && (
              <button type="button" aria-label={`Remover ${f.descricao} desta proposta`} className="p-0.5 text-destructive" onClick={() => onRemover(c)}>
                <Trash2 size={12} />
              </button>
            )}
          </span>
        );
        return (
          <li key={`${f.produto_id}-${i}`}>
            {temFilhos ? (
              <details>
                <summary className="cursor-pointer list-none">{linha}</summary>
                {f.base_custo === "completo" && (
                  <p className="ml-5 text-xs text-muted-foreground">Comprado completo: composição apenas informativa.</p>
                )}
                <ArvoreEstrutura no={f} multiplicador={total} nivel={nivel + 1} editavel={editavel} onQuantidade={onQuantidade} onRemover={onRemover} caminho={c} />
              </details>
            ) : (
              linha
            )}
          </li>
        );
      })}
    </ul>
  );
}
