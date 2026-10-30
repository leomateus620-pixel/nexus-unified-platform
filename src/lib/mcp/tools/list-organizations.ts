import { defineTool } from "@lovable.dev/mcp-js";
import { supabaseForUser } from "../supabase";
export default defineTool({
  name: "list_organizations", title: "Organizações disponíveis",
  description: "Lista até 50 organizações às quais o usuário autenticado pertence.",
  inputSchema: {}, annotations: { readOnlyHint: true, idempotentHint: true, openWorldHint: false },
  handler: async (_, ctx) => {
    const userId = ctx.getUserId();
    if (!userId) return { content: [{ type: "text", text: "Autenticação necessária." }], isError: true };
    const { data, error } = await supabaseForUser(ctx).from("memberships").select("organization_id").eq("user_id", userId).order("created_at").limit(50);
    if (error) return { content: [{ type: "text", text: "Não foi possível consultar suas organizações." }], isError: true };
    return { content: [{ type: "text", text: JSON.stringify(data ?? []) }] };
  },
});