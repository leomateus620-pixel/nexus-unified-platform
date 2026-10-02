import { useQuery, useQueryClient } from "@tanstack/react-query";
import { useServerFn } from "@tanstack/react-start";
import { useMemo, useState } from "react";

import { ActionButton, DataTable, EmptyState, Section } from "@/components/nexus/Page";
import { supabase } from "@/integrations/supabase/client";
import { useFornecedores } from "@/features/propostas/hooks";
import { brlUnit, dataBR } from "@/lib/format";
import { definirConversao, registrarCompra } from "./custos.functions";
import { linhaResumo, resumoCustos } from "./domain";

const input = "h-8 rounded border border-input bg-background px-2 text-sm text-foreground";
type Aq = {
  id: string;
  quantidade: number;
  unidade: string;
  custo_total: number | null;
  custo_unitario: number | null;
  valores_calculados: { quantidade_uso?: number | null } | null;
  situacao: string;
  pendencia: string | null;
  lote: string | null;
  politica_versao: string | null;
  created_at: string;
  origem: { aba?: string; linha?: number } | null;
  documentos_fiscais: {
    numero: string;
    emitido_em: string | null;
    provisorio: boolean;
    fornecedor_texto: string | null;
    fornecedores: { nome: string } | null;
  } | null;
};

/** Referências de fornecedor, conversões, compras e os três custos (última, média, adotado). */
export function ComprasProduto(props: {
  produtoId: string;
  orgId: string;
  unidade: string;
  custoAdotado: { custo: number; origem: string | null } | null;
  podeEditar: boolean;
}) {
  const qc = useQueryClient();
  const q = useQuery({
    queryKey: ["compras-produto", props.produtoId],
    queryFn: async () => {
      const [aq, ref, conv] = await Promise.all([
        supabase
          .from("aquisicoes")
          .select(
            "id,quantidade,unidade,custo_total,custo_unitario,valores_calculados,situacao,pendencia,lote,politica_versao,created_at,origem,documentos_fiscais(numero,emitido_em,provisorio,fornecedor_texto,fornecedores(nome))",
          )
          .eq("produto_id", props.produtoId),
        supabase
          .from("produto_referencias")
          .select("id,codigo_fornecedor,descricao_original,fornecedores(nome)")
          .eq("produto_id", props.produtoId),
        supabase
          .from("produto_conversoes")
          .select("id,unidade_compra,fator")
          .eq("produto_id", props.produtoId),
      ]);
      for (const r of [aq, ref, conv]) if (r.error) throw r.error;
      return {
        aquisicoes: (aq.data ?? []) as unknown as Aq[],
        referencias: ref.data ?? [],
        conversoes: conv.data ?? [],
      };
    },
  });
  const resumo = useMemo(
    () => resumoCustos((q.data?.aquisicoes ?? []).map((a) => linhaResumo(a as never))),
    [q.data],
  );
  const recarregar = () => {
    qc.invalidateQueries({ queryKey: ["compras-produto", props.produtoId] });
    qc.invalidateQueries({ queryKey: ["produto", props.produtoId] });
  };
  const aq = [...(q.data?.aquisicoes ?? [])].sort((a, b) =>
    (b.documentos_fiscais?.emitido_em ?? b.created_at).localeCompare(
      a.documentos_fiscais?.emitido_em ?? a.created_at,
    ),
  );
  return (
    <>
      <Section
        title="Custos deste produto"
        description="Três valores distintos. O sistema sugere a média ponderada para novas inclusões; propostas existentes só mudam se você adotar o novo valor nelas."
      >
        <div className="grid gap-3 sm:grid-cols-3">
          <Custo
            titulo="Última compra"
            valor={resumo.ultima_compra}
            origem="Compra válida mais recente"
          />
          <Custo
            titulo="Média ponderada"
            valor={resumo.media_ponderada}
            origem={`Soma dos custos ÷ soma das quantidades (${resumo.compras_validas} compra(s) válidas)`}
          />
          <Custo
            titulo="Custo sugerido para novas propostas"
            valor={props.custoAdotado?.custo ?? null}
            origem={props.custoAdotado?.origem ?? "Sem custo registrado"}
          />
        </div>
        {resumo.compras_pendentes > 0 && (
          <p className="mt-2 text-sm text-amber-500" role="status">
            {resumo.compras_pendentes} compra(s) com custo pendente não entram na média.
          </p>
        )}
      </Section>

      <Section
        title="Referências de fornecedor"
        description="Como cada fornecedor identifica este produto. Códigos iguais de fornecedores diferentes não indicam o mesmo produto."
      >
        {(q.data?.referencias ?? []).length === 0 ? (
          <EmptyState title="Nenhuma referência de fornecedor" />
        ) : (
          <ul className="space-y-1 text-sm">
            {q.data!.referencias.map((r) => (
              <li key={r.id}>
                <span className="text-foreground">
                  {(r.fornecedores as { nome: string } | null)?.nome}
                </span>{" "}
                — código <strong>{r.codigo_fornecedor}</strong>
                {r.descricao_original && (
                  <span className="text-muted-foreground"> · {r.descricao_original}</span>
                )}
              </li>
            ))}
          </ul>
        )}
      </Section>

      <Section
        title="Unidades e embalagens"
        description={`Unidade de uso: ${props.unidade}. Compras em outra unidade só têm custo depois de um fator confirmado.`}
      >
        <ul className="mb-2 space-y-1 text-sm">
          {(q.data?.conversoes ?? []).map((c) => (
            <li key={c.id}>
              1 {c.unidade_compra} = {Number(c.fator)} {props.unidade}
            </li>
          ))}
          {(q.data?.conversoes ?? []).length === 0 && (
            <li className="text-muted-foreground">Nenhum fator confirmado.</li>
          )}
        </ul>
        {props.podeEditar && <NovaConversao produtoId={props.produtoId} unidade={props.unidade} ok={recarregar} />}
      </Section>

      <Section
        title="Histórico de aquisição"
        description="Valores do documento preservados; custo calculado pela política registrada em cada linha."
      >
        {props.podeEditar ? (
          <NovaCompra produtoId={props.produtoId} orgId={props.orgId} unidade={props.unidade} ok={recarregar} />
        ) : (
          <p className="text-sm text-muted-foreground">
            Registrar compra exige papel Engenharia, Compras ou Admin.
          </p>
        )}
        <div className="mt-3">
          {aq.length === 0 ? (
            <EmptyState title="Sem compras registradas" />
          ) : (
            <DataTable
              getRowId={(a) => a.id}
              rows={aq}
              columns={[
                {
                  key: "nf",
                  label: "Documento",
                  render: (a) =>
                    a.documentos_fiscais
                      ? `NF ${a.documentos_fiscais.numero}${a.documentos_fiscais.provisorio ? " (provisória)" : ""} · ${dataBR(a.documentos_fiscais.emitido_em ?? a.created_at)}`
                      : "—",
                },
                {
                  key: "forn",
                  label: "Fornecedor",
                  render: (a) =>
                    a.documentos_fiscais?.fornecedores?.nome ??
                    a.documentos_fiscais?.fornecedor_texto ??
                    "—",
                },
                {
                  key: "qtd",
                  label: "Quantidade",
                  align: "right",
                  render: (a) => `${Number(a.quantidade)} ${a.unidade}`,
                },
                {
                  key: "custo",
                  label: "Custo unitário",
                  align: "right",
                  render: (a) =>
                    a.situacao === "valida" && a.custo_unitario != null ? (
                      brlUnit(Number(a.custo_unitario))
                    ) : (
                      <span className="text-amber-500">Custo pendente</span>
                    ),
                },
                {
                  key: "origem",
                  label: "Origem",
                  render: (a) =>
                    a.pendencia ??
                    (a.origem?.aba ? `Planilha · ${a.origem.aba} linha ${a.origem.linha}` : "Registro manual") +
                      (a.lote ? ` · ${a.lote}` : ""),
                },
              ]}
            />
          )}
        </div>
      </Section>
    </>
  );
}

