import { useQuery, useQueryClient } from "@tanstack/react-query";
import { useServerFn } from "@tanstack/react-start";
import { useMemo, useState } from "react";

import { supabase } from "@/integrations/supabase/client";
import { registrarCompra } from "@/features/custos/custos.functions";
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

const rotuloSit = { novo: "Novo", existente: "Já existente", conflito: "Conflito", incompleto: "Incompleto" };

/**
 * Importação de compras com prévia: cole as linhas da planilha (copiar do Excel), confirme o
 * mapeamento das colunas e importe só o que é válido. Repetir não duplica (chave determinística).
 */
export function ImportacaoAssistida({ podeRegistrar }: { podeRegistrar: boolean }) {
  const qc = useQueryClient();
  const registrar = useServerFn(registrarCompra);
  const [arquivo, setArquivo] = useState("");
  const [aba, setAba] = useState("");
  const [texto, setTexto] = useState("");
  const [mapa, setMapa] = useState<Mapa | null>(null);
  const [previa, setPrevia] = useState<LinhaClassificada[] | null>(null);
  const [estado, setEstado] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

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

  async function gerarPrevia() {
    if (!base.data || tabela.length < 2) return;
    setBusy(true);
    setEstado(null);
    try {
      const linhas = classificar(tabela.slice(1), mapaAtual, base.data.produtos, base.data.fornecedores, new Set(), {
        arquivo: arquivo.trim() || "sem-nome",
        aba: aba.trim() || "sem-aba",
      });
      const chaves = await Promise.all(linhas.map((l) => uuidDe(l.identidade)));
      const novos = chaves.filter((_, i) => linhas[i]?.situacao === "novo");
      const ja = new Set<string>();
      if (novos.length) {
        const { data } = await supabase.from("aquisicoes").select("chave").in("chave", novos);
        (data ?? []).forEach((d) => ja.add(d.chave));
      }
      setPrevia(
        linhas.map((l, i) =>
          l.situacao === "novo" && ja.has(chaves[i] ?? "")
            ? { ...l, situacao: "existente", motivo: "Compra já importada — nada será duplicado." }
            : l,
        ),
      );
    } finally {
      setBusy(false);
    }
  }

  async function confirmar() {
    if (!previa) return;
    setBusy(true);
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
    setBusy(false);
    setEstado(
      `${ok} compra(s) registrada(s), ${rep} já existente(s), ${pend} com custo pendente.` +
        (erros.length ? ` Falhas: ${erros.slice(0, 3).join(" · ")}` : ""),
    );
    await qc.invalidateQueries();
    await gerarPrevia();
  }

  const cont = (s: string) => previa?.filter((l) => l.situacao === s).length ?? 0;
  const input = "h-10 w-full rounded border border-input bg-background px-3 text-sm";

  return (
    <div className="space-y-4 rounded-lg border border-border bg-card p-4">
      <div>
        <h3 className="font-display text-sm font-bold uppercase tracking-wider">Importar compras de planilha</h3>
        <p className="text-xs text-muted-foreground">
          Copie as linhas no Excel (com cabeçalho) e cole abaixo. Produtos são localizados pelo código NEXUS ou pela
          referência do fornecedor; nada é cadastrado ou classificado por suposição.
        </p>
      </div>
      {!podeRegistrar && (
        <p role="alert" className="rounded border border-warning/50 bg-warning/10 p-2 text-xs">
          Seu perfil pode gerar a prévia, mas registrar compras é permitido apenas para Engenharia e Compras.
        </p>
      )}
      <div className="grid gap-3 sm:grid-cols-2">
        <label className="text-xs">
          Arquivo de origem
          <input className={input} value={arquivo} onChange={(e) => setArquivo(e.target.value)} placeholder="Cadastro de Componentes Comerciais NXS.xlsx" />
        </label>
        <label className="text-xs">
          Aba
          <input className={input} value={aba} onChange={(e) => setAba(e.target.value)} placeholder="Histórico de Compras" />
        </label>
      </div>
      <textarea
        aria-label="Linhas da planilha"
        className="min-h-32 w-full rounded border border-input bg-background p-2 font-mono text-xs"
        value={texto}
        onChange={(e) => {
          setTexto(e.target.value);
          setMapa(null);
          setPrevia(null);
        }}
      />
      {cab.length > 0 && (
        <div className="grid gap-2 sm:grid-cols-3">
          {CAMPOS.map((c) => (
            <label key={c.chave} className="text-xs">
              {c.rotulo}
              <select
                className={input}
                value={mapaAtual[c.chave] ?? ""}
                onChange={(e) => {
                  const m = { ...mapaAtual };
                  if (e.target.value === "") delete m[c.chave as CampoChave];
                  else m[c.chave as CampoChave] = Number(e.target.value);
                  setMapa(m);
                  setPrevia(null);
                }}
              >
                <option value="">— não mapear —</option>
                {cab.map((h, i) => (
                  <option key={i} value={i}>
                    {h || `Coluna ${i + 1}`}
                  </option>
                ))}
              </select>
            </label>
          ))}
        </div>
      )}
      <button type="button" disabled={busy || tabela.length < 2 || !base.data} onClick={gerarPrevia} className="h-10 rounded border border-border px-4 text-sm uppercase disabled:opacity-50">
        Gerar prévia
      </button>
      {previa && (
        <div className="space-y-2">
          <p className="text-sm">
            <strong>{cont("novo")}</strong> compra(s) a incluir · <strong>{cont("existente")}</strong> já existente(s) ·{" "}
            <strong>{cont("conflito")}</strong> conflito(s) · <strong>{cont("incompleto")}</strong> incompleta(s) — conflitos e
            incompletas ficam fora e precisam de revisão.
          </p>
          <div className="max-h-72 overflow-auto rounded border border-border">
            <table className="w-full text-xs">
              <thead className="bg-muted/40 text-left">
                <tr>
                  <th className="p-2">Linha</th>
                  <th className="p-2">Situação</th>
                  <th className="p-2">Produto</th>
                  <th className="p-2">Detalhe</th>
                </tr>
              </thead>
              <tbody>
                {previa.map((l) => (
                  <tr key={l.linha} className="border-t border-border">
                    <td className="p-2">{l.linha}</td>
                    <td className="p-2">{rotuloSit[l.situacao]}</td>
                    <td className="p-2 font-mono">{l.produto?.codigo ?? "—"}</td>
                    <td className="p-2">{l.motivo}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
          <button
            type="button"
            disabled={busy || !podeRegistrar || cont("novo") === 0}
            onClick={confirmar}
            className="h-10 rounded border border-primary bg-primary px-4 font-display text-sm font-bold uppercase text-primary-foreground disabled:opacity-50"
          >
            Importar {cont("novo")} compra(s) válida(s)
          </button>
        </div>
      )}
      {estado && <p role="status" className="text-sm">{estado}</p>}
    </div>
  );
}
