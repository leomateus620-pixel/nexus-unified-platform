import type { ToolContext } from "@lovable.dev/mcp-js";
import { podeVerRota } from "@/lib/nexus-nav";
import { supabaseForUser } from "./supabase";

export async function moduleAccess(ctx: ToolContext, organizationId: string, route: string) {
  const userId = ctx.getUserId();
  if (!ctx.isAuthenticated() || !userId) throw new Error("Autenticação necessária.");
  const db = supabaseForUser(ctx);
  const [membership, roles] = await Promise.all([
    db.from("memberships").select("id").eq("user_id", userId).eq("organization_id", organizationId).maybeSingle(),
    db.from("user_roles").select("role").eq("user_id", userId).eq("organization_id", organizationId),
  ]);
  if (membership.error || roles.error || !membership.data || !podeVerRota((roles.data ?? []).map(r => r.role), route)) {
    throw new Error("Sem acesso a este módulo nesta organização.");
  }
  return db;
}