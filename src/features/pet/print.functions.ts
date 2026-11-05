import { createServerFn } from "@tanstack/react-start";
import type { SupabaseClient } from "@supabase/supabase-js";
import { z } from "zod";
import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";
import { unitScopeSchema } from "@/features/nr/mapa/schemas";
import { nrResult } from "@/features/nr/nr.functions";
import { petUnitResult } from "./unidade.functions";
export const petFormularioBranco = createServerFn({ method: "GET" })
  .middleware([requireSupabaseAuth])
  .inputValidator(
    unitScopeSchema.extend({
      modelo_id: z.string().uuid(),
      vias: z.union([z.literal(1), z.literal(2)]),
    }),
  )
  .handler(async ({ context, data }) => {
    const db = context.supabase as SupabaseClient;
    const check = async () =>
      petUnitResult.parse(
        nrResult(
          await db.rpc("pet_contexto_unidade", {
            p_org: data.organization_id,
            p_cliente: data.cliente_id,
            p_unidade: data.unidade_id,
            p_norma: data.norma,
          }),
        ),
      );
    const unit = await check();
    if (!unit.pode_consultar || !unit.modelos.some((m) => m.id === data.modelo_id))
      throw new Error("Modelo aprovado indisponível neste contexto.");
    const contract = nrResult(
      await db.rpc("nr_contratacao_obter", {
        p_org: data.organization_id,
        p_cliente: data.cliente_id,
        p_unidade: data.unidade_id,
        p_norma: data.norma,
      }),
    ) as { confirmada: boolean; documentos: string[] };
    if (!contract.confirmada || !contract.documentos.includes("pet"))
      throw new Error("Confirme a contratação da PET com o responsável técnico.");
    const options = nrResult(await db.rpc("pet_opcoes", { p_org: data.organization_id })) as {
      modelos: {
        id: string;
        nome: string;
        versao: number;
        estado: string;
        procedimento: unknown;
      }[];
    };
    const model = options.modelos.find((m) => m.id === data.modelo_id && m.estado === "aprovado");
    const { petPrintProcedure, petBlankPdf } = await import("./print");
    if (!model || !petPrintProcedure.safeParse(model.procedimento).success)
      throw new Error(
        "Layout de impressão ainda não aprovado nesta versão. O RT deve conferir o layout nexus-v2-3p, as linhas da equipe e os critérios antes da publicação do modelo.",
      );
    const bytes = await petBlankPdf(model, data.vias);
    const current = await check();
    if (!current.pode_consultar || !current.modelos.some((m) => m.id === data.modelo_id))
      throw new Error("Acesso ao modelo alterado.");
    return { base64: Buffer.from(bytes).toString("base64"), nome: "PET-formulario-em-branco.pdf" };
  });
