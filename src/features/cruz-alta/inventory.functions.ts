import { createServerFn } from "@tanstack/react-start";
import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";
import { nrResult } from "@/features/nr/nr.functions";
import type { SupabaseClient } from "@supabase/supabase-js";
import { z } from "zod";

const row = z.object({
  sourceId: z.string().min(1).max(500),
  sha256: z
    .string()
    .regex(/^[0-9a-f]{64}$/)
    .nullable(),
  size: z.number().int().nonnegative(),
  mime: z.string().max(200),
  originalName: z.string().min(1).max(500),
  folder: z.string().max(1000),
  documentKey: z.string().min(1).max(500),
  title: z.string().min(1).max(500),
  revision: z.union([z.string(), z.number()]).nullable(),
  date: z.string().date().nullable(),
  pages: z.number().int().positive().nullable(),
  page: z.number().int().positive().nullable(),
  scope: z.enum(["unidade", "individual", "conjunto", "evidencia", "historico"]),
  objectKeys: z.array(z.string().min(1).max(160)).max(250),
  status: z.enum(["conferido", "pendente"]),
  note: z.string().max(6000),
});
export type InventoryRow = z.infer<typeof row>;
const rows = z.array(row).max(2000);
const org = z.object({ organization_id: z.string().uuid() });
export const caInventory = createServerFn({ method: "GET" })
  .middleware([requireSupabaseAuth])
  .inputValidator(org)
  .handler(async ({ context, data }) =>
    rows.parse(
      nrResult(
        await (context.supabase as SupabaseClient).rpc("ca_inventario", {
          p_org: data.organization_id,
        }),
      ),
    ),
  );
export const caImportInventory = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator(
    org.extend({
      json: z
        .string()
        .min(2)
        .max(2 * 1024 * 1024),
    }),
  )
  .handler(async ({ context, data }) => {
    const fontes: unknown = JSON.parse(data.json);
    const verified = rows.min(1).parse(fontes);
    const ids = new Set(verified.map((r) => r.sourceId));
    if (
      ids.size !== verified.length ||
      new TextEncoder().encode(data.json).length > 2 * 1024 * 1024
    )
      throw new Error("O inventário contém IDs repetidos ou excede 2 MiB.");
    return z
      .object({ id: z.string().uuid(), sha256: z.string(), quantidade: z.number() })
      .parse(
        nrResult(
          await (context.supabase as SupabaseClient).rpc("ca_conciliar_inventario", {
            p_org: data.organization_id,
            p_fontes: verified,
          }),
        ),
      );
  });
