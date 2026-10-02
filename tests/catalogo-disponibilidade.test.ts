import { describe, expect, it, vi } from "vitest";

// Run the real handler and validator, replacing only transport/auth infrastructure.
vi.mock("@tanstack/react-start", () => ({
  createServerFn: () => {
    let validate = (data: unknown) => data;
    const builder = {
      middleware: () => builder,
      inputValidator: (fn: typeof validate) => {
        validate = fn;
        return builder;
      },
      handler: (fn: (input: unknown) => unknown) => (input: { data: unknown; context: unknown }) =>
        fn({ ...input, data: validate(input.data) }),
    };
    return builder;
  },
}));
vi.mock("../src/integrations/supabase/auth-middleware", () => ({ requireSupabaseAuth: {} }));

import { adicionarComponenteRevisao } from "../src/features/catalogo/catalogo.functions";

const product = "b6e2c0a2-4c41-4de7-9827-c45daefc7e54";
const revision = "024c58b0-111f-48dc-9791-c28b71a97834";
function dbFixture(existing: object | null = null) {
  const writes: Record<string, unknown>[] = [];
  const rows: Record<string, unknown> = {
    memberships: { organization_id: "org-test" },
    produtos: {
      id: product,
      codigo: "COM-NXS-P007",
      descricao: "Peça para teste",
      unidade: "un",
      modalidade: "comprar",
      fabricantes: null,
    },
    produto_custos: { id: "zero-reference", custo: 0 },
    revisao_componentes: existing,
  };
  return {
    writes,
    db: {
      from: (table: string) => {
        let inserted: Record<string, unknown> | undefined;
        const builder = new Proxy(
          {},
          {
            get: (_, key) => {
              if (key === "then")
                return (resolve: (value: unknown) => void) =>
                  resolve({ data: inserted ? { id: "added" } : rows[table], error: null });
              return (...args: unknown[]) => {
                if (key === "insert") {
                  inserted = args[0] as Record<string, unknown>;
                  writes.push(inserted);
                }
                return builder;
              };
            },
          },
        );
        return builder;
      },
    },
  };
}
const run = adicionarComponenteRevisao as unknown as (input: {
  data: { revisao_id: string; produto_id: string };
  context: object;
}) => Promise<unknown>;
describe("Somente disponibilizar nesta revisão", () => {
  it("stores the product outside the budget and preserves a recorded zero cost and official code", async () => {
    const fixture = dbFixture();
    await run({
      data: { revisao_id: revision, produto_id: product },
      context: { supabase: fixture.db, userId: "user-test" },
    });
    expect(fixture.writes).toHaveLength(1);
    expect(fixture.writes[0]).toMatchObject({
      incluido_orcamento: false,
      codigo: "COM-NXS-P007",
      custo_adotado: 0,
      custo_origem_id: "zero-reference",
      revisao_id: revision,
      produto_id: product,
    });
    expect(fixture.writes[0]).not.toHaveProperty("quantidade_avulsa");
  });
  it("does not overwrite inclusion or manual quantity when the product is already present", async () => {
    const fixture = dbFixture({ id: "existing", incluido_orcamento: true, quantidade_avulsa: 3 });
    const result = await run({
      data: { revisao_id: revision, produto_id: product },
      context: { supabase: fixture.db, userId: "user-test" },
    });
    expect(result).toEqual({ id: "existing", repetido: true });
    expect(fixture.writes).toHaveLength(0);
  });
});
