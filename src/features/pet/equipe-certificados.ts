import { z } from "zod";

export const PET_FUNCOES_EQUIPE = [
  "supervisor",
  "vigia",
  "trabalhador",
  "resgate",
  "substituto_vigia",
] as const;
export type PetFuncaoEquipe = (typeof PET_FUNCOES_EQUIPE)[number];

export const situacaoCertificado = z.enum([
  "vinculado",
  "em_conferencia",
  "vencido",
  "incompleto",
  "ausente",
]);
export type SituacaoCertificado = z.infer<typeof situacaoCertificado>;

export const evidenciaSchema = z.object({
  qualificacao_id: z.string().uuid(),
  anexo_id: z.string().uuid().nullable(),
  curso: z.string(),
  emissor: z.string(),
  conclusao: z.string(),
  carga_horaria: z.number().nullable(),
  tipo_treinamento: z.string().nullable(),
  estado: z.string(),
  validade: z.string().nullable(),
  validade_origem: z.enum(["explicita", "calculada", "nao_informada"]),
  regra: z.string(),
});
export type Evidencia = z.infer<typeof evidenciaSchema>;

export const candidatosSchema = z.object({
  funcao: z.enum(PET_FUNCOES_EQUIPE),
  data_referencia: z.string(),
  regra_versao: z.number().nullable(),
  candidatos: z.array(
    z.object({
      pessoa_id: z.string().uuid(),
      nome: z.string(),
      funcao_unidade: z.string(),
      situacao: situacaoCertificado,
      total_evidencias: z.number(),
      evidencia: evidenciaSchema.nullable(),
    }),
  ),
});
export type Candidatos = z.infer<typeof candidatosSchema>;

/** Label shown next to the person. Colour is never the only signal. */
export function rotuloCertificado(s: SituacaoCertificado | "verificando" | "indisponivel" | "sem_acesso") {
  return {
    vinculado: { icone: "✅", texto: "Certificado vinculado", tom: "ok" },
    em_conferencia: { icone: "✅", texto: "Certificado vinculado · em conferência", tom: "atencao" },
    vencido: { icone: "⚠️", texto: "Certificado vencido", tom: "atencao" },
    incompleto: { icone: "⚠️", texto: "Informação incompleta", tom: "atencao" },
    ausente: { icone: "❌", texto: "Sem certificado desta função", tom: "erro" },
    verificando: { icone: "…", texto: "Verificando certificado", tom: "neutro" },
    indisponivel: { icone: "⚠️", texto: "Consulta indisponível", tom: "neutro" },
    sem_acesso: { icone: "🔒", texto: "Sem acesso ao comprovante", tom: "neutro" },
  }[s];
}

/** Query key always includes person + role, so a late answer can never land on another row. */
export const certificadoKey = (
  scope: { organization_id: string; cliente_id: string; unidade_id: string },
  funcao: string,
) => ["pet", "equipe-candidatos", scope.organization_id, scope.cliente_id, scope.unidade_id, funcao] as const;
