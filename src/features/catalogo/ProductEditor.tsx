import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useServerFn } from "@tanstack/react-start";
import { useEffect, useMemo, useRef, useState } from "react";
import { ArrowDown, ArrowLeft, ArrowUp, ChevronRight, Plus, Trash2 } from "lucide-react";
import {
  Sheet,
  SheetContent,
  SheetDescription,
  SheetHeader,
  SheetTitle,
} from "@/components/ui/sheet";
import "./catalogo.css";

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

const input =
  "h-10 w-full rounded border border-input bg-background px-3 text-sm text-foreground outline-none transition-colors focus:border-primary focus:ring-2 focus:ring-primary/20";
const btn = "inline-flex h-10 items-center gap-1.5 rounded border px-4 text-sm disabled:opacity-50";
const rotulo = "text-sm font-semibold text-foreground";

export const TIPOS_GUIADOS: {
  valor: TipoItem;
  nome: string;
  apoio?: string;
  curto: string;
  explica: string;
}[] = [
  {
    valor: "P",
    nome: "Peça",
    curto: "Individual",
    explica: "Item individual, usado sozinho ou dentro de um conjunto. Código com P.",
  },
  {
    valor: "S",
    nome: "Conjunto soldado",
    apoio: "CJ SD",
    curto: "Processado",
    explica: "Produto formado por peças unidas por solda. Código com S.",
  },
  {
    valor: "M",
    nome: "Montagem",
    curto: "Final",
    explica: "Produto formado pela combinação de peças e/ou conjuntos. Código com M.",
  },
];

