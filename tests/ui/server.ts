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

const operations = new Map();
export const consolidarProposta = async (payload) => {
  window.__nexusCalls.push({ name: "consolidarProposta", payload });
  await new Promise((resolve) => setTimeout(resolve, window.__saveDelay ?? 250));
  const id = payload.data.operacao_id;
  const response = operations.get(id) ?? { evento: false, objetos: 0, campos: 0 };
  operations.set(id, response);
  if (window.__loseSaveResponse) {
    window.__loseSaveResponse = false;
    throw new Error("Network response lost (isolated test)");
  }
  return response;
};
export const listarSalvamentos = async () => [
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
