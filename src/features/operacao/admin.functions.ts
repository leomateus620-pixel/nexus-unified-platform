import { createServerFn } from "@tanstack/react-start";
import { z } from "zod";
import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";
import { operationalDb, result } from "./operacao.functions";

export const vinculoInput = z.object({
  organization_id: z.string().uuid(),
  chave: z.string().uuid(),
  comando: z.enum(["vincular", "papel", "coordenacao", "desligar"]),
  dados: z.object({
    user_id: z.string().uuid(),
    nome: z.string().trim().max(200).optional(),
    pessoa_id: z.string().uuid().nullable().optional(),
    role: z.enum(["admin", "comercial", "engenharia", "compras", "financeiro", "campo"]).optional(),
    habilitar: z.boolean().optional(),
    motivo: z.string().trim().max(2000).optional(),
  }),
});
export const administrarVinculo = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator(vinculoInput)
  .handler(async ({ context, data }) => {
    result(
      await operationalDb(context.supabase).rpc("administrar_vinculo_operacional", {
        _org: data.organization_id,
        _chave: data.chave,
        _comando: data.comando,
        _dados: data.dados,
      }),
    );
    return { user_id: data.dados.user_id, comando: data.comando };
  });

const membroRow = z.object({
  id: z.string().uuid(),
  user_id: z.string().uuid(),
  nome: z.string().nullable(),
  email: z.string().nullable(),
});
export const listarVinculos = createServerFn({ method: "GET" })
  .middleware([requireSupabaseAuth])
  .inputValidator(
    z.object({ organization_id: z.string().uuid(), pagina: z.number().int().min(0).default(0) }),
  )
  .handler(async ({ context, data }) => {
    const db = operationalDb(context.supabase);
    if (!result(await db.rpc("has_org_role", { _org: data.organization_id, _role: "admin" })))
      throw new Error("Apenas administradores consultam vínculos de acesso.");
    const m = await db
      .from("memberships")
      .select("id,user_id,nome,email", { count: "exact" })
      .eq("organization_id", data.organization_id)
      .order("nome")
      .order("id")
      .range(data.pagina * 25, data.pagina * 25 + 24);
    const membros = membroRow.array().parse(result(m) ?? []);
    if (!membros.length) return { rows: [], total: m.count ?? 0 };
    const ids = membros.map((x) => x.user_id);
    const [r, c] = await Promise.all([
      db
        .from("user_roles")
        .select("id,user_id,role")
        .eq("organization_id", data.organization_id)
        .in("user_id", ids),
      db
        .from("user_capacidades")
        .select("user_id,capacidade")
        .eq("organization_id", data.organization_id)
        .in("user_id", ids),
    ]);
    const roles = z
      .object({ id: z.string().uuid(), user_id: z.string().uuid(), role: z.string() })
      .array()
      .parse(result(r) ?? []);
    const caps = z
      .object({ user_id: z.string().uuid(), capacidade: z.string() })
      .array()
      .parse(result(c) ?? []);
    return {
      rows: membros.map((x) => ({
        ...x,
        roles: roles.filter((y) => y.user_id === x.user_id),
        coordenacao: caps.some(
          (y) => y.user_id === x.user_id && y.capacidade === "coordenar_operacao",
        ),
      })),
      total: m.count ?? 0,
    };
  });
