import { useState } from "react";
import { AlertTriangle, CheckCircle2, Circle, Phone, Plus, Trash2, X } from "lucide-react";
import {
  CONTATOS_FIXOS,
  ESTADO_LABEL,
  FICHA_ITENS,
  estadoDe,
  fichaProgresso,
  resumoTeste,
  type Estado,
  type Ficha,
  type FichaItem,
  type Momento,
  type TesteMeta,
} from "../cotrirosa-ficha";

type Base = { ficha: Ficha; onChange: (f: Ficha) => void; disabled?: boolean };

function Row({ item, ficha, onChange }: { item: FichaItem } & Base) {
  const r = ficha.respostas[item.id];
  const e = estadoDe(ficha, item.id);
  const put = (patch: Partial<NonNullable<typeof r>>) =>
    onChange({ ...ficha, respostas: { ...ficha.respostas, [item.id]: { estado: e, ...r, ...patch } } });
  return (
    <li className="pet-fc-row" id={`ficha-${item.id}`} data-estado={e}>
      <span className="pet-fc-label">
        <EstadoIcon e={e} needsJust={e === "NA" && (r?.justificativa ?? "").trim().length < 3} />
        {item.label}
      </span>
      <div className="pet-fc-opts" role="radiogroup" aria-label={item.label}>
        {item.estados.map((s) => (
          <button key={s} type="button" role="radio" aria-checked={e === s} data-s={s}
            onClick={() => put({ estado: e === s ? "NV" : s })}>
            {ESTADO_LABEL[s]}
          </button>
        ))}
      </div>
      {item.detalhe && e === "S" && (
        <div className="pet-fc-opts" role="radiogroup" aria-label={`${item.label}: tipo`}>
          {item.detalhe.map((d) => (
            <button key={d} type="button" role="radio" aria-checked={r?.detalhe === d} onClick={() => put({ detalhe: d })}>{d}</button>
          ))}
        </div>
      )}
      {e === "NA" && (
        <input className="pet-fc-just" placeholder="Justificativa do não se aplica" aria-label={`Justificativa: ${item.label}`}
          value={r?.justificativa ?? ""} onChange={(ev) => put({ justificativa: ev.target.value })} />
      )}
    </li>
  );
}

function EstadoIcon({ e, needsJust }: { e: Estado; needsJust?: boolean }) {
  if (e === "N")
    return <span className="pet-fc-st" data-t="imp"><AlertTriangle size={16} aria-hidden /><span className="sr-only">Impeditivo</span></span>;
  if (e === "NV" || needsJust)
    return <span className="pet-fc-st" data-t="pend"><Circle size={16} aria-hidden /><span className="sr-only">Pendente</span></span>;
  return <span className="pet-fc-st" data-t="ok"><CheckCircle2 size={16} aria-hidden /><span className="sr-only">Respondido</span></span>;
}

/** Opens the item's group, scrolls and highlights it. */
export function irParaItemFicha(id: string) {
  const el = document.getElementById(`ficha-${id}`);
  if (!el) return false;
  const det = el.closest("details");
  if (det) det.open = true;
  el.scrollIntoView({ block: "center" });
  el.classList.add("pet-fc-flash");
  setTimeout(() => el.classList.remove("pet-fc-flash"), 1800);
  return true;
}

export function FichaProgresso({ ficha, fase, leituras, onIr }: { ficha: Ficha; fase: FichaItem["fase"]; leituras?: { agente: string; valor: string; momento?: string | undefined }[]; onIr: (id: string) => void }) {
  const p = fichaProgresso(ficha, fase, leituras);
  const prox = p.pendencias.find((x) => x.tipo === "impeditiva") ?? p.pendencias[0];
  return (
    <div className="pet-fc-prog" role="status">
      <span>
        <strong>{p.respondidos} de {p.total}</strong> verificações obrigatórias respondidas
        {p.impedimentos > 0 && <> · <span className="pet-fc-prog-imp"><AlertTriangle size={14} aria-hidden /> {p.impedimentos} impedimento{p.impedimentos > 1 ? "s" : ""}</span></>}
      </span>
      {prox && (
        <button type="button" className="pet-hz-add" onClick={() => onIr(prox.id)}>Ir para pendências</button>
      )}
    </div>
  );
}

