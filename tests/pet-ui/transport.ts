import { petResult } from "../../src/features/pet/errors";
async function rpc(name: string, data: any) {
  const r = await fetch("/__pet_lab", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ name, data }),
  });
  const body = await r.json();
  if (!r.ok) {
    if (body.code) petResult({ data: null, error: { code: body.code, message: body.error } });
    throw new Error(body.error);
  }
  return body;
}
export const petListar = ({ data }: any) => rpc("pet_listar", data);
export const petObter = ({ data }: any) => rpc("pet_obter", data);
export const petOpcoes = ({ data }: any) => rpc("pet_opcoes", data);
export const petExecutar = ({ data }: any) => rpc("pet_executar", data);
export const petGerarRelatorio = ({ data }: any) => rpc("pdf", data);
export const petObterPacote = ({ data }: any) => rpc("pacote", data);
export const consultarAcessoOperacional = ({ data }: any) => rpc("acesso", data);
export const listarAnexos = ({ data }: any) => rpc("anexos", data);
const unconfigured = async () => {
  throw new Error(
    "Integração não configurada: transporte Supabase Auth/Storage HTTP não está habilitado neste laboratório SQL local.",
  );
};
export const prepararUpload = unconfigured,
  retomarUpload = unconfigured,
  confirmarUpload = unconfigured,
  cancelarAnexo = unconfigured,
  baixarAnexo = unconfigured;

export const petRetificar = ({ data }: any) => rpc("pet_retificar", data);