function Custo(p: { titulo: string; valor: number | null; origem: string }) {
  return (
    <div className="rounded border border-border p-3">
      <p className="text-xs text-muted-foreground">{p.titulo}</p>
      <p className="text-lg text-foreground">{p.valor == null ? "Custo pendente" : brlUnit(p.valor)}</p>
      <p className="text-xs text-muted-foreground">{p.origem}</p>
    </div>
  );
}

function NovaConversao(p: { produtoId: string; unidade: string; ok: () => void }) {
  const fn = useServerFn(definirConversao);
  const [un, setUn] = useState("");
  const [fator, setFator] = useState("");
  const [msg, setMsg] = useState<string | null>(null);
  return (
    <form
      className="flex flex-wrap items-end gap-2 text-sm"
      onSubmit={async (e) => {
        e.preventDefault();
        setMsg(null);
        try {
          await fn({ data: { produto_id: p.produtoId, unidade_compra: un.toUpperCase(), fator: Number(fator.replace(",", ".")) } });
          setUn("");
          setFator("");
          p.ok();
        } catch (er) {
          setMsg((er as Error).message);
        }
      }}
    >
      <label>
        1 <input aria-label="Unidade de compra" required value={un} onChange={(e) => setUn(e.target.value)} className={`${input} w-16`} placeholder="CT" />
      </label>
      <label>
        = <input aria-label="Fator" required inputMode="decimal" value={fator} onChange={(e) => setFator(e.target.value)} className={`${input} w-20`} /> {p.unidade}
      </label>
      <ActionButton type="submit" variant="ghost">Confirmar fator</ActionButton>
      {msg && <span className="text-destructive">{msg}</span>}
    </form>
  );
}

