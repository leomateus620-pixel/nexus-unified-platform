// Test-only boundary for the unit history rendered by ClientesWorkspace.
// This laboratory does not simulate PET issuance, signatures or private documents.
import * as s from "../../src/features/pet/schemas";
import { scenario } from "./data";

const org = "10000000-0000-4000-8000-000000000001";

function authorize(data: { organization_id: string }) {
  if (data.organization_id !== org || scenario === "restricted")
    throw new Error("Acesso indisponível no contexto isolado deste teste.");
}

export const petListar = async ({ data }: { data: unknown }) => {
  const input = s.listarInput.parse(data);
  authorize(input);
  if (scenario === "error") throw new Error("Falha de rede simulada no histórico de PETs.");
  return s.listaResult.parse({ registros: [], ordens: [], total: 0 });
};

export const petOpcoes = async ({ data }: { data: unknown }) => {
  authorize(s.orgInput.parse(data));
  return s.opcoesResult.parse({
    clientes: [],
    unidades: [],
    pessoas: [],
    espacos: [],
    modelos: [],
    ordens: [],
    integracao_assinatura: {},
  });
};

const unavailable = async ({ data }: { data: unknown }): Promise<never> => {
  authorize(s.orgInput.parse(data));
  throw new Error(
    "Operação PET não coberta por este laboratório de apresentação. Use o laboratório SQL PET para os recortes de execução; integração externa não configurada.",
  );
};

export const petObter = unavailable;
export const petExecutar = unavailable;
export const petRetificar = unavailable;
export const petGerarRelatorio = unavailable;
export const petObterPacote = unavailable;

export { petResult } from "../../src/features/pet/errors";
