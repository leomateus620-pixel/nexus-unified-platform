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

import { CollectionPage, ObjectCollection, SystemCard, ObjectCard, Facts } from "./ui/ObjectCards";
import { useEditorDialog } from "./ui/useEditorDialog";
import { EditorInput, EditorInspector, EditorSaveState } from "./ui/EditorWorkspace";

type Sis = NonNullable<ReturnType<typeof useSistemas>["data"]>[number];

export function Dimensionamento({ revisaoId }: { revisaoId: string }) {
  const rev = useRevisao(revisaoId);
  const sis = useSistemas(revisaoId);
  const itens = useItens(revisaoId);
  const recalc = useRecalcular(revisaoId);
  const save = useSave();
  const register = save.register;
  const orgId = useOrgId();
  const qc = useQueryClient();
  const [aberto, setAberto] = useState<string | null>(null);
  const [colar, setColar] = useState("");
  const [preview, setPreview] = useState<
    Pick<Sis, "identificacao" | "tipo" | "metragem" | "trechos">[] | null
  >(null);
  const [erroColar, setErroColar] = useState<string | null>(null);
  const { ask, dialog } = useEditorDialog();
  const [mode, setMode] = useState<"edit" | "composition">("edit");
  const timer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const inspectorTrigger = useRef<HTMLButtonElement | null>(null);

  useEffect(
    () => () => {
      if (timer.current) clearTimeout(timer.current);
    },
    [],
  );

  useEffect(
    () =>
      register("sistemas", () => {
        if (timer.current) clearTimeout(timer.current);
      }),
    [register],
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
    return save.run(`sistema-${s.id}`, async () => {
      if (patch.metragem != null && (!Number.isFinite(patch.metragem) || patch.metragem < 0))
        throw new Error("Metragem inválida");
      if (patch.trechos != null && (!Number.isInteger(patch.trechos) || patch.trechos < 1))
        throw new Error("Trechos deve ser inteiro ≥ 1");
      save.set("salvando");
      let request = supabase.from("sistemas_dimensionados").update(patch).eq("id", s.id);
      for (const field of Object.keys(patch) as (keyof typeof patch)[])
        request = request.eq(field, s[field]);
      const { data, error } = await request.select("id");
      if (!error && !data?.length)
        throw new Error(
          "Conflito neste sistema: outro usuário alterou o campo. Trabalho local preservado.",
        );
      if (error) throw new Error(error.message);
      await Promise.all([
        qc.invalidateQueries({ queryKey: revKeys.sis(revisaoId) }),
        qc.invalidateQueries({ queryKey: revKeys.head(revisaoId) }),
      ]);
      agendarRecalculo();
      return true;
    });
  }

  async function inserir(
    rows: {
      identificacao: string;
      tipo: "TELHADO" | "OVERHEAD";
      metragem: number;
      trechos: number;
    }[],
  ) {
    return save.run("inserir-sistemas", async () => {
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
      if (error) throw new Error(error.message);
      await Promise.all([
        qc.invalidateQueries({ queryKey: revKeys.sis(revisaoId) }),
        qc.invalidateQueries({ queryKey: revKeys.head(revisaoId) }),
      ]);
      agendarRecalculo();
      return true;
    });
  }

  async function remover(s: Sis) {
    if (
      !(await ask({
        title: "Excluir sistema",
        description: `Excluir o sistema "${s.identificacao || s.ordem}"? A composição será recalculada.`,
      }))
    )
      return;
    return save.run(`sistema-${s.id}`, async () => {
      const { error } = await supabase.from("sistemas_dimensionados").delete().eq("id", s.id);
      if (error) throw new Error(error.message);
      await Promise.all([
        qc.invalidateQueries({ queryKey: revKeys.sis(revisaoId) }),
        qc.invalidateQueries({ queryKey: revKeys.head(revisaoId) }),
      ]);
      agendarRecalculo();
      return true;
    });
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
    setPreview(rows);
  }

  const input = "nx-editor-input";
  const porSis = new Map((rev.data.resumo?.por_sistema ?? []).map((p) => [p.sistema_id, p]));
  const detalhe = lista.find((s) => s.id === aberto) ?? null;

  return (
    <div className="nx-editor-workspace" data-inspector={!!detalhe}>
      <Section
        className="nx-collection-section"
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
          <CollectionPage items={lista}>
            {(visible) => (
              <ObjectCollection label="Sistemas dimensionados">
                {visible.map((s) => {
                  const valid =
                    !!s.identificacao.trim() &&
                    Number(s.metragem) > 0 &&
                    Number.isInteger(s.trechos) &&
                    s.trechos >= 1;
                  const confirmed = !rev.data.desatualizada ? porSis.get(s.id) : null;
                  return (
                    <SystemCard
                      key={s.id}
                      name={s.identificacao}
                      number={s.ordem}
                      type={s.tipo}
                      origin={s.origem}
                      selected={aberto === s.id}
                      preview={!confirmed}
                      problems={[
                        ...(!s.identificacao.trim() ? ["Identificação pendente"] : []),
                        ...(Number(s.metragem) <= 0 ? ["Informe metragem maior que zero"] : []),
                        ...(!Number.isInteger(s.trechos) || s.trechos < 1
                          ? ["Trechos deve ser inteiro ≥ 1"]
                          : []),
                      ]}
                      facts={[
                        [
                          s.tipo === "TELHADO" ? "Metragem total" : "Metros por trecho",
                          qtd(Number(s.metragem), "m"),
                        ],
                        ["Trechos", s.trechos],
                        [
                          "Extensão instalada",
                          valid
                            ? qtd(
                                confirmed?.extensao_m ??
                                  extensaoInstalada({
                                    tipo: s.tipo,
                                    metragem: Number(s.metragem),
                                    trechos: s.trechos,
                                  }),
                                "m",
                              )
                            : "Entrada pendente",
                        ],
                        [
                          "Consumo de cabo",
                          valid
                            ? qtd(
                                confirmed?.cabo_m ??
                                  consumoCabo(
                                    {
                                      tipo: s.tipo,
                                      metragem: Number(s.metragem),
                                      trechos: s.trechos,
                                    },
                                    regras,
                                  ),
                                "m",
                              )
                            : "Entrada pendente",
                        ],
                      ]}
                    >
                      <button
                        type="button"
                        className="nx-card-primary"
                        aria-label={`${editavel ? "Editar" : "Consultar"} sistema ${s.ordem}`}
                        onClick={(e) => {
                          inspectorTrigger.current = e.currentTarget;
                          setMode("edit");
                          setAberto(s.id);
                        }}
                      >
                        {editavel ? "Editar sistema" : "Consultar sistema"}
                        <span aria-hidden="true">↗</span>
                      </button>
                      <button
                        className="nx-editor-link"
                        aria-label={`Ver composição de ${s.identificacao || `sistema ${s.ordem}`}`}
                        onClick={(e) => {
                          inspectorTrigger.current = e.currentTarget;
                          setMode("composition");
                          setAberto(s.id);
                        }}
                      >
                        Ver composição
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
                          <button className="nx-editor-link" data-danger onClick={() => remover(s)}>
                            Excluir
                          </button>
                        </>
                      )}
                    </SystemCard>
                  );
                })}
              </ObjectCollection>
            )}
          </CollectionPage>
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
                onChange={(e) => {
                  setColar(e.target.value);
                  setPreview(null);
                }}
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
            {preview && (
              <div className="nx-paste-preview">
                <h3>Prévia · {preview.length} sistemas</h3>
                <ObjectCollection label="Prévia dos sistemas colados">
                  {preview.map((row, index) => (
                    <ObjectCard key={index} title={row.identificacao} eyebrow={row.tipo}>
                      <Facts
                        items={[
                          ["Metragem", qtd(Number(row.metragem), "m")],
                          ["Trechos", row.trechos],
                        ]}
                      />
                    </ObjectCard>
                  ))}
                </ObjectCollection>
                <div className="nx-object-actions">
                  <ActionButton
                    onClick={() => {
                      void inserir(preview).then((ok) => {
                        if (ok) {
                          setPreview(null);
                          setColar("");
                        }
                      });
                    }}
                  >
                    Confirmar inserção
                  </ActionButton>
                  <ActionButton variant="ghost" onClick={() => setPreview(null)}>
                    Cancelar colagem
                  </ActionButton>
                </div>
              </div>
            )}
            <ActionButton variant="ghost" onClick={aplicarColagem} disabled={!colar.trim()}>
              Preparar prévia
            </ActionButton>
          </details>
        )}
      </Section>
      <EditorInspector
        open={!!detalhe}
        title={mode === "edit" ? "Editar sistema" : "Composição"}
        description="Componentes vinculados ao sistema selecionado"
        onClose={() => setAberto(null)}
        returnFocus={inspectorTrigger}
      >
        {detalhe &&
          (mode === "edit" ? (
            <div className="nx-inspector-fields" key={detalhe.id}>
              <h3>{detalhe.identificacao || "Novo sistema"}</h3>
              <label className="nx-editor-field">
                Identificação / local
                <EditorInput
                  aria-label={`Identificação do sistema ${detalhe.ordem}`}
                  disabled={!editavel}
                  defaultValue={detalhe.identificacao}
                  onBlur={(e) =>
                    e.target.value !== detalhe.identificacao &&
                    salvar(detalhe, { identificacao: e.target.value })
                  }
                  className={input}
                />
              </label>
              <label className="nx-editor-field">
                Tipo
                <select
                  disabled={!editavel}
                  value={detalhe.tipo}
                  className={input}
                  onChange={(e) =>
                    salvar(detalhe, { tipo: e.target.value as "TELHADO" | "OVERHEAD" })
                  }
                >
                  <option value="TELHADO">Telhado (TELHADO)</option>
                  <option value="OVERHEAD">Suspenso (OVERHEAD)</option>
                </select>
              </label>
              <label className="nx-editor-field">
                {detalhe.tipo === "TELHADO" ? "Metragem total · m" : "Metragem por trecho · m"}
                <EditorInput
                  aria-label={`Metragem do sistema ${detalhe.ordem}`}
                  type="number"
                  min={0}
                  step="0.01"
                  disabled={!editavel}
                  defaultValue={Number(detalhe.metragem)}
                  onBlur={(e) =>
                    Number(e.target.value) !== Number(detalhe.metragem) &&
                    salvar(detalhe, { metragem: Number(e.target.value) })
                  }
                  className={input}
                />
              </label>
              <label className="nx-editor-field">
                Trechos
                <EditorInput
                  aria-label={`Trechos do sistema ${detalhe.ordem}`}
                  type="number"
                  min={1}
                  step={1}
                  disabled={!editavel}
                  defaultValue={detalhe.trechos}
                  onBlur={(e) =>
                    Number(e.target.value) !== detalhe.trechos &&
                    salvar(detalhe, { trechos: Number(e.target.value) })
                  }
                  className={input}
                />
              </label>
              <p className="nx-editor-note">
                TELHADO usa metragem total. OVERHEAD usa metros por trecho × trechos. Ilustração do
                card indica apenas categoria.
              </p>
              <button className="nx-editor-link" onClick={() => setMode("composition")}>
                Ver composição
              </button>
            </div>
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
          ))}
      </EditorInspector>
      {dialog}
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
  const { ask, dialog } = useEditorDialog();
  if (itens.isPending) return <LoadingState />;
  if (itens.isError) return <ErrorState error={itens.error} onRetry={() => itens.refetch()} />;
  const linhas = (itens.data ?? []).filter((i) => i.sistema_id === sistema.id);

  async function ajustar(id: string, atual: number) {
    const answer = await ask({
      title: "Ajustar quantidade",
      label: "Nova quantidade (vazio remove o ajuste manual)",
      initial: String(atual),
      reason: true,
    });
    if (!answer) return;
    return save.run(`override-${id}`, async () => {
      const v = answer.value;
      if (v.trim() === "") {
        save.set("salvando");
        const { error } = await supabase
          .from("sistema_componentes")
          .update({ override_quantidade: null, override_justificativa: null })
          .eq("id", id);
        if (error) throw new Error(error.message);
        return onChange();
      }
      const n = Number(v.replace(",", "."));
      if (!Number.isFinite(n) || n < 0) throw new Error("Quantidade inválida");
      const just = answer.reason;
      if (!just || just.trim().length < 3) throw new Error("Justificativa obrigatória");
      save.set("salvando");
      const { error } = await supabase
        .from("sistema_componentes")
        .update({ override_quantidade: n, override_justificativa: just.trim() })
        .eq("id", id);
      if (error) throw new Error(error.message);
      onChange();
    });
  }

  return (
    <div>
      {dialog}
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
