type Sel = { grupo: string; procedimento: string; verificado: boolean };

/** One select per procedure group; verification is recorded separately from selection. */
export function ProcedurePicker({
  grupos,
  value,
  onChange,
  disabled,
}: {
  grupos: { grupo: string; opcoes: string[] }[];
  value: Sel[];
  onChange: (v: Sel[]) => void;
  disabled?: boolean;
}) {
  const get = (g: string) => value.find((v) => v.grupo === g);
  const put = (g: string, s: Sel | null) =>
    onChange([...value.filter((v) => v.grupo !== g), ...(s ? [s] : [])]);
  return (
    <fieldset className="pet-pr" disabled={disabled}>
      <legend>Procedimentos</legend>
      {grupos.map((g) => {
        const cur = get(g.grupo);
        return (
          <div key={g.grupo} className="pet-pr-row">
            <label>
              {g.grupo}
              <select
                value={cur?.procedimento ?? ""}
                onChange={(e) => put(g.grupo, e.target.value ? { grupo: g.grupo, procedimento: e.target.value, verificado: false } : null)}
              >
                <option value="">Selecione</option>
                {g.opcoes.map((o) => <option key={o}>{o}</option>)}
              </select>
            </label>
            {cur && (
              <label className="pet-hz-check">
                <input type="checkbox" checked={cur.verificado}
                  onChange={(e) => put(g.grupo, { ...cur, verificado: e.target.checked })} />
                <span>Verificação realizada em campo</span>
              </label>
            )}
          </div>
        );
      })}
    </fieldset>
  );
}
