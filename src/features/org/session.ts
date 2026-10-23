import { useQuery, useQueryClient, type QueryClient } from "@tanstack/react-query";
import { useEffect, useState } from "react";
import type { SupabaseClient, User } from "@supabase/supabase-js";

import { supabase } from "@/integrations/supabase/client";
import { papelAutoriza } from "@/features/auth/autorizacao";

export function useSessionUser() {
  const [user, setUser] = useState<User | null | undefined>(undefined);
  useEffect(() => {
    supabase.auth.getUser().then(({ data }) => setUser(data.user ?? null));
    const { data } = supabase.auth.onAuthStateChange((_e, s) => setUser(s?.user ?? null));
    return () => data.subscription.unsubscribe();
  }, []);
  return user;
}

export type OrgContext = {
  userId: string;
  orgId: string;
  orgNome: string;
  roles: string[];
  capabilities?: string[];
  canSeeCosts: boolean;
  isAdmin: boolean;
};

export const orgQueryKey = ["org"] as const;

/** Retira respostas e requests em andamento do contexto anterior antes de expor o novo acesso. */
export async function reconcileAccessCache(client: QueryClient, next: OrgContext | null) {
  const previous = client.getQueryData<OrgContext | null>(orgQueryKey);
  if (!previous) return;
  const sameRoles =
    next && [...previous.roles].sort().join(",") === [...next.roles].sort().join(",");
  const sameCapabilities =
    next &&
    [...(previous.capabilities ?? [])].sort().join(",") ===
      [...(next.capabilities ?? [])].sort().join(",");
  if (
    next &&
    previous.orgId === next.orgId &&
    previous.userId === next.userId &&
    sameRoles &&
    sameCapabilities
  )
    return;
  const sensitive = {
    predicate: (query: { queryKey: readonly unknown[] }) => query.queryKey[0] !== "org",
  };
  await client.cancelQueries(sensitive);
  client.removeQueries(sensitive);
}

export function useOrg() {
  const qc = useQueryClient();
  return useQuery({
    queryKey: orgQueryKey,
    queryFn: async ({ signal }): Promise<OrgContext | null> => {
      try {
        const { data: u, error: authError } = await supabase.auth.getUser();
        if (authError) throw authError;
        if (!u.user) {
          await reconcileAccessCache(qc, null);
          return null;
        }
        const { data, error } = await supabase
          .from("memberships")
          .select("organization_id, organizations(nome)")
          .eq("user_id", u.user.id)
          .order("created_at")
          .order("id")
          .limit(1)
          .abortSignal(signal)
          .maybeSingle();
        if (error) throw error;
        if (!data) {
          await reconcileAccessCache(qc, null);
          return null;
        }
        const { data: roles, error: e2 } = await supabase
          .from("user_roles")
          .select("role")
          .eq("organization_id", data.organization_id)
          .eq("user_id", u.user.id)
          .abortSignal(signal);
        if (e2) throw e2;
        const { data: capabilities, error: e3 } = await (supabase as unknown as SupabaseClient)
          .from("user_capacidades")
          .select("capacidade")
          .eq("organization_id", data.organization_id)
          .eq("user_id", u.user.id)
          .abortSignal(signal);
        if (e3) throw e3;
        const r = (roles ?? []).map((x) => x.role as string);
        const org = data.organizations as unknown as { nome: string } | null;
        const next: OrgContext = {
          userId: u.user.id,
          orgId: data.organization_id,
          orgNome: org?.nome ?? "",
          roles: r,
          capabilities: (capabilities ?? []).map((x: { capacidade: string }) => x.capacidade),
          isAdmin: r.includes("admin"),
          canSeeCosts: papelAutoriza(r, "ver_custos"),
        };
        await reconcileAccessCache(qc, next);
        return next;
      } catch (error) {
        if (!signal.aborted) await reconcileAccessCache(qc, null);
        throw error;
      }
    },
    staleTime: 30_000,
    refetchInterval: 30_000,
    refetchOnWindowFocus: "always",
    retry: false,
  });
}

/** Retorna o orgId já resolvido (páginas sob o gate só renderizam com organização). */
export function useOrgId() {
  const { data } = useOrg();
  return data?.orgId ?? "";
}
