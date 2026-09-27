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
export const liberarOrdemProducao = record("liberarOrdemProducao");
