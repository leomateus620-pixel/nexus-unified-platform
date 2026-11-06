import { useState } from "react";
import { Plus, Trash2 } from "lucide-react";
import { formatDecimalBR, parseDecimalBR } from "../demo/domain";

export type Reading = {
  id: string;
  agente: string;
  valor: string;
  unidade: string;
  instrumento?: string | undefined;
  ponto?: string | undefined;
  coletada_em?: string | undefined;
  momento?: "pre_entrada" | "monitoramento" | undefined;
};
type Agent = { agente: string; unidade: string };

/**
 * One row per required agent: agent on one line, "Valor medido" + fixed unit below.
 * Value starts empty; only the real instrument reading is typed. No unit conversion.
 */
export function ReadingRows({
  agentes,
  instrumentos,
  pontos,
  value,
  onChange,
  disabled,
}: {
  agentes: readonly Agent[];
  instrumentos: string[];
  pontos: string[];
  value: Reading[];
  onChange: (v: Reading[]) => void;
  disabled?: boolean;
}) {
  const [inst, setInst] = useState(value[0]?.instrumento ?? "");
  const [ponto, setPonto] = useState(value[0]?.ponto ?? "");
  const [raw, setRaw] = useState<Record<string, string>>({});
  const [errors, setErrors] = useState<Record<string, string>>({});
  const pre = value.filter((r) => (r.momento ?? "pre_entrada") === "pre_entrada");
  const record = (a: Agent) => {
    const text = raw[a.agente] ?? "";
    const v = parseDecimalBR(text);
    if (v === null) {
      setErrors({ ...errors, [a.agente]: "Use números, com vírgula para decimais (ex.: 20,9)." });
      return;
    }
    setErrors({ ...errors, [a.agente]: "" });
    onChange([
      ...value,
      {
        id: crypto.randomUUID(),
        agente: a.agente,
        valor: v,
        unidade: a.unidade,
        momento: "pre_entrada",
        coletada_em: new Date().toISOString(),
        ...(inst ? { instrumento: inst } : {}),
        ...(ponto ? { ponto } : {}),
      },
    ]);
    setRaw({ ...raw, [a.agente]: "" });
  };
  return (
    <fieldset className="pet-rd" disabled={disabled}>
      <legend>Avaliação imediatamente antes da entrada</legend>
      <div className="pet-rd-ctx">
        <label>
          Instrumento
          <select value={inst} onChange={(e) => setInst(e.target.value)}>
            <option value="">Selecione</option>
            {instrumentos.map((i) => <option key={i}>{i}</option>)}
          </select>
        </label>
        <label>
          Ponto de amostragem
          <select value={ponto} onChange={(e) => setPonto(e.target.value)}>
            <option value="">Selecione</option>
            {pontos.map((i) => <option key={i}>{i}</option>)}
          </select>
        </label>
      </div>
      <ul className="pet-rd-list">
        {agentes.map((a) => {
          const done = pre.filter((r) => r.agente === a.agente);
          const id = `rd-${a.agente}`;
          return (
            <li key={a.agente}>
              <label htmlFor={id} className="pet-rd-agent">{a.agente}</label>
              <div className="pet-rd-input">
                <input
                  id={id}
                  inputMode="decimal"
                  autoComplete="off"
                  placeholder="Valor medido"
                  aria-label={`Valor medido de ${a.agente} em ${a.unidade}`}
                  aria-invalid={!!errors[a.agente]}
                  value={raw[a.agente] ?? ""}
                  onChange={(e) => setRaw({ ...raw, [a.agente]: e.target.value })}
                  onKeyDown={(e) => e.key === "Enter" && (e.preventDefault(), record(a))}
                />
                <span className="pet-rd-unit">{a.unidade}</span>
                <button type="button" className="pet-rd-add" aria-label={`Registrar leitura de ${a.agente}`}
                  disabled={!(raw[a.agente] ?? "").trim()} onClick={() => record(a)}>
                  <Plus size={18} />
                </button>
              </div>
              {errors[a.agente] && <p className="pet-rd-err" role="alert">{errors[a.agente]}</p>}
              {done.map((r) => (
                <div key={r.id} className="pet-rd-done">
                  <span>
                    <strong>{formatDecimalBR(r.valor)} {r.unidade}</strong>
                    <small>
                      {r.coletada_em ? new Date(r.coletada_em).toLocaleTimeString("pt-BR", { hour: "2-digit", minute: "2-digit" }) : ""}
                      {r.instrumento ? ` · ${r.instrumento}` : ""}{r.ponto ? ` · ${r.ponto}` : ""}
                    </small>
                  </span>
                  <button type="button" className="pet-hz-icon" aria-label={`Remover leitura ${formatDecimalBR(r.valor)} ${r.unidade} de ${a.agente}`}
                    onClick={() => onChange(value.filter((x) => x.id !== r.id))}>
                    <Trash2 size={16} />
                  </button>
                </div>
              ))}
            </li>
          );
        })}
      </ul>
      {value.filter((r) => !agentes.some((a) => a.agente === r.agente)).map((r) => (
        <div key={r.id} className="pet-rd-done">
          <span><strong>{r.agente}: {formatDecimalBR(r.valor)} {r.unidade}</strong><small>Registro anterior</small></span>
          <button type="button" className="pet-hz-icon" aria-label={`Remover leitura de ${r.agente}`}
            onClick={() => onChange(value.filter((x) => x.id !== r.id))}><Trash2 size={16} /></button>
        </div>
      ))}
      <p className="pet-rd-note">Leituras pontuais não substituem o monitoramento contínuo durante a permanência.</p>
    </fieldset>
  );
}
