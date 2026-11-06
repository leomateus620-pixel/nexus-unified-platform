import { useState } from "react";
import { ChevronDown, Plus, X } from "lucide-react";
import { MEDIDA_ESTADOS, type DemoMedida, type DemoPerigo } from "../demo/domain";
import type { DemoPerigoCat } from "../demo/catalogo";

type Props = {
  catalogo: DemoPerigoCat[];
  value: DemoPerigo[];
  onChange: (v: DemoPerigo[]) => void;
  disabled?: boolean;
  aviso?: string;
};

/** Hazard → measure selection by touch; measures always start "pendente". */
export function HazardMeasurePicker({ catalogo, value, onChange, disabled, aviso }: Props) {
  const [adding, setAdding] = useState(value.length === 0);
  const [outro, setOutro] = useState({ perigo: "", motivo: "" });
  const has = (perigo: string) => value.some((p) => p.perigo === perigo);
  const medidasDe = (perigo: string) =>
    catalogo.flatMap((g) => g.itens).find((i) => i.perigo === perigo)?.medidas ?? [];
  const toggle = (grupo: string, perigo: string) =>
    onChange(
      has(perigo)
        ? value.filter((p) => p.perigo !== perigo)
        : [...value, { id: crypto.randomUUID(), grupo, perigo, origem: "avaliacao", medidas: [] }],
    );
  const patch = (id: string, f: (p: DemoPerigo) => DemoPerigo) =>
    onChange(value.map((p) => (p.id === id ? f(p) : p)));
  const patchM = (pid: string, mid: string, m: Partial<DemoMedida>) =>
    patch(pid, (p) => ({ ...p, medidas: p.medidas.map((x) => (x.id === mid ? { ...x, ...m } : x)) }));

  return (
    <fieldset className="pet-hz" disabled={disabled}>
      {aviso && <p className="pet-hz-aviso">{aviso}</p>}
      <div className="pet-hz-head">
        <strong>Perigos ({value.length})</strong>
        <button type="button" className="pet-hz-add" aria-expanded={adding} onClick={() => setAdding((v) => !v)}>
          <Plus size={16} aria-hidden /> Adicionar perigo
        </button>
      </div>
      {adding && (
        <div className="pet-hz-catalog">
          {catalogo.map((g, gi) => (
            <details key={g.grupo} open={gi === 0}>
              <summary>
                {g.grupo}
                <span>{g.itens.filter((i) => has(i.perigo)).length || ""}</span>
                <ChevronDown size={16} aria-hidden />
              </summary>
              <div className="pet-hz-options">
                {g.itens.map((i) => (
                  <label key={i.perigo} className="pet-hz-check">
                    <input type="checkbox" checked={has(i.perigo)} onChange={() => toggle(g.grupo, i.perigo)} />
                    <span>{i.perigo}</span>
                  </label>
                ))}
              </div>
            </details>
          ))}
          <details>
            <summary>
              Outro perigo <ChevronDown size={16} aria-hidden />
            </summary>
            <div className="pet-hz-outro">
              <label>
                Perigo
                <input value={outro.perigo} onChange={(e) => setOutro({ ...outro, perigo: e.target.value })} />
              </label>
              <label>
                Motivo (fora do catálogo)
                <input value={outro.motivo} onChange={(e) => setOutro({ ...outro, motivo: e.target.value })} />
              </label>
              <button
                type="button"
                className="pet-hz-add"
                disabled={outro.perigo.trim().length < 2 || outro.motivo.trim().length < 3}
                onClick={() => {
                  onChange([
                    ...value,
                    {
                      id: crypto.randomUUID(),
                      grupo: "Outros",
                      perigo: outro.perigo.trim(),
                      origem: "entrada",
                      outro_motivo: outro.motivo.trim(),
                      medidas: [],
                    },
                  ]);
                  setOutro({ perigo: "", motivo: "" });
                }}
              >
                Adicionar
              </button>
            </div>
          </details>
        </div>
      )}
      <ul className="pet-hz-list">
        {value.map((p) => (
          <HazardRow key={p.id} p={p} sugestoes={medidasDe(p.perigo)} patch={patch} patchM={patchM}
            remove={() => onChange(value.filter((x) => x.id !== p.id))} />
        ))}
      </ul>
    </fieldset>
  );
}

