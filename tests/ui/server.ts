import { revision, tables } from "./data";
const record = (name) => async (payload) => {
  window.__nexusCalls.push({ name, payload });
  return { ocs: 0, ops: 0, revisao_id: "rev-fixture" };
};
export const useServerFn = (fn) => fn;
export const recalcularRevisao = record("recalcularRevisao");
export const gerarDemanda = record("gerarDemanda");
export const gerarOrdens = record("gerarOrdens");
export const novaRevisao = record("novaRevisao");
export const transicionarRevisao = record("transicionarRevisao");
export const emitirOrdemCompra = record("emitirOrdemCompra");
export const registrarMovimento = record("registrarMovimento");
export const aprovarTecnica = record("aprovarTecnica");
export const importarModeloPlanilha = record("importarModeloPlanilha");
export const liberarOrdemProducao = record("liberarOrdemProducao");

const operations = new Map();
const baseline = () =>
  structuredClone({
    textos: revision.textos,
    parametros: revision.parametros,
    sistemas: tables.sistemas_dimensionados,
    componentes: tables.revisao_componentes,
  });
let checkpoint = baseline();
window.__nexusEvents = [];
function differences(before, after) {
  const changes = [];
  for (const area of ["textos", "parametros"]) {
    for (const key of new Set([...Object.keys(before[area]), ...Object.keys(after[area])]))
      if (JSON.stringify(before[area][key]) !== JSON.stringify(after[area][key]))
        changes.push({
          objeto: "revisao:rev-fixture",
          nome: area,
          campo: key,
          antes: before[area][key] ?? null,
          depois: after[area][key] ?? null,
          autores: [{ autor: "user-fixture", autor_nome: "Autor do ambiente isolado" }],
        });
  }
  for (const area of ["sistemas", "componentes"]) {
    const ids = new Set([
      ...before[area].map((row) => row.id),
      ...after[area].map((row) => row.id),
    ]);
    for (const id of ids) {
      const a = before[area].find((row) => row.id === id) ?? {};
      const b = after[area].find((row) => row.id === id) ?? {};
      for (const key of new Set([...Object.keys(a), ...Object.keys(b)]))
        if (JSON.stringify(a[key]) !== JSON.stringify(b[key]))
          changes.push({
            objeto: `${area}:${id}`,
            nome: b.identificacao ?? b.codigo ?? a.identificacao ?? a.codigo,
            campo: key,
            antes: a[key] ?? null,
            depois: b[key] ?? null,
            autores: [{ autor: "user-fixture", autor_nome: "Autor do ambiente isolado" }],
          });
    }
  }
  return changes;
}
export const consolidarProposta = async (payload) => {
  window.__nexusCalls.push({ name: "consolidarProposta", payload });
  await new Promise((resolve) => setTimeout(resolve, window.__saveDelay ?? 250));
  const id = payload.data.operacao_id;
  const current = baseline();
  const changed = JSON.stringify(current) !== JSON.stringify(checkpoint);
  const response = operations.get(id) ?? {
    evento: changed,
    objetos: changed ? 1 : 0,
    campos: changed ? 1 : 0,
  };
  if (!operations.has(id)) {
    if (changed) {
      const diffs = differences(checkpoint, current);
      window.__nexusEvents.push({
        id,
        revisao_id: "rev-fixture",
        autor: "user-fixture",
        autor_nome: "Autor do ambiente isolado",
        created_at: new Date().toISOString(),
        versao_origem: 1,
        versao_destino: revision.version,
        objetos: new Set(diffs.map((d) => d.objeto)).size,
        campos: diffs.length,
        calculo_id: "calc-fixture",
        impacto: null,
        diferencas: diffs,
      });
    }
    checkpoint = current;
    revision.desatualizada = false;
  }
  operations.set(id, response);
  if (window.__loseSaveResponse) {
    window.__loseSaveResponse = false;
    throw new Error("Network response lost (isolated test)");
  }
  return response;
};
export const listarSalvamentos = async () =>
  window.__nexusEvents.length
    ? [...window.__nexusEvents].reverse()
    : new URLSearchParams(location.search).get("scenario") === "empty"
      ? []
      : [
          {
            id: "save-fixture",
            revisao_id: "rev-fixture",
            autor: "user-fixture",
            autor_nome: "revisao-ui@example.invalid",
            created_at: "2026-09-27T18:30:00Z",
            versao_origem: 1,
            versao_destino: 4,
            objetos: 1,
            campos: 1,
            calculo_id: "calc-fixture",
            impacto: { total_anterior: 100, total_calculado: 120 },
            diferencas: [
              {
                objeto: "sistema:system-0",
                campo: "metragem",
                nome: "Pavilhão de recebimento",
                antes: 100,
                depois: 120,
                justificativa: null,
                autores: [{ autor: "user-fixture", autor_nome: "revisao-ui@example.invalid" }],
              },
            ],
          },
        ];