export function TesteResumo({ ficha, leituras, momento }: { ficha: Ficha; leituras: { agente: string; valor: string; momento?: string | undefined; coletada_em?: string | undefined }[]; momento: Momento }) {
  const r = resumoTeste(ficha, leituras, momento);
  const hora = r.horario ? new Date(r.horario).toLocaleTimeString("pt-BR", { hour: "2-digit", minute: "2-digit" }) : "—";
  return (
    <dl className="pet-fc-resumo" data-s={r.situacao}>
      <div><dt>Horário</dt><dd>{hora}</dd></div>
      <div><dt>Responsável</dt><dd>{r.responsavel || "—"}</dd></div>
      <div><dt>Situação</dt><dd>{r.situacao === "Bloqueado" ? <AlertTriangle size={14} aria-hidden /> : r.situacao === "Completo" ? <CheckCircle2 size={14} aria-hidden /> : <Circle size={14} aria-hidden />} {r.situacao}{r.faltam.length && r.situacao !== "Bloqueado" ? ` · falta ${r.faltam.join(", ")}` : ""}</dd></div>
      {r.reconferir && <div className="pet-fc-reconf"><dt>Atenção</dt><dd>Ventilação alterada — conferir novamente</dd></div>}
    </dl>
  );
}

export function FichaChecklist({ fase, grupo, ficha, onChange, disabled, outros }: Base & { fase: FichaItem["fase"]; grupo?: string; outros?: boolean }) {
  const itens = FICHA_ITENS.filter((i) => i.fase === fase && (!grupo || i.grupo === grupo));
  const grupos = [...new Set(itens.map((i) => i.grupo))];
  const list = ficha.outros ?? [];
  const setOutros = (o: typeof list) => onChange({ ...ficha, outros: o });
  return (
    <fieldset className="pet-fc" disabled={disabled}>
      {grupos.map((gname) => {
        const gi = itens.filter((i) => i.grupo === gname);
        const done = gi.filter((i) => estadoDe(ficha, i.id) !== "NV").length;
        return (
          <details key={gname} open>
            <summary>{gname} <span>{done}/{gi.length}</span></summary>
            <ul>{gi.map((i) => <Row key={i.id} item={i} ficha={ficha} onChange={onChange} />)}</ul>
          </details>
        );
      })}
      {outros && (
        <div className="pet-fc-outros">
          <strong>Outros (EPC/EPI)</strong>
          {list.map((o) => (
            <div key={o.id} className="pet-fc-row" id={`ficha-${o.id}`}>
              <select aria-label="Grupo" value={o.grupo}
                onChange={(e) => setOutros(list.map((x) => (x.id === o.id ? { ...x, grupo: e.target.value as "EPC" | "EPI" } : x)))}>
                <option>EPC</option><option>EPI</option>
              </select>
              <input aria-label="Descrição do item" placeholder="Descreva o item" value={o.descricao}
                onChange={(e) => setOutros(list.map((x) => (x.id === o.id ? { ...x, descricao: e.target.value } : x)))} />
              <div className="pet-fc-opts" role="radiogroup" aria-label={`Resposta: ${o.descricao || "outro"}`}>
                {(["S", "N", "NA"] as Estado[]).map((s) => (
                  <button key={s} type="button" role="radio" aria-checked={o.estado === s} data-s={s}
                    onClick={() => setOutros(list.map((x) => (x.id === o.id ? { ...x, estado: s } : x)))}>{ESTADO_LABEL[s]}</button>
                ))}
              </div>
              <button type="button" className="pet-hz-icon" aria-label="Remover item" onClick={() => setOutros(list.filter((x) => x.id !== o.id))}>
                <Trash2 size={16} />
              </button>
            </div>
          ))}
          <button type="button" className="pet-hz-add" onClick={() => setOutros([...list, { id: crypto.randomUUID(), grupo: "EPC", descricao: "", estado: "NV" }])}>
            <Plus size={16} aria-hidden /> Adicionar outro
          </button>
        </div>
      )}
    </fieldset>
  );
}

export function TesteMetaFields({ momento, ficha, onChange, disabled, instrumentos }: Base & { momento: Momento; instrumentos: string[] }) {
  const m: TesteMeta = ficha.testes?.[momento] ?? {};
  const put = (p: Partial<TesteMeta>) => onChange({ ...ficha, testes: { ...ficha.testes, [momento]: { ...m, ...p } } });
  return (
    <fieldset className="pet-fc-meta" disabled={disabled} id={`ficha-teste_${momento}`}>
      <label>Supervisor dos testes<input value={m.responsavel ?? ""} onChange={(e) => put({ responsavel: e.target.value })} /></label>
      <label>Aparelho da filial
        <select value={m.aparelho_filial ?? ""} onChange={(e) => put({ aparelho_filial: (e.target.value || undefined) as TesteMeta["aparelho_filial"] })}>
          <option value="">Selecione</option><option value="S">Sim</option><option value="NA">Não se aplica</option>
        </select>
      </label>
      <label>Instrumento
        <select value={m.instrumento ?? ""} onChange={(e) => put({ instrumento: e.target.value })}>
          <option value="">Selecione</option>{instrumentos.map((i) => <option key={i}>{i}</option>)}
        </select>
      </label>
      <label>Nº de série<input value={m.serie ?? ""} onChange={(e) => put({ serie: e.target.value })} /></label>
      <label className="pet-fc-check"><input type="checkbox" checked={!!m.confirmado} onChange={(e) => put({ confirmado: e.target.checked, reconferir: false })} /> Confirmo os resultados deste teste</label>
    </fieldset>
  );
}

