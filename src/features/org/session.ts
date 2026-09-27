import { useQuery } from "@tanstack/react-query";
import { useEffect, useState } from "react";
import type { User } from "@supabase/supabase-js";

import { supabase } from "@/integrations/supabase/client";

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
  orgId: string;
  orgNome: string;
  roles: string[];
  canSeeCosts: boolean;
  isAdmin: boolean;
};

export const orgQueryKey = ["org"] as const;

export function useOrg() {
  return useQuery({
    queryKey: orgQueryKey,
    queryFn: async (): Promise<OrgContext | null> => {
      const { data: u } = await supabase.auth.getUser();
      if (!u.user) return null;
      const { data, error } = await supabase
        .from("memberships")
        .select("organization_id, organizations(nome)")
        .eq("user_id", u.user.id)
        .limit(1)
        .maybeSingle();
      if (error) throw error;
      if (!data) return null;
      const { data: roles, error: e2 } = await supabase
        .from("user_roles")
        .select("role")
        .eq("organization_id", data.organization_id)
        .eq("user_id", u.user.id);
      if (e2) throw e2;
      const r = (roles ?? []).map((x) => x.role as string);
      const org = data.organizations as unknown as { nome: string } | null;
      return {
        orgId: data.organization_id,
        orgNome: org?.nome ?? "",
        roles: r,
        isAdmin: r.includes("admin"),
        canSeeCosts: r.some((x) => x !== "campo"),
      };
    },
    staleTime: 60_000,
  });
}

/** Retorna o orgId já resolvido (páginas sob o gate só renderizam com organização). */
export function useOrgId() {
  const { data } = useOrg();
  return data?.orgId ?? "";
}
