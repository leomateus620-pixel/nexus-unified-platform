import { Phone, Plus, Trash2 } from "lucide-react";
import {
  CONTATOS_FIXOS,
  ESTADO_LABEL,
  FICHA_ITENS,
  estadoDe,
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
      <span className="pet-fc-label">{item.label}</span>
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

export function FichaChecklist({ fase, ficha, onChange, disabled, outros }: Base & { fase: FichaItem["fase"]; outros?: boolean }) {
  const itens = FICHA_ITENS.filter((i) => i.fase === fase);
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
      <label className="pet-fc-check"><input type="checkbox" checked={!!m.confirmado} onChange={(e) => put({ confirmado: e.target.checked })} /> Confirmo os resultados deste teste</label>
    </fieldset>
  );
}

export function VentilacaoFields({ ficha, onChange, disabled }: Base) {
  if (estadoDe(ficha, "pre_ventilacao") !== "S") return null;
  const v = ficha.ventilacao ?? {};
  const put = (p: Partial<typeof v>) => onChange({ ...ficha, ventilacao: { ...v, ...p } });
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
      <label>Tempo real (min)<input inputMode="numeric" value={v.tempo_min ?? ""} onChange={(e) => put({ tempo_min: e.target.value.replace(/\D/g, "") })} /></label>
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