export function VentilacaoFields({ ficha, onChange, disabled }: Base) {
  if (estadoDe(ficha, "pre_ventilacao") !== "S") return null;
  const v = ficha.ventilacao ?? {};
  const put = (p: Partial<typeof v>) => {
    const t = ficha.testes?.pos_ventilacao;
    onChange({
      ...ficha,
      ventilacao: { ...v, ...p },
      ...(t ? { testes: { ...ficha.testes, pos_ventilacao: { ...t, reconferir: true } } } : {}),
    });
  };
  return (
    <fieldset className="pet-fc-meta" disabled={disabled}>
      <div className="pet-fc-opts" role="radiogroup" aria-label="Tipo de ventilação">
        {(["Natural", "Mecânica"] as const).map((t) => (
          <button key={t} type="button" role="radio" aria-checked={v.tipo === t} onClick={() => put({ tipo: t })}>{t}</button>
        ))}
      </div>
      {v.tipo === "Mecânica" && (
        <div className="pet-fc-opts" role="radiogroup" aria-label="Equipamento">
          {(["Insuflador móvel", "Insuflador fixo"] as const).map((t) => (
            <button key={t} type="button" role="radio" aria-checked={v.equipamento === t} onClick={() => put({ equipamento: t })}>{t}</button>
          ))}
        </div>
      )}
      <label>Tempo real (min)<input inputMode="decimal" value={v.tempo_min ?? ""} onChange={(e) => put({ tempo_min: e.target.value.replace(/\D/g, "") })} /></label>
    </fieldset>
  );
}

export function QuenteFields({ ficha, onChange, disabled }: Base) {
  if (estadoDe(ficha, "dur_trabalho_quente") !== "S") return null;
  return (
    <fieldset className="pet-fc-meta" disabled={disabled}>
      <label>Identificação da permissão de trabalho a quente autorizada
        <input value={ficha.quente?.referencia ?? ""} onChange={(e) => onChange({ ...ficha, quente: { referencia: e.target.value } })} />
      </label>
    </fieldset>
  );
}

/** Emergency contacts: fixed public numbers + unit contacts (flagged when not registered). */
export function ContatosEmergencia({ unidade }: { unidade?: { nome: string; numero?: string }[] }) {
  const extras = unidade ?? [{ nome: "Ambulância" }, { nome: "Segurança" }];
  return (
    <section className="pet-fc-contatos" aria-label="Plano e contatos de emergência">
      <h5>Emergência e resgate · contatos</h5>
      <ul>
        {CONTATOS_FIXOS.map((c) => (
          <li key={c.nome}><a href={`tel:${c.numero}`}><Phone size={16} aria-hidden /> {c.nome} {c.numero}</a></li>
        ))}
        {extras.map((c) => (
          <li key={c.nome}>{c.numero ? <a href={`tel:${c.numero}`}><Phone size={16} aria-hidden /> {c.nome} {c.numero}</a>
            : <span className="pet-fc-nv">{c.nome}: contato não cadastrado na unidade</span>}</li>
        ))}
      </ul>
      <p>Ligar não registra ocorrência: use "Registrar ocorrência" para o histórico da PET.</p>
    </section>
  );
}

/** One-tap access to rescue plan and contacts during the work. */
export function PlanoContatosBotao({ plano, unidade }: { plano?: string; unidade?: { nome: string; numero?: string }[] }) {
  const [open, setOpen] = useState(false);
  return (
    <>
      <button type="button" className="pet-hz-add" onClick={() => setOpen(true)}>
        <Phone size={16} aria-hidden /> Ver plano e contatos
      </button>
      {open && (
        <div className="pet-fc-sheet" role="dialog" aria-modal="true" aria-label="Plano de resgate e contatos"
          onKeyDown={(e) => e.key === "Escape" && setOpen(false)}>
          <div className="pet-fc-sheet-box">
            <div className="pet-fc-sheet-head">
              <h5>Plano de resgate</h5>
              <button type="button" className="pet-hz-icon" aria-label="Fechar" autoFocus onClick={() => setOpen(false)}><X size={18} /></button>
            </div>
            <p>{plano?.trim() || "Plano de resgate da unidade: siga o procedimento de resgate definido para este espaço."}</p>
            <ContatosEmergencia {...(unidade ? { unidade } : {})} />
          </div>
        </div>
      )}
    </>
  );
}
