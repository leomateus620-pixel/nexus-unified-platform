import { useQuery, useQueryClient } from "@tanstack/react-query";
import { useServerFn } from "@tanstack/react-start";
import { useMemo, useState } from "react";

import {
  ActionButton,
  EmptyState,
  ErrorState,
  LoadingState,
  Section,
} from "@/components/nexus/Page";
import { supabase } from "@/integrations/supabase/client";
import { useFornecedores } from "@/features/propostas/hooks";
import { brlUnit } from "@/lib/format";
import { definirConversao, registrarCompra } from "./custos.functions";
import { linhaResumo, resumoCustos } from "./domain";
import { dataCalendarioValida, dataCustoBR } from "./datas";
import "./product-costs.css";

const input = "nx-cost-input";
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

/** Referências do catálogo. Nenhum dos valores representa o custo adotado de uma revisão. */
export function ComprasProduto(props: {
  produtoId: string;
  orgId: string;
  unidade: string;
  custoSugerido: { custo: number; origem: string | null; vigencia: string } | null;
  podeEditar: boolean;
  secao: "custos" | "compras" | "referencias";
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
  const resumo = useMemo(() => resumoCustos((q.data?.aquisicoes ?? []).map(linhaResumo)), [q.data]);
  const recarregar = () => {
    qc.invalidateQueries({ queryKey: ["compras-produto", props.produtoId] });
    qc.invalidateQueries({ queryKey: ["produto", props.produtoId] });
  };
  if (q.isPending) return <LoadingState label="Consultando compras e referências do produto" />;
  if (!q.data) return <ErrorState error={q.error} onRetry={() => q.refetch()} />;
  const aq = [...q.data.aquisicoes].sort((a, b) =>
    (b.documentos_fiscais?.emitido_em ?? b.created_at).localeCompare(
      a.documentos_fiscais?.emitido_em ?? a.created_at,
    ),
  );
  const ultima = aq.find(
    (a) =>
      a.situacao === "valida" &&
      a.custo_total != null &&
      Number(a.valores_calculados?.quantidade_uso ?? 0) > 0,
  );
  if (props.secao === "custos")
    return (
      <Section
        title="Referências de custo do catálogo"
        description="A sugestão vale para novas inclusões. Propostas existentes preservam o custo adotado em cada revisão."
      >
        {q.isError && <ErrorState error={q.error} onRetry={() => q.refetch()} />}
        <div className="nx-cost-summary">
          <Custo
            titulo="Custo sugerido para novas propostas"
            valor={props.custoSugerido?.custo ?? null}
            origem={
              props.custoSugerido?.origem ??
              (props.custoSugerido ? "Origem não informada" : "Sem referência de custo registrada")
            }
            detalhe={
              props.custoSugerido
                ? `Vigência: ${dataCustoBR(props.custoSugerido.vigencia)}`
                : undefined
            }
            destaque
          />
          <Custo
            titulo="Última compra"
            valor={resumo.ultima_compra}
            origem="Compra válida mais recente"
            detalhe={
              ultima
                ? dataCustoBR(ultima.documentos_fiscais?.emitido_em ?? ultima.created_at)
                : "Ainda não há compra válida"
            }
          />
          <Custo
            titulo="Média ponderada"
            valor={resumo.media_ponderada}
            origem={`${resumo.compras_validas} compra(s) válida(s)`}
            detalhe="Soma dos custos ÷ soma das quantidades de uso"
          />
        </div>
        <p className="nx-cost-help">
          O registro de uma compra válida atualiza a referência do catálogo pela média ponderada.
          Consulte a origem do custo sugerido para identificar seu registro.
        </p>
        {resumo.compras_pendentes > 0 && (
          <p className="nx-cost-notice" role="status">
            {resumo.compras_pendentes} compra(s) com custo pendente não entram na média.
          </p>
        )}
      </Section>
    );
  if (props.secao === "referencias")
    return (
      <div className="nx-cost-stack">
        {q.isError && <ErrorState error={q.error} onRetry={() => q.refetch()} />}
        <Section
          title="Referências de fornecedor"
          description="A identificação é específica de cada fornecedor; códigos iguais não confirmam o mesmo produto."
        >
          {q.data.referencias.length === 0 ? (
            <EmptyState title="Nenhuma referência de fornecedor" />
          ) : (
            <ul className="nx-cost-records">
              {q.data.referencias.map((r) => (
                <li key={r.id}>
                  <div>
                    <strong>
                      {(r.fornecedores as { nome: string } | null)?.nome ??
                        "Fornecedor não informado"}
                    </strong>
                    <p>
                      <code>{r.codigo_fornecedor}</code>
                    </p>
                    {r.descricao_original && <p>{r.descricao_original}</p>}
                  </div>
                </li>
              ))}
            </ul>
          )}
        </Section>
        <Section
          title="Unidades e embalagens"
          description={`Unidade de uso: ${props.unidade}. Uma compra em outra unidade requer fator de conversão confirmado.`}
        >
          <ul className="nx-cost-records">
            {q.data.conversoes.map((c) => (
              <li key={c.id}>
                1 {c.unidade_compra} = {Number(c.fator)} {props.unidade}
              </li>
            ))}
          </ul>
          {q.data.conversoes.length === 0 && (
            <p className="nx-cost-help">Nenhum fator de conversão confirmado.</p>
          )}
          {props.podeEditar && (
            <NovaConversao produtoId={props.produtoId} unidade={props.unidade} ok={recarregar} />
          )}
        </Section>
      </div>
    );
  return (
    <Section
      title={`Histórico de compras · ${aq.length}`}
      description="Valores do documento preservados. Abra uma compra para consultar origem e regra do custo."
    >
      {q.isError && <ErrorState error={q.error} onRetry={() => q.refetch()} />}
      {props.podeEditar ? (
        <NovaCompra
          produtoId={props.produtoId}
          orgId={props.orgId}
          unidade={props.unidade}
          ok={recarregar}
        />
      ) : (
        <p className="nx-cost-help">
          Seu perfil pode consultar compras. O registro exige permissão de Engenharia, Compras ou
          Admin.
        </p>
      )}
      {aq.length === 0 ? (
        <EmptyState
          title="Sem compras registradas"
          hint="Compras registradas neste produto aparecerão aqui com fornecedor, documento e origem."
        />
      ) : (
        <ul className="nx-purchase-history">
          {aq.map((a) => (
            <li key={a.id}>
              <details>
                <summary>
                  <div>
                    <strong>
                      {a.documentos_fiscais?.fornecedores?.nome ??
                        a.documentos_fiscais?.fornecedor_texto ??
                        "Fornecedor não informado"}
                    </strong>
                    <p>
                      {a.documentos_fiscais
                        ? `NF ${a.documentos_fiscais.numero}${a.documentos_fiscais.provisorio ? " · provisória" : ""}`
                        : "Documento não informado"}{" "}
                      · {dataCustoBR(a.documentos_fiscais?.emitido_em ?? a.created_at)}
                    </p>
                  </div>
                  <div className="nx-purchase-quantity">
                    <span>Quantidade comprada</span>
                    <strong>
                      {Number(a.quantidade)} {a.unidade}
                    </strong>
                  </div>
                  <div className="nx-purchase-value">
                    <span>Custo por {props.unidade}</span>
                    <strong>
                      {a.situacao === "valida" && a.custo_unitario != null ? (
                        brlUnit(Number(a.custo_unitario))
                      ) : (
                        <span className="text-warning">Custo pendente</span>
                      )}
                    </strong>
                  </div>
                  <span className="nx-record-disclosure">Detalhes</span>
                </summary>
                <dl className="nx-cost-facts">
                  <div>
                    <dt>Origem</dt>
                    <dd>
                      {a.origem?.aba
                        ? `Planilha · ${a.origem.aba} · linha ${a.origem.linha ?? "não informada"}`
                        : a.lote
                          ? a.lote
                          : "Origem não informada"}
                    </dd>
                  </div>
                  {a.lote && a.origem?.aba && (
                    <div>
                      <dt>Lote / referência</dt>
                      <dd>{a.lote}</dd>
                    </div>
                  )}
                  <div>
                    <dt>Custo total da compra</dt>
                    <dd>{a.custo_total == null ? "Pendente" : brlUnit(Number(a.custo_total))}</dd>
                  </div>
                  <div>
                    <dt>Quantidade na unidade de uso</dt>
                    <dd>
                      {a.valores_calculados?.quantidade_uso == null
                        ? "Conversão pendente"
                        : `${a.valores_calculados.quantidade_uso} ${props.unidade}`}
                    </dd>
                  </div>
                  <div>
                    <dt>Política de custo</dt>
                    <dd>{a.politica_versao ?? "Não informada"}</dd>
                  </div>
                </dl>
                {a.pendencia && <p className="nx-cost-notice">{a.pendencia}</p>}
              </details>
            </li>
          ))}
        </ul>
      )}
    </Section>
  );
}

function Custo(p: {
  titulo: string;
  valor: number | null;
  origem: string;
  detalhe?: string | undefined;
  destaque?: boolean;
}) {
  return (
    <div className="nx-cost-metric" data-featured={p.destaque || undefined}>
      <h3>{p.titulo}</h3>
      <p className="nx-cost-metric-value">
        {p.valor == null ? "Sem referência" : brlUnit(p.valor)}
      </p>
      <p>{p.origem}</p>
      {p.detalhe && <p className="nx-cost-help">{p.detalhe}</p>}
      {p.valor === 0 && <p className="nx-cost-help">R$ 0,00 informado</p>}
    </div>
  );
}

function NovaConversao(p: { produtoId: string; unidade: string; ok: () => void }) {
  const fn = useServerFn(definirConversao);
  const [un, setUn] = useState("");
  const [fator, setFator] = useState("");
  const [erro, setErro] = useState<string | null>(null);
  const [confirmacao, setConfirmacao] = useState<string | null>(null);
  const [salvando, setSalvando] = useState(false);
  return (
    <form
      className="nx-cost-inline-form"
      onSubmit={async (e) => {
        e.preventDefault();
        setErro(null);
        setConfirmacao(null);
        const valor = Number(fator.replace(",", "."));
        if (!Number.isFinite(valor) || valor <= 0) {
          setErro("Informe um fator de conversão maior que zero.");
          return;
        }
        setSalvando(true);
        try {
          await fn({
            data: {
              produto_id: p.produtoId,
              unidade_compra: un.trim().toUpperCase(),
              fator: valor,
            },
          });
          setConfirmacao(`Conversão confirmada: 1 ${un.toUpperCase()} = ${valor} ${p.unidade}.`);
          setUn("");
          setFator("");
          p.ok();
        } catch (er) {
          setErro((er as Error).message);
        } finally {
          setSalvando(false);
        }
      }}
    >
      <label>
        Unidade de compra
        <input
          required
          maxLength={10}
          value={un}
          onChange={(e) => setUn(e.target.value)}
          className={input}
          placeholder="Ex.: CT"
          disabled={salvando}
        />
      </label>
      <label>
        Quantidade em {p.unidade} por 1 unidade de compra
        <input
          required
          inputMode="decimal"
          value={fator}
          onChange={(e) => setFator(e.target.value)}
          className={input}
          disabled={salvando}
          aria-invalid={!!erro}
        />
      </label>
      <ActionButton type="submit" variant="ghost" disabled={salvando}>
        {salvando ? "Gravando…" : "Confirmar fator"}
      </ActionButton>
      {erro && (
        <p className="nx-cost-error" role="alert">
          {erro}
        </p>
      )}
      {confirmacao && (
        <p role="status" className="nx-cost-help">
          {confirmacao}
        </p>
      )}
    </form>
  );
}

function NovaCompra(p: { produtoId: string; orgId: string; unidade: string; ok: () => void }) {
  const fn = useServerFn(registrarCompra);
  const forn = useFornecedores(p.orgId);
  const [aberto, setAberto] = useState(false);
  const [chave, setChave] = useState(() => crypto.randomUUID());
  const inicial = () => ({
    fornecedor_id: "",
    nf_numero: "",
    nf_serie: "",
    nf_chave: "",
    emitido_em: new Date().toISOString().slice(0, 10),
    quantidade: "",
    unidade: p.unidade,
    produtos: "",
    desconto: "",
    frete: "",
    ipi: "",
    difal: "",
    outras: "",
    lote: "",
  });
  const [f, setF] = useState(inicial);
  type Campo = keyof typeof f;
  const [erros, setErros] = useState<Partial<Record<Campo, string>>>({});
  const [erro, setErro] = useState<string | null>(null);
  const [confirmacao, setConfirmacao] = useState<string | null>(null);
  const [salvando, setSalvando] = useState(false);
  const n = (v: string) => (v.trim() === "" ? null : Number(v.replace(",", ".")));
  const campo = (
    k: Campo,
    label: string,
    opts: { numeric?: boolean; type?: "date"; maxLength?: number; required?: boolean } = {},
  ) => (
    <label className="nx-cost-field">
      {label}
      <input
        value={f[k]}
        onChange={(e) => {
          setF({ ...f, [k]: e.target.value });
          setErros({ ...erros, [k]: undefined });
        }}
        className={input}
        inputMode={opts.numeric ? "decimal" : undefined}
        type={opts.type ?? "text"}
        maxLength={opts.maxLength}
        required={opts.required}
        aria-invalid={!!erros[k]}
        aria-describedby={erros[k] ? `purchase-${k}-error` : undefined}
      />
      {erros[k] && (
        <span id={`purchase-${k}-error`} className="nx-cost-error">
          {erros[k]}
        </span>
      )}
    </label>
  );
  const salvar = async (e: React.FormEvent) => {
    e.preventDefault();
    setErro(null);
    setConfirmacao(null);
    const next: Partial<Record<Campo, string>> = {};
    for (const k of [
      "quantidade",
      "produtos",
      "desconto",
      "frete",
      "ipi",
      "difal",
      "outras",
    ] as const) {
      const v = n(f[k]);
      if ((v != null && (!Number.isFinite(v) || v < 0)) || (k === "quantidade" && v == null))
        next[k] = "Informe um número igual ou maior que zero.";
    }
    if (f.nf_chave && !/^\d{44}$/.test(f.nf_chave.replace(/\D/g, "")))
      next.nf_chave = "A chave da NF-e deve conter 44 dígitos.";
    if (!f.unidade.trim()) next.unidade = "Informe a unidade da compra.";
    if (!dataCalendarioValida(f.emitido_em))
      next.emitido_em = "Informe uma data de emissão válida.";
    setErros(next);
    if (Object.keys(next).length) return;
    setSalvando(true);
    try {
      const r = await fn({
        data: {
          chave,
          produto_id: p.produtoId,
          fornecedor_id: f.fornecedor_id || null,
          nf_numero: f.nf_numero,
          nf_serie: f.nf_serie,
          nf_chave: f.nf_chave.replace(/\D/g, ""),
          emitido_em: f.emitido_em,
          quantidade: n(f.quantidade) ?? 0,
          unidade: f.unidade.toUpperCase(),
          lote: f.lote,
          parcelas: {
            produtos: n(f.produtos),
            desconto: n(f.desconto),
            frete: n(f.frete),
            ipi: n(f.ipi),
            difal: n(f.difal),
            outras: n(f.outras),
          },
        },
      });
      setConfirmacao(
        r.pendencia
          ? `Compra salva com pendência: ${r.pendencia}`
          : r.repetido
            ? "Esta compra já estava registrada."
            : "Compra registrada. Referência de custo atualizada no catálogo.",
      );
      setChave(crypto.randomUUID());
      setF(inicial());
      setAberto(false);
      p.ok();
    } catch (er) {
      setErro((er as Error).message);
    } finally {
      setSalvando(false);
    }
  };
  return (
    <div className="nx-purchase-entry">
      {confirmacao && (
        <p role="status" className="nx-import-result">
          {confirmacao}
        </p>
      )}
      {!aberto ? (
        <ActionButton variant="ghost" onClick={() => setAberto(true)}>
          Registrar compra
        </ActionButton>
      ) : (
        <form onSubmit={salvar} className="nx-purchase-form">
          <header className="nx-cost-section-heading">
            <h3>Registrar compra deste produto</h3>
            <p>
              Informe os valores do documento. Campos de valor em branco permanecem sem informação;
              zero é um valor informado.
            </p>
          </header>
          <fieldset disabled={salvando}>
            <legend>Fornecedor e documento</legend>
            <div className="nx-cost-form-grid">
              <label className="nx-cost-field">
                Fornecedor
                <select
                  value={f.fornecedor_id}
                  onChange={(e) => setF({ ...f, fornecedor_id: e.target.value })}
                  className={input}
                >
                  <option value="">Não informado</option>
                  {(forn.data ?? []).map((x) => (
                    <option key={x.id} value={x.id}>
                      {x.nome}
                    </option>
                  ))}
                </select>
              </label>
              {campo("nf_numero", "Nº da nota fiscal", { maxLength: 20 })}
              {campo("nf_serie", "Série", { maxLength: 5 })}
              {campo("nf_chave", "Chave NF-e (44 dígitos)", { maxLength: 60 })}
              {campo("emitido_em", "Data de emissão", { type: "date", required: true })}
              {campo("lote", "Lote / nº de série", { maxLength: 120 })}
            </div>
            {forn.isPending && (
              <p className="nx-cost-help" role="status">
                Carregando fornecedores…
              </p>
            )}
            {forn.isError && <ErrorState error={forn.error} onRetry={() => forn.refetch()} />}
          </fieldset>
          <fieldset disabled={salvando}>
            <legend>Quantidade e valores do documento</legend>
            <div className="nx-cost-form-grid">
              {campo("quantidade", "Quantidade comprada", { numeric: true, required: true })}
              {campo("unidade", "Unidade da compra", { maxLength: 10, required: true })}
              {campo("produtos", "Valor dos produtos (R$)", { numeric: true })}
              {campo("desconto", "Desconto (R$)", { numeric: true })}
              {campo("frete", "Frete (R$)", { numeric: true })}
              {campo("ipi", "IPI (R$)", { numeric: true })}
              {campo("difal", "DIFAL (R$)", { numeric: true })}
              {campo("outras", "Outras parcelas (R$)", { numeric: true })}
            </div>
          </fieldset>
          {erro && (
            <p className="nx-cost-error" role="alert">
              {erro} Os dados preenchidos foram preservados.
            </p>
          )}
          {Object.keys(erros).some((k) => erros[k as Campo]) && (
            <p className="nx-cost-error" role="alert">
              Revise os campos indicados antes de salvar.
            </p>
          )}
          <div className="nx-cost-actions">
            <ActionButton type="submit" disabled={salvando}>
              {salvando ? "Salvando…" : "Salvar compra"}
            </ActionButton>
            <ActionButton variant="ghost" disabled={salvando} onClick={() => setAberto(false)}>
              Cancelar
            </ActionButton>
          </div>
        </form>
      )}
    </div>
  );
}
