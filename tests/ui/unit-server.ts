// Presentation-only boundary. Operational v2 checks use real SQL in tests/cotrirosa.
// This fixture does not approve a contract, issue a permit or load production data.
import { scenario } from "./data";
const unavailable = async () => {
  throw Error("Operação indisponível neste laboratório de apresentação.");
};
export const nrMapaContexto = async () => ({ cena: null, objetos: [] });
export const nrContratacaoObter = async () => ({
  confirmada: true,
  version: 1,
  documentos: ["memorial"],
  fonte: "FIXTURE sintética de apresentação",
  updated_at: null,
  pode_alterar: false,
  bloqueio: "Contratação de teste; edição validada no laboratório PostgreSQL separado.",
  responsavel: null,
  catalogo: [
    {
      codigo: "memorial",
      titulo: "Memorial de Cálculo",
      escopo: "local",
      normas: ["NR33"],
      blocos: [],
      obrigatorio: true,
      ordem: 1,
    },
  ],
  blocos: Array.from({ length: 16 }, (_, i) => `B${String(i + 1).padStart(2, "0")}`),
  historico: [],
});
export const nrContratacaoSalvar = unavailable;
export const nrUnidadeEquipe = async () => ({
  pode_gerir: false,
  data_referencia: "2026-11-05",
  pagina: 0,
  total: 0,
  vencidas: 0,
  vence_em_30_dias: 0,
  registros: [],
});
export const nrUnidadePessoaSalvar = unavailable;
export const petContextoUnidade = async () => ({
  local_id: null,
  espaco_id: null,
  pode_criar: false,
  pode_consultar: scenario !== "restricted",
  bloqueio: "Integração não configurada neste laboratório de apresentação.",
  locais: [],
  modelos: [],
  ordens: [],
  assinatura_configurada: false,
});
export const petFotosListar = async () => [];
export const petFotoRegistrar = unavailable;
export const petExportarUnidade = unavailable;
export const petFormularioBranco = unavailable;