function HazardRow({
  p,
  sugestoes,
  patch,
  patchM,
  remove,
}: {
  p: DemoPerigo;
  sugestoes: string[];
  patch: (id: string, f: (p: DemoPerigo) => DemoPerigo) => void;
  patchM: (pid: string, mid: string, m: Partial<DemoMedida>) => void;
  remove: () => void;
}) {
  const [open, setOpen] = useState(p.medidas.length === 0);
  const [outra, setOutra] = useState({ medida: "", motivo: "" });
  const hasM = (m: string) => p.medidas.some((x) => x.medida === m);
  const addM = (medida: string, outro_motivo?: string) =>
    patch(p.id, (h) => ({
      ...h,
      medidas: [...h.medidas, { id: crypto.randomUUID(), medida, estado: "pendente", ...(outro_motivo ? { outro_motivo } : {}) }],
    }));
  return (
    <li className="pet-hz-item">
      <div className="pet-hz-item-head">
        <div>
          <strong>{p.perigo}</strong>
          <div className="pet-hz-origem" role="group" aria-label={`Origem de ${p.perigo}`}>
            {(["avaliacao", "entrada"] as const).map((o) => (
              <button key={o} type="button" aria-pressed={p.origem === o}
                onClick={() => patch(p.id, (h) => ({ ...h, origem: o }))}>
                {o === "avaliacao" ? "Previsto na avaliação" : "Identificado na entrada"}
              </button>
            ))}
          </div>
          {p.outro_motivo && <small>Fora do catálogo · {p.outro_motivo}</small>}
        </div>
        <button type="button" className="pet-hz-icon" aria-label={`Remover perigo ${p.perigo}`} onClick={remove}>
          <X size={18} />
        </button>
      </div>
      <ul className="pet-hz-medidas" aria-label={`Medidas para ${p.perigo}`}>
        {p.medidas.map((m) => (
          <li key={m.id} data-estado={m.estado}>
            <div className="pet-hz-m-top">
              <span>→ {m.medida}</span>
              <button type="button" className="pet-hz-icon" aria-label={`Remover medida ${m.medida}`}
                onClick={() => patch(p.id, (h) => ({ ...h, medidas: h.medidas.filter((x) => x.id !== m.id) }))}>
                <X size={16} />
              </button>
            </div>
            <label className="pet-hz-estado">
              <span className="sr-only">Estado de {m.medida}</span>
              <select value={m.estado} onChange={(e) => patchM(p.id, m.id, { estado: e.target.value as DemoMedida["estado"] })}>
                {Object.entries(MEDIDA_ESTADOS).map(([k, v]) => (
                  <option key={k} value={k}>{v}</option>
                ))}
              </select>
            </label>
            {(m.estado === "nao_aplica" || m.estado === "impeditiva") && (
              <label className="pet-hz-just">
                Justificativa{m.estado === "nao_aplica" ? " (obrigatória)" : ""}
                <input value={m.justificativa ?? ""} onChange={(e) => patchM(p.id, m.id, { justificativa: e.target.value })} />
              </label>
            )}
          </li>
        ))}
      </ul>
      <button type="button" className="pet-hz-add" aria-expanded={open} onClick={() => setOpen((v) => !v)}>
        <Plus size={16} aria-hidden /> Adicionar medidas
      </button>
      {open && (
        <div className="pet-hz-chips">
          {sugestoes.filter((s) => !hasM(s)).map((s) => (
            <button key={s} type="button" className="pet-hz-chip" onClick={() => addM(s)}>
              <Plus size={14} aria-hidden /> {s}
            </button>
          ))}
          <div className="pet-hz-outro">
            <label>
              Outra medida
              <input value={outra.medida} onChange={(e) => setOutra({ ...outra, medida: e.target.value })} />
            </label>
            <label>
              Motivo
              <input value={outra.motivo} onChange={(e) => setOutra({ ...outra, motivo: e.target.value })} />
            </label>
            <button type="button" className="pet-hz-add"
              disabled={outra.medida.trim().length < 2 || outra.motivo.trim().length < 3}
              onClick={() => { addM(outra.medida.trim(), outra.motivo.trim()); setOutra({ medida: "", motivo: "" }); }}>
              Adicionar
            </button>
          </div>
        </div>
      )}
    </li>
  );
}
