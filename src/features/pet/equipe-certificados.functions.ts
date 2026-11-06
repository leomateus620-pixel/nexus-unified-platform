import { createServerFn } from "@tanstack/react-start";
import type { SupabaseClient } from "@supabase/supabase-js";
import { z } from "zod";
import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";
import { nrResult } from "@/features/nr/nr.functions";
import { candidatosSchema, evidenciaSchema, PET_FUNCOES_EQUIPE } from "./equipe-certificados";

const scope = z.object({
  organization_id: z.string().uuid(),
  cliente_id: z.string().uuid(),
  unidade_id: z.string().uuid(),
});

/** Candidates linked to the unit for one PET role, with the documentary state per person. */
export const petEquipeCandidatos = createServerFn({ method: "GET" })
  .middleware([requireSupabaseAuth])
  .inputValidator(scope.extend({ funcao: z.enum(PET_FUNCOES_EQUIPE) }).strict())
  .handler(async ({ context, data }) =>
    candidatosSchema.parse(
      nrResult(
        await (context.supabase as SupabaseClient).rpc("pet_equipe_candidatos", {
          p_org: data.organization_id,
          p_cliente: data.cliente_id,
          p_unidade: data.unidade_id,
          p_funcao: data.funcao,
        }),
      ),
    ),
  );

/**
 * Opens the exact training proof for person + role: the server re-checks unit scope and
 * that the attachment belongs to a qualification mapped to that role before signing a short URL.
 */
export const petEquipeTreinamento = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator(
    scope
      .extend({
        funcao: z.enum(PET_FUNCOES_EQUIPE),
        pessoa_id: z.string().uuid(),
        qualificacao_id: z.string().uuid().optional(),
      })
      .strict(),
  )
  .handler(async ({ context, data }) => {
    const db = context.supabase as SupabaseClient;
    const lista = z
      .array(evidenciaSchema.pick({ qualificacao_id: true, anexo_id: true, curso: true, emissor: true, conclusao: true, carga_horaria: true, estado: true, validade: true }))
      .parse(
        nrResult(
          await db.rpc("pet_equipe_evidencias", {
            p_org: data.organization_id,
            p_cliente: data.cliente_id,
            p_unidade: data.unidade_id,
            p_funcao: data.funcao,
            p_pessoa: data.pessoa_id,
          }),
        ),
      );
    const escolhida =
      lista.find((e) => e.qualificacao_id === data.qualificacao_id) ?? lista.find((e) => e.anexo_id) ?? lista[0];
    let url: string | null = null;
    let erro: string | null = null;
    if (escolhida?.anexo_id) {
      const a = await db
        .from("anexos")
        .select("caminho")
        .eq("organization_id", data.organization_id)
        .eq("id", escolhida.anexo_id)
        .eq("qualificacao_id", escolhida.qualificacao_id)
        .eq("estado", "vinculado")
        .maybeSingle();
      if (a.data?.caminho) {
        const s = await db.storage.from("nexus-operacional").createSignedUrl(a.data.caminho, 120);
        url = s.data?.signedUrl ?? null;
        if (!url) erro = "Comprovante indisponível no armazenamento.";
      } else erro = "Sem acesso ao comprovante.";
    }
    return { evidencias: lista, escolhida: escolhida?.qualificacao_id ?? null, url, erro };
  });
