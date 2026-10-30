import { createServerFn } from "@tanstack/react-start";
import { z } from "zod";
import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";
const input = z
  .object({
    organization_id: z.string().uuid(),
    norma: z.enum(["NR33", "NR35"]),
    documento_id: z.string().uuid(),
    expected_version: z.number().int().positive(),
  })
  .strict();
export const nrDocumentoExportar = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator(input.extend({ formato: z.enum(["pdf", "docx"]) }).strict())
  .handler(async ({ context, data }) => {
    const { exportarDocumentoNr } = await import("./documents.server");
    return exportarDocumentoNr(context.supabase, data);
  });
export const nrDocumentoConverterDocx = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator(
    input.extend({ arquivo_id: z.string().uuid(), chave: z.string().uuid() }).strict(),
  )
  .handler(async ({ context, data }) => {
    const { converterDocumentoNr } = await import("./documents.server");
    return converterDocumentoNr(context.supabase, context.userId, data);
  });
