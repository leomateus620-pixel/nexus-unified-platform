import { describe, expect, it } from "vitest";

import { exigirAcao, papelAutoriza } from "../src/features/auth/autorizacao";

// Banco simulado que respeita os filtros: retorna só as linhas que casam com TODOS os .eq().
function fakeDb(rows: { organization_id: string; user_id: string; role: string }[], erro = false) {
  return {
    from: () => ({
      select: () => ({
        eq: (a: string, v: string) => ({
          eq: async (b: string, w: string) =>
            erro
              ? { data: null, error: { message: "falha" } }
              : {
                  data: rows.filter((r) => (r as never)[a] === v && (r as never)[b] === w),
                  error: null,
                },
        }),
      }),
    }),
  };
}

const ORG = "org-1";
const rows = [
  { organization_id: ORG, user_id: "admin", role: "admin" },
  { organization_id: ORG, user_id: "campo", role: "campo" },
  { organization_id: ORG, user_id: "comercial", role: "comercial" },
  { organization_id: "org-2", user_id: "outro", role: "admin" },
];

describe("S02 — autorização considera só o usuário atual", () => {
  it("admin da empresa NÃO amplia o acesso de campo", async () => {
    await expect(exigirAcao(fakeDb(rows), "campo", ORG, "emitir_ordem")).rejects.toThrow();
    await expect(exigirAcao(fakeDb(rows), "campo", ORG, "criar_proposta")).rejects.toThrow();
  });
  it("comercial não emite OC nem aprova tecnicamente", async () => {
    await expect(exigirAcao(fakeDb(rows), "comercial", ORG, "emitir_ordem")).rejects.toThrow();
    await expect(exigirAcao(fakeDb(rows), "comercial", ORG, "aprovar_tecnica")).rejects.toThrow();
    await expect(exigirAcao(fakeDb(rows), "comercial", ORG, "criar_proposta")).resolves.toBeUndefined();
  });
  it("admin de outra organização não tem acesso (S03)", async () => {
    await expect(exigirAcao(fakeDb(rows), "outro", ORG, "criar_proposta")).rejects.toThrow();
  });
  it("erro de consulta nega acesso", async () => {
    await expect(exigirAcao(fakeDb(rows, true), "admin", ORG, "criar_proposta")).rejects.toThrow(
      "Acesso negado",
    );
  });
  it("matriz: campo só produz; ver custos exclui campo", () => {
    expect(papelAutoriza(["campo"], "produzir")).toBe(true);
    expect(papelAutoriza(["campo"], "ver_custos")).toBe(false);
    expect(papelAutoriza(["financeiro"], "ver_custos")).toBe(true);
  });
});