function NovaCompra(p: { produtoId: string; orgId: string; unidade: string; ok: () => void }) {
  const fn = useServerFn(registrarCompra);
  const forn = useFornecedores(p.orgId);
  const [aberto, setAberto] = useState(false);
  const [chave, setChave] = useState(() => crypto.randomUUID());
  const [f, setF] = useState<Record<string, string>>({
    fornecedor_id: "", nf_numero: "", nf_serie: "", nf_chave: "", emitido_em: new Date().toISOString().slice(0, 10),
    quantidade: "", unidade: p.unidade, produtos: "", desconto: "", frete: "", ipi: "", difal: "", outras: "", lote: "",
  });
  const [msg, setMsg] = useState<string | null>(null);
  const [salvando, setSalvando] = useState(false);
  const n = (v: string) => (v.trim() === "" ? null : Number(v.replace(",", ".")));
  const campo = (k: string, label: string, extra = "") => (
    <label className="flex flex-col text-xs">
      {label}
      <input value={f[k]} onChange={(e) => setF({ ...f, [k]: e.target.value })} className={`${input} ${extra}`} />
    </label>
  );
  if (!aberto) return <ActionButton onClick={() => setAberto(true)}>Registrar compra</ActionButton>;
  return (
    <form
      className="space-y-2 rounded border border-border p-3"
      onSubmit={async (e) => {
        e.preventDefault();
        setMsg(null);
        setSalvando(true);
        try {
          const r = await fn({
            data: {
              chave, produto_id: p.produtoId, fornecedor_id: f.fornecedor_id || null,
              nf_numero: f.nf_numero, nf_serie: f.nf_serie, nf_chave: f.nf_chave.replace(/\D/g, ""), emitido_em: f.emitido_em,
              quantidade: n(f.quantidade) ?? 0, unidade: f.unidade.toUpperCase(), lote: f.lote,
              parcelas: { produtos: n(f.produtos), desconto: n(f.desconto), frete: n(f.frete), ipi: n(f.ipi), difal: n(f.difal), outras: n(f.outras) },
            },
          });
          setMsg(r.pendencia ? `Compra salva com pendência: ${r.pendencia}` : r.repetido ? "Esta compra já estava registrada." : "Compra registrada; média ponderada atualizada.");
          setChave(crypto.randomUUID());
          p.ok();
        } catch (er) {
          setMsg((er as Error).message);
        } finally {
          setSalvando(false);
        }
      }}
    >
      <div className="flex flex-wrap gap-2">
        <label className="flex flex-col text-xs">
          Fornecedor
          <select value={f.fornecedor_id} onChange={(e) => setF({ ...f, fornecedor_id: e.target.value })} className={input}>
            <option value="">Não informado</option>
            {(forn.data ?? []).map((x) => <option key={x.id} value={x.id}>{x.nome}</option>)}
          </select>
        </label>
        {campo("nf_numero", "Nº NF", "w-24")}
        {campo("nf_serie", "Série", "w-14")}
        {campo("nf_chave", "Chave NF-e (44 dígitos)", "w-72")}
        <label className="flex flex-col text-xs">
          Data
          <input type="date" value={f.emitido_em} onChange={(e) => setF({ ...f, emitido_em: e.target.value })} className={input} />
        </label>
      </div>
      <div className="flex flex-wrap gap-2">
        {campo("quantidade", "Quantidade", "w-20")}
        {campo("unidade", "Unidade da compra", "w-16")}
        {campo("produtos", "Valor dos produtos (R$)", "w-28")}
        {campo("desconto", "Desconto", "w-20")}
        {campo("frete", "Frete", "w-20")}
        {campo("ipi", "IPI", "w-20")}
        {campo("difal", "DIFAL", "w-20")}
        {campo("outras", "Outras parcelas", "w-20")}
        {campo("lote", "Lote / nº série", "w-32")}
      </div>
      <p className="text-xs text-muted-foreground">
        Deixe em branco o que não consta no documento: o sistema não transforma ausência em zero.
      </p>
      <div className="flex gap-2">
        <ActionButton type="submit" disabled={salvando}>{salvando ? "Salvando…" : "Salvar compra"}</ActionButton>
        <ActionButton variant="ghost" onClick={() => setAberto(false)}>Fechar</ActionButton>
      </div>
      {msg && <p className="text-sm" role="status">{msg}</p>}
    </form>
  );
}
