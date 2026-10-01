import { createFileRoute, Link } from "@tanstack/react-router";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useServerFn } from "@tanstack/react-start";
import { useMemo, useState } from "react";

import {
  ActionButton,
  EmptyState,
  PageHeader,
  QueryView,
  Section,
} from "@/components/nexus/Page";
import { supabase } from "@/integrations/supabase/client";
import { useOrg } from "@/features/org/session";
import { importarModeloPlanilha } from "@/features/propostas/propostas.functions";
import { cadastrarProduto, recodificarProduto } from "@/features/catalogo/catalogo.functions";
import { TIPOS_ITEM, nomeTipo, type TipoItem } from "@/features/catalogo/codigos";
import { brlUnit } from "@/lib/format";

export const Route = createFileRoute("/_authenticated/produtos/")({
  head: () => ({
    meta: [
      { title: "Produtos e Soluções — Sistema Nexus" },
      {
        name: "description",
        content: "Catálogo de componentes por família técnica com códigos NXS automáticos.",
      },
      { property: "og:title", content: "Produtos e Soluções — Sistema Nexus" },
      { property: "og:description", content: "Catálogo de componentes codificados." },
    ],
  }),
  component: Produtos,
});

type Familia = { sigla: string; nome: string; grupo: string; situacao: string; observacao: string | null };

