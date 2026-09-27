import { useQueryClient } from "@tanstack/react-query";
import { useEffect, useRef, useState } from "react";

import {
  ActionButton,
  EmptyState,
  ErrorState,
  LoadingState,
  Section,
} from "@/components/nexus/Page";
import { supabase } from "@/integrations/supabase/client";
import { consumoCabo, extensaoInstalada, mesclarRegras } from "@/features/calculo/domain";
import { useOrgId } from "@/features/org/session";
import { qtd } from "@/lib/format";
import { revKeys, useItens, useRecalcular, useRevisao, useSave, useSistemas } from "./hooks";

type Sis = NonNullable<ReturnType<typeof useSistemas>["data"]>[number];

export function Dimensionamento({ revisaoId }: { revisaoId: string }) {
  const rev = useRevisao(revisaoId);
  const sis = useSistemas(revisaoId);
  const itens = useItens(revisaoId);
  const recalc = useRecalcular(revisaoId);
  const save = useSave();
  const orgId = useOrgId();
  const qc = useQueryClient();
  const [aberto, setAberto] = useState<string | null>(null);
  const [colar, setColar] = useState("");
  const [erroColar, setErroColar] = useState<string | null>(null);
  const timer = useRef<ReturnType<typeof setTimeout> | null>(null);

  useEffect(
    () => () => {
      if (timer.current) clearTimeout(timer.current);
    },
    [],
  );

  if (rev.isPending || sis.isPending) return <LoadingState />;
  if (rev.isError) return <ErrorState error={rev.error} onRetry={() => rev.refetch()} />;
  if (sis.isError) return <ErrorState error={sis.error} onRetry={() => sis.refetch()} />;
  const editavel = rev.data.editavel;
  const regras = mesclarRegras(rev.data.regras);
  const lista = sis.data ?? [];

  const agendarRecalculo = () => {
    if (timer.current) clearTimeout(timer.current);
    timer.current = setTimeout(() => recalc.mutate(), 700);
  };

  async function salvar(
    s: Sis,
    patch: Partial<Pick<Sis, "identificacao" | "tipo" | "metragem" | "trechos">>,
  ) {
    if (patch.metragem != null && (!Number.isFinite(patch.metragem) || patch.metragem < 0))
      return save.set("erro", "Metragem inválida");
    if (patch.trechos != null && (!Number.isInteger(patch.trechos) || patch.trechos < 1))
      return save.set("erro", "Trechos deve ser inteiro ≥ 1");
    save.set("salvando");
    const { error } = await supabase.from("sistemas_dimensionados").update(patch).eq("id", s.id);
    if (error) return save.set("erro", error.message);
    await qc.invalidateQueries({ queryKey: revKeys.sis(revisaoId) });
    agendarRecalculo();
  }

  async function inserir(
    rows: {
      identificacao: string;
      tipo: "TELHADO" | "OVERHEAD";
      metragem: number;
      trechos: number;
    }[],
  ) {
    save.set("salvando");
    const base = lista.reduce((m, s) => Math.max(m, s.ordem), 0);
    const { error } = await supabase.from("sistemas_dimensionados").insert(
      rows.map((r, i) => ({
        ...r,
        organization_id: orgId,
        revisao_id: revisaoId,
        ordem: base + i + 1,
        origem: "manual",
      })),
    );
    if (error) return save.set("erro", error.message);
    await qc.invalidateQueries({ queryKey: revKeys.sis(revisaoId) });
    agendarRecalculo();
  }

  async function remover(s: Sis) {
    if (
      !window.confirm(
        `Excluir o sistema "${s.identificacao || s.ordem}"? A composição será recalculada.`,
      )
    )
      return;
    save.set("salvando");
    const { error } = await supabase.from("sistemas_dimensionados").delete().eq("id", s.id);
    if (error) return save.set("erro", error.message);
    await qc.invalidateQueries({ queryKey: revKeys.sis(revisaoId) });
    agendarRecalculo();
  }

  function aplicarColagem() {
    setErroColar(null);
    const erros: string[] = [];
    const rows = colar
      .trim()
      .split(/\r?\n/)
      .filter(Boolean)
      .map((l, i) => {
        const [id, tipo, m, t] = l.split(/\t|;/).map((x) => x.trim());
        const tp = (tipo ?? "").toUpperCase();
        const metragem = Number((m ?? "").replace(",", "."));
        const trechos = Number(t ?? "1");
        if (!id) erros.push(`Linha ${i + 1}: identificação vazia`);
        if (tp !== "TELHADO" && tp !== "OVERHEAD")
          erros.push(`Linha ${i + 1}: tipo deve ser TELHADO ou OVERHEAD`);
        if (!(metragem > 0)) erros.push(`Linha ${i + 1}: metragem inválida`);
        if (!Number.isInteger(trechos) || trechos < 1)
          erros.push(`Linha ${i + 1}: trechos inválido`);
        return { identificacao: id ?? "", tipo: tp as "TELHADO" | "OVERHEAD", metragem, trechos };
      });
    if (erros.length) return setErroColar(erros.join("; "));
    setColar("");
    inserir(rows);
  }

  const input =
    "h-8 rounded border border-input bg-background px-2 text-sm text-foreground disabled:opacity-60";
  const porSis = new Map((rev.data.resumo?.por_sistema ?? []).map((p) => [p.sistema_id, p]));
  const detalhe = lista.find((s) => s.id === aberto) ?? null;

  return (
    <div className="grid gap-4 xl:grid-cols-[1fr_380px]">
      <Section
        title="Sistemas dimensionados"
        description="TELHADO: metragem total do sistema (trechos não multiplicam). OVERHEAD: metragem de cada trecho × número de trechos."
      >
        {editavel && (
          <div className="mb-3 flex flex-wrap gap-2">
            <ActionButton
              onClick={() =>
                inserir([{ identificacao: "", tipo: "TELHADO", metragem: 0, trechos: 1 }])
              }
            >
              Adicionar sistema
            </ActionButton>
            <ActionButton
              variant="ghost"
              loading={recalc.isPending}
              onClick={() => recalc.mutate()}
            >
              Recalcular agora
            </ActionButton>
          </div>
        )}
        {lista.length === 0 ? (
          <EmptyState
            title="Nenhum sistema dimensionado"
            hint="Adicione sistemas manualmente ou cole linhas de uma planilha. Dimensionamento manual fica identificado como tal."
          />
        ) : (
          <div className="max-h-[65vh] overflow-auto">
            <table className="w-full min-w-[860px] text-sm">
              <thead className="sticky top-0 z-10 bg-card text-left text-xs uppercase text-muted-foreground">
                <tr className="border-b border-border">
                  <th className="px-2 py-2">#</th>
                  <th className="px-2">Identificação / local</th>
                  <th className="px-2">Tipo</th>
                  <th className="px-2 text-right">Metragem</th>
                  <th className="px-2 text-right">Trechos</th>
                  <th className="px-2 text-right">Extensão instalada</th>
                  <th className="px-2 text-right">Consumo de cabo</th>
                  <th className="px-2" />
                </tr>
              </thead>
              <tbody>
                {lista.map((s) => (
                  <tr
                    key={s.id}
                    className={`border-b border-border/60 ${aberto === s.id ? "bg-accent/50" : ""}`}
                  >
                    <td className="px-2 text-muted-foreground">{s.ordem}</td>
                    <td className="px-2 py-2">
                      <input
                        aria-label="Identificação"
                        disabled={!editavel}
                        defaultValue={s.identificacao}
                        key={`i${s.id}${s.identificacao}`}
                        onBlur={(e) =>
                          e.target.value !== s.identificacao &&
                          salvar(s, { identificacao: e.target.value })
                        }
                        className={`${input} w-56 ${!s.identificacao ? "border-warning" : ""}`}
                      />
                    </td>
                    <td className="px-2">
                      <select
                        aria-label="Tipo"
                        disabled={!editavel}
                        value={s.tipo}
                        onChange={(e) =>
                          salvar(s, { tipo: e.target.value as "TELHADO" | "OVERHEAD" })
                        }
                        className={input}
                      >
                        <option value="TELHADO">TELHADO</option>
                        <option value="OVERHEAD">OVERHEAD</option>
                      </select>
                    </td>
                    <td className="px-2 text-right">
                      <label className="inline-flex items-center gap-1">
                        <input
                          aria-label="Metragem"
                          type="number"
                          min={0}
                          step="0.01"
                          disabled={!editavel}
                          defaultValue={Number(s.metragem)}
                          key={`m${s.id}${s.metragem}`}
                          onBlur={(e) =>
                            Number(e.target.value) !== Number(s.metragem) &&
                            salvar(s, { metragem: Number(e.target.value) })
                          }
                          className={`${input} w-24 text-right tabular-nums`}
                        />
                        <span className="text-xs text-muted-foreground">
                          {s.tipo === "TELHADO" ? "m total" : "m/trecho"}
                        </span>
                      </label>
                    </td>
                    <td className="px-2 text-right">
                      <input
                        aria-label="Trechos"
                        type="number"
                        min={1}
                        step={1}
                        disabled={!editavel}
                        defaultValue={s.trechos}
                        key={`t${s.id}${s.trechos}`}
                        onBlur={(e) =>
                          Number(e.target.value) !== s.trechos &&
                          salvar(s, { trechos: Number(e.target.value) })
                        }
                        className={`${input} w-16 text-right tabular-nums`}
                      />
                    </td>
                    <td className="px-2 text-right tabular-nums">
                      {qtd(
                        extensaoInstalada({
                          tipo: s.tipo,
                          metragem: Number(s.metragem),
                          trechos: s.trechos,
                        }),
                        "m",
                      )}
                    </td>
                    <td className="px-2 text-right tabular-nums">
                      {qtd(
                        consumoCabo(
                          { tipo: s.tipo, metragem: Number(s.metragem), trechos: s.trechos },
                          regras,
                        ),
                        "m",
                      )}
                    </td>
                    <td className="whitespace-nowrap px-2 text-right">
                      <button
                        className="text-xs text-primary hover:underline"
                        onClick={() => setAberto(s.id)}
                      >
                        Composição
                      </button>
                      {editavel && (
                        <>
                          <button
                            className="ml-2 text-xs text-muted-foreground hover:underline"
                            onClick={() =>
                              inserir([
                                {
                                  identificacao: `${s.identificacao} (cópia)`,
                                  tipo: s.tipo,
                                  metragem: Number(s.metragem),
                                  trechos: s.trechos,
                                },
                              ])
                            }
                          >
                            Duplicar
                          </button>
                          <button
                            className="ml-2 text-xs text-destructive hover:underline"
                            onClick={() => remover(s)}
                          >
                            Excluir
                          </button>
                        </>
                      )}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
        {editavel && (
          <details className="mt-4">
            <summary className="cursor-pointer text-xs text-muted-foreground">
              Colar sistemas (identificação ⇥ tipo ⇥ metragem ⇥ trechos)
            </summary>
            <textarea
              value={colar}
              onChange={(e) => setColar(e.target.value)}
              rows={4}
              className="mt-2 w-full rounded border border-input bg-background p-2 font-mono text-xs text-foreground"
              placeholder={"Pav.IV - Overhead\tOVERHEAD\t120\t4"}
            />
            {erroColar && <p className="text-xs text-destructive">{erroColar}</p>}
            <ActionButton variant="ghost" onClick={aplicarColagem} disabled={!colar.trim()}>
              Validar e inserir
            </ActionButton>
          </details>
        )}
      </Section>
      <aside className="rounded-lg border border-border bg-card p-4 text-sm xl:sticky xl:top-40 xl:self-start">
        {!detalhe ? (
          <p className="text-muted-foreground">
            Abra “Composição” para ver componentes, memória de cálculo e ajustes.
          </p>
        ) : (
          <Composicao
            revisaoId={revisaoId}
            sistema={detalhe}
            editavel={editavel}
            itens={itens}
            desatualizada={rev.data.desatualizada}
            extensao={porSis.get(detalhe.id)?.extensao_m ?? null}
            onChange={() => recalc.mutate()}
          />
        )}
      </aside>
    </div>
  );
}

function Composicao({
  revisaoId,
  sistema,
  editavel,
  itens,
  desatualizada,
  extensao,
  onChange,
}: {
  revisaoId: string;
  sistema: Sis;
  editavel: boolean;
  itens: ReturnType<typeof useItens>;
  desatualizada: boolean;
  extensao: number | null;
  onChange: () => void;
}) {
  const save = useSave();
  if (itens.isPending) return <LoadingState />;
  if (itens.isError) return <ErrorState error={itens.error} onRetry={() => itens.refetch()} />;
  const linhas = (itens.data ?? []).filter((i) => i.sistema_id === sistema.id);

  async function ajustar(id: string, atual: number) {
    const v = window.prompt("Nova quantidade (vazio remove o ajuste manual):", String(atual));
    if (v === null) return;
    if (v.trim() === "") {
      save.set("salvando");
      const { error } = await supabase
        .from("sistema_componentes")
        .update({ override_quantidade: null, override_justificativa: null })
        .eq("id", id);
      if (error) return save.set("erro", error.message);
      return onChange();
    }
    const n = Number(v.replace(",", "."));
    if (!Number.isFinite(n) || n < 0) return save.set("erro", "Quantidade inválida");
    const just = window.prompt("Justificativa do ajuste manual:");
    if (!just || just.trim().length < 3) return save.set("erro", "Justificativa obrigatória");
    save.set("salvando");
    const { error } = await supabase
      .from("sistema_componentes")
      .update({ override_quantidade: n, override_justificativa: just.trim() })
      .eq("id", id);
    if (error) return save.set("erro", error.message);
    onChange();
  }

  return (
    <div className="space-y-2">
      <p className="font-medium text-foreground">
        {sistema.identificacao || "(sem identificação)"}
      </p>
      <p className="text-xs text-muted-foreground">
        {sistema.tipo} · extensão {qtd(extensao, "m")} · origem {sistema.origem}
      </p>
      {desatualizada && (
        <p className="text-xs text-warning">Composição será atualizada após o recálculo.</p>
      )}
      {linhas.length === 0 ? (
        <p className="text-xs text-muted-foreground">
          Sem composição. Informe identificação e metragem.
        </p>
      ) : (
        <ul className="divide-y divide-border/60 text-xs">
          {linhas.map((l) => {
            const c = l.revisao_componentes as unknown as {
              codigo: string;
              descricao: string;
              unidade: string;
            } | null;
            return (
              <li key={l.id} className="py-1.5">
                <div className="flex justify-between gap-2">
                  <span className="text-foreground">
                    <span className="font-mono text-primary">{c?.codigo}</span> {c?.descricao}
                  </span>
                  <span className="whitespace-nowrap tabular-nums text-foreground">
                    {qtd(Number(l.quantidade), c?.unidade)}
                  </span>
                </div>
                <p className="text-muted-foreground">
                  Ver cálculo: {l.memoria} = {qtd(Number(l.quantidade_tecnica), c?.unidade, 4)}{" "}
                  técnico
                  {l.override_quantidade != null && (
                    <span className="text-warning">
                      {" "}
                      · ajuste manual: {l.override_justificativa}
                    </span>
                  )}
                </p>
                {editavel && (
                  <button
                    className="text-primary hover:underline"
                    onClick={() => ajustar(l.id, Number(l.quantidade))}
                  >
                    Ajustar quantidade
                  </button>
                )}
              </li>
            );
          })}
        </ul>
      )}
      <p className="text-[11px] text-muted-foreground">
        Fórmulas de pilares/intermediárias (⌈m ÷ espaçamento⌉ ± 1) aguardam validação da Engenharia;
        ajustáveis em Engenharia › Regras.
      </p>
    </div>
  );
}
