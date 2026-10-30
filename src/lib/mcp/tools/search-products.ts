import { defineTool } from "@lovable.dev/mcp-js";
import { z } from "zod";
import { moduleAccess } from "../access";
export default defineTool({
  name: "search_products", title: "Consultar produtos Nexus",
  description: "Busca até 30 produtos por nome ou código, sem expor custos, conforme o acesso ao catálogo.",
  inputSchema: { organization_id: z.string().uuid(), search: z.string().max(100).optional() },
  annotations: { readOnlyHint: true, idempotentHint: true, openWorldHint: false },
  handler: async ({ organization_id, search }, ctx) => {
    try {
      const db = await moduleAccess(ctx, organization_id, "/produtos");
      let query = db.from("produtos").select("id,codigo,descricao,unidade,modalidade,ativo").eq("organization_id", organization_id).order("codigo").limit(30);
      if (search) {
        // No PostgREST filter grammar is accepted from callers.
        const term = search.replace(/[%_*(),.\\]/g, " ").trim();
        if (term) query = query.or(`codigo.ilike.%${term}%,descricao.ilike.%${term}%`);
      }
      const { data, error } = await query;
      if (error) throw new Error("Não foi possível consultar os produtos.");
      return { content: [{ type: "text", text: JSON.stringify(data ?? []) }] };
    } catch (e) { return { content: [{ type: "text", text: e instanceof Error ? e.message : "Consulta indisponível." }], isError: true }; }
  },
});