export type Familia = {
  sigla: string;
  nome: string;
  grupo: string;
  situacao: string;
  observacao: string | null;
};

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
  return useQuery({
    queryKey: ["permissoes", orgId],
    enabled: !!orgId,
    staleTime: 60_000,
    queryFn: () => fn(),
  });
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
        .select(
          "id,codigo,codigo_legado,descricao,familia,tipo_item,unidade,material,dimensoes,composicao_status",
        )
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
    [
      p.descricao,
      p.codigo,
      p.codigo_legado,
      p.familia,
      nomes.get(p.familia ?? ""),
      p.material,
      p.dimensoes,
    ]
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
        aria-label="Grupo comercial / prefixo do código"
        list={id}
        className={input}
        placeholder="Busque pelo nome ou pela sigla"
        value={texto || (atual ? `${atual.nome} — ${atual.sigla}` : "")}
        onChange={(e) => {
          setTexto(e.target.value);
          const v = e.target.value.trim();
          const sigla = v.includes(" — ")
            ? v.split(" — ").pop()!.trim().toUpperCase()
            : v.toUpperCase();
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
export function sugerirNome(
  e: Pick<Estado, "descricao" | "dimensoes" | "material" | "acabamento">,
) {
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
  submitDisabled,
  submitHint,
  onBusyChange,
  onSaved,
  onCancel,
}: {
  produtoId?: string | undefined;
  tipoInicial?: TipoItem;
  compacto?: boolean;
  rotuloSalvar?: string;
  submitDisabled?: boolean;
  submitHint?: string | undefined;
  onBusyChange?: (busy: boolean) => void;
  onSaved?: (r: {
    id: string;
    codigo: string;
    descricao: string;
    novo: boolean;
  }) => void | Promise<void>;
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
  const [f, setF] = useState<Estado>({
    ...VAZIO,
    tipo: tipoInicial ?? "",
    base_custo: tipoInicial === "P" ? "completo" : "composto",
  });
  const [linhas, setLinhas] = useState<Linha[]>([]);
  const [chave, setChave] = useState(() => crypto.randomUUID());
  const [codigoAtual, setCodigoAtual] = useState<string | null>(null);
  const [subCadastro, setSubCadastro] = useState(false);
  const [subBusy, setSubBusy] = useState(false);
  const [reclassBusy, setReclassBusy] = useState(false);
  const hidratado = useRef<string | null>(null);
  const voltarComposicao = useRef<HTMLDivElement>(null);

  const existente = useQuery({
    queryKey: ["produto-editor", produtoId],
    enabled: !!produtoId,
    queryFn: async () => {
      const [p, e] = await Promise.all([
        supabase.from("produtos").select("*").eq("id", produtoId!).single(),
        supabase
          .from("produto_estrutura")
          .select("filho_id,quantidade,ordem")
          .eq("pai_id", produtoId!)
          .order("ordem"),
      ]);
      if (p.error) throw p.error;
      if (e.error) throw e.error;
      return { p: p.data, e: e.data };
    },
  });
  useEffect(() => {
    const d = existente.data;
    if (!d || hidratado.current === produtoId) return;
    hidratado.current = produtoId ?? null;
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
    setLinhas(
      d.e.map((x) => ({
        filho_id: x.filho_id,
        quantidade: String(x.quantidade).replace(".", ","),
      })),
    );
  }, [existente.data, produtoId]);

  const previa = useQuery({
    queryKey: ["previa_codigo", orgId, f.familia, f.tipo],
    enabled: !produtoId && !!orgId && !!f.familia && !!f.tipo,
    queryFn: async () => {
      const { data, error } = await supabase.rpc("previa_codigo", {
        _org: orgId,
        _familia: f.familia,
        _tipo: f.tipo,
      });
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
      if (submitDisabled) throw new Error(submitHint || "Revise os dados antes de salvar.");
      if (!f.familia && !produtoId)
        throw new Error("Escolha o grupo comercial / prefixo do código.");
      if (f.descricao.trim().length < 2) throw new Error("Informe o nome do produto.");
      if (!f.unidade.trim()) throw new Error("Informe a unidade.");
      const custo = f.custo.trim() ? num(f.custo) : null;
      if (custo !== null && (!Number.isFinite(custo) || custo < 0))
        throw new Error("Custo inválido.");
      const itens = composto
        ? linhas.map((l) => {
            const q = num(l.quantidade);
            if (!Number.isFinite(q) || q <= 0)
              throw new Error("Quantidade por unidade deve ser positiva.");
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
        if (composto)
          await comp({
            data: { produto_id: produtoId, itens, status: itens.length ? "definida" : "pendente" },
          });
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
    if (salvar.isPending || reclassBusy) return;
    salvar.reset();
    setF((x) => ({ ...x, [k]: e.target.value }));
  };
  useEffect(() => {
    onBusyChange?.(salvar.isPending || subBusy || reclassBusy);
  }, [onBusyChange, salvar.isPending, subBusy, reclassBusy]);

  if (produtoId && existente.isPending)
    return (
      <p role="status" className="p-6 text-sm text-muted-foreground">
        Carregando cadastro…
      </p>
    );
  if (produtoId && existente.isError)
    return (
      <div role="alert" className="p-6">
        <p className="text-sm text-destructive">
          Não foi possível abrir este cadastro: {(existente.error as Error).message}
        </p>
        <button type="button" className={btn} onClick={() => existente.refetch()}>
          Tentar novamente
        </button>
      </div>
    );
  const familiaAtual = familias.find((x) => x.sigla === f.familia);
  const retornar = () => {
    setSubCadastro(false);
    setSubBusy(false);
    requestAnimationFrame(() => voltarComposicao.current?.focus());
  };

  return (
    <div className="nx-product-editor" data-compact={compacto || undefined}>
      <form
        hidden={subCadastro}
        onSubmit={(e) => {
          e.preventDefault();
          e.stopPropagation();
          if (!salvar.isPending && !reclassBusy) salvar.mutate();
        }}
      >
        <fieldset className="nx-product-editor-body" disabled={salvar.isPending || reclassBusy}>
          <div className="nx-editor-scope">
            <span>Cadastro mestre</span>
            <p>
              {produtoId
                ? "Alterações no produto reutilizável. Revisões mantêm seus próprios ajustes."
                : "Cadastre o produto uma vez para utilizá-lo no catálogo e nas propostas."}
            </p>
          </div>
          {perms.isPending && (
            <p role="status" className="text-sm text-muted-foreground">
              Verificando permissão de cadastro…
            </p>
          )}
          {perms.isError && (
            <p role="alert" className="text-sm text-destructive">
              Não foi possível verificar sua permissão.{" "}
              <button type="button" className="underline" onClick={() => perms.refetch()}>
                Tentar novamente
              </button>
            </p>
          )}
          {perms.data && !podeSalvar && (
            <p role="note" className="nx-catalog-notice">
              {produtoId
                ? "Você pode consultar este produto. A edição exige permissão de cadastro."
                : "Cadastro restrito a Engenharia, Compras ou Admin. Solicite essa permissão ao administrador."}
            </p>
          )}

          <section className="nx-editor-section" aria-label="Identificação do produto">
            <h3>Identificação</h3>
            <label className="grid gap-1.5">
              <span className={rotulo}>Nome do produto</span>
              <input
                autoFocus
                required
                minLength={2}
                maxLength={300}
                aria-label="Nome do produto"
                className={input}
                value={f.descricao}
                onChange={set("descricao")}
                placeholder="Nome que identifica o produto comercialmente"
              />
              {sugestao && sugestao !== f.descricao && (
                <button
                  type="button"
                  className="justify-self-start text-left text-sm text-primary underline"
                  onClick={() => setF((x) => ({ ...x, descricao: sugestao }))}
                >
                  Usar “{sugestao}”
                </button>
              )}
            </label>
            {!produtoId ? (
              <fieldset className="mt-4">
                <legend className={`mb-2 ${rotulo}`}>Tipo de item</legend>
                <div className="nx-product-types">
                  {TIPOS_GUIADOS.map((t) => (
                    <label key={t.valor} data-selected={f.tipo === t.valor}>
                      <input
                        type="radio"
                        name={`tipo-${chave}`}
                        checked={f.tipo === t.valor}
                        onChange={() =>
                          setF((x) => ({
                            ...x,
                            tipo: t.valor,
                            base_custo:
                              t.valor === "P"
                                ? "completo"
                                : x.tipo === "P"
                                  ? "composto"
                                  : x.base_custo,
                          }))
                        }
                      />
                      <span>
                        <strong>{t.nome}</strong>
                        <small>{t.explica}</small>
                      </span>
                    </label>
                  ))}
                </div>
              </fieldset>
            ) : (
              <div className="mt-4">
                <ReclassificarBloco
                  produtoId={produtoId}
                  codigo={codigoAtual ?? ""}
                  familia={f.familia}
                  tipo={f.tipo}
                  familias={familias}
                  pode={!!perms.data?.aprovar_tecnica}
                  onBusyChange={setReclassBusy}
                  onDone={(identidade) => {
                    salvar.reset();
                    setCodigoAtual(identidade.codigo);
                    setF((draft) => ({
                      ...draft,
                      familia: identidade.familia,
                      tipo: identidade.tipo,
                    }));
                    void existente.refetch();
                  }}
                />
              </div>
            )}
          </section>

          <section className="nx-editor-section" aria-label="Classificação do produto">
            <h3>Classificação</h3>
            {!produtoId && (
              <label className="grid gap-1.5">
                <span className={rotulo}>Grupo comercial / prefixo do código</span>
                <FamiliaPicker
                  id={`familia-${chave}`}
                  familias={familias}
                  value={f.familia}
                  onChange={(v) => setF((x) => ({ ...x, familia: v }))}
                />
                <span className="text-sm text-muted-foreground">
                  Define o prefixo e a série de numeração. A aplicação técnica é uma classificação
                  independente.
                </span>
              </label>
            )}
            {fam.isError && (
              <p role="alert" className="text-sm text-destructive">
                Não foi possível consultar os grupos.{" "}
                <button type="button" className="underline" onClick={() => fam.refetch()}>
                  Tentar novamente
                </button>
              </p>
            )}
            {familiaAtual?.situacao === "a_confirmar" && (
              <p className="mt-2 text-sm text-warning">{familiaAtual.observacao}</p>
            )}
            {!produtoId && (
              <div className="nx-code-preview">
                <span>Prévia do código</span>
                <strong className="font-mono">
                  {previa.isFetching
                    ? "Consultando…"
                    : (previa.data ?? "Selecione o grupo e o tipo")}
                </strong>
                <span>Confirmado ao salvar · a prévia não reserva o número.</span>
                {previa.isError && (
                  <p role="alert" className="text-destructive">
                    Prévia indisponível. O código definitivo é gerado ao salvar.
                  </p>
                )}
              </div>
            )}
            <div className="mt-3 text-sm">
              <span className="font-semibold">
                Família técnica{" "}
                <span className="font-normal text-muted-foreground">· opcional</span>
              </span>
              <p className="text-muted-foreground">
                {existente.data?.p.familia_tecnica
                  ? `${familias.find((grupo) => grupo.sigla === existente.data.p.familia_tecnica)?.nome ?? existente.data.p.familia_tecnica} — ${existente.data.p.familia_tecnica}`
                  : "Não informada"}
              </p>
              <p className="mt-1 text-muted-foreground">
                Classificação independente do prefixo. A edição opcional está disponível na ficha do
                produto.
              </p>
            </div>
            <details className="nx-editor-details">
              <summary>Características técnicas</summary>
              <div className="grid gap-4 pt-3 sm:grid-cols-3">
                {(
                  [
                    ["material", "Material"],
                    ["dimensoes", "Dimensões"],
                    ["acabamento", "Acabamento"],
                  ] as const
                ).map(([key, label]) => (
                  <label key={key} className="grid gap-1.5">
                    <span className={rotulo}>{label}</span>
                    <input
                      aria-label={label}
                      maxLength={120}
                      className={input}
                      value={f[key]}
                      onChange={set(key)}
                    />
                  </label>
                ))}
              </div>
            </details>
          </section>

          <section className="nx-editor-section" aria-label="Fornecimento do produto">
            <h3>Fornecimento</h3>
            <div className="grid gap-4 sm:grid-cols-3">
              <label className="grid gap-1.5">
                <span className={rotulo}>Modalidade</span>
                <select
                  aria-label="Fornecimento"
                  className={input}
                  value={f.modalidade}
                  onChange={set("modalidade")}
                >
                  <option value="comprar">Comprar</option>
                  <option value="fabricar">Fabricar</option>
                  <option value="terceirizar">Terceirizar</option>
                </select>
              </label>
              <label className="grid gap-1.5">
                <span className={rotulo}>Unidade</span>
                <input
                  required
                  maxLength={10}
                  aria-label="Unidade"
                  className={input}
                  value={f.unidade}
                  onChange={set("unidade")}
                />
              </label>
              <label className="grid gap-1.5">
                <span className={rotulo}>
                  NCM <span className="font-normal text-muted-foreground">· opcional</span>
                </span>
                <input
                  maxLength={20}
                  aria-label="NCM"
                  className={input}
                  value={f.ncm}
                  onChange={set("ncm")}
                />
              </label>
            </div>
            {verCusto && !produtoId && (
              <label className="mt-4 grid max-w-sm gap-1.5">
                <span className={rotulo}>Referência inicial de custo unitário (R$)</span>
                <input
                  aria-label="Custo"
                  inputMode="decimal"
                  className={`${input} tabular-nums`}
                  value={f.custo}
                  onChange={set("custo")}
                  placeholder="Deixe vazio se desconhecido"
                />
                <span className="text-sm text-muted-foreground">
                  Vazio: sem referência. Zero: R$ 0,00 informado.
                </span>
              </label>
            )}
          </section>

          {composto && (
            <section className="nx-editor-section" aria-label="Composição do produto">
              <div tabIndex={-1} ref={voltarComposicao} className="outline-none">
                <h3>Composição</h3>
              </div>
              <p className="mb-3 text-sm text-muted-foreground">
                Componentes e quantidades por 1 {f.descricao || "unidade do produto"}.
              </p>
              <fieldset className="nx-cost-basis">
                <legend className="sr-only">Base de custo</legend>
                <label>
                  <input
                    type="radio"
                    name={`base-custo-${chave}`}
                    checked={f.base_custo === "composto"}
                    onChange={() => setF((x) => ({ ...x, base_custo: "composto" }))}
                  />
                  <span>
                    <strong>Custo por composição</strong>
                    <small>Os componentes participam da formação do custo.</small>
                  </span>
                </label>
                <label>
                  <input
                    type="radio"
                    name={`base-custo-${chave}`}
                    checked={f.base_custo === "completo"}
                    onChange={() => setF((x) => ({ ...x, base_custo: "completo" }))}
                  />
                  <span>
                    <strong>Produto comprado completo</strong>
                    <small>Componentes internos informativos; o custo está no produto.</small>
                  </span>
                </label>
              </fieldset>
              <ComposicaoEditor
                linhas={linhas}
                setLinhas={setLinhas}
                excluir={produtoId}
                tipoPai={f.tipo as TipoItem}
                nomePai={f.descricao}
                onNovo={() => setSubCadastro(true)}
              />
              {!linhas.length && (
                <p className="mt-3 text-sm text-warning">
                  Sem componentes: o produto será salvo com composição pendente.
                </p>
              )}
            </section>
          )}
        </fieldset>
        <div className="nx-product-editor-footer">
          {salvar.isSuccess && (
            <p role="status" className="basis-full text-sm text-primary">
              {salvar.data.novo ? (
                <>
                  Produto cadastrado. Código confirmado:{" "}
                  <strong className="font-mono">{salvar.data.codigo}</strong>.
                </>
              ) : (
                <>
                  Cadastro salvo. Código <strong className="font-mono">{salvar.data.codigo}</strong>
                  .
                </>
              )}
            </p>
          )}
          {salvar.isError && (
            <p role="alert" className="basis-full text-sm text-destructive">
              {(salvar.error as Error).message}
            </p>
          )}
          {submitDisabled && submitHint && (
            <p role="status" className="basis-full text-sm text-warning">
              {submitHint}
            </p>
          )}
          {onCancel && (
            <button
              type="button"
              disabled={salvar.isPending || reclassBusy}
              className={`${btn} border-border text-foreground`}
              onClick={onCancel}
            >
              Cancelar
            </button>
          )}
          <button
            type="submit"
            disabled={salvar.isPending || reclassBusy || !podeSalvar || !f.tipo || submitDisabled}
            className={`${btn} border-primary bg-primary font-semibold text-primary-foreground`}
          >
            {salvar.isPending
              ? "Salvando…"
              : (rotuloSalvar ?? (produtoId ? "Salvar cadastro" : "Cadastrar item"))}
          </button>
        </div>
      </form>
      {subCadastro && (
        <div>
          <div className="nx-subproduct-context">
            <button
              type="button"
              className="inline-flex items-center gap-2 text-sm font-semibold"
              disabled={subBusy}
              onClick={retornar}
            >
              <ArrowLeft size={16} />
              Voltar para {f.descricao || "o produto principal"}
            </button>
            <p className="mt-2 text-sm text-muted-foreground">
              Cadastrar componente faltante · o preenchimento do produto principal está preservado.
            </p>
          </div>
          <ProductEditor
            compacto
            tipoInicial="P"
            onBusyChange={setSubBusy}
            rotuloSalvar="Cadastrar e adicionar à composição"
            onCancel={retornar}
            onSaved={(r) => {
              setLinhas((ls) =>
                ls.some((l) => l.filho_id === r.id)
                  ? ls
                  : [...ls, { filho_id: r.id, quantidade: "1" }],
              );
              retornar();
            }}
          />
        </div>
      )}
    </div>
  );
}

export function ProductEditorPanel({
  open,
  onOpenChange,
  title,
  description,
  ...props
}: Parameters<typeof ProductEditor>[0] & {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  title?: string;
  description?: string;
}) {
  const [busy, setBusy] = useState(false);
  return (
    <Sheet
      open={open}
      onOpenChange={(next) => {
        if (!busy) onOpenChange(next);
      }}
    >
      <SheetContent
        className="nexus-operational nx-catalog-shell nx-product-panel"
        onEscapeKeyDown={(event) => {
          if (busy) event.preventDefault();
        }}
        onInteractOutside={(event) => event.preventDefault()}
      >
        <SheetHeader className="nx-product-panel-heading">
          <SheetTitle className="font-display text-xl">
            {title ?? (props.produtoId ? "Editar cadastro mestre" : "Cadastrar item")}
          </SheetTitle>
          <SheetDescription>
            {description ?? "Produto reutilizável no catálogo e nas propostas."}
          </SheetDescription>
        </SheetHeader>
        <div className="nx-product-panel-scroll">
          <ProductEditor
            {...props}
            onBusyChange={(value) => {
              setBusy(value);
              props.onBusyChange?.(value);
            }}
            onCancel={props.onCancel ?? (() => onOpenChange(false))}
          />
        </div>
      </SheetContent>
    </Sheet>
  );
}

function ComposicaoEditor({
  linhas,
  setLinhas,
  excluir,
  tipoPai,
  nomePai,
  onNovo,
}: {
  linhas: Linha[];
  setLinhas: (f: (l: Linha[]) => Linha[]) => void;
  excluir?: string | undefined;
  tipoPai: TipoItem;
  nomePai: string;
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
    <div className="nx-composition-editor mt-3 grid gap-3">
      {linhas.length > 0 && (
        <ul className="divide-y divide-border rounded border border-border">
          {linhas.map((l, i) => {
            const p = porId.get(l.filho_id);
            return (
              <li key={l.filho_id} className="flex flex-wrap items-center gap-2 px-2 py-1.5">
                <span className="min-w-0 flex-1 text-sm text-foreground">
                  {p?.descricao ?? "…"}{" "}
                  <span className="block font-mono text-sm text-muted-foreground">
                    {p?.codigo} · {nomeTipo(p?.tipo_item)}
                  </span>
                </span>
                <label className="flex flex-wrap items-center gap-2 text-sm text-muted-foreground">
                  Por 1 {nomePai || "produto pai"}
                  <input
                    aria-label={`Quantidade de ${p?.descricao ?? "componente"} por 1 ${nomePai || "produto pai"}`}
                    inputMode="decimal"
                    className="h-10 w-24 rounded border border-input bg-background px-2 text-right text-sm tabular-nums text-foreground"
                    value={l.quantidade}
                    onChange={(e) =>
                      setLinhas((ls) =>
                        ls.map((x) =>
                          x.filho_id === l.filho_id ? { ...x, quantidade: e.target.value } : x,
                        ),
                      )
                    }
                  />
                  {p?.unidade}
                </label>
                <button
                  type="button"
                  aria-label={`Subir ${p?.descricao ?? "componente"}`}
                  disabled={i === 0}
                  onClick={() => mover(i, -1)}
                  className="nx-composition-icon disabled:opacity-30"
                >
                  <ArrowUp size={14} />
                </button>
                <button
                  type="button"
                  aria-label={`Descer ${p?.descricao ?? "componente"}`}
                  disabled={i === linhas.length - 1}
                  onClick={() => mover(i, 1)}
                  className="nx-composition-icon disabled:opacity-30"
                >
                  <ArrowDown size={14} />
                </button>
                <button
                  type="button"
                  aria-label={`Remover ${p?.descricao ?? ""}`}
                  onClick={() => setLinhas((ls) => ls.filter((x) => x.filho_id !== l.filho_id))}
                  className="nx-composition-icon text-destructive"
                >
                  <Trash2 size={14} />
                </button>
              </li>
            );
          })}
        </ul>
      )}
      <div className="flex flex-wrap gap-2">
        <input
          type="search"
          aria-label="Buscar componente existente"
          placeholder="Buscar componente existente (nome, código, grupo, medida)"
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
          {cat.isPending && (
            <li role="status" className="text-sm text-muted-foreground">
              Carregando componentes…
            </li>
          )}
          {cat.isError && (
            <li role="alert" className="text-sm text-destructive">
              Não foi possível consultar os componentes.{" "}
              <button type="button" className="underline" onClick={() => cat.refetch()}>
                Tentar novamente
              </button>
            </li>
          )}
          {!cat.isPending && !cat.isError && opcoes.length === 0 && (
            <li className="px-2 py-1.5 text-sm text-muted-foreground">
              Nenhum componente encontrado.
            </li>
          )}
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
                <span className="font-mono text-sm text-muted-foreground">
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
  onBusyChange,
}: {
  produtoId: string;
  codigo: string;
  familia: string;
  tipo: string;
  familias: Familia[];
  pode: boolean;
  onDone: (identidade: { codigo: string; familia: string; tipo: TipoItem }) => void;
  onBusyChange: (busy: boolean) => void;
}) {
  const fn = useServerFn(reclassificarProduto);
  const qc = useQueryClient();
  const [aberto, setAberto] = useState(false);
  const [nf, setNf] = useState(familia);
  const [nt, setNt] = useState<TipoItem | "">("");
  const [motivo, setMotivo] = useState("");
  const m = useMutation({
    mutationFn: () =>
      fn({ data: { produto_id: produtoId, familia: nf, tipo: nt as TipoItem, motivo } }),
    onSuccess: async (resultado) => {
      setAberto(false);
      onDone({ codigo: resultado.codigo, familia: nf, tipo: nt as TipoItem });
      await Promise.all([
        qc.invalidateQueries({ queryKey: ["produtos"] }),
        qc.invalidateQueries({ queryKey: ["catalogo-busca"] }),
        qc.invalidateQueries({ queryKey: ["series_codigo"] }),
        qc.invalidateQueries({ queryKey: ["previa_codigo"] }),
        qc.invalidateQueries({ queryKey: ["arvore"] }),
      ]);
    },
  });
  useEffect(() => {
    onBusyChange(m.isPending);
  }, [m.isPending, onBusyChange]);
  const fam = familias.find((x) => x.sigla === familia);
  return (
    <div className="rounded border border-border px-3 py-2 text-sm">
      <div className="flex flex-wrap items-center gap-x-3 gap-y-1">
        <span className="font-mono text-primary">{codigo}</span>
        <span className="text-muted-foreground">
          {nomeTipo(tipo)} · {fam ? `${fam.nome} — ${fam.sigla}` : "grupo comercial a definir"}
        </span>
        {pode && familia && (
          <button
            type="button"
            className="text-xs text-primary underline"
            onClick={() => setAberto((v) => !v)}
          >
            Reclassificar grupo comercial ou tipo
          </button>
        )}
      </div>
      {m.isSuccess && (
        <p className="mt-1 text-xs text-primary">
          Novo código {m.data.codigo} (anterior {m.data.anterior} registrado).
        </p>
      )}
      {aberto && (
        <div className="mt-2 grid gap-2 sm:grid-cols-3">
          <p className="text-xs text-muted-foreground sm:col-span-3">
            Gera um código novo da série escolhida. O número antigo não é reutilizado; propostas em
            rascunho e regras passam a usar o novo código; propostas aceitas e documentos emitidos
            ficam como estão.
          </p>
          <FamiliaPicker id={`recl-${produtoId}`} familias={familias} value={nf} onChange={setNf} />
          <select
            aria-label="Novo tipo"
            className={input}
            value={nt}
            onChange={(e) => setNt(e.target.value as TipoItem)}
          >
            <option value="">Novo tipo…</option>
            {TIPOS_GUIADOS.map((t) => (
              <option key={t.valor} value={t.valor}>
                {t.nome}
              </option>
            ))}
          </select>
          <input
            aria-label="Motivo"
            className={input}
            placeholder="Motivo técnico"
            value={motivo}
            onChange={(e) => setMotivo(e.target.value)}
          />
          <div className="sm:col-span-3">
            <button
              type="button"
              disabled={!nf || !nt || motivo.trim().length < 5 || m.isPending}
              className={`${btn} border-primary text-primary`}
              onClick={() => m.mutate()}
            >
              Confirmar reclassificação
            </button>
            {m.isError && (
              <span className="ml-2 text-xs text-destructive">{(m.error as Error).message}</span>
            )}
          </div>
        </div>
      )}
    </div>
  );
}

/** Quantidades da estrutura: a multiplicação é apenas desta composição, nunca um total da proposta. */
type NoEstrutura = {
  produto_id: string;
  codigo?: string;
  descricao?: string;
  unidade?: string;
  tipo?: string | null;
  quantidade?: number;
  base_custo?: string;
  filhos?: unknown[];
};
type ArvoreProps = {
  no: NoEstrutura;
  multiplicador?: number;
  nivel?: number;
  editavel?: boolean | undefined;
  onQuantidade?: ((caminho: number[], q: number) => void) | undefined;
  onRemover?: ((caminho: number[]) => void) | undefined;
  caminho?: number[];
};
export function ArvoreEstrutura({
  no,
  multiplicador = 1,
  nivel = 0,
  editavel,
  onQuantidade,
  onRemover,
  caminho = [],
}: ArvoreProps) {
  const filhos = (no.filhos ?? []) as NoEstrutura[];
  if (!filhos.length) return null;
  return (
    <ul className={`nx-composition-tree ${nivel ? "nx-composition-tree-child" : ""}`}>
      {filhos.map((filho, index) => (
        <LinhaEstrutura
          key={`${filho.produto_id}-${index}`}
          no={filho}
          pai={no.descricao || "produto pai"}
          multiplicador={multiplicador}
          nivel={nivel}
          editavel={editavel}
          onQuantidade={onQuantidade}
          onRemover={onRemover}
          caminho={[...caminho, index]}
        />
      ))}
    </ul>
  );
}
function LinhaEstrutura({
  no,
  pai,
  multiplicador = 1,
  nivel = 0,
  editavel,
  onQuantidade,
  onRemover,
  caminho = [],
}: ArvoreProps & { pai: string }) {
  const [expandido, setExpandido] = useState(false);
  const temFilhos = (no.filhos ?? []).length > 0;
  const total = multiplicador * Number(no.quantidade ?? 0);
  return (
    <li>
      <div className="nx-composition-tree-row">
        <div className="nx-composition-tree-identity">
          {temFilhos ? (
            <button
              type="button"
              aria-expanded={expandido}
              aria-label={`${expandido ? "Recolher" : "Expandir"} composição de ${no.descricao}`}
              onClick={() => setExpandido((v) => !v)}
              className="nx-composition-icon"
            >
              <ChevronRight size={16} className={expandido ? "rotate-90" : ""} />
            </button>
          ) : (
            <span className="nx-composition-leaf" aria-hidden="true">
              └
            </span>
          )}
          <div className="min-w-0">
            <span className="block font-medium text-foreground">
              {no.descricao || "Componente sem descrição"}
            </span>
            <span className="font-mono text-sm text-muted-foreground">{no.codigo}</span>
            <span className="ml-2 text-sm text-muted-foreground">{nomeTipo(no.tipo)}</span>
          </div>
        </div>
        <div className="nx-composition-tree-quantities">
          <label className="grid gap-1 text-sm text-muted-foreground">
            <span>Por 1 {pai}</span>
            {editavel && onQuantidade ? (
              <input
                key={Number(no.quantidade)}
                aria-label={`Quantidade de ${no.descricao} por 1 ${pai}`}
                type="number"
                min={0.0001}
                step="any"
                defaultValue={Number(no.quantidade)}
                onBlur={(event) => {
                  const q = Number(event.target.value);
                  if (q > 0 && Number.isFinite(q)) {
                    if (q !== Number(no.quantidade)) onQuantidade(caminho, q);
                  } else event.target.value = String(no.quantidade ?? "");
                }}
                className="h-10 w-24 rounded border border-input bg-background px-2 text-right text-sm tabular-nums text-foreground"
              />
            ) : (
              <span className="tabular-nums text-foreground">
                {Number(no.quantidade)} {no.unidade}
              </span>
            )}
          </label>
          <div className="grid gap-1 text-sm text-muted-foreground">
            <span>Nesta composição</span>
            <strong className="tabular-nums text-foreground">
              {Number(total.toFixed(4))} {no.unidade}
            </strong>
          </div>
          {editavel && onRemover && (
            <button
              type="button"
              aria-label={`Remover ${no.descricao} desta revisão`}
              className="nx-composition-icon text-destructive"
              onClick={() => onRemover(caminho)}
            >
              <Trash2 size={16} />
            </button>
          )}
        </div>
      </div>
      {temFilhos && expandido && (
        <>
          <p className="mx-3 mb-2 text-sm text-muted-foreground">
            {no.base_custo === "completo"
              ? "Produto comprado completo: componentes internos informativos."
              : no.base_custo === "composto"
                ? "Custo por composição: componentes participam da formação do custo."
                : "Base de custo não informada nesta estrutura."}
          </p>
          <ArvoreEstrutura
            no={no}
            multiplicador={total}
            nivel={nivel + 1}
            editavel={editavel}
            onQuantidade={onQuantidade}
            onRemover={onRemover}
            caminho={caminho}
          />
        </>
      )}
    </li>
  );
}
