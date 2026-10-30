// Imported only through experience.config.mjs. The fixture has no network writes.
const unavailable = async () => {
  throw new Error(
    "Integração não configurada neste laboratório de apresentação. Nenhum documento certificado é criado ou validado.",
  );
};
export const petListar = unavailable,
  petObter = unavailable,
  petOpcoes = unavailable,
  petExecutar = unavailable,
  petGerarRelatorio = unavailable,
  petObterPacote = unavailable,
  petRetificar = unavailable,
  prepararUpload = unavailable,
  retomarUpload = unavailable,
  confirmarUpload = unavailable,
  cancelarAnexo = unavailable,
  baixarAnexo = unavailable;
export const listarAnexos = async () => ({
  registros: [],
  permissoes: { adicionar: false, remover: false },
});
export const consultarAcessoOperacional = async () => ({
  gerirEquipe: true,
  gerirOperacao: new URLSearchParams(location.search).get("manage") !== "0",
  revisarOperacao: true,
  pessoaId: "a0300000-0000-4000-8000-000000000003",
});
export { petResult } from "../../src/features/pet/errors";
