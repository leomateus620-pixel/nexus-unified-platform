import { useQuery, useQueryClient } from "@tanstack/react-query";
import { useServerFn } from "@tanstack/react-start";
import { useEffect, useMemo, useState } from "react";

import { ActionButton, ErrorState, LoadingState } from "@/components/nexus/Page";
import { supabase } from "@/integrations/supabase/client";
import { registrarCompra } from "@/features/custos/custos.functions";
import { brlUnit } from "@/lib/format";
import "@/features/custos/product-costs.css";
import {
  CAMPOS,
  classificar,
  lerTabela,
  sugerirMapa,
  uuidDe,
  type CampoChave,
  type LinhaClassificada,
  type Mapa,
} from "./mapeamento";

const situacoes = {
  novo: { nome: "Novo", ajuda: "Compra pronta para importar. O produto já foi identificado." },
  existente: { nome: "Já existente", ajuda: "Esta compra já foi importada e não será duplicada." },
  conflito: {
    nome: "Conflito",
    ajuda: "Há uma identificação ambígua ou divergente. Revise a linha.",
  },
  incompleto: { nome: "Incompleto", ajuda: "Faltam dados ou um vínculo com o catálogo." },
};

/** Mesma importação por dados colados, com chave determinística e prévia obrigatória. */
export function ImportacaoAssistida({
  podeRegistrar,
  onBusyChange,
  onCompletion,
}: {
  podeRegistrar: boolean;
  onBusyChange?: (busy: boolean) => void;
  onCompletion?: (resumo: string) => void;
}) {
  const qc = useQueryClient();
  const registrar = useServerFn(registrarCompra);
  const [arquivo, setArquivo] = useState("");
  const [aba, setAba] = useState("");
  const [texto, setTexto] = useState("");
  const [mapa, setMapa] = useState<Mapa | null>(null);
  const [previa, setPrevia] = useState<LinhaClassificada[] | null>(null);
  const [conclusao, setConclusao] = useState<{
    ok: number;
    rep: number;
    pend: number;
    erros: string[];
  } | null>(null);
  const [erro, setErro] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  useEffect(() => {
    onBusyChange?.(busy);
  }, [busy, onBusyChange]);
  const tabela = useMemo(() => lerTabela(texto), [texto]);
  const cab = tabela[0] ?? [];
  const mapaAtual = mapa ?? sugerirMapa(cab);
  const base = useQuery({
    queryKey: ["importacao-base"],
    queryFn: async () => {
      const [p, r, f] = await Promise.all([
        supabase.from("produtos").select("id,codigo,unidade").eq("ativo", true),
        supabase.from("produto_referencias").select("produto_id,fornecedor_id,codigo_fornecedor"),
        supabase.from("fornecedores").select("id,nome"),
      ]);
      if (p.error || r.error || f.error) throw p.error ?? r.error ?? f.error;
      return {
        produtos: p.data.map((x) => ({
          ...x,
          refs: r.data
            .filter((y) => y.produto_id === x.id)
            .map((y) => ({ fornecedor_id: y.fornecedor_id, codigo: y.codigo_fornecedor })),
        })),
        fornecedores: f.data,
      };
    },
  });

  async function atualizarPrevia() {
    if (!base.data || tabela.length < 2) return;
    const linhas = classificar(
      tabela.slice(1),
      mapaAtual,
      base.data.produtos,
      base.data.fornecedores,
      new Set(),
      {
        arquivo: arquivo.trim() || "sem-nome",
        aba: aba.trim() || "sem-aba",
      },
    );
    const chaves = await Promise.all(linhas.map((l) => uuidDe(l.identidade)));
    const novos = chaves.filter((_, i) => linhas[i]?.situacao === "novo");
    const ja = new Set<string>();
    if (novos.length) {
      const { data, error } = await supabase.from("aquisicoes").select("chave").in("chave", novos);
      if (error) throw error;
      (data ?? []).forEach((d) => ja.add(d.chave));
    }
    setPrevia(
      linhas.map((l, i) =>
        l.situacao === "novo" && ja.has(chaves[i] ?? "")
          ? {
              ...l,
              situacao: "existente",
              motivo: "Esta compra já foi importada. Nada será duplicado.",
            }
          : l,
      ),
    );
  }

  async function gerarPrevia() {
    setBusy(true);
    setErro(null);
    try {
      await atualizarPrevia();
    } catch (e) {
      setPrevia(null);
      setErro((e as Error).message);
    } finally {
      setBusy(false);
    }
  }

  async function confirmar() {
    if (!previa || busy || !podeRegistrar) return;
    setBusy(true);
    setErro(null);
    let ok = 0,
      rep = 0,
      pend = 0;
    const erros: string[] = [];
    for (const l of previa.filter((x) => x.situacao === "novo" && x.compra && x.produto)) {
      try {
        const r = await registrar({
          data: {
            chave: await uuidDe(l.identidade),
            produto_id: l.produto!.id,
            fornecedor_id: l.fornecedor_id,
            nf_numero: l.compra!.nf_numero,
            nf_serie: l.compra!.nf_serie,
            nf_chave: "",
            emitido_em: l.compra!.emitido_em,
            quantidade: l.compra!.quantidade,
            unidade: l.compra!.unidade,
            parcelas: l.compra!.parcelas,
            lote: `${arquivo || "sem-nome"} › ${aba || "sem-aba"} › linha ${l.linha}`,
          },
        });
        if (r.repetido) rep++;
        else ok++;
        if (r.pendencia) pend++;
      } catch (e) {
        erros.push(`Linha ${l.linha}: ${(e as Error).message}`);
      }
    }
    // O resultado da operação é independente da atualização da prévia.
    setConclusao({ ok, rep, pend, erros });
    onCompletion?.(
      `Importação concluída: ${ok} compra(s) registrada(s), ${rep} já importada(s), ${pend} com custo pendente.` +
        (erros.length ? ` ${erros.length} falha(s): ${erros.join(" · ")}` : ""),
    );
    try {
      await qc.invalidateQueries();
      await atualizarPrevia();
    } catch (e) {
      setPrevia(null);
      setErro(
        `O resultado acima foi confirmado, mas a prévia não pôde ser atualizada: ${(e as Error).message}. Gere a prévia novamente.`,
      );
    } finally {
      setBusy(false);
    }
  }

  const invalidar = () => {
    setPrevia(null);
    setConclusao(null);
    setErro(null);
  };
  const cont = (s: string) => previa?.filter((l) => l.situacao === s).length ?? 0;
  const input = "nx-cost-input";
  return (
    <div className="nx-import-workspace">
      <header className="nx-cost-section-heading">
        <h3>Importar compras do Excel</h3>
        <p>
          Copie as células com o cabeçalho e cole abaixo. O código Nexus ou a referência do
          fornecedor identifica cada produto.
        </p>
      </header>
      {!podeRegistrar && (
        <p role="status" className="nx-cost-notice">
          Seu perfil pode consultar a prévia. O registro de compras exige permissão de Engenharia,
          Compras ou Admin.
        </p>
      )}
      {conclusao && (
        <div className="nx-import-result" role="status">
          <strong>Importação concluída{conclusao.erros.length ? " com falhas" : ""}</strong>
          <p>
            {conclusao.ok} compra(s) registrada(s) · {conclusao.rep} já importada(s) ·{" "}
            {conclusao.pend} com custo pendente.
          </p>
          {conclusao.erros.length > 0 && (
            <ul>
              {conclusao.erros.map((e) => (
                <li key={e}>{e}</li>
              ))}
            </ul>
          )}
        </div>
      )}
      <fieldset disabled={busy} className="nx-import-step">
        <legend>
          <span>1</span> Cole os dados e identifique a origem
        </legend>
        <div className="nx-cost-form-grid">
          <label>
            Nome do arquivo de origem
            <input
              className={input}
              value={arquivo}
              onChange={(e) => {
                setArquivo(e.target.value);
                invalidar();
              }}
              placeholder="Nome da planilha de origem"
            />
          </label>
          <label>
            Nome da aba
            <input
              className={input}
              value={aba}
              onChange={(e) => {
                setAba(e.target.value);
                invalidar();
              }}
              placeholder="Nome da aba copiada"
            />
          </label>
        </div>
        <label className="nx-cost-field">
          Células copiadas do Excel, incluindo o cabeçalho
          <textarea
            className="nx-import-paste"
            value={texto}
            onChange={(e) => {
              setTexto(e.target.value);
              setMapa(null);
              invalidar();
            }}
            placeholder="Cole aqui as colunas e linhas da planilha"
            aria-describedby="import-paste-help"
          />
        </label>
        <p id="import-paste-help" className="nx-cost-help">
          Mantenha o nome do arquivo e da aba ao repetir uma importação. Eles fazem parte da
          identificação da origem.
        </p>
      </fieldset>
      {cab.length > 0 && (
        <fieldset disabled={busy} className="nx-import-step">
          <legend>
            <span>2</span> Confira as colunas reconhecidas
          </legend>
          <p className="nx-cost-help">
            {cab.length} coluna(s) · {Math.max(0, tabela.length - 1)} linha(s) de dados ·{" "}
            {Object.keys(mapaAtual).length} campo(s) mapeado(s). Confirme ou ajuste a
            correspondência abaixo.
          </p>
          <div className="nx-import-mapping">
            {CAMPOS.map((c) => (
              <label key={c.chave}>
                {c.rotulo}
                <select
                  className={input}
                  value={mapaAtual[c.chave] ?? ""}
                  onChange={(e) => {
                    const m = { ...mapaAtual };
                    if (e.target.value === "") delete m[c.chave as CampoChave];
                    else m[c.chave as CampoChave] = Number(e.target.value);
                    setMapa(m);
                    invalidar();
                  }}
                >
                  <option value="">Não mapeado</option>
                  {cab.map((h, i) => (
                    <option key={i} value={i}>
                      {h || `Coluna ${i + 1}`}
                    </option>
                  ))}
                </select>
              </label>
            ))}
          </div>
        </fieldset>
      )}
      {base.isPending && <LoadingState label="Carregando catálogo e fornecedores para a prévia" />}
      {base.isError && <ErrorState error={base.error} onRetry={() => base.refetch()} />}
      {erro && (
        <p className="nx-cost-error" role="alert">
          {erro}
        </p>
      )}
      <ActionButton
        variant="ghost"
        disabled={busy || tabela.length < 2 || !base.data || base.isError}
        onClick={gerarPrevia}
      >
        {busy ? "Processando…" : "Gerar prévia"}
      </ActionButton>
      {previa && (
        <section className="nx-import-step" aria-label="Prévia das compras">
          <h4>
            <span>3</span> Revise e importe as compras prontas
          </h4>
          <div className="nx-import-counts">
            {Object.entries(situacoes).map(([k, s]) => (
              <div key={k} data-situacao={k}>
                <strong>{cont(k)}</strong>
                <span>{s.nome}</span>
                <p>{s.ajuda}</p>
              </div>
            ))}
          </div>
          <p className="nx-cost-help">
            Origem: {arquivo || "sem-nome"} / {aba || "sem-aba"}. Conflitos e registros incompletos
            ficam fora da importação.
          </p>
          <ol className="nx-import-preview">
            {previa.map((l) => (
              <li key={l.linha} data-situacao={l.situacao}>
                <div className="nx-import-line">
                  <span>Linha {l.linha}</span>
                  <strong>{situacoes[l.situacao].nome}</strong>
                </div>
                <div>
                  <code>{l.produto?.codigo ?? "Produto não identificado"}</code>
                  {l.compra && (
                    <p>
                      NF {l.compra.nf_numero} · {l.compra.quantidade} {l.compra.unidade} ·{" "}
                      {l.compra.parcelas.produtos == null
                        ? "Valor pendente"
                        : brlUnit(l.compra.parcelas.produtos)}
                    </p>
                  )}
                </div>
                <p className="nx-import-reason">{l.motivo}</p>
              </li>
            ))}
          </ol>
          <ActionButton disabled={busy || !podeRegistrar || cont("novo") === 0} onClick={confirmar}>
            {busy ? "Processando…" : `Importar ${cont("novo")} compra(s) pronta(s)`}
          </ActionButton>
        </section>
      )}
    </div>
  );
}
