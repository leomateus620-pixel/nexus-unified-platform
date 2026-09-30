import { useQueryClient } from "@tanstack/react-query";
import { useEffect, useRef, useState } from "react";
import { Plus, Route, House } from "lucide-react";

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
import { revKeys, useItens, useRevisao, useSave, useSistemas } from "./hooks";

import { CollectionPage, ObjectCollection, SystemCard, ObjectCard, Facts } from "./ui/ObjectCards";
import { useEditorDialog } from "./ui/useEditorDialog";
import { EditorInput, EditorInspector, EditorSaveState } from "./ui/EditorWorkspace";

type Sis = NonNullable<ReturnType<typeof useSistemas>["data"]>[number];

export function Dimensionamento({ revisaoId }: { revisaoId: string }) {
  const rev = useRevisao(revisaoId);
  const sis = useSistemas(revisaoId);
  const itens = useItens(revisaoId);
  const save = useSave();
  const orgId = useOrgId();
  const qc = useQueryClient();
  const acknowledged = useRef(new Map<string, Partial<Sis>>());
  useEffect(() => {
    for (const [id, patch] of acknowledged.current) {
      const current = sis.data?.find((row) => row.id === id);
      if (
        current &&
        Object.entries(patch).some(([field, value]) => current[field as keyof Sis] !== value)
      )
        acknowledged.current.delete(id);
    }
  }, [sis.data]);
  const [aberto, setAberto] = useState<string | null>(null);
  const [creating, setCreating] = useState(false);
  const insertion = useRef<Promise<boolean | undefined> | null>(null);
  const [colar, setColar] = useState("");
  const [preview, setPreview] = useState<
    Pick<Sis, "identificacao" | "tipo" | "metragem" | "trechos">[] | null
  >(null);
  const [erroColar, setErroColar] = useState<string | null>(null);
  const { ask, dialog } = useEditorDialog();
  const [mode, setMode] = useState<"edit" | "composition">("edit");
  const inspectorTrigger = useRef<HTMLButtonElement | null>(null);

  if (rev.isPending || sis.isPending) return <LoadingState />;
  if (rev.isError) return <ErrorState error={rev.error} onRetry={() => rev.refetch()} />;
  if (sis.isError) return <ErrorState error={sis.error} onRetry={() => sis.refetch()} />;
  const editavel = rev.data.editavel;
  const regras = mesclarRegras(rev.data.regras);
  const lista = sis.data ?? [];

  async function salvar(
    s: Sis,
    patch: Partial<Pick<Sis, "identificacao" | "tipo" | "metragem" | "trechos">>,
  ) {
    const fields = Object.keys(patch).sort().join(",");
    return save.run(`sistema-${s.id}:${fields}`, async () => {
      const expected = { ...s, ...acknowledged.current.get(s.id) };
      if (Object.entries(patch).every(([field, value]) => expected[field as keyof Sis] === value))
        return true;
      if (patch.metragem != null && (!Number.isFinite(patch.metragem) || patch.metragem < 0))
        throw new Error("Metragem inválida");
      if (patch.trechos != null && (!Number.isInteger(patch.trechos) || patch.trechos < 1))
        throw new Error("Trechos deve ser inteiro ≥ 1");
      save.set("salvando");
      let request = supabase.from("sistemas_dimensionados").update(patch).eq("id", s.id);
      for (const field of Object.keys(patch) as (keyof typeof patch)[])
        request = request.eq(field, expected[field]);
      const { data, error } = await request.select("id");
      if (!error && !data?.length) {
        const replay = await supabase
          .from("sistemas_dimensionados")
          .select("*")
          .eq("id", s.id)
          .single();
        const alreadyApplied =
          !replay.error &&
          replay.data &&
          Object.entries(patch).every(
            ([field, value]) => replay.data[field as keyof Sis] === value,
          );
        if (!alreadyApplied)
          throw new Error(
            "Conflito neste sistema: outro usuário alterou o campo. Trabalho local preservado.",
          );
      }
      if (error) throw new Error(error.message);
      acknowledged.current.set(s.id, { ...acknowledged.current.get(s.id), ...patch });
      await Promise.all([
        qc.invalidateQueries({ queryKey: revKeys.sis(revisaoId) }),
        qc.invalidateQueries({ queryKey: revKeys.head(revisaoId) }),
      ]);
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
    if (insertion.current) return insertion.current;
    setCreating(true);
    const base = lista.reduce((m, s) => Math.max(m, s.ordem), 0);
    const records = rows.map((r, i) => ({
      ...r,
      id: crypto.randomUUID(),
      organization_id: orgId,
      revisao_id: revisaoId,
      ordem: base + i + 1,
      origem: "manual",
    }));
    insertion.current = save
      .run(
        `inserir-sistemas-${records
          .map((record) => record.id)
          .sort()
          .join(",")}`,
        async () => {
          const { error } = await supabase
            .from("sistemas_dimensionados")
            .upsert(records, { onConflict: "id", ignoreDuplicates: true });
          if (error) throw new Error(error.message);
          await Promise.all([
            qc.invalidateQueries({ queryKey: revKeys.sis(revisaoId) }),
            qc.invalidateQueries({ queryKey: revKeys.head(revisaoId) }),
          ]);
          if (rows.length === 1) {
            setMode("edit");
            setAberto(records[0]!.id);
          }
          return true;
        },
      )
      .finally(() => {
        insertion.current = null;
        setCreating(false);
      });
    return insertion.current;
  }

  async function remover(s: Sis) {
    if (
      !(await ask({
        title: "Excluir sistema",
        description: `Excluir o sistema "${s.identificacao || s.ordem}"? A composição será recalculada.`,
      }))
    )
      return;
    return save.run(`excluir-sistema-${s.id}`, async () => {
      const { error } = await supabase.from("sistemas_dimensionados").delete().eq("id", s.id);
      if (error) throw new Error(error.message);
      await Promise.all([
        qc.invalidateQueries({ queryKey: revKeys.sis(revisaoId) }),
        qc.invalidateQueries({ queryKey: revKeys.head(revisaoId) }),
      ]);
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
                loading={creating}
                onClick={(event) => {
                  inspectorTrigger.current = event.currentTarget;
                  void inserir([{ identificacao: "", tipo: "TELHADO", metragem: 0, trechos: 1 }]);
                }}
              >
                <Plus size={17} aria-hidden="true" />
                Adicionar sistema
              </ActionButton>
            </>
          )}
          <span className="nx-editor-count">{lista.length} sistema(s)</span>
          <EditorSaveState editavel={editavel} />
        </div>
        <details className="nx-system-categories">
          <summary>Categorias e critérios de medida</summary>
          <div className="nx-system-guide" aria-label="Categorias calculáveis">
            <p>
              <House size={18} aria-hidden="true" />
              <strong>Telhado</strong>
              <span>Metragem total, sem multiplicar trechos.</span>
            </p>
            <p>
              <Route size={18} aria-hidden="true" />
              <strong>Suspenso · OVERHEAD</strong>
              <span>Metros por trecho × quantidade de trechos.</span>
            </p>
          </div>
          <p className="nx-editor-note">
            Categorias adicionais precisam de regras de engenharia, unidade e componentes definidos.
            Esta revisão mantém seu snapshot de regras.
          </p>
        </details>
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
                  const calculationState = !valid
                    ? "invalid"
                    : rev.data.desatualizada
                      ? "stale"
                      : !confirmed || confirmed.extensao_m <= 0
                        ? "pending"
                        : "updated";
                  return (
                    <SystemCard
                      key={s.id}
                      name={s.identificacao}
                      number={s.ordem}
                      type={s.tipo}
                      origin={s.origem}
                      selected={aberto === s.id}
                      reference={s.id.slice(0, 8)}
                      calculationState={calculationState}
                      onOpen={(trigger) => {
                        inspectorTrigger.current = trigger;
                        setMode("edit");
                        setAberto(s.id);
                      }}
                      openLabel={`${editavel ? "Editar" : "Consultar"} sistema ${s.ordem}`}
                      preview={!confirmed}
                      problems={[
                        ...(!s.identificacao.trim() ? ["Identificação pendente"] : []),
                        ...(Number(s.metragem) <= 0 ? ["Informe metragem maior que zero"] : []),
                        ...(!Number.isInteger(s.trechos) || s.trechos < 1
                          ? ["Trechos deve ser inteiro ≥ 1"]
                          : []),
                        ...(valid && confirmed && confirmed.extensao_m <= 0
                          ? [
                              "Entradas preenchidas; extensão registrada zero. Confira este sistema.",
                            ]
                          : []),
                      ]}
                      facts={[
                        [
                          confirmed ? "Extensão" : "Extensão · prévia",
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
                          "Cabo",
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
                    </SystemCard>
                  );
                })}
              </ObjectCollection>
            )}
          </CollectionPage>
        )}
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
              <span className="nx-editor-code">
                Sistema #{detalhe.ordem} · {detalhe.id}
              </span>
              <label className="nx-editor-field">
                Identificação / local
                <EditorInput
                  draftKey={`sistema-${detalhe.id}-identificacao`}
                  required
                  aria-label={`Identificação do sistema ${detalhe.ordem}`}
                  disabled={!editavel}
                  defaultValue={detalhe.identificacao}
                  onCommit={(value) => salvar(detalhe, { identificacao: value })}
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
                  draftKey={`sistema-${detalhe.id}-metragem`}
                  required
                  aria-label={`Metragem do sistema ${detalhe.ordem}`}
                  type="number"
                  min={0.01}
                  step="0.01"
                  disabled={!editavel}
                  defaultValue={Number(detalhe.metragem)}
                  onCommit={(value) => salvar(detalhe, { metragem: Number(value) })}
                  className={input}
                />
              </label>
              <label className="nx-editor-field">
                Trechos
                <EditorInput
                  draftKey={`sistema-${detalhe.id}-trechos`}
                  required
                  aria-label={`Trechos do sistema ${detalhe.ordem}`}
                  type="number"
                  min={1}
                  step={1}
                  disabled={!editavel}
                  defaultValue={detalhe.trechos}
                  onCommit={(value) => salvar(detalhe, { trechos: Number(value) })}
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
              {editavel && (
                <div className="nx-editor-actions">
                  <button
                    type="button"
                    className="nx-editor-link"
                    onClick={() =>
                      inserir([
                        {
                          identificacao: `${detalhe.identificacao} (cópia)`,
                          tipo: detalhe.tipo,
                          metragem: Number(detalhe.metragem),
                          trechos: detalhe.trechos,
                        },
                      ])
                    }
                  >
                    Duplicar sistema
                  </button>
                  <button
                    type="button"
                    className="nx-editor-link"
                    data-danger
                    onClick={() => remover(detalhe)}
                  >
                    Excluir sistema
                  </button>
                </div>
              )}
            </div>
          ) : (
            <Composicao
              revisaoId={revisaoId}
              sistema={detalhe}
              editavel={editavel}
              itens={itens}
              desatualizada={rev.data.desatualizada}
              extensao={porSis.get(detalhe.id)?.extensao_m ?? null}
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
}: {
  revisaoId: string;
  sistema: Sis;
  editavel: boolean;
  itens: ReturnType<typeof useItens>;
  desatualizada: boolean;
  extensao: number | null;
}) {
  const save = useSave();
  const qc = useQueryClient();
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
    const previous = itens.data?.find((row) => row.id === id);
    if (!previous) return;
    const v = answer.value;
    const n = v.trim() === "" ? null : Number(v.replace(",", "."));
    if (n !== null && (!Number.isFinite(n) || n < 0))
      return save.set("erro", "Quantidade inválida");
    const just = n === null ? null : answer.reason?.trim();
    if (n !== null && (!just || just.length < 3))
      return save.set("erro", "Justificativa obrigatória");
    if (previous.override_quantidade === n && previous.override_justificativa === just) return;
    return save.run(`override-${id}`, async () => {
      let request = supabase
        .from("sistema_componentes")
        .update({ override_quantidade: n, override_justificativa: just ?? null })
        .eq("id", id);
      request =
        previous.override_quantidade === null
          ? request.is("override_quantidade", null)
          : request.eq("override_quantidade", previous.override_quantidade);
      request =
        previous.override_justificativa === null
          ? request.is("override_justificativa", null)
          : request.eq("override_justificativa", previous.override_justificativa);
      const { data, error } = await request.select("id");
      if (error) throw new Error(error.message);
      if (!data?.length) {
        const replay = await supabase
          .from("sistema_componentes")
          .select("override_quantidade,override_justificativa")
          .eq("id", id)
          .single();
        if (
          replay.error ||
          replay.data?.override_quantidade !== n ||
          replay.data?.override_justificativa !== (just ?? null)
        )
          throw new Error("Conflito no ajuste manual. A quantidade não foi sobrescrita.");
      }
      await qc.invalidateQueries({ queryKey: revKeys.itens(revisaoId) });
      return true;
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
