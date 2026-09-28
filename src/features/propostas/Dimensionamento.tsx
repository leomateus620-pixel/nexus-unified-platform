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

import { EditorInput, EditorInspector, EditorSaveState } from "./ui/EditorWorkspace";

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
  const inspectorTrigger = useRef<HTMLButtonElement | null>(null);

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

  const input = "nx-editor-input";
  const porSis = new Map((rev.data.resumo?.por_sistema ?? []).map((p) => [p.sistema_id, p]));
  const detalhe = lista.find((s) => s.id === aberto) ?? null;

  return (
    <div className="nx-editor-workspace" data-inspector={!!detalhe}>
      <Section
        title="Sistemas dimensionados"
        description="Identifique o local, defina o sistema e consulte sua composição."
      >
        <div className="nx-editor-toolbar nx-dimension-toolbar">
          {editavel && (
            <>
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
            </>
          )}
          <span className="nx-editor-count">{lista.length} sistema(s)</span>
          <EditorSaveState editavel={editavel} />
        </div>
        {rev.data.desatualizada && (
          <p className="nx-editor-note" data-warning role="status">
            Cálculo pendente · a composição será atualizada após o recálculo.
          </p>
        )}
        {lista.length === 0 ? (
          <EmptyState
            title="Nenhum sistema dimensionado"
            hint="Adicione sistemas manualmente ou cole linhas de uma planilha. Dimensionamento manual fica identificado como tal."
          />
        ) : (
          <>
            <p className="nx-editor-scroll-hint">
              Na tabela, role horizontalmente para consultar todos os campos.
            </p>
            <div
              className="nx-editor-table-wrap"
              tabIndex={0}
              role="region"
              aria-label="Sistemas dimensionados, tabela com rolagem horizontal"
            >
              <table className="nx-editor-table nx-dimension-table" role="table">
                <thead role="rowgroup">
                  <tr role="row">
                    <th scope="col" role="columnheader">
                      Identificação / local
                    </th>
                    <th scope="col" role="columnheader">
                      Tipo
                    </th>
                    <th scope="col" role="columnheader" data-numeric>
                      Metragem
                    </th>
                    <th scope="col" role="columnheader" data-numeric>
                      Trechos
                    </th>
                    <th scope="col" role="columnheader" data-numeric>
                      m instalados
                    </th>
                    <th scope="col" role="columnheader" data-numeric>
                      Cabo
                    </th>
                    <th scope="col" role="columnheader">
                      Ações
                    </th>
                  </tr>
                </thead>
                <tbody role="rowgroup">
                  {lista.map((s) => (
                    <tr key={s.id} role="row" data-selected={aberto === s.id}>
                      <td
                        role="cell"
                        data-label="Identificação / local"
                        className="nx-editor-identity-cell nx-dimension-identity"
                      >
                        <EditorInput
                          aria-label={`Identificação do sistema ${s.ordem}`}
                          disabled={!editavel}
                          defaultValue={s.identificacao}
                          key={`i${s.id}${s.identificacao}`}
                          onBlur={(e) =>
                            e.target.value !== s.identificacao &&
                            salvar(s, { identificacao: e.target.value })
                          }
                          className={`${input} ${!s.identificacao ? "border-warning" : ""}`}
                        />
                        <small>
                          #{s.ordem} · origem {s.origem}
                          {!s.identificacao ? " · identificação pendente" : ""}
                        </small>
                      </td>
                      <td role="cell" data-label="Tipo">
                        <select
                          aria-label={`Tipo do sistema ${s.ordem}`}
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
                      <td
                        role="cell"
                        data-label={s.tipo === "TELHADO" ? "Metragem total" : "Metros por trecho"}
                        data-numeric
                      >
                        <label className="nx-dimension-inputs">
                          <EditorInput
                            aria-label={`Metragem do sistema ${s.ordem}`}
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
                            className={`${input} text-right tabular-nums`}
                          />
                          <span>{s.tipo === "TELHADO" ? "m total" : "m/trecho"}</span>
                        </label>
                      </td>
                      <td role="cell" data-label="Trechos" data-numeric>
                        <EditorInput
                          aria-label={`Trechos do sistema ${s.ordem}`}
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
                          className={`${input} w-20 text-right tabular-nums`}
                        />
                      </td>
                      <td role="cell" data-label="Extensão instalada" data-numeric>
                        {qtd(
                          extensaoInstalada({
                            tipo: s.tipo,
                            metragem: Number(s.metragem),
                            trechos: s.trechos,
                          }),
                          "m",
                        )}
                      </td>
                      <td role="cell" data-label="Consumo de cabo" data-numeric>
                        {qtd(
                          consumoCabo(
                            { tipo: s.tipo, metragem: Number(s.metragem), trechos: s.trechos },
                            regras,
                          ),
                          "m",
                        )}
                      </td>
                      <td role="cell" className="nx-record-actions">
                        <div className="nx-dimension-actions">
                          <button
                            className="nx-editor-link"
                            aria-label={`Ver composição de ${s.identificacao || `sistema ${s.ordem}`}`}
                            aria-expanded={aberto === s.id}
                            onClick={(event) => {
                              inspectorTrigger.current = event.currentTarget;
                              setAberto(s.id);
                            }}
                          >
                            Composição<span aria-hidden="true">↗</span>
                          </button>
                          {editavel && (
                            <>
                              <button
                                className="nx-editor-link"
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
                                className="nx-editor-link"
                                data-danger
                                onClick={() => remover(s)}
                              >
                                Excluir
                              </button>
                            </>
                          )}
                        </div>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </>
        )}
        <p className="nx-editor-note">
          <strong>TELHADO</strong> usa a metragem total, sem multiplicar trechos.{" "}
          <strong>OVERHEAD</strong> usa metros por trecho × trechos.
        </p>
        {editavel && (
          <details className="nx-editor-paste">
            <summary>Colar sistemas de planilha</summary>
            <label className="nx-editor-field">
              Identificação ⇥ tipo ⇥ metragem ⇥ trechos
              <textarea
                value={colar}
                onChange={(e) => setColar(e.target.value)}
                rows={4}
                className={input}
                aria-invalid={!!erroColar}
                aria-describedby={erroColar ? "nx-system-paste-error" : undefined}
                placeholder={"Pav.IV - Overhead\tOVERHEAD\t120\t4"}
              />
            </label>
            {erroColar && (
              <p id="nx-system-paste-error" className="nx-editor-error" role="alert">
                {erroColar}
              </p>
            )}
            <ActionButton variant="ghost" onClick={aplicarColagem} disabled={!colar.trim()}>
              Validar e inserir
            </ActionButton>
          </details>
        )}
      </Section>
      <EditorInspector
        open={!!detalhe}
        title="Composição"
        description="Componentes vinculados ao sistema selecionado"
        onClose={() => setAberto(null)}
        returnFocus={inspectorTrigger}
      >
        {detalhe && (
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
      </EditorInspector>
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
    <div>
      <div className="nx-inspector-identity">
        <span className="nx-editor-code">
          SISTEMA {sistema.ordem} · {sistema.tipo}
        </span>
        <h3>{sistema.identificacao || "(sem identificação)"}</h3>
        <span className="nx-editor-meta">Origem: {sistema.origem}</span>
      </div>
      <dl className="nx-inspector-dl">
        <div>
          <dt>Extensão calculada</dt>
          <dd>{qtd(extensao, "m")}</dd>
        </div>
      </dl>
      {desatualizada && (
        <p className="nx-editor-note" data-warning>
          Composição será atualizada após o recálculo.
        </p>
      )}
      {linhas.length === 0 ? (
        <p className="nx-editor-note">Sem composição. Informe identificação e metragem.</p>
      ) : (
        <ul className="nx-composition-list">
          {linhas.map((l) => {
            const c = l.revisao_componentes as unknown as {
              codigo: string;
              descricao: string;
              unidade: string;
            } | null;
            return (
              <li key={l.id}>
                <div className="nx-composition-item">
                  <div>
                    <span className="nx-editor-code">{c?.codigo ?? "Componente"}</span>
                    <span className="nx-editor-description">
                      {c?.descricao ?? "Descrição indisponível"}
                    </span>
                  </div>
                  <span>{qtd(Number(l.quantidade), c?.unidade)}</span>
                </div>
                <details className="nx-composition-memory">
                  <summary>Ver memória de cálculo</summary>
                  <p>
                    {l.memoria} = {qtd(Number(l.quantidade_tecnica), c?.unidade, 4)} técnico
                  </p>
                </details>
                {l.override_quantidade != null && (
                  <p className="nx-editor-note" data-warning>
                    Ajuste manual: {l.override_justificativa}
                  </p>
                )}
                {editavel && (
                  <button
                    className="nx-editor-link"
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
      <EditorSaveState editavel={editavel} />
      <p className="nx-editor-note" data-warning>
        Fórmulas de pilares/intermediárias (⌈m ÷ espaçamento⌉ ± 1) aguardam validação da Engenharia;
        ajustáveis em Engenharia › Regras.
      </p>
    </div>
  );
}
