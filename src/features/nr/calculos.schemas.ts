import { z } from "zod";
import {
  NR_CALCULO_VERSAO,
  calcularGeometriaNr,
  calcularVentilacaoNr,
  type Parametro,
} from "./domain";
import { normaSchema } from "./schemas";

const estado = z.enum(["nao_verificado", "informado", "proposto"]);
const parametro = <const T extends readonly [string, ...string[]]>(unidades: T, zero = false) =>
  z
    .object({
      valor: (zero ? z.number().finite().nonnegative() : z.number().finite().positive()).nullable(),
      unidade: z.enum(unidades),
      estado,
      fonte: z.string().trim().max(2000),
    })
    .strict();
export const nrComprimentoInput = parametro(["m", "cm", "mm"]);
export const nrVolumeInput = parametro(["m3", "L"]);
const radial = z
  .object({ tipo: z.enum(["diametro", "raio"]), medida: nrComprimentoInput })
  .strict();
const geometria = z.discriminatedUnion("tipo", [
  z.object({ tipo: z.literal("cilindro"), radial, altura: nrComprimentoInput }).strict(),
  z.object({ tipo: z.literal("cone"), radial, altura: nrComprimentoInput }).strict(),
  z
    .object({
      tipo: z.literal("paralelepipedo"),
      comprimento: nrComprimentoInput,
      largura: nrComprimentoInput,
      altura: nrComprimentoInput,
    })
    .strict(),
]);
export const nrCalculosEntradaSchema = z
  .object({
    geometria: z
      .object({
        modelo: geometria,
        deducoes: z
          .array(parametro(["m3", "L"], true))
          .max(50)
          .nullable(),
      })
      .strict()
      .nullable(),
    ventilacao: z
      .object({
        volume: z.discriminatedUnion("origem", [
          z.object({ origem: z.literal("geometria") }).strict(),
          z.object({ origem: z.literal("informado"), parametro: nrVolumeInput }).strict(),
        ]),
        vazao_nominal: parametro(["m3/h", "m3/s", "L/s"]),
        fator_efetividade: parametro(["fracao"]).refine(
          (p) => p.valor === null || p.valor <= 1,
          "O fator deve ser uma fração maior que zero e no máximo um.",
        ),
        duracao: parametro(["h", "min"], true),
      })
      .strict()
      .nullable(),
    notas: z.string().trim().max(4000),
  })
  .strict()
  .superRefine((entrada, context) => {
    if (!entrada.geometria && !entrada.ventilacao)
      context.addIssue({
        code: "custom",
        path: ["geometria"],
        message: "Selecione ao menos um cálculo.",
      });
    if (entrada.ventilacao?.volume.origem === "geometria" && !entrada.geometria)
      context.addIssue({
        code: "custom",
        path: ["ventilacao", "volume"],
        message: "Registre a geometria deste local ou informe o volume com sua fonte.",
      });
  });
export type NrCalculosEntrada = z.infer<typeof nrCalculosEntradaSchema>;
export type NrParametroInput = z.infer<typeof nrComprimentoInput> | z.infer<typeof nrVolumeInput>;
export const nrSalvarCalculosSchema = z
  .object({
    organization_id: z.string().uuid(),
    norma: normaSchema,
    local_id: z.string().uuid(),
    expected_version: z.number().int().positive(),
    chave: z.string().uuid(),
    entrada: nrCalculosEntradaSchema,
  })
  .strict();
export type NrSalvarCalculosInput = z.infer<typeof nrSalvarCalculosSchema>;

/** Orquestra os motores canônicos; nenhum resultado nem autor chega do formulário. */
export function calcularSnapshotNr(
  entrada: NrCalculosEntrada,
  autor: string,
  baseVersion: number,
  chave: string,
) {
  const assinar = <U extends string>(p: Omit<Parametro<U>, "autor">): Parametro<U> => ({
    ...p,
    autor,
  });
  let resultadoGeometria: ReturnType<typeof calcularGeometriaNr> | null = null;
  if (entrada.geometria) {
    const modelo = entrada.geometria.modelo;
    const modeloComAutor =
      modelo.tipo === "paralelepipedo"
        ? {
            ...modelo,
            comprimento: assinar(modelo.comprimento),
            largura: assinar(modelo.largura),
            altura: assinar(modelo.altura),
          }
        : {
            ...modelo,
            radial: { ...modelo.radial, medida: assinar(modelo.radial.medida) },
            altura: assinar(modelo.altura),
          };
    resultadoGeometria = calcularGeometriaNr(
      modeloComAutor,
      entrada.geometria.deducoes?.map(assinar) ?? null,
    );
  }
  let resultadoVentilacao: ReturnType<typeof calcularVentilacaoNr> | null = null;
  if (entrada.ventilacao) {
    const ventilacao = entrada.ventilacao;
    resultadoVentilacao = calcularVentilacaoNr({
      volume_liquido:
        ventilacao.volume.origem === "informado"
          ? assinar(ventilacao.volume.parametro)
          : {
              valor: resultadoGeometria?.volume_liquido_m3 ?? null,
              unidade: "m3",
              estado: resultadoGeometria?.estado === "proposto" ? "proposto" : "nao_verificado",
              fonte: `Geometria deste local, base v${baseVersion}; ${NR_CALCULO_VERSAO}`,
              autor,
            },
      vazao_nominal: assinar(ventilacao.vazao_nominal),
      fator_efetividade: assinar(ventilacao.fator_efetividade),
      duracao: assinar(ventilacao.duracao),
    });
  }
  return {
    schema_version: 1 as const,
    motor_versao: NR_CALCULO_VERSAO,
    base_version: baseVersion,
    chave,
    autor,
    entrada,
    geometria: resultadoGeometria,
    ventilacao: resultadoVentilacao,
    autoriza_entrada: false as const,
  };
}
export type NrCalculosSnapshot = ReturnType<typeof calcularSnapshotNr>;

const snapshotCabecalho = z.object({
  schema_version: z.literal(1),
  motor_versao: z.literal(NR_CALCULO_VERSAO),
  base_version: z.number().int().positive(),
  chave: z.string().uuid(),
  autor: z.string().uuid(),
  entrada: nrCalculosEntradaSchema,
  autoriza_entrada: z.literal(false),
});
/** Não reinterpreta outra versão do motor nem confia em resultados gravados em JSON livre. */
export function lerCalculosNr(value: unknown): NrCalculosSnapshot | null {
  const parsed = snapshotCabecalho.safeParse(value);
  return parsed.success
    ? calcularSnapshotNr(
        parsed.data.entrada,
        parsed.data.autor,
        parsed.data.base_version,
        parsed.data.chave,
      )
    : null;
}
