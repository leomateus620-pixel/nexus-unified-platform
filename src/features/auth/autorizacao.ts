/**
 * Matriz de autorização (fonte única no servidor; espelhada na função SQL public.pode()).
 * Admin tem todas as ações. Papéis de OUTROS membros nunca contam.
 */
export type Papel = "admin" | "comercial" | "engenharia" | "compras" | "financeiro" | "campo";

export const MATRIZ = {
  importar_catalogo: ["engenharia", "compras"],
  criar_proposta: ["comercial", "engenharia"],
  editar_revisao: ["comercial", "engenharia"],
  aprovar_tecnica: ["engenharia"],
  aceitar_comercial: ["comercial"],
  planejar_suprimentos: ["compras", "engenharia"],
  emitir_ordem: ["compras"],
  receber: ["compras"],
  produzir: ["compras", "engenharia", "campo"],
  ver_custos: ["comercial", "engenharia", "compras", "financeiro"],
} as const satisfies Record<string, readonly Papel[]>;
export type Acao = keyof typeof MATRIZ;

type RolesClient = {
  from: (t: "user_roles") => {
    select: (c: string) => {
      eq: (
        a: string,
        v: string,
      ) => {
        eq: (a: string, v: string) => PromiseLike<{ data: unknown; error: unknown }>;
      };
    };
  };
};

export function papelAutoriza(papeis: string[], acao: Acao) {
  const permitidos = MATRIZ[acao] as readonly string[];
  return papeis.some((p) => p === "admin" || permitidos.includes(p));
}

/** Lança "Acesso negado" se o usuário autenticado não puder executar a ação na organização. */
export async function exigirAcao(db: RolesClient, userId: string, org: string, acao: Acao) {
  if (!userId || !org) throw new Error("Acesso negado.");
  const { data, error } = await db
    .from("user_roles")
    .select("role")
    .eq("organization_id", org)
    .eq("user_id", userId);
  if (error || !Array.isArray(data)) throw new Error("Acesso negado.");
  const papeis = (data as { role: string }[]).map((r) => r.role);
  if (!papelAutoriza(papeis, acao)) throw new Error("Permissão insuficiente para esta ação.");
}