export function useFamilias() {
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

function useProdutos(orgId: string) {
  return useQuery({
    queryKey: ["produtos", orgId],
    enabled: !!orgId,
    queryFn: async () => {
      const { data, error } = await supabase
        .from("produtos")
        .select(
          "id,codigo,codigo_legado,familia,tipo_item,descricao,unidade,ncm,modalidade,ativo,fabricantes(nome),produto_custos(custo,vigencia,created_at)",
        )
        .eq("organization_id", orgId)
        .order("codigo");
      if (error) throw error;
      return data.map((p) => {
        const c = [...(p.produto_custos ?? [])].sort((a, b) =>
          a.vigencia === b.vigencia
            ? b.created_at.localeCompare(a.created_at)
            : b.vigencia.localeCompare(a.vigencia),
        )[0];
        return { ...p, custo: c ? Number(c.custo) : null };
      });
    },
  });
}

function useSeries(orgId: string) {
  return useQuery({
    queryKey: ["series_codigo", orgId],
    enabled: !!orgId,
    queryFn: async () => {
      const [pl, sc, pr] = await Promise.all([
        supabase.from("series_planilha").select("familia,tipo,ultimo,pendencia"),
        supabase.from("series_codigo").select("familia,tipo,ultimo").eq("organization_id", orgId),
        supabase
          .from("produtos")
          .select("familia,tipo_item,sequencia")
          .eq("organization_id", orgId)
          .not("sequencia", "is", null),
      ]);
      if (pl.error) throw pl.error;
      if (sc.error) throw sc.error;
      if (pr.error) throw pr.error;
      const m = new Map<string, { familia: string; tipo: string; ultimo: number; pendencia: string | null }>();
      const up = (f: string, t: string, n: number, pend?: string | null) => {
        const k = `${f}-${t}`;
        const cur = m.get(k) ?? { familia: f, tipo: t, ultimo: 0, pendencia: null };
        cur.ultimo = Math.max(cur.ultimo, n);
        if (pend) cur.pendencia = pend;
        m.set(k, cur);
      };
      pl.data.forEach((s) => up(s.familia, s.tipo, s.ultimo, s.pendencia));
      sc.data.forEach((s) => up(s.familia, s.tipo, s.ultimo));
      pr.data.forEach((s) => up(s.familia!, s.tipo_item!, s.sequencia!));
      return [...m.values()];
    },
  });
}

const input = "h-9 rounded border border-input bg-background px-2 text-sm text-foreground";

function FamiliaPicker({
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
        className={`${input} w-full`}
        placeholder="Buscar família (ex.: SRG, guarda-corpo)"
        value={texto || (atual ? `${atual.sigla} — ${atual.nome}` : "")}
        onChange={(e) => {
          setTexto(e.target.value);
          const sigla = e.target.value.split(" — ")[0]!.trim().toUpperCase();
          onChange(familias.some((f) => f.sigla === sigla) ? sigla : "");
        }}
        onBlur={() => setTexto("")}
      />
      <datalist id={id}>
        {familias.map((f) => (
          <option key={f.sigla} value={`${f.sigla} — ${f.nome}`}>
            {f.grupo}
          </option>
        ))}
      </datalist>
    </>
  );
}

function Produtos() {
  const org = useOrg();
  const orgId = org.data?.orgId ?? "";
  const admin = org.data?.isAdmin ?? false;
  const verCusto = org.data?.canSeeCosts ?? false;
  const fam = useFamilias();
  const q = useProdutos(orgId);
  const series = useSeries(orgId);
  const qc = useQueryClient();
  const imp = useServerFn(importarModeloPlanilha);
  const importar = useMutation({
    mutationFn: () => imp(),
    onSuccess: () => qc.invalidateQueries({ queryKey: ["produtos", orgId] }),
  });
  const familias = fam.data ?? [];
  const nomeFam = (s: string | null) => familias.find((f) => f.sigla === s)?.nome ?? "";

  const [busca, setBusca] = useState("");
  const [fFam, setFFam] = useState("");
  const [fTipo, setFTipo] = useState("");
  const [aberto, setAberto] = useState<string | null>(null);
  const linhas = useMemo(() => {
    const t = busca.trim().toLowerCase();
    return (q.data ?? []).filter(
      (p) =>
        (!t ||
          p.codigo.toLowerCase().includes(t) ||
          p.descricao.toLowerCase().includes(t) ||
          (p.codigo_legado ?? "").toLowerCase().includes(t)) &&
        (!fFam || p.familia === fFam || (fFam === "__pend" && !p.familia)) &&
        (!fTipo || p.tipo_item === fTipo),
    );
  }, [q.data, busca, fFam, fTipo]);
  const pendentes = (q.data ?? []).filter((p) => !p.familia);

  return (
    <div className="space-y-6">
      <PageHeader
        eyebrow="Produtos e Soluções"
        title="Catálogo de componentes"
        description="Códigos no padrão [FAMÍLIA]-NXS-[TIPO][SEQ], gerados pelo sistema ao salvar."
        actions={
          admin ? (
            <ActionButton variant="ghost" loading={importar.isPending} onClick={() => importar.mutate()}>
              Importar biblioteca da planilha modelo
            </ActionButton>
          ) : null
        }
      />
      {importar.isSuccess && (
        <p className="text-sm text-primary">
          Importação concluída: {importar.data.inseridos} componente(s) novo(s).
          {importar.data.pendentes.length > 0 &&
            ` Aguardando classificação: ${importar.data.pendentes.join(", ")}.`}
        </p>
      )}
      {importar.isError && (
        <p className="text-sm text-destructive">
          {importar.error instanceof Error ? importar.error.message : "Falha na importação"}
        </p>
      )}

      <NovoProduto familias={familias} orgId={orgId} />

      {pendentes.length > 0 && admin && (
        <Section
          title="Códigos aguardando definição"
          description="Itens sem correspondência segura. Escolha família e tipo para gerar o código definitivo."
        >
          <ul className="space-y-2">
            {pendentes.map((p) => (
              <Pendente key={p.id} p={p} familias={familias} orgId={orgId} />
            ))}
          </ul>
        </Section>
      )}

      <Section title="Componentes" description="Toque em um item para ver detalhes.">
        <div className="mb-3 grid gap-2 sm:grid-cols-[1fr_auto_auto]">
          <input
            aria-label="Buscar por código ou descrição"
            placeholder="Buscar por código ou descrição"
            className={input}
            value={busca}
            onChange={(e) => setBusca(e.target.value)}
          />
          <select aria-label="Filtrar família" className={input} value={fFam} onChange={(e) => setFFam(e.target.value)}>
            <option value="">Todas as famílias</option>
            {familias.map((f) => (
              <option key={f.sigla} value={f.sigla}>
                {f.sigla} — {f.nome}
              </option>
            ))}
            <option value="__pend">Código pendente</option>
          </select>
          <select aria-label="Filtrar tipo" className={input} value={fTipo} onChange={(e) => setFTipo(e.target.value)}>
            <option value="">Todos os tipos</option>
            {TIPOS_ITEM.map((t) => (
              <option key={t.valor} value={t.valor}>
                {t.nome}
              </option>
            ))}
          </select>
        </div>
        <QueryView
          query={q}
          empty={<EmptyState title="Catálogo vazio" hint="Cadastre um componente ou importe a biblioteca da planilha modelo." />}
        >
          {() =>
            linhas.length === 0 ? (
              <p className="text-sm text-muted-foreground">Nenhum componente com esses filtros.</p>
            ) : (
              <ul className="divide-y divide-border rounded border border-border">
                {linhas.map((p) => {
                  const open = aberto === p.id;
                  return (
                    <li key={p.id}>
                      <button
                        type="button"
                        aria-expanded={open}
                        onClick={() => setAberto(open ? null : p.id)}
                        className="flex w-full flex-wrap items-baseline gap-x-3 gap-y-1 px-3 py-2.5 text-left hover:bg-muted/40"
                      >
                        <span className="font-mono text-sm font-semibold text-primary">{p.codigo}</span>
                        <span className="min-w-0 flex-1 text-sm text-foreground">{p.descricao}</span>
                        <span className="text-xs text-muted-foreground">
                          {p.familia ? `${nomeTipo(p.tipo_item)} · ${p.unidade}` : "Código pendente"}
                        </span>
                      </button>
                      {open && (
                        <dl className="grid gap-x-6 gap-y-1 bg-muted/20 px-3 pb-3 pt-1 text-sm sm:grid-cols-2">
                          <Info k="Família" v={p.familia ? `${p.familia} — ${nomeFam(p.familia)}` : "A definir"} />
                          <Info k="Tipo" v={nomeTipo(p.tipo_item)} />
                          <Info k="Código anterior" v={p.codigo_legado ?? "—"} />
                          <Info k="Suprimento" v={p.modalidade} />
                          <Info k="Fabricante" v={(p.fabricantes as { nome: string } | null)?.nome ?? "—"} />
                          <Info k="NCM" v={p.ncm ?? "—"} />
                          {verCusto && <Info k="Custo vigente" v={brlUnit(p.custo)} />}
                          <div className="sm:col-span-2">
                            <Link
                              to="/produtos/$produtoId"
                              params={{ produtoId: p.id }}
                              className="text-sm font-medium text-primary underline-offset-2 hover:underline"
                            >
                              Abrir ficha e histórico de custos
                            </Link>
                          </div>
                        </dl>
                      )}
                    </li>
                  );
                })}
              </ul>
            )
          }
        </QueryView>
      </Section>

      <Section title="Famílias e séries" description="Último número reservado por família e tipo. Lacunas históricas não são reutilizadas.">
        <details>
          <summary className="cursor-pointer text-sm text-primary">Mostrar séries</summary>
          <QueryView query={series}>
            {(rows) => (
              <div className="mt-2 overflow-x-auto">
                <table className="w-full text-sm">
                  <thead className="text-left text-xs text-muted-foreground">
                    <tr>
                      <th className="py-1 pr-3">Família</th>
                      <th className="py-1 pr-3">Tipo</th>
                      <th className="py-1 pr-3">Último</th>
                      <th className="py-1 pr-3">Próximo</th>
                      <th className="py-1">Pendência</th>
                    </tr>
                  </thead>
                  <tbody>
                    {familias.flatMap((f) =>
                      rows
                        .filter((r) => r.familia === f.sigla)
                        .sort((a, b) => "MSP".indexOf(a.tipo) - "MSP".indexOf(b.tipo))
                        .map((r) => (
                          <tr key={`${r.familia}${r.tipo}`} className="border-t border-border">
                            <td className="py-1 pr-3">
                              <span className="font-mono">{f.sigla}</span>{" "}
                              <span className="text-muted-foreground">{f.nome}</span>
                            </td>
                            <td className="py-1 pr-3">{nomeTipo(r.tipo)}</td>
                            <td className="py-1 pr-3 font-mono">{String(r.ultimo).padStart(3, "0")}</td>
                            <td className="py-1 pr-3 font-mono">
                              {f.sigla}-NXS-{r.tipo}
                              {String(r.ultimo + 1).padStart(3, "0")}
                            </td>
                            <td className="py-1 text-xs text-amber-600 dark:text-amber-400">
                              {r.pendencia ?? (f.situacao === "a_confirmar" ? f.observacao : "")}
                            </td>
                          </tr>
                        )),
                    )}
                  </tbody>
                </table>
                <p className="mt-2 text-xs text-muted-foreground">
                  Séries sem histórico começam em 001.
                </p>
              </div>
            )}
          </QueryView>
        </details>
      </Section>
    </div>
  );
}

function Info({ k, v }: { k: string; v: string }) {
  return (
    <div className="flex gap-2">
      <dt className="text-muted-foreground">{k}:</dt>
      <dd className="capitalize-first text-foreground">{v}</dd>
    </div>
  );
}

function usePrevia(orgId: string, familia: string, tipo: string) {
  return useQuery({
    queryKey: ["previa_codigo", orgId, familia, tipo],
    enabled: !!orgId && !!familia && !!tipo,
    queryFn: async () => {
      const { data, error } = await supabase.rpc("previa_codigo", {
        _org: orgId,
        _familia: familia,
        _tipo: tipo,
      });
      if (error) throw error;
      return data as string | null;
    },
  });
}

function NovoProduto({ familias, orgId }: { familias: Familia[]; orgId: string }) {
  const qc = useQueryClient();
  const cad = useServerFn(cadastrarProduto);
  const vazio = { familia: "", tipo: "" as TipoItem | "", descricao: "", unidade: "PÇ", ncm: "", modalidade: "comprar" as const, custo: "" };
  const [f, setF] = useState<typeof vazio & { modalidade: "comprar" | "fabricar" | "terceirizar" }>(vazio);
  const [chave, setChave] = useState(() => crypto.randomUUID());
  const previa = usePrevia(orgId, f.familia, f.tipo);
  const salvar = useMutation({
    mutationFn: () => {
      const custo = Number(f.custo.replace(/\./g, "").replace(",", "."));
      if (!f.familia || !f.tipo) throw new Error("Escolha família e tipo.");
      if (f.descricao.trim().length < 2) throw new Error("Informe a descrição.");
      if (!f.unidade.trim()) throw new Error("Informe a unidade.");
      if (!Number.isFinite(custo) || custo < 0) throw new Error("Custo inválido.");
      return cad({
        data: { chave, familia: f.familia, tipo: f.tipo, descricao: f.descricao, unidade: f.unidade, ncm: f.ncm, modalidade: f.modalidade, custo },
      });
    },
    onSuccess: () => {
      setF(vazio);
      setChave(crypto.randomUUID());
      qc.invalidateQueries({ queryKey: ["produtos", orgId] });
      qc.invalidateQueries({ queryKey: ["series_codigo", orgId] });
      qc.invalidateQueries({ queryKey: ["previa_codigo"] });
    },
  });
  const set = (k: keyof typeof f) => (e: { target: { value: string } }) => {
    salvar.reset();
    setF((x) => ({ ...x, [k]: e.target.value }));
  };
  return (
    <Section title="Novo componente" description="Escolha família e tipo; o código é confirmado ao salvar.">
      <form
        onSubmit={(e) => {
          e.preventDefault();
          salvar.mutate();
        }}
        className="grid gap-3 sm:grid-cols-6"
      >
        <label className="grid gap-1 text-xs sm:col-span-3">
          Família
          <FamiliaPicker id="familias-novo" familias={familias} value={f.familia} onChange={(v) => setF((x) => ({ ...x, familia: v }))} />
        </label>
        <fieldset className="grid gap-1 text-xs sm:col-span-3">
          <legend className="mb-1">Tipo</legend>
          <div className="flex flex-wrap gap-1.5">
            {TIPOS_ITEM.map((t) => (
              <button
                key={t.valor}
                type="button"
                aria-pressed={f.tipo === t.valor}
                onClick={() => setF((x) => ({ ...x, tipo: t.valor }))}
                className={`h-9 rounded border px-3 text-sm ${f.tipo === t.valor ? "border-primary bg-primary/15 text-primary" : "border-input text-foreground"}`}
              >
                {t.nome}
              </button>
            ))}
          </div>
        </fieldset>
        <div className="flex items-center gap-3 rounded border border-dashed border-primary/40 bg-primary/5 px-3 py-2 sm:col-span-6">
          <span className="text-xs text-muted-foreground">Prévia do código</span>
          <span className="font-mono text-base font-semibold text-primary" aria-live="polite">
            {salvar.isSuccess ? salvar.data.codigo : (previa.data ?? "—")}
          </span>
          {!salvar.isSuccess && previa.data && <span className="text-xs text-muted-foreground">confirmado ao salvar</span>}
        </div>
        <label className="grid gap-1 text-xs sm:col-span-6">
          Descrição e características técnicas
          <input aria-label="Descrição" className={input} value={f.descricao} onChange={set("descricao")} placeholder="Ex.: Chapa base 6,35 × 180 × 180 mm aço galvanizado" />
        </label>
        <label className="grid gap-1 text-xs">
          Unidade
          <input aria-label="Unidade" className={input} value={f.unidade} onChange={set("unidade")} />
        </label>
        <label className="grid gap-1 text-xs">
          NCM
          <input aria-label="NCM" className={input} value={f.ncm} onChange={set("ncm")} />
        </label>
        <label className="grid gap-1 text-xs sm:col-span-2">
          Suprimento
          <select aria-label="Modalidade" className={input} value={f.modalidade} onChange={set("modalidade")}>
            <option value="comprar">Comprar</option>
            <option value="fabricar">Fabricar</option>
            <option value="terceirizar">Terceirizar</option>
          </select>
        </label>
        <label className="grid gap-1 text-xs sm:col-span-2">
          Custo unitário (R$)
          <input aria-label="Custo" inputMode="decimal" className={input} value={f.custo} onChange={set("custo")} placeholder="0,00" />
        </label>
        <div className="flex flex-wrap items-center gap-3 sm:col-span-6">
          <ActionButton type="submit" loading={salvar.isPending}>
            Cadastrar
          </ActionButton>
          {salvar.isSuccess && (
            <span className="text-sm text-primary">
              Cadastrado como <strong className="font-mono">{salvar.data.codigo}</strong>.
            </span>
          )}
          {salvar.isError && (
            <span className="text-sm text-destructive">
              {salvar.error instanceof Error ? salvar.error.message : "Não foi possível cadastrar."}
            </span>
          )}
        </div>
      </form>
    </Section>
  );
}

function Pendente({ p, familias, orgId }: { p: { id: string; codigo: string; descricao: string }; familias: Familia[]; orgId: string }) {
  const qc = useQueryClient();
  const rec = useServerFn(recodificarProduto);
  const [familia, setFamilia] = useState("");
  const [tipo, setTipo] = useState<TipoItem | "">("");
  const previa = usePrevia(orgId, familia, tipo);
  const m = useMutation({
    mutationFn: () => rec({ data: { produto_id: p.id, familia, tipo: tipo as TipoItem } }),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["produtos", orgId] });
      qc.invalidateQueries({ queryKey: ["series_codigo", orgId] });
    },
  });
  return (
    <li className="grid gap-2 rounded border border-border p-3 sm:grid-cols-[1fr_14rem_10rem_auto] sm:items-center">
      <div className="text-sm">
        <span className="font-mono font-semibold">{p.codigo}</span> <span>{p.descricao}</span>
      </div>
      <FamiliaPicker id={`fam-${p.id}`} familias={familias} value={familia} onChange={setFamilia} />
      <select aria-label={`Tipo de ${p.codigo}`} className={input} value={tipo} onChange={(e) => setTipo(e.target.value as TipoItem)}>
        <option value="">Tipo</option>
        {TIPOS_ITEM.map((t) => (
          <option key={t.valor} value={t.valor}>
            {t.nome}
          </option>
        ))}
      </select>
      <ActionButton loading={m.isPending} disabled={!familia || !tipo} onClick={() => m.mutate()}>
        {previa.data ? `Gerar ${previa.data}` : "Gerar código"}
      </ActionButton>
      {m.isError && <p className="text-sm text-destructive sm:col-span-4">{(m.error as Error).message}</p>}
    </li>
  );
}
