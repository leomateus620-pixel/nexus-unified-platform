import { defineTool } from "@lovable.dev/mcp-js";
import { z } from "zod";
import { moduleAccess } from "../access";
export default defineTool({
  name: "list_proposals", title: "Consultar propostas Nexus",
  description: "Lista até 30 cabeçalhos de propostas da organização, sem custos ou parâmetros de revisão.",
  inputSchema: { organization_id: z.string().uuid() },
  annotations: { readOnlyHint: true, idempotentHint: true, openWorldHint: false },
  handler: async ({ organization_id }, ctx) => {
    try {
      const db = await moduleAccess(ctx, organization_id, "/comercial");
      const { data, error } = await db.from("propostas").select("id,numero,titulo,created_at,projeto_id").eq("organization_id", organization_id).order("created_at", { ascending: false }).limit(30);
      if (error) throw new Error("Não foi possível consultar as propostas.");
      return { content: [{ type: "text", text: JSON.stringify(data ?? []) }] };
    } catch (e) { return { content: [{ type: "text", text: e instanceof Error ? e.message : "Consulta indisponível." }], isError: true }; }
  },
});