import { z } from "zod";
import { normaSchema, nrJsonSchema, nrRowSchema } from "./schemas";
import type { Norma } from "./domain";

const BASE =
  "https://www.gov.br/trabalho-e-emprego/pt-br/acesso-a-informacao/participacao-social/conselhos-e-orgaos-colegiados/comissao-tripartite-partitaria-permanente/";
const PAGES = "normas-regulamentadora/normas-regulamentadoras-vigentes/";
export const nrOfficialSourcePages: Record<Norma, string> = {
  NR33: `${BASE}${PAGES}norma-regulamentadora-no-33-nr-33`,
  NR35: `${BASE}${PAGES}norma-regulamentadora-no-35-nr-35`,
};
export function nrOfficialSourceUrl(value: string, norma: Norma): boolean {
  try {
    const url = new URL(value);
    if (
      url.protocol !== "https:" ||
      url.hostname !== "www.gov.br" ||
      url.port ||
      url.username ||
      url.password ||
      url.search ||
      url.hash
    )
      return false;
    if (url.href === nrOfficialSourcePages[norma]) return true;
    const prefixes = [`${BASE}arquivos/normas-regulamentadoras/`, `${BASE}${PAGES}`];
    const number = norma === "NR33" ? "33" : "35";
    return prefixes.some(
      (prefix) =>
        url.href.startsWith(prefix) &&
        new RegExp(`^nr-?${number}[a-z0-9_.-]*\\.pdf$`, "i").test(url.href.slice(prefix.length)),
    );
  } catch {
    return false;
  }
}
const date = z
  .string()
  .regex(/^\d{4}-\d{2}-\d{2}$/, "Informe uma data válida.")
  .refine((value) => {
    const parsed = new Date(`${value}T00:00:00Z`);
    return !Number.isNaN(parsed.valueOf()) && parsed.toISOString().slice(0, 10) === value;
  }, "Informe uma data válida.");
const normas = z
  .array(normaSchema)
  .min(1)
  .max(2)
  .refine((value) => new Set(value).size === value.length, "Não repita a norma.");
const https = z
  .string()
  .url("Informe uma URL HTTPS válida.")
  .max(2000)
  .refine((value) => {
    try {
      const url = new URL(value);
      return (
        url.protocol === "https:" && !url.username && !url.password && !url.search && !url.hash
      );
    } catch {
      return false;
    }
  }, "Use uma URL HTTPS permanente, sem credenciais, parâmetros ou fragmentos.");
export const nrTechnicalSourceSchema = z
  .object({
    natureza: z.enum(["oficial", "licenciada"]),
    normas,
    titulo: z.string().trim().min(5, "Informe o título completo da fonte.").max(500),
    versao: z
      .string()
      .trim()
      .min(3, "Informe a versão ou redação efetivamente consultada.")
      .max(500),
    data_fonte: date,
    consultado_em: date,
    confronto: z
      .string()
      .trim()
      .min(20, "Explique a correspondência entre a fonte e esta regra ou critério.")
      .max(10000),
    url: https.optional(),
    arquivo_id: z.string().uuid("Selecione um arquivo privado confirmado.").optional(),
    licenca_referencia: z
      .string()
      .trim()
      .min(20, "Identifique a licença e o direito de uso da referência.")
      .max(4000)
      .optional(),
    licenca_confirmada: z
      .literal(true, {
        errorMap: () => ({ message: "Confirme o direito de uso da referência licenciada." }),
      })
      .optional(),
  })
  .strict()
  .superRefine((source, context) => {
    if (source.data_fonte > source.consultado_em)
      context.addIssue({
        code: z.ZodIssueCode.custom,
        path: ["consultado_em"],
        message: "A consulta deve ocorrer na data da fonte ou depois.",
      });
    if (source.natureza === "oficial") {
      if (!source.url || source.normas.some((norma) => !nrOfficialSourceUrl(source.url!, norma)))
        context.addIssue({
          code: z.ZodIssueCode.custom,
          path: ["url"],
          message: "Use a página oficial ou PDF permitido do MTE correspondente à norma declarada.",
        });
    } else {
      if (!source.arquivo_id)
        context.addIssue({
          code: z.ZodIssueCode.custom,
          path: ["arquivo_id"],
          message: "Vincule a referência licenciada realmente disponível no acervo privado.",
        });
      if (!source.licenca_referencia)
        context.addIssue({
          code: z.ZodIssueCode.custom,
          path: ["licenca_referencia"],
          message: "Descreva a licença e o direito de uso efetivo.",
        });
      if (source.licenca_confirmada !== true)
        context.addIssue({
          code: z.ZodIssueCode.custom,
          path: ["licenca_confirmada"],
          message: "Confirme o direito de uso da referência licenciada.",
        });
    }
  });
export const nrTechnicalEvidenceSchema = z
  .object({
    motivo: z.string().trim().min(10, "Explique o motivo desta publicação.").max(4000),
    escopo: z.string().trim().min(10, "Descreva onde esta versão pode ser aplicada.").max(10000),
    excecoes: z
      .string()
      .trim()
      .min(3, "Informe as exceções e os limites, inclusive quando não houver exceções.")
      .max(10000),
    confrontado_em: date,
    declaracao_revisao: z.literal(true, {
      errorMap: () => ({
        message: "Confirme a revisão técnica interna das fontes, do escopo e das exceções.",
      }),
    }),
    fontes: z
      .array(nrTechnicalSourceSchema)
      .min(1, "Adicione a fonte oficial de cada norma aplicável.")
      .max(20),
  })
  .strict()
  .superRefine((evidence, context) => {
    if (new TextEncoder().encode(JSON.stringify(evidence)).byteLength > 200000)
      context.addIssue({
        code: z.ZodIssueCode.custom,
        path: ["fontes"],
        message:
          "A declaração excede 200.000 bytes. Reduza o texto das evidências preservando as fontes e justificativas necessárias.",
      });
    if (evidence.confrontado_em > new Date().toISOString().slice(0, 10))
      context.addIssue({
        code: z.ZodIssueCode.custom,
        path: ["confrontado_em"],
        message: "A confrontação não pode estar no futuro.",
      });
    evidence.fontes.forEach((source, index) => {
      if (source.consultado_em > evidence.confrontado_em)
        context.addIssue({
          code: z.ZodIssueCode.custom,
          path: ["fontes", index, "consultado_em"],
          message: "A consulta deve ocorrer até a data da confrontação.",
        });
    });
  });
export const nrTechnicalContextInput = z
  .object({ organization_id: z.string().uuid(), norma: normaSchema, modelo_id: z.string().uuid() })
  .strict();
export const nrTechnicalPublicationInput = nrTechnicalContextInput
  .extend({
    expected_version: z.number().int().positive(),
    chave: z.string().uuid(),
    evidencia: nrTechnicalEvidenceSchema,
  })
  .strict()
  .superRefine((command, context) => {
    if (
      !command.evidencia.fontes.some(
        (source) => source.natureza === "oficial" && source.normas.includes(command.norma),
      )
    )
      context.addIssue({
        code: z.ZodIssueCode.custom,
        path: ["evidencia", "fontes"],
        message:
          "Inclua uma fonte oficial da norma atual. O servidor também exige fonte para todas as normas do modelo.",
      });
  });
export const nrTechnicalContextOutput = z.object({
  profissional: z
    .object({ id: z.string().uuid(), nome: z.string(), registro_profissional: z.string() })
    .nullable(),
  pode_publicar: z.boolean(),
  bloqueio: z.string().nullable(),
  versoes: z.array(nrJsonSchema),
  fontes: z.array(nrJsonSchema),
});
export const nrTechnicalPublicationOutput = z.object({ registro: nrRowSchema });
export type NrTechnicalSource = z.infer<typeof nrTechnicalSourceSchema>;
